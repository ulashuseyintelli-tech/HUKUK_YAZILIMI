-- Phase 10.3 - Idempotency Hardening
-- Creates manifest_admin_actions table (idempotency gate) with lease + ownership token.
-- Does NOT touch manifest_retry_queue (idx_retry_queue_bundle_active already exists).
-- Does NOT touch manifest_dead_letter_queue.

-- 1) Extensions (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Enum type (idempotency status)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'manifest_admin_action_status') THEN
    CREATE TYPE manifest_admin_action_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
  END IF;
END $$;

-- 3) Table: manifest_admin_actions
CREATE TABLE IF NOT EXISTS manifest_admin_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency key (canonical: Idempotency-Key header)
  request_id       text NOT NULL,

  -- Gate status
  status           manifest_admin_action_status NOT NULL DEFAULT 'IN_PROGRESS',

  -- Cached response (success OR error)
  http_status      integer,
  result_code      text,
  result_json      jsonb,

  -- Classification / audit linkage
  action_type      text NOT NULL,      -- e.g. DLQ_RESOLVE, DLQ_REDRIVE, DLQ_BULK_REDRIVE
  endpoint         text NOT NULL,      -- e.g. "POST /admin/manifest-retry/dlq/:id/redrive"
  resource_type    text NOT NULL,      -- e.g. DLQ_ENTRY
  resource_id      uuid,               -- dlq id, bundle id, etc (nullable)

  -- Actor fields
  actor_id         uuid NOT NULL,
  actor_email      text,
  ip_hash          text,

  -- Ownership + lease (Guardrail B)
  owner_token      uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds'),

  -- Timestamps
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,

  -- Retention TTL (Guardrail A: cleanup will delete only COMPLETED/FAILED with 1h buffer)
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  -- Basic sanity checks
  CONSTRAINT ck_manifest_admin_actions_http_status
    CHECK (http_status IS NULL OR (http_status >= 100 AND http_status <= 599)),

  CONSTRAINT ck_manifest_admin_actions_result_json_on_terminal
    CHECK (
      status = 'IN_PROGRESS'
      OR (status IN ('COMPLETED','FAILED') AND http_status IS NOT NULL AND result_json IS NOT NULL)
    )
);

-- 4) Always-on uniqueness (TTL is cleanup only)
CREATE UNIQUE INDEX IF NOT EXISTS ux_manifest_admin_actions_request_id
  ON manifest_admin_actions (request_id);

-- 5) Supporting indexes
-- Fast lease lookups / monitoring
CREATE INDEX IF NOT EXISTS ix_manifest_admin_actions_status_lease
  ON manifest_admin_actions (status, lease_expires_at);

-- Cleanup scan
CREATE INDEX IF NOT EXISTS ix_manifest_admin_actions_expires
  ON manifest_admin_actions (expires_at);

-- Resource drill-down
CREATE INDEX IF NOT EXISTS ix_manifest_admin_actions_resource
  ON manifest_admin_actions (resource_type, resource_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE manifest_admin_actions IS 'Phase 10.3: Idempotency gate for admin mutations (resolve/redrive/bulk)';

COMMENT ON COLUMN manifest_admin_actions.request_id IS 'Idempotency-Key header value (canonical)';
COMMENT ON COLUMN manifest_admin_actions.status IS 'IN_PROGRESS=executing, COMPLETED=success cached, FAILED=error cached';
COMMENT ON COLUMN manifest_admin_actions.http_status IS 'Cached HTTP status code (populated on COMPLETED/FAILED)';
COMMENT ON COLUMN manifest_admin_actions.result_json IS 'Cached response body (success or error payload)';
COMMENT ON COLUMN manifest_admin_actions.owner_token IS 'Lease ownership token for takeover CAS';
COMMENT ON COLUMN manifest_admin_actions.lease_expires_at IS 'Lease expiry - enables takeover after timeout';
COMMENT ON COLUMN manifest_admin_actions.expires_at IS 'Retention TTL - cleanup job deletes after this + 1h buffer';
