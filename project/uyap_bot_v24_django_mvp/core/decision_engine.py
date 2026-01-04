from __future__ import annotations
from typing import Any, Dict, List, Optional
from core.models import Case, Debtor, JobRun, JobStatus, RiskLevel
from core.decision_rules_loader import load_active_decision_rules, DecisionRulesError

def _match_when(when: str, fact_type: str) -> bool:
    # Supports: "fact:AssetFound" or "fact:AssetFound(...)" or "facts: [...]" (not yet)
    when = (when or "").strip()
    if when.startswith("fact:"):
        target = when.split("fact:", 1)[1]
        # cut params
        target = target.split("(", 1)[0].strip()
        return target == fact_type
    return False

def enqueue_for_fact(case: Case, debtor: Optional[Debtor], fact_type: str) -> List[JobRun]:
    try:
        rules_pack = load_active_decision_rules()
    except DecisionRulesError:
        # fallback: no rules
        return []

    jobs: List[JobRun] = []
    seen = set()
    for rule in rules_pack.get("rules", []):
        if not isinstance(rule, dict):
            continue
        when = rule.get("when")
        if not isinstance(when, str):
            continue
        if not _match_when(when, fact_type):
            continue
        then = rule.get("then") or {}
        enqueue = (then.get("enqueue") or [])
        if not isinstance(enqueue, list):
            continue
        for rid in enqueue:
            if not isinstance(rid, str):
                continue
            key = (case.id, debtor.id if debtor else None, rid)
            if key in seen:
                continue
            seen.add(key)
            jobs.append(JobRun.objects.create(
                case=case,
                debtor=debtor,
                recipe_id=rid,
                recipe_version=1,
                status=JobStatus.QUEUED,
                risk_level=RiskLevel.READ_ONLY,
            ))
    return jobs
