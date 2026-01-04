from __future__ import annotations
from typing import Any, Dict, List, Optional
from playwright.sync_api import Page
from core.locator_resolver import get_selector

def read_table_by_columns(page: Page, uimap: Dict[str, Any], table_rows_key: str, column_keys: Dict[str, str], max_rows: int = 200) -> List[Dict[str, Any]]:
    """Reads table rows and extracts column text using column selectors relative to row.

    column_keys maps logical column name -> selector_key binding (must resolve to selector).
    Example:
      TABLE_ETEBLIGAT_ROWS: "css=table#x tbody tr"
      columns:
        tarafa_teslim_tarihi: "css=td:nth-child(3)"
    You can store these column selectors directly in locator_bindings.actions or tables.
    """
    row_sel = get_selector(uimap, table_rows_key)
    rows = page.locator(row_sel)
    n = min(rows.count(), max_rows)
    out: List[Dict[str, Any]] = []
    for i in range(n):
        row = rows.nth(i)
        item: Dict[str, Any] = {"row_index": i}
        for col_name, col_selector_key in column_keys.items():
            col_sel = get_selector(uimap, col_selector_key)
            item[col_name] = row.locator(col_sel).inner_text()
        out.append(item)
    return out
