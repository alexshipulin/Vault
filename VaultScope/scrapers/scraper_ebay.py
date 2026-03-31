from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from bs4 import Tag

from utils import (
    absolute_url,
    build_session,
    dedupe_items,
    detect_category,
    extract_keywords,
    extract_price,
    fetch_response,
    log_progress,
    make_soup,
    normalize_date_text,
    normalize_text,
    now_iso,
    save_results,
)

BASE_URL = "https://www.ebay.com/sch/i.html"
SOURCE = "ebay"
MAX_PAGES_PER_QUERY = 3
QUERIES = [
    "antique",
    "vintage collectible",
    "estate jewelry",
    "antique furniture",
]


def build_search_url(query: str, page: int) -> str:
    params = {
        "_nkw": query,
        "LH_Sold": "1",
        "LH_Complete": "1",
        "_pgn": str(page),
    }
    return f"{BASE_URL}?{urlencode(params)}"


def parse_item(card: Tag, query: str) -> dict[str, Any] | None:
    title_node = card.select_one(".s-item__title") or card.select_one("h3")
    title = normalize_text(title_node.get_text(" ", strip=True) if title_node else "")
    if not title or title.lower() == "shop on ebay":
        return None
    if title.lower().startswith("new listing"):
        title = normalize_text(title[len("new listing"):])

    price_node = card.select_one(".s-item__price")
    date_node = (
        card.select_one(".POSITIVE")
        or card.select_one(".s-item__caption--signal-positive")
        or card.select_one(".s-item__ended-date")
    )
    condition_node = card.select_one(".SECONDARY_INFO") or card.select_one(".s-item__subtitle")
    image_node = card.select_one(".s-item__image-img") or card.find("img")
    url_node = card.select_one(".s-item__link") or card.find("a", href=True)

    price_text = normalize_text(price_node.get_text(" ", strip=True) if price_node else "")
    date_text = normalize_text(date_node.get_text(" ", strip=True) if date_node else "")
    condition = normalize_text(condition_node.get_text(" ", strip=True) if condition_node else "")

    image_url = None
    if image_node is not None:
        image_url = (
            image_node.get("src")
            or image_node.get("data-src")
            or image_node.get("data-lazy-src")
        )

    item = {
        "title": title,
        "price": extract_price(price_text),
        "date": normalize_date_text(date_text),
        "source": SOURCE,
        "imageUrl": absolute_url(BASE_URL, image_url),
        "scrapedAt": now_iso(),
        "url": absolute_url(BASE_URL, url_node.get("href") if url_node else None),
        "condition": condition,
        "query": query,
        "category": detect_category(title),
        "keywords": extract_keywords(title),
    }

    return item


def scrape_query(query: str, max_pages: int = MAX_PAGES_PER_QUERY) -> list[dict[str, Any]]:
    session = build_session()
    items: list[dict[str, Any]] = []

    for page in range(1, max_pages + 1):
        response = fetch_response(session, build_search_url(query, page), SOURCE)
        if response is None:
            log_progress(SOURCE, f"Skipping page {page} for query '{query}'")
            continue

        soup = make_soup(response.text)
        cards = soup.select("li.s-item")
        log_progress(SOURCE, f"Found {len(cards)} eBay cards for '{query}' page {page}")

        for card in cards:
            try:
                item = parse_item(card, query)
            except Exception as exc:  # noqa: BLE001
                log_progress(SOURCE, f"Card parsing failed for '{query}' page {page}: {exc}")
                continue

            if item is None:
                continue
            items.append(item)

    return dedupe_items(items)


def scrape_all() -> list[dict[str, Any]]:
    all_items: list[dict[str, Any]] = []

    for query in QUERIES:
        log_progress(SOURCE, f"Scraping query '{query}'")
        try:
            query_items = scrape_query(query)
        except Exception as exc:  # noqa: BLE001
            log_progress(SOURCE, f"Query scrape failed for '{query}': {exc}")
            continue

        log_progress(SOURCE, f"Collected {len(query_items)} items for '{query}'")
        all_items.extend(query_items)

    return dedupe_items(all_items)


def run() -> tuple[list[dict[str, Any]], str]:
    items = scrape_all()
    output_path = save_results(items, SOURCE)
    log_progress(SOURCE, f"Saved {len(items)} items to {output_path}")
    return items, str(output_path)


def main() -> None:
    run()


if __name__ == "__main__":
    main()
