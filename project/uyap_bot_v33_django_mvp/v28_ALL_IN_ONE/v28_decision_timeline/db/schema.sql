-- v28 Decision Timeline minimal schema (PostgreSQL flavored)
-- Adjust types/indexes to your stack conventions.

CREATE TABLE IF NOT EXISTS engine_runs (
  run_id UUID PRIMARY KEY,
  case_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  trigger_event_id TEXT,
  snapshot_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  compute_summary JSONB,
  error JSONB
);

CREATE INDEX IF NOT EXISTS idx_engine_runs_case_ts
  ON engine_runs (case_id, started_at DESC);

CREATE TABLE IF NOT EXISTS timeline_entries (
  entry_id UUID PRIMARY KEY,
  case_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL CHECK (type IN ('UYAP_EVENT','FACT_WRITE','COMPUTE','DECISION','ACTION','OUTCOME','NOTE')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  title TEXT NOT NULL,
  body JSONB,
  run_id UUID REFERENCES engine_runs(run_id),
  source TEXT NOT NULL CHECK (source IN ('uyap','engine','user','system'))
);

CREATE INDEX IF NOT EXISTS idx_timeline_case_ts
  ON timeline_entries (case_id, ts DESC);

CREATE TABLE IF NOT EXISTS outbox_actions (
  action_id UUID PRIMARY KEY,
  run_id UUID REFERENCES engine_runs(run_id),
  case_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','done','failed','dead')),
  attempt_count INT NOT NULL DEFAULT 0,
  last_error JSONB,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_actions (status, next_retry_at);
