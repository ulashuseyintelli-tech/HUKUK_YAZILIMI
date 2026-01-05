"""UYAP Event Normalizer (stub).

Input: raw UYAP-ish event JSON
Output: facts/flags dicts to write into FactStore.

You will replace mapping rules with your real UYAP mappings.
"""
from typing import Any, Dict, Tuple

def normalize_event(event: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    case_id = event.get("case_id")
    etype = event.get("type")

    facts = {}
    flags = {}

    # Minimal demo mapping: vehicle found
    if etype == "ASSET_FOUND_VEHICLE":
        facts["assets.vehicle.found"] = True
        facts["assets.vehicle.estimated_value"] = event.get("vehicle", {}).get("estimated_value")
        facts["assets.vehicle.plate"] = event.get("vehicle", {}).get("plate")

    # Minimal demo: case status updates
    if etype == "CASE_STATUS":
        facts["case.status"] = event.get("status")

    # Ensure common identifiers present (optional)
    if "case.id" not in facts and event.get("case_id"):
        facts["case.id"] = event["case_id"]
    if event.get("debtor_id"):
        facts["debtor.id"] = event["debtor_id"]
    if event.get("lien_rank") is not None:
        facts["lien.rank"] = event.get("lien_rank")

    return facts, flags
