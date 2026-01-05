v28 Policy Gate + Action Feedback (combined)
===========================================

This pack adds TWO production-critical layers:

1) Policy Gate (pre-action)
---------------------------
Before an OutboxAction is created, PolicyGate evaluates whether the action is:
- ALLOW  : proceed
- DENY   : do not create action (record timeline + flag)
- MANUAL : convert into manual_review enqueue or open_lock etc. (configurable)

Policy sources (in priority order):
- DB PolicyRule table (recommended)
- Hardcoded fallback defaults

Policy can depend on:
- computed facts (engine.risk.score, engine.risk.band, engine.recovery.p50)
- flags (HIGH_RISK, KVKK_HOLD, CLIENT_NO_EMAIL)
- time windows (optional, simple)
- action_type (enqueue/open_lock/send_email/...)


2) Action Feedback (post-action)
--------------------------------
When dispatcher executes an action, it records the result and writes feedback facts:
- actions.<action_type>.last_status = done/failed/dead
- actions.<action_type>.last_action_id
- actions.<action_type>.last_result (optional JSON)
- actions.last.success_at / last.fail_at timestamps

Also includes a callback endpoint (optional):
- POST /api/actions/callback
  for external systems (payment gateway, email provider webhooks, etc.)
  to write "outcome facts" back into FactStore + timeline.

Install / Integrate
-------------------
A) Copy folders into your existing engine_v28 app:
- engine_v28/policy/
- engine_v28/actions_feedback/
- engine_v28/patches/

B) Migrate (PolicyRule model):
  python manage.py makemigrations engine_v28
  python manage.py migrate

C) Patch EngineRunner:
- Use PolicyGate before create_outbox_action (see patches/engine_runner_policy_patch.md)

D) Patch dispatcher:
- Replace management command with patches/dispatch_outbox_with_feedback.py
  (or merge changes: call dispatch(...) -> result -> write feedback facts + timeline)

E) Optional: add callback urls:
- include engine_v28.actions_feedback.urls under /api/

