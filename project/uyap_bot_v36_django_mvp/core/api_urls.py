from rest_framework.routers import DefaultRouter
from .api_views import CaseViewSet, JobRunViewSet
from .api_views_case_health import CaseHealthViewSet
from .api_views_v14 import RecipeBundleViewSet, ParamBundleViewSet, UiMapBundleViewSet, EvidenceExportViewSet, AuditExportActionViewSet
from .api_views_ops import OpsViewSet
from .api_views_recorder import RecorderViewSet
from .api_views_health import HealthViewSet
from .api_views_uimap_validate import UiMapValidateViewSet
from .api_views_recorder_test import RecorderTestViewSet

router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")
router.register(r"case-health", CaseHealthViewSet, basename="case-health")
router.register(r"jobs", JobRunViewSet, basename="job")
router.register(r"bundles/recipes", RecipeBundleViewSet, basename="recipe-bundle")
router.register(r"bundles/params", ParamBundleViewSet, basename="param-bundle")
router.register(r"bundles/uimap", UiMapBundleViewSet, basename="uimap-bundle")
router.register(r"exports", EvidenceExportViewSet, basename="evidence-export")
router.register(r"audit-export", AuditExportActionViewSet, basename="audit-export")
router.register(r"ops", OpsViewSet, basename="ops")
router.register(r"recorder", RecorderViewSet, basename="recorder")
router.register(r"health", HealthViewSet, basename="health")
router.register(r"uimap-validate", UiMapValidateViewSet, basename="uimap-validate")
router.register(r"recorder-test", RecorderTestViewSet, basename="recorder-test")

urlpatterns = router.urls
