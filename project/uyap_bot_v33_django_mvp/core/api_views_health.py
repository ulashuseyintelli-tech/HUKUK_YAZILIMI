from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from core.models import SelectorHealthLog

class HealthViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["get"])
    def selector_health(self, request):
        # top failing selectors
        fail = SelectorHealthLog.objects.filter(ok=False).values("selector_key").annotate(c=Count("id")).order_by("-c")[:50]
        ok = SelectorHealthLog.objects.filter(ok=True).values("selector_key").annotate(c=Count("id")).order_by("-c")[:50]
        return Response({
            "top_fail": list(fail),
            "top_ok": list(ok),
        })
