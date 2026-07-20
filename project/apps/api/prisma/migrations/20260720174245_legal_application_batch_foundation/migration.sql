-- RCV-COL / TPA-03A
-- Additive, writer-free and no-backfill LegalApplication foundation.
-- Aggregate exact-cent conservation remains a writer-stage contract and is
-- intentionally not enforced by this migration.

-- CreateEnum
CREATE TYPE "LegalApplicationBatchType" AS ENUM ('APPLY', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LegalApplicationComponentType" AS ENUM (
    'COST',
    'ANCILLARY',
    'ACCRUED_INTEREST',
    'PRINCIPAL'
);

-- Tenant-safe parent keys. These indexes do not change existing rows.
CREATE UNIQUE INDEX "Case_tenantId_id_key"
ON "Case"("tenantId", "id");

CREATE UNIQUE INDEX "Collection_tenantId_id_key"
ON "Collection"("tenantId", "id");

CREATE UNIQUE INDEX "ClaimItem_tenantId_id_key"
ON "ClaimItem"("tenantId", "id");

-- CreateTable
CREATE TABLE "LegalApplicationBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "batchType" "LegalApplicationBatchType" NOT NULL,
    "currency" TEXT NOT NULL,
    "receiptAmountMinor" BIGINT NOT NULL,
    "heldRemainderMinor" BIGINT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "reversesBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalApplicationBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LegalApplicationBatch_receipt_amount_check"
        CHECK ("receiptAmountMinor" > 0),
    CONSTRAINT "LegalApplicationBatch_held_remainder_check"
        CHECK ("heldRemainderMinor" >= 0),
    CONSTRAINT "LegalApplicationBatch_nonblank_identity_check"
        CHECK (
            btrim("id") <> ''
            AND btrim("tenantId") <> ''
            AND btrim("caseId") <> ''
            AND btrim("collectionId") <> ''
            AND btrim("currency") <> ''
            AND btrim("idempotencyKey") <> ''
            AND btrim("commandHash") <> ''
        ),
    CONSTRAINT "LegalApplicationBatch_reversal_pointer_check"
        CHECK (
            ("batchType" = 'APPLY' AND "reversesBatchId" IS NULL)
            OR
            (
                "batchType" = 'REVERSAL'
                AND "reversesBatchId" IS NOT NULL
                AND btrim("reversesBatchId") <> ''
                AND "reversesBatchId" <> "id"
            )
        )
);

-- CreateTable
CREATE TABLE "LegalApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "componentType" "LegalApplicationComponentType" NOT NULL,
    "bucketContextKey" TEXT NOT NULL,
    "bucketInstanceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "appliedAmountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalApplication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LegalApplication_amount_check"
        CHECK ("appliedAmountMinor" > 0),
    CONSTRAINT "LegalApplication_sequence_check"
        CHECK ("sequence" > 0),
    CONSTRAINT "LegalApplication_nonblank_identity_check"
        CHECK (
            btrim("id") <> ''
            AND btrim("tenantId") <> ''
            AND btrim("batchId") <> ''
            AND btrim("bucketContextKey") <> ''
            AND btrim("bucketInstanceId") <> ''
        )
);

-- CreateTable
CREATE TABLE "ApplicationAttribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "claimItemId" TEXT,
    "attributedAmountMinor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationAttribution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApplicationAttribution_amount_check"
        CHECK (
            "attributedAmountMinor" IS NULL
            OR "attributedAmountMinor" > 0
        ),
    CONSTRAINT "ApplicationAttribution_nonblank_identity_check"
        CHECK (
            btrim("id") <> ''
            AND btrim("tenantId") <> ''
            AND btrim("batchId") <> ''
            AND btrim("applicationId") <> ''
            AND (
                "claimItemId" IS NULL
                OR btrim("claimItemId") <> ''
            )
        )
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalApplicationBatch_tenantId_id_key"
ON "LegalApplicationBatch"("tenantId", "id");

CREATE UNIQUE INDEX "LegalApplicationBatch_tenantId_idempotencyKey_key"
ON "LegalApplicationBatch"("tenantId", "idempotencyKey");

CREATE UNIQUE INDEX "LegalApplicationBatch_tenantId_reversesBatchId_key"
ON "LegalApplicationBatch"("tenantId", "reversesBatchId");

-- One canonical APPLY batch per Collection receipt. REVERSAL uniqueness is
-- independently enforced by reversesBatchId.
CREATE UNIQUE INDEX "LegalApplicationBatch_tenantId_collectionId_apply_key"
ON "LegalApplicationBatch"("tenantId", "collectionId")
WHERE "batchType" = 'APPLY';

CREATE INDEX "LegalApplicationBatch_tenantId_caseId_idx"
ON "LegalApplicationBatch"("tenantId", "caseId");

CREATE INDEX "LegalApplicationBatch_tenantId_collectionId_idx"
ON "LegalApplicationBatch"("tenantId", "collectionId");

CREATE INDEX "LegalApplicationBatch_batchType_idx"
ON "LegalApplicationBatch"("batchType");

CREATE INDEX "LegalApplicationBatch_createdAt_idx"
ON "LegalApplicationBatch"("createdAt");

CREATE UNIQUE INDEX "LegalApplication_tenantId_batchId_id_key"
ON "LegalApplication"("tenantId", "batchId", "id");

CREATE UNIQUE INDEX "LegalApplication_tenantId_batchId_sequence_key"
ON "LegalApplication"("tenantId", "batchId", "sequence");

CREATE INDEX "LegalApplication_tenantId_batchId_idx"
ON "LegalApplication"("tenantId", "batchId");

CREATE INDEX "LegalApplication_componentType_idx"
ON "LegalApplication"("componentType");

CREATE INDEX "LegalApplication_bucketContextKey_idx"
ON "LegalApplication"("bucketContextKey");

CREATE INDEX "LegalApplication_bucketInstanceId_idx"
ON "LegalApplication"("bucketInstanceId");

CREATE UNIQUE INDEX "ApplicationAttribution_tenantId_id_key"
ON "ApplicationAttribution"("tenantId", "id");

CREATE INDEX "ApplicationAttribution_tenantId_batchId_idx"
ON "ApplicationAttribution"("tenantId", "batchId");

CREATE INDEX "ApplicationAttribution_tenantId_batchId_applicationId_idx"
ON "ApplicationAttribution"("tenantId", "batchId", "applicationId");

CREATE INDEX "ApplicationAttribution_tenantId_claimItemId_idx"
ON "ApplicationAttribution"("tenantId", "claimItemId");

-- AddForeignKey
ALTER TABLE "LegalApplicationBatch"
ADD CONSTRAINT "LegalApplicationBatch_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalApplicationBatch"
ADD CONSTRAINT "LegalApplicationBatch_tenantId_caseId_fkey"
FOREIGN KEY ("tenantId", "caseId")
REFERENCES "Case"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalApplicationBatch"
ADD CONSTRAINT "LegalApplicationBatch_tenantId_collectionId_fkey"
FOREIGN KEY ("tenantId", "collectionId")
REFERENCES "Collection"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalApplicationBatch"
ADD CONSTRAINT "LegalApplicationBatch_tenantId_reversesBatchId_fkey"
FOREIGN KEY ("tenantId", "reversesBatchId")
REFERENCES "LegalApplicationBatch"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalApplication"
ADD CONSTRAINT "LegalApplication_tenantId_batchId_fkey"
FOREIGN KEY ("tenantId", "batchId")
REFERENCES "LegalApplicationBatch"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApplicationAttribution"
ADD CONSTRAINT "ApplicationAttribution_tenantId_batchId_fkey"
FOREIGN KEY ("tenantId", "batchId")
REFERENCES "LegalApplicationBatch"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApplicationAttribution"
ADD CONSTRAINT "ApplicationAttribution_tenantId_batchId_applicationId_fkey"
FOREIGN KEY ("tenantId", "batchId", "applicationId")
REFERENCES "LegalApplication"("tenantId", "batchId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApplicationAttribution"
ADD CONSTRAINT "ApplicationAttribution_tenantId_claimItemId_fkey"
FOREIGN KEY ("tenantId", "claimItemId")
REFERENCES "ClaimItem"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only legal facts reuse the repository's shared immutable guard.
CREATE TRIGGER "prevent_legal_application_batch_update"
BEFORE UPDATE ON "LegalApplicationBatch"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_legal_application_batch_delete"
BEFORE DELETE ON "LegalApplicationBatch"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_legal_application_update"
BEFORE UPDATE ON "LegalApplication"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_legal_application_delete"
BEFORE DELETE ON "LegalApplication"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_application_attribution_update"
BEFORE UPDATE ON "ApplicationAttribution"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_application_attribution_delete"
BEFORE DELETE ON "ApplicationAttribution"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();
