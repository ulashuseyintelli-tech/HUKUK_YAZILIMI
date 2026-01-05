from __future__ import annotations
from typing import Any, Dict
import os

from django.core.mail import send_mail

# Optional: redis (install redis>=5)
try:
    import redis
except Exception:  # pragma: no cover
    redis = None

def handle_open_lock(payload: Dict[str, Any]) -> None:
    """Open a lock (best: Redis SET NX with TTL)."""
    key = payload.get("key")
    ttl_sec = int(payload.get("ttl_sec", 3600))
    if not key:
        raise ValueError("open_lock requires payload.key")

    redis_url = os.getenv("REDIS_URL")
    if not redis_url or redis is None:
        # Skeleton fallback: do nothing (treat as success) OR raise to force config.
        # Choose strictness: raising is safer for production.
        raise RuntimeError("Redis not configured for open_lock (set REDIS_URL and install redis)")
    r = redis.Redis.from_url(redis_url)
    ok = r.set(key, "1", nx=True, ex=ttl_sec)
    if not ok:
        # lock already exists: not a failure; treat as success
        return

def handle_enqueue(payload: Dict[str, Any]) -> None:
    """Enqueue work.

    Recommended: Celery delay/app.send_task.
    Here we provide a generic placeholder: you plug your queue.
    """
    queue = payload.get("queue")
    if not queue:
        raise ValueError("enqueue requires payload.queue")

    # Example Celery integration (pseudo):
    # from your_project.celery_app import app
    # app.send_task(f"queues.{queue}", kwargs=payload)

    # Skeleton: no-op success.
    return

def handle_send_email(payload: Dict[str, Any]) -> None:
    """Send email via Django EmailBackend."""
    to = payload.get("to")
    subject = payload.get("subject")
    body = payload.get("body")
    if not (to and subject and body):
        raise ValueError("send_email requires to, subject, body")

    if isinstance(to, str):
        to_list = [to]
    else:
        to_list = list(to)

    send_mail(
        subject=subject,
        message=body,
        from_email=payload.get("from_email"),
        recipient_list=to_list,
        fail_silently=False,
    )
