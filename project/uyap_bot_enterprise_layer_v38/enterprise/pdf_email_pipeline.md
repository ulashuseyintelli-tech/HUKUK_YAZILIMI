## Weekly PDF + Email Pipeline

Hedef:
- Haftalık rapor PDF üret
- Tenant bazlı alıcılara e-posta at (Ops/Lawyer)

Bileşenler:
- ReportBuilder: JSON -> PDF (ReportLab)
- Mailer: SMTP veya provider (SendGrid vs.)
- Scheduler: her Pazartesi 09:00 tenant bazlı çalışır
- Audit: gönderim kanıtları

Not: Bu dosya sadece pipeline tasarımıdır.
