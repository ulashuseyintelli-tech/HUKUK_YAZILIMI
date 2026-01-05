# Wiring DBFactStore

## Replace InMemoryFactStore
In your ingestion code (uyap_ingest_v28), replace:

  from .factstore_adapter import FACTSTORE

with:

  from engine_v28.factstore_db.adapter import DBFactStore
  FACTSTORE = DBFactStore()

and remove the global singleton in factstore_adapter.

## Migrations
These models live under engine_v28.factstore_db.models.
If engine_v28 is your app, Django will pick them up for migrations.

## Notes
- Facts are stored as (case_id, key) JSON values.
- Flags are stored as (case_id, key) boolean values.
- FactAudit records every change with meta (run_id, rule_id, event_id, etc.)
