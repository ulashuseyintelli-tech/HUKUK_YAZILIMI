import uuid
from django.db import models

class EngineRun(models.Model):
    STATUS_STARTED = "started"
    STATUS_SUCCEEDED = "succeeded"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_STARTED, "started"),
        (STATUS_SUCCEEDED, "succeeded"),
        (STATUS_FAILED, "failed"),
    ]

    run_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_id = models.CharField(max_length=128, db_index=True)
    rule_id = models.CharField(max_length=256)
    trigger_event_id = models.CharField(max_length=256, null=True, blank=True)
    snapshot_hash = models.CharField(max_length=128)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_STARTED)

    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    compute_summary = models.JSONField(null=True, blank=True)
    error = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "engine_runs"
        indexes = [
            models.Index(fields=["case_id", "-started_at"], name="idx_engine_runs_case_ts"),
        ]

    def __str__(self) -> str:
        return f"{self.case_id} {self.rule_id} {self.status} ({self.run_id})"


class TimelineEntry(models.Model):
    TYPE_UYAP_EVENT = "UYAP_EVENT"
    TYPE_FACT_WRITE = "FACT_WRITE"
    TYPE_COMPUTE = "COMPUTE"
    TYPE_DECISION = "DECISION"
    TYPE_ACTION = "ACTION"
    TYPE_OUTCOME = "OUTCOME"
    TYPE_NOTE = "NOTE"
    TYPE_CHOICES = [
        (TYPE_UYAP_EVENT, "UYAP_EVENT"),
        (TYPE_FACT_WRITE, "FACT_WRITE"),
        (TYPE_COMPUTE, "COMPUTE"),
        (TYPE_DECISION, "DECISION"),
        (TYPE_ACTION, "ACTION"),
        (TYPE_OUTCOME, "OUTCOME"),
        (TYPE_NOTE, "NOTE"),
    ]

    SEV_INFO = "info"
    SEV_WARN = "warn"
    SEV_CRITICAL = "critical"
    SEV_CHOICES = [
        (SEV_INFO, "info"),
        (SEV_WARN, "warn"),
        (SEV_CRITICAL, "critical"),
    ]

    SRC_UYAP = "uyap"
    SRC_ENGINE = "engine"
    SRC_USER = "user"
    SRC_SYSTEM = "system"
    SRC_CHOICES = [
        (SRC_UYAP, "uyap"),
        (SRC_ENGINE, "engine"),
        (SRC_USER, "user"),
        (SRC_SYSTEM, "system"),
    ]

    entry_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_id = models.CharField(max_length=128, db_index=True)
    ts = models.DateTimeField(auto_now_add=True, db_index=True)
    type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    severity = models.CharField(max_length=16, choices=SEV_CHOICES, default=SEV_INFO)
    title = models.CharField(max_length=256)
    body = models.JSONField(null=True, blank=True)

    run = models.ForeignKey(EngineRun, null=True, blank=True, on_delete=models.SET_NULL, related_name="timeline_entries")
    source = models.CharField(max_length=16, choices=SRC_CHOICES)

    class Meta:
        db_table = "timeline_entries"
        indexes = [
            models.Index(fields=["case_id", "-ts"], name="idx_timeline_case_ts"),
        ]

    def __str__(self) -> str:
        return f"{self.case_id} {self.type} {self.title}"


class OutboxAction(models.Model):
    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_DEAD = "dead"
    STATUS_CHOICES = [
        (STATUS_PENDING, "pending"),
        (STATUS_SENT, "sent"),
        (STATUS_DONE, "done"),
        (STATUS_FAILED, "failed"),
        (STATUS_DEAD, "dead"),
    ]

    action_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(EngineRun, null=True, blank=True, on_delete=models.SET_NULL, related_name="actions")
    case_id = models.CharField(max_length=128, db_index=True)
    action_type = models.CharField(max_length=64)
    idempotency_key = models.CharField(max_length=256, unique=True)
    payload = models.JSONField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)

    attempt_count = models.IntegerField(default=0)
    last_error = models.JSONField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "outbox_actions"
        indexes = [
            models.Index(fields=["status", "next_retry_at"], name="idx_outbox_pending"),
        ]

    def __str__(self) -> str:
        return f"{self.case_id} {self.action_type} {self.status} ({self.action_id})"
