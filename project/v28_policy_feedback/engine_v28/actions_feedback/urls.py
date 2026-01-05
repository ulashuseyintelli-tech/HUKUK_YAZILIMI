from django.urls import path
from .views import ActionCallbackView

urlpatterns = [
    path("actions/callback", ActionCallbackView.as_view(), name="actions-callback"),
]
