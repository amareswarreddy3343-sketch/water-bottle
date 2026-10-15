@echo off
REM ============================================================
REM  iCare 32 - restore data from a backup file
REM  Drag a backup file (icare32-backup-....jsonl.gz) onto this file.
REM  The data as it is now is backed up first, so this can be undone.
REM ============================================================
title iCare 32 - restore
cd /d "%~dp0"
if "%~1"=="" (
  echo Drag a backup file ^(icare32-backup-....jsonl.gz^) onto this file.
  echo Backups are in backend\data\backups, or the BACKUP_DIR folder set in backend\.env
  pause
  exit /b 1
)
echo Close the iCare 32 server window first, so nobody changes data during the restore.
echo.
call npm run restore --prefix backend -- "%~1" || goto :error
echo.
set /p OK=Type YES to replace the current data with this backup: 
if not "%OK%"=="YES" (
  echo Nothing changed.
  pause
  exit /b 0
)
call npm run restore --prefix backend -- "%~1" --yes || goto :error
echo.
echo Done. Start iCare 32 again with start.bat
pause
exit /b 0

:error
echo.
echo The restore did not finish - see the messages above. Nothing was replaced unless it says so.
pause
exit /b 1
