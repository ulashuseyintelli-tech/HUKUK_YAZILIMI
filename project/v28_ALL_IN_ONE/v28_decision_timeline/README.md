v28 Decision Timeline Pack (skeleton)
====================================

What’s inside
-------------
- db/schema.sql: Minimal SQL schema for engine_runs, timeline_entries, outbox_actions
- api/openapi.yaml: Minimal OpenAPI skeleton for timeline + run + action endpoints
- examples/: Example timeline JSON entries (compute + decision)
- ui/wireframe.md: UI wireframe notes (Timeline panel + drawers)
- notes/flow.md: End-to-end flow (event -> normalize -> compute -> decision -> outbox -> outcome)

Notes
-----
This is a framework/skeleton. You will plug it into your actual backend (Django/Node/etc.).
