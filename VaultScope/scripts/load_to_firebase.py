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
    "from",
    "into",
    "over",
    "under",
}

GENERIC_NOISE = {
    "vintage",
    "antique",
    "old",
    "nice",
    "rare",
    "collectible",
    "collectibles",
    "item",
    "items",
    "piece",
    "pieces",
    "estate",
    "beautiful",
    "wonderful",
}

SHORT_IDENTIFIERS = {
    "1c",
    "2c",
    "3c",
    "5c",
    "10c",
    "20c",
    "25c",
    "50c",
    "cc",
    "lp",
    "ep",
    "45",
    "78",
    "nm",
    "vg",
    "xf",
    "au",
    "ms",
    "pr",
    "pf",
    "blp",
    "cl",
    "cs",
}

COIN_MINT_MARKS = {"s", "d", "p", "o", "cc"}
COIN_DENOMINATION_TERMS = {
    "cent",
    "nickel",
    "dime",
    "quarter",
    "half",
    "dollar",
    "eagle",
    "sovereign",
    "krugerrand",
    "maple",
}
COIN_VARIETY_TERMS = {"vdb", "ddo", "ddr", "proof", "cameo", "dmpl", "pl"}
METAL_TERMS = {"silver", "gold", "platinum", "palladium", "copper", "bronze", "nickel"}

CATEGORY_RULES = {
    "coin": {"coin", "cent", "dollar", "quarter", "dime", "nickel", "eagle", "sovereign"},
    "vinyl": {"vinyl", "record", "lp", "45", "album", "blue note", "columbia"},
    "furniture": {"furniture", "chair", "table"},
    "ceramics": {"ceramic", "porcelain", "pottery", "vase"},
    "art": {"painting", "art", "print", "canvas"},
    "jewelry": {"jewelry", "ring", "necklace", "bracelet"},
}


def log(message: str) -> None:
    print(f"[load_to_firebase] {message}")


def load_dotenv_file() -> None:
    for env_name in (".env.local", ".env"):
        env_path = PROJECT_ROOT / env_name
        if not env_path.exists():
            continue

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


def is_useful_keyword(token: str) -> bool:
    if not token or token in STOP_WORDS or token in GENERIC_NOISE:
        return False
    if re.fullmatch(r"\d{4}", token) or re.fullmatch(r"\d{4}s", token):
        return True
    if token in SHORT_IDENTIFIERS or token in COIN_MINT_MARKS:
        return True
    if re.fullmatch(r"[a-z]{1,4}\d{2,}[a-z]*", token) or re.fullmatch(r"\d+[a-z]{1,4}", token):
        return True
    return len(token) >= 3


def tokenize_keywords(text: str) -> list[str]:
    normalized = text.lower().replace("’", "").replace("'", "")
    return [token for token in re.split(r"[^a-z0-9]+", normalized) if is_useful_keyword(token)]


def add_unique_keywords(target: list[str], values: list[str]) -> None:
    for value in values:
        if value not in target:
            target.append(value)


def extract_coin_terms(text: str) -> list[str]:
    raw_tokens = tokenize_keywords(text)
    mint_marks = list(dict.fromkeys(re.findall(r"\b(?:cc|s|d|p|o)\b", text.lower())))
    denominations = [
        token for token in raw_tokens if token in COIN_DENOMINATION_TERMS or re.fullmatch(r"\d{1,2}c", token)
    ]
    varieties = [
        token
        for token in raw_tokens
        if token in COIN_VARIETY_TERMS or re.fullmatch(r"(?:ms|pr|pf|vf|xf|au)\d{2}", token)
    ]
    metals = [token for token in raw_tokens if token in METAL_TERMS]
    return list(dict.fromkeys([*mint_marks, *denominations, *varieties, *metals]))


def extract_vinyl_terms(title: str, description: str, raw_keywords: list[str]) -> list[str]:
    keywords: list[str] = []
    combined = f"{title} {description}"
    catno_matches = re.findall(r"\b[A-Z]{1,5}[ -]?\d{2,6}[A-Z]?\b", combined, re.IGNORECASE)
    for match in catno_matches:
        add_unique_keywords(
            keywords,
            [part for part in re.split(r"[\s-]+", match.lower()) if len(part) > 1],
        )

    for year in re.findall(r"\b(?:19|20)\d{2}\b", combined):
        add_unique_keywords(keywords, [year, f"{year[:3]}0s"])

    add_unique_keywords(keywords, tokenize_keywords(" ".join([title, description, *raw_keywords])))
    return keywords


def build_auction_keywords(item: dict[str, Any], title: str, description: str, category: str) -> list[str]:
    raw_keywords = [
        keyword.strip().lower()
        for keyword in item.get("keywords", [])
        if isinstance(keyword, str) and keyword.strip()
    ]
    keywords: list[str] = []
    add_unique_keywords(keywords, tokenize_keywords(title))

    combined = f"{title} {description}"
    if category == "coin":
        add_unique_keywords(keywords, extract_coin_terms(combined))
    elif category == "vinyl":
        add_unique_keywords(keywords, extract_vinyl_terms(title, description, raw_keywords))
    else:
        add_unique_keywords(keywords, tokenize_keywords(description))

    add_unique_keywords(keywords, raw_keywords)
    return list(dict.fromkeys(keywords))[:25]


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

    category = detect_category(" ".join(part for part in [title, description] if part))
    keywords = build_auction_keywords(item, title, description, category)

    return {
        "title": title,
        "description": description,
        "priceRealized": parse_price(item.get("priceRealized") or item.get("price")),
        "auctionHouse": auction_house,
        "saleDate": sale_date,
        "category": category,
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
