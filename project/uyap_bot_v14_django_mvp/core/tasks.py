from celery import shared_task
from django.utils import timezone
from .models import JobRun

@shared_task
def run_job(job_id: int) -> dict:
    # MVP stub: gerçek orchestrator burada olacak (recipes/rules/ui_map okur, UI worker'ı çağırır)
    job = JobRun.objects.get(id=job_id)
    job.status = "running"
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at"])

    # ... burada gerçek iş yapılacak ...

    job.status = "done"
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at"])
    return {"job_id": job.id, "status": job.status}
