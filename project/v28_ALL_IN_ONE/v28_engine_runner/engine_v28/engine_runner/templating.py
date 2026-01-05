from __future__ import annotations
from typing import Any, Dict
import re

_pattern = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")

def get_by_path(obj: Any, path: str) -> Any:
    """Resolve dotted paths in dict-like objects.
    Examples:
      fact.case.id
      compute.risk.score
    """
    parts = path.split(".")
    cur = obj
    for p in parts:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            cur = getattr(cur, p, None)
    return cur

def render_template(value: Any, ctx: Dict[str, Any]) -> Any:
    """If value is a string containing {{ ... }}, replace with resolved ctx paths.
    Non-strings returned as-is.
    """
    if not isinstance(value, str):
        return value

    def repl(m):
        expr = m.group(1).strip()
        v = get_by_path(ctx, expr)
        return "" if v is None else str(v)

    if "{{" not in value:
        return value
    return _pattern.sub(repl, value)

def deep_render(obj: Any, ctx: Dict[str, Any]) -> Any:
    if isinstance(obj, dict):
        return {k: deep_render(v, ctx) for k, v in obj.items()}
    if isinstance(obj, list):
        return [deep_render(v, ctx) for v in obj]
    return render_template(obj, ctx)
