-- Phase 9B.5 Task 3: Snapshot Idempotency Index
-- 
-- This migration adds a unique index for content-based idempotency.
-- The index uses COALESCE to handle NULL runId values correctly.
--
-- IMPORTANT: PostgreSQL treats NULL != NULL, so without COALESCE,
-- two rows with (tenant1, incident1, NULL, hash1) would both be allowed.
-- The sentinel value '__NO_RUN__' is used to represent NULL runId.
--
-- For PRODUCTION deployments with large tables:
-- Run this command MANUALLY before deploying (no table lock):
--   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_sim_snap_idempotency 
--   ON simulation_snapshots (tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash);
--
-- This migration uses non-CONCURRENTLY version which may briefly lock the table.
-- Acceptable for dev/test environments.

-- Pre-check: Verify no duplicates exist (migration will fail if duplicates found)
-- Run this query manually before migration if concerned:
-- SELECT tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__') as run_key, calc_hash, COUNT(*)
-- FROM simulation_snapshots
-- GROUP BY tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash
-- HAVING COUNT(*) > 1;

-- Create unique index for content-based idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_snap_idempotency 
ON simulation_snapshots (
  tenant_id,
  incident_id,
  COALESCE(run_id, '__NO_RUN__'),
  calc_hash
);

-- Add comment for documentation
COMMENT ON INDEX uq_sim_snap_idempotency IS 
  'Phase 9B.5 Task 3: Content-based idempotency. COALESCE handles NULL runId. Sentinel __NO_RUN__ cannot appear in real UUID data.';
