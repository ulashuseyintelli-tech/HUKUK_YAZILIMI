# UYAP Bot v13 – Django MVP Skeleton

Bu paket:
- Django proje iskeleti (sqlite ile çalışır)
- Veri modelleri: Case/Debtor/Asset/Lien/Fact/Snapshot/JobRun/JobStep/Lock/Communication
- Celery entegrasyon iskeleti (queue)
- Admin panel (Django admin) kayıtları
- Basit REST API (DRF): cases, jobs, audit export

> Bu bir "MVP iskelet". Recipe/params/ui_map dosyalarını daha sonra storage'a koyup (db veya dosya) orchestrator'a bağlayacaksın.

Kurulum (lokal):
1) python -m venv .venv && . .venv/bin/activate
2) pip install -r requirements.txt
3) python manage.py migrate
4) python manage.py createsuperuser
5) python manage.py runserver

Celery (opsiyonel):
- Redis gerekir. docker ile:
  docker run -p 6379:6379 redis:7
- worker:
  celery -A uyapbot worker -l info
- beat (scheduler):
  celery -A uyapbot beat -l info

Tarih: 2026-01-04
