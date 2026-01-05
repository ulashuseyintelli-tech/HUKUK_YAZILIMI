from django.urls import path
from .rollback_api import DisableRevisionView, DisableRuleView, PinVersionView

urlpatterns += [
    path("rules/disable_revision", DisableRevisionView.as_view(), name="rules-disable-revision"),
    path("rules/disable_rule", DisableRuleView.as_view(), name="rules-disable-rule"),
    path("rules/pin_version", PinVersionView.as_view(), name="rules-pin-version"),
]
