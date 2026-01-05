v28 EngineRunner Pack (v27 compute+decisions -> timeline+outbox)
==============================================================

What this gives you
-------------------
- A minimal EngineRunner that:
  1) loads YAML rules
  2) evaluates `when`
  3) runs `then.compute` via a compute registry
  4) writes compute outputs as facts/flags via a FactStore adapter
  5) records timeline entries (COMPUTE, DECISION, ACTION, OUTCOME)
  6) creates outbox actions with idempotency keys

This is a skeleton to wire your existing v27 compute page into v28 timeline/outbox.

Important
---------
- Expression evaluation uses Python `eval` with a restricted environment (still not a perfect sandbox).
  Replace with a stricter evaluator later.
- FactStore is an interface; an in-memory adapter is included for local tests.

How to use (Django)
-------------------
1) Copy `engine_v28/engine_runner/` into your project (alongside the `engine_v28` app from previous zip).
2) Ensure `pyyaml` is installed (for YAML rule loading).
3) Provide a FactStore adapter that reads/writes your real facts/flags storage.
4) Hook EngineRunner.run_for_event(case_id, event) from your UYAP event pipeline.

Files
-----
- engine_v28/engine_runner/runner.py
- engine_v28/engine_runner/factstore.py
- engine_v28/engine_runner/compute_registry.py
- engine_v28/engine_runner/templating.py
- engine_v28/engine_runner/expressions.py
- rules/example_v27_rule.yaml
