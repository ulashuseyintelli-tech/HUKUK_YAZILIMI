v28 Django Timeline + Outbox Skeleton
====================================

This pack provides:
- A Django app `engine_v28` with models for engine_runs, timeline_entries, outbox_actions
- DRF serializers + views for:
  - GET /cases/<case_id>/timeline
  - GET /engine/runs/<run_id>
  - GET /actions/<action_id>
- A minimal outbox dispatcher management command:
  - python manage.py dispatch_outbox --limit 100
- PostgreSQL recommended (JSONField usage)

How to integrate
----------------
1) Copy `engine_v28/` into your Django project (an installed app).
2) Add to INSTALLED_APPS:
   - 'engine_v28'
   - 'rest_framework'
3) Include urls:
   path('api/', include('engine_v28.urls'))
4) Run migrations:
   python manage.py makemigrations engine_v28
   python manage.py migrate

Notes
-----
- This is a skeleton: you will plug in your real action handlers (enqueue/email/locks/etc.)
- Outbox idempotency is enforced via unique `idempotency_key`.
