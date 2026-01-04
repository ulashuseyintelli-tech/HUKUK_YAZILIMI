from rest_framework.routers import DefaultRouter
from .api_views import CaseViewSet, JobRunViewSet
from .api_views_v14 import RecipeBundleViewSet, ParamBundleViewSet, UiMapBundleViewSet, EvidenceExportViewSet, AuditExportActionViewSet

router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")
router.register(r"jobs", JobRunViewSet, basename="job")
router.register(r"bundles/recipes", RecipeBundleViewSet, basename="recipe-bundle")
router.register(r"bundles/params", ParamBundleViewSet, basename="param-bundle")
router.register(r"bundles/uimap", UiMapBundleViewSet, basename="uimap-bundle")
router.register(r"exports", EvidenceExportViewSet, basename="evidence-export")
router.register(r"audit-export", AuditExportActionViewSet, basename="audit-export")

urlpatterns = router.urls
