"""Optional: quick seed helper for local dev.

Usage (Django shell):
  from engine_v28.seed import seed_case
  seed_case("C-2026-00091")
"""
import uuid
from django.utils import timezone
from .models import EngineRun, TimelineEntry, OutboxAction

def seed_case(case_id: str):
    run = EngineRun.objects.create(
        case_id=case_id,
        rule_id="post_asset_discovery",
        trigger_event_id="uyap:evt:123",
        snapshot_hash="sha256:demo",
        status=EngineRun.STATUS_SUCCEEDED,
        compute_summary={"risk":{"score":73,"band":"MEDIUM"},"recovery":{"p50":64000}},
        finished_at=timezone.now(),
    )

    TimelineEntry.objects.create(
        case_id=case_id, type=TimelineEntry.TYPE_UYAP_EVENT, severity=TimelineEntry.SEV_INFO,
        title="Araç bulundu", body={"plate":"34ABC123"}, source=TimelineEntry.SRC_UYAP
    )
    TimelineEntry.objects.create(
        case_id=case_id, type=TimelineEntry.TYPE_COMPUTE, severity=TimelineEntry.SEV_INFO,
        title="Risk & Recovery computed",
        body={"risk":{"score":73,"band":"MEDIUM"},"recovery":{"p50":64000}},
        run=run, source=TimelineEntry.SRC_ENGINE
    )
    TimelineEntry.objects.create(
        case_id=case_id, type=TimelineEntry.TYPE_DECISION, severity=TimelineEntry.SEV_WARN,
        title="Avans maili kuyruğa alındı",
        body={"because":["Recovery p50>=50k","Risk<80"]},
        run=run, source=TimelineEntry.SRC_ENGINE
    )

    OutboxAction.objects.create(
        run=run, case_id=case_id, action_type="enqueue", idempotency_key=f"enqueue:{case_id}:advance_request_email",
        payload={"queue":"advance_request_email","case_id":case_id}, status=OutboxAction.STATUS_PENDING
    )
    return run
