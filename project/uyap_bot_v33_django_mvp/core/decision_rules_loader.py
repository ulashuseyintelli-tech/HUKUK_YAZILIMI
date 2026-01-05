from __future__ import annotations
from typing import Any, Dict, List
from core.models import ParamBundle
from core.utils import parse_yaml_or_json

class DecisionRulesError(Exception):
    pass

def load_active_decision_rules() -> Dict[str, Any]:
    b = ParamBundle.objects.filter(status="active", bundle_kind="decision_rules").order_by("-version").first()
    if not b:
        raise DecisionRulesError("Missing ACTIVE decision_rules ParamBundle (bundle_kind='decision_rules').")
    data = parse_yaml_or_json(b.content)
    if "rules" not in data or not isinstance(data.get("rules"), list):
        raise DecisionRulesError("decision_rules bundle must have top-level 'rules' list.")
    return data
