from django.utils import timezone
from django.db.models import Q
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EngineRun, TimelineEntry, OutboxAction
from .serializers import TimelineEntrySerializer, EngineRunSerializer, OutboxActionSerializer

class CaseTimelineView(APIView):
    """GET /cases/<case_id>/timeline?cursor=<iso_ts>&limit=50
    cursor is a timestamp; returns entries with ts < cursor (paging backwards).
    """
    def get(self, request, case_id: str):
        limit = int(request.query_params.get("limit", 50))
        limit = max(1, min(limit, 200))

        cursor = request.query_params.get("cursor")
        qs = TimelineEntry.objects.filter(case_id=case_id).order_by("-ts")

        if cursor:
            try:
                cursor_dt = timezone.datetime.fromisoformat(cursor)
                if cursor_dt.tzinfo is None:
                    cursor_dt = cursor_dt.replace(tzinfo=timezone.get_current_timezone())
                qs = qs.filter(ts__lt=cursor_dt)
            except Exception:
                # Bad cursor: ignore and return first page
                pass

        items = list(qs[:limit])
        next_cursor = items[-1].ts.isoformat() if len(items) == limit else None

        data = TimelineEntrySerializer(items, many=True).data
        return Response({"next_cursor": next_cursor, "items": data})


class EngineRunDetailView(generics.RetrieveAPIView):
    queryset = EngineRun.objects.all()
    serializer_class = EngineRunSerializer
    lookup_field = "run_id"


class OutboxActionDetailView(generics.RetrieveAPIView):
    queryset = OutboxAction.objects.all()
    serializer_class = OutboxActionSerializer
    lookup_field = "action_id"
