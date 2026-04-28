import os
import sqlite3
import shutil
import time

# Kill Chrome
os.system('taskkill /F /IM chrome.exe 2>nul')
time.sleep(1)

chrome_user_data = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data"

print("=== CHECKING ALL CHROME PROFILES FOR COOKIES ===\n")

# List all profiles
profiles = [d for d in os.listdir(chrome_user_data) if os.path.isdir(os.path.join(chrome_user_data, d)) and (d == "Default" or d.startswith("Profile"))]

for profile_name in sorted(profiles):
    profile_path = os.path.join(chrome_user_data, profile_name)
    ext_cookies_file = os.path.join(profile_path, "Extension Cookies")
    
    print(f"Profile: {profile_name}")
    
    if os.path.exists(ext_cookies_file):
        try:
            temp_db = os.path.join(os.path.expanduser("~"), f".test_cookies_{profile_name}")
            shutil.copy2(ext_cookies_file, temp_db)
            
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM cookies")
            count = cursor.fetchone()[0]
            
            print(f"  ✓ Extension Cookies found: {count} cookies")
            
            if count > 0:
                cursor.execute("SELECT name FROM cookies LIMIT 3")
                print(f"    Sample: {[row[0] for row in cursor.fetchall()]}")
            
            conn.close()
            os.remove(temp_db)
        except Exception as e:
            print(f"  ✗ Error: {e}")
    else:
        print(f"  ✗ Extension Cookies file not found")
    
    # Also check for "Cookies" file (older Chrome versions)
    cookies_file = os.path.join(profile_path, "Cookies")
    if os.path.exists(cookies_file):
        print(f"  ℹ️  Also found 'Cookies' file (legacy)")

print("\n=== TRYING BROWSER-COOKIE3 DIRECT ===")
try:
    import browser_cookie3
    print("Testing browser-cookie3 with no specific profile...")
    cj = browser_cookie3.chrome()
    count = 0
    sample = []
    for cookie in cj:
        count += 1
        if len(sample) < 3:
            sample.append(f"{cookie.name}={cookie.value[:20]}...")
    
    print(f"✓ browser-cookie3 found: {count} cookies")
    if sample:
        print(f"  Sample: {sample}")
except Exception as e:
    print(f"✗ browser-cookie3 failed: {type(e).__name__}: {e}")
