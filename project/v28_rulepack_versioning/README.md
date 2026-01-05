v28 RulePack + Versioning + Hot Reload (Django)
==============================================

What this adds
--------------
- Store rules in DB (with versioning + activation)
- Load rules for EngineRunner from DB with caching + hot reload
- Record rule version/hash on EngineRun and Timeline entries

Components
----------
- engine_v28/rules/models.py        RulePack, Rule, RuleRevision
- engine_v28/rules/loader.py        Cached loader (in-process) + manual invalidation
- engine_v28/rules/admin.py         Basic Django admin registration
- engine_v28/rules/api.py           Simple REST endpoints:
   - GET  /api/rules/active
   - POST /api/rules/reload   (invalidate cache)
- engine_v28/engine_runner/runner_patch.py
   Drop-in patch points for EngineRunner to:
     - accept a list of rule dicts already loaded
     - stamp rule_revision_id + rule_hash into EngineRun

Notes
-----
- For true multi-process hot reload, you should also implement cache invalidation via Redis pubsub or shared cache.
  This pack includes a manual reload endpoint and in-process cache.
- Rule content is stored as YAML text; parsed on load.

Install
-------
1) Copy `engine_v28/rules/` into your existing engine_v28 app.
2) Add urls include from engine_v28.rules.api (see urls_snippet.txt).
3) Run migrations:
   python manage.py makemigrations engine_v28
   python manage.py migrate
4) Optional: enable Django admin to manage rules.

