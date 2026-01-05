from __future__ import annotations
from typing import Any, Dict
from core.models import Case, Lock, JobRun, JobStatus, RecipePause, SystemConfig, ParamBundle, UiMapBundle, RecipeBundle

def compute_case_health(case: Case) -> Dict[str, Any]:
    locks = list(Lock.objects.filter(case=case, is_open=True).values("lock_id","reason","created_at"))
    failed_jobs = list(JobRun.objects.filter(case=case, status=JobStatus.FAILED).order_by("-created_at").values("id","recipe_id","last_error_code","created_at")[:20])
    paused = list(RecipePause.objects.filter(is_paused=True).values("recipe_id","reason"))
    degraded = SystemConfig.objects.filter(key="degraded_mode").first()
    degraded_on = bool(degraded.value.get("enabled", False)) if degraded else False

    bundles = {
        "recipe_active": RecipeBundle.objects.filter(status="active").exists(),
        "uimap_active": UiMapBundle.objects.filter(status="active").exists(),
        "decision_rules_active": ParamBundle.objects.filter(status="active", bundle_kind="decision_rules").exists(),
        "plan_active": ParamBundle.objects.filter(status="active", bundle_kind="plan").exists(),
        "risk_active": ParamBundle.objects.filter(status="active", bundle_kind="risk").exists(),
        "recovery_active": ParamBundle.objects.filter(status="active", bundle_kind="recovery").exists(),
    }

    score = 100
    if degraded_on: score -= 25
    score -= min(30, len(locks)*10)
    score -= min(20, len(failed_jobs))
    missing = [k for k,v in bundles.items() if not v]
    score -= 10*len(missing)

    return {
        "case_id": case.id,
        "uyap_dosya_no": case.uyap_dosya_no,
        "stage": case.stage,
        "score": max(0, score),
        "degraded_mode": degraded_on,
        "locks_open": locks,
        "failed_jobs": failed_jobs,
        "paused_recipes": paused,
        "bundles": bundles,
        "missing_bundles": missing,
    }
