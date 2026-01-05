from django.contrib import admin
from .models import RulePack, Rule, RuleRevision

@admin.register(RulePack)
class RulePackAdmin(admin.ModelAdmin):
    list_display = ("name","is_active","updated_at")
    search_fields = ("name",)

@admin.register(Rule)
class RuleAdmin(admin.ModelAdmin):
    list_display = ("key","pack","is_enabled","updated_at")
    list_filter = ("pack","is_enabled")
    search_fields = ("key",)

@admin.register(RuleRevision)
class RuleRevisionAdmin(admin.ModelAdmin):
    list_display = ("rule","version","sha256","created_at","created_by")
    list_filter = ("created_at",)
    search_fields = ("rule__key","sha256")
    readonly_fields = ("sha256","created_at")
