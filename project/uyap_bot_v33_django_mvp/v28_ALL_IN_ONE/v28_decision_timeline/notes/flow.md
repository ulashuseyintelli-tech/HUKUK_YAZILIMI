# End-to-end Flow (v28)

1) UYAP event arrives
   -> timeline_entries(type=UYAP_EVENT)

2) Normalizer maps event -> facts/flags
   -> FactStore write
   -> timeline_entries(type=FACT_WRITE)

3) Engine matches rules
   -> engine_runs(status=started)

4) Compute (risk/recovery)
   -> timeline_entries(type=COMPUTE, run_id)

5) Write compute outputs to FactStore
   -> timeline_entries(type=FACT_WRITE, run_id)

6) Evaluate decisions
   -> timeline_entries(type=DECISION, run_id)

7) Persist actions to outbox (transactional outbox)
   -> outbox_actions(status=pending, idempotency_key UNIQUE)
   -> timeline_entries(type=ACTION, run_id)

8) Dispatcher sends action
   -> timeline_entries(type=OUTCOME, run_id)
   -> outbox_actions(status=done/failed with retry)
