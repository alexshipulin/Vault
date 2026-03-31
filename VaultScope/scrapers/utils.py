from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"

USER_AGENTS = [
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) "
        "Gecko/20100101 Firefox/124.0"
    ),
    (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_5) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
        "Version/17.4 Safari/605.1.15"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Edg/123.0.2420.65 Safari/537.36"
    ),
]

STOP_WORDS = {
    "a",
    "an",
    "and",
    "antique",
    "art",
    "at",
    "by",
    "collection",
    "collectible",
    "estate",
    "for",
    "from",
    "in",
    "item",
    "items",
    "lot",
    "of",
    "on",
    "or",
    "the",
    "to",
    "vintage",
    "with",
}

CATEGORY_KEYWORDS = {
    "furniture": {
        "armchair",
        "bed",
        "bench",
        "bookcase",
        "cabinet",
        "chair",
        "chest",
        "console",
        "desk",
        "dresser",
        "furniture",
        "mirror",
        "ottoman",
        "settee",
        "sideboard",
        "sofa",
        "stool",
        "table",
        "wardrobe",
    },
    "ceramics": {
        "bowl",
        "ceramic",
        "china",
        "cloisonne",
        "earthenware",
        "faience",
        "jar",
        "plate",
        "porcelain",
        "pottery",
        "stoneware",
        "teapot",
        "urn",
        "vase",
    },
    "art": {
        "canvas",
        "drawing",
        "engraving",
        "etching",
        "lithograph",
        "painting",
        "photograph",
        "portrait",
        "print",
        "sculpture",
        "serigraph",
        "sketch",
        "statue",
        "watercolor",
    },
    "jewelry": {
        "amulet",
        "bracelet",
        "brooch",
        "diamond",
        "earring",
        "gem",
        "gold",
        "jewelry",
        "necklace",
        "pendant",
        "platinum",
        "ring",
        "ruby",
        "sapphire",
        "silver",
        "watch",
    },
}

PRICE_PATTERN = re.compile(
    r"(?:US\s*)?(?:\$|£|€|EUR)\s*([0-9][0-9,]*(?:\.\d{1,2})?)",
    re.IGNORECASE,
)
MONTH_PATTERN = re.compile(
    r"("
    r"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?"
    r")\s+\d{1,2},?\s+\d{4}",
    re.IGNORECASE,
)


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Upgrade-Insecure-Requests": "1",
        }
    )
    return session


def log_progress(source: str, message: str) -> None:
    print(f"[{source}] {message}")


def smart_delay(min_seconds: float = 1.0, max_seconds: float = 3.0) -> None:
    time.sleep(random.uniform(min_seconds, max_seconds))


def random_headers() -> dict[str, str]:
    return {"User-Agent": random.choice(USER_AGENTS)}


def fetch_response(
    session: requests.Session,
    url: str,
    source: str,
    *,
    params: dict[str, Any] | None = None,
    timeout: int = 30,
    retries: int = 2,
) -> requests.Response | None:
    for attempt in range(1, retries + 1):
        try:
            response = session.get(
                url,
                params=params,
                headers=random_headers(),
                timeout=timeout,
            )
            log_progress(source, f"GET {response.url} (attempt {attempt}/{retries})")
            response.raise_for_status()
            smart_delay(2.0, 3.0)
            return response
        except requests.RequestException as exc:
            log_progress(source, f"Request failed: {exc}")
            if attempt == retries:
                return None
            smart_delay(2.0, 3.0)

    return None


def make_soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def split_text_lines(value: str) -> list[str]:
    lines = [normalize_text(part) for part in re.split(r"[\r\n]+", value)]
    return [line for line in lines if line]


def extract_price(text: str) -> float | None:
    if not text:
        return None

    match = PRICE_PATTERN.search(text)
    if not match:
        return None

    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def extract_all_prices(text: str) -> list[float]:
    values: list[float] = []
    for match in PRICE_PATTERN.findall(text or ""):
        try:
            values.append(float(match.replace(",", "")))
        except ValueError:
            continue
    return values


def extract_estimate_range(text: str) -> tuple[float | None, float | None]:
    prices = extract_all_prices(text)
    if not prices:
        return (None, None)
    if len(prices) == 1:
        return (prices[0], prices[0])
    return (prices[0], prices[1])


def extract_keywords(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", text.lower())
    unique_tokens: list[str] = []
    seen: set[str] = set()

    for token in tokens:
        if len(token) <= 2 or token in STOP_WORDS or token.isdigit():
            continue
        if token in seen:
            continue
        seen.add(token)
        unique_tokens.append(token)

    return unique_tokens


def detect_category(title: str) -> str:
    title_keywords = set(extract_keywords(title))

    for category, keywords in CATEGORY_KEYWORDS.items():
        if title_keywords & keywords:
            return category

    return "general"


def normalize_date_text(text: str) -> str:
    cleaned = normalize_text(text)
    if not cleaned:
        return ""

    month_match = MONTH_PATTERN.search(cleaned)
    if month_match:
        candidate = month_match.group(0).replace("Sept", "Sep")
        for date_format in ("%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y"):
            try:
                return datetime.strptime(candidate, date_format).date().isoformat()
            except ValueError:
                continue

    for pattern in (r"\d{4}-\d{2}-\d{2}", r"\d{1,2}/\d{1,2}/\d{4}"):
        match = re.search(pattern, cleaned)
        if not match:
            continue
        candidate = match.group(0)
        for date_format in ("%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(candidate, date_format).date().isoformat()
            except ValueError:
                continue

    return cleaned


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def absolute_url(base_url: str, maybe_relative_url: str | None) -> str | None:
    if not maybe_relative_url:
        return None
    return urljoin(base_url, maybe_relative_url)


def extract_image_url(node: Tag | None, base_url: str) -> str | None:
    if node is None:
        return None

    image = node if node.name == "img" else node.find("img")
    if image is None:
        return None

    for attr in ("src", "data-src", "data-lazy-src", "data-original", "srcset"):
        raw_value = image.get(attr)
        if not raw_value:
            continue

        if attr == "srcset":
            raw_value = raw_value.split(",")[0].strip().split(" ")[0]

        if raw_value.startswith("data:"):
            continue
        return absolute_url(base_url, raw_value)

    return None


def text_lines_from_tag(node: Tag) -> list[str]:
    return split_text_lines(node.get_text("\n", strip=True))


def find_listing_container(link: Tag, max_depth: int = 7) -> Tag | None:
    current: Tag | None = link

    for _ in range(max_depth):
        current = current.parent if current else None
        if current is None:
            return None
        if current.name not in {"article", "div", "li", "tr"}:
            continue

        text = normalize_text(current.get_text(" ", strip=True))
        if len(text) < 40:
            continue
        if current.find("img") or len(current.find_all("a", href=True)) >= 2:
            return current

    return None


def iter_candidate_cards(soup: BeautifulSoup, selectors: Iterable[str]) -> list[Tag]:
    cards: list[Tag] = []
    seen: set[int] = set()

    for selector in selectors:
        for link in soup.select(selector):
            card = find_listing_container(link)
            if card is None:
                continue
            identity = id(card)
            if identity in seen:
                continue
            seen.add(identity)
            cards.append(card)

    return cards


def save_results(results: list[dict[str, Any]], source: str) -> Path:
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_path = RAW_DATA_DIR / f"{source}_{timestamp}.json"
    output_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    return output_path


def dedupe_items(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in items:
        signature = "|".join(
            [
                normalize_text(str(item.get("title", ""))).lower(),
                normalize_text(str(item.get("date", ""))).lower(),
                normalize_text(str(item.get("url", ""))).lower(),
            ]
        )
        if signature in seen:
            continue
        seen.add(signature)
        deduped.append(item)

    return deduped
