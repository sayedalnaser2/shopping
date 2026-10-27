#!/usr/bin/env python3
"""Stage 3 (now also Al Jazira / Megamart / Ramez via match_extra.py): merge the Lulu and Hypermax exports into the website's data files.

Reads:   scraper/raw/lulu.json, scraper/raw/hypermax.json   (bot exports, see scraper/browser/)
         scraper/work/pairs_auto.json                       (confident cross-store matches)
         scraper/work/decisions.json                        (reviewed pairs: [{"h":id,"l":id,"ok":true|false}])
Writes:  catalog.js   - every Lulu/Hypermax product, matched products merged into one row

No prices are invented: a price appears only if a store's page showed it.
Usage: python3 scraper/build_catalog.py
"""
import json, re, sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

RAW, WORK = HERE / "raw", HERE / "work"
HYP_IMG = "https://cdn.mafrservices.com/pim-content/BHR/media/product"
EXTRA = {"jazira": 7, "megamart": 8, "ramez": 9}
BASE = {"jazira": "https://www.aljazirasupermarkets.com", "megamart": "https://megamart.bh", "ramez": "https://ramezshopping.com"}
LULU_BASE, HYP_BASE = "https://gcc.luluhypermarket.com", "https://www.hypermax.com.bh"


NOT_FOOD = re.compile(r"electronic|appliance|\btv\b|mobile|computer|furniture|luggage|home|kitchen|garden|automotive|gaming|camera|audio|printer|sport|toy", re.I)


def fix_glued_price(r):
    """Old Lulu/Hypermax crawls glued digits that sat before the price (pack count, shade number, item code) onto it,
    e.g. shade 60 + 3.250 BHD -> 603.25. If an implausibly high price starts with a number from the product's own
    name/size/link and the rest is a sane price, use the rest. The fixed crawl scripts no longer need this."""
    p = r["p"]
    if p <= 150:
        return p
    long_only = bool(NOT_FOOD.search(r.get("c", "") + " " + r.get("sc", "")))  # appliances etc.: only trust item-code sized prefixes
    s = repr(p)
    if "e" in s:
        return p
    txt = r["n"] + " " + (r.get("s") or "") + " " + r["u"].split("/p/")[0].split("/")[-1]
    best = None
    for c in {d.lstrip("0") for d in re.findall(r"\d+", txt)} - {""}:
        if s.startswith(c) and len(s) > len(c) and s[len(c)].isdigit() and (len(c) >= 5 or not long_only or p > 2000):
            try:
                v = float(s[len(c):])
            except ValueError:
                continue
            if 0.05 <= v <= (150 if len(c) < 4 and p <= 2000 else 5000) and (best is None or len(c) > best[0]):
                best = (len(c), v)
    return best[1] if best else p


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def category(store, c, sub=""):
    t = f"{c} {sub}".lower().replace("-", " ")
    rules = [
        (r"fruit|vegetable", "Fruit & Veg"), (r"dairy|egg|cheese|milk|yog|labneh|butter|cream", "Dairy & Eggs"),
        (r"meat|poultry|chicken|beef|lamb|fish|seafood|shrimp", "Meat & Fish"), (r"bakery|bread", "Bakery"),
        (r"frozen|ice cream", "Frozen Food"), (r"beverage|water|juice|soft drink|coffee|tea\b|drinks", "Beverages"),
        (r"baby|infant|diaper", "Baby"), (r"pet", "Pets"),
        (r"beauty|personal|perfume|wellness|cosmetic|skin|hair", "Personal Care"),
        (r"cleaning|household|laundry|paper", "Household"), (r"health|fitness|medical|vitamin", "Health"),
        (r"mobile|phone|tablet|wearable|smartwatch|camera|gaming|computer|audio|\btv\b|electronic|appliance|pc acc|printer", "Electronics"),
        (r"stationery|school|toy|book|outdoor|sport", "Stationery & Toys"),
        (r"luggage|fashion|accessor", "Fashion & Luggage"),
        (r"home|kitchen|cooking|dining|garden|furniture|decor|automotive|kiosk", "Home & Kitchen"),
        (r"cupboard|speciality|pantry|grocery|food|organic|deli|snack|breakfast|cooking", "Pantry"),
    ]
    for pat, name in rules:
        if re.search(pat, t):
            return name
    return "Other"


def main():
    lulu = {r["i"]: r for r in load(RAW / "lulu.json")}
    hyp = {r["i"]: r for r in load(RAW / "hypermax.json")}
    fixed = 0
    for store in (lulu, hyp):
        for r in store.values():
            q = fix_glued_price(r)
            if q != r["p"]:
                r["p"] = q; fixed += 1
                if r.get("w") and r["w"] <= q: r["w"] = None
    print("glued prices repaired:", fixed)
    # Optional picture maps from the crawl bots: {product id: image url} (Hypermax: {id: timestamp} or full url)
    for fname, store in (("lulu_images.json", lulu), ("hypermax_images.json", hyp)):
        if (RAW / fname).exists():
            for pid, v in load(RAW / fname).items():
                if pid in store and not store[pid].get("im") and v:
                    store[pid]["im"] = v if v.startswith("http") else f"{HYP_IMG}/{pid}/{v}/{pid}_main.jpg"
    auto = load(WORK / "pairs_auto.json") if (WORK / "pairs_auto.json").exists() else []
    dec = load(WORK / "decisions.json") if (WORK / "decisions.json").exists() else []
    pairs = {(p["h"], p["l"]) for p in auto} | {(d["h"], d["l"]) for d in dec if d.get("ok")}
    l2h, h2l = {}, {}
    for h, l in sorted(pairs):
        if h in hyp and l in lulu and l not in l2h and h not in h2l:
            l2h[l], h2l[h] = h, l

    def lp(r):
        return None if not r else [r["p"], r.get("w"), r["u"].replace(LULU_BASE, "")]

    def hp(r):
        return None if not r else [r["p"], r.get("w"), r["u"].replace(HYP_BASE, "")]

    rows = []
    for l in lulu.values():
        h = hyp.get(l2h.get(l["i"]))
        rows.append(["l" + l["i"], l["n"], (h or {}).get("s", ""), category("lulu", l["c"]),
                     l.get("im") or (h or {}).get("im"), lp(l), hp(h)])
    for h in hyp.values():
        if h["i"] in h2l:
            continue
        rows.append(["h" + h["i"], h["n"], h.get("s", ""), category("hyp", h["c"], h.get("sc", "")),
                     h.get("im"), None, hp(h)])
    # Extra stores: row slots 7.. = jazira, megamart, ramez. Matched to an existing product row, else a new row.
    row_of = {}
    for r in rows:
        if r[5]: row_of[("lulu", r[0][1:])] = r
        if r[6] and r[0][0] == "h": row_of[("hypermax", r[0][1:])] = r
    for h, l in h2l.items():
        if ("lulu", l) in row_of: row_of[("hypermax", h)] = row_of[("lulu", l)]
    extra_meta = {}
    for st, slot in EXTRA.items():
        f = RAW / f"{st}.json"
        if not f.exists():
            continue
        items = {r["i"]: r for r in load(f)}
        if (RAW / f"{st}_images.json").exists():
            for pid, v in load(RAW / f"{st}_images.json").items():
                if pid in items and not items[pid].get("im") and v:
                    items[pid]["im"] = v
        pr = load(WORK / f"pairs_{st}.json") if (WORK / f"pairs_{st}.json").exists() else []
        pr = [(p["x"], p["s"], p["a"]) for p in pr]
        if (WORK / f"extra_accept_{st}.json").exists():
            pr += [(p["x"], p["s"], p["a"]) for p in load(WORK / f"extra_accept_{st}.json")]
        used, matched = set(), 0
        for x, s2, a in pr:
            row = row_of.get((s2, a))
            if row is not None and x in items and x not in used and (len(row) <= slot or row[slot] is None):
                while len(row) <= slot: row.append(None)
                it = items[x]
                row[slot] = [it["p"], it.get("w"), it["u"].replace(BASE[st], "")]
                if not row[4] and it.get("im"): row[4] = it["im"]
                used.add(x); row_of[(st, x)] = row; matched += 1
        for it in items.values():
            if it["i"] in used: continue
            row = [st[0] + it["i"], it["n"], "", category(st, it["c"], it.get("sc", "")), it.get("im")] + [None] * (slot - 4)
            row[slot] = [it["p"], it.get("w"), it["u"].replace(BASE[st], "")]
            rows.append(row); row_of[(st, it["i"])] = row
        extra_meta[st] = len(items)
        print(st, len(items), "products,", matched, "matched into existing rows")
    # Extra merges decided by match_ai.py / review: [[store, id], [store, id]] -> the two rows become one
    # (only if they show no common shop). Applied last so it works across every store.
    mf = WORK / "merges.json"
    merged = 0
    if mf.exists():
        gone = set()
        for (s1, i1), (s2, i2) in load(mf):
            a, b = row_of.get((s1, i1)), row_of.get((s2, i2))
            if a is None or b is None or a is b or id(a) in gone or id(b) in gone:
                continue
            n = max(len(a), len(b))
            a += [None] * (n - len(a)); b += [None] * (n - len(b))
            if any(a[k] and b[k] for k in range(5, n)):
                continue
            for k in range(5, n):
                if b[k]: a[k] = b[k]
            if not a[4] and b[4]: a[4] = b[4]
            if not a[2] and b[2]: a[2] = b[2]
            gone.add(id(b)); merged += 1
            for key, r in list(row_of.items()):
                if r is b: row_of[key] = a
        rows = [r for r in rows if id(r) not in gone]
        print("extra merges applied:", merged)
    membership = {}
    for (st, pid), r in row_of.items():
        membership.setdefault(r[0], {})[st] = pid
    (WORK / "membership.json").write_text(json.dumps(list(membership.values())), encoding="utf-8")
    rows.sort(key=lambda r: (r[3], r[1].lower()))
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    meta = {"updated": now, "lulu": len(lulu), "hypermax": len(hyp), "matched": len(l2h), "rows": len(rows), **extra_meta,
            "multi": sum(1 for r in rows if sum(1 for v in r[5:] if v) >= 2)}
    body = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows)
    (ROOT / "catalog.js").write_text(
        "// Generated by scraper/build_catalog.py - do not edit by hand.\n"
        "// Row: [id, name, size, category, image, lulu, hypermax, jazira, megamart, ramez]; store = [price BHD, was-price|null, page path]\n"
        f"window.CATALOG_META = {json.dumps(meta)};\nwindow.CATALOG = [\n{body}\n];\n", encoding="utf-8")
    print("catalog.js:", meta, "with picture:", sum(1 for r in rows if r[4]))


if __name__ == "__main__":
    main()
