from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol

@dataclass
class UiResult:
    ok: bool
    data: Dict[str, Any]
    evidence: Dict[str, Any]  # e.g. screenshot_path, raw_html, row_count
    error: Optional[str] = None

class UiWorker(Protocol):
    def navigate(self, nav_path: List[str]) -> UiResult: ...
    def click(self, button_key: str) -> UiResult: ...
    def fill_form(self, fields: Dict[str, Any]) -> UiResult: ...
    def read_table(self, table_key: str, filters: Optional[Dict[str, Any]] = None) -> UiResult: ...
    def select_row(self, table_key: str, where: Dict[str, Any]) -> UiResult: ...

class MockUiWorker:
    """v17: gerçek UYAP'a bağlanmadan test için mock worker.
    ui_map anahtarlarını kullanır, deterministic dummy data döner.
    """
    def __init__(self, ui_map: Dict[str, Any]):
        self.ui_map = ui_map
        self.current_screen = None

    def navigate(self, nav_path: List[str]) -> UiResult:
        self.current_screen = " > ".join(nav_path)
        return UiResult(ok=True, data={"screen": self.current_screen}, evidence={"nav_path": nav_path})

    def click(self, button_key: str) -> UiResult:
        return UiResult(ok=True, data={"clicked": button_key, "screen": self.current_screen}, evidence={})

    def fill_form(self, fields: Dict[str, Any]) -> UiResult:
        return UiResult(ok=True, data={"filled": fields, "screen": self.current_screen}, evidence={})

    def read_table(self, table_key: str, filters: Optional[Dict[str, Any]] = None) -> UiResult:
        # return dummy rows
        rows = [{"dummy": 1}, {"dummy": 2}]
        if filters:
            rows = rows[:1]
        return UiResult(ok=True, data={"table": table_key, "rows": rows, "filters": filters or {}}, evidence={"row_count": len(rows)})

    def select_row(self, table_key: str, where: Dict[str, Any]) -> UiResult:
        return UiResult(ok=True, data={"selected": where, "table": table_key}, evidence={})
