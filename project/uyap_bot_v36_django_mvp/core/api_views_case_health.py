from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from core.models import Case
from core.case_health import compute_case_health

class CaseHealthViewSet(viewsets.ViewSet):
    @action(detail=True, methods=["get"])
    def health(self, request, pk=None):
        case = Case.objects.get(id=pk)
        return Response(compute_case_health(case))
