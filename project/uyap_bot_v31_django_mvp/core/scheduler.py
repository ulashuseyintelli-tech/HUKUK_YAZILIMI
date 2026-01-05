from django.db.models import Count, Q
from core.models import Case, JobRun, JobStatus
from core.orchestrator_v14 import plan_for_case
from core.tasks import run_job
from core.queue_policy_loader import load_active_queue_policy

def _count_running():
    return JobRun.objects.filter(status__in=[JobStatus.QUEUED, JobStatus.RUNNING]).count()

def plan_and_enqueue_for_all_cases(limit: int = 200) -> int:
    policy = load_active_queue_policy().get("policy", {})
    global_conc = int(policy.get("global_concurrency", 20))
    per_case_conc = int(policy.get("per_case_concurrency", 6))
    per_case_write_conc = int(policy.get("per_case_write_concurrency", 1))
    risk_queues = policy.get("risk_queues", {})

    created = 0

    # global guard
    if _count_running() >= global_conc:
        return 0

    cases = Case.objects.all().order_by("-updated_at")[:limit]
    for c in cases:
        if c.stage in ("ASKIDA", "HATA"):
            continue

        # per-case running
        running_case = JobRun.objects.filter(case=c, status__in=[JobStatus.QUEUED, JobStatus.RUNNING]).count()
        if running_case >= per_case_conc:
            continue

        running_write = JobRun.objects.filter(
            case=c,
            status__in=[JobStatus.QUEUED, JobStatus.RUNNING],
            risk_level__in=["controlled_write","high_impact_write"]
        ).count()
        if running_write >= per_case_write_conc:
            continue

        # plan creates queued jobs
        plan_for_case(c)

    # After planning, pick which queued jobs to actually dispatch, using priority + quotas
    qs = JobRun.objects.filter(status=JobStatus.QUEUED).order_by("priority", "-created_at")

    dispatched = 0
    # enforce risk queue caps (max_running)
    for job in qs:
        if _count_running() >= global_conc:
            break

        rq = risk_queues.get(job.risk_level, {})
        max_running = int(rq.get("max_running", 9999))
        running_same_risk = JobRun.objects.filter(status__in=[JobStatus.QUEUED, JobStatus.RUNNING], risk_level=job.risk_level).count()
        if running_same_risk >= max_running:
            continue

        # dispatch
        run_job.delay(job.id)
        dispatched += 1
        created += 1

    return created
