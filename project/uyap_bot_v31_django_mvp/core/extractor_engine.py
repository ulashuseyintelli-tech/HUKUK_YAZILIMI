from __future__ import annotations
from typing import Any, Dict, List, Optional
from core.models import Case, Debtor, Snapshot
from core.fact_extractor import emit_facts_from_rows

class ExtractorError(Exception):
    pass

def run_extractors(case: Case, debtor: Optional[Debtor], extractor_specs: List[Dict[str, Any]], table_rows: List[Dict[str, Any]], snapshot: Optional[Snapshot]) -> int:
    """Apply extractor specs to table_rows and emit Facts.

    extractor_spec example:
      - fact_type: AssetFound
        when: "plate != ''"
        key_fields: ['asset_fingerprint']
        map:
          asset_type: 'vehicle'
          asset_fingerprint: "vehicle:plate:{plate}"
          attributes:
            plate: "{plate}"
            make: "{make}"
            model: "{model}"
            year: "{year}"
    """
    created = 0
    for spec in extractor_specs:
        fact_type = spec.get("fact_type")
        key_fields = spec.get("key_fields") or []
        mapping = spec.get("map") or {}
        when_expr = spec.get("when")

        if not fact_type or not isinstance(key_fields, list) or not isinstance(mapping, dict):
            continue

        out_rows = []
        for r in table_rows:
            ok = True
            if when_expr:
                try:
                    parts = when_expr.split()
                    # expects: field != '' or field == ''
                    if len(parts) >= 3:
                        field, op, val = parts[0], parts[1], " ".join(parts[2:]).strip().strip('"').strip("'")
                        got = str(r.get(field, ""))
                        if op == "!=":
                            ok = got != val
                        elif op == "==":
                            ok = got == val
                except Exception:
                    ok = True
            if not ok:
                continue

            def fmt(x: Any) -> Any:
                if isinstance(x, str):
                    try:
                        return x.format(**r)
                    except Exception:
                        return x
                if isinstance(x, dict):
                    return {k: fmt(v) for k, v in x.items()}
                if isinstance(x, list):
                    return [fmt(v) for v in x]
                return x

            v = fmt(mapping)
            v["_row"] = r
            out_rows.append(v)

        created += emit_facts_from_rows(case, debtor, fact_type, out_rows, key_fields, snapshot)
    return created
