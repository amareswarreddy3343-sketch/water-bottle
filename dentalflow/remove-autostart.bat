@echo off
REM  iCare 32 - stop starting the app automatically with Windows (data is not touched)
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\iCare 32 Clinic.lnk" >nul 2>nul
echo iCare 32 will no longer start by itself. Your data is not changed.
pause
