from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, Optional
import time, os

from playwright.sync_api import sync_playwright
from django.conf import settings

from core.models import UiMapRecording

@dataclass
class RecorderConfig:
    headless: bool = False
    user_data_dir: str = "playwright_user_data"
    base_url: Optional[str] = None
    screenshot_dir: str = "exports/recorder"

def _ensure_dirs(cfg: RecorderConfig):
    base = getattr(settings, "BASE_DIR", None)
    if base:
        cfg.user_data_dir = str(os.path.join(base, cfg.user_data_dir))
        cfg.screenshot_dir = str(os.path.join(base, cfg.screenshot_dir))
    os.makedirs(cfg.user_data_dir, exist_ok=True)
    os.makedirs(cfg.screenshot_dir, exist_ok=True)

def suggest_selector_by_text(label: str, text: str, cfg: RecorderConfig) -> UiMapRecording:
    """Very small MVP recorder:
    - opens base_url
    - finds first element that contains given visible text
    - stores selector suggestion

    This does NOT auto-click UYAP (you will run this manually with user already logged in).
    """
    _ensure_dirs(cfg)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(cfg.user_data_dir, headless=cfg.headless)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if cfg.base_url:
            page.goto(cfg.base_url, wait_until="domcontentloaded")

        # find element by text (generic)
        loc = page.get_by_text(text).first
        loc.wait_for(timeout=15000)

        # Try to build a stable selector:
        # prefer role+name if possible
        role_sel = None
        try:
            # playwright can generate locator string representation
            role_sel = f"text={text}"
        except Exception:
            role_sel = f"text={text}"

        ts = int(time.time()*1000)
        sp = os.path.join(cfg.screenshot_dir, f"rec_{label}_{ts}.png")
        page.screenshot(path=sp, full_page=True)

        meta = {"text": text, "hint": "MVP uses text=...; replace with css/xpath if needed"}
        rec = UiMapRecording.objects.create(label=label, selector=role_sel, meta=meta, screenshot_path=sp, approved=False)
        ctx.close()
        return rec
