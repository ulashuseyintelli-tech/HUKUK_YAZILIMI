from rest_framework.routers import DefaultRouter
from .api_views import CaseViewSet, JobRunViewSet

router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")
router.register(r"jobs", JobRunViewSet, basename="job")

urlpatterns = router.urls
