@echo off
REM One-click wrapper: scrapes the "Manual only" vendors (Request A Test, True Health Labs) from THIS PC
REM into the live site. Just double-click. See scrape-blocked-vendors.ps1 for what it does.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scrape-blocked-vendors.ps1"
echo.
pause
