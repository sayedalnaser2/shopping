@echo off
rem ONE-CLICK UPDATE for all five shops. This single file is enough: put it anywhere and double-click it.
rem It downloads the project the first time, opens Chrome, crawls Lulu, Hypermax, Megamart, Al Jazira and Ramez,
rem rebuilds the price data and publishes the website update. Takes about 2 hours - leave the Chrome window open.
setlocal
set "REPO=https://github.com/sayedalnaser2/shopping.git"
set "BRANCH=claude/dreamy-rubin-guxehl"
set "DIR=%~dp0shopping"

where git >nul 2>nul
if errorlevel 1 (
  echo Git is missing. Install it from https://git-scm.com/download/win then double-click this file again.
  pause & exit /b 1
)
where py >nul 2>nul
if errorlevel 1 (
  echo Python is missing. Install it from https://www.python.org/downloads/ and tick Add Python to PATH, then run this again.
  pause & exit /b 1
)

if not exist "%DIR%\.git" git clone --branch %BRANCH% %REPO% "%DIR%"
if errorlevel 1 ( echo Could not download the project. & pause & exit /b 1 )
cd /d "%DIR%"
git checkout %BRANCH%
git pull --rebase

py scraper\update.py --crawl
echo.
echo Finished. If the last line says pushed, the website now has the new prices.
pause
