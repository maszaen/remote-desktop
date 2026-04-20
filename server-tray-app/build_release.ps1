param(
    [switch]$OneDir,
    [switch]$NoClean
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not $NoClean) {
    if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
}

$pythonCmd = "python"
if (Test-Path "..\.venv\Scripts\python.exe") {
    $pythonCmd = "..\.venv\Scripts\python.exe"
}

& $pythonCmd -m pip install -r requirements.txt

$specFile = "NexusServer.spec"
if ($OneDir) {
    $specFile = "NexusServer_PC.spec"
}

& $pythonCmd -m PyInstaller --noconfirm $specFile

if (-not $OneDir) {
    $releaseDir = Join-Path $projectRoot "release"
    if (-not (Test-Path $releaseDir)) {
        New-Item -ItemType Directory -Path $releaseDir | Out-Null
    }

    $zipPath = Join-Path $releaseDir "NexusServer_portable.zip"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }

    Compress-Archive -Path "dist\NexusServer.exe" -DestinationPath $zipPath -Force
    Write-Host "Portable package created:" $zipPath
    Write-Host "Share this file with end users (no Python installation required)."
} else {
    Write-Host "OneDir build completed in dist\\NexusServer_PC"
    Write-Host "Important: distribute the entire folder, not only NexusServer_PC.exe"
}
