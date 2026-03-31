from __future__ import annotations

from scraper_ebay import run as run_ebay
from scraper_heritage import run as run_heritage
from scraper_liveauctioneers import run as run_liveauctioneers


def main() -> None:
    runs = [
        ("liveauctioneers", run_liveauctioneers),
        ("heritage", run_heritage),
        ("ebay", run_ebay),
    ]

    for source, runner in runs:
        print(f"[run_all] Starting {source}")
        try:
            items, output_path = runner()
            print(f"[run_all] {source}: saved {len(items)} items to {output_path}")
        except Exception as exc:  # noqa: BLE001
            print(f"[run_all] {source} failed: {exc}")


if __name__ == "__main__":
    main()
