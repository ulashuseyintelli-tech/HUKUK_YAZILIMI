-- TM47D-1B - Prior payout manual reversal schema foundation.
-- Schema-only: no runtime behavior, no allocation write, no workflow creation, no refund/offset/waiver execution.

-- CreateEnum
CREATE TYPE "ClientPayoutManualReversalStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClientPayoutManualReversalClosureMethod" AS ENUM ('REFUND', 'OFFSET', 'WAIVER');

-- CreateEnum
CREATE TYPE "ClientPayoutManualReversalSourceConfidence" AS ENUM ('EXACT', 'AGGREGATE_ONLY', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ClientPayoutAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseClientId" TEXT NOT NULL,
    "clientPayoutId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "collectionDispositionId" TEXT NOT NULL,
    "collectionDispositionLineId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPayoutAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPayoutManualReversal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseClientId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "ClientPayoutManualReversalStatus" NOT NULL DEFAULT 'OPEN',
    "closureMethod" "ClientPayoutManualReversalClosureMethod",
    "confidence" "ClientPayoutManualReversalSourceConfidence" NOT NULL DEFAULT 'UNKNOWN',
    "dedupeKey" TEXT NOT NULL,
    "sourceActionId" TEXT,
    "collectionId" TEXT,
    "collectionDispositionId" TEXT,
    "collectionDispositionLineId" TEXT,
    "clientPayoutId" TEXT,
    "clientPayoutAllocationId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "note" TEXT,
    "closureNote" TEXT,
    "evidenceRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPayoutManualReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_payout_allocation_source_unique" ON "ClientPayoutAllocation"("clientPayoutId", "collectionDispositionLineId");

-- CreateIndex
CREATE INDEX "client_payout_allocation_scope_idx" ON "ClientPayoutAllocation"("tenantId", "caseId", "caseClientId", "currency");

-- CreateIndex
CREATE INDEX "ClientPayoutAllocation_clientPayoutId_idx" ON "ClientPayoutAllocation"("clientPayoutId");

-- CreateIndex
CREATE INDEX "ClientPayoutAllocation_collectionDispositionId_idx" ON "ClientPayoutAllocation"("collectionDispositionId");

-- CreateIndex
CREATE INDEX "ClientPayoutAllocation_collectionDispositionLineId_idx" ON "ClientPayoutAllocation"("collectionDispositionLineId");

-- CreateIndex
CREATE INDEX "ClientPayoutAllocation_allocatedAt_idx" ON "ClientPayoutAllocation"("allocatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPayoutManualReversal_dedupeKey_key" ON "ClientPayoutManualReversal"("dedupeKey");

-- CreateIndex
CREATE INDEX "client_payout_manual_reversal_scope_status_idx" ON "ClientPayoutManualReversal"("tenantId", "caseId", "caseClientId", "currency", "status");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_tenantId_status_openedAt_idx" ON "ClientPayoutManualReversal"("tenantId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_tenantId_closureMethod_status_idx" ON "ClientPayoutManualReversal"("tenantId", "closureMethod", "status");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_collectionDispositionId_idx" ON "ClientPayoutManualReversal"("collectionDispositionId");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_collectionDispositionLineId_idx" ON "ClientPayoutManualReversal"("collectionDispositionLineId");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_clientPayoutId_idx" ON "ClientPayoutManualReversal"("clientPayoutId");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_clientPayoutAllocationId_idx" ON "ClientPayoutManualReversal"("clientPayoutAllocationId");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_openedAt_idx" ON "ClientPayoutManualReversal"("openedAt");

-- CreateIndex
CREATE INDEX "ClientPayoutManualReversal_closedAt_idx" ON "ClientPayoutManualReversal"("closedAt");

-- AddForeignKey
ALTER TABLE "ClientPayoutAllocation" ADD CONSTRAINT "ClientPayoutAllocation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutAllocation" ADD CONSTRAINT "ClientPayoutAllocation_caseClientId_fkey" FOREIGN KEY ("caseClientId") REFERENCES "CaseClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutAllocation" ADD CONSTRAINT "ClientPayoutAllocation_clientPayoutId_fkey" FOREIGN KEY ("clientPayoutId") REFERENCES "ClientPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutAllocation" ADD CONSTRAINT "ClientPayoutAllocation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutAllocation" ADD CONSTRAINT "ClientPayoutAllocation_collectionDispositionId_fkey" FOREIGN KEY ("collectionDispositionId") REFERENCES "CollectionDisposition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutAllocation" ADD CONSTRAINT "ClientPayoutAllocation_collectionDispositionLineId_fkey" FOREIGN KEY ("collectionDispositionLineId") REFERENCES "CollectionDispositionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutManualReversal" ADD CONSTRAINT "ClientPayoutManualReversal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutManualReversal" ADD CONSTRAINT "ClientPayoutManualReversal_caseClientId_fkey" FOREIGN KEY ("caseClientId") REFERENCES "CaseClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutManualReversal" ADD CONSTRAINT "ClientPayoutManualReversal_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutManualReversal" ADD CONSTRAINT "ClientPayoutManualReversal_collectionDispositionId_fkey" FOREIGN KEY ("collectionDispositionId") REFERENCES "CollectionDisposition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutManualReversal" ADD CONSTRAINT "ClientPayoutManualReversal_collectionDispositionLineId_fkey" FOREIGN KEY ("collectionDispositionLineId") REFERENCES "CollectionDispositionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutManualReversal" ADD CONSTRAINT "ClientPayoutManualReversal_clientPayoutId_fkey" FOREIGN KEY ("clientPayoutId") REFERENCES "ClientPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayoutManualReversal" ADD CONSTRAINT "ClientPayoutManualReversal_clientPayoutAllocationId_fkey" FOREIGN KEY ("clientPayoutAllocationId") REFERENCES "ClientPayoutAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;