# EngineRunner Policy Gate Patch (exact snippet)

Goal: before creating an outbox action, evaluate PolicyGate.

In your EngineRunner.decisions loop, before create_outbox_action(...):

    from engine_v28.policy.gate import PolicyGate
    from engine_v28.services import add_timeline

    gate = PolicyGate()
    pd = gate.evaluate(action_type=action_type, ctx=ctx)

    if pd.decision == "DENY":
        add_timeline(case_id, "ACTION", f"Policy denied: {action_type}", severity="warn",
                     body={"action_type": action_type, "policy": pd.__dict__}, run=run, source="system")
        continue

    if pd.decision == "MANUAL":
        add_timeline(case_id, "ACTION", f"Policy manual: {action_type}", severity="warn",
                     body={"action_type": action_type, "policy": pd.__dict__}, run=run, source="system")
        # Option A: convert into manual action (if configured)
        if pd.manual_action_type:
            action_type = pd.manual_action_type
            payload = pd.manual_payload or payload
        else:
            # Option B: just enqueue manual_review
            action_type = "enqueue"
            payload = {"queue": "manual_review", "case_id": case_id, "reason": pd.reason or "policy manual"}

Then proceed with create_outbox_action(...) as usual.

Tip:
- Start with a single DB policy rule: deny send_email when flags.CLIENT_NO_EMAIL == true
- Then add: MANUAL when compute.risk.score >= 80 (force manual review)
