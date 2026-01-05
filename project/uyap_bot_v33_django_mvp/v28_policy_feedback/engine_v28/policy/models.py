import uuid
from django.db import models

class PolicyRule(models.Model):
    """Policy rules for action gating (higher priority wins).

    expr: a boolean expression evaluated against context:
      - get('fact.engine.risk.score') >= 80
      - flags.get('CLIENT_NO_EMAIL') == True
      - action_type == 'send_email'

    decision: ALLOW | DENY | MANUAL
    manual_action_type: optional fallback action type (e.g., 'enqueue')
    manual_payload: JSON payload template (optional)
    """
    DEC_ALLOW = "ALLOW"
    DEC_DENY = "DENY"
    DEC_MANUAL = "MANUAL"
    DEC_CHOICES = [(DEC_ALLOW, "ALLOW"), (DEC_DENY, "DENY"), (DEC_MANUAL, "MANUAL")]

    policy_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    priority = models.IntegerField(default=100, db_index=True)
    is_enabled = models.BooleanField(default=True, db_index=True)

    action_type = models.CharField(max_length=64, null=True, blank=True)  # null => any action
    expr = models.TextField(null=True, blank=True)  # null/blank => always match
    decision = models.CharField(max_length=16, choices=DEC_CHOICES, default=DEC_ALLOW)

    manual_action_type = models.CharField(max_length=64, null=True, blank=True)
    manual_payload = models.JSONField(null=True, blank=True)

    note = models.CharField(max_length=256, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "policy_rules"
        indexes = [
            models.Index(fields=["-priority", "is_enabled"], name="idx_policy_priority"),
            models.Index(fields=["action_type", "is_enabled"], name="idx_policy_action"),
        ]

    def __str__(self):
        return f"{self.priority} {self.name} ({self.decision})"
