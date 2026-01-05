\
from __future__ import annotations
from typing import Any, Dict, List, Tuple
import re

# Very small expression parser for typical DSL conditions.
# Supports:
# - AND/OR (case-insensitive) and Python 'and'/'or'
# - Comparators: >= <= > < == !=
# - get('path') or get("path")
# - literals: numbers, strings
#
# Not a full parser; it's a pragmatic explainer.

GET_CALL_RE = re.compile(r"get\(\s*['\"]([^'\"]+)['\"]\s*\)")
CMP_RE = re.compile(r"(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)")

def _clean(s: str) -> str:
    return s.strip().strip("()").strip()

def _split_bool(expr: str) -> Tuple[str, List[str]]:
    # normalize operators
    e = expr.replace("AND", "and").replace("OR", "or").replace("&&", "and").replace("||", "or")
    # split top-level by 'and' / 'or' (naive but works for our simple patterns)
    if " and " in e:
        return "and", [p.strip() for p in e.split(" and ") if p.strip()]
    if " or " in e:
        return "or", [p.strip() for p in e.split(" or ") if p.strip()]
    return "atom", [e.strip()]

def _pretty_path(path: str) -> str:
    # Convert internal paths to nicer labels (extend this mapping)
    mapping = {
        "compute.risk.score": "Risk skoru",
        "compute.risk.band": "Risk bandı",
        "compute.expected_recovery.p50": "Tahsilat p50",
        "compute.expected_recovery.expected": "Beklenen tahsilat",
        "fact.lien.rank": "Haciz sırası",
        "fact.case.status": "Dosya durumu",
    }
    return mapping.get(path, path)

def _resolve(ctx: Dict[str, Any], path: str) -> Any:
    cur: Any = ctx
    for p in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            cur = getattr(cur, p, None)
    return cur

def _literal(val: str) -> Any:
    v = val.strip()
    # quoted string
    if (v.startswith("'") and v.endswith("'")) or (v.startswith('"') and v.endswith('"')):
        return v[1:-1]
    # bool
    if v in ("True","true"): return True
    if v in ("False","false"): return False
    if v in ("None","null"): return None
    # number
    try:
        if "." in v:
            return float(v)
        return int(v)
    except Exception:
        return v  # fallback raw

def _extract_path(side: str) -> str | None:
    s = side.strip()
    m = GET_CALL_RE.search(s)
    if m:
        return m.group(1)
    # allow direct 'fact.xxx' or 'compute.xxx'
    if s.startswith("fact.") or s.startswith("compute.") or s.startswith("flags."):
        return s
    return None

def because_from_expr(expr: str, ctx: Dict[str, Any]) -> List[str]:
    expr = expr.strip().strip("{}").strip()
    mode, parts = _split_bool(expr)

    because: List[str] = []
    for part in parts:
        part = _clean(part)
        m = CMP_RE.match(part)
        if not m:
            # fallback: try resolve get()
            p = _extract_path(part)
            if p:
                val = _resolve(ctx, p)
                because.append(f"{_pretty_path(p)} = {val}")
            else:
                because.append(part)
            continue

        left_s, op, right_s = m.group(1), m.group(2), m.group(3)
        left_p = _extract_path(left_s)
        right_p = _extract_path(right_s)

        left_val = _resolve(ctx, left_p) if left_p else _literal(left_s)
        right_val = _resolve(ctx, right_p) if right_p else _literal(right_s)

        left_label = _pretty_path(left_p) if left_p else str(left_s).strip()
        right_label = _pretty_path(right_p) if right_p else str(right_s).strip()

        # Show both numeric comparison and actual values when available
        if left_p:
            because.append(f"{left_label} ({left_val}) {op} {right_label} ({right_val})")
        else:
            because.append(f"{left_label} {op} {right_label}")

    # If mode is OR, make it explicit (helps reviewers)
    if mode == "or" and len(because) > 1:
        return [f"(OR) {b}" for b in because]
    return because
