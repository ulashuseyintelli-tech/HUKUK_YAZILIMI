v28 FactStore (DB) + Action Handlers Pack (Django)
=================================================

This pack adds two missing "real" pieces:
1) FactStore backed by PostgreSQL tables (facts + flags with audit)
2) Action handlers plugged into the Outbox dispatcher:
   - open_lock: Redis lock skeleton (fallback DB lock option described)
   - enqueue: Celery task enqueue skeleton (fallback: DB queue table)
   - send_email: SMTP send skeleton (Django EmailBackend)

You will still need to:
- Decide your lock backend (Redis recommended)
- Decide your queue (Celery/RQ/Kafka/SQS)
- Provide credentials/settings for email/redis/broker

Contents
--------
- engine_v28/factstore_db/models.py        (CaseFact, CaseFlag, FactAudit)
- engine_v28/factstore_db/adapter.py       (DBFactStore implementing FactStore)
- engine_v28/actions/handlers.py           (action handlers)
- engine_v28/actions/router.py             (routes action_type -> handler)
- engine_v28/patches/dispatch_outbox.py    (drop-in replacement for previous dispatcher)

Install
-------
1) Copy folders under `engine_v28/` into your existing `engine_v28` app.
2) Add migrations:
   python manage.py makemigrations engine_v28
   python manage.py migrate
3) Replace your dispatcher command with patches/dispatch_outbox.py content
   (or patch it to call actions.router.dispatch(action)).

Settings (examples)
-------------------
- Redis:
  REDIS_URL="redis://localhost:6379/0"
- Celery:
  CELERY_BROKER_URL="redis://localhost:6379/1"
- Email:
  EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS

