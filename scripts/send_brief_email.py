"""Send the no-model HTML report using existing EMAIL_* settings."""
import json
import os
import re
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from email.utils import format_datetime, make_msgid
from pathlib import Path
from zoneinfo import ZoneInfo

def main():
    sender = os.getenv("EMAIL_SENDER", "").strip()
    receivers = [x.strip() for x in os.getenv("EMAIL_RECEIVERS", "").split(",") if x.strip()]
    password = os.getenv("EMAIL_PASSWORD", "").strip()
    if not password or not receivers or any(not re.fullmatch(r"[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+", x) for x in [sender] + receivers):
        raise ValueError("Invalid email configuration")
    report_dir = Path("reports")
    report = json.loads((report_dir / "daily-brief.json").read_text(encoding="utf-8"))
    html = (report_dir / "daily-brief.html").read_text(encoding="utf-8")
    msg = EmailMessage()
    msg["Subject"] = "A股每日简报｜" + report["date"] + "｜无模型试用"
    msg["From"] = sender
    msg["To"] = ", ".join(receivers)
    msg["Date"] = format_datetime(datetime.now(ZoneInfo("Asia/Shanghai")))
    msg["Message-ID"] = make_msgid(domain=sender.split("@")[1])
    msg.set_content((report_dir / "daily-brief.txt").read_text(encoding="utf-8"))
    msg.add_alternative(html, subtype="html")
    msg.add_attachment(html.encode("utf-8"), maintype="text", subtype="html",
                       filename="ashare_brief_" + report["date"] + "_no_model.html")
    with smtplib.SMTP_SSL(os.getenv("SMTP_HOST", "smtp.qq.com"), int(os.getenv("SMTP_PORT", "465")),
                          context=ssl.create_default_context(), timeout=30) as smtp:
        smtp.login(sender, password)
        if smtp.send_message(msg):
            raise RuntimeError("Recipient refused; do not resend automatically")
    print("SMTP_ACCEPTED: 无模型简报HTML正文及附件已被SMTP接受。")
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            out.write("\n\nHTML正文及附件已被SMTP接受；是否进入收件箱需收件方核实。\n")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("邮件发送未完成（" + type(error).__name__ + "）；请检查SMTP配置或网络。")
        raise SystemExit(1)
