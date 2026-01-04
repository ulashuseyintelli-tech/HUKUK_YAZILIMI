from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, Optional

@dataclass
class DslAction:
    type: str
    payload: Dict[str, Any]

def normalize_action(act: Dict[str, Any]) -> DslAction:
    t = (act.get("type") or "").strip()
    payload = {k: v for k, v in act.items() if k != "type"}
    return DslAction(type=t, payload=payload)
