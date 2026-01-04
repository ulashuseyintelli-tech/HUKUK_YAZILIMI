from rest_framework import serializers
from .models import Case, Debtor, JobRun, JobStep, Snapshot, Fact

class DebtorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Debtor
        fields = ["id", "name", "identity_no", "behavior_score", "behavior_class"]

class CaseSerializer(serializers.ModelSerializer):
    debtors = DebtorSerializer(many=True, read_only=True)

    class Meta:
        model = Case
        fields = ["id", "uyap_dosya_no", "icra_type", "stage", "creditor_name", "claim_amount", "finalization_candidate_date", "debtors", "created_at", "updated_at"]

class JobStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobStep
        fields = ["id", "step_no", "action_type", "uyap_nav_path", "status", "proof_ref", "created_at"]

class JobRunSerializer(serializers.ModelSerializer):
    steps = JobStepSerializer(many=True, read_only=True)

    class Meta:
        model = JobRun
        fields = ["id", "case_id", "debtor_id", "recipe_id", "recipe_version", "status", "risk_level", "started_at", "finished_at", "attempt", "max_attempts", "lock_blocked_by", "last_error_code", "last_error_message", "steps"]

class SnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Snapshot
        fields = ["id", "source", "uyap_nav_path", "snapshot_hash", "payload", "screenshot_path", "created_at"]

class FactSerializer(serializers.ModelSerializer):
    snapshot = SnapshotSerializer(read_only=True)

    class Meta:
        model = Fact
        fields = ["id", "fact_type", "key", "value", "snapshot", "created_at"]
