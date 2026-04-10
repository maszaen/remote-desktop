import os
import sys
import io
import threading
import psutil
import pyautogui
import uvicorn
import socket
import random
import ctypes
from fastapi import FastAPI, Response, HTTPException, Depends, Header
from pydantic import BaseModel
from pystray import Icon, Menu, MenuItem
from PIL import Image, ImageDraw
from pycaw.pycaw import AudioUtilities
from comtypes import CoInitialize
from fastapi.middleware.cors import CORSMiddleware

# Generate random 4-digit PIN
ACCESS_PIN = str(random.randint(1000, 9999))

app = FastAPI(title="Nexus PC Remote")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Auth Dependency
def verify_pin(pin: str = Header(None)):
    if str(pin) != ACCESS_PIN:
        raise HTTPException(status_code=401, detail="Invalid Nexus Pairing PIN")
    return pin


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
def capture_screen():
    try:
        import base64
        screenshot = pyautogui.screenshot()
        # Resize to max 720p width for speed
        screenshot.thumbnail((1280, 720))
        img_byte_arr = io.BytesIO()
        screenshot.save(img_byte_arr, format="JPEG", quality=40)
        img_b64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
        return {"status": "success", "image": f"data:image/jpeg;base64,{img_b64}"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/stats", dependencies=[Depends(verify_pin)])
def get_stats():
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
        }
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
                f"Your Nexus Pairing PIN is:\n\n{ACCESS_PIN}\n\nEnter this PIN in your Mobile App to pair.",
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
                        "pin": ACCESS_PIN,
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
        MenuItem("Show Pairing PIN", show_pin_code),
        MenuItem("Scan QR to Connect", show_qr_code),
        MenuItem(
            "Run on Windows Startup",
            toggle_autostart,
            checked=lambda item: is_autostart_enabled(),
        ),
        MenuItem("Quit Backend", on_quit),
    )
    icon = Icon("PCRemote", image, "Nexus PC Controller Server", menu)

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
    print(f"Pairing PIN: {ACCESS_PIN}")
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
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    setup_tray_icon()
