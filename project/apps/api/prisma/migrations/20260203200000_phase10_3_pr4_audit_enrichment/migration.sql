-- Phase 10.3 PR-4: Audit Enrichment for Idempotency
-- 
-- Adds actionId propagation and outcome tracking to audit log.
--
-- NEW COLUMNS:
-- - action_id: UUID reference to manifest_admin_actions (idempotency gate)
-- - outcome: SUCCESS | FAILED | TAKEOVER
-- - takeover_from: Previous actor ID for takeover events
-- - error_code: Error code for failed actions
-- - error_message: Error message (max 512 chars, sanitized)
--
-- AUDIT EMIT RULES:
-- - PROCEED + success → ADMIN_ACTION with outcome=SUCCESS
-- - PROCEED + fail → ADMIN_ACTION with outcome=FAILED
-- - PROCEED + takeover → ADMIN_ACTION with outcome=TAKEOVER
-- - CACHED → NO audit (determinism)
-- - IN_PROGRESS → NO audit (retry semantics)

-- ============================================================================
-- Step 1: Drop existing constraints that need modification
-- ============================================================================

ALTER TABLE manifest_admin_audit_log 
  DROP CONSTRAINT IF EXISTS chk_audit_event_type;

ALTER TABLE manifest_admin_audit_log 
  DROP CONSTRAINT IF EXISTS chk_audit_resource_type;

-- ============================================================================
-- Step 2: Alter columns to allow NULL (for backward compatibility)
-- ============================================================================

ALTER TABLE manifest_admin_audit_log 
  ALTER COLUMN ip_hash DROP NOT NULL;

ALTER TABLE manifest_admin_audit_log 
  ALTER COLUMN user_agent DROP NOT NULL;

ALTER TABLE manifest_admin_audit_log 
  ALTER COLUMN target_bundle_id DROP NOT NULL;

-- ============================================================================
-- Step 3: Add new columns for PR-4
-- ============================================================================

-- Idempotency gate action ID (links audit to idempotency action)
ALTER TABLE manifest_admin_audit_log 
  ADD COLUMN action_id UUID;

-- Outcome for ADMIN_ACTION events
ALTER TABLE manifest_admin_audit_log 
  ADD COLUMN outcome VARCHAR(20);

-- Previous actor ID for takeover events
ALTER TABLE manifest_admin_audit_log 
  ADD COLUMN takeover_from VARCHAR(255);

-- Error code for failed actions
ALTER TABLE manifest_admin_audit_log 
  ADD COLUMN error_code VARCHAR(100);

-- Error message for failed actions (max 512 chars, sanitized)
ALTER TABLE manifest_admin_audit_log 
  ADD COLUMN error_message VARCHAR(512);

-- ============================================================================
-- Step 4: Add updated constraints
-- ============================================================================

-- Event type constraint (add ADMIN_ACTION, WORKER_RESUME, WORKER_PAUSE, DLQ_BULK_REDRIVE, IDEMPOTENCY_TAKEOVER)
ALTER TABLE manifest_admin_audit_log 
  ADD CONSTRAINT chk_audit_event_type CHECK (
    event_type IN (
      'DLQ_RESOLVE', 
      'DLQ_REDRIVE', 
      'DLQ_BULK_REDRIVE',
      'WORKER_RESUME',
      'WORKER_PAUSE',
      'CB_OVERRIDE',
      'ADMIN_ACTION',
      'IDEMPOTENCY_TAKEOVER'
    )
  );

-- Resource type constraint (add BUNDLE, WORKER)
ALTER TABLE manifest_admin_audit_log 
  ADD CONSTRAINT chk_audit_resource_type CHECK (
    resource_type IN ('dlq_entry', 'retry_job', 'circuit_breaker', 'DLQ_ENTRY', 'RETRY_JOB', 'WORKER', 'BUNDLE')
  );

-- Outcome constraint
ALTER TABLE manifest_admin_audit_log 
  ADD CONSTRAINT chk_audit_outcome CHECK (
    outcome IS NULL OR outcome IN ('SUCCESS', 'FAILED', 'TAKEOVER')
  );

-- ============================================================================
-- Step 5: Add index for action_id lookups
-- ============================================================================

-- Index for querying by action_id - "what audit events for this idempotency action?"
CREATE INDEX idx_audit_log_action_id ON manifest_admin_audit_log (action_id) 
  WHERE action_id IS NOT NULL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN manifest_admin_audit_log.action_id IS 'PR-4: UUID reference to manifest_admin_actions (idempotency gate)';
COMMENT ON COLUMN manifest_admin_audit_log.outcome IS 'PR-4: SUCCESS|FAILED|TAKEOVER for ADMIN_ACTION events';
COMMENT ON COLUMN manifest_admin_audit_log.takeover_from IS 'PR-4: Previous actor ID for takeover events';
COMMENT ON COLUMN manifest_admin_audit_log.error_code IS 'PR-4: Error code for failed actions';
COMMENT ON COLUMN manifest_admin_audit_log.error_message IS 'PR-4: Error message (max 512 chars, sanitized, no stack traces)';
