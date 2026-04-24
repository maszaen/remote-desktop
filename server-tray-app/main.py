import os
import sys
import io
import threading
import psutil
import pyautogui
import pydirectinput
import pyperclip
import uvicorn
import socket
import subprocess
import random
import ctypes
import queue as _stdlib_queue
from typing import Optional, List
from fastapi import FastAPI, Response, HTTPException, Depends, Header, UploadFile, File, Form
import time
from pydantic import BaseModel
from pystray import Icon, Menu, MenuItem
from PIL import Image, ImageDraw
from pycaw.pycaw import AudioUtilities
from comtypes import CoInitialize
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# Remove implicit 100ms delay inside pyautogui
pyautogui.PAUSE = 0
pydirectinput.PAUSE = 0
# Prevent failsafe exceptions if cursor goes to corner during typing
pyautogui.FAILSAFE = False
pydirectinput.FAILSAFE = False

# Enable Per-Monitor DPI Awareness so screenshots capture at native resolution
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # PROCESS_PER_MONITOR_DPI_AWARE
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()  # fallback for older Windows
    except Exception:
        pass

CONFIG_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "NexusRemote"
)
CONFIG_FILE = os.path.join(CONFIG_DIR, "nexus_trusted.json")


def get_resource_path(relative_path: str) -> str:
    # PyInstaller extracts bundled files to _MEIPASS at runtime.
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


def load_trusted_devices():
    if not os.path.exists(CONFIG_DIR):
        os.makedirs(CONFIG_DIR)
    import json

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return set(json.load(f))
        except:
            return set()
    return set()


def save_trusted_devices(trusted_set):
    import json

    with open(CONFIG_FILE, "w") as f:
        json.dump(list(trusted_set), f)


# PAIRING_CODE (OTP) is random EVERY START (As requested - "Ini Pairing Code, bukan PIN")
PAIRING_CODE = str(random.randint(1000, 9999))
TRUSTED_DEVICES = load_trusted_devices()
IS_REMOTE_CONNECTED = False


# App launcher presets (easy to edit/extend)
APP_LAUNCH_TARGETS = {
    "steam": {
        "label": "Steam",
        "target": "steam://open/main",
    },
    "epic_games": {
        "label": "Epic Games",
        "target": "com.epicgames.launcher://apps",
    },
    "gta_v": {
        "label": "GTA V Enhanced",
        "target": "steam://rungameid/3240220",
    },
    "nfs_heat": {
        "label": "Need for Speed Heat",
        "target": "steam://rungameid/1222680",
    },
    "spotify": {
        "label": "Spotify",
        "target": "spotify:",
    },
    "vscode": {
        "label": "VS Code",
        "target": "code",
    },
    "chrome": {
        "label": "Google Chrome",
        "target": "chrome",
    },
}


# Keyboard queue runtime state
KEYBOARD_QUEUE_LOCK = threading.Lock()
KEYBOARD_QUEUE_STOP = threading.Event()
KEYBOARD_QUEUE_PAUSE = threading.Event()
KEYBOARD_QUEUE_THREAD = None
KEYBOARD_QUEUE_STATE = {
    "running": False,
    "paused": False,
    "total": 0,
    "sent_count": 0,
    "current_index": -1,
    "current_key": None,
    "current_mode": None,
    "step_end_ts": None,
    "last_sent_key": None,
    "last_sent_at": None,
    "error": None,
    "items": [],
}


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

class ClipboardRequest(BaseModel):
    content: str


class LaunchAppRequest(BaseModel):
    app_key: Optional[str] = None
    target: Optional[str] = None


class RealtimeKeyboardRequest(BaseModel):
    key: Optional[str] = None
    mode: str = "tap"  # tap | down | up
    hold_ms: int = 30
    text: Optional[str] = None


class KeyboardQueueItem(BaseModel):
    key: str
    action: str = "tap"  # tap | hold
    hold_ms: Optional[int] = None
    delay_ms: Optional[int] = None


class KeyboardQueueStartRequest(BaseModel):
    items: List[KeyboardQueueItem]
    default_delay_ms: int = 10
    default_hold_ms: int = 1000


def clamp_ms(value: int, min_ms: int = 10, max_ms: int = 120000) -> int:
    return max(min_ms, min(max_ms, int(value)))


def normalize_key(key: str) -> str:
    if not key:
        return ""
    k = key.lower()
    aliases = {
        " ": "space",
        "esc": "escape",
        "del": "delete",
        "pgup": "pageup",
        "pgdn": "pagedown",
    }
    return aliases.get(k, k)


SHIFT_CHARS = {
    '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-',
    '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'",
    '<': ',', '>': '.', '?': '/'
}

def tap_key(key: str, hold_ms: int = 30):
    k = normalize_key(key)
    if not k:
        return
        
    if len(key) == 1:
        if key.isupper():
            pydirectinput.keyDown('shift')
            pydirectinput.write(key.lower(), interval=0)
            pydirectinput.keyUp('shift')
        elif key in SHIFT_CHARS:
            pydirectinput.keyDown('shift')
            pydirectinput.write(SHIFT_CHARS[key], interval=0)
            pydirectinput.keyUp('shift')
        else:
            pydirectinput.write(key, interval=0)
    else:
        pydirectinput.keyDown(k)
        time.sleep(clamp_ms(hold_ms) / 1000.0)
        pydirectinput.keyUp(k)
def set_queue_state(**updates):
    with KEYBOARD_QUEUE_LOCK:
        KEYBOARD_QUEUE_STATE.update(updates)


def get_queue_status_payload():
    with KEYBOARD_QUEUE_LOCK:
        payload = dict(KEYBOARD_QUEUE_STATE)

    remaining_ms = 0
    if payload.get("step_end_ts"):
        remaining_ms = max(0, int((payload["step_end_ts"] - time.time()) * 1000))

    payload["remaining_ms"] = remaining_ms
    payload.pop("step_end_ts", None)
    return payload


def run_keyboard_queue(
    items: List[dict],
    default_delay_ms: int,
    default_hold_ms: int,
):
    try:
        set_queue_state(
            running=True,
            paused=False,
            total=len(items),
            sent_count=0,
            current_index=-1,
            current_key=None,
            current_mode=None,
            step_end_ts=None,
            error=None,
            items=items,
        )

        for idx, item in enumerate(items):
            if KEYBOARD_QUEUE_STOP.is_set():
                break

            while KEYBOARD_QUEUE_PAUSE.is_set() and not KEYBOARD_QUEUE_STOP.is_set():
                set_queue_state(paused=True, step_end_ts=None)
                time.sleep(0.05)

            if KEYBOARD_QUEUE_STOP.is_set():
                break

            mode = (item.get("action") or "tap").lower().strip()
            key = item.get("key")
            hold_ms = clamp_ms(item.get("hold_ms") or default_hold_ms)
            delay_ms = clamp_ms(item.get("delay_ms") or default_delay_ms)

            set_queue_state(
                paused=False,
                current_index=idx,
                current_key=key,
                current_mode=mode,
            )

            if mode == "hold":
                k = normalize_key(key)
                pydirectinput.keyDown(k)
                set_queue_state(step_end_ts=time.time() + (hold_ms / 1000.0))
                end_ts = time.time() + (hold_ms / 1000.0)
                while time.time() < end_ts and not KEYBOARD_QUEUE_STOP.is_set():
                    time.sleep(0.01)
                pydirectinput.keyUp(k)
            else:
                tap_key(key, hold_ms=hold_ms)

            sent_count = idx + 1
            set_queue_state(
                sent_count=sent_count,
                last_sent_key=key,
                last_sent_at=time.time(),
            )

            if KEYBOARD_QUEUE_STOP.is_set():
                break

            set_queue_state(step_end_ts=time.time() + (delay_ms / 1000.0))
            end_ts = time.time() + (delay_ms / 1000.0)
            while time.time() < end_ts and not KEYBOARD_QUEUE_STOP.is_set():
                while KEYBOARD_QUEUE_PAUSE.is_set() and not KEYBOARD_QUEUE_STOP.is_set():
                    set_queue_state(paused=True, step_end_ts=None)
                    time.sleep(0.05)
                    end_ts += 0.05
                time.sleep(0.01)

        set_queue_state(
            running=False,
            paused=False,
            current_index=-1,
            current_key=None,
            current_mode=None,
            step_end_ts=None,
        )
    except Exception as e:
        set_queue_state(
            running=False,
            paused=False,
            current_index=-1,
            current_key=None,
            current_mode=None,
            step_end_ts=None,
            error=str(e),
        )


# Public Endpoint for Discovery
@app.get("/")
def discover():
    return {"status": "ok", "hostname": socket.gethostname()}


@app.get("/auth-check", dependencies=[Depends(verify_pin)])
def auth_check():
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

        img_b64 = base64.b64encode(img_byte_arr.getvalue()).decode("utf-8")
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
        img_byte_arr = io.BytesIO()
        if quality == "high":
            # Cap at 1920 — sweet spot for mobile sharpness
            if w > 1920:
                screenshot.thumbnail((1920, 1080))
            screenshot.save(img_byte_arr, format="PNG")
            media_type = "image/png"
        else:
            screenshot.thumbnail((1280, 720))
            screenshot.save(img_byte_arr, format="JPEG", quality=40)
            media_type = "image/jpeg"
        size_kb = len(img_byte_arr.getvalue()) / 1024
        return Response(
            content=img_byte_arr.getvalue(),
            media_type=media_type,
            headers={"Cache-Control": "no-cache"},
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
            "explorer.exe",
            "searchhost.exe",
            "searchui.exe",
            "shellexperiencehost.exe",
            "startmenuexperiencehost.exe",
            "textinputhost.exe",
            "lockapp.exe",
            "applicationframehost.exe",
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

                is_focused = pid == foreground_pid

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
        apps = sorted(
            app_map.values(), key=lambda a: (-a["is_focused"], -a["memory_mb"])
        )

        return {"apps": apps}
    except Exception as e:
        return {"error": str(e)}


@app.get("/apps/launchables", dependencies=[Depends(verify_pin)])
def get_launchable_apps():
    apps = [
        {"key": k, "label": v.get("label", k), "target": v.get("target", "")}
        for k, v in APP_LAUNCH_TARGETS.items()
    ]
    return {"status": "success", "apps": apps}


@app.post("/apps/launch", dependencies=[Depends(verify_pin)])
def launch_app(req: LaunchAppRequest):
    try:
        target = None
        source = None

        if req.app_key:
            profile = APP_LAUNCH_TARGETS.get(req.app_key)
            if not profile:
                return {"error": f"Unknown app_key: {req.app_key}"}
            target = profile.get("target")
            source = req.app_key
        elif req.target:
            target = req.target.strip()
            source = "custom"

        if not target:
            return {"error": "Provide app_key or target"}

        subprocess.Popen(["cmd", "/c", "start", "", target])
        return {"status": "success", "launched": source, "target": target}
    except Exception as e:
        return {"error": str(e)}


@app.post("/keyboard/realtime", dependencies=[Depends(verify_pin)])
def keyboard_realtime(req: RealtimeKeyboardRequest):
    try:
        if req.text is not None:
            for char in req.text:
                if char.isupper():
                    pydirectinput.keyDown('shift')
                    pydirectinput.write(char.lower(), interval=0)
                    pydirectinput.keyUp('shift')
                else:
                    pydirectinput.write(char, interval=0)
            return {"status": "success", "mode": "text", "length": len(req.text)}

        if not req.key:
            return {"error": "Provide key or text"}

        mode = req.mode.lower().strip()
        key = normalize_key(req.key)

        if mode == "down":
            pydirectinput.keyDown(key)
        elif mode == "up":
            pydirectinput.keyUp(key)
        else:
            tap_key(key, hold_ms=req.hold_ms)

        return {"status": "success", "mode": mode, "key": key}
    except Exception as e:
        return {"error": str(e)}


@app.post("/keyboard/queue/start", dependencies=[Depends(verify_pin)])
def keyboard_queue_start(req: KeyboardQueueStartRequest):
    global KEYBOARD_QUEUE_THREAD

    items = [i.model_dump() for i in req.items if i.key and i.key.strip()]
    if not items:
        return {"error": "Queue is empty"}

    with KEYBOARD_QUEUE_LOCK:
        if KEYBOARD_QUEUE_STATE.get("running"):
            return {"error": "Queue already running"}

    KEYBOARD_QUEUE_STOP.clear()
    KEYBOARD_QUEUE_PAUSE.clear()
    KEYBOARD_QUEUE_THREAD = threading.Thread(
        target=run_keyboard_queue,
        args=(
            items,
            clamp_ms(req.default_delay_ms),
            clamp_ms(req.default_hold_ms),
        ),
        daemon=True,
    )
    KEYBOARD_QUEUE_THREAD.start()

    return {"status": "success", "queued": len(items)}


@app.post("/keyboard/queue/pause", dependencies=[Depends(verify_pin)])
def keyboard_queue_pause():
    with KEYBOARD_QUEUE_LOCK:
        if not KEYBOARD_QUEUE_STATE.get("running"):
            return {"error": "Queue is not running"}
    KEYBOARD_QUEUE_PAUSE.set()
    set_queue_state(paused=True)
    return {"status": "success", "action": "pause"}


@app.post("/keyboard/queue/resume", dependencies=[Depends(verify_pin)])
def keyboard_queue_resume():
    with KEYBOARD_QUEUE_LOCK:
        if not KEYBOARD_QUEUE_STATE.get("running"):
            return {"error": "Queue is not running"}
    KEYBOARD_QUEUE_PAUSE.clear()
    set_queue_state(paused=False)
    return {"status": "success", "action": "resume"}


@app.post("/keyboard/queue/stop", dependencies=[Depends(verify_pin)])
def keyboard_queue_stop():
    KEYBOARD_QUEUE_STOP.set()
    KEYBOARD_QUEUE_PAUSE.clear()
    set_queue_state(
        running=False,
        paused=False,
        current_index=-1,
        current_key=None,
        current_mode=None,
        step_end_ts=None,
    )
    return {"status": "success", "action": "stop"}


@app.get("/keyboard/queue/status", dependencies=[Depends(verify_pin)])
def keyboard_queue_status():
    return {"status": "success", **get_queue_status_payload()}


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
            return {
                "status": "success",
                "message": f"Killed {proc_name} (PID: {req.pid})",
            }
        elif req.name:
            killed = 0
            for proc in psutil.process_iter(["pid", "name"]):
                try:
                    if (
                        proc.info["name"]
                        and req.name.lower() in proc.info["name"].lower()
                    ):
                        proc.kill()
                        killed += 1
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return {
                "status": "success",
                "message": f"Killed {killed} process(es) matching '{req.name}'",
            }
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
                if name.lower() not in (
                    "explorer.exe",
                    "lightingservice.exe",
                    "msmpeng.exe",
                ):
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
                            if title and title.lower() not in (
                                "spotify premium",
                                "spotify free",
                                "spotify",
                            ):
                                media_titles.append(title)
                return True

            WNDENUMPROC = ctypes.WINFUNCTYPE(
                ctypes.c_bool, wintypes.HWND, wintypes.LPARAM
            )
            user32.EnumWindows(WNDENUMPROC(enum_windows_proc), 0)

            if media_titles:
                active_media = " • ".join(set(media_titles))
            else:
                active_media = " • ".join(
                    set(n.replace(".exe", "").title() for n in playing_names)
                )
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
        processes = sorted(
            processes, key=lambda p: p["memory_percent"] or 0, reverse=True
        )[:30]
        return {
            "cpu_percent": cpu,
            "ram_percent": ram.percent,
            "ram_used_gb": round(ram.used / (1024**3), 2),
            "ram_total_gb": round(ram.total / (1024**3), 2),
            "top_processes": processes,
            "active_window": active_window,
            "active_media": active_media,
        }
    except Exception as e:
        return {"error": str(e)}


# ── Keyboard Shortcuts ──
class ShortcutRequest(BaseModel):
    shortcut: str  # alt-tab, alt-shift-tab, ctrl-s, win-d

# Precise key mapping using ctypes to avoid pyautogui generic key bugs
# Map format: "key": (VirtualKeyCode, HardwareScanCode, IsExtendedKey)
VK_MAP = {
    "altleft": (0xA4, 0x38, 0),
    "shiftleft": (0xA0, 0x2A, 0),
    "ctrlleft": (0xA2, 0x1D, 0),
    "winleft": (0x5B, 0x5B, 1),
    "tab": (0x09, 0x0F, 0),
    "left": (0x25, 0x4B, 1),
    "c": (0x43, 0x2E, 0),
    "s": (0x53, 0x1F, 0),
    "d": (0x44, 0x20, 0),
    "l": (0x4C, 0x26, 0),
    "a": (0x41, 0x1E, 0),
    "t": (0x54, 0x14, 0),
    "enter": (0x0D, 0x1C, 0),
    "backspace": (0x08, 0x0E, 0),
}
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_EXTENDEDKEY = 0x0001

def execute_hotkey(*keys):
    pressed = []
    
    # 1. Press each key sequentially, waiting before pressing the next
    for key in keys:
        mapping = VK_MAP.get(key)
        if mapping:
            vk, scan, ext = mapping
            flags = 0
            if ext:
                flags |= KEYEVENTF_EXTENDEDKEY
            ctypes.windll.user32.keybd_event(vk, scan, flags, 0)
            pressed.append((vk, scan, ext))
            time.sleep(0.052)  # Delay between individual down strokes
            
    # 2. Hold everything together slightly to ensure the OS registers the combo
    time.sleep(0.052)
    
    # 3. Release in reverse order with delays
    for vk, scan, ext in reversed(pressed):
        flags = KEYEVENTF_KEYUP
        if ext:
            flags |= KEYEVENTF_EXTENDEDKEY
        ctypes.windll.user32.keybd_event(vk, scan, flags, 0)
        time.sleep(0.052)


@app.post("/shortcut", dependencies=[Depends(verify_pin)])
def send_shortcut(req: ShortcutRequest):
    shortcut = req.shortcut.lower().strip()
    try:
        if shortcut == "alt-tab":
            execute_hotkey("altleft", "tab")
        elif shortcut == "alt-shift-tab":
            execute_hotkey("altleft", "shiftleft", "tab")
        elif shortcut == "ctrl-shift-left":
            execute_hotkey("ctrlleft", "shiftleft", "left")
        elif shortcut == "ctrl-c":
            execute_hotkey("ctrlleft", "c")
        elif shortcut == "ctrl-s":
            execute_hotkey("ctrlleft", "s")
        elif shortcut == "win-d":
            execute_hotkey("winleft", "d")
        elif shortcut == "win":
            execute_hotkey("winleft")
        elif shortcut == "enter":
            execute_hotkey("enter")
        elif shortcut == "backspace":
            execute_hotkey("backspace")
        elif shortcut == "ctrl-l":
            execute_hotkey("ctrlleft", "l")
        elif shortcut == "ctrl-a":
            execute_hotkey("ctrlleft", "a")
        elif shortcut == "ctrl-t":
            execute_hotkey("ctrlleft", "t")
        elif shortcut == "ctrl-shift-t":
            execute_hotkey("ctrlleft", "shiftleft", "t")
        else:
            return {"error": f"Unknown shortcut: {shortcut}"}
        return {"status": "success", "shortcut": shortcut}
    except Exception as e:
        return {"error": str(e)}

# ── Clipboard Sync ──
@app.get("/clipboard", dependencies=[Depends(verify_pin)])
def get_clipboard():
    try:
        content = pyperclip.paste()
        return {"status": "success", "content": content}
    except Exception as e:
        print(f"[CLIPBOARD] Error reading: {e}")
        return {"error": str(e)}

@app.post("/clipboard", dependencies=[Depends(verify_pin)])
def set_clipboard(req: ClipboardRequest):
    try:
        pyperclip.copy(req.content)
        print("[CLIPBOARD] Written from remote")
        return {"status": "success"}
    except Exception as e:
        print(f"[CLIPBOARD] Error writing: {e}")
        return {"error": str(e)}


# ── Panic Button (Show Desktop) ──
@app.post("/panic", dependencies=[Depends(verify_pin)])
def panic_button():
    """Instantly show desktop (Win+D) — hide everything."""
    try:
        execute_hotkey("winleft", "d")
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


# ── Connectivity (Wi-Fi & Bluetooth) ──
@app.get("/connectivity", dependencies=[Depends(verify_pin)])
async def get_connectivity():
    try:
        from winrt.windows.devices.radios import Radio, RadioKind, RadioState

        radios = await Radio.get_radios_async()
        status = {"wifi": False, "bluetooth": False}
        for r in radios:
            is_on = r.state == RadioState.ON
            if r.kind == RadioKind.WI_FI:
                status["wifi"] = is_on
            elif r.kind == RadioKind.BLUETOOTH:
                status["bluetooth"] = is_on
        return status
    except Exception as e:
        print(f"[CONNECTIVITY] Error: {e}")
        return {"error": str(e)}


@app.post("/connectivity/{radio_type}/{action}", dependencies=[Depends(verify_pin)])
async def toggle_connectivity(radio_type: str, action: str):
    try:
        from winrt.windows.devices.radios import Radio, RadioKind, RadioState

        radios = await Radio.get_radios_async()

        target_kind = None
        if radio_type == "wifi":
            target_kind = RadioKind.WI_FI
        elif radio_type == "bluetooth":
            target_kind = RadioKind.BLUETOOTH
        else:
            return {"error": "Invalid radio type. Use 'wifi' or 'bluetooth'."}

        target_state = RadioState.ON if action == "on" else RadioState.OFF

        found = False
        for r in radios:
            if r.kind == target_kind:
                found = True
                await r.set_state_async(target_state)
                break

        if not found:
            return {"error": f"{radio_type} radio not found."}

        return {"status": "success", radio_type: action == "on"}
    except Exception as e:
        print(f"[CONNECTIVITY] Error: {e}")
        return {"error": str(e)}


# ── File Transfer (PC ↔ Mobile) ──
ALLOWED_ROOTS = {}


def _init_allowed_roots():
    home = os.path.expanduser("~")
    candidates = [
        ("Desktop", os.path.join(home, "Desktop")),
        ("Downloads", os.path.join(home, "Downloads")),
        ("Documents", os.path.join(home, "Documents")),
        ("Pictures", os.path.join(home, "Pictures")),
        ("Videos", os.path.join(home, "Videos")),
        ("Music", os.path.join(home, "Music")),
    ]
    for label, p in candidates:
        if os.path.isdir(p):
            ALLOWED_ROOTS[label] = os.path.realpath(p)
            
    # Auto-detect Windows drives
    import string
    for letter in string.ascii_uppercase:
        drive = f"{letter}:\\"
        if os.path.exists(drive):
            try:
                import win32api
                name = win32api.GetVolumeInformation(drive)[0]
                label = f"{name} ({letter}:)" if name else f"Local Disk ({letter}:)"
            except Exception:
                label = f"Local Disk ({letter}:)"
            ALLOWED_ROOTS[label] = drive

_init_allowed_roots()


def _resolve_within_roots(path: str) -> str:
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    try:
        real = os.path.realpath(path)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    for root in ALLOWED_ROOTS.values():
        try:
            common = os.path.commonpath([real, root])
            if os.path.normcase(common) == os.path.normcase(root):
                return real
        except ValueError:
            continue
    raise HTTPException(status_code=403, detail="Path not allowed")


@app.get("/files/roots", dependencies=[Depends(verify_pin)])
def files_roots():
    return {
        "roots": [{"label": k, "path": v} for k, v in ALLOWED_ROOTS.items()],
    }


@app.get("/files/list", dependencies=[Depends(verify_pin)])
def files_list(path: str):
    real = _resolve_within_roots(path)
    if not os.path.isdir(real):
        raise HTTPException(status_code=400, detail="Not a directory")
    entries = []
    try:
        with os.scandir(real) as it:
            for entry in it:
                try:
                    is_dir = entry.is_dir(follow_symlinks=False)
                    stat = entry.stat(follow_symlinks=False)
                    entries.append(
                        {
                            "name": entry.name,
                            "path": os.path.join(real, entry.name),
                            "is_dir": is_dir,
                            "size": 0 if is_dir else stat.st_size,
                            "mtime": int(stat.st_mtime),
                        }
                    )
                except Exception:
                    continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")

    entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))

    parent_path = None
    parent = os.path.dirname(real)
    if parent and parent != real:
        try:
            _resolve_within_roots(parent)
            parent_path = parent
        except HTTPException:
            parent_path = None

    return {"path": real, "parent": parent_path, "entries": entries}


@app.get("/files/download")
def files_download(path: str, token: str = None):
    # Token-based auth (matches /screen/raw pattern) so mobile can use
    # Linking.openURL / native browser downloader without header support.
    clean_id = token if (token and token != "null") else None
    if not clean_id or clean_id not in TRUSTED_DEVICES:
        raise HTTPException(status_code=401, detail="Unauthorized")
    real = _resolve_within_roots(path)
    if not os.path.isfile(real):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(real, filename=os.path.basename(real))


@app.post("/files/upload", dependencies=[Depends(verify_pin)])
async def files_upload(
    dest_path: str = Form(...),
    file: UploadFile = File(...),
):
    real_dir = _resolve_within_roots(dest_path)
    if not os.path.isdir(real_dir):
        raise HTTPException(status_code=400, detail="Destination not a directory")
    safe_name = os.path.basename(file.filename or "upload.bin")
    if not safe_name:
        safe_name = "upload.bin"
    target = os.path.join(real_dir, safe_name)
    base, ext = os.path.splitext(target)
    counter = 1
    while os.path.exists(target):
        target = f"{base} ({counter}){ext}"
        counter += 1
    try:
        with open(target, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    try:
        size = os.path.getsize(target)
    except Exception:
        size = 0
    return {"status": "success", "path": target, "name": os.path.basename(target), "size": size}


# ── Pen Overlay (transparent click-through canvas) ──
OVERLAY_LOCK = threading.Lock()
OVERLAY_THREAD: Optional[threading.Thread] = None
OVERLAY_QUEUE: Optional["_stdlib_queue.Queue"] = None
OVERLAY_INFO = {"width": 0, "height": 0, "ready": False}


def _overlay_worker(q, info):
    try:
        import tkinter as tk

        root = tk.Tk()
        root.overrideredirect(True)
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        TRANSPARENT_KEY = "magenta"
        root.configure(bg=TRANSPARENT_KEY)
        try:
            root.attributes("-transparentcolor", TRANSPARENT_KEY)
        except Exception as e:
            print(f"[OVERLAY] transparentcolor failed: {e}")
        root.geometry(f"{sw}x{sh}+0+0")
        root.update_idletasks()

        # Make overlay click-through: WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW
        try:
            hwnd = ctypes.windll.user32.GetParent(root.winfo_id())
            GWL_EXSTYLE = -20
            WS_EX_LAYERED = 0x00080000
            WS_EX_TRANSPARENT = 0x00000020
            WS_EX_TOOLWINDOW = 0x00000080
            styles = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            ctypes.windll.user32.SetWindowLongW(
                hwnd,
                GWL_EXSTYLE,
                styles | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW,
            )
        except Exception as e:
            print(f"[OVERLAY] click-through setup failed: {e}")

        canvas = tk.Canvas(root, bg=TRANSPARENT_KEY, highlightthickness=0, cursor="none")
        canvas.pack(fill="both", expand=True)

        info["width"] = sw
        info["height"] = sh
        info["ready"] = True

        state = {"last_point": None, "stroke_id": None}

        def poll():
            try:
                while True:
                    msg = q.get_nowait()
                    t = msg.get("type")
                    if t == "stop":
                        try:
                            root.destroy()
                        except Exception:
                            pass
                        return
                    elif t == "clear":
                        canvas.delete("all")
                        state["last_point"] = None
                        state["stroke_id"] = None
                    elif t == "stroke":
                        sid = msg.get("stroke_id")
                        color = msg.get("color") or "#FF3B30"
                        width_px = int(msg.get("width") or 4)
                        if state["stroke_id"] != sid:
                            state["stroke_id"] = sid
                            state["last_point"] = None
                        for pt in msg.get("points", []) or []:
                            try:
                                nx, ny = pt[0], pt[1]
                            except Exception:
                                continue
                            x = max(0, min(sw - 1, int(float(nx) * sw)))
                            y = max(0, min(sh - 1, int(float(ny) * sh)))
                            if state["last_point"] is not None:
                                px, py = state["last_point"]
                                canvas.create_line(
                                    px,
                                    py,
                                    x,
                                    y,
                                    fill=color,
                                    width=width_px,
                                    capstyle=tk.ROUND,
                                    smooth=True,
                                )
                            else:
                                r = max(1, width_px / 2)
                                canvas.create_oval(
                                    x - r, y - r, x + r, y + r, fill=color, outline=color
                                )
                            state["last_point"] = (x, y)
                        if msg.get("end"):
                            state["last_point"] = None
                            state["stroke_id"] = None
            except _stdlib_queue.Empty:
                pass
            try:
                root.after(10, poll)
            except Exception:
                pass

        root.after(10, poll)
        root.mainloop()
    except Exception as e:
        print(f"[OVERLAY] worker crash: {e}")
    finally:
        info["ready"] = False


class OverlayStrokeRequest(BaseModel):
    stroke_id: str
    points: List[List[float]] = []
    end: bool = False
    color: Optional[str] = None
    width: Optional[int] = None


@app.post("/overlay/start", dependencies=[Depends(verify_pin)])
def overlay_start():
    global OVERLAY_THREAD, OVERLAY_QUEUE, OVERLAY_INFO
    with OVERLAY_LOCK:
        if OVERLAY_THREAD and OVERLAY_THREAD.is_alive() and OVERLAY_INFO.get("ready"):
            # Already running — clear any existing strokes for a fresh canvas.
            try:
                OVERLAY_QUEUE.put_nowait({"type": "clear"})
            except Exception:
                pass
            return {
                "status": "already_running",
                "width": OVERLAY_INFO.get("width", 0),
                "height": OVERLAY_INFO.get("height", 0),
            }
        OVERLAY_QUEUE = _stdlib_queue.Queue()
        OVERLAY_INFO = {"width": 0, "height": 0, "ready": False}
        OVERLAY_THREAD = threading.Thread(
            target=_overlay_worker,
            args=(OVERLAY_QUEUE, OVERLAY_INFO),
            daemon=True,
        )
        OVERLAY_THREAD.start()

    # Wait briefly for window to initialize
    deadline = time.time() + 1.5
    while time.time() < deadline:
        if OVERLAY_INFO.get("ready"):
            break
        time.sleep(0.02)

    return {
        "status": "success",
        "width": OVERLAY_INFO.get("width", 0),
        "height": OVERLAY_INFO.get("height", 0),
    }


@app.post("/overlay/stop", dependencies=[Depends(verify_pin)])
def overlay_stop():
    global OVERLAY_THREAD, OVERLAY_QUEUE, OVERLAY_INFO
    with OVERLAY_LOCK:
        q = OVERLAY_QUEUE
        t = OVERLAY_THREAD
        OVERLAY_QUEUE = None
        OVERLAY_THREAD = None
    if q is not None:
        try:
            q.put_nowait({"type": "stop"})
        except Exception:
            pass
    if t is not None:
        t.join(timeout=1.5)
    OVERLAY_INFO = {"width": 0, "height": 0, "ready": False}
    return {"status": "success"}


@app.post("/overlay/clear", dependencies=[Depends(verify_pin)])
def overlay_clear():
    q = OVERLAY_QUEUE
    if q is None:
        raise HTTPException(status_code=409, detail="Overlay not active")
    try:
        q.put_nowait({"type": "clear"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success"}


@app.post("/overlay/stroke", dependencies=[Depends(verify_pin)])
def overlay_stroke(req: OverlayStrokeRequest):
    q = OVERLAY_QUEUE
    if q is None or not OVERLAY_INFO.get("ready"):
        raise HTTPException(status_code=409, detail="Overlay not active")
    try:
        q.put_nowait(
            {
                "type": "stroke",
                "stroke_id": req.stroke_id,
                "points": req.points,
                "end": bool(req.end),
                "color": req.color,
                "width": req.width,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success"}


# --- Tray Icon ---
def create_image():
    icon_path = get_resource_path("favicon.png")
    try:
        with Image.open(icon_path) as img:
            return img.convert("RGBA")
    except Exception as e:
        print(f"Failed to load tray icon from {icon_path}: {e}")

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
