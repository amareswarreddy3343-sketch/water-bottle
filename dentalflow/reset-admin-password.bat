@echo off
REM ============================================================
REM  iCare 32 - set a new password for any account (for example
REM  when the admin is locked out). Works without internet.
REM ============================================================
title iCare 32 - reset a password
cd /d "%~dp0"
call npm run reset-password --prefix backend
echo.
pause
