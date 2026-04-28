import os
import json
import subprocess

print("=== CHECKING CHROME ENCRYPTION KEY ===\n")

chrome_user_data = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data"
local_state_file = os.path.join(chrome_user_data, "Local State")

if os.path.exists(local_state_file):
    try:
        with open(local_state_file, 'r', encoding='utf-8') as f:
            local_state = json.load(f)
        
        # Check if encryption key exists
        if 'os_crypt' in local_state:
            print("✓ Found os_crypt section in Local State")
            os_crypt = local_state['os_crypt']
            if 'encrypted_key' in os_crypt:
                enc_key = os_crypt['encrypted_key']
                print(f"  encrypted_key length: {len(enc_key)} bytes")
                print(f"  First 50 chars: {enc_key[:50]}...")
            if 'provider' in os_crypt:
                print(f"  Encryption provider: {os_crypt['provider']}")
        else:
            print("✗ No os_crypt section found (cookies may not be encrypted)")
            
    except Exception as e:
        print(f"✗ Error reading Local State: {e}")
else:
    print("✗ Local State file not found")

print("\n=== CHECKING CHROME PROCESS STATUS ===")
result = subprocess.run(['tasklist'], capture_output=True, text=True)
if 'chrome.exe' in result.stdout:
    print("⚠️  Chrome is CURRENTLY RUNNING - this might interfere")
    result2 = subprocess.run(['tasklist', '/v'], capture_output=True, text=True)
    for line in result2.stdout.split('\n'):
        if 'chrome' in line.lower():
            print(f"  {line}")
else:
    print("✓ Chrome is not running")

print("\n=== CHECKING DEFAULT PROFILE EXISTENCE ===")
default_profile = os.path.join(chrome_user_data, "Default")
if os.path.exists(default_profile):
    files = os.listdir(default_profile)
    print(f"✓ Default profile exists with {len(files)} files/folders")
    important_files = ['History', 'Preferences', 'Cookies', 'Extension Cookies', 'Web Data']
    for fname in important_files:
        fpath = os.path.join(default_profile, fname)
        if os.path.exists(fpath):
            size_kb = os.path.getsize(fpath) / 1024
            print(f"  ✓ {fname}: {size_kb:.1f} KB")
        else:
            print(f"  ✗ {fname}: not found")
else:
    print("✗ Default profile does not exist!")

print("\n=== CHECKING HISTORY FOR LOGGED-IN WEBSITES ===")
history_file = os.path.join(default_profile, "History")
if os.path.exists(history_file):
    import sqlite3
    import shutil
    import time
    
    os.system('taskkill /F /IM chrome.exe 2>nul')
    time.sleep(1)
    
    try:
        temp_history = os.path.join(os.path.expanduser("~"), ".temp_history")
        shutil.copy2(history_file, temp_history)
        
        conn = sqlite3.connect(temp_history)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM urls")
        url_count = cursor.fetchone()[0]
        print(f"✓ Browser history has {url_count} URLs visited")
        
        # Check for common login sites
        login_sites = ['linkedin.com', 'github.com', 'gmail.com', 'google.com', 'facebook.com', 'amazon.com']
        cursor.execute("SELECT DISTINCT url FROM urls WHERE url LIKE ?", ('%linkedin.com%',))
        linkedin_visits = cursor.fetchall()
        
        if linkedin_visits:
            print(f"✓ Found {len(linkedin_visits)} LinkedIn visits in history")
        
        conn.close()
        os.remove(temp_history)
        
    except Exception as e:
        print(f"✗ Error reading history: {e}")
