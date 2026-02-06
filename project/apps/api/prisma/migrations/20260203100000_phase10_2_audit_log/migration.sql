-- Phase 10.2: Manifest Admin Audit Log
-- Task 1.1: Create database migration for manifest_admin_audit_log table
--
-- This migration creates the audit trail infrastructure for admin operations.
--
-- RETENTION POLICY:
-- - Hot storage: 90 days in PostgreSQL (ops/troubleshooting)
-- - Cold storage: Archive to S3 after 90 days (compliance)
-- - Cleanup: Automated via pg_cron or application-level scheduled job
--
-- PII PROTECTION:
-- - IP addresses are hashed (SHA-256) for KVKK compliance
-- - ip_hash column stores the hash, NOT the raw IP

-- ============================================================================
-- Table: manifest_admin_audit_log
-- ============================================================================

CREATE TABLE manifest_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event identification
  event_type TEXT NOT NULL,  -- DLQ_RESOLVE, DLQ_REDRIVE, DLQ_REDRIVE_BULK, JOB_FORCE_RETRY, CB_OVERRIDE
  
  -- Actor information
  actor TEXT NOT NULL,  -- User ID from JWT
  request_id TEXT NOT NULL,  -- Idempotency key (unique per request)
  ip_hash TEXT NOT NULL,  -- SHA-256 hash of IP address (PII protection)
  user_agent TEXT NOT NULL,
  
  -- Resource information
  resource_type TEXT NOT NULL,  -- dlq_entry, retry_job, circuit_breaker
  resource_id TEXT NOT NULL,  -- ID of the affected resource
  target_bundle_id TEXT NOT NULL,  -- Bundle ID for correlation
  
  -- State tracking
  before_state JSONB,  -- State before the operation
  after_state JSONB,  -- State after the operation
  
  -- Reason/notes
  reason TEXT,  -- User-provided reason for the action
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_audit_event_type CHECK (
    event_type IN ('DLQ_RESOLVE', 'DLQ_REDRIVE', 'DLQ_REDRIVE_BULK', 'JOB_FORCE_RETRY', 'CB_OVERRIDE')
  ),
  CONSTRAINT chk_audit_resource_type CHECK (
    resource_type IN ('dlq_entry', 'retry_job', 'circuit_breaker')
  )
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Primary query index (time-based) - for recent audit trail queries
CREATE INDEX idx_audit_log_created_at ON manifest_admin_audit_log (created_at DESC);

-- Index for querying by actor - "what did user X do?"
CREATE INDEX idx_audit_log_actor ON manifest_admin_audit_log (actor, created_at DESC);

-- Index for querying by bundle - "what happened to bundle Y?"
CREATE INDEX idx_audit_log_bundle ON manifest_admin_audit_log (target_bundle_id, created_at DESC);

-- Index for querying by event type - "show all DLQ_RESOLVE events"
CREATE INDEX idx_audit_log_event_type ON manifest_admin_audit_log (event_type, created_at DESC);

-- Index for querying by resource - "what happened to DLQ entry Z?"
CREATE INDEX idx_audit_log_resource ON manifest_admin_audit_log (resource_type, resource_id);

-- Idempotency enforcement - ensures each request is recorded only once
CREATE UNIQUE INDEX idx_audit_log_request_id ON manifest_admin_audit_log (request_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE manifest_admin_audit_log IS 'Phase 10.2: Audit trail for manifest retry admin operations. Retention: 90 days hot, then S3 archive.';

COMMENT ON COLUMN manifest_admin_audit_log.event_type IS 'DLQ_RESOLVE|DLQ_REDRIVE|DLQ_REDRIVE_BULK|JOB_FORCE_RETRY|CB_OVERRIDE';
COMMENT ON COLUMN manifest_admin_audit_log.actor IS 'User ID from JWT claims';
COMMENT ON COLUMN manifest_admin_audit_log.request_id IS 'Unique request ID for idempotency';
COMMENT ON COLUMN manifest_admin_audit_log.ip_hash IS 'SHA-256 hash of client IP (PII/KVKK compliance)';
COMMENT ON COLUMN manifest_admin_audit_log.resource_type IS 'dlq_entry|retry_job|circuit_breaker';
COMMENT ON COLUMN manifest_admin_audit_log.before_state IS 'JSON snapshot of resource state before operation';
COMMENT ON COLUMN manifest_admin_audit_log.after_state IS 'JSON snapshot of resource state after operation';
COMMENT ON COLUMN manifest_admin_audit_log.reason IS 'User-provided reason for the admin action';
