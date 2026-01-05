import hashlib
from typing import Any, Dict, Tuple
import yaml

def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def parse_yaml_or_json(text: str) -> Dict[str, Any]:
    # YAML can parse JSON too
    obj = yaml.safe_load(text) or {}
    if not isinstance(obj, dict):
        raise ValueError("Bundle root must be a mapping/dict.")
    return obj

def validate_bundle_hash(text: str, expected_hash: str) -> bool:
    return sha256_text(text) == expected_hash
