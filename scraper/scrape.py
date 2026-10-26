#!/usr/bin/env python3
"""Price bot: searches each store's website for every catalog product and writes prices.js.

Usage: python3 scraper/scrape.py [--stores lulu,ramez] [--limit N] [--config scraper/stores.json]
Extraction is generic: schema.org JSON-LD (Product/Offer, ItemList), embedded
__NEXT_DATA__ JSON, and Open Graph price meta tags. If a store's site needs a
custom approach, add a function to PARSERS and set "parser" in stores.json.
Stdlib only.
"""
import argparse, difflib, json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; BahrainPriceBot/1.0)"
MIN_SCORE = 0.8


def load_products():
    rows = re.findall(r'^\s*\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[', (ROOT / "data.js").read_text(), re.M)
    return [{"id": i, "name": n, "size": s} for i, (n, s, _c) in enumerate(rows)]


def fetch(url, retries=2, headers=None):
    for a in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en", **(headers or {})})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if a == retries:
                print(f"  ! fetch failed {url}: {e}", file=sys.stderr)
                return ""
            time.sleep(2 * (a + 1))


class Browser:
    """Optional real-Chromium fetcher (pip install playwright; python -m playwright install chromium).
    Returns the rendered HTML plus every JSON response the page loaded, as <script type=application/json>."""

    def __init__(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            sys.exit("Chromium mode needs: pip install playwright && python -m playwright install chromium")
        self.pw = sync_playwright().start()
        import os
        exe = os.environ.get("CHROMIUM_PATH")
        self.browser = self.pw.chromium.launch(executable_path=exe) if exe else self.pw.chromium.launch()
        self.ctx = self.browser.new_context(locale="en-US")

    def get(self, url):
        page, blobs = self.ctx.new_page(), []

        def on_resp(r):
            try:
                if "json" in r.headers.get("content-type", ""):
                    blobs.append(r.text())
            except Exception:
                pass

        page.on("response", on_resp)
        try:
            page.goto(url, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(1500)
            html = page.content()
        except Exception as e:
            print(f"  ! browser failed {url}: {str(e)[:100]}", file=sys.stderr)
            html = ""
        finally:
            page.close()
        return html + "".join(f'<script type="application/json">{b.replace("</", "<\\/")}</script>' for b in blobs)

    def close(self):
        self.browser.close()
        self.pw.stop()


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


def parse_wave(body, _q=None):
    """Wave Grocery platform JSON (Al Jazira). Prices are in fils."""
    try:
        prods = json.loads(body)["data"]["products"]
    except (ValueError, KeyError, TypeError):
        return []
    return [(x["name"], x["finalPrice"] / 1000) for x in prods if x.get("available") and x.get("finalPrice")]


def parse_oscar(html, _q=None):
    """Megamart (Django Oscar) server-rendered product cards."""
    out = []
    for blk in html.split('class="text-action-wrapper"')[1:]:
        n = re.search(r'class="excerpt">\s*<span>([^<]+)</span>', blk)
        i = re.search(r'class="intiger">(\d+)</span>', blk)
        d = re.search(r'class="decimal">(\.\d+)</span>', blk)
        if n and i and d:
            out.append((n.group(1).strip(), float(i.group(1) + d.group(1))))
    return out


PARSERS = {"wave": parse_wave, "oscar": parse_oscar}


UNITS = {"kg": 1000, "kgs": 1000, "g": 1, "gm": 1, "gms": 1, "gram": 1, "grams": 1, "gr": 1,
         "l": 1000, "ltr": 1000, "litre": 1000, "liter": 1000, "litres": 1000, "ml": 1}
STOP = {"pcs", "pc", "tray", "bags", "bag", "rolls", "each", "x"}


def sizes(text):
    """Set of sizes in g/ml found in text; multipacks also add their total (12 x 500 ml -> 6000)."""
    out = set()
    t = text.lower().replace(",", "")
    for m in re.finditer(r"(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kgs?|gms?|grams?|gr|g|ltr|litres?|liters?|ml|l)\b", t):
        v = float(m.group(2)) * UNITS[m.group(3)]
        out.add(v)
        if m.group(1):
            out.add(v * int(m.group(1)))
    return out


def tokens(s):
    s = re.sub(r"\(.*?\)", " ", s.lower())
    return {t for t in re.findall(r"[a-z]+", s) if t not in UNITS and t not in STOP}


def counts(text):
    return {int(m) for m in re.findall(r"(\d+)\s*(?:pcs?|bags?|rolls?|[`'\u2019]s\b)", text.lower())}


def score(product, cand):
    name_t = tokens(product["name"])
    cand_t = tokens(cand)
    if not name_t or not name_t <= cand_t:  # every word of the product name must appear
        return 0
    brand = re.search(r"\(([^)]+)\)", product["size"])
    if brand and not tokens(brand.group(1)) <= cand_t:  # brand must match
        return 0
    if re.search(r"\d\s*x\s*\d", cand.lower()) and not re.search(r"\d\s*x\s*\d", product["size"].lower()):
        return 0  # multipack when we want a single unit
    extra = cand_t - name_t - (tokens(brand.group(1)) if brand else set()) - {"per", "each", "fresh", "local"}
    if len(extra) > (3 if brand else 1):  # "Sun Dried Tomatoes" is not "Tomatoes"
        return 0
    wc = counts(product["size"])
    if wc and counts(cand) and not wc & counts(cand):
        return 0  # 24 pcs is not 58 pcs
    want = sizes(product["size"])
    if want:
        got = sizes(cand)
        if got and not (want & got):
            return 0
        if not got and want != {1000.0}:  # unsized listing only OK for loose "1 kg" produce
            return 0
    return 0.8 + difflib.SequenceMatcher(None, product["name"].lower(), cand.lower()).ratio() * 0.2


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
    browser = Browser() if any(c.get("render") and k in wanted and c.get("enabled", True) for k, c in cfg.items()) else None
    prices = {}  # product id -> store -> price
    report = {}
    for sid, sc in cfg.items():
        if sid not in wanted or not sc.get("enabled", True):
            continue
        found = 0
        print(f"== {sid}")
        for p in products:
            q = urllib.parse.quote_plus(f'{p["name"]} {p["size"].split("(")[0].strip()}')
            url = sc["search_url"].format(q=q)
            html = browser.get(url) if sc.get("render") else fetch(url, headers=sc.get("headers"))
            cands = PARSERS[sc["parser"]](html, q) if sc.get("parser") else extract(html)
            m = best_match(p, cands)
            if m:
                prices.setdefault(str(p["id"]), {})[sid] = round(m[2], 3)
                found += 1
                print(f'  {p["name"]} {p["size"]} -> {m[1]} = {m[2]:.3f} (score {m[0]:.2f})')
            time.sleep(a.delay)
        report[sid] = f"{found}/{len(products)}"
    if browser:
        browser.close()
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "coverage": report, "prices": prices}
    Path(a.out).write_text("window.LIVE_PRICES = " + json.dumps(out, indent=1) + ";\n")
    print("coverage:", report)


if __name__ == "__main__":
    main()
