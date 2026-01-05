from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, Optional, List
import time, os

from playwright.sync_api import sync_playwright
from django.conf import settings

from core.models import UiMapRecording
from core.selector_scoring import rank_candidates

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

def _candidates(inner_text: str, attrs: Dict[str, str]) -> List[str]:
    cand: List[str] = []
    t = (inner_text or "").strip()
    if t:
        cand.append(f"text={t[:60]}")
    if attrs.get("id"):
        cand.append(f"css=#{attrs['id']}")
    if attrs.get("name"):
        cand.append(f"css=[name='{attrs['name']}']")
    if attrs.get("class"):
        first = attrs["class"].split()[0]
        cand.append(f"css=.{first}")
    out: List[str] = []
    for c in cand:
        if c and c not in out:
            out.append(c)
    return out

def suggest_selector_by_text(label: str, text: str, cfg: RecorderConfig, selector_kind: str="unknown") -> UiMapRecording:
    _ensure_dirs(cfg)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(cfg.user_data_dir, headless=cfg.headless)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if cfg.base_url:
            page.goto(cfg.base_url, wait_until="domcontentloaded")

        loc = page.get_by_text(text).first
        loc.wait_for(timeout=15000)

        el = loc.element_handle()
        selector_primary = f"text={text}"
        alts = [selector_primary]
        meta: Dict[str, Any] = {"text": text, "hint": "Candidates are best-effort; refine for stability."}

        attrs: Dict[str, str] = {}
        inner = text
        if el:
            for k in ["id","name","class","type","role","aria-label"]:
                try:
                    v = el.get_attribute(k)
                    if v:
                        attrs[k] = v
                except Exception:
                    pass
            meta["attrs"] = attrs
            try:
                inner = el.inner_text() or text
            except Exception:
                inner = text
            meta["inner_text"] = inner[:200]
            alts = _candidates(inner, attrs)

        ranked = rank_candidates(alts)
        if ranked:
            selector_primary, stability = ranked[0]
            ordered = [s for s, _ in ranked]
        else:
            stability = 0.3
            ordered = alts

        ts = int(time.time()*1000)
        sp = os.path.join(cfg.screenshot_dir, f"rec_{label}_{ts}.png")
        page.screenshot(path=sp, full_page=True)

        rec = UiMapRecording.objects.create(
            label=label,
            selector=selector_primary,
            meta={**meta, "ranked": ranked},
            alternatives=ordered,
            stability_score=stability,
            selector_kind=selector_kind,
            screenshot_path=sp,
            approved=False,
        )
        ctx.close()
        return rec

def suggest_table_column_selector(label: str, table_rows_selector: str, col_index_1based: int, cfg: RecorderConfig) -> UiMapRecording:
    # produces a relative selector like css=td:nth-child(k)
    _ensure_dirs(cfg)
    selector = f"css=td:nth-child({col_index_1based})"
    stability = 0.6
    meta = {"table_rows_selector": table_rows_selector, "col_index": col_index_1based, "relative": True}
    # no page interaction required; still create a record
    rec = UiMapRecording.objects.create(
        label=label,
        selector=selector,
        meta=meta,
        alternatives=[selector],
        stability_score=stability,
        selector_kind="table_column",
        screenshot_path=None,
        approved=False,
    )
    return rec
