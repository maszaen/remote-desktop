# Nexus Server Packaging Guide

## Goal
Build a Windows executable that can run on a machine without Python installed.

## Recommended Distribution
Use the one-file artifact:
- dist/NexusServer.exe

This is the safest option for demos/presentations because users only run one file.

## Build Commands
From server-tray-app:

1. One-file portable (recommended)
- powershell -ExecutionPolicy Bypass -File .\build_release.ps1

2. One-dir build (advanced)
- powershell -ExecutionPolicy Bypass -File .\build_release.ps1 -OneDir

## Important Notes
- If using one-dir, you must ship the full folder dist/NexusServer_PC.
- Do not send only NexusServer_PC.exe from that folder.
- Startup registration is per-user in registry key:
  HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\NexusServer

## Pre-release Test Checklist
1. Test on a clean Windows user profile.
2. Double-click the exe and confirm tray icon appears.
3. Open Pair New Device (QR) and verify QR window appears.
4. Reboot and confirm startup launches expected version.
5. If startup points to old exe, disable and re-enable Run on Windows Startup from tray.

## Troubleshooting
- Exe opens then closes immediately:
  - Check for file nexus_server_error.log near the exe.
  - Check Windows SmartScreen prompt and allow run if needed.
- Port 8000 already in use:
  - Close old Nexus process or any app using port 8000.
- Missing runtime components on very old Windows:
  - Install Microsoft Visual C++ Redistributable 2015-2022 (x64).
