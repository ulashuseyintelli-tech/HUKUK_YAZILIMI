# UYAP Bot v15 – Scheduler + Dry-run Validator + Step Logging

Yeni:
1) Celery beat scheduler:
   - core/tasks_scheduler.py (tick_plan_and_enqueue)
   - core/scheduler.py (plan_and_enqueue_for_all_cases)
   - settings.py -> CELERY_BEAT_SCHEDULE (10 dakikada bir)

2) Bundle validator:
   - manage.py validate_bundles [--active]

3) Job step logging:
   - run_job stub artık Snapshot + JobStep yazıyor (audit güçlenir)

Çalıştırma:
- redis + celery worker + celery beat + django runserver

Tarih: 2026-01-04
