from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from django.utils import timezone
from core.models import Case, JobRun, JobStatus, RiskLevel, Debtor
from core.plan_loader import load_active_plan, PlanError
from core.adaptive_scheduler import compute_recipe_stats, adjust_interval

def _recent_exists(case: Case, debtor: Optional[Debtor], recipe_id: str, window_seconds: int) -> bool:
    since = timezone.now() - timezone.timedelta(seconds=window_seconds)
    qs = JobRun.objects.filter(case=case, recipe_id=recipe_id, created_at__gte=since).exclude(status=JobStatus.FAILED)
    if debtor is not None:
        qs = qs.filter(debtor=debtor)
    return qs.exists()

def plan_for_case(case: Case) -> List[JobRun]:
    try:
        plan = load_active_plan()
    except PlanError:
        plan = {"cooldown_seconds": 900, "stages": {"DEFAULT": {"recipes": [{"recipe_id":"EnsureUYAPSession","risk_level":"read_only","interval_seconds":900,"scope":"case"}]}}}

    stages = plan.get("stages") or {}
    stage_spec = stages.get(case.stage) or stages.get("DEFAULT") or {}
    recipes = stage_spec.get("recipes") or []
    cooldown = int(plan.get("cooldown_seconds") or 900)

    adaptive = plan.get("adaptive") or {}
    adaptive_enabled = bool(adaptive.get("enabled", False))
    window_hours = int(adaptive.get("window_hours") or 6)
    min_samples = int(adaptive.get("min_samples") or 10)
    soft = float(adaptive.get("fail_rate_soft") or 0.2)
    hard = float(adaptive.get("fail_rate_hard") or 0.4)

    jobs: List[JobRun] = []
    for item in recipes:
        if not isinstance(item, dict):
            continue
        rid = item.get("recipe_id")
        rl = item.get("risk_level") or RiskLevel.READ_ONLY
        interval = int(item.get("interval_seconds") or cooldown)
        scope = item.get("scope") or "case"

        if not rid:
            continue

        # adaptive interval
        if adaptive_enabled:
            stats = compute_recipe_stats(rid, window_hours=window_hours)
            interval = adjust_interval(interval, stats, soft=soft, hard=hard, min_samples=min_samples)

        if scope == "debtor":
            for d in case.debtors.all():
                if _recent_exists(case, d, rid, interval):
                    continue
                jobs.append(JobRun.objects.create(case=case, debtor=d, recipe_id=rid, recipe_version=1, status=JobStatus.QUEUED, risk_level=rl, priority=int(item.get('priority') or 50)))
        else:
            if _recent_exists(case, None, rid, interval):
                continue
            jobs.append(JobRun.objects.create(case=case, debtor=None, recipe_id=rid, recipe_version=1, status=JobStatus.QUEUED, risk_level=rl, priority=int(item.get('priority') or 50)))

    return jobs
