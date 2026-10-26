#!/usr/bin/env bash
# One-click price update for Mac/Linux.
set -e
cd "$(dirname "$0")"
git pull
python3 scraper/scrape.py --stores ramez,jazira,megamart
git add -A
git commit -m "update prices" || echo "nothing new to save"
git push
echo "Done. Open index.html to see the new prices."
