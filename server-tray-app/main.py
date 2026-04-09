import os
import io
import threading
import psutil
import pyautogui
import uvicorn
from fastapi import FastAPI, Response
from pydantic import BaseModel
from pystray import Icon, Menu, MenuItem
from PIL import Image, ImageDraw
from pycaw.pycaw import AudioUtilities
from comtypes import CoInitialize
from fastapi.middleware.cors import CORSMiddleware
import socket

app = FastAPI(title="PC Remote Controller")

# Enable CORS for React Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_volume_interface():
    CoInitialize()
    speakers = AudioUtilities.GetSpeakers()
    return speakers.EndpointVolume

class VolumeControl(BaseModel):
    volume: int

@app.get("/")
def ping():
    return {"status": "ok", "hostname": socket.gethostname()}

@app.get("/network")
def get_network_info():
    # Get local IP
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = "127.0.0.1"
    finally:
        s.close()
    return {"local_ip": IP, "port": 8000}

@app.get("/volume")
def get_volume():
    try:
        volume_interface = get_volume_interface()
        current_vol = round(volume_interface.GetMasterVolumeLevelScalar() * 100)
        muted = volume_interface.GetMute()
        return {"volume": current_vol, "muted": bool(muted)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/volume")
def set_volume(ctrl: VolumeControl):
    try:
        volume_interface = get_volume_interface()
        vol_scalar = max(0, min(100, ctrl.volume)) / 100.0
        volume_interface.SetMasterVolumeLevelScalar(vol_scalar, None)
        volume_interface.SetMute(0, None)
        return {"status": "success", "volume": ctrl.volume}
    except Exception as e:
        return {"error": str(e)}

@app.post("/volume/mute")
def toggle_mute():
    try:
        volume_interface = get_volume_interface()
        muted = volume_interface.GetMute()
        volume_interface.SetMute(not muted, None)
        return {"status": "success", "muted": not muted}
    except Exception as e:
        return {"error": str(e)}

@app.post("/volume/up")
def volume_up():
    """Increase volume by 5%"""
    try:
        volume_interface = get_volume_interface()
        current = volume_interface.GetMasterVolumeLevelScalar()
        new_vol = min(1.0, current + 0.05)
        volume_interface.SetMasterVolumeLevelScalar(new_vol, None)
        volume_interface.SetMute(0, None)
        return {"status": "success", "volume": round(new_vol * 100)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/volume/down")
def volume_down():
    """Decrease volume by 5%"""
    try:
        volume_interface = get_volume_interface()
        current = volume_interface.GetMasterVolumeLevelScalar()
        new_vol = max(0.0, current - 0.05)
        volume_interface.SetMasterVolumeLevelScalar(new_vol, None)
        return {"status": "success", "volume": round(new_vol * 100)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/media/{action}")
def media_control(action: str):
    if action == "playpause":
        pyautogui.press('playpause')
    elif action == "next":
        pyautogui.press('nexttrack')
    elif action == "prev":
        pyautogui.press('prevtrack')
    else:
        return {"error": "unknown action"}
    return {"status": "success", "action": action}

@app.get("/screen")
def capture_screen():
    try:
        screenshot = pyautogui.screenshot()
        img_byte_arr = io.BytesIO()
        # Compress the image slightly to make it faster to transfer over wifi
        screenshot.save(img_byte_arr, format='JPEG', quality=60)
        img_byte_arr.seek(0)
        return Response(content=img_byte_arr.read(), media_type="image/jpeg")
    except Exception as e:
        return {"error": str(e)}

@app.get("/stats")
def get_stats():
    ram = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=0.1)
    total_mem = ram.total
    
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent']):
        try:
            info = proc.info
            # Calculate memory_percent manually from rss for accuracy
            try:
                mem_info = proc.memory_info()
                rss_mb = round(mem_info.rss / (1024**2), 1)
                mem_pct = round((mem_info.rss / total_mem) * 100, 1)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                rss_mb = 0
                mem_pct = 0
            info['memory_percent'] = mem_pct
            info['memory_mb'] = rss_mb
            processes.append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
            
    # Sort by memory percent to find heavy apps
    processes = sorted(processes, key=lambda p: p['memory_percent'] or 0, reverse=True)[:30]
    
    return {
        "cpu_percent": cpu,
        "ram_percent": ram.percent,
        "ram_used_gb": round(ram.used / (1024**3), 2),
        "ram_total_gb": round(ram.total / (1024**3), 2),
        "top_processes": processes
    }

@app.post("/power/{action}")
def power_control(action: str):
    if action == "shutdown":
        os.system("shutdown /s /t 5")
        return {"status": "success", "action": action, "message": "Shutting down in 5 seconds..."}
    elif action == "restart":
        os.system("shutdown /r /t 5")
        return {"status": "success", "action": action, "message": "Restarting in 5 seconds..."}
    elif action == "cancel":
        os.system("shutdown /a")
        return {"status": "success", "action": "cancel", "message": "Shutdown/restart cancelled"}
    else:
        return {"error": "unknown action"}

# --- Tray Icon ---
def create_image():
    # Generate a simple blue icon with white square
    image = Image.new('RGB', (64, 64), color=(0, 122, 204))
    dc = ImageDraw.Draw(image)
    dc.rectangle((16, 16, 48, 48), fill=(255, 255, 255))
    return image

def setup_tray_icon():
    image = create_image()
    
    def on_quit(icon, item):
        icon.stop()
        os._exit(0)
        
    menu = Menu(MenuItem('Quit Backend', on_quit))
    icon = Icon("PCRemote", image, "PC Remote Controller Server", menu)
    
    # Fetch IP to print local network address
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        IP = s.getsockname()[0]
    except:
        IP = "127.0.0.1"
    finally:
        s.close()
    
    print(f"=====================================")
    print(f"SERVER RUNNING ON TRAY!")
    print(f"Connect React Native app to:")
    print(f"http://{IP}:8000")
    print(f"=====================================")
    
    icon.run()

def start_server():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="error")

if __name__ == "__main__":
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    setup_tray_icon()
