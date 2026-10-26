@echo off
REM One-click price download. No git account or email needed.
cd /d "%~dp0"
echo === Collecting prices (Ramez, Al Jazira, Megamart) - takes several minutes ===
python scraper/scrape.py --stores ramez,jazira,megamart
if errorlevel 1 (
  echo The price bot failed - see the message above.
  pause
  exit /b 1
)
echo.
echo Done. Prices saved to prices.js - opening the website...
start "" index.html
pause
