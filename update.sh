#!/usr/bin/env bash
# ONE command: crawl all five shops in Chrome, rebuild the catalog, publish.   ./update.sh
cd "$(dirname "$0")" && python3 scraper/update.py --crawl "$@"
