@echo off
REM One-click price update: pull latest code, collect prices from the bot-friendly stores, publish.
cd /d "%~dp0"
echo === 1/4 Getting latest code ===
git pull
echo.
echo === 2/4 Collecting prices (Ramez, Al Jazira, Megamart) - takes several minutes ===
python scraper/scrape.py --stores ramez,jazira,megamart
if errorlevel 1 (
  echo The price bot failed - see the message above.
  pause
  exit /b 1
)
echo.
echo === 3/4 Saving ===
git add -A
git commit -m "update prices"
echo.
echo === 4/4 Publishing ===
git push
echo.
echo Done. Open index.html to see the new prices.
pause
