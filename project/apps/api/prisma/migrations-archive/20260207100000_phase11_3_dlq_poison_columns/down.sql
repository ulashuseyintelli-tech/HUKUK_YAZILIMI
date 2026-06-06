-- Phase 11.3 Rollback: Remove POISON columns
--
-- WARNING: This drops poison tracking data.
-- If is_poison=true rows exist, their poison state will be lost.
-- Default behavior after rollback: all entries treated as non-poison (is_poison defaults to false).

ALTER TABLE manifest_dead_letter_queue DROP COLUMN IF EXISTS poison_reason;
ALTER TABLE manifest_dead_letter_queue DROP COLUMN IF EXISTS is_poison;
