@echo off
REM  iCare 32 - back up all data and uploaded files now (works while the app is running)
title iCare 32 - backup
cd /d "%~dp0"
call npm run backup --prefix backend
echo.
pause
