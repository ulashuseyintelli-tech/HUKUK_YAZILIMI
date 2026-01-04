from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import re

from core.models import Case, Debtor, JobRun, JobStatus, RiskLevel, Fact, Lock
from core.decision_rules_loader import load_active_decision_rules, DecisionRulesError

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

    m = re.match(r"^(?P<field>[\w\.]+)\s*(?P<op>==|!=)\s*(?P<val>.*)$", pred)
    if m:
        field = m.group("field")
        op = m.group("op")
        val = m.group("val").strip().strip("'\"")
        got = _get_field(fact_value, field)
        if op == "==":
            return str(got) == val
        return str(got) != val

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

def apply_then(case: Case, debtor: Optional[Debtor], then: Dict[str, Any], fact: Fact) -> Dict[str, Any]:
    result: Dict[str, Any] = {"enqueued": 0, "locks_opened": 0, "flags_set": 0, "events_emitted": 0}
    # enqueue
    enqueue = then.get("enqueue")
    if isinstance(enqueue, list) and enqueue:
        _enqueue_jobs(case, debtor, [x for x in enqueue if isinstance(x, str)], risk_level=RiskLevel.READ_ONLY)
        result["enqueued"] += len(enqueue)

    # open_lock
    open_lock = then.get("open_lock") or then.get("open_locks")
    if isinstance(open_lock, str):
        _open_lock(case, open_lock, reason=f"rule_lock from fact {fact.fact_type}:{fact.key}")
        result["locks_opened"] += 1
    elif isinstance(open_lock, list):
        for lid in [x for x in open_lock if isinstance(x, str)]:
            _open_lock(case, lid, reason=f"rule_lock from fact {fact.fact_type}:{fact.key}")
            result["locks_opened"] += 1

    # set_flag (write into case facts as Fact type=Flag)
    set_flag = then.get("set_flag")
    if isinstance(set_flag, dict):
        for k, v in set_flag.items():
            Fact.objects.create(case=case, debtor=debtor, fact_type="Flag", key=str(k), value={"value": v}, snapshot=fact.snapshot)
            result["flags_set"] += 1

    # emit (write into case events as Fact type=Event)
    emit = then.get("emit")
    if isinstance(emit, str):
        Fact.objects.create(case=case, debtor=debtor, fact_type="Event", key=emit, value={"from": "decision_rule"}, snapshot=fact.snapshot)
        result["events_emitted"] += 1
    elif isinstance(emit, list):
        for ev in [x for x in emit if isinstance(x, str)]:
            Fact.objects.create(case=case, debtor=debtor, fact_type="Event", key=ev, value={"from": "decision_rule"}, snapshot=fact.snapshot)
            result["events_emitted"] += 1

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
