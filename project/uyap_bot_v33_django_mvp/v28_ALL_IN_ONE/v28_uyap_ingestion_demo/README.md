v28 UYAP Event Ingestion Demo (Django)
=====================================

Goal
----
Provide an end-to-end demo path:
UYAP Event -> Normalizer -> FactStore -> EngineRunner -> Timeline + Outbox

What you get
------------
- Django app `uyap_ingest_v28`:
  - POST /api/uyap/events  (accepts an event JSON)
  - writes a UYAP_EVENT timeline entry
  - normalizes event -> facts/flags and writes to FactStore (adapter)
  - triggers EngineRunner for configured rules
  - returns run summary (matched rules, run_ids, actions_created)

Assumptions
-----------
- You already integrated `engine_v28` app (timeline/outbox models + services) from previous zip.
- You already added `engine_v28/engine_runner` (EngineRunner) from previous zip.
- This demo includes an InMemoryFactStore adapter for simplicity.
  Replace with your real FactStore backend.

Install
-------
1) Copy `uyap_ingest_v28/` into project.
2) Add to INSTALLED_APPS: 'uyap_ingest_v28'
3) Include urls: path('api/', include('uyap_ingest_v28.urls'))
4) Ensure pyyaml installed (rules loading) and engine_v28 present.

Test
----
curl -X POST http://localhost:8000/api/uyap/events \
  -H "Content-Type: application/json" \
  -d @uyap_ingest_v28/examples/event_vehicle_found.json

Then check:
- timeline entries for the case_id
- outbox actions created
