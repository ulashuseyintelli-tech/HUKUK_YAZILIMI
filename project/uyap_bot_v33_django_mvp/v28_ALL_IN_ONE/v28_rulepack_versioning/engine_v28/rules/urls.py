from django.urls import path
from .api import ActiveRulesView, ReloadRulesView

urlpatterns = [
    path("rules/active", ActiveRulesView.as_view(), name="rules-active"),
    path("rules/reload", ReloadRulesView.as_view(), name="rules-reload"),
]
