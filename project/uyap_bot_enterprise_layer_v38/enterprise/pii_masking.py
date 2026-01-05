from __future__ import annotations
from typing import Any, Dict

def mask_identity_no(v: str) -> str:
    v = (v or "").strip()
    return "******" + v[-4:] if len(v) >= 4 else "******"

def mask_phone(v: str) -> str:
    v = (v or "").strip()
    return "***" + v[-2:] if len(v) >= 2 else "***"

def mask_email(v: str) -> str:
    v = (v or "").strip()
    if "@" not in v:
        return "***"
    left, right = v.split("@", 1)
    return (left[:1] if left else "*") + "***@***"

MASKERS = {
    "identity_no": mask_identity_no,
    "phone": mask_phone,
    "email": mask_email,
}

def apply_mask(record: Dict[str, Any], field: str) -> Dict[str, Any]:
    out = dict(record)
    if field in out and field in MASKERS:
        out[field] = MASKERS[field](str(out[field]))
    return out
