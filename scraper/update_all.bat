@echo off
rem Crawl all five shops in Chrome, then rebuild and publish the catalog. Run from the repository folder.
cd /d "%~dp0\.."
py -m pip install --quiet playwright
py scraper\crawl_all.py %*
py scraper\update.py
pause
