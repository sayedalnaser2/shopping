#!/usr/bin/env python3
"""Price bot: searches each store's website for every catalog product and writes prices.js.

Usage: python3 scraper/scrape.py [--stores lulu,ramez] [--limit N] [--config scraper/stores.json]
Extraction is generic: schema.org JSON-LD (Product/Offer, ItemList), embedded
__NEXT_DATA__ JSON, and Open Graph price meta tags. If a store's site needs a
custom approach (JS-rendered, private API), add a function to CUSTOM below.
Stdlib only.
"""
import argparse, difflib, json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; BahrainPriceBot/1.0)"
MIN_SCORE = 0.55
CUSTOM = {}  # store_id -> fn(html, query) -> [(name, price)]


def load_products():
    rows = re.findall(r'^\s*\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[', (ROOT / "data.js").read_text(), re.M)
    return [{"id": i, "name": n, "size": s} for i, (n, s, _c) in enumerate(rows)]


def fetch(url, retries=2):
    for a in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if a == retries:
                print(f"  ! fetch failed {url}: {e}", file=sys.stderr)
                return ""
            time.sleep(2 * (a + 1))


def to_price(v):
    try:
        p = float(str(v).replace(",", "").strip())
        return p if 0 < p < 1000 else None
    except ValueError:
        return None


def walk(o, out):
    """Collect (name, price) from any JSON structure that looks like a product."""
    if isinstance(o, list):
        for x in o:
            walk(x, out)
    elif isinstance(o, dict):
        name = o.get("name") or o.get("title")
        offers = o.get("offers")
        price = None
        if isinstance(offers, list) and offers:
            offers = offers[0]
        if isinstance(offers, dict):
            price = offers.get("price") or offers.get("lowPrice")
        price = price or o.get("price") or o.get("sellingPrice") or o.get("salePrice")
        if isinstance(price, dict):
            price = price.get("value") or price.get("amount")
        if isinstance(name, str) and price is not None and to_price(price):
            out.append((name, to_price(price)))
        for v in o.values():
            if isinstance(v, (dict, list)):
                walk(v, out)


def extract(html):
    out = []
    for m in re.finditer(r'<script[^>]+(?:ld\+json|__NEXT_DATA__|application/json)[^>]*>(.*?)</script>', html, re.S):
        try:
            walk(json.loads(m.group(1)), out)
        except ValueError:
            pass
    t = re.search(r'property="og:title"\s+content="([^"]+)"', html)
    p = re.search(r'(?:product:price:amount|og:price:amount)"\s+content="([\d.,]+)"', html)
    if t and p and to_price(p.group(1)):
        out.append((t.group(1), to_price(p.group(1))))
    return out


def tokens(s):
    s = s.lower().replace("l ", "l ").replace("(", " ").replace(")", " ")
    return set(re.findall(r"[a-z]+|\d+(?:\.\d+)?", s))


def score(product, cand):
    want = tokens(product["name"] + " " + product["size"])
    got = tokens(cand)
    if not want or not got:
        return 0
    if not tokens(product["name"]) <= got:  # every word of the product name must appear
        return 0
    overlap = len(want & got) / len(want)
    # numeric size tokens must agree, otherwise 1L vs 2L would match
    nums_w = {t for t in want if t[0].isdigit()}
    if nums_w and not nums_w <= got:
        overlap *= 0.5
    return overlap * 0.8 + difflib.SequenceMatcher(None, product["name"].lower(), cand.lower()).ratio() * 0.2


def best_match(product, cands):
    best = max(((score(product, n), n, p) for n, p in cands), default=None)
    return best if best and best[0] >= MIN_SCORE else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(ROOT / "scraper/stores.json"))
    ap.add_argument("--stores")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--delay", type=float, default=1.0)
    ap.add_argument("--out", default=str(ROOT / "prices.js"))
    a = ap.parse_args()

    cfg = {k: v for k, v in json.loads(Path(a.config).read_text()).items() if not k.startswith("_")}
    wanted = set(a.stores.split(",")) if a.stores else set(cfg)
    products = load_products()[: a.limit]
    prices = {}  # product id -> store -> price
    report = {}
    for sid, sc in cfg.items():
        if sid not in wanted or not sc.get("enabled", True):
            continue
        found = 0
        print(f"== {sid}")
        for p in products:
            q = urllib.parse.quote_plus(f'{p["name"]} {p["size"].split("(")[0].strip()}')
            html = fetch(sc["search_url"].format(q=q))
            cands = CUSTOM[sid](html, q) if sid in CUSTOM else extract(html)
            m = best_match(p, cands)
            if m:
                prices.setdefault(str(p["id"]), {})[sid] = round(m[2], 3)
                found += 1
                print(f'  {p["name"]} {p["size"]} -> {m[1]} = {m[2]:.3f} (score {m[0]:.2f})')
            time.sleep(a.delay)
        report[sid] = f"{found}/{len(products)}"
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "coverage": report, "prices": prices}
    Path(a.out).write_text("window.LIVE_PRICES = " + json.dumps(out, indent=1) + ";\n")
    print("coverage:", report)


if __name__ == "__main__":
    main()
