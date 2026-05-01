import smtplib
from email.mime.text import MIMEText

sender = "exqeon@gmail.com"  # ← email asli, bukan alias
app_password = "lljq tqyu foex xmnb"

msg = MIMEText("Kode OTP kamu: 123456, just testing")
msg['Subject'] = "OTP Code"
msg['From'] = sender
msg['To'] = "konglocorcist@gmail.com"

with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
    smtp.login(sender, app_password)
    smtp.sendmail(sender, ["konglocorcist@gmail.com"], msg.as_string())