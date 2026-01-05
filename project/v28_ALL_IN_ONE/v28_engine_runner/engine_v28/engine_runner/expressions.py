from __future__ import annotations
from typing import Any, Dict

def eval_expr(expr: str, ctx: Dict[str, Any]) -> Any:
    """Evaluate boolean/arithmetic expressions against ctx.

    WARNING:
    - Uses Python eval with a restricted global scope.
    - Still not a perfect sandbox. Replace with a safer evaluator in production.

    Access:
      fact, flags, compute are injected as dicts (attr-style via dict access in expr using [] or via helper below).
    """
    safe_globals = {"__builtins__": {}}
    # Provide small helpers
    def get(path: str):
        # path like "fact.case.id" or "compute.risk.score"
        cur = ctx
        for p in path.split("."):
            if isinstance(cur, dict):
                cur = cur.get(p)
            else:
                cur = getattr(cur, p, None)
        return cur

    safe_locals = {
        "fact": ctx.get("fact", {}),
        "flags": ctx.get("flags", {}),
        "compute": ctx.get("compute", {}),
        "get": get,
        "True": True,
        "False": False,
        "None": None,
    }
    return eval(expr, safe_globals, safe_locals)

def check_when(when: dict, ctx: Dict[str, Any]) -> bool:
    """Supports:
      when:
        all:
          - fact: "case.status" op: "==" value: "finalized"
          - expr: "compute.risk.score >= 80"   (expr allowed too)
        any: [...]
    """
    def check_clause(cl):
        if "expr" in cl:
            return bool(eval_expr(cl["expr"], ctx))
        # fact path lookup
        fact_path = cl.get("fact")
        op = cl.get("op")
        val = cl.get("value")
        left = ctx.get("fact", {})
        for p in fact_path.split("."):
            left = left.get(p) if isinstance(left, dict) else None
        if op == "==": return left == val
        if op == "!=": return left != val
        if op == ">": return left > val
        if op == ">=": return left >= val
        if op == "<": return left < val
        if op == "<=": return left <= val
        raise ValueError(f"Unsupported op: {op}")

    if not when:
        return True
    if "all" in when:
        return all(check_clause(c) for c in when["all"])
    if "any" in when:
        return any(check_clause(c) for c in when["any"])
    # single expr
    if "expr" in when:
        return bool(eval_expr(when["expr"], ctx))
    return True
