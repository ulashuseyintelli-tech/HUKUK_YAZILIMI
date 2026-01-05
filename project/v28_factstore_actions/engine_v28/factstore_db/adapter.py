from __future__ import annotations
from typing import Any, Dict

from django.db import transaction

from engine_v28.engine_runner.factstore import Snapshot, FactStore
from .models import CaseFact, CaseFlag, FactAudit

class DBFactStore(FactStore):
    """FactStore backed by DB tables with audit."""

    def get_snapshot(self, case_id: str) -> Snapshot:
        facts_qs = CaseFact.objects.filter(case_id=case_id).values_list("key","value")
        flags_qs = CaseFlag.objects.filter(case_id=case_id).values_list("key","value")
        facts = {k: v for k, v in facts_qs}
        flags = {k: v for k, v in flags_qs}
        return Snapshot(facts=facts, flags=flags)

    def write(self, case_id: str, facts: Dict[str, Any], flags: Dict[str, Any], *, meta: Dict[str, Any]) -> None:
        with transaction.atomic():
            # Facts
            for key, new_val in (facts or {}).items():
                obj, created = CaseFact.objects.select_for_update().get_or_create(case_id=case_id, key=key, defaults={"value": new_val})
                if not created:
                    old = obj.value
                    if old != new_val:
                        obj.value = new_val
                        obj.save(update_fields=["value","updated_at"])
                        FactAudit.objects.create(case_id=case_id, key=key, old_value=old, new_value=new_val, kind="fact", meta=meta)
                else:
                    FactAudit.objects.create(case_id=case_id, key=key, old_value=None, new_value=new_val, kind="fact", meta=meta)

            # Flags
            for key, new_val in (flags or {}).items():
                new_bool = bool(new_val)
                obj, created = CaseFlag.objects.select_for_update().get_or_create(case_id=case_id, key=key, defaults={"value": new_bool})
                if not created:
                    old = obj.value
                    if old != new_bool:
                        obj.value = new_bool
                        obj.save(update_fields=["value","updated_at"])
                        FactAudit.objects.create(case_id=case_id, key=key, old_value=old, new_value=new_bool, kind="flag", meta=meta)
                else:
                    FactAudit.objects.create(case_id=case_id, key=key, old_value=None, new_value=new_bool, kind="flag", meta=meta)
