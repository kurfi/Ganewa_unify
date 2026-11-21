@echo off
title Ganewa POS - Uninstall Silent Print Bridge
color 0C

echo =====================================================================
echo         GANEWA POS - REMOVE SILENT PRINT BRIDGE
echo =====================================================================
echo.

set "INSTALL_DIR=%APPDATA%\GanewaPrintBridge"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo [*] Stopping running bridge...
taskkill /F /IM GanewaPrintBridge.exe 2>nul

echo [*] Removing from Windows Startup...
del /F /Q "%STARTUP_DIR%\GanewaPrintBridge.vbs" 2>nul

echo [*] Removing application files...
rd /S /Q "%INSTALL_DIR%" 2>nul

echo.
echo =====================================================================
echo  [DONE] Ganewa Print Bridge has been completely removed.
echo =====================================================================
echo.
pause
