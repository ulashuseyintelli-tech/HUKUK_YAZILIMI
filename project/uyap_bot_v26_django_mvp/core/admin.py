from django.contrib import admin
from .models import Case, Debtor, Asset, Lien, Fact, Snapshot, JobRun, JobStep, Lock, Communication, RecipeBundle, ParamBundle, UiMapBundle, EvidenceExport, SelectorHealthLog, SystemConfig, CaseRunLock

@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = ("id", "uyap_dosya_no", "icra_type", "stage", "claim_amount", "updated_at")
    search_fields = ("uyap_dosya_no", "creditor_name")
    list_filter = ("icra_type", "stage")

@admin.register(Debtor)
class DebtorAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "name", "identity_no", "behavior_score", "behavior_class")
    search_fields = ("name", "identity_no")
    list_filter = ("behavior_class",)

@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "debtor", "asset_type", "asset_fingerprint", "valuation_value_mid", "valuation_confidence")
    search_fields = ("asset_fingerprint",)
    list_filter = ("asset_type",)

@admin.register(Lien)
class LienAdmin(admin.ModelAdmin):
    list_display = ("id", "asset", "lien_type", "creditor", "lien_date", "rank_order", "amount_claimed", "active_status", "is_our_lien")
    search_fields = ("creditor", "reference_no")
    list_filter = ("lien_type", "active_status", "is_our_lien")

@admin.register(Fact)
class FactAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "debtor", "fact_type", "key", "created_at")
    search_fields = ("fact_type", "key")
    list_filter = ("fact_type",)

@admin.register(Snapshot)
class SnapshotAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "source", "uyap_nav_path", "snapshot_hash", "created_at")
    search_fields = ("snapshot_hash", "uyap_nav_path")
    list_filter = ("source",)

class JobStepInline(admin.TabularInline):
    model = JobStep
    extra = 0

@admin.register(JobRun)
class JobRunAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "debtor", "recipe_id", "recipe_version", "status", "risk_level", "started_at", "finished_at", "attempt")
    search_fields = ("recipe_id", "last_error_code")
    list_filter = ("status", "risk_level", "recipe_id")
    inlines = [JobStepInline]

@admin.register(Lock)
class LockAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "lock_id", "is_open", "reason", "created_at")
    list_filter = ("lock_id", "is_open")

@admin.register(Communication)
class CommunicationAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "debtor", "template_id", "channel", "status", "created_at")
    list_filter = ("channel", "status")


@admin.register(RecipeBundle)
class RecipeBundleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "bundle_kind", "version", "status", "content_hash", "updated_at")
    search_fields = ("name",)
    list_filter = ("status",)

@admin.register(ParamBundle)
class ParamBundleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "bundle_kind", "version", "status", "content_hash", "updated_at")
    search_fields = ("name",)
    list_filter = ("status",)

@admin.register(UiMapBundle)
class UiMapBundleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "bundle_kind", "version", "status", "content_hash", "updated_at")
    search_fields = ("name",)
    list_filter = ("status",)

@admin.register(EvidenceExport, SelectorHealthLog, SystemConfig, CaseRunLock)
class EvidenceExport, SelectorHealthLog, SystemConfig, CaseRunLockAdmin(admin.ModelAdmin):
    list_display = ("id", "case", "status", "export_hash", "created_at")
    list_filter = ("status",)


@admin.register(SelectorHealthLog, SystemConfig, CaseRunLock)
class SelectorHealthLog, SystemConfig, CaseRunLockAdmin(admin.ModelAdmin):
    list_display = ("id","created_at","recipe_id","selector_key","ok","error")
    list_filter = ("ok","recipe_id")
    search_fields = ("selector_key","error","recipe_id")


@admin.register(SystemConfig, CaseRunLock)
class SystemConfig, CaseRunLockAdmin(admin.ModelAdmin):
    list_display = ("id","key","updated_at")
    search_fields = ("key",)


@admin.register(CaseRunLock)
class CaseRunLockAdmin(admin.ModelAdmin):
    list_display = ("id","case","is_locked","locked_by_job_id","lock_reason","updated_at")
    list_filter = ("is_locked",)
