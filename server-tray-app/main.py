import os
import sys
import io
import threading
import psutil
import pyautogui
import uvicorn
import socket
import subprocess
import random
import ctypes
from fastapi import FastAPI, Response, HTTPException, Depends, Header
import time
from pydantic import BaseModel
from pystray import Icon, Menu, MenuItem
from PIL import Image, ImageDraw
from pycaw.pycaw import AudioUtilities
from comtypes import CoInitialize
from fastapi.middleware.cors import CORSMiddleware

# Enable Per-Monitor DPI Awareness so screenshots capture at native resolution
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # PROCESS_PER_MONITOR_DPI_AWARE
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()  # fallback for older Windows
    except Exception:
        pass

CONFIG_DIR = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'NexusRemote')
CONFIG_FILE = os.path.join(CONFIG_DIR, 'nexus_trusted.json')

def load_trusted_devices():
    if not os.path.exists(CONFIG_DIR):
        os.makedirs(CONFIG_DIR)
    import json
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return set(json.load(f))
        except:
            return set()
    return set()

def save_trusted_devices(trusted_set):
    import json
    with open(CONFIG_FILE, 'w') as f:
        json.dump(list(trusted_set), f)

# PAIRING_CODE (OTP) is random EVERY START (As requested - "Ini Pairing Code, bukan PIN")
PAIRING_CODE = str(random.randint(1000, 9999))
TRUSTED_DEVICES = load_trusted_devices()
IS_REMOTE_CONNECTED = False

# Mouse Jiggler state
MOUSE_JIGGLER_ACTIVE = False
MOUSE_JIGGLER_THREAD = None

def mouse_jiggler_loop():
    """Background thread: nudge the cursor every 30s to keep PC awake."""
    global MOUSE_JIGGLER_ACTIVE
    direction = 1
    while MOUSE_JIGGLER_ACTIVE:
        try:
            pyautogui.moveRel(direction, 0, duration=0.1)
            direction *= -1  # alternate left/right so cursor stays put
        except Exception:
            pass
        # Sleep in small increments so the thread can stop quickly
        for _ in range(60):
            if not MOUSE_JIGGLER_ACTIVE:
                break
            time.sleep(0.5)
    print("[JIGGLER] Stopped")

app = FastAPI(title="Nexus PC Remote")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth Dependency
def verify_pin(pin: str = Header(None), x_nexus_id: str = Header(None)):
    global PAIRING_CODE, TRUSTED_DEVICES, IS_REMOTE_CONNECTED
    
    # Normalize ID (handle "null" string from JS)
    clean_id = x_nexus_id if (x_nexus_id and x_nexus_id != "null") else None

    # 1. Check Whitelist (Permanent hardware link)
    if clean_id and clean_id in TRUSTED_DEVICES:
        if not IS_REMOTE_CONNECTED:
            IS_REMOTE_CONNECTED = True
            print(f"Device recognized: {clean_id}")
        return pin

    # 2. Check Pairing Code (Session-based OTP)
    if pin and str(pin) == PAIRING_CODE:
        if clean_id:
            TRUSTED_DEVICES.add(clean_id)
            save_trusted_devices(TRUSTED_DEVICES)
            print(f"New device paired: {clean_id}")
            # Note: We do NOT rotate PAIRING_CODE here anymore to avoid 401 errors 
            # on immediate subsequent requests from the same phone.
            # It will rotate naturally on the next server restart.
        
        IS_REMOTE_CONNECTED = True
        return pin
    
    print(f"Auth failed: PIN={pin}, ID={clean_id}")
    raise HTTPException(status_code=401, detail="Invalid Nexus Pairing Code")


def get_volume_interface():
    CoInitialize()
    speakers = AudioUtilities.GetSpeakers()
    return speakers.EndpointVolume


class VolumeControl(BaseModel):
    volume: int


# Public Endpoint for Discovery
@app.get("/")
def discover():
    return {"status": "ok", "hostname": socket.gethostname()}


# Protected Endpoints begin
@app.get("/network", dependencies=[Depends(verify_pin)])
def get_network_info():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = "127.0.0.1"
    finally:
        s.close()
    return {"local_ip": IP, "port": 8000}


@app.get("/volume", dependencies=[Depends(verify_pin)])
def get_volume():
    try:
        volume_interface = get_volume_interface()
        current_vol = round(volume_interface.GetMasterVolumeLevelScalar() * 100)
        muted = volume_interface.GetMute()
        return {"volume": current_vol, "muted": bool(muted)}
    except Exception as e:
        return {"error": str(e)}


@app.post("/volume", dependencies=[Depends(verify_pin)])
def set_volume(ctrl: VolumeControl):
    try:
        volume_interface = get_volume_interface()
        vol_scalar = max(0, min(100, ctrl.volume)) / 100.0
        volume_interface.SetMasterVolumeLevelScalar(vol_scalar, None)
        volume_interface.SetMute(0, None)
        return {"status": "success", "volume": ctrl.volume}
    except Exception as e:
        return {"error": str(e)}


@app.post("/volume/mute", dependencies=[Depends(verify_pin)])
def toggle_mute():
    try:
        volume_interface = get_volume_interface()
        muted = volume_interface.GetMute()
        volume_interface.SetMute(not muted, None)
        return {"status": "success", "muted": not muted}
    except Exception as e:
        return {"error": str(e)}


@app.post("/volume/up", dependencies=[Depends(verify_pin)])
def volume_up():
    try:
        volume_interface = get_volume_interface()
        current = volume_interface.GetMasterVolumeLevelScalar()
        new_vol = min(1.0, current + 0.05)
        volume_interface.SetMasterVolumeLevelScalar(new_vol, None)
        volume_interface.SetMute(0, None)
        return {"status": "success", "volume": round(new_vol * 100)}
    except Exception as e:
        return {"error": str(e)}


@app.post("/volume/down", dependencies=[Depends(verify_pin)])
def volume_down():
    try:
        volume_interface = get_volume_interface()
        current = volume_interface.GetMasterVolumeLevelScalar()
        new_vol = max(0.0, current - 0.05)
        volume_interface.SetMasterVolumeLevelScalar(new_vol, None)
        return {"status": "success", "volume": round(new_vol * 100)}
    except Exception as e:
        return {"error": str(e)}


@app.post("/media/{action}", dependencies=[Depends(verify_pin)])
def media_control(action: str):
    if action == "playpause":
        pyautogui.press("playpause")
    elif action == "next":
        pyautogui.press("nexttrack")
    elif action == "prev":
        pyautogui.press("prevtrack")
    else:
        return {"error": "unknown action"}
    return {"status": "success", "action": action}


@app.get("/screen", dependencies=[Depends(verify_pin)])
def capture_screen(quality: str = "low"):
    try:
        import base64
        screenshot = pyautogui.screenshot()
        w, h = screenshot.size
        mode = screenshot.mode
        # Sample some pixels to verify real content
        center_px = screenshot.getpixel((w // 2, h // 2))
        corner_px = screenshot.getpixel((10, 10))
        print(f"[SCREEN] quality={quality}, size={w}x{h}, mode={mode}, center_px={center_px}, corner_px={corner_px}")
        if quality == "high":
            # Cap at 1920px width for mobile
            if w > 1920:
                screenshot.thumbnail((1920, 1080))
            img_byte_arr = io.BytesIO()
            screenshot.save(img_byte_arr, format="PNG")
            mime = "image/png"
        else:
            # Thumbnail for quick preview
            screenshot.thumbnail((1280, 720))
            img_byte_arr = io.BytesIO()
            screenshot.save(img_byte_arr, format="JPEG", quality=40)
            mime = "image/jpeg"
        size_kb = len(img_byte_arr.getvalue()) / 1024
        print(f"[SCREEN] output_size={size_kb:.1f}KB, format={'PNG' if quality == 'high' else 'JPEG'}")
        img_b64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
        return {"status": "success", "image": f"data:{mime};base64,{img_b64}"}
    except Exception as e:
        print(f"[SCREEN] ERROR: {e}")
        return {"error": str(e)}


@app.get("/screen/raw")
def capture_screen_raw(quality: str = "high", token: str = None):
    """Serve screenshot as raw binary image. Auth via query param for Image component."""
    # Auth via query param (device ID)
    if not token or (token not in TRUSTED_DEVICES and token != PAIRING_CODE):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        screenshot = pyautogui.screenshot()
        w, h = screenshot.size
        print(f"[SCREEN/RAW] quality={quality}, native={w}x{h}")
        img_byte_arr = io.BytesIO()
        if quality == "high":
            # Cap at 1920 — sweet spot for mobile sharpness
            if w > 1920:
                screenshot.thumbnail((1920, 1080))
                print(f"[SCREEN/RAW] resized to {screenshot.size[0]}x{screenshot.size[1]}")
            screenshot.save(img_byte_arr, format="PNG")
            media_type = "image/png"
        else:
            screenshot.thumbnail((1280, 720))
            screenshot.save(img_byte_arr, format="JPEG", quality=40)
            media_type = "image/jpeg"
        size_kb = len(img_byte_arr.getvalue()) / 1024
        print(f"[SCREEN/RAW] output={size_kb:.1f}KB")
        return Response(
            content=img_byte_arr.getvalue(),
            media_type=media_type,
            headers={"Cache-Control": "no-cache"}
        )
    except Exception as e:
        print(f"[SCREEN/RAW] ERROR: {e}")
        return Response(content=str(e), status_code=500)


@app.get("/apps", dependencies=[Depends(verify_pin)])
def get_visible_apps():
    """Return only visible windowed applications (like Alt-Tab list), not background processes."""
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32

        # Get the foreground (active) window
        foreground_hwnd = user32.GetForegroundWindow()
        fg_pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(foreground_hwnd, ctypes.byref(fg_pid))
        foreground_pid = fg_pid.value

        # Enumerate all visible top-level windows with titles
        visible_windows = []  # list of (hwnd, pid, title)

        def enum_callback(hwnd, lParam):
            if not user32.IsWindowVisible(hwnd):
                return True

            # Skip windows with no title
            length = user32.GetWindowTextLengthW(hwnd)
            if length == 0:
                return True

            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value.strip()
            if not title:
                return True

            # Skip cloaked windows (UWP hidden windows)
            try:
                DWMWA_CLOAKED = 14
                cloaked = ctypes.c_int(0)
                ctypes.windll.dwmapi.DwmGetWindowAttribute(
                    hwnd, DWMWA_CLOAKED, ctypes.byref(cloaked), ctypes.sizeof(cloaked)
                )
                if cloaked.value != 0:
                    return True
            except:
                pass

            # Check window extended styles
            GWL_EXSTYLE = -20
            WS_EX_TOOLWINDOW = 0x00000080
            WS_EX_APPWINDOW = 0x00040000
            ex_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)

            # Skip tool windows unless they explicitly have APPWINDOW
            if (ex_style & WS_EX_TOOLWINDOW) and not (ex_style & WS_EX_APPWINDOW):
                return True

            # Get owner - top-level app windows typically have no owner
            owner = user32.GetWindow(hwnd, 4)  # GW_OWNER = 4
            if owner and not (ex_style & WS_EX_APPWINDOW):
                return True

            pid = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            visible_windows.append((hwnd, pid.value, title))
            return True

        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
        user32.EnumWindows(WNDENUMPROC(enum_callback), 0)

        # Collect PIDs of visible apps
        visible_pids = set(w[1] for w in visible_windows)

        # Blacklist system/shell processes
        system_names = {
            "explorer.exe", "searchhost.exe", "searchui.exe",
            "shellexperiencehost.exe", "startmenuexperiencehost.exe",
            "textinputhost.exe", "lockapp.exe",
            "applicationframehost.exe"
        }

        # Build per-process info
        app_map = {}
        total_mem = psutil.virtual_memory().total

        for pid in visible_pids:
            try:
                proc = psutil.Process(pid)
                pname = proc.name().lower()

                if pname in system_names:
                    continue

                mem_info = proc.memory_info()

                # Aggregate child process memory (e.g. Chrome, VS Code)
                total_rss = mem_info.rss
                try:
                    children = proc.children(recursive=True)
                    for child in children:
                        try:
                            total_rss += child.memory_info().rss
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

                rss_mb = round(total_rss / (1024**2), 1)
                mem_pct = round((total_rss / total_mem) * 100, 1)

                # Get window title for this PID
                titles = [w[2] for w in visible_windows if w[1] == pid]
                display_title = titles[0] if titles else proc.name()

                # Clean up process name for display
                display_name = proc.name().replace(".exe", "")

                is_focused = (pid == foreground_pid)

                app_map[pid] = {
                    "pid": pid,
                    "name": display_name,
                    "title": display_title,
                    "memory_mb": rss_mb,
                    "memory_percent": mem_pct,
                    "is_focused": is_focused,
                }
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        # Sort: focused first, then by memory descending
        apps = sorted(app_map.values(), key=lambda a: (-a["is_focused"], -a["memory_mb"]))

        return {"apps": apps}
    except Exception as e:
        return {"error": str(e)}


class KillRequest(BaseModel):
    pid: int = None
    name: str = None


@app.post("/process/kill", dependencies=[Depends(verify_pin)])
def kill_process(req: KillRequest):
    try:
        if req.pid:
            proc = psutil.Process(req.pid)
            proc_name = proc.name()
            # Kill child processes first, then the main process
            children = []
            try:
                children = proc.children(recursive=True)
            except:
                pass
            for child in children:
                try:
                    child.kill()
                except:
                    pass
            proc.kill()
            return {"status": "success", "message": f"Killed {proc_name} (PID: {req.pid})"}
        elif req.name:
            killed = 0
            for proc in psutil.process_iter(["pid", "name"]):
                try:
                    if proc.info["name"] and req.name.lower() in proc.info["name"].lower():
                        proc.kill()
                        killed += 1
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return {"status": "success", "message": f"Killed {killed} process(es) matching '{req.name}'"}
        else:
            return {"error": "Provide pid or name"}
    except psutil.NoSuchProcess:
        return {"error": "Process not found (already closed?)"}
    except psutil.AccessDenied:
        return {"error": "Access denied. Process may require admin privileges."}
    except Exception as e:
        return {"error": str(e)}


@app.get("/stats", dependencies=[Depends(verify_pin)])
def get_stats():
    try:
        import ctypes
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        buff = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
        active_window = buff.value or "Desktop"
    except:
        active_window = "Unknown"

    active_media = "Not Playing"
    try:
        from pycaw.pycaw import AudioUtilities
        from comtypes import CoInitialize
        import ctypes
        from ctypes import wintypes
        CoInitialize()
        sessions = AudioUtilities.GetAllSessions()
        
        playing_pids = set()
        playing_names = set()
        for s in sessions:
            if s.Process and s.State == 1:
                name = s.Process.name()
                if name.lower() not in ("explorer.exe", "lightingservice.exe", "msmpeng.exe"):
                    playing_pids.add(s.Process.pid)
                    playing_names.add(name.lower())

        media_titles = []
        if playing_pids:
            user32 = ctypes.windll.user32
            def enum_windows_proc(hwnd, lParam):
                if user32.IsWindowVisible(hwnd):
                    pid = ctypes.c_ulong()
                    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    if pid.value in playing_pids:
                        length = user32.GetWindowTextLengthW(hwnd)
                        if length > 0:
                            buff = ctypes.create_unicode_buffer(length + 1)
                            user32.GetWindowTextW(hwnd, buff, length + 1)
                            title = buff.value.strip()
                            if title and title.lower() not in ("spotify premium", "spotify free", "spotify"):
                                media_titles.append(title)
                return True

            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
            user32.EnumWindows(WNDENUMPROC(enum_windows_proc), 0)
            
            if media_titles:
                active_media = " • ".join(set(media_titles))
            else:
                active_media = " • ".join(set(n.replace(".exe", "").title() for n in playing_names))
    except Exception as e:
        active_media = "Unknown"

    try:
        ram = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=0.1)
        total_mem = ram.total
        processes = []
        for proc in psutil.process_iter(["pid", "name", "cpu_percent"]):
            try:
                info = proc.info
                try:
                    mem_info = proc.memory_info()
                    rss_mb = round(mem_info.rss / (1024**2), 1)
                    mem_pct = round((mem_info.rss / total_mem) * 100, 1)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    rss_mb = 0
                    mem_pct = 0
                info["memory_percent"] = mem_pct
                info["memory_mb"] = rss_mb
                processes.append(info)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        processes = sorted(processes, key=lambda p: p["memory_percent"] or 0, reverse=True)[:30]
        return {
            "cpu_percent": cpu,
            "ram_percent": ram.percent,
            "ram_used_gb": round(ram.used / (1024**3), 2),
            "ram_total_gb": round(ram.total / (1024**3), 2),
            "top_processes": processes,
            "active_window": active_window,
            "active_media": active_media
        }
    except Exception as e:
        return {"error": str(e)}


# ── Mouse Jiggler ──
@app.get("/jiggler", dependencies=[Depends(verify_pin)])
def get_jiggler_status():
    return {"active": MOUSE_JIGGLER_ACTIVE}


@app.post("/jiggler/{action}", dependencies=[Depends(verify_pin)])
def toggle_jiggler(action: str):
    global MOUSE_JIGGLER_ACTIVE, MOUSE_JIGGLER_THREAD
    if action == "start":
        if not MOUSE_JIGGLER_ACTIVE:
            MOUSE_JIGGLER_ACTIVE = True
            MOUSE_JIGGLER_THREAD = threading.Thread(target=mouse_jiggler_loop, daemon=True)
            MOUSE_JIGGLER_THREAD.start()
            print("[JIGGLER] Started")
        return {"status": "success", "active": True}
    elif action == "stop":
        MOUSE_JIGGLER_ACTIVE = False
        print("[JIGGLER] Stopping...")
        return {"status": "success", "active": False}
    else:
        return {"error": "unknown action. Use 'start' or 'stop'."}


# ── Keyboard Shortcuts ──
class ShortcutRequest(BaseModel):
    shortcut: str  # alt-tab, alt-shift-tab, ctrl-s, win-d

@app.post("/shortcut", dependencies=[Depends(verify_pin)])
def send_shortcut(req: ShortcutRequest):
    shortcut = req.shortcut.lower().strip()
    try:
        if shortcut == "alt-tab":
            pyautogui.hotkey('alt', 'tab')
        elif shortcut == "alt-shift-tab":
            pyautogui.hotkey('alt', 'shift', 'tab')
        elif shortcut == "ctrl-s":
            pyautogui.hotkey('ctrl', 's')
        elif shortcut == "win-d":
            pyautogui.hotkey('win', 'd')
        else:
            return {"error": f"Unknown shortcut: {shortcut}"}
        print(f"[SHORTCUT] Sent: {shortcut}")
        return {"status": "success", "shortcut": shortcut}
    except Exception as e:
        return {"error": str(e)}


# ── Panic Button (Show Desktop) ──
@app.post("/panic", dependencies=[Depends(verify_pin)])
def panic_button():
    """Instantly show desktop (Win+D) — hide everything."""
    try:
        pyautogui.hotkey('win', 'd')
        print("[PANIC] Desktop shown")
        return {"status": "success", "message": "Desktop shown"}
    except Exception as e:
        return {"error": str(e)}



@app.post("/power/{action}", dependencies=[Depends(verify_pin)])
def power_control(action: str):
    if action == "shutdown":
        os.system("shutdown /s /t 5")
        return {
            "status": "success",
            "action": action,
            "message": "Shutting down in 5 seconds...",
        }
    elif action == "restart":
        os.system("shutdown /r /t 5")
        return {
            "status": "success",
            "action": action,
            "message": "Restarting in 5 seconds...",
        }
    elif action == "cancel":
        os.system("shutdown /a")
        return {
            "status": "success",
            "action": "cancel",
            "message": "Shutdown/restart cancelled",
        }
    else:
        return {"error": "unknown action"}


# --- Tray Icon ---
def create_image():
    image = Image.new("RGB", (64, 64), color=(0, 122, 204))
    dc = ImageDraw.Draw(image)
    dc.rectangle((16, 16, 48, 48), fill=(255, 255, 255))
    return image


def setup_tray_icon():
    image = create_image()

    def on_quit(icon, item):
        icon.stop()
        os._exit(0)

    def show_pin_code(icon, item):
        def run_msg():
            ctypes.windll.user32.MessageBoxW(
                0,
                f"Your Nexus Pairing OTP is:\n\n{PAIRING_CODE}\n\nEnter this Code in your Mobile App to pair.",
                "Nexus Pairing Code",
                0x40,
            )

        threading.Thread(target=run_msg, daemon=True).start()

    def show_qr_code(icon, item):
        print("Opening QR code...")

        def run_qr():
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.connect(("10.255.255.255", 1))
                IP = s.getsockname()[0]
            except Exception:
                IP = "127.0.0.1"
            finally:
                s.close()
            try:
                import qrcode
                import json

                payload = json.dumps(
                    {
                        "url": f"http://{IP}:8000",
                        "pin": PAIRING_CODE,
                        "hostname": socket.gethostname(),
                    }
                )
                qr = qrcode.QRCode(version=1, box_size=10, border=4)
                qr.add_data(payload)
                qr.make(fit=True)
                img = qr.make_image(fill_color="black", back_color="white")
                img.show(title="Nexus PC Connect QR")
            except Exception as e:
                print(f"Error showing QR: {e}")
                pass

        threading.Thread(target=run_qr, daemon=True).start()

    def is_autostart_enabled():
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_READ,
            )
            val, _ = winreg.QueryValueEx(key, "NexusServer")
            winreg.CloseKey(key)
            return True
        except:
            return False

    def toggle_autostart(icon, item):
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE,
        )
        if item.checked:
            # Disable
            try:
                winreg.DeleteValue(key, "NexusServer")
            except:
                pass
        else:
            # Enable
            exe_path = (
                sys.executable
                if getattr(sys, "frozen", False)
                else os.path.abspath(__file__)
            )
            winreg.SetValueEx(key, "NexusServer", 0, winreg.REG_SZ, f'"{exe_path}"')
        winreg.CloseKey(key)

    menu = Menu(
        MenuItem("Status: Monitoring Local Network", lambda x: None, enabled=False),
        Menu.SEPARATOR,
        MenuItem("Pair New Device (QR)", show_qr_code),
        MenuItem("Show Pairing OTP Code", show_pin_code),
        Menu.SEPARATOR,
        MenuItem(
            "Run on Windows Startup",
            toggle_autostart,
            checked=lambda item: is_autostart_enabled(),
        ),
        MenuItem("Quit Backend", on_quit),
    )
    icon = Icon("PCRemote", image, "Nexus PC Controller Server", menu=menu)

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        IP = s.getsockname()[0]
    except:
        IP = "127.0.0.1"
    finally:
        s.close()

    print(f"=====================================")
    print(f"NEXUS TRAY SERVER RUNNING")
    print(f"Server IP: {IP}")
    print(f"Pairing OTP (New Devices): {PAIRING_CODE}")
    print(f"=====================================")

    icon.run()


def start_server():
    try:
        if sys.stdout is None:
            sys.stdout = open(os.devnull, "w")
        if sys.stderr is None:
            sys.stderr = open(os.devnull, "w")
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="error")
    except Exception as e:
        with open("nexus_server_error.log", "w") as f:
            import traceback

            f.write(traceback.format_exc())


if __name__ == "__main__":
    import socket
    import ctypes
    import sys

    # Check if port is already in use to prevent duplicate instances
    def check_port_free(port):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(("0.0.0.0", port))
            s.close()
            return True
        except OSError:
            return False

    if not check_port_free(8000):
        ctypes.windll.user32.MessageBoxW(
            0,
            "Port 8000 is already in use.\nAnother instance of Nexus PC Remote is likely already running.",
            "Nexus PC Remote - Error",
            0x10,  # OK button, Error icon
        )
        sys.exit(1)

    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    setup_tray_icon()
