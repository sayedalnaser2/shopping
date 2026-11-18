#!/usr/bin/env bash
# Crawl all five shops in Chrome, then rebuild and publish the catalog. Run from anywhere inside the repository.
cd "$(dirname "$0")/.." || exit 1
python3 -m pip install --quiet playwright
python3 scraper/crawl_all.py "$@" && python3 scraper/update.py
