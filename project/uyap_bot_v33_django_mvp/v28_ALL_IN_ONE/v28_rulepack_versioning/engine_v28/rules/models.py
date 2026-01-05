import uuid
from django.db import models

class RulePack(models.Model):
    """A named collection of rules (e.g., 'uyap_default')."""
    pack_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128, unique=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rule_packs"

    def __str__(self):
        return self.name

class Rule(models.Model):
    """Logical rule identity, can have multiple revisions."""
    rule_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pack = models.ForeignKey(RulePack, on_delete=models.CASCADE, related_name="rules")
    key = models.CharField(max_length=256)  # e.g., 'post_asset_discovery'
    is_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rules"
        unique_together = [("pack","key")]

    def __str__(self):
        return f"{self.pack.name}:{self.key}"

class RuleRevision(models.Model):
    """Immutable revision content."""
    rev_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule = models.ForeignKey(Rule, on_delete=models.CASCADE, related_name="revisions")
    version = models.IntegerField()  # monotonic per rule
    yaml_text = models.TextField()
    sha256 = models.CharField(max_length=80, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=128, null=True, blank=True)
    note = models.CharField(max_length=256, null=True, blank=True)

    class Meta:
        db_table = "rule_revisions"
        unique_together = [("rule","version")]
        indexes = [
            models.Index(fields=["rule","-version"], name="idx_rule_latest"),
        ]

    def __str__(self):
        return f"{self.rule} v{self.version}"
