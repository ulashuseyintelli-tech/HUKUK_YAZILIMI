from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.conf import settings
import os, time

from playwright.sync_api import sync_playwright
from core.models import SelectorHealthLog

class RecorderTestViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["post"])
    def click_test(self, request):
        selector = request.data.get("selector")
        base_url = request.data.get("base_url")
        if not selector:
            return Response({"ok": False, "error": "selector required"}, status=status.HTTP_400_BAD_REQUEST)

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
        return Response({"ok": ok, "error": err, "screenshot_path": sp})
