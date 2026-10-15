@echo off
REM ============================================================
REM  iCare 32 Dental Clinic - start the app on this computer
REM  Double-click this file. The first run installs everything.
REM  Phones and computers on the clinic Wi-Fi then open the
REM  address shown below (http://THIS-PC-IP:8000).
REM  Keep this window open (it can be minimised).
REM ============================================================
title iCare 32 Clinic server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo Installing server packages...
  call npm install --prefix backend || goto :error
)
if not exist "frontend\node_modules" (
  echo Installing app packages...
  call npm install --prefix frontend --include=dev || goto :error
)

echo Building the app...
call npm run build --prefix frontend || goto :error

:run
echo Starting iCare 32...
call npm run start:prod --prefix backend
echo.
echo The server stopped. It will start again in 10 seconds.
echo (Close this window to stop it for good.)
timeout /t 10 /nobreak >nul
goto :run

:error
echo.
echo Something went wrong - see the messages above.
pause
exit /b 1
