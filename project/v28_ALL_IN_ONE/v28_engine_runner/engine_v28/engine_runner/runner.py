from __future__ import annotations
import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import yaml
from django.utils import timezone

from engine_v28.models import EngineRun
from engine_v28.services import add_timeline, create_outbox_action

from .factstore import FactStore
from .templating import deep_render
from .expressions import check_when, eval_expr
from .compute_registry import ComputeRegistry, default_registry

def sha256_of(obj: Any) -> str:
    b = json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(b).hexdigest()

@dataclass
class RunResult:
    run_id: str
    matched: bool
    actions_created: int

class EngineRunner:
    def __init__(self, factstore: FactStore, *, registry: Optional[ComputeRegistry]=None):
        self.factstore = factstore
        self.registry = registry or default_registry()

    def load_rules(self, yaml_paths: List[str]) -> List[dict]:
        rules = []
        for p in yaml_paths:
            with open(p, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            # allow list or single
            if isinstance(data, list):
                rules.extend(data)
            else:
                rules.append(data)
        return rules

    def run_for_event(self, case_id: str, event: Dict[str, Any], rule: dict) -> RunResult:
        snapshot = self.factstore.get_snapshot(case_id)

        ctx: Dict[str, Any] = {
            "fact": snapshot.facts,
            "flags": snapshot.flags,
            "compute": {},
            "event": event,
        }

        matched = check_when(rule.get("when", {}), ctx)
        if not matched:
            return RunResult(run_id="", matched=False, actions_created=0)

        # Create EngineRun
        run = EngineRun.objects.create(
            case_id=case_id,
            rule_id=rule.get("rule_id", "unknown"),
            trigger_event_id=event.get("event_id"),
            snapshot_hash=sha256_of({"facts": snapshot.facts, "flags": snapshot.flags, "event": event}),
            status=EngineRun.STATUS_STARTED,
        )

        try:
            # ---- Compute phase ----
            compute_list = (rule.get("then", {}) or {}).get("compute", []) or []
            for c in compute_list:
                name = c["name"]
                engine = c["run"]
                raw_input = c.get("input", {}) or {}
                inp = deep_render(raw_input, ctx)
                out = self.registry.run(engine, inp)
                ctx["compute"][name] = out

            add_timeline(
                case_id, "COMPUTE", "Compute executed",
                severity="info",
                body={"compute": ctx["compute"], "event_id": event.get("event_id")},
                run=run, source="engine"
            )

            # ---- Write phase (facts/flags) ----
            write = (rule.get("then", {}) or {}).get("write", {}) or {}
            facts_to_write: Dict[str, Any] = {}
            flags_to_write: Dict[str, Any] = {}

            for f in write.get("facts", []) or []:
                path = f["path"]
                val = deep_render(f.get("value"), ctx)
                facts_to_write[path] = val

            for fl in write.get("flags", []) or []:
                key = fl["key"]
                val = fl.get("value")
                if isinstance(val, str):
                    # allow expression string
                    try:
                        val_eval = bool(eval_expr(val.strip().strip("{}"), ctx)) if (" " in val or ">" in val or "<" in val or "=" in val) else bool(deep_render(val, ctx))
                        flags_to_write[key] = val_eval
                    except Exception:
                        flags_to_write[key] = bool(deep_render(val, ctx))
                else:
                    flags_to_write[key] = bool(val)

            # Persist facts/flags to your store
            self.factstore.write(case_id, facts_to_write, flags_to_write, meta={"run_id": str(run.run_id), "rule_id": run.rule_id})

            add_timeline(
                case_id, "FACT_WRITE", "Facts/Flags written",
                severity="info",
                body={"facts": facts_to_write, "flags": flags_to_write},
                run=run, source="engine"
            )

            # ---- Decisions phase ----
            decisions = (rule.get("then", {}) or {}).get("decisions", []) or []
            actions_created = 0

            for idx, d in enumerate(decisions):
                cond = d.get("if")
                if not cond:
                    continue
                cond_eval = bool(eval_expr(cond.strip().strip("{}"), ctx)) if isinstance(cond, str) else bool(cond)
                if not cond_eval:
                    continue

                # explainability: crude "because" list from condition string
                because = [cond]

                add_timeline(
                    case_id, "DECISION", "Decision matched",
                    severity="warn",
                    body={"if": cond, "because": because, "index": idx},
                    run=run, source="engine"
                )

                for a_i, action in enumerate(d.get("then", []) or []):
                    action_type = action["action"]
                    # generate idempotency key deterministic
                    idem = action.get("idempotency_key")
                    if not idem:
                        idem = f"{action_type}:{case_id}:{run.rule_id}:{idx}:{a_i}"
                    payload = deep_render(action.get("payload", {}), ctx)
                    # store to outbox
                    created = create_outbox_action(case_id, action_type, idem, payload, run=run)
                    if created:
                        actions_created += 1
                        add_timeline(
                            case_id, "ACTION", f"Action queued: {action_type}",
                            severity="info",
                            body={"action_id": str(created.action_id), "action_type": action_type, "idempotency_key": idem, "payload": payload},
                            run=run, source="engine"
                        )
                    else:
                        add_timeline(
                            case_id, "ACTION", f"Action duplicate (ignored): {action_type}",
                            severity="info",
                            body={"idempotency_key": idem},
                            run=run, source="engine"
                        )

            # finalize run
            run.status = EngineRun.STATUS_SUCCEEDED
            run.compute_summary = ctx["compute"]
            run.finished_at = timezone.now()
            run.save(update_fields=["status","compute_summary","finished_at"])

            return RunResult(run_id=str(run.run_id), matched=True, actions_created=actions_created)

        except Exception as e:
            run.status = EngineRun.STATUS_FAILED
            run.error = {"error": str(e)}
            run.finished_at = timezone.now()
            run.save(update_fields=["status","error","finished_at"])
            add_timeline(
                case_id, "OUTCOME", "Engine run failed",
                severity="critical",
                body={"error": str(e)},
                run=run, source="system"
            )
            raise
