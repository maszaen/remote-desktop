#!/usr/bin/env python3
"""Check localStorage and sessionStorage for Claude.ai and other sites"""

import os
import sqlite3
import json
import shutil
from pathlib import Path

default_profile = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data\Default"

print("=" * 70)
print("CHECKING LOCALSTORAGE & SESSIONSTORAGE FOR AUTH TOKENS")
print("=" * 70)

# Check LocalStorage (LevelDB format)
local_storage_path = os.path.join(default_profile, "Local Storage")
if os.path.exists(local_storage_path):
    print("\n📂 LocalStorage folder found:")
    print(f"   Files: {os.listdir(local_storage_path)}")
    
    # LocalStorage files are LevelDB format, harder to read directly
    # But we can look at the leveldb files
    for filename in os.listdir(local_storage_path):
        if filename.endswith('.ldb') or filename.endswith('.log'):
            filepath = os.path.join(local_storage_path, filename)
            file_size = os.path.getsize(filepath) / 1024
            print(f"   • {filename} ({file_size:.1f} KB)")
else:
    print("\n❌ LocalStorage folder not found")

# Check SessionStorage
session_storage_path = os.path.join(default_profile, "Session Storage")
if os.path.exists(session_storage_path):
    print("\n📂 SessionStorage folder found:")
    files = os.listdir(session_storage_path)
    print(f"   Files ({len(files)}):")
    for filename in files[:10]:
        filepath = os.path.join(session_storage_path, filename)
        if os.path.isfile(filepath):
            file_size = os.path.getsize(filepath) / 1024
            print(f"   • {filename} ({file_size:.1f} KB)")
else:
    print("\n❌ SessionStorage folder not found")

# Check IndexedDB
indexeddb_path = os.path.join(default_profile, "IndexedDB")
if os.path.exists(indexeddb_path):
    print("\n📂 IndexedDB folder found (where Claude.ai might store tokens):")
    origins = [d for d in os.listdir(indexeddb_path) if os.path.isdir(os.path.join(indexeddb_path, d))]
    
    # Look for Claude-related
    claude_origins = [o for o in origins if 'claude' in o.lower() or 'openai' in o.lower()]
    
    if claude_origins:
        print(f"   ✅ Found Claude/OpenAI origins:")
        for origin in claude_origins:
            print(f"     - {origin}")
            origin_path = os.path.join(indexeddb_path, origin)
            if os.path.isdir(origin_path):
                files = os.listdir(origin_path)
                print(f"       Files: {files}")
    
    print(f"\n   Other origins ({len(origins)}):")
    for origin in sorted(origins)[:10]:
        print(f"     - {origin}")
else:
    print("\n❌ IndexedDB folder not found")

# Check Web Data (autofill/form data)
web_data_path = os.path.join(default_profile, "Web Data")
if os.path.exists(web_data_path):
    print("\n📂 Web Data (form autofill):")
    try:
        temp_web = os.path.join(os.path.expanduser("~"), ".temp_web_data")
        shutil.copy2(web_data_path, temp_web)
        
        conn = sqlite3.connect(temp_web)
        cursor = conn.cursor()
        
        # Check if there's any credential data
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"   Tables in Web Data: {tables}")
        
        if 'autofill' in tables:
            cursor.execute("SELECT COUNT(*) FROM autofill WHERE value LIKE '%@%' OR value LIKE '%token%' OR value LIKE '%api%'")
            count = cursor.fetchone()[0]
            if count > 0:
                print(f"   ✅ Found {count} potential auth entries in autofill")
        
        conn.close()
        os.remove(temp_web)
    except Exception as e:
        print(f"   Error reading: {e}")
else:
    print("\n❌ Web Data not found")

print("\n" + "=" * 70)
print("RECOMMENDATION:")
print("=" * 70)
print("""
If Claude.ai stores auth in IndexedDB or localStorage (not cookies):
1. Open Chrome Developer Tools (F12)
2. Go to "Application" tab
3. Click "LocalStorage" → look for claude.ai
4. Find entries like: 'auth', 'token', 'session', 'jwt', etc.
5. Copy their values
6. These are what you need to inject into lab site

Modern SPAs (Single Page Apps) like Claude use:
- localStorage: Persistent auth tokens (JWT, etc.)
- sessionStorage: Session-specific data
- IndexedDB: Large data storage
- Cookies: Less common now
""")
