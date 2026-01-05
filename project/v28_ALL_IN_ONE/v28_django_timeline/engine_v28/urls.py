from django.urls import path
from .views import CaseTimelineView, EngineRunDetailView, OutboxActionDetailView

urlpatterns = [
    path("cases/<str:case_id>/timeline", CaseTimelineView.as_view(), name="case-timeline"),
    path("engine/runs/<uuid:run_id>", EngineRunDetailView.as_view(), name="engine-run-detail"),
    path("actions/<uuid:action_id>", OutboxActionDetailView.as_view(), name="outbox-action-detail"),
]
