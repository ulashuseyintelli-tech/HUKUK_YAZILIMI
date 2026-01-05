v28 EngineRunner <-> DB RuleLoader Integration Patch
====================================================

Purpose
-------
Make EngineRunner run rules loaded from DB RuleLoader (RulePack/RuleRevision),
and stamp rule revision metadata into:
- EngineRun.compute_summary (or dedicated fields if you extend model)
- Timeline entries body
- OutboxAction payload meta (optional)

What you get
------------
- engine_v28/engine_runner/db_rule_runner.py
  A helper that:
   - loads active rules from engine_v28.rules.loader.LOADER
   - attaches meta (_meta) to rule dicts
   - executes EngineRunner for each rule
   - returns matched list with run_ids/actions and rule revision metadata

- engine_v28/patches/uyap_ingest_view_patch.py
  Drop-in patch for the UYAP ingestion demo view to use DB rules instead of file rules.

- engine_v28/patches/engine_run_model_extension.md
  Optional: how to add fields to EngineRun model:
    rule_pack, rule_key, rule_revision_id, rule_version, rule_sha256

Notes
-----
- This patch is conservative: it stores meta under compute_summary["_rule_meta"].
  If you want first-class DB columns, follow engine_run_model_extension.md.

