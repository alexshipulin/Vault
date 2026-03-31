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

BASE_URL = "https://www.ha.com/c/search/results.zx"
SOURCE = "heritage"
MAX_PAGES_PER_QUERY = 5
QUERIES = [
    "antique furniture",
    "antique ceramics",
    "antique jewelry",
    "antique art",
    "vintage collectibles",
]
LINK_SELECTORS = (
    "a[href*='/itm/']",
    "a[href*='/itm']",
    "a[href*='/c/item.zx']",
)


def build_search_url(query: str, page: int) -> str:
    return f"{BASE_URL}?{urlencode({'term': query, 'page': page})}"


def find_title_link(card: Tag) -> Tag | None:
    for selector in LINK_SELECTORS:
        for link in card.select(selector):
            text = normalize_text(link.get_text(" ", strip=True))
            if text and len(text) > 5:
                return link
    return None


def pick_sale_date(lines: list[str]) -> str:
    for line in lines:
        normalized = normalize_date_text(line)
        if normalized and normalized != line:
            return normalized
    return ""


def pick_price(lines: list[str]) -> float | None:
    sold_line = next(
        (line for line in lines if "sold for" in line.lower() or line.lower().startswith("sold")),
        "",
    )
    if sold_line:
        prices = extract_all_prices(sold_line)
        if prices:
            return prices[-1]

    money_lines = [line for line in lines if "$" in line or "€" in line or "£" in line]
    if not money_lines:
        return None

    prices = extract_all_prices(money_lines[-1])
    return prices[-1] if prices else None


def pick_estimate(lines: list[str]) -> tuple[float | None, float | None]:
    estimate_line = next((line for line in lines if "estimate" in line.lower()), "")
    return extract_estimate_range(estimate_line)


def parse_card(card: Tag, query: str) -> dict[str, Any] | None:
    title_link = find_title_link(card)
    if title_link is None:
        return None

    title = normalize_text(title_link.get_text(" ", strip=True))
    if not title:
        return None

    lines = text_lines_from_tag(card)
    estimate_low, estimate_high = pick_estimate(lines)

    item = {
        "title": title,
        "price": pick_price(lines),
        "date": pick_sale_date(lines),
        "source": SOURCE,
        "imageUrl": extract_image_url(card, BASE_URL),
        "scrapedAt": now_iso(),
        "url": absolute_url(BASE_URL, title_link.get("href")),
        "estimateLow": estimate_low,
        "estimateHigh": estimate_high,
        "query": query,
        "category": detect_category(title),
        "keywords": extract_keywords(title),
    }

    return item


def parse_next_url(soup: Tag, current_url: str) -> str | None:
    next_link = (
        soup.select_one("a[rel='next']")
        or soup.select_one("a[aria-label='Next']")
        or soup.select_one("a[title='Next']")
    )
    if next_link is None:
        return None
    return absolute_url(current_url, next_link.get("href"))


def scrape_query(query: str, max_pages: int = MAX_PAGES_PER_QUERY) -> list[dict[str, Any]]:
    session = build_session()
    items: list[dict[str, Any]] = []
    next_url: str | None = build_search_url(query, 1)

    for page in range(1, max_pages + 1):
        current_url = next_url or build_search_url(query, page)
        response = fetch_response(session, current_url, SOURCE)
        if response is None:
            log_progress(SOURCE, f"Skipping page {page} for query '{query}'")
            continue

        soup = make_soup(response.text)
        cards = iter_candidate_cards(soup, LINK_SELECTORS)
        log_progress(SOURCE, f"Found {len(cards)} candidate cards for '{query}' page {page}")

        for card in cards:
            try:
                item = parse_card(card, query)
            except Exception as exc:  # noqa: BLE001
                log_progress(SOURCE, f"Card parsing failed for '{query}' page {page}: {exc}")
                continue

            if item is None:
                continue
            items.append(item)

        next_url = parse_next_url(soup, response.url) or build_search_url(query, page + 1)

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
