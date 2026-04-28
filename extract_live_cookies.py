#!/usr/bin/env python3
"""Extract cookies from Extension Cookies database while Chrome is open"""

import os
import sqlite3
import shutil
import time

chrome_data = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data\Default"
ext_cookies_path = os.path.join(chrome_data, "Extension Cookies")

print("═" * 70)
print("LIVE COOKIE EXTRACTION FROM CHROME")
print("═" * 70)

if not os.path.exists(ext_cookies_path):
    print(f"❌ Extension Cookies not found at {ext_cookies_path}")
    exit(1)

print(f"\n✓ Found Extension Cookies at: {ext_cookies_path}")

# Copy to temp (Chrome may lock it)
temp_db = os.path.join(os.path.expanduser("~"), ".nexus_temp_cookies_live")
try:
    shutil.copy2(ext_cookies_path, temp_db)
    print(f"✓ Copied to temp: {temp_db}")
except Exception as e:
    print(f"⚠️  Could not copy (Chrome might be using it): {e}")
    temp_db = ext_cookies_path

try:
    conn = sqlite3.connect(temp_db)
    conn.row_factory = sqlite3.Row  # Get results as dictionaries
    cursor = conn.cursor()
    
    # Get all tables
    print("\n--- Database Structure ---")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"Tables: {tables}")
    
    # Query cookies
    print("\n--- Querying Cookies Table ---")
    cursor.execute("SELECT COUNT(*) as total FROM cookies")
    total = cursor.fetchone()['total']
    print(f"Total cookies: {total}")
    
    if total > 0:
        print(f"\n--- First 20 Cookies ---")
        cursor.execute("""
            SELECT 
                name, 
                SUBSTR(value, 1, 50) as value_preview,
                host_key,
                path,
                expires_utc,
                secure,
                httponly
            FROM cookies 
            LIMIT 20
        """)
        
        for row in cursor.fetchall():
            print(f"\n🍪 {row['name']}")
            print(f"   Host: {row['host_key']}")
            print(f"   Value: {row['value_preview']}...")
            print(f"   Path: {row['path']}")
            print(f"   Secure: {row['secure']}, HttpOnly: {row['httponly']}")
        
        # Get by host
        print(f"\n--- Cookies by Host ---")
        cursor.execute("""
            SELECT host_key, COUNT(*) as count 
            FROM cookies 
            GROUP BY host_key 
            ORDER BY count DESC 
            LIMIT 10
        """)
        
        for row in cursor.fetchall():
            print(f"  {row['host_key']}: {row['count']} cookies")
        
        # Get ALL cookie names
        print(f"\n--- ALL Cookie Names ({total} total) ---")
        cursor.execute("SELECT DISTINCT name FROM cookies ORDER BY name")
        names = [row[0] for row in cursor.fetchall()]
        for name in names:
            print(f"  • {name}")
        
        # Try to get a complete cookie to inspect
        print(f"\n--- Sample Complete Cookie ---")
        cursor.execute("""
            SELECT 
                name,
                value,
                host_key,
                path,
                expires_utc,
                secure,
                httponly,
                samesite,
                source_scheme
            FROM cookies 
            WHERE name = '_cf_bm'
            LIMIT 1
        """)
        
        sample = cursor.fetchone()
        if sample:
            print(f"Name: {sample['name']}")
            print(f"Value: {sample['value']}")
            print(f"Host: {sample['host_key']}")
            print(f"Full row: {dict(sample)}")
        
    else:
        print("❌ No cookies found in database!")
        print("\nPossible reasons:")
        print("1. Chrome might be in a different profile")
        print("2. Chrome might not have saved cookies yet")
        print("3. Chrome uses incognito mode (cookies only in RAM)")
        print("\nTry: Close Chrome, open it fresh, log in, wait 5 sec, close, then try again")
    
    conn.close()

finally:
    # Clean up temp
    if temp_db != ext_cookies_path and os.path.exists(temp_db):
        try:
            os.remove(temp_db)
        except:
            pass

print("\n" + "═" * 70)
