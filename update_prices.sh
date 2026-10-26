#!/usr/bin/env bash
# One-click price download for Mac/Linux. No git account needed.
cd "$(dirname "$0")"
python3 scraper/scrape.py --stores ramez,jazira,megamart && echo "Done. Prices saved to prices.js - open index.html"
