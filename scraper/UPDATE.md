# Updating all shop data

On the computer that has Chrome (Windows: double-click `scraper/update_all.bat`; Mac/Linux: `scraper/update_all.sh`):

1. **`crawl_all.py`** opens Chrome, visits Lulu, Hypermax, Megamart, Al Jazira and Ramez one after another and runs each shop's
   crawl script from `scraper/browser/`. Results go to `scraper/incoming/<shop>.json`. Leave the window visible (about 1.5–2 h in total).
   One shop only: `python scraper/crawl_all.py lulu`. If a shop shows a "verify you are human" page, tick it yourself.
2. **`update.py`** takes every crawl file newer than the current data (from `scraper/incoming/` and your Downloads folder), merges it
   (new rows replace old ones; products a crawl missed stay as "last known" for 60 days), re-matches the same product across shops,
   rebuilds `catalog.js`, runs the 25 search checks, then commits and pushes. About 3 minutes.
   Options: `--from <folder>`, `--keep-days N`, `--rebuild` (rematch without new files), `--no-push`, `--no-commit`.

Crawl by hand instead: paste a script from `scraper/browser/` into Chrome's console on the shop's site, then run `update.py`.
Needs Python 3, Node (optional, for the checks) and `pip install playwright`.
