#!/usr/bin/env python3
"""Test that the updated server can start and API works"""

import requests
import time
import subprocess
import os

# Start server in background
print("Starting server...")
server_process = subprocess.Popen(
    ["python", "main.py"],
    cwd=r"d:\Maszaen\server-tray-app",
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

# Wait for server to start
time.sleep(3)

try:
    # Test endpoint
    print("Testing /status endpoint...")
    resp = requests.get("http://localhost:8000/status")
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.json()}")
    
    print("\n✅ Server is running correctly!")
    
finally:
    # Kill server
    print("\nStopping server...")
    server_process.terminate()
    server_process.wait(timeout=5)
