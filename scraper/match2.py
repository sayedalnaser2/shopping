#!/usr/bin/env python3
"""Another matching round (no AI, no network). Products already matched or already judged "not the same" are
left out, so products whose best candidate was rejected get a chance to find their next-best partner.
Writes work/round<N>_candidates.json for review; accepted pairs go into work/decisions.json.

Usage: python3 scraper/match2.py <round-number> [min-score]
"""
import json, sys
from collections import defaultdict
from pathlib import Path
import match as M

HERE = Path(__file__).resolve().parent
RAW, WORK = HERE / "raw", HERE / "work"


def load(p, default):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def main():
    rnd = sys.argv[1] if len(sys.argv) > 1 else "2"
    min_score = float(sys.argv[2]) if len(sys.argv) > 2 else 0.35
    lulu = M.prep(json.loads((RAW / "lulu.json").read_text(encoding="utf-8")), None)
    hyp = M.prep(json.loads((RAW / "hypermax.json").read_text(encoding="utf-8")), "s")
    auto = load(WORK / "pairs_auto.json", [])
    dec = load(WORK / "decisions.json", [])
    judged = load(WORK / "judged.json", [])  # every pair a reviewer has seen: [[h, l, ok], ...]
    matched = {(p["h"], p["l"]) for p in auto} | {(d["h"], d["l"]) for d in dec if d.get("ok")}
    usedh, usedl = {h for h, _ in matched}, {l for _, l in matched}
    rejected = {(h, l) for h, l, ok in judged if not ok}
    by_key, by_brand = defaultdict(list), defaultdict(list)
    for i, l in enumerate(lulu):
        if l["i"] in usedl:
            continue
        if l["_k"]:
            by_key[l["_k"]].append(i)
        by_brand[l["_b"]].append(i)
    cands = []
    for hi, h in enumerate(hyp):
        if h["i"] in usedh:
            continue
        pool = set(by_key.get(h["_k"], [])) | (set(by_brand.get(h["_b"], [])) if not h["_k"] else set())
        for li in pool:
            l = lulu[li]
            if (h["i"], l["i"]) in rejected or not M.brand_ok(h, l):
                continue
            if h["_k"] and l["_k"] and h["_k"] != l["_k"]:
                continue
            s = M.sim(h, l)
            if s >= (min_score if (h["_k"] and l["_k"]) else max(min_score, 0.55)):
                cands.append((s, hi, li))
    cands.sort(reverse=True)
    seenh, seenl, out = set(), set(), []
    for s, hi, li in cands:
        if hyp[hi]["i"] in seenh or lulu[li]["i"] in seenl:
            continue
        seenh.add(hyp[hi]["i"]); seenl.add(lulu[li]["i"])
        out.append({"h": hyp[hi]["i"], "l": lulu[li]["i"], "score": s, "hn": hyp[hi]["n"], "hs": hyp[hi].get("s", ""), "ln": lulu[li]["n"]})
    (WORK / f"round{rnd}_candidates.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"round {rnd}: {len(out)} candidates (min score {min_score})")


if __name__ == "__main__":
    main()
