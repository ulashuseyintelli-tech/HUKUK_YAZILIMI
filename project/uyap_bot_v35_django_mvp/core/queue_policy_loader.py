from __future__ import annotations
from typing import Any, Dict
from core.models import ParamBundle
from core.utils import parse_yaml_or_json

class QueuePolicyError(Exception):
    pass

def load_active_queue_policy() -> Dict[str, Any]:
    b = ParamBundle.objects.filter(status="active", bundle_kind="queue_policy").order_by("-version").first()
    if not b:
        # defaults
        return {
            "policy": {
                "global_concurrency": 20,
                "per_case_concurrency": 6,
                "per_case_write_concurrency": 1,
                "risk_queues": {
                    "high_impact_write": {"max_running": 1, "priority_boost": -10},
                    "controlled_write": {"max_running": 3, "priority_boost": -5},
                    "read_only": {"max_running": 30, "priority_boost": 0},
                }
            }
        }
    data = parse_yaml_or_json(b.content)
    if "policy" not in data:
        raise QueuePolicyError("queue_policy bundle must have top-level 'policy'")
    return data
