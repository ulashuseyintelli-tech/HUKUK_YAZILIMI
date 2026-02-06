-- Phase 10.2: DLQ Table Extensions
-- Task 1.2: Add columns for admin operations tracking
--
-- This migration adds redrive tracking columns to the DLQ table.
-- These columns track when and by whom a DLQ entry was redriven.

-- ============================================================================
-- Add redrive tracking columns
-- ============================================================================

-- Add redriven_at column - timestamp when entry was redriven
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN redriven_at TIMESTAMPTZ;

-- Add redriven_by column - admin user ID who redrove the entry
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN redriven_by TEXT;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN manifest_dead_letter_queue.redriven_at IS 'Timestamp when entry was redriven back to retry queue';
COMMENT ON COLUMN manifest_dead_letter_queue.redriven_by IS 'Admin user ID who redrove the entry';
