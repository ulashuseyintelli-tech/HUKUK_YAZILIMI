from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from django.utils import timezone
from django.db.models import Q
from core.models import Case, JobRun, JobStatus, RiskLevel
from core.plan_loader import load_active_plan, PlanError

@dataclass
class PlanItem:
    recipe_id: str
    risk_level: str

def _dedup_exists(case: Case, recipe_id: str, cooldown_seconds: int) -> bool:
    since = timezone.now() - timezone.timedelta(seconds=cooldown_seconds)
    return JobRun.objects.filter(
        case=case,
        recipe_id=recipe_id,
        created_at__gte=since,
    ).exclude(status=JobStatus.FAILED).exists()

def plan_for_case(case: Case) -> List[JobRun]:
    """v29: plan bundle driven planning."""
    try:
        plan = load_active_plan()
    except PlanError:
        # fallback minimal
        plan = {"stages": {case.stage: {"recipes": [{"recipe_id":"EnsureUYAPSession","risk_level":"read_only"},{"recipe_id":"SyncSafahatTimeline","risk_level":"read_only"}]}}, "cooldown_seconds": 900}

    stages = plan.get("stages") or {}
    stage_spec = stages.get(case.stage) or stages.get("DEFAULT") or {}
    recipes = stage_spec.get("recipes") or []
    cooldown = int(plan.get("cooldown_seconds") or 900)

    jobs: List[JobRun] = []
    for item in recipes:
        if not isinstance(item, dict):
            continue
        rid = item.get("recipe_id")
        rl = item.get("risk_level") or RiskLevel.READ_ONLY
        if not rid:
            continue
        if _dedup_exists(case, rid, cooldown):
            continue
        jobs.append(JobRun.objects.create(
            case=case,
            debtor=None,
            recipe_id=rid,
            recipe_version=1,
            status=JobStatus.QUEUED,
            risk_level=rl,
        ))
    return jobs
