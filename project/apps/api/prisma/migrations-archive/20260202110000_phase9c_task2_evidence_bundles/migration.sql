-- ===============================
-- Phase 9C / Task 2: DB Migration
-- Evidence Bundle System for Legal-Grade Audit Trail
-- ===============================
-- 
-- ERROR CODE REFERENCE (for application layer mapping):
-- ┌─────────┬────────────────────────────────────┬─────────────────────────────┐
-- │ ERRCODE │ EXCEPTION NAME                     │ HTTP / App Error            │
-- ├─────────┼────────────────────────────────────┼─────────────────────────────┤
-- │ 45000   │ sealed_bundle_write_forbidden      │ 409 WriteOnceViolation      │
-- │ 45001   │ tenant_mismatch                    │ 403 TenantMismatchError     │
-- │ 45002   │ seal_event_requires_sealed_bundle  │ 409 InvalidStateTransition  │
-- │ 23503   │ bundle_not_found (FK semantics)    │ 404 BundleNotFoundError     │
-- └─────────┴────────────────────────────────────┴─────────────────────────────┘

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0) EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) evidence_bundles
-- ═══════════════════════════════════════════════════════════════════════════════
-- Bundle = bir incident için toplanan tüm evidence object'lerinin mantıksal grubu.
-- State machine: OPEN -> SEALED (tek yönlü, geri dönüşü yok)
-- SEALED bundle'a yeni object eklenemez (write-once semantics)

CREATE TABLE IF NOT EXISTS evidence_bundles (
  bundle_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   VARCHAR(64)  NOT NULL,
  incident_id VARCHAR(128) NOT NULL,
  state       VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
  sealed_hash VARCHAR(128) NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sealed_at   TIMESTAMPTZ  NULL,

  -- State enum constraint
  CONSTRAINT evidence_bundles_state_chk
    CHECK (state IN ('OPEN','SEALED')),

  -- Invariant: SEALED <-> sealed_hash & sealed_at are set
  -- Bu constraint DB seviyesinde state tutarlılığını garanti eder
  CONSTRAINT evidence_bundles_seal_invariant_chk
    CHECK (
      (state = 'OPEN'   AND sealed_hash IS NULL AND sealed_at IS NULL)
      OR
      (state = 'SEALED' AND sealed_hash IS NOT NULL AND sealed_at IS NOT NULL)
    )
);

COMMENT ON TABLE evidence_bundles IS 'Legal-grade evidence bundle for incident audit trail. State: OPEN->SEALED (one-way).';
COMMENT ON COLUMN evidence_bundles.sealed_hash IS 'SHA-256 hash of all objects in bundle at seal time. Tamper-evident.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) evidence_objects
-- ═══════════════════════════════════════════════════════════════════════════════
-- Object = S3/MinIO'daki bir dosyanın metadata kaydı.
-- Composite PK: (bundle_id, object_key) - aynı key bundle içinde tekrar edemez.
-- tenant_id denormalize: cross-table validation trigger ile kontrol edilir.

CREATE TABLE IF NOT EXISTS evidence_objects (
  bundle_id     UUID         NOT NULL,
  object_key    VARCHAR(512) NOT NULL,
  tenant_id     VARCHAR(64)  NOT NULL,
  etag          VARCHAR(64)  NOT NULL,
  version_id    VARCHAR(128) NULL,
  content_type  VARCHAR(128) NOT NULL,
  size_bytes    BIGINT       NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT evidence_objects_pk
    PRIMARY KEY (bundle_id, object_key),

  CONSTRAINT evidence_objects_bundle_fk
    FOREIGN KEY (bundle_id) REFERENCES evidence_bundles(bundle_id)
      ON DELETE CASCADE,

  CONSTRAINT evidence_objects_size_chk
    CHECK (size_bytes >= 0)
);

COMMENT ON TABLE evidence_objects IS 'Metadata for objects stored in S3/MinIO. Immutable once bundle is SEALED.';
COMMENT ON COLUMN evidence_objects.etag IS 'S3 ETag for content integrity verification.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3) bundle_seal_events
-- ═══════════════════════════════════════════════════════════════════════════════
-- Seal event = bundle'ın SEALED state'e geçiş kaydı.
-- Idempotency: (bundle_id, run_id) unique - aynı job tekrar seal edemez.
-- Audit: hash, object_count, total_size_bytes seal anındaki durumu kaydeder.

CREATE TABLE IF NOT EXISTS bundle_seal_events (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id         UUID         NOT NULL,
  run_id            VARCHAR(128) NOT NULL,
  hash              VARCHAR(128) NOT NULL,
  object_count      INT          NOT NULL,
  total_size_bytes  BIGINT       NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT bundle_seal_events_bundle_fk
    FOREIGN KEY (bundle_id) REFERENCES evidence_bundles(bundle_id)
      ON DELETE CASCADE,

  CONSTRAINT bundle_seal_events_object_count_chk
    CHECK (object_count >= 0),

  CONSTRAINT bundle_seal_events_total_size_chk
    CHECK (total_size_bytes >= 0),

  -- Idempotency: same run_id cannot seal same bundle twice
  CONSTRAINT bundle_seal_events_idempotency_uniq
    UNIQUE (bundle_id, run_id)
);

COMMENT ON TABLE bundle_seal_events IS 'Audit log for bundle seal operations. Idempotent by (bundle_id, run_id).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4) INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Partial unique: 1 OPEN bundle per tenant+incident
-- Bu index aynı incident için birden fazla OPEN bundle oluşturulmasını engeller
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_bundles_one_open
ON evidence_bundles (tenant_id, incident_id)
WHERE state = 'OPEN';

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_evidence_bundles_tenant_incident
ON evidence_bundles (tenant_id, incident_id);

CREATE INDEX IF NOT EXISTS idx_evidence_bundles_state
ON evidence_bundles (state);

CREATE INDEX IF NOT EXISTS idx_evidence_objects_tenant_created
ON evidence_objects (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_evidence_objects_bundle
ON evidence_objects (bundle_id);

CREATE INDEX IF NOT EXISTS idx_bundle_seal_events_bundle_created
ON bundle_seal_events (bundle_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5) TRIGGER: Prevent INSERT into evidence_objects for SEALED bundle
-- ═══════════════════════════════════════════════════════════════════════════════
-- Write-once semantics: SEALED bundle'a yeni object eklenemez.
-- Ayrıca tenant_id cross-table validation yapar (legal-grade için kritik).

CREATE OR REPLACE FUNCTION trg_evidence_object_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_state     VARCHAR(16);
  v_tenant_id VARCHAR(64);
BEGIN
  -- Bundle'ı oku
  SELECT state, tenant_id INTO v_state, v_tenant_id
  FROM evidence_bundles
  WHERE bundle_id = NEW.bundle_id;

  -- Bundle yoksa FK violation semantics
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'bundle_not_found: %', NEW.bundle_id
      USING ERRCODE = '23503';
  END IF;

  -- SEALED bundle'a yazma yasak
  IF v_state = 'SEALED' THEN
    RAISE EXCEPTION 'sealed_bundle_write_forbidden: %', NEW.bundle_id
      USING ERRCODE = '45000';
  END IF;

  -- Tenant mismatch kontrolü (legal-grade için kritik)
  IF v_tenant_id != NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch: object tenant_id (%) does not match bundle tenant_id (%)',
      NEW.tenant_id, v_tenant_id
      USING ERRCODE = '45001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_object_insert_guard ON evidence_objects;

CREATE TRIGGER evidence_object_insert_guard
BEFORE INSERT ON evidence_objects
FOR EACH ROW
EXECUTE FUNCTION trg_evidence_object_insert_guard();

COMMENT ON FUNCTION trg_evidence_object_insert_guard() IS 
'Guards evidence_objects INSERT: (1) bundle must exist, (2) bundle must be OPEN, (3) tenant_id must match.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6) TRIGGER: Validate seal_event only for SEALED bundles
-- ═══════════════════════════════════════════════════════════════════════════════
-- Seal event sadece SEALED state'teki bundle için yazılabilir.
-- Bu, seal işleminin atomik olmasını garanti eder.

CREATE OR REPLACE FUNCTION trg_bundle_seal_event_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_state VARCHAR(16);
BEGIN
  SELECT state INTO v_state
  FROM evidence_bundles
  WHERE bundle_id = NEW.bundle_id;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'bundle_not_found: %', NEW.bundle_id
      USING ERRCODE = '23503';
  END IF;

  IF v_state != 'SEALED' THEN
    RAISE EXCEPTION 'seal_event_requires_sealed_bundle: bundle % is in state %, expected SEALED',
      NEW.bundle_id, v_state
      USING ERRCODE = '45002';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bundle_seal_event_guard ON bundle_seal_events;

CREATE TRIGGER bundle_seal_event_guard
BEFORE INSERT ON bundle_seal_events
FOR EACH ROW
EXECUTE FUNCTION trg_bundle_seal_event_guard();

COMMENT ON FUNCTION trg_bundle_seal_event_guard() IS 
'Guards bundle_seal_events INSERT: bundle must be in SEALED state.';

COMMIT;
