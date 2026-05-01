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
from fastapi import (
    FastAPI,
    Response,
    HTTPException,
    Depends,
    Header,
    UploadFile,
    File,
    Form,
)
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
    "affinity_designer": {
        "label": "Affinity Designer",
        "target": "shell:AppsFolder\\Canva.Affinity_8a0j1tnjnt4a4!Canva.Affinity",
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


class BrightnessControl(BaseModel):
    brightness: int
    monitor_index: Optional[int] = None


class TabNavigateRequest(BaseModel):
    url: str


class MouseMoveRequest(BaseModel):
    dx: float
    dy: float
    sensitivity: float = 1.0


class MouseScrollRequest(BaseModel):
    dx: float = 0
    dy: float = 0


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
    "~": "`",
    "!": "1",
    "@": "2",
    "#": "3",
    "$": "4",
    "%": "5",
    "^": "6",
    "&": "7",
    "*": "8",
    "(": "9",
    ")": "0",
    "_": "-",
    "+": "=",
    "{": "[",
    "}": "]",
    "|": "\\",
    ":": ";",
    '"': "'",
    "<": ",",
    ">": ".",
    "?": "/",
}


def tap_key(key: str, hold_ms: int = 30):
    k = normalize_key(key)
    if not k:
        return

    if len(key) == 1:
        if key.isupper():
            pydirectinput.keyDown("shift")
            pydirectinput.write(key.lower(), interval=0)
            pydirectinput.keyUp("shift")
        elif key in SHIFT_CHARS:
            pydirectinput.keyDown("shift")
            pydirectinput.write(SHIFT_CHARS[key], interval=0)
            pydirectinput.keyUp("shift")
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
                while (
                    KEYBOARD_QUEUE_PAUSE.is_set() and not KEYBOARD_QUEUE_STOP.is_set()
                ):
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
                    pydirectinput.keyDown("shift")
                    pydirectinput.write(char.lower(), interval=0)
                    pydirectinput.keyUp("shift")
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


# ── Gamepad models ──
class GamepadStickRequest(BaseModel):
    stick: str = "left"  # left | right
    x: float = 0.0      # -1.0 to 1.0
    y: float = 0.0      # -1.0 to 1.0


class GamepadButtonRequest(BaseModel):
    button: str          # A, B, X, Y, LB, RB, START, BACK, etc.
    action: str = "tap"  # tap | down | up


class GamepadTriggerRequest(BaseModel):
    trigger: str         # left | right
    value: float = 0.0   # 0.0 to 1.0


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


async def _get_smtc_titles():
    """Get media titles via Windows SMTC (System Media Transport Controls).
    Returns a list of display strings for currently playing media."""
    from winrt.windows.media.control import (
        GlobalSystemMediaTransportControlsSessionManager as SessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    )
    manager = await SessionManager.request_async()
    sessions = manager.get_sessions()
    titles = []
    for session in sessions:
        info = session.get_playback_info()
        if info.playback_status != PlaybackStatus.PLAYING:
            continue
        props = await session.try_get_media_properties_async()
        title = (props.title or "").strip()
        artist = (props.artist or "").strip()
        if title:
            display = f"{artist} - {title}" if artist else title
            titles.append(display)
    return titles


# Window titles that are process/app names rather than actual media titles
_UNHELPFUL_MEDIA_TITLES = {
    "google chrome", "chrome", "microsoft edge", "msedge", "firefox", "brave",
    "opera", "microsoft.media.player", "popuphost",
}

_BROWSER_SUFFIXES = (
    " - Google Chrome", " - Microsoft Edge", " - Mozilla Firefox",
    " - Brave", " - Opera",
    " — Google Chrome", " — Microsoft Edge", " — Mozilla Firefox",
    " — Brave", " — Opera",
)


@app.get("/stats", dependencies=[Depends(verify_pin)])
async def get_stats():
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
        smtc_titles = await _get_smtc_titles()
        if smtc_titles:
            active_media = " • ".join(smtc_titles)
    except Exception as e:
        print(f"[SMTC] Failed: {e}")

    if active_media == "Not Playing":
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
                                    *_UNHELPFUL_MEDIA_TITLES,
                                ):
                                    for sfx in _BROWSER_SUFFIXES:
                                        if title.endswith(sfx):
                                            title = title[: -len(sfx)].strip()
                                            break
                                    if title:
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
    "n": (0x4E, 0x31, 0),
    "r": (0x52, 0x13, 0),
    "t": (0x54, 0x14, 0),
    "w": (0x57, 0x11, 0),
    "enter": (0x0D, 0x1C, 0),
    "backspace": (0x08, 0x0E, 0),
    "up": (0x26, 0x48, 1),
    "down": (0x28, 0x50, 1),
    "right": (0x27, 0x4D, 1),
    "f4": (0x73, 0x3E, 0),
    "f12": (0x7B, 0x58, 0),
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
        # Split shortcut string into individual keys
        keys = shortcut.split("-")

        # Map common modifiers to their left-side equivalents
        modifier_map = {
            "ctrl": "ctrlleft",
            "alt": "altleft",
            "shift": "shiftleft",
            "win": "winleft",
        }

        mapped_keys = [modifier_map.get(k, k) for k in keys]

        # Unpack the mapped keys and pass them to execute_hotkey
        execute_hotkey(*mapped_keys)
        return {"status": "success", "shortcut": shortcut}
    except Exception as e:
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


# ── Brightness Control ──
def _get_physical_monitors():
    """Enumerate physical monitors via dxva2.dll for DDC/CI brightness control."""
    from ctypes import wintypes

    dxva2 = ctypes.WinDLL("dxva2", use_last_error=True)
    user32 = ctypes.windll.user32

    class PHYSICAL_MONITOR(ctypes.Structure):
        _fields_ = [
            ("hPhysicalMonitor", wintypes.HANDLE),
            ("szPhysicalMonitorDescription", wintypes.WCHAR * 128),
        ]

    monitors_info = []
    hmonitors = []

    def _enum_cb(hMonitor, hdcMonitor, lprcMonitor, dwData):
        hmonitors.append(hMonitor)
        return True

    MONITORENUMPROC = ctypes.WINFUNCTYPE(
        ctypes.c_int, wintypes.HMONITOR, wintypes.HDC,
        ctypes.POINTER(wintypes.RECT), wintypes.LPARAM,
    )
    user32.EnumDisplayMonitors(None, None, MONITORENUMPROC(_enum_cb), 0)

    for idx, hmon in enumerate(hmonitors):
        count = wintypes.DWORD()
        if not dxva2.GetNumberOfPhysicalMonitorsFromHMONITOR(hmon, ctypes.byref(count)):
            continue
        if count.value == 0:
            continue
        arr = (PHYSICAL_MONITOR * count.value)()
        if not dxva2.GetPhysicalMonitorsFromHMONITOR(hmon, count.value, arr):
            continue
        for pm in arr:
            monitors_info.append({
                "handle": pm.hPhysicalMonitor,
                "name": pm.szPhysicalMonitorDescription or f"Monitor {idx}",
                "index": idx,
            })

    return monitors_info, dxva2


def _get_internal_brightness():
    """Get laptop internal display brightness via WMI (PowerShell)."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness"],
            capture_output=True, text=True, timeout=5,
        )
        val = result.stdout.strip()
        if val.isdigit():
            return int(val)
    except Exception:
        pass
    return None


def _set_internal_brightness(level):
    """Set laptop internal display brightness via WMI (PowerShell)."""
    level = max(0, min(100, level))
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods)"
             f".WmiSetBrightness(1, {level})"],
            capture_output=True, text=True, timeout=5,
        )
        return True
    except Exception:
        return False


@app.get("/brightness", dependencies=[Depends(verify_pin)])
def get_brightness():
    """Get brightness for all monitors (internal + external)."""
    from ctypes import wintypes
    monitors = []

    # Internal display (laptop)
    internal = _get_internal_brightness()
    if internal is not None:
        monitors.append({
            "index": -1,
            "name": "Built-in Display",
            "type": "internal",
            "brightness": internal,
            "supported": True,
        })

    # External monitors via DDC/CI
    try:
        phys, dxva2 = _get_physical_monitors()
        for m in phys:
            minimum = wintypes.DWORD()
            current = wintypes.DWORD()
            maximum = wintypes.DWORD()
            ok = dxva2.GetMonitorBrightness(
                m["handle"],
                ctypes.byref(minimum),
                ctypes.byref(current),
                ctypes.byref(maximum),
            )
            if ok:
                max_val = maximum.value if maximum.value > 0 else 100
                pct = round(current.value * 100 / max_val)
                monitors.append({
                    "index": m["index"],
                    "name": m["name"],
                    "type": "external",
                    "brightness": pct,
                    "min": minimum.value,
                    "max": maximum.value,
                    "raw": current.value,
                    "supported": True,
                })
            else:
                monitors.append({
                    "index": m["index"],
                    "name": m["name"],
                    "type": "external",
                    "brightness": None,
                    "supported": False,
                    "error": "Monitor does not support DDC/CI brightness control",
                })
            dxva2.DestroyPhysicalMonitor(m["handle"])
    except Exception as e:
        print(f"[BRIGHTNESS] DDC/CI error: {e}")

    if not monitors:
        return {
            "status": "no_monitors",
            "monitors": [],
            "message": "No adjustable monitors found on this machine",
        }

    return {"status": "success", "monitors": monitors}


@app.post("/brightness", dependencies=[Depends(verify_pin)])
def set_brightness(ctrl: BrightnessControl):
    """Set brightness for a specific monitor."""
    from ctypes import wintypes
    level = max(0, min(100, ctrl.brightness))
    idx = ctrl.monitor_index

    # Internal display
    if idx is None or idx == -1:
        internal = _get_internal_brightness()
        if internal is not None:
            if _set_internal_brightness(level):
                return {"status": "success", "brightness": level, "type": "internal"}
            return {"error": "Failed to set internal brightness"}

    # External monitor via DDC/CI
    try:
        phys, dxva2 = _get_physical_monitors()
        for m in phys:
            if idx is not None and m["index"] != idx:
                dxva2.DestroyPhysicalMonitor(m["handle"])
                continue

            minimum = wintypes.DWORD()
            current = wintypes.DWORD()
            maximum = wintypes.DWORD()
            ok = dxva2.GetMonitorBrightness(
                m["handle"],
                ctypes.byref(minimum),
                ctypes.byref(current),
                ctypes.byref(maximum),
            )
            if not ok:
                dxva2.DestroyPhysicalMonitor(m["handle"])
                return {
                    "error": "Monitor does not support DDC/CI brightness control",
                    "supported": False,
                }

            max_val = maximum.value if maximum.value > 0 else 100
            raw = round(level * max_val / 100)
            raw = max(minimum.value, min(maximum.value, raw))
            dxva2.SetMonitorBrightness(m["handle"], raw)
            dxva2.DestroyPhysicalMonitor(m["handle"])
            return {"status": "success", "brightness": level, "type": "external"}

        return {"error": f"Monitor index {idx} not found"}
    except Exception as e:
        return {"error": str(e)}


# ── Tab Manager ──
def _enum_browser_windows():
    """List all visible browser windows with titles using EnumWindows."""
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    results = []
    browser_exes = {"chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe"}

    def _cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value

        # Get process name
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        try:
            proc = psutil.Process(pid.value)
            exe = proc.name().lower()
        except Exception:
            return True

        if exe in browser_exes:
            browser_name = {
                "chrome.exe": "Chrome",
                "msedge.exe": "Edge",
                "firefox.exe": "Firefox",
                "brave.exe": "Brave",
                "opera.exe": "Opera",
            }.get(exe, exe)
            results.append({
                "hwnd": hwnd,
                "pid": pid.value,
                "title": title,
                "browser": browser_name,
                "exe": exe,
            })
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(
        ctypes.c_bool, wintypes.HWND, wintypes.LPARAM,
    )
    user32.EnumWindows(WNDENUMPROC(_cb), 0)
    return results


@app.get("/tabs", dependencies=[Depends(verify_pin)])
def get_tabs():
    """List all browser windows with their active tab titles."""
    try:
        windows = _enum_browser_windows()
        tabs = []
        for w in windows:
            title = w["title"]
            # Chrome/Edge titles: "Page Title - Browser Name"
            browser_suffix = f" - {w['browser']}"
            if title.endswith(browser_suffix):
                title = title[: -len(browser_suffix)]
            elif title.endswith(f" — {w['browser']}"):
                title = title[: title.rfind(f" — {w['browser']}")]
            tabs.append({
                "hwnd": w["hwnd"],
                "title": title,
                "browser": w["browser"],
                "pid": w["pid"],
            })
        return {"status": "success", "tabs": tabs}
    except Exception as e:
        return {"error": str(e)}


def _focus_browser_window(hwnd):
    """Bring a browser window to foreground. Returns True on success."""
    user32 = ctypes.windll.user32
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.15)
    return True


@app.post("/tabs/switch", dependencies=[Depends(verify_pin)])
def switch_tab_window(hwnd: int):
    """Bring a specific browser window to the foreground."""
    try:
        _focus_browser_window(hwnd)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/tabs/next", dependencies=[Depends(verify_pin)])
def next_tab(hwnd: Optional[int] = None):
    """Switch to next browser tab (Ctrl+Tab). Focuses target window first."""
    try:
        if hwnd:
            _focus_browser_window(hwnd)
        execute_hotkey("ctrlleft", "tab")
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/tabs/prev", dependencies=[Depends(verify_pin)])
def prev_tab(hwnd: Optional[int] = None):
    """Switch to previous browser tab (Ctrl+Shift+Tab). Focuses target window first."""
    try:
        if hwnd:
            _focus_browser_window(hwnd)
        execute_hotkey("ctrlleft", "shiftleft", "tab")
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/tabs/close", dependencies=[Depends(verify_pin)])
def close_tab(hwnd: Optional[int] = None):
    """Close current browser tab (Ctrl+W). Focuses target window first."""
    try:
        if hwnd:
            _focus_browser_window(hwnd)
        execute_hotkey("ctrlleft", "w")
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/tabs/new", dependencies=[Depends(verify_pin)])
def new_tab(hwnd: Optional[int] = None):
    """Open a new browser tab (Ctrl+T). Focuses target window first."""
    try:
        if hwnd:
            _focus_browser_window(hwnd)
        execute_hotkey("ctrlleft", "t")
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/tabs/goto", dependencies=[Depends(verify_pin)])
def goto_tab(index: int, hwnd: Optional[int] = None):
    """Jump to tab by index 1-9 (Ctrl+1 through Ctrl+9). Focuses target window first."""
    try:
        if index < 1 or index > 9:
            return {"error": "Tab index must be 1-9"}
        if hwnd:
            _focus_browser_window(hwnd)
        execute_hotkey("ctrlleft", str(index))
        return {"status": "success", "index": index}
    except Exception as e:
        return {"error": str(e)}


@app.post("/tabs/navigate", dependencies=[Depends(verify_pin)])
def navigate_tab(req: TabNavigateRequest, hwnd: Optional[int] = None):
    """Navigate current tab to a URL (Ctrl+L, type URL, Enter). Focuses target window first."""
    try:
        if hwnd:
            _focus_browser_window(hwnd)
        execute_hotkey("ctrlleft", "l")
        time.sleep(0.15)
        pyautogui.typewrite(req.url, interval=0.01)
        time.sleep(0.05)
        pyautogui.press("enter")
        return {"status": "success", "url": req.url}
    except Exception as e:
        return {"error": str(e)}


# ── Mouse / Touchpad ──

@app.post("/mouse/move", dependencies=[Depends(verify_pin)])
def mouse_move(req: MouseMoveRequest):
    """Move mouse cursor by relative delta, scaled by sensitivity."""
    try:
        dx = int(req.dx * req.sensitivity)
        dy = int(req.dy * req.sensitivity)
        if dx == 0 and dy == 0:
            return {"status": "success"}
        pyautogui.moveRel(dx, dy, _pause=False)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/mouse/click", dependencies=[Depends(verify_pin)])
def mouse_click(button: str = "left"):
    """Click mouse button (left, right, middle)."""
    try:
        pyautogui.click(button=button, _pause=False)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/mouse/doubleclick", dependencies=[Depends(verify_pin)])
def mouse_doubleclick():
    """Double-click left mouse button."""
    try:
        pyautogui.doubleClick(_pause=False)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/mouse/scroll", dependencies=[Depends(verify_pin)])
def mouse_scroll(req: MouseScrollRequest):
    """Scroll mouse wheel. Positive dy = scroll up, negative = down."""
    try:
        if req.dy != 0:
            pyautogui.scroll(int(req.dy), _pause=False)
        if req.dx != 0:
            pyautogui.hscroll(int(req.dx), _pause=False)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/mouse/down", dependencies=[Depends(verify_pin)])
def mouse_down(button: str = "left"):
    """Press and hold a mouse button (for drag start)."""
    try:
        pyautogui.mouseDown(button=button, _pause=False)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/mouse/up", dependencies=[Depends(verify_pin)])
def mouse_up(button: str = "left"):
    """Release a mouse button (for drag end)."""
    try:
        pyautogui.mouseUp(button=button, _pause=False)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


# ── Virtual Gamepad (vgamepad / ViGEmBus) ──

_vgamepad_instance = None
_vgamepad_lock = threading.RLock()
_gamepad_state_lock = threading.Lock()
_gamepad_watchdog_started = False

GAMEPAD_WATCHDOG_INTERVAL = 0.05
GAMEPAD_STICK_TTL = 0.25
GAMEPAD_BUTTON_TTL = 0.35
GAMEPAD_TRIGGER_TTL = 0.35

GAMEPAD_BUTTON_MAP = {
    "A": 0x1000,
    "B": 0x2000,
    "X": 0x4000,
    "Y": 0x8000,
    "LB": 0x0100,
    "RB": 0x0200,
    "START": 0x0010,
    "BACK": 0x0020,
    "DPAD_UP": 0x0001,
    "DPAD_DOWN": 0x0002,
    "DPAD_LEFT": 0x0004,
    "DPAD_RIGHT": 0x0008,
    "LEFT_THUMB": 0x0040,
    "RIGHT_THUMB": 0x0080,
    "GUIDE": 0x0400,
}

_gamepad_stick_seen = {"left": 0.0, "right": 0.0}
_gamepad_stick_value = {"left": (0.0, 0.0), "right": (0.0, 0.0)}
_gamepad_button_seen = {}
_gamepad_trigger_seen = {"left": 0.0, "right": 0.0}
_gamepad_trigger_value = {"left": 0.0, "right": 0.0}


def _clear_gamepad_state():
    with _gamepad_state_lock:
        now = time.time()
        for stick in _gamepad_stick_seen:
            _gamepad_stick_seen[stick] = now
            _gamepad_stick_value[stick] = (0.0, 0.0)
        _gamepad_button_seen.clear()
        for trigger in _gamepad_trigger_seen:
            _gamepad_trigger_seen[trigger] = now
            _gamepad_trigger_value[trigger] = 0.0


def _start_gamepad_watchdog():
    global _gamepad_watchdog_started
    if _gamepad_watchdog_started:
        return
    _gamepad_watchdog_started = True
    threading.Thread(target=_gamepad_watchdog_loop, daemon=True).start()


def _gamepad_watchdog_loop():
    while True:
        time.sleep(GAMEPAD_WATCHDOG_INTERVAL)
        now = time.time()
        expired_sticks = []
        expired_buttons = []
        expired_triggers = []

        with _gamepad_state_lock:
            for stick, value in _gamepad_stick_value.items():
                if value != (0.0, 0.0) and now - _gamepad_stick_seen.get(stick, 0.0) > GAMEPAD_STICK_TTL:
                    expired_sticks.append(stick)
            for button, seen_at in list(_gamepad_button_seen.items()):
                if now - seen_at > GAMEPAD_BUTTON_TTL:
                    expired_buttons.append(button)
            for trigger, value in _gamepad_trigger_value.items():
                if value > 0.0 and now - _gamepad_trigger_seen.get(trigger, 0.0) > GAMEPAD_TRIGGER_TTL:
                    expired_triggers.append(trigger)

        if not expired_sticks and not expired_buttons and not expired_triggers:
            continue

        try:
            with _vgamepad_lock:
                gp = _vgamepad_instance
                if gp is None:
                    _clear_gamepad_state()
                    continue

                import vgamepad as vg

                changed = False
                for stick in expired_sticks:
                    if stick == "right":
                        gp.right_joystick_float(x_value_float=0.0, y_value_float=0.0)
                    else:
                        gp.left_joystick_float(x_value_float=0.0, y_value_float=0.0)
                    changed = True

                for button in expired_buttons:
                    btn_val = GAMEPAD_BUTTON_MAP.get(button)
                    if btn_val is not None:
                        gp.release_button(button=vg.XUSB_BUTTON(btn_val))
                        changed = True

                for trigger in expired_triggers:
                    if trigger == "right":
                        gp.right_trigger_float(value_float=0.0)
                    else:
                        gp.left_trigger_float(value_float=0.0)
                    changed = True

                if changed:
                    gp.update()

            with _gamepad_state_lock:
                for stick in expired_sticks:
                    _gamepad_stick_seen[stick] = now
                    _gamepad_stick_value[stick] = (0.0, 0.0)
                for button in expired_buttons:
                    _gamepad_button_seen.pop(button, None)
                for trigger in expired_triggers:
                    _gamepad_trigger_seen[trigger] = now
                    _gamepad_trigger_value[trigger] = 0.0
        except Exception:
            pass


def _get_gamepad():
    global _vgamepad_instance
    with _vgamepad_lock:
        if _vgamepad_instance is None:
            import vgamepad as vg
            _vgamepad_instance = vg.VX360Gamepad()
            _clear_gamepad_state()
            _start_gamepad_watchdog()
        return _vgamepad_instance


@app.post("/gamepad/connect", dependencies=[Depends(verify_pin)])
def gamepad_connect():
    try:
        gp = _get_gamepad()
        with _vgamepad_lock:
            gp.reset()
            gp.update()
        _clear_gamepad_state()
        _start_gamepad_watchdog()
        return {"status": "success", "message": "Virtual gamepad connected"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/gamepad/disconnect", dependencies=[Depends(verify_pin)])
def gamepad_disconnect():
    global _vgamepad_instance
    try:
        with _vgamepad_lock:
            if _vgamepad_instance is not None:
                _vgamepad_instance.reset()
                _vgamepad_instance.update()
                _vgamepad_instance = None
        _clear_gamepad_state()
        return {"status": "success", "message": "Virtual gamepad disconnected"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/gamepad/stick", dependencies=[Depends(verify_pin)])
def gamepad_stick(req: GamepadStickRequest):
    try:
        gp = _get_gamepad()
        x = max(-1.0, min(1.0, req.x))
        y = max(-1.0, min(1.0, req.y))
        stick = "right" if req.stick == "right" else "left"
        with _vgamepad_lock:
            if stick == "right":
                gp.right_joystick_float(x_value_float=x, y_value_float=y)
            else:
                gp.left_joystick_float(x_value_float=x, y_value_float=y)
            gp.update()
        with _gamepad_state_lock:
            _gamepad_stick_seen[stick] = time.time()
            _gamepad_stick_value[stick] = (x, y)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/gamepad/button", dependencies=[Depends(verify_pin)])
def gamepad_button(req: GamepadButtonRequest):
    try:
        gp = _get_gamepad()
        import vgamepad as vg
        btn_val = GAMEPAD_BUTTON_MAP.get(req.button.upper())
        if btn_val is None:
            return {"error": f"Unknown button: {req.button}"}
        btn = vg.XUSB_BUTTON(btn_val)
        action = req.action.lower().strip()
        button = req.button.upper()
        with _vgamepad_lock:
            if action == "down":
                gp.press_button(button=btn)
            elif action == "hold":
                gp.press_button(button=btn)
            elif action == "up":
                gp.release_button(button=btn)
            else:
                gp.press_button(button=btn)
                gp.update()
                time.sleep(0.06)
                gp.release_button(button=btn)
            gp.update()
        with _gamepad_state_lock:
            if action in ("down", "hold"):
                _gamepad_button_seen[button] = time.time()
            elif action == "up" or action not in ("down", "hold"):
                _gamepad_button_seen.pop(button, None)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/gamepad/trigger", dependencies=[Depends(verify_pin)])
def gamepad_trigger(req: GamepadTriggerRequest):
    try:
        gp = _get_gamepad()
        val = max(0.0, min(1.0, req.value))
        trigger = "right" if req.trigger == "right" else "left"
        with _vgamepad_lock:
            if trigger == "right":
                gp.right_trigger_float(value_float=val)
            else:
                gp.left_trigger_float(value_float=val)
            gp.update()
        with _gamepad_state_lock:
            _gamepad_trigger_seen[trigger] = time.time()
            _gamepad_trigger_value[trigger] = val
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/gamepad/reset", dependencies=[Depends(verify_pin)])
def gamepad_reset():
    try:
        gp = _get_gamepad()
        with _vgamepad_lock:
            gp.reset()
            gp.update()
        _clear_gamepad_state()
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}


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
                import ctypes

                kernel32 = ctypes.windll.kernel32
                volumeNameBuffer = ctypes.create_unicode_buffer(1024)
                rc = kernel32.GetVolumeInformationW(
                    ctypes.c_wchar_p(drive),
                    volumeNameBuffer,
                    ctypes.sizeof(volumeNameBuffer),
                    None,
                    None,
                    None,
                    None,
                    0,
                )
                if rc:
                    name = volumeNameBuffer.value
                    label = f"{name} ({letter}:)" if name else f"Local Disk ({letter}:)"
                else:
                    label = f"Local Disk ({letter}:)"
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
    return {
        "status": "success",
        "path": target,
        "name": os.path.basename(target),
        "size": size,
    }


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

        canvas = tk.Canvas(
            root, bg=TRANSPARENT_KEY, highlightthickness=0, cursor="none"
        )
        canvas.pack(fill="both", expand=True)

        info["width"] = sw
        info["height"] = sh
        info["ready"] = True

        state = {"last_point": None, "stroke_id": None, "gen": 0}

        def _start_replay(pts, color, width_px):
            # Each replay has its own `last_pt` so that multiple queued
            # replays don't trample each other's connecting lines.
            last = {"pt": None}
            my_gen = state["gen"]

            def draw_segment(i):
                # If the canvas was cleared or stopped after this replay
                # was scheduled, bail out so nothing is drawn and no
                # stale TkError surfaces.
                if state["gen"] != my_gen:
                    return
                if i >= len(pts):
                    return
                try:
                    p = pts[i]
                    nx = float(p[0])
                    ny = float(p[1])
                    t_ms = float(p[2]) if len(p) > 2 else 0.0
                except Exception:
                    return
                x = max(0, min(sw - 1, int(nx * sw)))
                y = max(0, min(sh - 1, int(ny * sh)))
                try:
                    if last["pt"] is not None:
                        px, py = last["pt"]
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
                            x - r,
                            y - r,
                            x + r,
                            y + r,
                            fill=color,
                            outline=color,
                        )
                except tk.TclError:
                    # Window torn down mid-replay.
                    return
                last["pt"] = (x, y)
                if i + 1 < len(pts):
                    curr_t = t_ms
                    try:
                        next_t = float(pts[i + 1][2]) if len(pts[i + 1]) > 2 else curr_t
                    except Exception:
                        next_t = curr_t
                    dt = int(max(1, min(200, next_t - curr_t)))
                    try:
                        root.after(dt, lambda: draw_segment(i + 1))
                    except Exception:
                        return

            try:
                root.after(0, lambda: draw_segment(0))
            except Exception:
                pass

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
                        # Bump generation so any in-flight replays abort.
                        state["gen"] += 1
                    elif t == "replay":
                        pts = msg.get("points", []) or []
                        color = msg.get("color") or "#FF3B30"
                        width_px = int(msg.get("width") or 6)
                        if pts:
                            _start_replay(pts, color, width_px)
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
                                    x - r,
                                    y - r,
                                    x + r,
                                    y + r,
                                    fill=color,
                                    outline=color,
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


class OverlayReplayRequest(BaseModel):
    stroke_id: str
    points: List[List[float]] = []  # each point: [nx, ny, t_ms]
    color: Optional[str] = None
    width: Optional[int] = None


@app.post("/overlay/replay_stroke", dependencies=[Depends(verify_pin)])
def overlay_replay_stroke(req: OverlayReplayRequest):
    # Queue a stroke to be replayed on the PC overlay with the client's
    # original timing. Each inner point is [nx, ny, t_ms]; the Tk worker
    # schedules each segment with root.after(dt) using the recorded deltas.
    q = OVERLAY_QUEUE
    if q is None or not OVERLAY_INFO.get("ready"):
        raise HTTPException(status_code=409, detail="Overlay not active")
    try:
        q.put_nowait(
            {
                "type": "replay",
                "stroke_id": req.stroke_id,
                "points": req.points,
                "color": req.color,
                "width": req.width,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success"}


# --- Terminal Access ---
TERMINAL_CWD = os.path.expanduser("~")
TERMINAL_CWD_LOCK = threading.Lock()


class TerminalExecRequest(BaseModel):
    command: str
    timeout: Optional[int] = 30


@app.post("/terminal/exec", dependencies=[Depends(verify_pin)])
def terminal_exec(req: TerminalExecRequest):
    global TERMINAL_CWD
    cmd = req.command.strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="Empty command")

    with TERMINAL_CWD_LOCK:
        cwd = TERMINAL_CWD

    # Handle cd separately so the working directory persists across calls
    if cmd.lower() == "cd" or cmd.lower().startswith("cd ") or cmd.lower().startswith("cd\t"):
        parts = cmd.split(None, 1)
        target = parts[1].strip().strip('"').strip("'") if len(parts) > 1 else os.path.expanduser("~")
        try:
            # Bare drive letter "D:" → "D:\" so we go to root, not last cwd on that drive
            if len(target) == 2 and target[1] == ':' and target[0].isalpha():
                target = target + '\\'
            new_cwd = os.path.normpath(os.path.join(cwd, target))
            if os.path.isdir(new_cwd):
                with TERMINAL_CWD_LOCK:
                    TERMINAL_CWD = new_cwd
                return {"stdout": "", "stderr": "", "exit_code": 0, "cwd": new_cwd}
            else:
                return {
                    "stdout": "",
                    "stderr": f"The system cannot find the path specified: {new_cwd}",
                    "exit_code": 1,
                    "cwd": cwd,
                }
        except Exception as e:
            return {"stdout": "", "stderr": str(e), "exit_code": 1, "cwd": cwd}

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", cmd],
            capture_output=True,
            text=True,
            timeout=min(req.timeout, 120),
            cwd=cwd,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode,
            "cwd": cwd,
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Command timed out after {req.timeout}s",
            "exit_code": -1,
            "cwd": cwd,
        }
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": -1, "cwd": cwd}


@app.get("/terminal/cwd", dependencies=[Depends(verify_pin)])
def terminal_cwd():
    with TERMINAL_CWD_LOCK:
        return {"cwd": TERMINAL_CWD}


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
                import tkinter as tk
                from PIL import Image, ImageTk, ImageDraw
                import ctypes
                import math

                W, H = 260, 260
                TRANS = "#000001"
                BORDER_TRACK = "#E5E7EB"
                BORDER_ACTIVE = "#4F46E5"

                payload = json.dumps(
                    {
                        "url": f"http://{IP}:8000",
                        "pin": PAIRING_CODE,
                        "hostname": socket.gethostname(),
                    }
                )

                QR_SZ = 220
                R = 20

                qr = qrcode.QRCode(version=1, box_size=10, border=3)
                qr.add_data(payload)
                qr.make(fit=True)
                _raw = qr.make_image(fill_color="#000000", back_color="#FFFFFF")
                qr_img = _raw.convert("RGBA").resize(
                    (QR_SZ, QR_SZ), Image.Resampling.LANCZOS
                )

                scale = 4
                mask_hr = Image.new("L", (QR_SZ * scale, QR_SZ * scale), 0)
                draw_hr = ImageDraw.Draw(mask_hr)
                draw_hr.rounded_rectangle(
                    [0, 0, QR_SZ * scale, QR_SZ * scale], radius=R * scale, fill=255
                )
                mask = mask_hr.resize((QR_SZ, QR_SZ), Image.Resampling.LANCZOS)
                qr_img.putalpha(mask)

                root = tk.Tk()
                root.overrideredirect(True)
                root.attributes("-topmost", True)
                try:
                    root.wm_attributes("-transparentcolor", TRANS)
                except Exception:
                    pass
                root.configure(bg=TRANS)

                sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
                root.geometry(f"{W}x{H}+{sw-W-24}+{sh-H-60}")

                canvas = tk.Canvas(
                    root, width=W, height=H, bg=TRANS, highlightthickness=0
                )
                canvas.pack()

                qr_tk = ImageTk.PhotoImage(qr_img)
                canvas.create_image(W // 2, H // 2, anchor="center", image=qr_tk)

                def get_rounded_rect_points(x0, y0, x1, y1, r, num_points=400):
                    w, h = x1 - x0, y1 - y0
                    l_top, l_right, l_bottom, l_left = (
                        w - 2 * r,
                        h - 2 * r,
                        w - 2 * r,
                        h - 2 * r,
                    )
                    l_arc = (math.pi * r) / 2
                    total_len = l_top + l_right + l_bottom + l_left + 4 * l_arc
                    pts = []

                    def add_seg(length, gen):
                        n = max(2, int((length / total_len) * num_points))
                        for i in range(n):
                            pts.append(gen(i / (n - 1)))

                    add_seg(l_top / 2, lambda t: (x0 + w / 2 + (l_top / 2) * t, y0))
                    add_seg(
                        l_arc,
                        lambda t: (
                            x1 - r + r * math.cos(math.radians(-90 + 90 * t)),
                            y0 + r + r * math.sin(math.radians(-90 + 90 * t)),
                        ),
                    )
                    add_seg(l_right, lambda t: (x1, y0 + r + l_right * t))
                    add_seg(
                        l_arc,
                        lambda t: (
                            x1 - r + r * math.cos(math.radians(0 + 90 * t)),
                            y1 - r + r * math.sin(math.radians(0 + 90 * t)),
                        ),
                    )
                    add_seg(l_bottom, lambda t: (x1 - r - l_bottom * t, y1))
                    add_seg(
                        l_arc,
                        lambda t: (
                            x0 + r + r * math.cos(math.radians(90 + 90 * t)),
                            y1 - r + r * math.sin(math.radians(90 + 90 * t)),
                        ),
                    )
                    add_seg(l_left, lambda t: (x0, y1 - r - l_left * t))
                    add_seg(
                        l_arc,
                        lambda t: (
                            x0 + r + r * math.cos(math.radians(180 + 90 * t)),
                            y0 + r + r * math.sin(math.radians(180 + 90 * t)),
                        ),
                    )
                    add_seg(l_top / 2, lambda t: (x0 + r + (l_top / 2) * t, y0))
                    pts.append(pts[0])
                    return pts

                x0, y0 = (W - QR_SZ) // 2, (H - QR_SZ) // 2
                x1, y1 = x0 + QR_SZ, y0 + QR_SZ
                border_pts = get_rounded_rect_points(x0, y0, x1, y1, R, 400)
                flat_all = [c for p in border_pts for c in p]

                canvas.create_line(
                    *flat_all,
                    width=6,
                    fill=BORDER_TRACK,
                    joinstyle=tk.ROUND,
                    capstyle=tk.ROUND,
                )

                loader_id = canvas.create_line(
                    flat_all[0],
                    flat_all[1],
                    flat_all[2],
                    flat_all[3],
                    width=6,
                    fill=BORDER_ACTIVE,
                    joinstyle=tk.ROUND,
                    capstyle=tk.ROUND,
                )

                TOTAL_MS = 10000
                STEPS = len(border_pts)
                TICK_MS = TOTAL_MS // STEPS

                def _tick(n=0):
                    if n >= len(border_pts) - 2:
                        root.destroy()
                        return

                    sliced = border_pts[n:]
                    flat_sliced = [c for p in sliced for c in p]
                    if len(flat_sliced) >= 4:
                        canvas.coords(loader_id, *flat_sliced)

                    root.after(TICK_MS, _tick, n + 1)

                root.after(TICK_MS, _tick, 1)

                _d = {}

                def _dp(e):
                    _d["x"], _d["y"] = e.x, e.y

                def _dm(e):
                    if "x" in _d:
                        setattr(root, "_dragged", True)
                        root.geometry(
                            f"+{root.winfo_x() + e.x - _d['x']}+{root.winfo_y() + e.y - _d['y']}"
                        )

                canvas.bind("<ButtonPress-1>", _dp)
                canvas.bind("<B1-Motion>", _dm)
                canvas.bind(
                    "<ButtonRelease-1>",
                    lambda e: (
                        root.destroy()
                        if getattr(root, "_dragged", False) is False
                        else setattr(root, "_dragged", False)
                    ),
                )

                root.mainloop()
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

    def get_local_ip():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            pass

        try:
            hostname = socket.gethostname()
            ips = socket.gethostbyname_ex(hostname)[2]
            for ip in ips:
                if ip.startswith("192.168."):
                    return ip
            if ips:
                return ips[0]
        except Exception:
            pass
        return "127.0.0.1"

    IP = get_local_ip()

    menu = Menu(
        MenuItem(
            "Local Network Monitoring",
            lambda x: None,
            enabled=False,
            checked=lambda item: True,
        ),
        MenuItem(
            f"{IP} (8000)",
            lambda x: None,
            enabled=False,
        ),
        Menu.SEPARATOR,
        MenuItem("Pair New Device (QR)", show_qr_code),
        MenuItem("Show Pairing OTP Code", show_pin_code),
        Menu.SEPARATOR,
        MenuItem(
            "Run on Windows Startup",
            toggle_autostart,
            checked=lambda item: is_autostart_enabled(),
        ),
        MenuItem("Turn-off Server", on_quit),
    )
    icon = Icon("PCRemote", image, "Nexus PC Controller Server", menu=menu)

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
