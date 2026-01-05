from django.contrib import admin
from .models import PolicyRule

@admin.register(PolicyRule)
class PolicyRuleAdmin(admin.ModelAdmin):
    list_display = ("priority","name","decision","action_type","is_enabled","updated_at")
    list_filter = ("decision","action_type","is_enabled")
    search_fields = ("name","expr","note")
