#!/usr/bin/env python3
"""Stage 1 of cross-store matching (no AI, no network): find candidate Lulu <-> Hypermax pairs
that share a brand and a pack size, and split them into
  work/pairs_auto.json    - confident matches (same size + brand + very similar name)
  work/pairs_review.json  - plausible but uncertain pairs, to be judged by a person / AI
Stage 2 (judging) writes work/decisions.json; build_catalog.py then merges everything.

Usage: python3 scraper/match.py
Inputs: scraper/raw/lulu.json, scraper/raw/hypermax.json (exports from scraper/browser/*.js)
"""
import difflib, json, re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW, WORK = HERE / "raw", HERE / "work"

UNIT = {"kg": ("g", 1000), "kgs": ("g", 1000), "g": ("g", 1), "gm": ("g", 1), "gms": ("g", 1), "gr": ("g", 1),
        "gram": ("g", 1), "grams": ("g", 1), "l": ("ml", 1000), "ltr": ("ml", 1000), "ltrs": ("ml", 1000),
        "lt": ("ml", 1000), "litre": ("ml", 1000), "liter": ("ml", 1000), "litres": ("ml", 1000), "ml": ("ml", 1),
        "cl": ("ml", 10), "pcs": ("pc", 1), "pc": ("pc", 1), "pieces": ("pc", 1), "piece": ("pc", 1),
        "pack": ("pc", 1), "sachets": ("pc", 1), "bags": ("pc", 1), "bag": ("pc", 1), "teabags": ("pc", 1),
        "rolls": ("pc", 1), "sheets": ("pc", 1), "tablets": ("pc", 1), "capsules": ("pc", 1), "wipes": ("pc", 1)}
UNIT_RE = "|".join(sorted(UNIT, key=len, reverse=True))
SIZE_RE = re.compile(rf"(?<![\w.])(\d+(?:\.\d+)?)\s*({UNIT_RE})\b", re.I)
MULTI_RE = re.compile(rf"(?<![\w.])(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*({UNIT_RE})\b", re.I)
MULTI_REV_RE = re.compile(rf"(?<![\w.])(\d+(?:\.\d+)?)\s*({UNIT_RE})\s*[x×]\s*(\d+)\b", re.I)
NOISE = {"value", "pack", "of", "the", "and", "with", "for", "in", "per", "each", "fresh", "x", "pcs", "pc", "piece",
         "bottle", "bottled", "can", "tin", "pouch", "box", "jar", "new", "assorted", "ltr", "lt", "litre", "liter",
         "kg", "g", "gm", "gr", "ml", "l", "free", "combo", "bundle", "offer", "special"}


def sizes(text):
    """Return (kind, unit_size, count) tuples found in text. Multipacks give count>1."""
    t = text.lower().replace(",", "")
    out = []
    for m in MULTI_RE.finditer(t):
        k, mul = UNIT[m.group(3)]
        out.append((k, round(float(m.group(2)) * mul, 3), int(m.group(1))))
    for m in MULTI_REV_RE.finditer(t):
        k, mul = UNIT[m.group(2)]
        out.append((k, round(float(m.group(1)) * mul, 3), int(m.group(3))))
    if not out:
        for m in SIZE_RE.finditer(t):
            k, mul = UNIT[m.group(2)]
            out.append((k, round(float(m.group(1)) * mul, 3), 1))
    return out


def size_key(text):
    s = sizes(text)
    if not s:
        return None
    k, u, c = s[0]
    return (k, u, c)


def toks(name):
    t = re.sub(r"\(.*?\)", " ", name.lower())
    t = SIZE_RE.sub(" ", MULTI_RE.sub(" ", MULTI_REV_RE.sub(" ", t.replace(",", ""))))
    return [w for w in re.findall(r"[a-z0-9]+", t) if w not in NOISE and not w.isdigit()]


def brand(name):
    t = toks(name)
    return t[0] if t else ""


def prep(rows, size_from):
    out = []
    for r in rows:
        text = r["n"] + " " + (r.get(size_from) or "") if size_from else r["n"]
        t = toks(r["n"])
        out.append({**r, "_t": t, "_ts": set(t), "_k": size_key(text), "_b": brand(r["n"])})
    return out


def sim(a, b):
    j = len(a["_ts"] & b["_ts"]) / max(1, len(a["_ts"] | b["_ts"]))
    r = difflib.SequenceMatcher(None, " ".join(a["_t"]), " ".join(b["_t"])).ratio()
    return round(0.5 * j + 0.5 * r, 3)


def brand_ok(a, b):
    return bool(a["_b"]) and bool(b["_b"]) and (a["_b"] == b["_b"] or a["_b"] in b["_ts"] or b["_b"] in a["_ts"])


def main():
    lulu = prep(json.loads((RAW / "lulu.json").read_text(encoding="utf-8")), None)
    hyp = prep(json.loads((RAW / "hypermax.json").read_text(encoding="utf-8")), "s")
    by_key, by_brand = defaultdict(list), defaultdict(list)
    for i, l in enumerate(lulu):
        if l["_k"]:
            by_key[l["_k"]].append(i)
        by_brand[l["_b"]].append(i)
    cands = []
    for hi, h in enumerate(hyp):
        pool = set(by_key.get(h["_k"], [])) if h["_k"] else set(by_brand.get(h["_b"], []))
        for li in pool:
            l = lulu[li]
            if not brand_ok(h, l):
                continue
            s = sim(h, l)
            if h["_k"]:
                if s >= 0.3:
                    cands.append((s, hi, li, True))
            elif s >= 0.6:  # no pack size to confirm: demand a closer name
                cands.append((s, hi, li, False))
    cands.sort(reverse=True)
    usedh, usedl, auto, review = set(), set(), [], []
    for s, hi, li, sized in cands:
        if hi in usedh or li in usedl:
            continue
        pair = {"h": hyp[hi]["i"], "l": lulu[li]["i"], "score": s, "sized": sized,
                "hn": hyp[hi]["n"], "hs": hyp[hi].get("s", ""), "ln": lulu[li]["n"]}
        if (sized and s >= 0.62) or (not sized and s >= 0.85):
            auto.append(pair); usedh.add(hi); usedl.add(li)
        else:
            review.append(pair)
    # A review pair only matters if neither side got an automatic match.
    review = [p for p in review if p["h"] not in {a["h"] for a in auto} and p["l"] not in {a["l"] for a in auto}]
    seenh, seenl, rv = set(), set(), []
    for p in review:  # keep each product's best review candidate only
        if p["h"] in seenh or p["l"] in seenl:
            continue
        seenh.add(p["h"]); seenl.add(p["l"]); rv.append(p)
    WORK.mkdir(exist_ok=True)
    (WORK / "pairs_auto.json").write_text(json.dumps(auto, ensure_ascii=False), encoding="utf-8")
    (WORK / "pairs_review.json").write_text(json.dumps(rv, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"lulu {len(lulu)}  hypermax {len(hyp)}  auto {len(auto)}  to review {len(rv)}")


if __name__ == "__main__":
    main()
