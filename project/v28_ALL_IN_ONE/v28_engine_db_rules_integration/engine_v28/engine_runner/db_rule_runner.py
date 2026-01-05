from __future__ import annotations
from typing import Any, Dict, List

from engine_v28.rules.loader import LOADER, LoadedRule
from engine_v28.rules.runner_patch import attach_meta
from engine_v28.models import EngineRun
from engine_v28.services import add_timeline
from engine_v28.engine_runner.runner import EngineRunner

def run_db_rules_for_event(*, case_id: str, event: Dict[str, Any], factstore, pack_name: str="uyap_default") -> List[Dict[str, Any]]:
    """Load active rules from DB and run them for a single event.

    Returns list of matched runs with rule revision metadata.
    """
    runner = EngineRunner(factstore)
    loaded: List[LoadedRule] = LOADER.load_active(pack_name)

    matched = []
    for lr in loaded:
        rule_dict = attach_meta(lr.rule_dict, {
            "pack": lr.pack_name,
            "rule_key": lr.rule_key,
            "revision_id": lr.revision_id,
            "version": lr.version,
            "sha256": lr.sha256,
        })

        res = runner.run_for_event(case_id, event, rule_dict)
        if not res.matched:
            continue

        # Stamp meta into EngineRun.compute_summary (non-invasive)
        try:
            run = EngineRun.objects.get(run_id=res.run_id)
            cs = run.compute_summary or {}
            cs["_rule_meta"] = rule_dict.get("_meta", {})
            run.compute_summary = cs
            run.save(update_fields=["compute_summary"])

            add_timeline(
                case_id,
                "NOTE",
                "Rule revision stamped",
                severity="info",
                body={"run_id": str(run.run_id), "_rule_meta": cs["_rule_meta"]},
                run=run,
                source="system",
            )
        except Exception:
            # don't fail run if stamping fails
            pass

        matched.append({
            "pack": lr.pack_name,
            "rule_key": lr.rule_key,
            "revision_id": lr.revision_id,
            "version": lr.version,
            "sha256": lr.sha256,
            "run_id": res.run_id,
            "actions_created": res.actions_created,
        })

    return matched
