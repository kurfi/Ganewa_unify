@echo off
title Ganewa POS - Silent Print Bridge Setup
color 0A

echo =====================================================================
echo           GANEWA POS - 1-CLICK SILENT PRINTING INSTALLER
echo =====================================================================
echo.

set "INSTALL_DIR=%APPDATA%\GanewaPrintBridge"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo [*] Closing any existing bridge instances...
taskkill /F /IM GanewaPrintBridge.exe 2>nul

echo [*] Setting up application directory: %INSTALL_DIR%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [*] Copying print bridge executable...
copy /Y "%~dp0GanewaPrintBridge.exe" "%INSTALL_DIR%\GanewaPrintBridge.exe" >nul

echo [*] Configuring Windows Auto-Start...
set "VBS_FILE=%STARTUP_DIR%\GanewaPrintBridge.vbs"
(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo WshShell.Run """%INSTALL_DIR%\GanewaPrintBridge.exe""", 0, False
) > "%VBS_FILE%"

echo [*] Starting Ganewa Print Bridge in the background...
start "" "%INSTALL_DIR%\GanewaPrintBridge.exe"

timeout /t 2 /nobreak >nul

echo.
echo =====================================================================
echo  [SUCCESS] Ganewa Print Bridge is installed and running!
echo =====================================================================
echo.
echo  - Runs 100%% silently in the background on port 9123.
echo  - Auto-starts automatically whenever this computer boots up.
echo  - No Node.js required.
echo  - Receipts will now print directly with ZERO print dialogs!
echo.
pause
