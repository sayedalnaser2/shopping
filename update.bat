@echo off
rem ONE command: crawl all five shops in Chrome, rebuild the catalog, publish. Double-click or type: update
cd /d "%~dp0"
py scraper\update.py --crawl %*
pause
