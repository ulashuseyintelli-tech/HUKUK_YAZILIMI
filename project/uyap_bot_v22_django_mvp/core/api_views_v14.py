from rest_framework import viewsets, filters, status
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.response import Response

from core.models import RecipeBundle, ParamBundle, UiMapBundle, EvidenceExport, Case
from core.utils import sha256_text
from core.audit_export import export_case_audit

from rest_framework import serializers

class BundleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeBundle
        fields = ["id","name","version","status","content","content_hash","created_at","updated_at"]

class RecipeBundleViewSet(viewsets.ModelViewSet):
    queryset = RecipeBundle.objects.all().order_by("-updated_at")
    serializer_class = BundleSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "name"]
    search_fields = ["name"]
    ordering_fields = ["updated_at","version","id"]

    @action(detail=True, methods=["post"])
    def promote(self, request, pk=None):
        b = self.get_object()
        # deactivate others
        RecipeBundle.objects.filter(name=b.name, status="active").update(status="approved")
        b.status = "active"
        b.content_hash = sha256_text(b.content)
        b.save(update_fields=["status","content_hash"])
        return Response({"ok": True, "id": b.id, "status": b.status, "hash": b.content_hash})

class ParamBundleViewSet(viewsets.ModelViewSet):
    queryset = ParamBundle.objects.all().order_by("-updated_at")
    serializer_class = BundleSerializer

    @action(detail=True, methods=["post"])
    def promote(self, request, pk=None):
        b = self.get_object()
        ParamBundle.objects.filter(name=b.name, status="active").update(status="approved")
        b.status = "active"
        b.content_hash = sha256_text(b.content)
        b.save(update_fields=["status","content_hash"])
        return Response({"ok": True, "id": b.id, "status": b.status, "hash": b.content_hash})

class UiMapBundleViewSet(viewsets.ModelViewSet):
    queryset = UiMapBundle.objects.all().order_by("-updated_at")
    serializer_class = BundleSerializer

    @action(detail=True, methods=["post"])
    def promote(self, request, pk=None):
        b = self.get_object()
        UiMapBundle.objects.filter(name=b.name, status="active").update(status="approved")
        b.status = "active"
        b.content_hash = sha256_text(b.content)
        b.save(update_fields=["status","content_hash"])
        return Response({"ok": True, "id": b.id, "status": b.status, "hash": b.content_hash})

class EvidenceExportSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceExport
        fields = ["id","case_id","requested_by","export_path","export_hash","status","error","created_at"]

class EvidenceExportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EvidenceExport.objects.all().order_by("-created_at")
    serializer_class = EvidenceExportSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status","case__id"]

class AuditExportActionViewSet(viewsets.ViewSet):
    @action(detail=True, methods=["post"])
    def export(self, request, pk=None):
        case = Case.objects.get(id=pk)
        export = export_case_audit(case, requested_by=str(request.user) if request.user and request.user.is_authenticated else "anon")
        return Response(EvidenceExportSerializer(export).data, status=status.HTTP_201_CREATED)
