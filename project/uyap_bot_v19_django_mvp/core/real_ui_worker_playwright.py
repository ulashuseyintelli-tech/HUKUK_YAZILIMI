from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from playwright.sync_api import sync_playwright, Page, BrowserContext
from django.conf import settings

from core.ui_worker import UiResult, UiWorker
from core.locator_resolver import get_selector, LocatorError

import os
import time

@dataclass
class PlaywrightConfig:
    headless: bool = True
    user_data_dir: str = "playwright_user_data"
    slow_mo_ms: int = 0
    base_url: Optional[str] = None
    screenshot_dir: str = "exports/evidence"

class PlaywrightUiWorker(UiWorker):
    def __init__(self, uimap: Dict[str, Any], cfg: Optional[PlaywrightConfig] = None):
        self.uimap = uimap
        self.cfg = cfg or PlaywrightConfig()
        self._pw = None
        self._ctx: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._ensure_dirs()

    def _ensure_dirs(self):
        base = getattr(settings, "BASE_DIR", None)
        if base:
            self.cfg.user_data_dir = str(os.path.join(base, self.cfg.user_data_dir))
            self.cfg.screenshot_dir = str(os.path.join(base, self.cfg.screenshot_dir))
        os.makedirs(self.cfg.user_data_dir, exist_ok=True)
        os.makedirs(self.cfg.screenshot_dir, exist_ok=True)

    def start(self) -> None:
        self._pw = sync_playwright().start()
        self._ctx = self._pw.chromium.launch_persistent_context(
            user_data_dir=self.cfg.user_data_dir,
            headless=self.cfg.headless,
            slow_mo=self.cfg.slow_mo_ms,
        )
        self._page = self._ctx.pages[0] if self._ctx.pages else self._ctx.new_page()
        if self.cfg.base_url:
            self._page.goto(self.cfg.base_url, wait_until="domcontentloaded")

    def stop(self) -> None:
        try:
            if self._ctx:
                self._ctx.close()
        finally:
            self._ctx = None
            self._page = None
            if self._pw:
                self._pw.stop()
                self._pw = None

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError("PlaywrightUiWorker not started. Call start().")
        return self._page

    def _screenshot(self, tag: str) -> str:
        ts = int(time.time()*1000)
        path = os.path.join(self.cfg.screenshot_dir, f"{tag}_{ts}.png")
        self.page.screenshot(path=path, full_page=True)
        return path

    def wait_for(self, selector_key: str, timeout_ms: int = 10000) -> UiResult:
        try:
            sel = get_selector(self.uimap, selector_key)
            self.page.locator(sel).wait_for(timeout=timeout_ms)
            return UiResult(ok=True, data={"waited_for": selector_key, "timeout_ms": timeout_ms}, evidence={"screenshot_path": self._screenshot("wait")})
        except Exception as e:
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("wait_err")}, error=str(e))

    def expect_text(self, selector_key: str, text: str, timeout_ms: int = 10000) -> UiResult:
        try:
            sel = get_selector(self.uimap, selector_key)
            loc = self.page.locator(sel)
            loc.wait_for(timeout=timeout_ms)
            found = text in loc.inner_text()
            return UiResult(ok=found, data={"selector": selector_key, "expected": text, "found": found}, evidence={"screenshot_path": self._screenshot("expect")}, error=None if found else "Expected text not found")
        except Exception as e:
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("expect_err")}, error=str(e))

    def navigate(self, nav_path: List[str]) -> UiResult:
        try:
            screens = (self.uimap.get("ui_map") or {}).get("screens") or {}
            target = None
            for _, spec in screens.items():
                if spec.get("nav_path") == nav_path:
                    target = spec
                    break
            if target and target.get("menu_clicks"):
                for key in target["menu_clicks"]:
                    sel = get_selector(self.uimap, key)
                    self.page.locator(sel).click()
            return UiResult(ok=True, data={"nav_path": nav_path}, evidence={"screenshot_path": self._screenshot("navigate")})
        except Exception as e:
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("navigate_err")}, error=str(e))

    def click(self, button_key: str) -> UiResult:
        try:
            sel = get_selector(self.uimap, button_key)
            self.page.locator(sel).click()
            return UiResult(ok=True, data={"clicked": button_key}, evidence={"screenshot_path": self._screenshot("click")})
        except Exception as e:
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("click_err")}, error=str(e))

    def fill_form(self, fields: Dict[str, Any]) -> UiResult:
        try:
            for key, value in fields.items():
                sel = get_selector(self.uimap, key)
                self.page.locator(sel).fill("" if value is None else str(value))
            return UiResult(ok=True, data={"filled": list(fields.keys())}, evidence={"screenshot_path": self._screenshot("fill")})
        except Exception as e:
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("fill_err")}, error=str(e))

    def read_table(self, table_key: str, filters: Optional[Dict[str, Any]] = None) -> UiResult:
        try:
            row_sel = get_selector(self.uimap, table_key)
            rows = self.page.locator(row_sel)
            n = rows.count()
            out = []
            for i in range(n):
                txt = rows.nth(i).inner_text()
                out.append({"row_index": i, "text": txt})
            if filters:
                def ok(r):
                    return all(str(v) in r["text"] for v in filters.values())
                out = [r for r in out if ok(r)]
            return UiResult(ok=True, data={"table": table_key, "rows": out, "row_count": len(out)}, evidence={"screenshot_path": self._screenshot("table")})
        except Exception as e:
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("table_err")}, error=str(e))

    def select_row(self, table_key: str, where: Dict[str, Any]) -> UiResult:
        try:
            row_sel = get_selector(self.uimap, table_key)
            rows = self.page.locator(row_sel)
            n = rows.count()
            for i in range(n):
                txt = rows.nth(i).inner_text()
                if all(str(v) in txt for v in where.values()):
                    rows.nth(i).click()
                    return UiResult(ok=True, data={"selected_row": i}, evidence={"screenshot_path": self._screenshot("select")})
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("select_err")}, error="No matching row")
        except Exception as e:
            return UiResult(ok=False, data={}, evidence={"screenshot_path": self._screenshot("select_err")}, error=str(e))
