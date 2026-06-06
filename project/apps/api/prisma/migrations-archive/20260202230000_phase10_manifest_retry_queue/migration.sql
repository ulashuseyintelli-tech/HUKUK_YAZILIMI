-- Phase 10: Manifest Retry Queue + Dead Letter Queue
-- Task 10.1.2 + 10.1.3
-- 
-- This migration creates the retry pipeline infrastructure for manifest writes.
-- 
-- LOCKED INVARIANTS:
-- 1. Per-bundle de-dup: Only ONE active job per bundle_id
-- 2. SKIP LOCKED claim: Concurrent-safe worker polling
-- 3. Lease-based processing: Prevents stuck jobs
-- 4. DLQ is separate table: Single source of truth for failures

-- ============================================================================
-- Retry Queue Status Enum
-- ============================================================================

-- Status values:
-- PENDING: New job, waiting for first attempt
-- IN_PROGRESS: Claimed by worker, lease active
-- RETRY_SCHEDULED: Failed with transient error, waiting for next attempt
-- DONE: Successfully completed (manifest written or DONE_NOOP)

-- ============================================================================
-- Table: manifest_retry_queue
-- ============================================================================

CREATE TABLE manifest_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Bundle reference
  bundle_id UUID NOT NULL,
  
  -- Status (PENDING, IN_PROGRESS, RETRY_SCHEDULED, DONE)
  status TEXT NOT NULL DEFAULT 'PENDING',
  
  -- Retry tracking
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 7,
  next_attempt_at TIMESTAMPTZ,
  
  -- Lease management (for worker claim)
  leased_until TIMESTAMPTZ,
  leased_by TEXT,
  
  -- Error tracking
  last_error_code TEXT,
  last_error_message TEXT,
  
  -- Completion tracking
  done_reason TEXT,  -- 'OK' | 'DONE_NOOP' | 'DLQ'
  
  -- Source tracking
  source TEXT NOT NULL DEFAULT 'post_seal_hook',  -- 'post_seal_hook' | 'admin_retry'
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_retry_queue_status CHECK (
    status IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED', 'DONE')
  ),
  CONSTRAINT chk_retry_queue_source CHECK (
    source IN ('post_seal_hook', 'admin_retry')
  ),
  CONSTRAINT chk_retry_queue_done_reason CHECK (
    done_reason IS NULL OR done_reason IN ('OK', 'DONE_NOOP', 'DLQ')
  )
);

-- Per-bundle de-dup: Only ONE active job per bundle_id
-- This is the CRITICAL constraint that prevents queue bloat
CREATE UNIQUE INDEX idx_retry_queue_bundle_active 
ON manifest_retry_queue (bundle_id) 
WHERE status IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED');

-- Worker polling index: Find next job to process
CREATE INDEX idx_retry_queue_next_attempt 
ON manifest_retry_queue (next_attempt_at NULLS FIRST, created_at)
WHERE status IN ('PENDING', 'RETRY_SCHEDULED');

-- Bundle lookup
CREATE INDEX idx_retry_queue_bundle_id ON manifest_retry_queue (bundle_id);

-- Status monitoring
CREATE INDEX idx_retry_queue_status ON manifest_retry_queue (status, created_at);

-- ============================================================================
-- Table: manifest_dead_letter_queue
-- ============================================================================

-- DLQ Status values:
-- DLQ_OPEN: Unresolved failure, needs investigation
-- DLQ_RESOLVED: Manually resolved by admin
-- DLQ_REDROVE: Re-driven back to retry queue

CREATE TABLE manifest_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Bundle reference
  bundle_id UUID NOT NULL,
  
  -- Failure details
  attempt INTEGER NOT NULL,
  final_error_code TEXT NOT NULL,
  final_error_message TEXT,
  
  -- Timestamps
  first_failed_at TIMESTAMPTZ NOT NULL,
  last_failed_at TIMESTAMPTZ NOT NULL,
  
  -- Status (DLQ_OPEN, DLQ_RESOLVED, DLQ_REDROVE)
  status TEXT NOT NULL DEFAULT 'DLQ_OPEN',
  
  -- Resolution tracking
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_dlq_status CHECK (
    status IN ('DLQ_OPEN', 'DLQ_RESOLVED', 'DLQ_REDROVE')
  )
);

-- One DLQ entry per bundle (latest failure)
CREATE UNIQUE INDEX idx_dlq_bundle_id ON manifest_dead_letter_queue (bundle_id);

-- Open DLQ entries for monitoring
CREATE INDEX idx_dlq_open ON manifest_dead_letter_queue (last_failed_at DESC)
WHERE status = 'DLQ_OPEN';

-- Status monitoring
CREATE INDEX idx_dlq_status ON manifest_dead_letter_queue (status, created_at);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE manifest_retry_queue IS 'Phase 10: Retry queue for manifest write failures';
COMMENT ON TABLE manifest_dead_letter_queue IS 'Phase 10: Dead letter queue for permanent manifest failures';

COMMENT ON COLUMN manifest_retry_queue.status IS 'PENDING|IN_PROGRESS|RETRY_SCHEDULED|DONE';
COMMENT ON COLUMN manifest_retry_queue.leased_until IS 'Worker lease expiry - prevents stuck jobs';
COMMENT ON COLUMN manifest_retry_queue.leased_by IS 'Worker instance ID holding the lease';
COMMENT ON COLUMN manifest_retry_queue.done_reason IS 'OK=success, DONE_NOOP=already exists, DLQ=moved to DLQ';

COMMENT ON COLUMN manifest_dead_letter_queue.status IS 'DLQ_OPEN|DLQ_RESOLVED|DLQ_REDROVE';
COMMENT ON COLUMN manifest_dead_letter_queue.resolved_by IS 'Admin user ID who resolved the entry';
