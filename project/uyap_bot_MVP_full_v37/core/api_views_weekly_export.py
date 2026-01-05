from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from core.weekly_export import build_weekly_summary

class WeeklyExportViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["get"])
    def weekly(self, request):
        return Response(build_weekly_summary())
