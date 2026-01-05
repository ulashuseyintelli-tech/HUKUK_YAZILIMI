v28 Explainability ("because") + Rule Rollback API
==================================================

This pack adds:
1) Explainability builder:
   - Parses decision `if` expressions into human-readable "because" atoms
   - Supports common patterns used in your DSL: comparisons, AND/OR, get('path')
   - Produces a stable list you can store in TimelineEntry.body["because"]

2) Rule rollback controls:
   - Disable a specific RuleRevision (soft rollback by pinning active version)
   - Or disable a Rule entirely in a pack
   - Simple API endpoints to:
       POST /api/rules/disable_revision  {"revision_id": "..."}
       POST /api/rules/disable_rule      {"pack":"uyap_default","rule_key":"post_asset_discovery"}
       POST /api/rules/pin_version       {"pack":"uyap_default","rule_key":"post_asset_discovery","version": 3}

Notes
-----
- Pinning is implemented by creating a 'pinned_version' field on Rule model (optional migration included).
- If you don't want schema changes, you can do rollback by disabling latest revision and re-enabling previous.

Install
-------
1) Copy files into `engine_v28/` (merge into existing app).
2) Run migrations if you use pinning:
   python manage.py makemigrations engine_v28
   python manage.py migrate
3) Update EngineRunner to call `because_from_expr(cond, ctx)` when a decision matches.

