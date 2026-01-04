from django.utils import timezone
from core.models import Case
from core.orchestrator_v14 import plan_for_case
from core.tasks import run_job

def plan_and_enqueue_for_all_cases(limit: int = 200) -> int:
    cases = Case.objects.all().order_by("-updated_at")[:limit]
    created = 0
    for c in cases:
        if c.stage in ("ASKIDA", "HATA"):
            continue
        jobs = plan_for_case(c)
        for j in jobs:
            created += 1
            run_job.delay(j.id)
    return created
