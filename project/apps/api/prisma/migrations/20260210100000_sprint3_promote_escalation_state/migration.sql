-- Sprint 3: Promote Request + Escalation State tables
--
-- Two new tables for Sprint 3 deploy-ready:
--   1. promote_request: Idempotency store for promote pipeline
--      UNIQUE (incident_id, run_id) — DB-level race condition prevention
--   2. escalation_state: DB-backed escalation hysteresis state machine
--      incident_id PK + version column for optimistic CAS
--
-- Online-safe: CREATE TYPE + CREATE TABLE — no lock on existing tables.
-- Rollback: DROP TABLE promote_request; DROP TABLE escalation_state;
--           DROP TYPE "PromoteRequestStatus"; DROP TYPE "EscalationLevelEnum";

-- ============================================================================
-- 0. Enum types (Prisma Client requires PostgreSQL enum types)
-- ============================================================================

CREATE TYPE "PromoteRequestStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');
CREATE TYPE "EscalationLevelEnum" AS ENUM ('NONE', 'L1', 'L2', 'L3');

-- ============================================================================
-- 1. promote_request
-- ============================================================================

CREATE TABLE promote_request (
  id            TEXT                    NOT NULL DEFAULT gen_random_uuid()::text,
  incident_id   TEXT                    NOT NULL,
  run_id        TEXT                    NOT NULL,
  request_id    TEXT                    NOT NULL,
  status        "PromoteRequestStatus"  NOT NULL DEFAULT 'IN_PROGRESS',
  result_ref    TEXT                    NULL,
  created_at    TIMESTAMPTZ(6)          NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ(6)          NOT NULL DEFAULT now(),

  CONSTRAINT promote_request_pkey PRIMARY KEY (id)
);

-- Idempotency: (incident_id, run_id) unique — DB-level race prevention
CREATE UNIQUE INDEX promote_request_incident_run_unique
  ON promote_request (incident_id, run_id);

-- Retention/cleanup index
CREATE INDEX promote_request_created_at_idx
  ON promote_request (created_at);

COMMENT ON TABLE promote_request IS
  'Sprint 3: Promote pipeline idempotency store. UNIQUE(incident_id, run_id) prevents duplicate Phase 7 requests.';
COMMENT ON COLUMN promote_request.status IS
  'IN_PROGRESS = claimed, SUCCEEDED = Phase 7 accepted, FAILED = Phase 7 rejected';

-- ============================================================================
-- 2. escalation_state
-- ============================================================================

CREATE TABLE escalation_state (
  incident_id              TEXT                  NOT NULL,
  current_level            "EscalationLevelEnum" NOT NULL DEFAULT 'NONE',
  last_transition_at       TIMESTAMPTZ(6)        NOT NULL DEFAULT now(),
  hold_down_until          TIMESTAMPTZ(6)        NULL,
  stable_window_counter    INTEGER               NOT NULL DEFAULT 0,
  stable_window_started_at TIMESTAMPTZ(6)        NULL,
  version                  INTEGER               NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ(6)        NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ(6)        NOT NULL DEFAULT now(),

  CONSTRAINT escalation_state_pkey PRIMARY KEY (incident_id)
);

COMMENT ON TABLE escalation_state IS
  'Sprint 3: DB-backed escalation hysteresis state machine. CAS via version column (UPDATE WHERE version = $1).';
COMMENT ON COLUMN escalation_state.version IS
  'Optimistic concurrency version. CAS: UPDATE ... SET version = version + 1 WHERE version = $current';

-- ============================================================================
-- Rollback
-- ============================================================================
-- DROP TABLE IF EXISTS promote_request;
-- DROP TABLE IF EXISTS escalation_state;
-- DROP TYPE IF EXISTS "PromoteRequestStatus";
-- DROP TYPE IF EXISTS "EscalationLevelEnum";
