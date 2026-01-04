import uuid
from django.db import transaction, IntegrityError
from django.utils import timezone
from .models import EngineRun, TimelineEntry, OutboxAction

def add_timeline(case_id: str, type: str, title: str, *, severity: str="info", body=None, run: EngineRun=None, source: str="engine") -> TimelineEntry:
    return TimelineEntry.objects.create(
        case_id=case_id,
        type=type,
        severity=severity,
        title=title,
        body=body,
        run=run,
        source=source,
    )

def create_outbox_action(case_id: str, action_type: str, idempotency_key: str, payload: dict, *, run: EngineRun=None) -> OutboxAction | None:
    """Creates an outbox action if idempotency_key not seen before.
    Returns created action, or None if duplicate.
    """
    try:
        return OutboxAction.objects.create(
            run=run,
            case_id=case_id,
            action_type=action_type,
            idempotency_key=idempotency_key,
            payload=payload,
            status=OutboxAction.STATUS_PENDING,
        )
    except IntegrityError:
        return None
