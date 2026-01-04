from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import re

from core.models import Case, Debtor, JobRun, JobStatus, RiskLevel, Fact
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

def _eval_predicate(pred: str, fact_value: Dict[str, Any]) -> bool:
    """Very small predicate evaluator.
    Supports:
      field == 'value'
      field != 'value'
      field in ['a','b']
    field can be nested with dots: attributes.plate
    """
    if not pred:
        return True

    pred = pred.strip()
    # in list
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

    # unknown predicate -> safe default false (forces explicitness)
    return False

def _get_field(obj: Dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur

def enqueue_for_fact(case: Case, debtor: Optional[Debtor], fact: Fact) -> List[JobRun]:
    try:
        rules_pack = load_active_decision_rules()
    except DecisionRulesError:
        return []

    jobs: List[JobRun] = []
    seen = set()
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

        then = rule.get("then") or {}
        enqueue = (then.get("enqueue") or [])
        if not isinstance(enqueue, list):
            continue
        for rid in enqueue:
            if not isinstance(rid, str):
                continue
            key = (case.id, debtor.id if debtor else None, rid)
            if key in seen:
                continue
            seen.add(key)
            jobs.append(JobRun.objects.create(
                case=case,
                debtor=debtor,
                recipe_id=rid,
                recipe_version=1,
                status=JobStatus.QUEUED,
                risk_level=RiskLevel.READ_ONLY,
            ))
    return jobs
