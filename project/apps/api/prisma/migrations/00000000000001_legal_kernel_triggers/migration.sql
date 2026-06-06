-- =============================================================================
-- 00000000000001_legal_kernel_triggers
-- Squash baseline'ın trigger/function katmanı (doc 16 §2).
-- 5 function + 8 trigger + worker singleton. ALTER/backfill TAŞINMAZ (baseline'da var).
-- Kaynaklar: phase9c_task2_evidence_bundles, phase10_2_worker_state,
--           phase2_sprint1_ordering_immutability
-- =============================================================================

BEGIN;

-- ── Kaynak 1: evidence bundles guards (2 fn + 2 trg) ───────────────────────
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

-- ── Kaynak 2: manifest worker state timestamp (1 fn + 1 trg + singleton) ───
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

-- ── Kaynak 3: ordering + immutability (2 fn + 5 trg) ───────────────────────
CREATE OR REPLACE FUNCTION validate_aggregate_version()
RETURNS TRIGGER AS $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX("aggregateVersion"), 0)
  INTO v_max
  FROM "IcrabotTimelineEntry"
  WHERE "caseId" = NEW."caseId"
    AND id != NEW.id;

  IF NEW."aggregateVersion" != v_max + 1 THEN
    RAISE EXCEPTION 'aggregate_version_gap: expected %, got % for case %',
      v_max + 1, NEW."aggregateVersion", NEW."caseId"
      USING ERRCODE = '45011';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_aggregate_version_gap_free
  BEFORE INSERT ON "IcrabotTimelineEntry"
  FOR EACH ROW EXECUTE FUNCTION validate_aggregate_version();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) IMMUTABILITY TRIGGERS — HR-4, HR-5
-- ═══════════════════════════════════════════════════════════════════════════════
-- Legal facts are immutable (Constitutional Rule A).
-- Once written, timeline entries and fact audit records cannot be modified or deleted.
-- This is DB-enforced, not convention-enforced.

-- 2a) Shared immutability function
CREATE OR REPLACE FUNCTION raise_immutable_error()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'immutable_violation: % on "%" is forbidden. Legal facts are immutable.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = '45010';
  RETURN NULL; -- never reached
END;
$$ LANGUAGE plpgsql;

-- 2b) IcrabotTimelineEntry — UPDATE forbidden (HR-4)
DROP TRIGGER IF EXISTS prevent_timeline_update ON "IcrabotTimelineEntry";
CREATE TRIGGER prevent_timeline_update
  BEFORE UPDATE ON "IcrabotTimelineEntry"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- 2c) IcrabotTimelineEntry — DELETE forbidden (HR-5)
DROP TRIGGER IF EXISTS prevent_timeline_delete ON "IcrabotTimelineEntry";
CREATE TRIGGER prevent_timeline_delete
  BEFORE DELETE ON "IcrabotTimelineEntry"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- 2d) IcrabotFactAudit — UPDATE forbidden (HR-5)
DROP TRIGGER IF EXISTS prevent_fact_audit_update ON "IcrabotFactAudit";
CREATE TRIGGER prevent_fact_audit_update
  BEFORE UPDATE ON "IcrabotFactAudit"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- 2e) IcrabotFactAudit — DELETE forbidden (HR-5)
DROP TRIGGER IF EXISTS prevent_fact_audit_delete ON "IcrabotFactAudit";
CREATE TRIGGER prevent_fact_audit_delete
  BEFORE DELETE ON "IcrabotFactAudit"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

COMMIT;
