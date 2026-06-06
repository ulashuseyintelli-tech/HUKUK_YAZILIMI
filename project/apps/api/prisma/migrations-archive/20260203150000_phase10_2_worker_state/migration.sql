-- Phase 10.2: Manifest Worker State Table
-- Design: Singleton row with owner/lease for multi-instance safety
-- Approved: 2026-02-03 by User

-- ==================== PAUSE REASON ENUM ====================
-- Forward-compatible enum with UNKNOWN for future extensions
CREATE TYPE "ManifestWorkerPauseReason" AS ENUM (
  'CONSECUTIVE_ERRORS',
  'MANUAL_PAUSE',
  'UNKNOWN'
);

-- ==================== WORKER STATE TABLE ====================
-- Singleton table: only one row with id='singleton'
CREATE TABLE "manifest_worker_state" (
  -- Singleton constraint
  "id" TEXT PRIMARY KEY DEFAULT 'singleton' CHECK ("id" = 'singleton'),
  
  -- Pause state
  "is_paused" BOOLEAN NOT NULL DEFAULT false,
  "pause_reason" "ManifestWorkerPauseReason",
  "paused_at" TIMESTAMPTZ(6),
  "paused_by" TEXT,  -- Actor for MANUAL_PAUSE
  
  -- Error tracking
  "consecutive_errors" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  "last_error_at" TIMESTAMPTZ(6),
  
  -- Leader election (multi-instance safety)
  "owner_instance_id" TEXT,
  "lease_expires_at" TIMESTAMPTZ(6),
  
  -- Timestamps
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- ==================== INDEXES ====================
-- Singleton enforcement (redundant with PK but explicit)
CREATE UNIQUE INDEX "idx_worker_state_singleton" ON "manifest_worker_state" ("id");

-- Lease expiration index for leader election queries
CREATE INDEX "idx_worker_state_lease" ON "manifest_worker_state" ("owner_instance_id", "lease_expires_at");

-- ==================== UPDATED_AT TRIGGER ====================
CREATE OR REPLACE FUNCTION update_manifest_worker_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "manifest_worker_state_updated_at"
  BEFORE UPDATE ON "manifest_worker_state"
  FOR EACH ROW
  EXECUTE FUNCTION update_manifest_worker_state_timestamp();

-- ==================== INITIALIZE SINGLETON ROW ====================
-- Insert the singleton row on migration
INSERT INTO "manifest_worker_state" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;

-- ==================== COMMENTS ====================
COMMENT ON TABLE "manifest_worker_state" IS 'Singleton table for manifest retry worker state. Only one row with id=singleton.';
COMMENT ON COLUMN "manifest_worker_state"."owner_instance_id" IS 'Instance ID of the current leader (for multi-instance deployments)';
COMMENT ON COLUMN "manifest_worker_state"."lease_expires_at" IS 'Lease expiration time for leader election';
COMMENT ON COLUMN "manifest_worker_state"."pause_reason" IS 'Reason for pause: CONSECUTIVE_ERRORS (auto-resume after cooloff), MANUAL_PAUSE (never auto-resume), UNKNOWN (forward-compatible)';
