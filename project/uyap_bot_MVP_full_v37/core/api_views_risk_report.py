from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from core.models import Case
from core.risk_net_report import build_risk_net_report

class RiskNetReportViewSet(viewsets.ViewSet):
    @action(detail=True, methods=["get"])
    def report(self, request, pk=None):
        case = Case.objects.get(id=pk)
        return Response(build_risk_net_report(case))
