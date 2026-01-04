from celery import shared_task
from django.utils import timezone
from .models import JobRun, JobStep, Snapshot
import hashlib, json

def _hash_payload(payload: dict) -> str:
    b = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(b).hexdigest()

@shared_task
def run_job(job_id: int) -> dict:
    # v15: stub işleyiş + job step logging + snapshot recording
    job = JobRun.objects.select_related("case").get(id=job_id)
    job.status = "running"
    job.started_at = timezone.now()
    job.attempt = (job.attempt or 0) + 1
    job.save(update_fields=["status", "started_at", "attempt"])

    # Step 1: simulate navigation
    payload1 = {"nav": ["(stub)"], "action": "open_screen", "recipe_id": job.recipe_id}
    snap1 = Snapshot.objects.create(
        case=job.case,
        source="BOT_STUB",
        uyap_nav_path=" > ".join(payload1["nav"]),
        snapshot_hash=_hash_payload(payload1),
        payload=payload1,
    )
    JobStep.objects.create(job=job, step_no=1, action_type="open_screen", uyap_nav_path=snap1.uyap_nav_path, status="ok", snapshot=snap1, proof_ref=snap1.snapshot_hash)

    # Step 2: simulate read
    payload2 = {"action": "read", "data": {"ok": True}}
    snap2 = Snapshot.objects.create(
        case=job.case,
        source="BOT_STUB",
        uyap_nav_path="(stub read)",
        snapshot_hash=_hash_payload(payload2),
        payload=payload2,
    )
    JobStep.objects.create(job=job, step_no=2, action_type="read", uyap_nav_path=snap2.uyap_nav_path, status="ok", snapshot=snap2, proof_ref=snap2.snapshot_hash)

    job.status = "done"
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at"])
    return {"job_id": job.id, "status": job.status, "steps": 2}
