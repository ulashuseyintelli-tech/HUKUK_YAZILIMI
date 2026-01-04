import json
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from engine_v28.models import OutboxAction, TimelineEntry

# ---- Plug your real handlers here ----
def handle_action(action: OutboxAction) -> None:
    """Raise exception on failure. Implement real behavior:
    - enqueue (Rabbit/Kafka/SQS)
    - send_email (SMTP/provider)
    - open_lock (Redis)
    etc.
    """
    # Skeleton: pretend success for now.
    return

def now_utc():
    return timezone.now()

class Command(BaseCommand):
    help = "Dispatch pending outbox actions (v28 skeleton)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)
        parser.add_argument("--max-attempts", type=int, default=8)
        parser.add_argument("--retry-seconds", type=int, default=60)

    def handle(self, *args, **opts):
        limit = max(1, min(int(opts["limit"]), 1000))
        max_attempts = max(1, int(opts["max_attempts"]))
        retry_seconds = max(5, int(opts["retry_seconds"]))

        qs = OutboxAction.objects.filter(status=OutboxAction.STATUS_PENDING).order_by("created_at")[:limit]
        count = 0

        for action in qs:
            count += 1
            try:
                with transaction.atomic():
                    action.attempt_count += 1
                    action.status = OutboxAction.STATUS_SENT
                    action.save(update_fields=["attempt_count","status","updated_at"])

                handle_action(action)

                with transaction.atomic():
                    action.status = OutboxAction.STATUS_DONE
                    action.last_error = None
                    action.next_retry_at = None
                    action.save(update_fields=["status","last_error","next_retry_at","updated_at"])

                    TimelineEntry.objects.create(
                        case_id=action.case_id,
                        type=TimelineEntry.TYPE_OUTCOME,
                        severity=TimelineEntry.SEV_INFO,
                        title=f"Action done: {action.action_type}",
                        body={"action_id": str(action.action_id), "status": action.status},
                        run=action.run,
                        source=TimelineEntry.SRC_SYSTEM,
                    )

            except Exception as e:
                err = {"error": str(e)}
                with transaction.atomic():
                    if action.attempt_count >= max_attempts:
                        action.status = OutboxAction.STATUS_DEAD
                        action.last_error = err
                        action.next_retry_at = None
                        action.save(update_fields=["status","last_error","next_retry_at","updated_at"])

                        TimelineEntry.objects.create(
                            case_id=action.case_id,
                            type=TimelineEntry.TYPE_OUTCOME,
                            severity=TimelineEntry.SEV_CRITICAL,
                            title=f"Action dead-lettered: {action.action_type}",
                            body={"action_id": str(action.action_id), "status": action.status, "last_error": err},
                            run=action.run,
                            source=TimelineEntry.SRC_SYSTEM,
                        )
                    else:
                        action.status = OutboxAction.STATUS_PENDING
                        action.last_error = err
                        action.next_retry_at = now_utc() + timezone.timedelta(seconds=retry_seconds)
                        action.save(update_fields=["status","last_error","next_retry_at","updated_at"])

                        TimelineEntry.objects.create(
                            case_id=action.case_id,
                            type=TimelineEntry.TYPE_OUTCOME,
                            severity=TimelineEntry.SEV_WARN,
                            title=f"Action failed (will retry): {action.action_type}",
                            body={"action_id": str(action.action_id), "status": action.status, "last_error": err, "next_retry_at": action.next_retry_at.isoformat()},
                            run=action.run,
                            source=TimelineEntry.SRC_SYSTEM,
                        )

        self.stdout.write(self.style.SUCCESS(f"Processed {count} actions"))
