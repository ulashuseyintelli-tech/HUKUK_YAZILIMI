# Optional: EngineRun model extension (recommended)

Current approach stores rule meta under compute_summary["_rule_meta"].
For stronger querying (filter by rule version), add DB columns:

- rule_pack      (CharField, max_length=128, null=True)
- rule_key       (CharField, max_length=256, null=True)
- rule_revision_id (UUIDField, null=True)
- rule_version   (IntegerField, null=True)
- rule_sha256    (CharField, max_length=80, null=True)

Then when creating EngineRun in EngineRunner, set these fields from rule["_meta"].

Why it matters:
- Audit queries: "show all runs produced by rule_key X v3"
- Safety: quick rollback by disabling a revision
