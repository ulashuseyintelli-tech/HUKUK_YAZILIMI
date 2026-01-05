from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core.models import UiMapBundle
from core.utils import parse_yaml_or_json
from core.uimap_validator import validate_uimap

class UiMapValidateViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["get"])
    def validate_active(self, request):
        ub = UiMapBundle.objects.filter(status="active").order_by("-version").first()
        if not ub:
            return Response({"ok": False, "error": "No ACTIVE UiMapBundle"}, status=status.HTTP_400_BAD_REQUEST)
        data = parse_yaml_or_json(ub.content)
        report = validate_uimap(data)
        report["uimap_bundle_id"] = ub.id
        return Response(report)
