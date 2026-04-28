import os
import sqlite3
import shutil
import time

def get_chrome_user_data_path():
    username = os.getenv("USERNAME", "User")
    return os.path.join(
        os.getenv("LOCALAPPDATA", f"C:\\Users\\{username}\\AppData\\Local"),
        "Google",
        "Chrome",
        "User Data",
    )

print("[TEST] Step 1: Kill Chrome")
os.system('taskkill /F /IM chrome.exe 2>nul')
time.sleep(1)

user_data_path = get_chrome_user_data_path()
profile_path = os.path.join(user_data_path, "Default")
ext_cookies_path = os.path.join(profile_path, "Extension Cookies")

print(f"\n[TEST] Step 2: Check Extension Cookies file")
print(f"Path: {ext_cookies_path}")
print(f"Exists: {os.path.exists(ext_cookies_path)}")

if os.path.exists(ext_cookies_path):
    print(f"\n[TEST] Step 3: Copy and read database")
    temp_db = os.path.join(os.path.expanduser("~"), ".nexus_test_cookies")
    shutil.copy2(ext_cookies_path, temp_db)
    
    try:
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT name, value FROM cookies WHERE value != ''")
        cookies_dict = {}
        for name, value in cursor.fetchall():
            if name and value:
                cookies_dict[name] = value
        
        conn.close()
        
        if cookies_dict:
            print(f"✓ SUCCESS! Found {len(cookies_dict)} cookies:")
            for name in list(cookies_dict.keys())[:5]:
                print(f"  - {name}")
        else:
            print("✗ No cookies found in database")
            print("(This is normal if you haven't logged into any websites yet)")
    finally:
        os.remove(temp_db)
else:
    print("✗ Extension Cookies file not found")

