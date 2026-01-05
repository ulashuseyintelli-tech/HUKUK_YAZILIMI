from django.db import models
from django.utils import timezone

class Stage(models.TextChoices):
    ACILIS = "ACILIS"
    TEBLIGAT = "TEBLIGAT"
    KESINLESME = "KESINLESME"
    VARLIK = "VARLIK"
    HACIZ = "HACIZ"
    TAHSILAT = "TAHSILAT"
    SATIS = "SATIS"
    KAPANIS = "KAPANIS"
    ASKIDA = "ASKIDA"
    HATA = "HATA"

class IcraType(models.TextChoices):
    ILAMSIZ = "ILAMSIZ"
    ILAMLI = "ILAMLI"
    KAMBIYO = "KAMBIYO"
    KIRA = "KIRA"
    MTS = "MTS"
    DIGER = "DIGER"

class RiskLevel(models.TextChoices):
    READ_ONLY = "read_only"
    CONTROLLED_WRITE = "controlled_write"
    HIGH_IMPACT_WRITE = "high_impact_write"

class JobStatus(models.TextChoices):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING = "waiting"
    BLOCKED = "blocked"
    DONE = "done"
    FAILED = "failed"
    QUARANTINED = "quarantined"

class Case(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    uyap_dosya_no = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    icra_type = models.CharField(max_length=16, choices=IcraType.choices, default=IcraType.ILAMSIZ)
    stage = models.CharField(max_length=16, choices=Stage.choices, default=Stage.ACILIS)

    creditor_name = models.CharField(max_length=255, blank=True, null=True)
    claim_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    finalization_candidate_date = models.DateField(blank=True, null=True)

    def __str__(self) -> str:
        return f"Case #{self.id} ({self.uyap_dosya_no or 'NO-UYAP'})"

class Debtor(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="debtors")
    created_at = models.DateTimeField(default=timezone.now)

    name = models.CharField(max_length=255)
    identity_no = models.CharField(max_length=32, blank=True, null=True, db_index=True)

    behavior_score = models.IntegerField(blank=True, null=True)
    behavior_class = models.CharField(max_length=32, blank=True, null=True)

    def __str__(self) -> str:
        return f"Debtor #{self.id} ({self.name})"

class AssetType(models.TextChoices):
    VEHICLE = "vehicle"
    REAL_ESTATE = "real_estate"
    BANK = "bank"
    SGK = "sgk"
    OTHER = "other"

class Asset(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="assets")
    debtor = models.ForeignKey(Debtor, on_delete=models.CASCADE, related_name="assets")
    created_at = models.DateTimeField(default=timezone.now)

    asset_type = models.CharField(max_length=32, choices=AssetType.choices)
    asset_fingerprint = models.CharField(max_length=128, db_index=True)  # e.g. vehicle:plate:34ABC123
    attributes = models.JSONField(default=dict)

    valuation_value_mid = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True)
    valuation_confidence = models.FloatField(blank=True, null=True)

    def __str__(self) -> str:
        return f"Asset #{self.id} ({self.asset_type}:{self.asset_fingerprint})"

class LienType(models.TextChoices):
    HACIZ = "haciz"
    REHIN = "rehin"
    TEDBIR = "tedbir"

class ActiveStatus(models.TextChoices):
    ACTIVE = "active"
    INACTIVE = "inactive"
    UNKNOWN = "unknown"

class Lien(models.Model):
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="liens")
    created_at = models.DateTimeField(default=timezone.now)

    lien_type = models.CharField(max_length=16, choices=LienType.choices)
    creditor = models.CharField(max_length=255)
    lien_date = models.DateField()

    rank_order = models.IntegerField(blank=True, null=True)
    amount_claimed = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True)
    active_status = models.CharField(max_length=16, choices=ActiveStatus.choices, default=ActiveStatus.UNKNOWN)

    reference_no = models.CharField(max_length=64, blank=True, null=True)
    is_our_lien = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"Lien #{self.id} ({self.lien_type} {self.creditor})"

class Snapshot(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="snapshots", blank=True, null=True)

    source = models.CharField(max_length=64, default="UYAP")
    uyap_nav_path = models.CharField(max_length=512, blank=True, null=True)
    snapshot_hash = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField(default=dict)
    screenshot_path = models.CharField(max_length=512, blank=True, null=True)

class Fact(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="facts")
    debtor = models.ForeignKey(Debtor, on_delete=models.SET_NULL, related_name="facts", blank=True, null=True)

    fact_type = models.CharField(max_length=64)
    key = models.CharField(max_length=256, db_index=True)
    value = models.JSONField(default=dict)
    snapshot = models.ForeignKey(Snapshot, on_delete=models.SET_NULL, blank=True, null=True)

class Lock(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="locks")
    lock_id = models.CharField(max_length=64)
    is_open = models.BooleanField(default=True)
    reason = models.CharField(max_length=512, blank=True, null=True)

class JobRun(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="jobs")
    debtor = models.ForeignKey(Debtor, on_delete=models.SET_NULL, related_name="jobs", blank=True, null=True)

    recipe_id = models.CharField(max_length=128, db_index=True)
    recipe_version = models.IntegerField(default=1)
    status = models.CharField(max_length=16, choices=JobStatus.choices, default=JobStatus.QUEUED)
    risk_level = models.CharField(max_length=32, choices=RiskLevel.choices, default=RiskLevel.READ_ONLY)
    priority = models.IntegerField(default=50)  # lower = higher priority

    started_at = models.DateTimeField(blank=True, null=True)
    finished_at = models.DateTimeField(blank=True, null=True)
    attempt = models.IntegerField(default=0)
    max_attempts = models.IntegerField(default=4)

    lock_blocked_by = models.CharField(max_length=64, blank=True, null=True)
    last_error_code = models.CharField(max_length=64, blank=True, null=True)
    last_error_message = models.TextField(blank=True, null=True)

class JobStep(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    job = models.ForeignKey(JobRun, on_delete=models.CASCADE, related_name="steps")

    step_no = models.IntegerField()
    action_type = models.CharField(max_length=64)
    uyap_nav_path = models.CharField(max_length=512, blank=True, null=True)
    status = models.CharField(max_length=16, default="ok")  # ok/warn/error

    snapshot = models.ForeignKey(Snapshot, on_delete=models.SET_NULL, blank=True, null=True)
    proof_ref = models.CharField(max_length=256, blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["job", "step_no"]),
        ]

class Communication(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="communications")
    debtor = models.ForeignKey(Debtor, on_delete=models.SET_NULL, related_name="communications", blank=True, null=True)

    template_id = models.CharField(max_length=128)
    channel = models.CharField(max_length=32)  # email/sms/whatsapp
    status = models.CharField(max_length=32, default="prepared")  # prepared/sent/failed
    payload = models.JSONField(default=dict)


class BundleStatus(models.TextChoices):
    DRAFT = "draft"
    APPROVED = "approved"
    ACTIVE = "active"
    ARCHIVED = "archived"

class RecipeBundle(models.Model):
    """DB'de saklanan recipe YAML veya JSON paketi."""
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    name = models.CharField(max_length=128, unique=True)
    version = models.IntegerField(default=1)
    status = models.CharField(max_length=16, choices=BundleStatus.choices, default=BundleStatus.DRAFT)

    content = models.TextField()  # YAML/JSON
    content_hash = models.CharField(max_length=64, db_index=True)

    notes = models.TextField(blank=True, null=True)

    def __str__(self) -> str:
        return f"RecipeBundle {self.name} v{self.version} ({self.status})"

class ParamBundle(models.Model):
    bundle_kind = models.CharField(max_length=32, default='params')  # params/decision_rules/risk/recovery/etc.

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    name = models.CharField(max_length=128, unique=True)
    version = models.IntegerField(default=1)
    status = models.CharField(max_length=16, choices=BundleStatus.choices, default=BundleStatus.DRAFT)

    content = models.TextField()
    content_hash = models.CharField(max_length=64, db_index=True)

    def __str__(self) -> str:
        return f"ParamBundle {self.name} v{self.version} ({self.status})"

class UiMapBundle(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    name = models.CharField(max_length=128, unique=True)
    version = models.IntegerField(default=1)
    status = models.CharField(max_length=16, choices=BundleStatus.choices, default=BundleStatus.DRAFT)

    content = models.TextField()
    content_hash = models.CharField(max_length=64, db_index=True)

    def __str__(self) -> str:
        return f"UiMapBundle {self.name} v{self.version} ({self.status})"

class EvidenceExport(models.Model):
    """Audit paket export kayıtları."""
    created_at = models.DateTimeField(default=timezone.now)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="exports")
    requested_by = models.CharField(max_length=128, blank=True, null=True)

    export_path = models.CharField(max_length=512, blank=True, null=True)
    export_hash = models.CharField(max_length=64, blank=True, null=True)
    status = models.CharField(max_length=32, default="created")  # created/running/done/failed
    error = models.TextField(blank=True, null=True)

    def __str__(self) -> str:
        return f"EvidenceExport #{self.id} case={self.case_id} {self.status}"


class SelectorHealthLog(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    recipe_id = models.CharField(max_length=128, db_index=True)
    selector_key = models.CharField(max_length=128, db_index=True)
    ok = models.BooleanField(default=True)
    error = models.CharField(max_length=512, blank=True, null=True)
    screenshot_path = models.CharField(max_length=512, blank=True, null=True)


class SystemConfig(models.Model):
    """Global config flags (degraded mode etc.)."""
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    key = models.CharField(max_length=128, unique=True)
    value = models.JSONField(default=dict)

    def __str__(self) -> str:
        return f"{self.key}"


class CaseRunLock(models.Model):
    """Case-level concurrency guard to prevent two write jobs running simultaneously."""
    created_at = models.DateTimeField(default=timezone.now)
    case = models.OneToOneField(Case, on_delete=models.CASCADE, related_name="run_lock")
    is_locked = models.BooleanField(default=False)
    locked_by_job_id = models.IntegerField(blank=True, null=True)
    lock_reason = models.CharField(max_length=256, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)


class RecipePause(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    recipe_id = models.CharField(max_length=128, unique=True)
    is_paused = models.BooleanField(default=False)
    reason = models.CharField(max_length=512, blank=True, null=True)

    def __str__(self) -> str:
        return f"{self.recipe_id} paused={self.is_paused}"


class UiMapRecording(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    label = models.CharField(max_length=128)  # logical key like BTN_SORGULA
    selector = models.CharField(max_length=512)  # suggested selector
    meta = models.JSONField(default=dict)  # role/text/attrs
    alternatives = models.JSONField(default=list)  # list of selector candidates
    stability_score = models.FloatField(default=0.0)
    selector_kind = models.CharField(max_length=32, default='unknown')  # button/field/table/action
    screenshot_path = models.CharField(max_length=512, blank=True, null=True)
    approved = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"{self.label} approved={self.approved}"
