import tkinter as tk
from PIL import Image, ImageTk, ImageDraw
import qrcode

qr = qrcode.QRCode(version=1, box_size=6, border=2)
qr.add_data("http://192.168.1.5:8000")
qr.make(fit=True)
img = qr.make_image(fill_color="black", back_color="white")

root = tk.Tk()
root.overrideredirect(True)
root.attributes("-topmost", True)

# Set transparent color key
trans_color = "#abcdef"
root.wm_attributes("-transparentcolor", trans_color)
root.configure(bg=trans_color)

w, h = 250, 300
sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
x, y = sw - w - 20, sh - h - 60
root.geometry(f"{w}x{h}+{x}+{y}")

canvas = tk.Canvas(root, width=w, height=h, bg=trans_color, highlightthickness=0)
canvas.pack(fill="both", expand=True)

def round_rectangle(x1, y1, x2, y2, radius=25, **kwargs):
    points = [x1+radius, y1,
              x1+radius, y1,
              x2-radius, y1,
              x2-radius, y1,
              x2, y1,
              x2, y1+radius,
              x2, y1+radius,
              x2, y2-radius,
              x2, y2-radius,
              x2, y2,
              x2-radius, y2,
              x2-radius, y2,
              x1+radius, y2,
              x1+radius, y2,
              x1, y2,
              x1, y2-radius,
              x1, y2-radius,
              x1, y1+radius,
              x1, y1+radius,
              x1, y1]
    return canvas.create_polygon(points, **kwargs, smooth=True)

# Draw dark rounded background
round_rectangle(2, 2, w-2, h-2, radius=20, fill="#0D0D12", outline="#4F8EF7", width=2)

# Add X button
close_btn = tk.Button(root, text="✕", fg="#F7504F", bg="#0D0D12", bd=0, font=("Segoe UI", 12, "bold"), command=root.destroy, activebackground="#0D0D12", activeforeground="#F7504F", cursor="hand2")
close_btn.place(x=w-35, y=10, width=25, height=25)

# Add Title
title = tk.Label(root, text="Scan to Connect", fg="#F2F2F7", bg="#0D0D12", font=("Segoe UI", 10, "bold"))
title.place(x=20, y=12)

tk_img = ImageTk.PhotoImage(img)
lbl = tk.Label(root, image=tk_img, bg="white", bd=0)
lbl.place(x=(w - img.size[0]) // 2, y=50)

# Make draggable
def start_move(event):
    root.x = event.x
    root.y = event.y

def stop_move(event):
    root.x = None
    root.y = None

def do_move(event):
    deltax = event.x - root.x
    deltay = event.y - root.y
    x = root.winfo_x() + deltax
    y = root.winfo_y() + deltay
    root.geometry(f"+{x}+{y}")

canvas.bind("<ButtonPress-1>", start_move)
canvas.bind("<ButtonRelease-1>", stop_move)
canvas.bind("<B1-Motion>", do_move)

title.bind("<ButtonPress-1>", start_move)
title.bind("<ButtonRelease-1>", stop_move)
title.bind("<B1-Motion>", do_move)

root.after(4000, root.destroy)
root.mainloop()

