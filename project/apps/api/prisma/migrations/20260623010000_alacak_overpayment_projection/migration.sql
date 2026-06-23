-- ALACAK-OVERPAYMENT-G1-SCHEMA-PROJECTION
-- Additive schema only: explicit first-class projection for collection overpayments.
-- No backfill. No service/report/refund behavior in this migration.

-- CreateEnum
CREATE TYPE "OverpaymentStatus" AS ENUM ('HELD', 'REFUNDED', 'TRANSFERRED', 'RE_ALLOCATED', 'REVERSED');

-- CreateTable
CREATE TABLE "CollectionOverpayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sourceLedgerEntryId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "remainingAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "OverpaymentStatus" NOT NULL DEFAULT 'HELD',
    "reversedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "CollectionOverpayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionOverpayment_collectionId_key" ON "CollectionOverpayment"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionOverpayment_tenantId_caseId_status_idx" ON "CollectionOverpayment"("tenantId", "caseId", "status");

-- CreateIndex
CREATE INDEX "CollectionOverpayment_tenantId_status_idx" ON "CollectionOverpayment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CollectionOverpayment_sourceLedgerEntryId_idx" ON "CollectionOverpayment"("sourceLedgerEntryId");

-- AddForeignKey
ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_sourceLedgerEntryId_fkey" FOREIGN KEY ("sourceLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DB CHECK
ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_amount_positive"
  CHECK ("amount" > 0);

ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_remaining_nonnegative"
  CHECK ("remainingAmount" >= 0);

ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_remaining_lte_amount"
  CHECK ("remainingAmount" <= "amount");
