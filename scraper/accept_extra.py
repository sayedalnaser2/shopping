#!/usr/bin/env python3
"""Strict automatic filter for the uncertain pairs of an extra store (no AI). Keeps a pair only if the score is
>= 0.7, promo wording matches on both sides (2+1 free etc.) and neither side has a distinguishing word the other
lacks (flavour, colour, variant). Prefers missing a match to making a wrong one.
Usage: python3 scraper/accept_extra.py ramez   -> work/extra_accept_<store>.json"""
import json, re, sys, difflib
from pathlib import Path
import match as M
W = Path(__file__).resolve().parent / "work"
store = sys.argv[1]
promo = re.compile(r"\d\s*\+\s*\d|free|offer|special|pack of|@", re.I)
def conflict(p):
    ta, tb = set(M.toks(p["xn"])), set(M.toks(p["an"]))
    ua = [w for w in ta - tb if len(w) > 3]; ub = [w for w in tb - ta if len(w) > 3]
    return bool(ua and ub and any(max(difflib.SequenceMatcher(None, w, v).ratio() for v in ub) < 0.8 for w in ua))
r = json.load(open(W / f"review_{store}.json"))
acc = [p for p in r if p["sized"] and p["score"] >= 0.7 and bool(promo.search(p["xn"])) == bool(promo.search(p["an"])) and not conflict(p)]
json.dump([{"x": p["x"], "s": p["s"], "a": p["a"]} for p in acc], open(W / f"extra_accept_{store}.json", "w"))
print(store, "accepted", len(acc), "of", len(r))
