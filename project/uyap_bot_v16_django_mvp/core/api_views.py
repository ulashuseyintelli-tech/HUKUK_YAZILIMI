from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Case, JobRun, Fact, Snapshot
from .api_serializers import CaseSerializer, JobRunSerializer, FactSerializer, SnapshotSerializer

class CaseViewSet(viewsets.ModelViewSet):
    queryset = Case.objects.all().order_by("-updated_at")
    serializer_class = CaseSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["icra_type", "stage"]
    search_fields = ["uyap_dosya_no", "creditor_name"]
    ordering_fields = ["updated_at", "created_at", "id"]

    @action(detail=True, methods=["get"])
    def audit(self, request, pk=None):
        case = self.get_object()
        facts = Fact.objects.filter(case=case).order_by("-created_at")[:200]
        snaps = Snapshot.objects.filter(case=case).order_by("-created_at")[:50]
        return Response({
            "case": CaseSerializer(case).data,
            "facts": FactSerializer(facts, many=True).data,
            "snapshots": SnapshotSerializer(snaps, many=True).data,
        })

class JobRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = JobRun.objects.all().order_by("-created_at")
    serializer_class = JobRunSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "risk_level", "recipe_id", "case__id"]
    search_fields = ["recipe_id", "last_error_code", "last_error_message"]
    ordering_fields = ["created_at", "started_at", "finished_at", "id"]

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        # MVP: sadece status'u queued yapar; gerçek dünyada celery task enqueue edersin.
        job = self.get_object()
        job.status = "queued"
        job.attempt += 1
        job.save(update_fields=["status", "attempt"])
        return Response({"ok": True, "job_id": job.id, "status": job.status, "attempt": job.attempt})
