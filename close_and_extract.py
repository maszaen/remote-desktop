#!/usr/bin/env python3
"""Properly close Chrome and extract cookies"""

import os
import subprocess
import time
import signal

print("🔴 Step 1: Closing Chrome gracefully...")
print("-" * 50)

# Try graceful close first
try:
    # Send SIGTERM (graceful shutdown signal)
    result = subprocess.run(
        ['taskkill', '/IM', 'chrome.exe', '/T'],
        capture_output=True,
        text=True,
        timeout=5
    )
    print(f"Close signal sent: {result.stdout if result.stdout else 'OK'}")
except Exception as e:
    print(f"Error: {e}")

print("\n⏳ Waiting 3 seconds for Chrome to flush cookies to disk...")
time.sleep(3)

print("\n🟢 Step 2: Verifying Chrome is closed...")
result = subprocess.run(['tasklist'], capture_output=True, text=True)
if 'chrome.exe' in result.stdout:
    print("⚠️  Chrome still running, force killing...")
    os.system('taskkill /F /IM chrome.exe 2>nul')
    time.sleep(1)
else:
    print("✓ Chrome closed successfully")

print("\n🟡 Step 3: Extracting cookies from saved database...")
time.sleep(1)

import sqlite3
import shutil

chrome_data = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data\Default"
ext_cookies_path = os.path.join(chrome_data, "Extension Cookies")

temp_db = os.path.join(os.path.expanduser("~"), ".nexus_extraction")
try:
    shutil.copy2(ext_cookies_path, temp_db)
    
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM cookies")
    count = cursor.fetchone()[0]
    
    print(f"\n🎉 SUCCESS! Found {count} cookies!")
    
    if count > 0:
        cursor.execute("""
            SELECT name, host_key FROM cookies LIMIT 10
        """)
        print("\nFirst 10 cookies:")
        for name, host in cursor.fetchall():
            print(f"  • {name} from {host}")
        
        # Get all for injection
        cursor.execute("SELECT name, value FROM cookies")
        cookies_dict = {row[0]: row[1] for row in cursor.fetchall()}
        
        print(f"\n✅ Total: {len(cookies_dict)} cookies ready for injection")
        print("\nNow use Nexus app to extract and inject these!")
    
    conn.close()
    os.remove(temp_db)
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
