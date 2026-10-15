@echo off
REM ============================================================
REM  iCare 32 - start the app automatically when this PC starts
REM  Run once (right-click > "Run as administrator" also opens
REM  the firewall so phones on the Wi-Fi can connect).
REM ============================================================
cd /d "%~dp0"
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\iCare 32 Clinic.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Description='iCare 32 Dental Clinic server'; $s.Save()"
if errorlevel 1 (
  echo Could not create the start-up shortcut.
  pause
  exit /b 1
)
echo [OK] iCare 32 will start by itself (minimised) whenever this computer starts.

REM Let phones and other computers on the clinic Wi-Fi reach port 8000
netsh advfirewall firewall show rule name="iCare 32 Clinic" >nul 2>nul
if errorlevel 1 (
  netsh advfirewall firewall add rule name="iCare 32 Clinic" dir=in action=allow protocol=TCP localport=8000 profile=private,domain >nul 2>nul
  if errorlevel 1 (
    echo [!] Could not open the firewall. Right-click this file and choose "Run as administrator",
    echo     or allow Node.js when Windows asks the first time the app starts.
  ) else (
    echo [OK] Firewall opened for port 8000 on private networks.
  )
) else (
  echo [OK] Firewall rule already present.
)

echo.
echo Also check, once:
echo   - Settings ^> Network ^> your Wi-Fi ^> Network profile = Private
echo   - Settings ^> System ^> Power ^> Sleep = Never (when plugged in)
echo   - In the Wi-Fi router, reserve a fixed IP address for this computer
echo.
set /p START_NOW=Start iCare 32 now? (Y/N) 
if /i "%START_NOW%"=="Y" start "iCare 32 Clinic server" /min "%~dp0start.bat"
pause
