from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.models import UiMapRecording, UiMapBundle
from core.uimap_recorder import RecorderConfig, suggest_selector_by_text
from core.utils import parse_yaml_or_json, sha256_text

def _guess_section(label: str) -> str:
    if label.startswith("BTN_"):
        return "buttons"
    if label.startswith("FIELD_"):
        return "fields"
    if label.startswith("TABLE_"):
        return "tables"
    return "actions"

class RecorderViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["post"])
    def suggest_by_text(self, request):
        label = request.data.get("label")
        text = request.data.get("text")
        base_url = request.data.get("base_url")
        if not label or not text:
            return Response({"ok": False, "error": "label and text required"}, status=status.HTTP_400_BAD_REQUEST)
        cfg = RecorderConfig(headless=False, base_url=base_url)
        rec = suggest_selector_by_text(label, text, cfg)
        return Response({
            "ok": True,
            "recording_id": rec.id,
            "label": rec.label,
            "selector": rec.selector,
            "alternatives": rec.alternatives,
            "screenshot_path": rec.screenshot_path,
            "meta": rec.meta,
        })

    @action(detail=False, methods=["post"])
    def approve(self, request):
        rec_id = request.data.get("recording_id")
        section = request.data.get("section")
        alt_index = request.data.get("alt_index")
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

        return Response({"ok": True, "label": rec.label, "section": section, "selector": rec.selector, "uimap_bundle": ub.id})
