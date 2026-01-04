from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from playwright.sync_api import sync_playwright, Page, BrowserContext
from django.conf import settings

from core.ui_worker import UiResult, UiWorker
from core.locator_resolver import get_selector
from core.models import SelectorHealthLog

import os
import time

@dataclass
class PlaywrightConfig:
    headless: bool = True
    user_data_dir: str = "playwright_user_data"
    slow_mo_ms: int = 0
    base_url: Optional[str] = None
    screenshot_dir: str = "exports/evidence"
    download_dir: str = "exports/downloads"

class PlaywrightUiWorker(UiWorker):
    def __init__(self, uimap: Dict[str, Any], cfg: Optional[PlaywrightConfig] = None, recipe_id: str=""):
        self.uimap = uimap
        self.cfg = cfg or PlaywrightConfig()
        self.recipe_id = recipe_id
        self._pw = None
        self._ctx: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._ensure_dirs()

    def _ensure_dirs(self):
        base = getattr(settings, "BASE_DIR", None)
        if base:
            self.cfg.user_data_dir = str(os.path.join(base, self.cfg.user_data_dir))
            self.cfg.screenshot_dir = str(os.path.join(base, self.cfg.screenshot_dir))
            self.cfg.download_dir = str(os.path.join(base, self.cfg.download_dir))
        os.makedirs(self.cfg.user_data_dir, exist_ok=True)
        os.makedirs(self.cfg.screenshot_dir, exist_ok=True)
        os.makedirs(self.cfg.download_dir, exist_ok=True)

    def start(self) -> None:
        self._pw = sync_playwright().start()
        self._ctx = self._pw.chromium.launch_persistent_context(
            user_data_dir=self.cfg.user_data_dir,
            headless=self.cfg.headless,
            slow_mo=self.cfg.slow_mo_ms,
            accept_downloads=True,
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

    def _log_health(self, selector_key: str, ok: bool, error: str|None, screenshot_path: str|None):
        try:
            SelectorHealthLog.objects.create(
                recipe_id=self.recipe_id or "",
                selector_key=selector_key,
                ok=ok,
                error=error,
                screenshot_path=screenshot_path,
            )
        except Exception:
            pass

    def _resolve(self, key: str) -> str:
        sel = get_selector(self.uimap, key)
        return sel

    def wait_for(self, selector_key: str, timeout_ms: int = 10000) -> UiResult:
        try:
            sel = self._resolve(selector_key)
            self.page.locator(sel).wait_for(timeout=timeout_ms)
            sp = self._screenshot("wait")
            self._log_health(selector_key, True, None, sp)
            return UiResult(ok=True, data={"waited_for": selector_key}, evidence={"screenshot_path": sp})
        except Exception as e:
            sp = self._screenshot("wait_err")
            self._log_health(selector_key, False, str(e), sp)
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

    def expect_text(self, selector_key: str, text: str, timeout_ms: int = 10000) -> UiResult:
        try:
            sel = self._resolve(selector_key)
            loc = self.page.locator(sel)
            loc.wait_for(timeout=timeout_ms)
            found = text in loc.inner_text()
            sp = self._screenshot("expect")
            self._log_health(selector_key, found, None if found else "Expected text not found", sp)
            return UiResult(ok=found, data={"selector": selector_key, "expected": text, "found": found}, evidence={"screenshot_path": sp}, error=None if found else "Expected text not found")
        except Exception as e:
            sp = self._screenshot("expect_err")
            self._log_health(selector_key, False, str(e), sp)
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

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
                    sel = self._resolve(key)
                    self.page.locator(sel).click()
            sp = self._screenshot("navigate")
            return UiResult(ok=True, data={"nav_path": nav_path}, evidence={"screenshot_path": sp})
        except Exception as e:
            sp = self._screenshot("navigate_err")
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

    def click(self, button_key: str) -> UiResult:
        try:
            sel = self._resolve(button_key)
            self.page.locator(sel).click()
            sp = self._screenshot("click")
            self._log_health(button_key, True, None, sp)
            return UiResult(ok=True, data={"clicked": button_key}, evidence={"screenshot_path": sp})
        except Exception as e:
            sp = self._screenshot("click_err")
            self._log_health(button_key, False, str(e), sp)
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

    def fill_form(self, fields: Dict[str, Any]) -> UiResult:
        try:
            for key, value in fields.items():
                sel = self._resolve(key)
                self.page.locator(sel).fill("" if value is None else str(value))
                self._log_health(key, True, None, None)
            sp = self._screenshot("fill")
            return UiResult(ok=True, data={"filled": list(fields.keys())}, evidence={"screenshot_path": sp})
        except Exception as e:
            sp = self._screenshot("fill_err")
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

    def read_table(self, table_key: str, filters: Optional[Dict[str, Any]] = None) -> UiResult:
        try:
            row_sel = self._resolve(table_key)
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
            sp = self._screenshot("table")
            self._log_health(table_key, True, None, sp)
            return UiResult(ok=True, data={"table": table_key, "rows": out, "row_count": len(out)}, evidence={"screenshot_path": sp})
        except Exception as e:
            sp = self._screenshot("table_err")
            self._log_health(table_key, False, str(e), sp)
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

    def select_row(self, table_key: str, where: Dict[str, Any]) -> UiResult:
        try:
            row_sel = self._resolve(table_key)
            rows = self.page.locator(row_sel)
            n = rows.count()
            for i in range(n):
                txt = rows.nth(i).inner_text()
                if all(str(v) in txt for v in where.values()):
                    rows.nth(i).click()
                    sp = self._screenshot("select")
                    return UiResult(ok=True, data={"selected_row": i}, evidence={"screenshot_path": sp})
            sp = self._screenshot("select_err")
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error="No matching row")
        except Exception as e:
            sp = self._screenshot("select_err")
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

    def download_file(self, button_key: str) -> UiResult:
        try:
            sel = self._resolve(button_key)
            with self.page.expect_download() as dl_info:
                self.page.locator(sel).click()
            dl = dl_info.value
            path = os.path.join(self.cfg.download_dir, dl.suggested_filename)
            dl.save_as(path)
            sp = self._screenshot("download")
            return UiResult(ok=True, data={"download_path": path}, evidence={"screenshot_path": sp})
        except Exception as e:
            sp = self._screenshot("download_err")
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))

    def upload_file(self, field_key: str, file_path: str) -> UiResult:
        try:
            sel = self._resolve(field_key)
            self.page.set_input_files(sel, file_path)
            sp = self._screenshot("upload")
            return UiResult(ok=True, data={"uploaded": file_path}, evidence={"screenshot_path": sp})
        except Exception as e:
            sp = self._screenshot("upload_err")
            return UiResult(ok=False, data={}, evidence={"screenshot_path": sp}, error=str(e))
