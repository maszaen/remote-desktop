import os
import sqlite3
import shutil
import time

# Kill Chrome
os.system('taskkill /F /IM chrome.exe 2>nul')
time.sleep(1)

profile_path = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data\Default"

print("=== SEARCHING ALL CHROME DATABASES FOR COOKIES ===\n")

# Check all files in Default profile
for filename in os.listdir(profile_path):
    filepath = os.path.join(profile_path, filename)
    
    # Only check files, not directories
    if os.path.isfile(filepath):
        try:
            # Try to open as SQLite
            conn = sqlite3.connect(filepath)
            cursor = conn.cursor()
            
            # Get all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            if tables and 'cookies' in tables:
                print(f"🔥 FOUND COOKIES in: {filename}")
                print(f"   Tables: {tables}")
                
                # Try to read cookies
                try:
                    cursor.execute("SELECT COUNT(*) FROM cookies")
                    count = cursor.fetchone()[0]
                    print(f"   Total cookies: {count}")
                    
                    if count > 0:
                        cursor.execute("SELECT name, value FROM cookies LIMIT 3")
                        print(f"   Sample cookies:")
                        for name, value in cursor.fetchall():
                            val_preview = str(value)[:40] if value else "(empty)"
                            print(f"     - {name} = {val_preview}...")
                except Exception as e:
                    print(f"   Could not read cookies: {e}")
            
            conn.close()
        except:
            # Not a SQLite database, skip
            pass

print("\n=== ALSO CHECKING 'Cookies' FILE (if exists) ===")
cookies_file = os.path.join(profile_path, "Cookies")
if os.path.exists(cookies_file):
    print(f"✓ Found 'Cookies' file at {cookies_file}")
    try:
        temp_db = os.path.join(os.path.expanduser("~"), ".test_cookies_db")
        shutil.copy2(cookies_file, temp_db)
        
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM cookies")
        count = cursor.fetchone()[0]
        print(f"  Total cookies in 'Cookies' file: {count}")
        
        if count > 0:
            cursor.execute("SELECT name FROM cookies LIMIT 5")
            print(f"  Sample cookie names:")
            for name, in cursor.fetchall():
                print(f"    - {name}")
        
        conn.close()
        os.remove(temp_db)
    except Exception as e:
        print(f"  Error reading 'Cookies' file: {e}")
else:
    print("✗ 'Cookies' file not found (this is normal in newer Chrome)")
