from __future__ import annotations
from typing import Any, Dict, Optional
from django.utils import timezone

from engine_v28.factstore_db.adapter import DBFactStore

def write_action_feedback(*, case_id: str, action_type: str, action_id: str, status: str, result: Optional[Dict[str, Any]]=None):
    """Write post-action feedback facts to FactStore (DB)."""
    fs = DBFactStore()
    facts = {
        f"actions.{action_type}.last_status": status,
        f"actions.{action_type}.last_action_id": action_id,
        f"actions.last.status": status,
    }
    if status == "done":
        facts["actions.last.success_at"] = timezone.now().isoformat()
    else:
        facts["actions.last.fail_at"] = timezone.now().isoformat()

    if result is not None:
        facts[f"actions.{action_type}.last_result"] = result

    fs.write(case_id, facts, flags={}, meta={"source": "action_feedback", "action_id": action_id, "action_type": action_type, "status": status})
    return facts
