#!/usr/bin/env python3
"""Round 3 candidate generator: looser, row-to-row matching with TF-IDF nearest neighbours.
Writes work/cand3.json: [{score, sized, a:[store,id], b:[store,id], an, bn, ap, bp}] for rows that share no shop.
Usage: python3 match_ai.py
"""
import json, re
from pathlib import Path
import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer
import match as M

HERE = Path(__file__).resolve().parent
RAW, WORK = HERE / "raw", HERE / "work"
STORES = ["lulu", "hypermax", "jazira", "megamart", "ramez"]


def clean(n):
    n = re.sub(r"(\d)\s*\*\s*(\d)", r"\1x\2", n.lower())
    n = re.sub(r"[^a-z0-9 .x]+", " ", n)
    n = re.sub(r"\b(gm|gms|gr|grams?)\b", "g", n)
    n = re.sub(r"\b(ltr|ltrs|lt|litre|liter)\b", "l", n)
    return re.sub(r"\s+", " ", n).strip()


def tot(k):
    return None if not k else (k[0], round(k[1] * k[2], 2))


def main():
    mem = json.loads((WORK / "membership.json").read_text())
    prod, row_of = [], {}
    for ri, m in enumerate(mem):
        for st, pid in m.items():
            row_of[(st, pid)] = ri
    for st in STORES:
        f = RAW / f"{st}.json"
        if not f.exists():
            continue
        for r in json.loads(f.read_text(encoding="utf-8")):
            if (st, r["i"]) not in row_of:
                continue
            text = r["n"] + (" " + r["s"] if st == "hypermax" and r.get("s") else "")
            k = M.size_key(re.sub(r"(\d)\s*\*\s*(\d)", r"\1x\2", text))
            prod.append(dict(st=st, id=r["i"], n=r["n"], p=r["p"], row=row_of[(st, r["i"])], k=k, c=clean(r["n"]), cat=r.get("c", "")))
    print(len(prod), "products")
    names = [p["c"] for p in prod]
    w = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1).fit_transform(names)
    c = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=2).fit_transform(names)
    X = sparse.hstack([w, c]).tocsr()
    from sklearn.preprocessing import normalize
    X = normalize(X)
    st_arr = np.array([STORES.index(p["st"]) for p in prod])
    row_arr = np.array([p["row"] for p in prod])
    rowstores = [set(STORES.index(s) for s in m) for m in mem]
    best = {}
    XT = X.T.tocsc()
    for s0 in range(0, len(prod), 1500):
        S = (X[s0:s0 + 1500] @ XT).toarray()
        for i in range(S.shape[0]):
            gi = s0 + i
            S[i, st_arr == st_arr[gi]] = 0          # other stores only
            S[i, row_arr == row_arr[gi]] = 0
            top = np.argpartition(-S[i], 6)[:6]
            for j in top:
                sc = float(S[i, j])
                if sc < 0.45:
                    continue
                a, b = prod[gi], prod[j]
                if rowstores[a["row"]] & rowstores[b["row"]]:
                    continue
                ka, kb = tot(a["k"]), tot(b["k"])
                if ka and kb and ka != kb:
                    continue
                key = tuple(sorted((a["row"], b["row"])))
                if key not in best or best[key][0] < sc:
                    best[key] = (sc, gi, int(j), bool(ka and kb))
    out = []
    for (ra, rb), (sc, i, j, sized) in best.items():
        a, b = prod[i], prod[j]
        out.append(dict(s=round(float(sc), 3), z=sized, a=[a["st"], a["id"]], b=[b["st"], b["id"]], an=a["n"], bn=b["n"], ap=a["p"], bp=b["p"]))
    out.sort(key=lambda d: -d["s"])
    (WORK / "cand3.json").write_text(json.dumps(out, ensure_ascii=False))
    import collections
    h = collections.Counter((int(d["s"] * 20) / 20, d["z"]) for d in out)
    for k in sorted(h): print(k, h[k])
    print(len(out), "candidates")


if __name__ == "__main__":
    main()
