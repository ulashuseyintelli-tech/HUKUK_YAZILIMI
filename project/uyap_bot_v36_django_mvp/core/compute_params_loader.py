from __future__ import annotations
from typing import Any, Dict
from core.models import ParamBundle
from core.utils import parse_yaml_or_json

class ComputeParamsError(Exception):
    pass

def load_active_bundle(kind: str) -> Dict[str, Any]:
    b = ParamBundle.objects.filter(status="active", bundle_kind=kind).order_by("-version").first()
    if not b:
        raise ComputeParamsError(f"Missing ACTIVE ParamBundle kind={kind}")
    return parse_yaml_or_json(b.content)

def load_risk_params() -> Dict[str, Any]:
    data = load_active_bundle("risk")
    return data.get("params", data)

def load_recovery_params() -> Dict[str, Any]:
    data = load_active_bundle("recovery")
    return data.get("params", data)
