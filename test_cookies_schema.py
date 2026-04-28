import os
import sqlite3
import shutil
import time

# Kill Chrome
os.system('taskkill /F /IM chrome.exe 2>nul')
time.sleep(1)

db_path = r"C:\Users\ACER\AppData\Local\Google\Chrome\User Data\Default\Extension Cookies"
temp_db = os.path.join(os.path.expanduser("~"), ".test_ext_cookies")
shutil.copy2(db_path, temp_db)

conn = sqlite3.connect(temp_db)
cursor = conn.cursor()

# Check all cookies without filters
print("=== ALL COOKIES ===")
cursor.execute("SELECT * FROM cookies")
all_cookies = cursor.fetchall()
print(f"Total rows: {len(all_cookies)}")

if all_cookies:
    # Print column info
    print("\nColumn names:", [desc[0] for desc in cursor.description])
    print("\nFirst 3 cookies:")
    for i, row in enumerate(all_cookies[:3]):
        print(f"\n  Row {i+1}:")
        for j, val in enumerate(row):
            col_name = cursor.description[j][0]
            if isinstance(val, bytes):
                print(f"    {col_name}: {val[:50]}... (bytes)")
            else:
                print(f"    {col_name}: {val}")
else:
    print("No cookies found!")
    # Try different queries
    print("\nTrying SELECT name, value...")
    try:
        cursor.execute("SELECT name, value FROM cookies")
        print(f"  Result: {cursor.fetchall()}")
    except Exception as e:
        print(f"  Error: {e}")
    
    print("\nTrying SELECT name...")
    try:
        cursor.execute("SELECT name FROM cookies")
        print(f"  Result: {cursor.fetchall()}")
    except Exception as e:
        print(f"  Error: {e}")

conn.close()
os.remove(temp_db)
