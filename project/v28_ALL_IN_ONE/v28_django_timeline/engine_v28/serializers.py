from rest_framework import serializers
from .models import EngineRun, TimelineEntry, OutboxAction

class TimelineEntrySerializer(serializers.ModelSerializer):
    run_id = serializers.UUIDField(source="run.run_id", required=False, allow_null=True)

    class Meta:
        model = TimelineEntry
        fields = ["entry_id","case_id","ts","type","severity","title","body","run_id","source"]


class EngineRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = EngineRun
        fields = ["run_id","case_id","rule_id","trigger_event_id","snapshot_hash","status","started_at","finished_at","compute_summary","error"]


class OutboxActionSerializer(serializers.ModelSerializer):
    run_id = serializers.UUIDField(source="run.run_id", required=False, allow_null=True)

    class Meta:
        model = OutboxAction
        fields = ["action_id","run_id","case_id","action_type","idempotency_key","payload","status","attempt_count","last_error","next_retry_at","created_at","updated_at"]
