#!/usr/bin/env python3
"""Open one store search in Chromium and save what it sees, so a reader can be written.
Usage: python scraper/probe.py ramez [query]    -> writes probe_<store>/ (page.html, page.png, json_*.txt)"""
import json, sys, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

store = sys.argv[1]
query = sys.argv[2] if len(sys.argv) > 2 else "milk"
cfg = json.loads((Path(__file__).parent / "stores.json").read_text())[store]
url = cfg["search_url"].format(q=urllib.parse.quote_plus(query))
out = Path(f"probe_{store}"); out.mkdir(exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1280, "height": 1800}); n = 0
    def on_resp(r):
        global n
        try:
            if "json" in r.headers.get("content-type", ""):
                n += 1; (out / f"json_{n}.txt").write_text(f"{r.status} {r.url}\n\n{r.text()[:20000]}")
        except Exception: pass
    page.on("response", on_resp)
    page.goto(url, wait_until="networkidle", timeout=60000); page.wait_for_timeout(3000)
    (out / "page.html").write_text(page.content()); page.screenshot(path=str(out / "page.png"))
    print("saved to", out, "-", n, "JSON responses;", url); b.close()
