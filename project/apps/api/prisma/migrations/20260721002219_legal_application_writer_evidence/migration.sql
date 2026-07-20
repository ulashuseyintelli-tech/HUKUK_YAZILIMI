-- RCV-COL / TPA-04B
-- Additive, writer-free and no-backfill legal-application evidence amendment.
-- Canonical serialization/hash recomputation and full-reversal exact-inverse
-- matching remain writer-stage concerns.

BEGIN;

-- The required/default-free amendment is safe only while every foundation
-- table is empty. Acquire locks before checking so no row can race the gate.
LOCK TABLE
    "LegalApplicationBatch",
    "LegalApplication",
    "ApplicationAttribution"
IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "LegalApplicationBatch" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "LegalApplication" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "ApplicationAttribution" LIMIT 1) THEN
        RAISE EXCEPTION
            'TPA-04B requires empty LegalApplication foundation tables; backfill is prohibited'
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

ALTER TABLE "LegalApplicationBatch"
    ADD COLUMN "snapshotContractVersion" TEXT NOT NULL,
    ADD COLUMN "snapshotSerializationVersion" TEXT NOT NULL,
    ADD COLUMN "snapshotRef" TEXT NOT NULL,
    ADD COLUMN "snapshotHash" TEXT NOT NULL,
    ADD COLUMN "snapshotCanonicalPayload" TEXT NOT NULL,
    ADD COLUMN "sourceVersionSetHash" TEXT NOT NULL,
    ADD COLUMN "snapshotAsOfDate" DATE NOT NULL,
    ADD COLUMN "applicationEffectiveDate" DATE NOT NULL,
    ADD COLUMN "historyBoundaryRef" TEXT NOT NULL,
    ADD COLUMN "engineVersion" TEXT NOT NULL,
    ADD COLUMN "calculationRuleVersion" TEXT NOT NULL,
    ADD COLUMN "policyVersion" TEXT NOT NULL,
    ADD COLUMN "rateTableVersion" TEXT NOT NULL,
    ADD COLUMN "interpretationProfileId" TEXT NOT NULL,
    ADD COLUMN "bucketIdentityVersion" TEXT NOT NULL,
    ADD COLUMN "minorUnit" INTEGER NOT NULL;

ALTER TABLE "LegalApplication"
    ADD COLUMN "componentCode" TEXT NOT NULL,
    ADD COLUMN "sourceLineageSetRef" TEXT NOT NULL,
    ADD COLUMN "bucketBeforeMinor" BIGINT NOT NULL,
    ADD COLUMN "bucketAfterMinor" BIGINT NOT NULL;

ALTER TABLE "LegalApplicationBatch"
    ADD CONSTRAINT "LegalApplicationBatch_snapshot_contract_check"
        CHECK (
            "snapshotContractVersion" = 'CanonicalReceivableApplicationSnapshotV1'
            AND "snapshotSerializationVersion" = 'RCV-CAS/v1'
        ),
    ADD CONSTRAINT "LegalApplicationBatch_evidence_nonblank_check"
        CHECK (
            btrim("snapshotRef") <> ''
            AND btrim("historyBoundaryRef") <> ''
            AND btrim("engineVersion") <> ''
            AND btrim("calculationRuleVersion") <> ''
            AND btrim("policyVersion") <> ''
            AND btrim("rateTableVersion") <> ''
            AND btrim("interpretationProfileId") <> ''
            AND btrim("bucketIdentityVersion") <> ''
        ),
    ADD CONSTRAINT "LegalApplicationBatch_snapshot_hash_check"
        CHECK ("snapshotHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "LegalApplicationBatch_source_version_set_hash_check"
        CHECK ("sourceVersionSetHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "LegalApplicationBatch_snapshot_ref_check"
        CHECK (
            "snapshotRef" = 'rcv-app-snapshot:v1:sha256:' || "snapshotHash"
        ),
    ADD CONSTRAINT "LegalApplicationBatch_snapshot_payload_check"
        CHECK ("snapshotCanonicalPayload" IS JSON OBJECT WITH UNIQUE KEYS),
    ADD CONSTRAINT "LegalApplicationBatch_minor_unit_check"
        CHECK ("minorUnit" >= 0);

ALTER TABLE "LegalApplication"
    ADD CONSTRAINT "LegalApplication_evidence_nonblank_check"
        CHECK (
            btrim("componentCode") <> ''
            AND btrim("sourceLineageSetRef") <> ''
        ),
    ADD CONSTRAINT "LegalApplication_bucket_identity_format_check"
        CHECK (
            "bucketContextKey" ~ '^bctx:v1:sha256:[0-9a-f]{64}$'
            AND "bucketInstanceId" ~ '^binst:v1:sha256:[0-9a-f]{64}$'
        ),
    ADD CONSTRAINT "LegalApplication_bucket_balance_check"
        CHECK (
            "bucketBeforeMinor" >= 0
            AND "bucketAfterMinor" >= 0
        );

CREATE UNIQUE INDEX "LegalApplication_tenantId_batchId_bucketContextKey_key"
ON "LegalApplication"("tenantId", "batchId", "bucketContextKey");

CREATE UNIQUE INDEX "LegalApplication_tenantId_batchId_bucketInstanceId_key"
ON "LegalApplication"("tenantId", "batchId", "bucketInstanceId");

-- Bucket direction is derived from the immutable parent batch type.
CREATE FUNCTION check_legal_application_bucket_arithmetic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch_type TEXT;
BEGIN
    SELECT "batchType"::TEXT
    INTO v_batch_type
    FROM "LegalApplicationBatch"
    WHERE "tenantId" = NEW."tenantId"
      AND "id" = NEW."batchId";

    IF v_batch_type = 'APPLY'
       AND NEW."bucketBeforeMinor" - NEW."bucketAfterMinor" <> NEW."appliedAmountMinor" THEN
        RAISE EXCEPTION
            'APPLY bucket arithmetic mismatch for LegalApplication %', NEW."id"
            USING ERRCODE = '23514';
    ELSIF v_batch_type = 'REVERSAL'
       AND NEW."bucketAfterMinor" - NEW."bucketBeforeMinor" <> NEW."appliedAmountMinor" THEN
        RAISE EXCEPTION
            'REVERSAL bucket arithmetic mismatch for LegalApplication %', NEW."id"
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "enforce_legal_application_bucket_arithmetic"
AFTER INSERT ON "LegalApplication"
FOR EACH ROW
EXECUTE FUNCTION check_legal_application_bucket_arithmetic();

-- Conservation is checked at transaction end so a batch and all of its
-- immutable application facts can be inserted atomically in either APPLY or
-- REVERSAL form. A zero-application, fully HELD batch remains valid.
CREATE FUNCTION check_legal_application_batch_conservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tenant_id TEXT;
    v_batch_id TEXT;
    v_receipt_amount NUMERIC;
    v_held_remainder NUMERIC;
    v_applied_total NUMERIC;
BEGIN
    IF TG_TABLE_NAME = 'LegalApplicationBatch' THEN
        v_tenant_id := NEW."tenantId";
        v_batch_id := NEW."id";
    ELSE
        v_tenant_id := NEW."tenantId";
        v_batch_id := NEW."batchId";
    END IF;

    SELECT "receiptAmountMinor", "heldRemainderMinor"
    INTO v_receipt_amount, v_held_remainder
    FROM "LegalApplicationBatch"
    WHERE "tenantId" = v_tenant_id
      AND "id" = v_batch_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM("appliedAmountMinor"), 0)
    INTO v_applied_total
    FROM "LegalApplication"
    WHERE "tenantId" = v_tenant_id
      AND "batchId" = v_batch_id;

    IF v_receipt_amount <> v_applied_total + v_held_remainder THEN
        RAISE EXCEPTION
            'LegalApplicationBatch conservation mismatch for tenant %, batch %',
            v_tenant_id, v_batch_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "enforce_legal_application_batch_conservation"
AFTER INSERT ON "LegalApplicationBatch"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_legal_application_batch_conservation();

CREATE CONSTRAINT TRIGGER "enforce_legal_application_conservation"
AFTER INSERT ON "LegalApplication"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_legal_application_batch_conservation();

COMMIT;
