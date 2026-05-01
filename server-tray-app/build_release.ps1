param(
    [switch]$OneDir,
    [switch]$NoClean
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not $NoClean) {
    # 1. Matikan proses jika masih berjalan di background
    Stop-Process -Name "NexusServer", "NexusServer_PC" -Force -ErrorAction SilentlyContinue
    
    # 2. Beri jeda 1 detik agar Windows PnP/File System merilis lock sepenuhnya
    Start-Sleep -Seconds 1 

    # 3. Bersihkan direktori
    if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
}

$pythonCmd = "python"
if (Test-Path "..\.venv\Scripts\python.exe") {
    $pythonCmd = "..\.venv\Scripts\python.exe"
}

& $pythonCmd -m pip install -r requirements.txt

# --- MODIFIKASI: Build dinamis dari main.py ---
$appName = "NexusServer"
if ($OneDir) {
    $appName = "NexusServer_PC"
}

# Kumpulkan argumen PyInstaller ke dalam array, wajib include vgamepad
$pyiArgs = @(
    "--noconfirm",
    "--name=$appName",
    "--noconsole",
    "--collect-all=vgamepad"
)

# Amankan file icon & resource agar tidak hilang saat build
if (Test-Path "favicon.png") {
    $pyiArgs += "--add-data=favicon.png;."
    $pyiArgs += "--icon=favicon.png"
}

if ($OneDir) {
    $pyiArgs += "--onedir"
} else {
    $pyiArgs += "--onefile"
}

$pyiArgs += "main.py"

# Eksekusi PyInstaller menggunakan array argumen dinamis
& $pythonCmd -m PyInstaller $pyiArgs
# -----------------------------------------------

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
    Write-Host "OneDir build completed in dist\NexusServer_PC"
    Write-Host "Important: distribute the entire folder, not only NexusServer_PC.exe"
}