from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
SERVICE_ACCOUNT_PATH = PROJECT_ROOT / "serviceAccountKey.json"
BATCH_SIZE = 100

STOP_WORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
}

CATEGORY_RULES = {
    "furniture": {"furniture", "chair", "table"},
    "ceramics": {"ceramic", "porcelain", "pottery", "vase"},
    "art": {"painting", "art", "print", "canvas"},
    "jewelry": {"jewelry", "ring", "necklace", "bracelet"},
}


def log(message: str) -> None:
    print(f"[load_to_firebase] {message}")


def load_dotenv_file() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)

    text = clean_text(value)
    if not text:
        return None

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        pass

    for fmt in (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%b %d %Y",
        "%B %d %Y",
    ):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


def parse_price(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = clean_text(value)
    if not text:
        return None

    match = re.search(r"(?:US\s*)?(?:\$|£|€|EUR)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", text, re.IGNORECASE)
    if not match:
        match = re.search(r"([0-9][0-9,]*(?:\.\d{1,2})?)", text)
    if not match:
        return None

    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def load_json_files() -> list[dict[str, Any]]:
    if not RAW_DATA_DIR.exists():
        log(f"Raw data directory not found: {RAW_DATA_DIR}")
        return []

    items: list[dict[str, Any]] = []
    files = sorted(RAW_DATA_DIR.glob("*.json"))
    log(f"Found {len(files)} raw JSON files in {RAW_DATA_DIR}")

    for file_path in files:
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            log(f"Failed to read {file_path.name}: {exc}")
            continue

        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
            records = payload["items"]
        elif isinstance(payload, dict):
            records = [payload]
        else:
            log(f"Skipping unsupported JSON payload in {file_path.name}")
            continue

        valid_records = 0
        for record in records:
            if not isinstance(record, dict):
                continue
            record["_sourceFile"] = file_path.name
            items.append(record)
            valid_records += 1

        log(f"Loaded {valid_records} items from {file_path.name}")

    return items


def extract_keywords(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", text.lower())
    keywords: list[str] = []
    seen: set[str] = set()

    for token in tokens:
        if len(token) <= 2 or token in STOP_WORDS:
            continue
        if token in seen:
            continue
        seen.add(token)
        keywords.append(token)

    return keywords


def detect_category(title: str) -> str:
    normalized_title = title.lower()

    for category, keywords in CATEGORY_RULES.items():
        if any(keyword in normalized_title for keyword in keywords):
            return category

    return "general"


def generate_doc_id(source: str, title: str) -> str:
    digest = hashlib.sha1(f"{source.lower()}::{title.lower()}".encode("utf-8")).hexdigest()
    return digest


def prepare_document(item: dict[str, Any]) -> dict[str, Any]:
    title = clean_text(item.get("title"))
    if not title:
        raise ValueError("missing title")

    source = clean_text(item.get("source"))
    if not source:
        raise ValueError("missing source")

    description = clean_text(item.get("description"))
    auction_house = clean_text(item.get("auctionHouse"))
    sale_date = parse_datetime(item.get("saleDate") or item.get("date"))
    created_at = parse_datetime(item.get("scrapedAt")) or now_utc()
    updated_at = now_utc()

    keywords = extract_keywords(" ".join(part for part in [title, description] if part))

    return {
        "title": title,
        "description": description,
        "priceRealized": parse_price(item.get("priceRealized") or item.get("price")),
        "auctionHouse": auction_house,
        "saleDate": sale_date,
        "category": detect_category(title),
        "imageUrl": clean_text(item.get("imageUrl")) or None,
        "source": source,
        "keywords": keywords,
        "createdAt": created_at,
        "updatedAt": updated_at,
    }


def initialize_firestore() -> firestore.Client:
    load_dotenv_file()

    project_id = clean_text(os.getenv("FIREBASE_PROJECT_ID"))
    if not project_id:
        raise RuntimeError("FIREBASE_PROJECT_ID is not set")

    if not SERVICE_ACCOUNT_PATH.exists():
        raise RuntimeError(f"Service account key not found at {SERVICE_ACCOUNT_PATH}")

    try:
        firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
        firebase_admin.initialize_app(cred, {"projectId": project_id})

    return firestore.client()


def commit_batch(batch: firestore.WriteBatch, operations: int) -> int:
    if operations == 0:
        return 0
    batch.commit()
    return operations


def run() -> int:
    started_at = time.perf_counter()
    errors = 0
    loaded = 0
    processed = 0

    try:
        db = initialize_firestore()
    except Exception as exc:  # noqa: BLE001
        log(f"Initialization failed: {exc}")
        return 1

    items = load_json_files()
    if not items:
        log("No raw items found to load")
        return 0

    collection = db.collection("antique_auctions")
    batch = db.batch()
    operations = 0

    for item in items:
        processed += 1

        try:
            document = prepare_document(item)
            doc_id = generate_doc_id(document["source"], document["title"])
            doc_ref = collection.document(doc_id)
            batch.set(doc_ref, document, merge=True)
            operations += 1
        except Exception as exc:  # noqa: BLE001
            errors += 1
            source_file = item.get("_sourceFile", "unknown")
            title = clean_text(item.get("title")) or "<missing title>"
            log(f"Skipping invalid item from {source_file}: {title} ({exc})")
            continue

        if operations >= BATCH_SIZE:
            loaded += commit_batch(batch, operations)
            batch = db.batch()
            operations = 0
            log(f"Committed batch. Processed={processed} Loaded={loaded} Errors={errors}")

        if processed % 100 == 0:
            log(f"Progress: processed {processed} items")

    loaded += commit_batch(batch, operations)

    duration_seconds = time.perf_counter() - started_at
    log(
        "Summary: "
        f"processed={processed}, loaded={loaded}, errors={errors}, "
        f"duration={duration_seconds:.2f}s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(run())
