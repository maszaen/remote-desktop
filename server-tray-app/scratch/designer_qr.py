import tkinter as tk
from PIL import Image, ImageTk, ImageDraw
import qrcode
import sys
import math

# ════════════════════════════════════════════ CONFIG
W, H = 260, 260
# Pake hex nyaris hitam biar ga ada bleeding pink/magenta di edge
TRANS = "#000001"
BORDER_TRACK = "#E5E7EB"  # Track border loader
BORDER_ACTIVE = "#4F46E5"  # Warna animasi loader (Indigo)

IP = "192.168.1.5"
PORT = 8000
PAYLOAD = f"http://{IP}:{PORT}"

# ════════════════════════════════════════════ QR CODE (MURNI & ROUNDED)
QR_SZ = 220
R = 20  # Border radius gede

# border=3 biar kotak hitam QR ga kepotong lengkungan radius
qr = qrcode.QRCode(version=1, box_size=10, border=3)
qr.add_data(PAYLOAD)
qr.make(fit=True)
_raw = qr.make_image(fill_color="#000000", back_color="#FFFFFF")
qr_img = _raw.convert("RGBA").resize((QR_SZ, QR_SZ), Image.Resampling.LANCZOS)

# Bikin Mask Rounded HD biar ujungnya rapi
scale = 4
mask_hr = Image.new("L", (QR_SZ * scale, QR_SZ * scale), 0)
draw_hr = ImageDraw.Draw(mask_hr)
draw_hr.rounded_rectangle(
    [0, 0, QR_SZ * scale, QR_SZ * scale], radius=R * scale, fill=255
)
mask = mask_hr.resize((QR_SZ, QR_SZ), Image.Resampling.LANCZOS)
qr_img.putalpha(mask)

# ════════════════════════════════════════════ ROOT
root = tk.Tk()
root.overrideredirect(True)
root.attributes("-topmost", True)
try:
    root.wm_attributes("-transparentcolor", TRANS)
except:
    pass
root.configure(bg=TRANS)

sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
root.geometry(f"{W}x{H}+{sw-W-24}+{sh-H-60}")

canvas = tk.Canvas(root, width=W, height=H, bg=TRANS, highlightthickness=0)
canvas.pack()

# Taro QR persis di tengah
qr_tk = ImageTk.PhotoImage(qr_img)
canvas.create_image(W // 2, H // 2, anchor="center", image=qr_tk)


# ════════════════════════════════════════════ BORDER WIPE ENGINE
# Algoritma kalkulasi titik perimeter rounded rectangle
def get_rounded_rect_points(x0, y0, x1, y1, r, num_points=400):
    w, h = x1 - x0, y1 - y0
    l_top, l_right, l_bottom, l_left = w - 2 * r, h - 2 * r, w - 2 * r, h - 2 * r
    l_arc = (math.pi * r) / 2
    total_len = l_top + l_right + l_bottom + l_left + 4 * l_arc
    pts = []

    def add_seg(length, gen):
        n = max(2, int((length / total_len) * num_points))
        for i in range(n):
            pts.append(gen(i / (n - 1)))

    # Mulai dari Top-Center muter clockwise
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
    pts.append(pts[0])  # Rapatkan ujungnya
    return pts


# Nempelin koordinat animasi pas di pinggiran QR
x0, y0 = (W - QR_SZ) // 2, (H - QR_SZ) // 2
x1, y1 = x0 + QR_SZ, y0 + QR_SZ
border_pts = get_rounded_rect_points(x0, y0, x1, y1, R, 400)

flat_all = [c for p in border_pts for c in p]

# Gambar background lintasan (abu-abu pudar)
canvas.create_line(
    *flat_all, width=6, fill=BORDER_TRACK, joinstyle=tk.ROUND, capstyle=tk.ROUND
)

# Gambar loader awal
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

TOTAL_MS = 10000  # 10 Detik
STEPS = len(border_pts)
TICK_MS = TOTAL_MS // STEPS


def _tick(n=0):
    if n >= len(border_pts) - 2:
        n = 0  # Prototype: LOOP animasinya, ngga akan auto-destroy.

    # Animasi menyusut (mulai kepotong dari titik awal secara bertahap)
    sliced = border_pts[n:]

    flat_sliced = [c for p in sliced for c in p]
    if len(flat_sliced) >= 4:
        canvas.coords(loader_id, *flat_sliced)

    root.after(TICK_MS, _tick, n + 1)


root.after(TICK_MS, _tick, 1)

# ════════════════════════════════════════════ DRAG & DEV TOOLS
_d = {}


def _dp(e):
    _d["x"], _d["y"] = e.x, e.y


def _dm(e):
    if "x" in _d:
        root.geometry(
            f"+{root.winfo_x() + e.x - _d['x']}+{root.winfo_y() + e.y - _d['y']}"
        )


canvas.bind("<ButtonPress-1>", _dp)
canvas.bind("<B1-Motion>", _dm)


def _restart(e=None):
    import subprocess

    subprocess.Popen([sys.executable] + sys.argv)
    root.destroy()
    sys.exit(0)


root.bind("<Escape>", lambda e: root.destroy())
root.bind("c", lambda e: root.destroy())
root.bind("r", _restart)

print("🎨 PROTOTYPE MODE: Dev binding aktif (c/r/Esc). Animasi di-set LOOP.")

root.mainloop()
