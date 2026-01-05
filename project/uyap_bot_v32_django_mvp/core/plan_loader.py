from __future__ import annotations
from typing import Any, Dict, List
from core.models import ParamBundle
from core.utils import parse_yaml_or_json

class PlanError(Exception):
    pass

def load_active_plan() -> Dict[str, Any]:
    b = ParamBundle.objects.filter(status="active", bundle_kind="plan").order_by("-version").first()
    if not b:
        raise PlanError("Missing ACTIVE plan ParamBundle (bundle_kind='plan').")
    data = parse_yaml_or_json(b.content)
    if "plan" not in data or not isinstance(data.get("plan"), dict):
        raise PlanError("plan bundle must have top-level 'plan' mapping.")
    return data["plan"]
