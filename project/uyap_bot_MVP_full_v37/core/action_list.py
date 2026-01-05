from __future__ import annotations
from typing import Dict, List
from django.utils import timezone
from core.models import Case, Fact, Lock

def build_action_list(case: Case) -> List[Dict]:
    actions: List[Dict] = []

    # Locks -> required actions
    for l in Lock.objects.filter(case=case, is_open=True):
        actions.append({
            "type": "LOCK",
            "priority": "high",
            "message": f"Açık kilit: {l.lock_id}",
            "detail": l.reason,
        })

    # Flags -> pending approvals / costs
    flags = Fact.objects.filter(case=case, fact_type="Flag").order_by("-created_at")
    for f in flags:
        if f.key == "needs_attorney_review":
            actions.append({
                "type": "APPROVAL",
                "priority": "high",
                "message": "Avukat incelemesi gerekiyor",
                "detail": f.value,
            })
        if f.key == "awaiting_cost_advance":
            actions.append({
                "type": "PAYMENT",
                "priority": "medium",
                "message": "Masraf avansı bekleniyor",
                "detail": f.value,
            })

    # Sort by priority
    pr = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda x: pr.get(x["priority"], 3))
    return actions
