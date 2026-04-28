@echo off
REM NEXUS Cookie Extraction Command
REM Usage: extract-cookies
REM This script closes Chrome gracefully and extracts cookies

setlocal enabledelayedexpansion

echo [*] NEXUS Cookie Extractor
echo [*] Closing Chrome gracefully...

taskkill /IM chrome.exe /T /FI "STATUS eq RUNNING" >nul 2>&1

echo [*] Waiting 2 seconds for disk flush...
timeout /t 2 /nobreak >nul 2>&1

taskkill /F /IM chrome.exe >nul 2>&1

echo [*] Running extraction...
python "%~dp0cookie_extractor.py"

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] Cookies extracted! Check output above.
) else (
    echo.
    echo [ERROR] Extraction failed. Check Chrome is closed.
)

endlocal
