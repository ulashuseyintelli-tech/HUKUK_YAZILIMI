import uuid
from django.db import models

class CaseFact(models.Model):
    """Current fact values per case and key."""
    case_id = models.CharField(max_length=128, db_index=True)
    key = models.CharField(max_length=256)  # e.g., "engine.risk.score"
    value = models.JSONField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "case_facts"
        unique_together = [("case_id", "key")]
        indexes = [models.Index(fields=["case_id", "key"], name="idx_case_fact_key")]

class CaseFlag(models.Model):
    """Current boolean-ish flags per case."""
    case_id = models.CharField(max_length=128, db_index=True)
    key = models.CharField(max_length=128)  # e.g., "HIGH_RISK"
    value = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "case_flags"
        unique_together = [("case_id", "key")]
        indexes = [models.Index(fields=["case_id", "key"], name="idx_case_flag_key")]

class FactAudit(models.Model):
    """Append-only audit log for writes."""
    audit_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_id = models.CharField(max_length=128, db_index=True)
    key = models.CharField(max_length=256)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    kind = models.CharField(max_length=16, choices=[("fact","fact"),("flag","flag")])
    meta = models.JSONField(null=True, blank=True)
    ts = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "fact_audit"
        indexes = [models.Index(fields=["case_id", "-ts"], name="idx_fact_audit_case_ts")]
