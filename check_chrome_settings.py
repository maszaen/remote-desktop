import os
import json
import sqlite3
import shutil
import time

chrome_user_data = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data"
default_profile = os.path.join(chrome_user_data, "Default")
prefs_file = os.path.join(default_profile, "Preferences")

print("=== CHECKING CHROME COOKIE SETTINGS ===\n")

if os.path.exists(prefs_file):
    try:
        with open(prefs_file, 'r', encoding='utf-8') as f:
            prefs = json.load(f)
        
        # Check profile settings
        print("Profile settings:")
        if 'profile' in prefs and 'name' in prefs['profile']:
            print(f"  Profile name: {prefs['profile']['name']}")
        
        # Check cookie settings
        print("\nCookie & Privacy Settings:")
        if 'profile' in prefs and 'managed_user_id' in prefs['profile']:
            print(f"  Managed user: {prefs['profile']['managed_user_id']}")
        
        # Check content settings (cookies)
        if 'profile' in prefs:
            profile = prefs['profile']
            
            # Check if cookies are disabled
            if 'managed_cookies' in profile:
                print(f"  managed_cookies: {profile['managed_cookies']}")
            
            if 'content_settings' in prefs:
                cs = prefs['content_settings']
                if 'cookies' in cs:
                    print(f"  cookies setting: {cs['cookies']}")
                if 'ads' in cs:
                    print(f"  ads setting: {cs['ads']}")
        
        # Check if cookies deleted on exit
        if 'privacy' in prefs:
            priv = prefs['privacy']
            if 'clear_on_exit' in priv:
                print(f"  ⚠️  Clear on exit: {priv['clear_on_exit']}")
            if 'clear_lso_data_enabled' in priv:
                print(f"  Clear LSO data: {priv['clear_lso_data_enabled']}")
        
        # Check security settings
        if 'security_state' in prefs:
            print(f"  Security state: {prefs['security_state']}")
        
        print("\nFull privacy section (relevant keys):")
        if 'privacy' in prefs:
            for key in sorted(prefs['privacy'].keys()):
                if 'clear' in key.lower() or 'cookie' in key.lower() or 'site' in key.lower():
                    print(f"  {key}: {prefs['privacy'][key]}")
                    
    except Exception as e:
        print(f"Error reading preferences: {e}")
else:
    print("Preferences file not found")

print("\n=== CHECKING FOR INCOGNITO MODE HISTORY ===")
history_file = os.path.join(default_profile, "History")
if os.path.exists(history_file):
    try:
        os.system('taskkill /F /IM chrome.exe 2>nul')
        time.sleep(1)
        
        temp_history = os.path.join(os.path.expanduser("~"), ".temp_history")
        shutil.copy2(history_file, temp_history)
        
        conn = sqlite3.connect(temp_history)
        cursor = conn.cursor()
        
        # Check for incognito history (it's usually in a different file)
        cursor.execute("SELECT COUNT(*) FROM urls WHERE url LIKE '%login%' OR url LIKE '%auth%'")
        auth_urls = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT url) FROM urls WHERE url LIKE '%linkedin%'")
        linkedin_count = cursor.fetchone()[0]
        
        print(f"✓ Auth-related URLs: {auth_urls}")
        print(f"✓ LinkedIn unique URLs: {linkedin_count}")
        
        cursor.execute("SELECT url FROM urls WHERE url LIKE '%linkedin%' ORDER BY last_visit_time DESC LIMIT 3")
        print(f"\nRecent LinkedIn pages:")
        for url, in cursor.fetchall():
            print(f"  - {url[:80]}...")
        
        conn.close()
        os.remove(temp_history)
        
    except Exception as e:
        print(f"Error: {e}")

print("\n=== CHECKING WEB DATA FOR STORED PASSWORDS/FORMS ===")
web_data_file = os.path.join(default_profile, "Web Data")
if os.path.exists(web_data_file):
    try:
        os.system('taskkill /F /IM chrome.exe 2>nul')
        time.sleep(1)
        
        temp_web_data = os.path.join(os.path.expanduser("~"), ".temp_web_data")
        shutil.copy2(web_data_file, temp_web_data)
        
        conn = sqlite3.connect(temp_web_data)
        cursor = conn.cursor()
        
        # Check autofill data
        cursor.execute("SELECT COUNT(*) FROM autofill WHERE value LIKE '%@%'")
        email_count = cursor.fetchone()[0]
        print(f"✓ Saved emails/logins in autofill: {email_count}")
        
        cursor.execute("SELECT COUNT(*) FROM autofill_profiles")
        profiles = cursor.fetchone()[0]
        print(f"✓ Saved user profiles: {profiles}")
        
        conn.close()
        os.remove(temp_web_data)
        
    except Exception as e:
        print(f"Note: {e}")

print("\n=== SUMMARY ===")
print("If Extension Cookies is empty despite browsing history:")
print("1. Check Chrome Settings → Privacy & Security")
print("2. Look for 'Clear cookies when closing Chrome'")
print("3. Check if using Multiple Users / Guest Mode")
print("4. Try logging into a site again and immediately extract")
