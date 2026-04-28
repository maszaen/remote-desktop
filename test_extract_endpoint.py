#!/usr/bin/env python3
"""Test the quick extract endpoint"""

import requests
import json
import time
import subprocess
import os

# Make sure Python is in PATH
python_exe = os.sys.executable

# Start server
print("Starting server...")
server_proc = subprocess.Popen(
    [python_exe, "main.py"],
    cwd=r"d:\Maszaen\server-tray-app",
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

time.sleep(3)

try:
    print("\nTesting /cookies/extract-live endpoint...")
    print("(Note: This will close Chrome and extract cookies)\n")
    
    # Test endpoint
    resp = requests.get("http://localhost:8000/cookies/extract-live", params={"pin": "0000"})
    
    print(f"Status: {resp.status_code}")
    result = resp.json()
    
    print(f"\nResponse:")
    print(json.dumps(result, indent=2))
    
    if result.get("status") == "success":
        print(f"\n✅ SUCCESS! Found {result['cookie_count']} cookies")
        print(f"\nFirst 200 chars of JS code:")
        print(result['js_code'][:200] + "...")
    else:
        print(f"\n⚠️  {result.get('status', 'unknown')}: {result.get('error', 'Unknown error')}")

finally:
    print("\n\nStopping server...")
    server_proc.terminate()
    try:
        server_proc.wait(timeout=3)
    except:
        server_proc.kill()
