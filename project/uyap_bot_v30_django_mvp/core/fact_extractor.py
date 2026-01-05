from __future__ import annotations
from typing import Any, Dict, List, Optional
from django.utils import timezone
from core.models import Case, Debtor, Fact, Snapshot

def emit_facts_from_rows(case: Case, debtor: Debtor|None, fact_type: str, rows: List[Dict[str, Any]], key_fields: List[str], snapshot: Snapshot|None) -> int:
    created = 0
    for r in rows:
        key = "|".join(str(r.get(k,"")) for k in key_fields)
        Fact.objects.create(
            case=case,
            debtor=debtor,
            fact_type=fact_type,
            key=key,
            value=r,
            snapshot=snapshot,
        )
        created += 1
    return created
