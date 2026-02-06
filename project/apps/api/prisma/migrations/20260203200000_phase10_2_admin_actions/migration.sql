-- Phase 10.2: Admin Actions Table (Idempotency Store)
-- Design: Idempotency için audit log'a değil, actions table'a güven
-- Approved: 2026-02-03 by User
-- 
-- CRITICAL: Idempotency için audit log'a güvenme!
-- Degraded mode'da dosyaya düşebilir → DB'de olmayabilir → yanlış idempotency

-- ==================== ADMIN ACTION TYPE ENUM ====================
CREATE TYPE "ManifestAdminActionType" AS ENUM (
  'DLQ_RESOLVE',
  'DLQ_REDRIVE',
  'DLQ_BULK_REDRIVE',
  'WORKER_RESUME',
  'WORKER_PAUSE',
  'CB_OVERRIDE'
);

-- ==================== ADMIN ACTIONS TABLE ====================
-- Idempotency store for admin operations
CREATE TABLE "manifest_admin_actions" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Idempotency key (unique per request)
  "request_id" TEXT NOT NULL UNIQUE,
  
  -- Action details
  "action_type" "ManifestAdminActionType" NOT NULL,
  "endpoint" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  
  -- Actor info
  "actor" TEXT NOT NULL,
  "ip_hash" TEXT,
  
  -- Result
  "result_code" TEXT NOT NULL,
  "result_json" JSONB,
  
  -- Timestamps
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- ==================== INDEXES ====================
-- Primary lookup by request_id (idempotency check)
CREATE UNIQUE INDEX "idx_admin_actions_request_id" ON "manifest_admin_actions" ("request_id");

-- Lookup by resource for history
CREATE INDEX "idx_admin_actions_resource" ON "manifest_admin_actions" ("resource_type", "resource_id");

-- Cleanup expired entries
CREATE INDEX "idx_admin_actions_expires" ON "manifest_admin_actions" ("expires_at");

-- Actor audit trail
CREATE INDEX "idx_admin_actions_actor" ON "manifest_admin_actions" ("actor", "created_at");

-- ==================== COMMENTS ====================
COMMENT ON TABLE "manifest_admin_actions" IS 'Idempotency store for admin operations. Use request_id for idempotency, NOT audit log.';
COMMENT ON COLUMN "manifest_admin_actions"."request_id" IS 'Unique request ID for idempotency (client-provided or generated)';
COMMENT ON COLUMN "manifest_admin_actions"."expires_at" IS 'TTL for idempotency window (default 7 days)';
COMMENT ON COLUMN "manifest_admin_actions"."result_json" IS 'Cached result for idempotent replay';
