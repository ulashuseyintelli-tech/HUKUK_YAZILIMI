from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from core.models import Case
from core.action_list import build_action_list

class ActionListViewSet(viewsets.ViewSet):
    @action(detail=True, methods=["get"])
    def list(self, request, pk=None):
        case = Case.objects.get(id=pk)
        return Response(build_action_list(case))
