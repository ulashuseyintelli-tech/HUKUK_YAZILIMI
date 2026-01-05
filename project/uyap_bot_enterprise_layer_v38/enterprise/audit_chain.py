import hashlib, json
from typing import Optional, Dict, Any

def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def event_hash(prev_hash: str, payload: Dict[str, Any], created_at_iso: str) -> str:
    data = prev_hash + json.dumps(payload, sort_keys=True, ensure_ascii=False) + created_at_iso
    return sha256(data)
