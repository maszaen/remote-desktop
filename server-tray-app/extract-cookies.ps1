#!/usr/bin/env pwsh
<#
.SYNOPSIS
NEXUS Cookie Extraction - Extract cookies from Chrome while staying logged in

.DESCRIPTION
Closes Chrome gracefully, extracts cookies from Extension Cookies database,
and outputs injectable JavaScript code.

.USAGE
From Nexus Terminal: extract-cookies
Or: python "$PSScriptRoot\cookie_extractor.py"
#>

Write-Host "[*] NEXUS Cookie Extractor" -ForegroundColor Cyan
Write-Host "[*] Step 1: Closing Chrome gracefully..." -ForegroundColor Yellow

# Graceful close
taskkill /IM chrome.exe /T /FI "STATUS eq RUNNING" *>$null

Write-Host "[*] Step 2: Waiting 2 seconds for cookies to flush..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Force kill if still running
$chromeRunning = tasklist | Select-String "chrome.exe"
if ($chromeRunning) {
    Write-Host "[*] Chrome still running, force closing..." -ForegroundColor Yellow
    taskkill /F /IM chrome.exe *>$null
    Start-Sleep -Seconds 1
}

Write-Host "[*] Step 3: Extracting cookies..." -ForegroundColor Yellow
Write-Host ""

# Run extraction
python "$PSScriptRoot\cookie_extractor.py"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[SUCCESS] Cookies extracted! " -ForegroundColor Green
    Write-Host "Use the javascript code above to inject into your lab site." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ERROR] Extraction failed." -ForegroundColor Red
    Write-Host "Make sure you:" -ForegroundColor Yellow
    Write-Host "  1. Logged into the website in Chrome" -ForegroundColor Yellow
    Write-Host "  2. Waited for the page to fully load" -ForegroundColor Yellow
    Write-Host "  3. Chrome was properly closed" -ForegroundColor Yellow
}
