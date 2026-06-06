-- Phase 11.0: DLQ Carrier Column Migration - ROLLBACK
--
-- WARNING: Only run this if code is backward compatible!
-- Code must tolerate missing carrier_json, carrier_version, carrier_truncated columns.
--
-- ROLLBACK ORDER:
-- 1. Disable feature (stop writing carrier to DLQ)
-- 2. Deploy code that tolerates missing columns
-- 3. Run this down migration

-- ============================================================================
-- Remove constraints first
-- ============================================================================

ALTER TABLE manifest_dead_letter_queue
DROP CONSTRAINT IF EXISTS chk_dlq_carrier_truncated;

ALTER TABLE manifest_dead_letter_queue
DROP CONSTRAINT IF EXISTS chk_dlq_carrier_version;

-- ============================================================================
-- Remove columns
-- ============================================================================

ALTER TABLE manifest_dead_letter_queue
DROP COLUMN IF EXISTS carrier_truncated;

ALTER TABLE manifest_dead_letter_queue
DROP COLUMN IF EXISTS carrier_version;

ALTER TABLE manifest_dead_letter_queue
DROP COLUMN IF EXISTS carrier_json;
