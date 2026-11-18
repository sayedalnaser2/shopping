#!/usr/bin/env python3
"""Opens Chrome on THIS computer, visits each shop and runs its crawl script (scraper/browser/<shop>_crawl.js), saving the result to
scraper/incoming/<shop>.json. Then run update.py (update_all.bat / update_all.sh do both).

Needs once:  pip install playwright   (Chrome itself is used - no extra download).
Usage:  python3 scraper/crawl_all.py [shop ...]      e.g.  crawl_all.py lulu ramez     (default: all five)
A Chrome window opens - leave it alone and visible while it works (~1.5-2 hours for everything, one shop after another).
If a shop shows a "verify you are human" page, tick it yourself in the window; the crawl scripts never try to get around one.
"""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE / "incoming"
SHOPS = {   # name -> page the script must run on (same origin as the shop's own API)
    "lulu": "https://gcc.luluhypermarket.com/en-bh/",
    "hypermax": "https://www.hypermax.com.bh/mafbhr/en",
    "megamart": "https://megamart.bh/en/",
    "jazira": "https://www.aljazirasupermarkets.com/",
    "ramez": "https://ramezshopping.com/products/category/Drinks/bh/store/7263?category=235",
}
MIN = {"lulu": 15000, "hypermax": 15000, "jazira": 10000, "megamart": 8000, "ramez": 12000}


def as_function(js):
    lines = [l for l in js.splitlines() if not l.strip().startswith("//")]
    body = "\n".join(lines).strip().rstrip(";")
    return "async () => { await " + body + "; }"      # the script is one (async () => {...})() expression that ends by clicking a download link


def main():
    want = sys.argv[1:] or list(SHOPS)
    bad = [w for w in want if w not in SHOPS]
    if bad:
        sys.exit("unknown shop: " + ", ".join(bad) + "  (choose from " + ", ".join(SHOPS) + ")")
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        try:
            ctx = p.chromium.launch_persistent_context(str(HERE / ".chrome-profile"), channel="chrome", headless=False, accept_downloads=True)
        except Exception:
            print("Chrome not found - using Playwright's own Chromium (run `playwright install chromium` once if this fails)")
            ctx = p.chromium.launch_persistent_context(str(HERE / ".chrome-profile"), headless=False, accept_downloads=True)
        for shop in want:
            print(f"\n=== {shop} ===", flush=True)
            page = ctx.new_page()
            page.goto(SHOPS[shop], wait_until="domcontentloaded", timeout=120000)
            time.sleep(5)
            js = as_function((HERE / "browser" / f"{shop}_crawl.js").read_text(encoding="utf-8"))
            t0 = time.time()
            try:
                with page.expect_download(timeout=3 * 3600 * 1000) as dl:
                    page.evaluate(js)
                target = OUT / f"{shop}.json"
                dl.value.save_as(str(target))
            except Exception as e:
                print(f"  {shop} failed: {e}"); page.close(); continue
            import json
            n = len(json.load(open(target)))
            print(f"  {shop}: {n:,} products in {(time.time() - t0) / 60:.0f} min -> {target}")
            if n < MIN[shop]:
                print(f"  WARNING: that is fewer than a full crawl ({MIN[shop]:,}+). update.py still keeps older rows as 'last known'.")
            page.close()
        ctx.close()
    print("\nCrawl finished. Now run update.py to rebuild and publish.")


if __name__ == "__main__":
    main()
