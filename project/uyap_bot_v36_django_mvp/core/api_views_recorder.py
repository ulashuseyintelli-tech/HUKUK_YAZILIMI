from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.models import UiMapRecording, UiMapBundle, SelectorHealthLog
from core.uimap_recorder import RecorderConfig, suggest_selector_by_text, suggest_table_column_selector
from core.utils import parse_yaml_or_json, sha256_text

from playwright.sync_api import sync_playwright
from django.conf import settings
import os, time

def _guess_section(label: str) -> str:
    if label.startswith("BTN_"):
        return "buttons"
    if label.startswith("FIELD_"):
        return "fields"
    if label.startswith("TABLE_"):
        return "tables"
    return "actions"

def _click_test(selector: str, base_url: str|None) -> dict:
    user_data_dir = os.path.join(settings.BASE_DIR, "playwright_user_data")
    evidence_dir = os.path.join(settings.BASE_DIR, "exports", "recorder_test")
    os.makedirs(user_data_dir, exist_ok=True)
    os.makedirs(evidence_dir, exist_ok=True)

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(user_data_dir, headless=False)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if base_url:
            page.goto(base_url, wait_until="domcontentloaded")
        ok = True
        err = None
        ts = int(time.time()*1000)
        sp = os.path.join(evidence_dir, f"clicktest_{ts}.png")
        try:
            page.locator(selector).first.click(timeout=5000)
        except Exception as e:
            ok = False
            err = str(e)
        page.screenshot(path=sp, full_page=True)
        ctx.close()

    SelectorHealthLog.objects.create(recipe_id="RECORDER_TEST", selector_key=selector, ok=ok, error=err, screenshot_path=sp)
    return {"ok": ok, "error": err, "screenshot_path": sp}

class RecorderViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["post"])
    def suggest_by_text(self, request):
        label = request.data.get("label")
        text = request.data.get("text")
        base_url = request.data.get("base_url")
        kind = request.data.get("kind", "unknown")
        if not label or not text:
            return Response({"ok": False, "error": "label and text required"}, status=status.HTTP_400_BAD_REQUEST)
        cfg = RecorderConfig(headless=False, base_url=base_url)
        rec = suggest_selector_by_text(label, text, cfg, selector_kind=kind)
        return Response({
            "ok": True,
            "recording_id": rec.id,
            "label": rec.label,
            "selector": rec.selector,
            "alternatives": rec.alternatives,
            "stability_score": rec.stability_score,
            "selector_kind": rec.selector_kind,
            "screenshot_path": rec.screenshot_path,
            "meta": rec.meta,
        })

    @action(detail=False, methods=["post"])
    def suggest_table_column(self, request):
        label = request.data.get("label")
        table_rows_selector = request.data.get("table_rows_selector")  # logical key or raw selector
        col_index = request.data.get("col_index")
        if not label or not table_rows_selector or not col_index:
            return Response({"ok": False, "error": "label, table_rows_selector, col_index required"}, status=status.HTTP_400_BAD_REQUEST)
        cfg = RecorderConfig(headless=True, base_url=None)
        rec = suggest_table_column_selector(label, str(table_rows_selector), int(col_index), cfg)
        return Response({"ok": True, "recording_id": rec.id, "label": rec.label, "selector": rec.selector, "stability_score": rec.stability_score})

    @action(detail=False, methods=["post"])
    def approve(self, request):
        rec_id = request.data.get("recording_id")
        section = request.data.get("section")
        alt_index = request.data.get("alt_index")
        base_url = request.data.get("base_url")
        auto_test = bool(request.data.get("auto_test", True))

        if not rec_id:
            return Response({"ok": False, "error": "recording_id required"}, status=status.HTTP_400_BAD_REQUEST)
        rec = UiMapRecording.objects.get(id=rec_id)

        if section is None:
            section = _guess_section(rec.label)

        selector = rec.selector
        if alt_index is not None:
            try:
                idx = int(alt_index)
                if rec.alternatives and 0 <= idx < len(rec.alternatives):
                    selector = rec.alternatives[idx]
            except Exception:
                pass

        test_result = None
        if auto_test and rec.selector_kind != "table_column":
            test_result = _click_test(selector, base_url)

        # if test fails, do not approve unless force=true
        force = bool(request.data.get("force", False))
        if test_result and test_result["ok"] is False and not force:
            return Response({"ok": False, "error": "click_test_failed", "test": test_result}, status=status.HTTP_400_BAD_REQUEST)

        rec.approved = True
        rec.selector = selector
        rec.save(update_fields=["approved","selector","updated_at"])

        ub = UiMapBundle.objects.filter(status="active").order_by("-version").first()
        if not ub:
            return Response({"ok": False, "error": "No ACTIVE UiMapBundle"}, status=status.HTTP_400_BAD_REQUEST)

        data = parse_yaml_or_json(ub.content)
        lb = data.setdefault("locator_bindings", {})
        sec = lb.setdefault(section, {})
        sec[rec.label] = rec.selector

        import yaml
        new_text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
        ub.content = new_text
        ub.content_hash = sha256_text(new_text)
        ub.save(update_fields=["content","content_hash","updated_at"])

        return Response({"ok": True, "label": rec.label, "section": section, "selector": rec.selector, "uimap_bundle": ub.id, "test": test_result})
