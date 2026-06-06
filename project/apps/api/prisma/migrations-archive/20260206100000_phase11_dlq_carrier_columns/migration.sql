-- Phase 11.0: DLQ Carrier Column Migration
-- Task 11.0: Add carrier storage columns to manifest_dead_letter_queue
--
-- PURPOSE:
-- Store full V2 carrier JSON on DLQ insert for admin redrive operations.
-- This enables context preservation across the retry → DLQ → redrive lifecycle.
--
-- MIGRATION SAFETY:
-- - ADD COLUMN ... NULL: No table rewrite, minimal lock time
-- - DEFAULT false on carrier_truncated: Safe for existing rows
-- - Existing DLQ entries will have NULL carrier_json (expected)
--
-- ROLLOUT ORDER:
-- 1. Deploy migration (columns added)
-- 2. Deploy code that handles columns present/absent (NULL tolerant)
-- 3. Enable feature (carrier storage on DLQ insert)
--
-- ROLLBACK RISK:
-- If rollback is needed, code must tolerate missing columns.
-- Down migration removes columns - ensure code is backward compatible first.

-- ============================================================================
-- Add carrier storage columns
-- ============================================================================

-- carrier_json: Full V2 carrier JSON (may be truncated if too large)
-- NULL for pre-11.0 entries or when carrier was unavailable
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_json TEXT NULL;

-- carrier_version: Carrier schema version (1 or 2)
-- NULL for pre-11.0 entries
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_version SMALLINT NULL;

-- carrier_truncated: True if carrier was truncated due to size limits
-- DEFAULT false for existing rows (they have no carrier, so not truncated)
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_truncated BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- Constraints
-- ============================================================================

-- carrier_version must be 1 or 2 when set
ALTER TABLE manifest_dead_letter_queue
ADD CONSTRAINT chk_dlq_carrier_version CHECK (
  carrier_version IS NULL OR carrier_version IN (1, 2)
);

-- carrier_truncated can only be true if carrier_json is present
ALTER TABLE manifest_dead_letter_queue
ADD CONSTRAINT chk_dlq_carrier_truncated CHECK (
  carrier_truncated = false OR carrier_json IS NOT NULL
);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN manifest_dead_letter_queue.carrier_json IS 'Phase 11: Full V2 carrier JSON for redrive context preservation';
COMMENT ON COLUMN manifest_dead_letter_queue.carrier_version IS 'Phase 11: Carrier schema version (1 or 2)';
COMMENT ON COLUMN manifest_dead_letter_queue.carrier_truncated IS 'Phase 11: True if carrier was truncated due to size limits';
