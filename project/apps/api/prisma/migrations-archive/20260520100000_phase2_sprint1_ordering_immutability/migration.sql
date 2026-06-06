-- ===============================
-- Phase 2 Sprint 1: Ordering + Immutability Gates
-- Legal Kernel — HR-4, HR-5, HR-11
-- ===============================
--
-- PURPOSE:
-- 1) aggregate_version: deterministic event ordering per case (HR-11)
-- 2) Immutability triggers: IcrabotTimelineEntry + IcrabotFactAudit
--    are append-only — UPDATE/DELETE forbidden at DB level (HR-4, HR-5)
--
-- ERROR CODE REFERENCE:
-- ┌─────────┬────────────────────────────────────┬─────────────────────────────┐
-- │ ERRCODE │ EXCEPTION NAME                     │ HTTP / App Error            │
-- ├─────────┼────────────────────────────────────┼─────────────────────────────┤
-- │ 45010   │ immutable_violation                │ 409 ImmutableViolation      │
-- │ 45011   │ aggregate_version_gap              │ 409 VersionGapError         │
-- └─────────┴────────────────────────────────────┴─────────────────────────────┘

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) AGGREGATE VERSION — HR-11
-- ═══════════════════════════════════════════════════════════════════════════════
-- Per-case monotonic, gap-free ordering. This is the foundation for:
-- - Replay determinism (events replayed in aggregate_version order)
-- - Causality chain integrity
-- - Append discipline (new event = max(version) + 1)

-- 1a) Add column (nullable initially for backfill)
ALTER TABLE "IcrabotTimelineEntry"
  ADD COLUMN "aggregateVersion" BIGINT;

-- 1b) Backfill existing rows with deterministic ordering
-- Uses createdAt + id as tie-breaker for rows with same timestamp
WITH numbered AS (
  SELECT
    id,
    "caseId",
    ROW_NUMBER() OVER (
      PARTITION BY "caseId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "IcrabotTimelineEntry"
)
UPDATE "IcrabotTimelineEntry" t
SET "aggregateVersion" = n.rn
FROM numbered n
WHERE t.id = n.id;

-- 1c) Make NOT NULL after backfill
ALTER TABLE "IcrabotTimelineEntry"
  ALTER COLUMN "aggregateVersion" SET NOT NULL;

-- 1d) UNIQUE constraint: one version per case (gap-free monotonic)
CREATE UNIQUE INDEX "IcrabotTimelineEntry_caseId_aggregateVersion_key"
  ON "IcrabotTimelineEntry" ("caseId", "aggregateVersion");

-- 1e) Index for efficient max(aggregateVersion) lookup
CREATE INDEX "IcrabotTimelineEntry_caseId_aggregateVersion_desc"
  ON "IcrabotTimelineEntry" ("caseId", "aggregateVersion" DESC);

-- 1f) Trigger: validate gap-free on INSERT
-- New row must have aggregateVersion = max(existing) + 1 for that caseId
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
