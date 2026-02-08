-- Phase 11.3: Redrive Chain Depth Limit — POISON columns
--
-- Adds is_poison and poison_reason to manifest_dead_letter_queue.
-- These columns track DLQ entries that exceeded the redrive depth limit.
--
-- POISON semantics: latched — once set to true, never reverted.
-- Rollback: safe when no POISON entries exist; drops data if is_poison=true rows present.

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN is_poison BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN poison_reason TEXT NULL;

COMMENT ON COLUMN manifest_dead_letter_queue.is_poison IS
  'Phase 11.3: True if entry exceeded redrive depth limit (latched, never reverted)';
COMMENT ON COLUMN manifest_dead_letter_queue.poison_reason IS
  'Phase 11.3: Reason for poison flag (e.g. REDRIVE_DEPTH_EXCEEDED: depth=3, maxDepth=3)';
