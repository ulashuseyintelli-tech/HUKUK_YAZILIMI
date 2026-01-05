from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import re

from core.models import Case, Debtor, JobRun, JobStatus, RiskLevel, Fact, Lock
from core.decision_rules_loader import load_active_decision_rules, DecisionRulesError
from core.compute_params_loader import load_risk_params, load_recovery_params, ComputeParamsError
from core.compute_modules import risk_scoring, recovery_simulator

_pred_re = re.compile(r"^fact:(?P<ft>\w+)(\((?P<pred>.*)\))?$")

def _parse_when(when: str) -> Tuple[Optional[str], Optional[str]]:
    when = (when or "").strip()
    if when.startswith("fact:"):
        m = _pred_re.match(when)
        if not m:
            return None, None
        return m.group("ft"), m.group("pred")
    return None, None

def _get_field(obj: Dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur

def _eval_predicate(pred: str, fact_value: Dict[str, Any]) -> bool:
    if not pred:
        return True
    pred = pred.strip()

    m = re.match(r"^(?P<field>[\w\.]+)\s+in\s+\[(?P<vals>.*)\]$", pred)
    if m:
        field = m.group("field")
        vals_raw = m.group("vals")
        vals = [v.strip().strip("'\"") for v in vals_raw.split(",") if v.strip()]
        got = _get_field(fact_value, field)
        return str(got) in vals

    m = re.match(r"^(?P<field>[\w\.]+)\s*(?P<op>==|!=|>=|<=|>|<)\s*(?P<val>.*)$", pred)
    if m:
        field = m.group("field")
        op = m.group("op")
        val_raw = m.group("val").strip().strip("'\"")
        got = _get_field(fact_value, field)
        try:
            gv = float(got)
            vv = float(val_raw)
            if op == "==": return gv == vv
            if op == "!=": return gv != vv
            if op == ">": return gv > vv
            if op == "<": return gv < vv
            if op == ">=": return gv >= vv
            if op == "<=": return gv <= vv
        except Exception:
            if op == "==": return str(got) == val_raw
            if op == "!=": return str(got) != val_raw
            return False

    return False

def _enqueue_jobs(case: Case, debtor: Optional[Debtor], recipe_ids: List[str], risk_level: str = RiskLevel.READ_ONLY) -> List[JobRun]:
    jobs: List[JobRun] = []
    for rid in recipe_ids:
        jobs.append(JobRun.objects.create(
            case=case,
            debtor=debtor,
            recipe_id=rid,
            recipe_version=1,
            status=JobStatus.QUEUED,
            risk_level=risk_level,
        ))
    return jobs

def _open_lock(case: Case, lock_id: str, reason: str) -> Lock:
    return Lock.objects.create(case=case, lock_id=lock_id, is_open=True, reason=reason)

def _set_flag(case: Case, debtor: Optional[Debtor], key: str, value: Any, fact: Fact) -> None:
    Fact.objects.create(case=case, debtor=debtor, fact_type="Flag", key=str(key), value={"value": value}, snapshot=fact.snapshot)

def _emit_event(case: Case, debtor: Optional[Debtor], ev: str, fact: Fact) -> None:
    Fact.objects.create(case=case, debtor=debtor, fact_type="Event", key=ev, value={"from": "decision_rule"}, snapshot=fact.snapshot)

def _context_from_db(case: Case, debtor: Optional[Debtor]) -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    ve = Fact.objects.filter(case=case, debtor=debtor, fact_type="ValuationEstimate").order_by("-created_at").first()
    if ve:
        ctx.update({
            "value_low": ve.value.get("value_low"),
            "value_mid": ve.value.get("value_mid"),
            "value_high": ve.value.get("value_high"),
            "confidence": ve.value.get("confidence"),
            "liquidation_factor": ve.value.get("liquidation_factor", 0.7),
        })
    rk = Fact.objects.filter(case=case, debtor=debtor, fact_type="ContextUpdated", key="our_rank").order_by("-created_at").first()
    if rk:
        ctx["our_rank"] = rk.value.get("our_rank") or rk.value.get("value") or 1
    pr = Fact.objects.filter(case=case, debtor=debtor, fact_type="ContextUpdated", key="prior_claims_estimate").order_by("-created_at").first()
    if pr:
        ctx["prior_claims_estimate"] = pr.value.get("prior_claims_estimate") or pr.value.get("value")
    ua = Fact.objects.filter(case=case, debtor=debtor, fact_type="ContextUpdated", key="unknown_amounts_count").order_by("-created_at").first()
    if ua:
        ctx["unknown_amounts_count"] = ua.value.get("unknown_amounts_count") or 0
    uac = Fact.objects.filter(case=case, debtor=debtor, fact_type="ContextUpdated", key="unknown_activity_count").order_by("-created_at").first()
    if uac:
        ctx["unknown_activity_count"] = uac.value.get("unknown_activity_count") or 0
    ap = Fact.objects.filter(case=case, debtor=debtor, fact_type="ContextUpdated", key="active_prior_liens_count").order_by("-created_at").first()
    if ap:
        ctx["active_prior_liens_count"] = ap.value.get("active_prior_liens_count") or 0
    ctx.setdefault("estimated_costs", 0)
    return ctx

def _eval_decision_cond(cond: str, env: Dict[str, Any]) -> bool:
    cond = cond.strip()
    m = re.match(r"^(?P<path>[\w\.]+)\s*(?P<op>==|!=|>=|<=|>|<)\s*(?P<val>.*)$", cond)
    if not m:
        return False
    path = m.group("path")
    op = m.group("op")
    val_raw = m.group("val").strip().strip("'\"")
    got = _get_field(env, path)

    if val_raw.lower() in ("true","false"):
        vv = val_raw.lower() == "true"
        gv = bool(got)
        if op == "==": return gv == vv
        if op == "!=": return gv != vv
        return False
    try:
        gv = float(got)
        vv = float(val_raw)
        if op == "==": return gv == vv
        if op == "!=": return gv != vv
        if op == ">": return gv > vv
        if op == "<": return gv < vv
        if op == ">=": return gv >= vv
        if op == "<=": return gv <= vv
    except Exception:
        if op == "==": return str(got) == val_raw
        if op == "!=": return str(got) != val_raw
    return False

def _apply_simple_actions(case: Case, debtor: Optional[Debtor], then: Dict[str, Any], fact: Fact, result: Dict[str, Any]) -> None:
    enqueue = then.get("enqueue")
    if isinstance(enqueue, list) and enqueue:
        _enqueue_jobs(case, debtor, [x for x in enqueue if isinstance(x, str)], risk_level=RiskLevel.READ_ONLY)
        result["enqueued"] += len(enqueue)

    open_lock = then.get("open_lock") or then.get("open_locks")
    if isinstance(open_lock, str):
        _open_lock(case, open_lock, reason=f"rule_lock from fact {fact.fact_type}:{fact.key}")
        result["locks_opened"] += 1
    elif isinstance(open_lock, list):
        for lid in [x for x in open_lock if isinstance(x, str)]:
            _open_lock(case, lid, reason=f"rule_lock from fact {fact.fact_type}:{fact.key}")
            result["locks_opened"] += 1

    set_flag = then.get("set_flag")
    if isinstance(set_flag, dict):
        for k, v in set_flag.items():
            _set_flag(case, debtor, str(k), v, fact)
            result["flags_set"] += 1

    emit = then.get("emit")
    if isinstance(emit, str):
        _emit_event(case, debtor, emit, fact)
        result["events_emitted"] += 1
    elif isinstance(emit, list):
        for ev in [x for x in emit if isinstance(x, str)]:
            _emit_event(case, debtor, ev, fact)
            result["events_emitted"] += 1

def apply_then(case: Case, debtor: Optional[Debtor], then: Dict[str, Any], fact: Fact) -> Dict[str, Any]:
    result: Dict[str, Any] = {"enqueued": 0, "locks_opened": 0, "flags_set": 0, "events_emitted": 0, "computed": []}

    # load params
    try:
        risk_params = load_risk_params()
    except ComputeParamsError:
        risk_params = {"risk": {"weights": {}}}
    try:
        recovery_params = load_recovery_params()
    except ComputeParamsError:
        recovery_params = {"recovery": {"min_net_for_cost_actions": 25000}}

    computed_ctx: Dict[str, Any] = {}
    compute = then.get("compute")
    if isinstance(compute, list) and compute:
        base_ctx = _context_from_db(case, debtor)
        for expr in compute:
            if not isinstance(expr, str):
                continue
            if "RiskScoring" in expr:
                out = risk_scoring(base_ctx, risk_params)
                computed_ctx["risk"] = out
                Fact.objects.create(case=case, debtor=debtor, fact_type="Computed", key="risk", value=out, snapshot=fact.snapshot)
                result["computed"].append("risk")
            if "RecoverySimulator" in expr:
                out = recovery_simulator(base_ctx, recovery_params)
                computed_ctx["expected_recovery"] = out
                Fact.objects.create(case=case, debtor=debtor, fact_type="Computed", key="expected_recovery", value=out, snapshot=fact.snapshot)
                result["computed"].append("expected_recovery")

    decisions = then.get("decisions")
    if isinstance(decisions, list) and decisions:
        env = {"risk": computed_ctx.get("risk", {}), "expected_recovery": computed_ctx.get("expected_recovery", {})}
        for d in decisions:
            if not isinstance(d, dict):
                continue
            cond = d.get("if")
            act_then = d.get("then")
            if not isinstance(cond, str) or not isinstance(act_then, dict):
                continue
            if _eval_decision_cond(cond, env):
                _apply_simple_actions(case, debtor, act_then, fact, result)

    _apply_simple_actions(case, debtor, then, fact, result)
    return result

def run_decision_rules(case: Case, debtor: Optional[Debtor], fact: Fact) -> Dict[str, Any]:
    try:
        rules_pack = load_active_decision_rules()
    except DecisionRulesError:
        return {"matched": 0, "actions": []}

    matched = 0
    actions = []

    for rule in rules_pack.get("rules", []):
        if not isinstance(rule, dict):
            continue
        when = rule.get("when")
        if not isinstance(when, str):
            continue

        ft, pred = _parse_when(when)
        if ft != fact.fact_type:
            continue
        if pred and not _eval_predicate(pred, fact.value or {}):
            continue

        matched += 1
        then = rule.get("then") or {}
        if isinstance(then, dict):
            actions.append({"rule_id": rule.get("rule_id"), "result": apply_then(case, debtor, then, fact)})

    return {"matched": matched, "actions": actions}
