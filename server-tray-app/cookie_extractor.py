#!/usr/bin/env python3
"""
NEXUS Cookie Extractor
Run this from terminal: python cookie_extractor.py
Extracts cookies from Chrome Extension Cookies database and outputs as JSON
"""

import os
import sys
import json
import sqlite3
import shutil
import time
import subprocess

def close_chrome_gracefully():
    """Close Chrome and wait for cookies to flush to disk"""
    print("[1/4] Closing Chrome gracefully...", file=sys.stderr)
    
    # Try graceful close
    try:
        subprocess.run(
            ['taskkill', '/IM', 'chrome.exe', '/T'],
            capture_output=True,
            timeout=5
        )
    except:
        pass
    
    # Wait for disk flush
    print("[2/4] Waiting 2 seconds for cookies to flush...", file=sys.stderr)
    time.sleep(2)
    
    # Verify Chrome is actually closed
    result = subprocess.run(['tasklist'], capture_output=True, text=True)
    if 'chrome.exe' in result.stdout:
        print("[!] Chrome still running, force killing...", file=sys.stderr)
        os.system('taskkill /F /IM chrome.exe 2>nul')
        time.sleep(1)
    else:
        print("[✓] Chrome closed successfully", file=sys.stderr)


def extract_cookies_from_profile(profile_name="Default"):
    """Extract cookies from Extension Cookies database"""
    print(f"[3/4] Extracting cookies from {profile_name} profile...", file=sys.stderr)
    
    chrome_data = os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data")
    profile_path = os.path.join(chrome_data, profile_name)
    ext_cookies_path = os.path.join(profile_path, "Extension Cookies")
    
    if not os.path.exists(ext_cookies_path):
        print(f"[✗] Extension Cookies not found at {ext_cookies_path}", file=sys.stderr)
        return {}
    
    # Copy to temp
    temp_db = os.path.join(os.path.expanduser("~"), ".nexus_extract_temp")
    try:
        shutil.copy2(ext_cookies_path, temp_db)
    except Exception as e:
        print(f"[✗] Could not copy database: {e}", file=sys.stderr)
        return {}
    
    # Query cookies
    cookies_dict = {}
    try:
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT name, value FROM cookies")
        
        for name, value in cursor.fetchall():
            if name and value:
                cookies_dict[name] = value
        
        conn.close()
        print(f"[✓] Found {len(cookies_dict)} cookies", file=sys.stderr)
        
    except Exception as e:
        print(f"[✗] Error reading cookies: {e}", file=sys.stderr)
    finally:
        if os.path.exists(temp_db):
            try:
                os.remove(temp_db)
            except:
                pass
    
    return cookies_dict


def generate_injection_code(cookies):
    """Generate JavaScript to inject cookies"""
    js = "(function() {\n"
    js += "  const cookies = " + json.dumps(cookies) + ";\n"
    js += "  let count = 0;\n"
    js += "  for (const [name, value] of Object.entries(cookies)) {\n"
    js += "    try {\n"
    js += '      document.cookie = `${name}=${value}; path=/; secure`;\n'
    js += "      count++;\n"
    js += "    } catch(e) {}\n"
    js += "  }\n"
    js += "  console.log(`✅ Injected ${count} cookies`);\n"
    js += "})();\n"
    return js


def main():
    profile = "Default"
    
    # Close Chrome and flush cookies
    close_chrome_gracefully()
    
    # Extract cookies
    cookies = extract_cookies_from_profile(profile)
    
    print("[4/4] Generating output...", file=sys.stderr)
    
    if cookies:
        # Generate output
        injection_code = generate_injection_code(cookies)
        
        output = {
            "status": "success",
            "profile": profile,
            "cookie_count": len(cookies),
            "cookies": cookies,
            "js_code": injection_code,
            "instructions": (
                "1. Go to lab website\n"
                "2. Open DevTools (F12)\n"
                "3. Go to Console tab\n"
                "4. Paste the js_code value\n"
                "5. Press Enter\n"
                "6. Refresh page (F5)\n"
                "You should now be logged in!"
            )
        }
        
        print(json.dumps(output, indent=2))
    else:
        output = {
            "status": "error",
            "cookie_count": 0,
            "error": "No cookies found",
            "help": (
                "Make sure you:\n"
                "1. Opened Chrome and logged in to the site\n"
                "2. Waited for the page to fully load\n"
                "3. Script closed Chrome gracefully\n"
                "Try logging in again and running this script"
            )
        }
        
        print(json.dumps(output, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
