#!/usr/bin/env python3
"""Match one extra store (jazira, megamart, ramez) against the products already in the catalog
(Lulu, Hypermax and any earlier extra stores). No AI, no network.
Writes work/pairs_<store>.json (confident) and work/review_<store>.json (uncertain, for a reviewer).
Usage: python3 scraper/match_extra.py jazira
"""
import json, sys
from collections import defaultdict
from pathlib import Path
import match as M

HERE = Path(__file__).resolve().parent
RAW, WORK = HERE / "raw", HERE / "work"
ORDER = ["lulu", "hypermax", "jazira", "megamart", "ramez"]
AUTO_SIZED, AUTO_UNSIZED, MIN_REVIEW = 0.8, 0.9, 0.55


def load(p, default=None):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def norm(rows):
    """Read '4*68GM' as '4x68GM' (only for matching; the shown name is untouched)."""
    import re
    return [{**r, "n": re.sub(r"(\d)\s*\*\s*(\d)", r"\1x\2", r["n"])} for r in rows]


def main():
    store = sys.argv[1]
    mine = M.prep(norm(load(RAW / f"{store}.json")), None)
    anchors = []
    for s in ORDER[:ORDER.index(store)]:
        rows = load(RAW / f"{s}.json")
        if rows is None:
            continue
        for r in M.prep(norm(rows), "s" if s == "hypermax" else None):
            r["_s"] = s
            anchors.append(r)
    taken = set()  # anchors already paired with this store in an earlier auto run are not reused
    by_key, by_brand = defaultdict(list), defaultdict(list)
    for i, a in enumerate(anchors):
        if a["_k"]:
            by_key[a["_k"]].append(i)
        by_brand[a["_b"]].append(i)
    cands = []
    for mi, m in enumerate(mine):
        pool = set(by_key.get(m["_k"], [])) if m["_k"] else set(by_brand.get(m["_b"], []))
        for ai in pool:
            a = anchors[ai]
            if not M.brand_ok(m, a):
                continue
            s = M.sim(m, a)
            if s >= (MIN_REVIEW if m["_k"] else 0.7):
                cands.append((s, mi, ai, bool(m["_k"])))
    cands.sort(reverse=True)
    usedm, useda, auto, review = set(), set(), [], []
    for s, mi, ai, sized in cands:
        if mi in usedm or ai in useda:
            continue
        a = anchors[ai]
        pair = {"x": mine[mi]["i"], "s": a["_s"], "a": a["i"], "score": s, "sized": sized,
                "xn": mine[mi]["n"], "an": a["n"]}
        if s >= (AUTO_SIZED if sized else AUTO_UNSIZED):
            auto.append(pair); usedm.add(mi); useda.add(ai)
        else:
            review.append(pair)
    ids = {(p["s"], p["a"]) for p in auto}; xs = {p["x"] for p in auto}
    seen, rv = set(), []
    for p in review:
        if p["x"] in xs or (p["s"], p["a"]) in ids or p["x"] in seen:
            continue
        seen.add(p["x"]); rv.append(p)
    WORK.mkdir(exist_ok=True)
    (WORK / f"pairs_{store}.json").write_text(json.dumps(auto, ensure_ascii=False), encoding="utf-8")
    (WORK / f"review_{store}.json").write_text(json.dumps(rv, ensure_ascii=False), encoding="utf-8")
    print(f"{store}: {len(mine)} products, auto {len(auto)}, review {len(rv)}")


if __name__ == "__main__":
    main()
