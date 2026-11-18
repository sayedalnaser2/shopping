#!/usr/bin/env python3
"""One command to refresh ALL shop data: merge the new crawl files, re-match products, rebuild catalog.js, check search, commit and push.

Crawl files come from scraper/browser/*.js (run by crawl_all.py, or pasted in Chrome's console by hand). This script looks for
  <store>*.json  (lulu, hypermax, jazira, megamart, ramez)  in  scraper/incoming/  and  your Downloads folder
and uses every file that is newer than the store's current data (several Hypermax files, e.g. food + non-food, are merged).

 - New rows replace old ones with the same product id. Products the crawl did NOT return are kept as "last known" (price from the
   last crawl that saw them) for --keep-days days (default 60), then dropped, so delisted products disappear eventually.
 - Nothing is invented: a price only comes from a shop page.
Usage:  python3 scraper/update.py [--from DIR ...] [--keep-days 60] [--rebuild] [--no-push] [--no-commit]
"""
import argparse, json, os, shutil, subprocess, sys, time
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RAW, WORK, INCOMING = HERE / "raw", HERE / "work", HERE / "incoming"
STORES = ["lulu", "hypermax", "jazira", "megamart", "ramez"]
MIN_OK = {"lulu": 15000, "hypermax": 15000, "jazira": 10000, "megamart": 8000, "ramez": 12000}   # fewer than this = probably a partial crawl
TODAY = date.today().isoformat()


def sh(cmd, **kw):
    print("  $", " ".join(map(str, cmd)))
    return subprocess.run(cmd, cwd=kw.pop("cwd", HERE), **kw)


def good(r):
    return isinstance(r, dict) and r.get("i") not in (None, "") and r.get("n") and isinstance(r.get("p"), (int, float)) and r["p"] > 0


def candidates(store, dirs, newer_than):
    out = []
    for d in dirs:
        if not d.is_dir():
            continue
        for f in d.iterdir():
            n = f.name.lower()
            if f.suffix == ".json" and n.startswith(store) and "image" not in n and f.stat().st_mtime > newer_than:
                out.append(f)
    return sorted(out, key=lambda f: f.stat().st_mtime)


def ingest(store, dirs, keep_days):
    path = RAW / f"{store}.json"
    old, old_t = ([], 0)
    if path.exists():
        old, old_t = json.load(open(path)), path.stat().st_mtime
    files = candidates(store, dirs, old_t)
    if not files:
        return False
    fresh = {}
    for f in files:
        try:
            rows = json.load(open(f))
        except Exception as e:
            print(f"  skip {f.name}: not valid JSON ({e})"); continue
        ok = [r for r in rows if good(r)] if isinstance(rows, list) else []
        print(f"  {f.name}: {len(ok):,} usable rows of {len(rows) if isinstance(rows, list) else 0:,}")
        for r in ok:
            fresh[str(r["i"])] = r
    if not fresh:
        return False
    for r in fresh.values():
        r["ls"] = TODAY
    old_day = datetime.fromtimestamp(old_t).date().isoformat() if old_t else TODAY
    kept = dropped = 0
    for r in old:
        k = str(r["i"])
        if k in fresh:
            continue
        ls = r.get("ls") or old_day
        if (date.today() - date.fromisoformat(ls)).days <= keep_days:
            r["ls"] = ls; fresh[k] = r; kept += 1
        else:
            dropped += 1
    n_new = sum(1 for r in fresh.values() if r["ls"] == TODAY)
    print(f"  {store}: {n_new:,} fresh + {kept:,} last-known kept, {dropped:,} too old dropped -> {len(fresh):,}")
    if n_new < MIN_OK[store]:
        print(f"  WARNING: only {n_new:,} fresh {store} products (a full crawl is usually {MIN_OK[store]:,}+). The rest are old prices.")
    RAW.mkdir(exist_ok=True)
    if path.exists():
        (RAW / "backup").mkdir(exist_ok=True)
        shutil.copy2(path, RAW / "backup" / f"{store}_{date.fromtimestamp(old_t).isoformat()}.json")
        for b in sorted((RAW / "backup").glob(f"{store}_*.json"))[:-3]:
            b.unlink()
    json.dump(list(fresh.values()), open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    return True


def reviewed_accepts():
    """Pairs a reviewer already accepted for Al Jazira / Ramez (work/rv_*.json minus the rejected indexes). Re-added after every rematch."""
    for st, pre in (("jazira", "rvj"), ("ramez", "rvr")):
        rvf = WORK / f"rv_{st}.json"
        if not rvf.exists():
            continue
        rv = json.load(open(rvf)); cs = -(-len(rv) // 4); rej = set()
        for k in range(4):
            f = WORK / f"{pre}_rej_{k}.txt"
            if f.exists():
                rej |= {k * cs + int(x) for x in f.read_text().strip().split(",") if x.strip()}
        af = WORK / f"extra_accept_{st}.json"
        cur = json.load(open(af)) if af.exists() else []
        seen = {(p["x"], p["s"], p["a"]) for p in cur}
        add = [{"x": p["x"], "s": p["s"], "a": p["a"]} for i, p in enumerate(rv) if i not in rej and (p["x"], p["s"], p["a"]) not in seen]
        json.dump(cur + add, open(af, "w"))
        print(f"  {st}: +{len(add)} reviewed matches re-added")


def rebuild():
    py = sys.executable
    for step in ([py, "match.py"],) + tuple(x for s in ("jazira", "megamart", "ramez") for x in ([py, "match_extra.py", s], [py, "accept_extra.py", s])):
        if sh(step).returncode:
            sys.exit("step failed: " + " ".join(step))
    reviewed_accepts()
    if sh([py, "build_catalog.py"]).returncode:
        sys.exit("build_catalog.py failed")
    if shutil.which("node"):
        if sh(["node", "search_check.js"]).returncode:
            print("  WARNING: search checks failed - look at the output above before publishing")


def git_publish(msg, push):
    if not (ROOT / ".git").exists():
        print("not a git checkout - catalog.js is rebuilt but nothing was committed"); return
    sh(["git", "add", "catalog.js", "scraper/work"], cwd=ROOT)
    if sh(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
        print("nothing changed"); return
    sh(["git", "commit", "-q", "-m", msg], cwd=ROOT)
    if push:
        sh(["git", "pull", "--rebase", "-q"], cwd=ROOT)
        for attempt in range(3):          # GitHub sometimes answers 500; wait and retry
            if sh(["git", "push", "-q"], cwd=ROOT).returncode == 0:
                print("pushed"); return
            time.sleep(15)
        print("push failed 3 times - run `git push` later")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="dirs", action="append", help="folder with crawl files (repeatable). Default: scraper/incoming and ~/Downloads")
    ap.add_argument("--keep-days", type=int, default=60)
    ap.add_argument("--rebuild", action="store_true", help="rematch and rebuild even if there are no new crawl files")
    ap.add_argument("--no-commit", action="store_true")
    ap.add_argument("--no-push", action="store_true")
    a = ap.parse_args()
    dirs = [Path(d).expanduser() for d in a.dirs] if a.dirs else [INCOMING, Path.home() / "Downloads"]
    print("looking in:", ", ".join(map(str, dirs)))
    changed = [s for s in STORES if (print(f"[{s}]"), ingest(s, dirs, a.keep_days))[1]]
    if not changed and not a.rebuild:
        sys.exit("no new crawl files found (newer than the current data). Run crawl_all.py first, or pass --from <folder>.")
    print("updated:", ", ".join(changed) or "none (rebuild only)")
    rebuild()
    if not a.no_commit:
        git_publish(f"Update prices {TODAY}: refreshed " + (", ".join(changed) or "matching only"), not a.no_push)


if __name__ == "__main__":
    main()
