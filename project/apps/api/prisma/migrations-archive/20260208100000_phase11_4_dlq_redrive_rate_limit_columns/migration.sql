-- Phase 11.4: Redrive Rate Limiting / Backoff Guardrail — rate limit columns
--
-- Adds last_redriven_at, redrive_count, next_allowed_redrive_at, rate_limit_reason
-- to manifest_dead_letter_queue.
--
-- These columns track per-entry redrive rate limiting state:
--   - redrive_count: number of successful redrives (backoff exponent input)
--   - last_redriven_at: timestamp of last successful redrive
--   - next_allowed_redrive_at: earliest allowed time for next redrive (cooldown enforcement)
--   - rate_limit_reason: last rate limit reason (debugging, optional)
--
-- Online-safe: ADD COLUMN ... NULL / DEFAULT 0 — minimal lock.
-- Backfill: not needed — NULL = "no cooldown", DEFAULT 0 = "first redrive allowed".
-- Rollback: safe — drops columns (data loss for rate limit state only).

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN last_redriven_at TIMESTAMPTZ NULL;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN redrive_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN next_allowed_redrive_at TIMESTAMPTZ NULL;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN rate_limit_reason TEXT NULL;

COMMENT ON COLUMN manifest_dead_letter_queue.last_redriven_at IS
  'Phase 11.4: Timestamp of last successful redrive';
COMMENT ON COLUMN manifest_dead_letter_queue.redrive_count IS
  'Phase 11.4: Number of successful redrives for this entry (backoff exponent input)';
COMMENT ON COLUMN manifest_dead_letter_queue.next_allowed_redrive_at IS
  'Phase 11.4: Earliest allowed time for next redrive (cooldown/backoff enforcement)';
COMMENT ON COLUMN manifest_dead_letter_queue.rate_limit_reason IS
  'Phase 11.4: Last rate limit reason (debugging, optional)';

-- Rollback:
-- ALTER TABLE manifest_dead_letter_queue DROP COLUMN IF EXISTS rate_limit_reason;
-- ALTER TABLE manifest_dead_letter_queue DROP COLUMN IF EXISTS next_allowed_redrive_at;
-- ALTER TABLE manifest_dead_letter_queue DROP COLUMN IF EXISTS redrive_count;
-- ALTER TABLE manifest_dead_letter_queue DROP COLUMN IF EXISTS last_redriven_at;
