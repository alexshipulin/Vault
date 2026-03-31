from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from bs4 import Tag

from utils import (
    absolute_url,
    build_session,
    dedupe_items,
    detect_category,
    extract_all_prices,
    extract_estimate_range,
    extract_image_url,
    extract_keywords,
    fetch_response,
    iter_candidate_cards,
    log_progress,
    make_soup,
    normalize_date_text,
    normalize_text,
    now_iso,
    save_results,
    text_lines_from_tag,
)

BASE_URL = "https://www.liveauctioneers.com/search/"
SOURCE = "liveauctioneers"
MAX_PAGES_PER_CATEGORY = 5
CATEGORIES = [
    "antique furniture",
    "antique ceramics",
    "antique jewelry",
    "antique art",
    "vintage collectibles",
]
LINK_SELECTORS = (
    "a[href*='/item/']",
    "a[href*='/item-']",
)


def build_search_url(category: str, page: int) -> str:
    query = urlencode({"keyword": category, "page": page})
    return f"{BASE_URL}?{query}"


def find_title_link(card: Tag) -> Tag | None:
    for selector in LINK_SELECTORS:
        link = card.select_one(selector)
        if link and normalize_text(link.get_text(" ", strip=True)):
            return link
    return None


def pick_visible_price(lines: list[str]) -> float | None:
    money_lines = [line for line in lines if "$" in line or "€" in line or "£" in line]
    preferred_lines = [line for line in money_lines if "est" not in line.lower()]
    candidate_lines = preferred_lines or money_lines
    if not candidate_lines:
        return None

    prices = extract_all_prices(candidate_lines[-1])
    return prices[-1] if prices else None


def pick_date(lines: list[str]) -> str:
    for line in lines:
        normalized = normalize_date_text(line)
        if normalized and normalized != line:
            return normalized

    for line in lines:
        lower_line = line.lower()
        if "day left" in lower_line or "days left" in lower_line or "ends in" in lower_line:
            return line

    return ""


def pick_auction_house(card: Tag, title: str) -> str | None:
    for link in card.find_all("a", href=True):
        text = normalize_text(link.get_text(" ", strip=True))
        if not text or text == title:
            continue
        lower_text = text.lower()
        if lower_text in {"save", "featured"}:
            continue
        if "ends in" in lower_text or "left" in lower_text:
            continue
        if text[0].isdigit():
            continue
        if len(text) > 80:
            continue
        return text
    return None


def parse_card(card: Tag, category_query: str) -> dict[str, Any] | None:
    title_link = find_title_link(card)
    if title_link is None:
        return None

    title = normalize_text(title_link.get_text(" ", strip=True))
    if not title:
        return None

    lines = text_lines_from_tag(card)
    visible_price = pick_visible_price(lines)
    estimate_line = next((line for line in lines if "est" in line.lower()), "")
    estimate_low, estimate_high = extract_estimate_range(estimate_line)

    item = {
        "title": title,
        "price": visible_price,
        "date": pick_date(lines),
        "source": SOURCE,
        "imageUrl": extract_image_url(card, BASE_URL),
        "scrapedAt": now_iso(),
        "url": absolute_url(BASE_URL, title_link.get("href")),
        "lotUrl": absolute_url(BASE_URL, title_link.get("href")),
        "auctionHouse": pick_auction_house(card, title),
        "estimateLow": estimate_low,
        "estimateHigh": estimate_high,
        "query": category_query,
        "category": detect_category(title),
        "keywords": extract_keywords(title),
    }

    return item


def scrape_category(category: str, max_pages: int = MAX_PAGES_PER_CATEGORY) -> list[dict[str, Any]]:
    session = build_session()
    items: list[dict[str, Any]] = []

    for page in range(1, max_pages + 1):
        url = build_search_url(category, page)
        response = fetch_response(session, url, SOURCE)
        if response is None:
            log_progress(SOURCE, f"Skipping page {page} for query '{category}'")
            continue

        soup = make_soup(response.text)
        cards = iter_candidate_cards(soup, LINK_SELECTORS) if soup else []
        log_progress(SOURCE, f"Found {len(cards)} candidate cards for '{category}' page {page}")

        if not cards:
            continue

        for card in cards:
            try:
                item = parse_card(card, category)
            except Exception as exc:  # noqa: BLE001
                log_progress(SOURCE, f"Card parsing failed for '{category}' page {page}: {exc}")
                continue

            if item is None:
                continue
            items.append(item)

    return dedupe_items(items)


def scrape_all() -> list[dict[str, Any]]:
    all_items: list[dict[str, Any]] = []

    for category in CATEGORIES:
        log_progress(SOURCE, f"Scraping category '{category}'")
        try:
            category_items = scrape_category(category)
        except Exception as exc:  # noqa: BLE001
            log_progress(SOURCE, f"Category scrape failed for '{category}': {exc}")
            continue

        log_progress(SOURCE, f"Collected {len(category_items)} items for '{category}'")
        all_items.extend(category_items)

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
