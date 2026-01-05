from django.urls import path
from .views import UyapEventIngestView

urlpatterns = [
    path("uyap/events", UyapEventIngestView.as_view(), name="uyap-event-ingest"),
]
