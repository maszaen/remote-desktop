import os
import json
import sqlite3
import shutil
import time
import re

# Kill Chrome
os.system('taskkill /F /IM chrome.exe 2>nul')
time.sleep(1)

default_profile = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data\Default"

print("=== CHECKING ALL DATA STORAGE TYPES ===\n")

print("1. COOKIES (Extension Cookies - SQLite)")
ext_cookies_path = os.path.join(default_profile, "Extension Cookies")
try:
    temp_db = os.path.join(os.path.expanduser("~"), ".temp_cookies")
    shutil.copy2(ext_cookies_path, temp_db)
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM cookies")
    count = cursor.fetchone()[0]
    print(f"   Cookies in Extension Cookies DB: {count}")
    conn.close()
    os.remove(temp_db)
except Exception as e:
    print(f"   Error: {e}")

print("\n2. LOCALSTORAGE & SESSIONSTORAGE (IndexedDB - LevelDB)")
storage_path = os.path.join(default_profile, "Local Storage")
if os.path.exists(storage_path):
    print(f"   ✓ Local Storage folder exists")
    files = os.listdir(storage_path)
    print(f"   Files: {len(files)}")
    for f in files[:5]:
        fpath = os.path.join(storage_path, f)
        if os.path.isfile(fpath):
            size_kb = os.path.getsize(fpath) / 1024
            print(f"     - {f} ({size_kb:.1f} KB)")
else:
    print(f"   ✗ Local Storage folder not found")

print("\n3. INDEXEDDB (LevelDB storage)")
indexed_db_path = os.path.join(default_profile, "IndexedDB")
if os.path.exists(indexed_db_path):
    print(f"   ✓ IndexedDB folder exists")
    origins = [d for d in os.listdir(indexed_db_path) if os.path.isdir(os.path.join(indexed_db_path, d))]
    print(f"   Origins stored: {len(origins)}")
    for origin in sorted(origins)[:5]:
        print(f"     - {origin}")
else:
    print(f"   ✗ IndexedDB not found")

print("\n4. SESSION STORAGE (LevelDB)")
session_storage_path = os.path.join(default_profile, "Session Storage")
if os.path.exists(session_storage_path):
    print(f"   ✓ Session Storage folder exists")
    files = os.listdir(session_storage_path)
    print(f"   Files: {len(files)}")
    for f in files[:5]:
        print(f"     - {f}")
else:
    print(f"   ✗ Session Storage not found")

print("\n5. CHROME STORAGE (Sync Data)")
chrome_storage_path = os.path.join(default_profile, "Chrome Storage")
if os.path.exists(chrome_storage_path):
    print(f"   ✓ Chrome Storage folder exists")
    size_mb = sum(os.path.getsize(os.path.join(chrome_storage_path, f)) for f in os.listdir(chrome_storage_path)) / 1024 / 1024
    print(f"   Total size: {size_mb:.1f} MB")
else:
    print(f"   ✗ Chrome Storage not found")

print("\n6. SERVICE WORKER CACHE")
cache_path = os.path.join(default_profile, "Cache")
if os.path.exists(cache_path):
    files = os.listdir(cache_path)
    total_size_mb = sum(os.path.getsize(os.path.join(cache_path, f)) for f in files if os.path.isfile(os.path.join(cache_path, f))) / 1024 / 1024
    print(f"   ✓ Cache folder exists: {len(files)} items ({total_size_mb:.1f} MB)")
else:
    print(f"   ✗ Cache not found")

print("\n=== RECOMMENDATION ===")
print("Try this:")
print("1. Kill Chrome completely (done)")
print("2. Open Chrome")
print("3. Go to LinkedIn.com")
print("4. Log in")
print("5. Go to Developer Tools (F12 > Application/Storage tab)")
print("6. Check 'Cookies' section - you should see the session cookies there")
print("7. WITHOUT closing Chrome, extract cookies via the app")
print("8. If it still fails, cookies might be encrypted in memory only")
