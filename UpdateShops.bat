@echo off
rem ONE-CLICK UPDATE for all five shops. This single file is enough: put it anywhere and double-click it.
rem It keeps its own copy of the project in  %USERPROFILE%\ShopCompare  (your other folders are never touched),
rem opens Chrome, crawls Lulu, Hypermax, Megamart, Al Jazira and Ramez, rebuilds the data and publishes the update.
rem Takes about 2 hours - leave the Chrome window open. A log is saved to  %USERPROFILE%\ShopCompare-log.txt
setlocal
set "REPO=https://github.com/sayedalnaser2/shopping.git"
set "BRANCH=claude/dreamy-rubin-guxehl"
set "DIR=%USERPROFILE%\ShopCompare"
set "LOG=%USERPROFILE%\ShopCompare-log.txt"

where git >nul 2>nul
if errorlevel 1 (
  echo Git is missing. Install it from https://git-scm.com/download/win then double-click this file again.
  pause
  exit /b 1
)
where py >nul 2>nul
if errorlevel 1 (
  echo Python is missing. Install it from https://www.python.org/downloads/ and tick Add Python to PATH, then run this again.
  pause
  exit /b 1
)

if not exist "%DIR%\.git" (
  echo Downloading the project to %DIR% ...
  git clone %REPO% "%DIR%"
  if errorlevel 1 (
    echo Could not download the project. Check the internet connection and that Git is signed in to GitHub.
    pause
    exit /b 1
  )
)
cd /d "%DIR%"
git fetch origin %BRANCH%
if errorlevel 1 (
  echo Could not reach GitHub. Check the internet connection and that Git is signed in to GitHub.
  pause
  exit /b 1
)
rem Always start from the newest published scripts. Crawled data is not tracked by git, so it is kept.
git checkout -B %BRANCH% origin/%BRANCH%
git reset --hard origin/%BRANCH%

if not exist "scraper\update.py" (
  echo The project folder does not contain scraper\update.py - please send me this window.
  pause
  exit /b 1
)

echo.
echo Starting. Chrome will open - do not close it. Output is also saved to %LOG%
py -u scraper\update.py --crawl 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%LOG%'"
echo.
echo Finished. If the last lines say pushed, the website now has the new prices.
pause
