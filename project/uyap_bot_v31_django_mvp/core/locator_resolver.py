from __future__ import annotations
from typing import Any, Dict, Optional

class LocatorError(Exception):
    pass

def get_selector(uimap: Dict[str, Any], key: str) -> str:
    """Resolve a logical key (e.g., BTN_SORGULA) to a real selector string.

    Expect uimap bundle to contain:
    locator_bindings:
      buttons:
        BTN_SORGULA: "css=button:text('Sorgula')"  # example
      fields:
        FIELD_DOSYA_NO: "css=input[name='dosyaNo']"
      tables:
        TABLE_ETEBLIGAT_ROWS: "css=table#etebligat tbody tr"
    """
    bindings = uimap.get("locator_bindings") or {}
    for section in ("buttons", "fields", "tables", "actions"):
        sec = bindings.get(section) or {}
        if key in sec:
            return sec[key]
    raise LocatorError(f"Selector binding missing for key: {key}")
