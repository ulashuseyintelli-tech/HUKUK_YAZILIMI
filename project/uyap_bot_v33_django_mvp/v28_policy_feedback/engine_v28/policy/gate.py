from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple, List

from engine_v28.policy.models import PolicyRule
from engine_v28.engine_runner.expressions import eval_expr

@dataclass
class PolicyDecision:
    decision: str  # ALLOW/DENY/MANUAL
    rule_id: Optional[str] = None
    rule_name: Optional[str] = None
    manual_action_type: Optional[str] = None
    manual_payload: Optional[dict] = None
    reason: Optional[str] = None

class PolicyGate:
    """Evaluate action gating decisions."""

    def evaluate(self, *, action_type: str, ctx: Dict[str, Any]) -> PolicyDecision:
        # ctx expected:
        #  - fact: {...}  (flattened fact store or nested)
        #  - flags: {...}
        #  - compute: {...}
        #  - event: {...}
        #  - action_type: str
        local_ctx = dict(ctx)
        local_ctx["action_type"] = action_type

        rules = PolicyRule.objects.filter(is_enabled=True).order_by("-priority")
        for r in rules:
            if r.action_type and r.action_type != action_type:
                continue
            if r.expr:
                try:
                    ok = bool(eval_expr(r.expr, local_ctx))
                except Exception as e:
                    ok = False
                if not ok:
                    continue
            # match
            return PolicyDecision(
                decision=r.decision,
                rule_id=str(r.policy_id),
                rule_name=r.name,
                manual_action_type=r.manual_action_type,
                manual_payload=r.manual_payload,
                reason=r.note or r.expr or "policy match",
            )

        # Default fallback policy (sane baseline)
        # Example: block send_email if CLIENT_NO_EMAIL flag true
        if local_ctx.get("flags", {}).get("CLIENT_NO_EMAIL") and action_type == "send_email":
            return PolicyDecision(decision="DENY", reason="CLIENT_NO_EMAIL flag set")

        return PolicyDecision(decision="ALLOW", reason="default allow")
