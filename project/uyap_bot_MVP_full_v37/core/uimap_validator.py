from __future__ import annotations
from typing import Any, Dict, List, Set

def validate_uimap(uimap: Dict[str, Any]) -> Dict[str, Any]:
    issues: List[Dict[str, Any]] = []
    bindings = uimap.get("locator_bindings") or {}
    all_keys: Set[str] = set()
    for sec in ("buttons","fields","tables","actions"):
        all_keys |= set((bindings.get(sec) or {}).keys())

    screens = (uimap.get("ui_map") or {}).get("screens") or {}
    for screen_name, spec in screens.items():
        for key in (spec.get("menu_clicks") or []):
            if key not in all_keys:
                issues.append({"type": "missing_binding", "screen": screen_name, "key": key})
        table = spec.get("table") or {}
        rows_key = table.get("rows")
        if rows_key and rows_key not in all_keys:
            issues.append({"type":"missing_binding", "screen": screen_name, "key": rows_key})
        cols = table.get("columns_keys") or {}
        if cols:
            for col_name, col_key in cols.items():
                if col_key not in all_keys:
                    issues.append({"type":"missing_binding", "screen": screen_name, "column": col_name, "key": col_key})
    return {"ok": len(issues)==0, "issues": issues}
