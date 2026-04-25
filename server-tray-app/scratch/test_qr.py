import tkinter as tk
from PIL import Image, ImageTk
import qrcode

qr = qrcode.QRCode(version=1, box_size=6, border=2)
qr.add_data("http://192.168.1.5:8000")
qr.make(fit=True)
img = qr.make_image(fill_color="black", back_color="white")

root = tk.Tk()
root.title("Nexus QR")
root.attributes("-topmost", True)
root.overrideredirect(True)
root.configure(bg="#0D0D12", highlightthickness=2, highlightbackground="#4F8EF7")

title_frame = tk.Frame(root, bg="#0D0D12")
title_frame.pack(fill="x", padx=10, pady=5)

title_lbl = tk.Label(title_frame, text="Scan with Nexus App", fg="#F2F2F7", bg="#0D0D12", font=("Segoe UI", 10, "bold"))
title_lbl.pack(side="left")

close_btn = tk.Button(title_frame, text="X", fg="#F7504F", bg="#0D0D12", bd=0, font=("Segoe UI", 10, "bold"), command=root.destroy)
close_btn.pack(side="right")

tk_img = ImageTk.PhotoImage(img)
lbl = tk.Label(root, image=tk_img, bg="white", bd=0)
lbl.pack(padx=20, pady=(0, 20))

root.update_idletasks()
w = root.winfo_reqwidth()
h = root.winfo_reqheight()
sw = root.winfo_screenwidth()
sh = root.winfo_screenheight()

x = sw - w - 20
y = sh - h - 60
root.geometry(f"{w}x{h}+{x}+{y}")

# close after 3s to not hang the test
root.after(3000, root.destroy)
root.mainloop()

