@echo off
setlocal
cd /d "%~dp0"
title LinkMap
where python >nul 2>nul
if %errorlevel%==0 (
  echo LinkMap is starting with Python ... (close this window to stop)
  python serve.py
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  echo LinkMap is starting with Python launcher ... (close this window to stop)
  py -3 serve.py
  goto :eof
)
where node >nul 2>nul
if %errorlevel%==0 (
  echo LinkMap is starting with Node.js ... (close this window to stop)
  node serve.js
  goto :eof
)
echo Python or Node.js was not found. Please install Python 3 (python.org) then run this file again.
echo Alternatively open index.html with a local web server.
pause
