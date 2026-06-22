-- ALACAK-PAYMENT-REVERSAL-1: schema foundation only.
-- Collection = business event, LedgerEntry = append-only financial fact.
-- Business reversal/cancel/delete behavior is intentionally left to later PRs.

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'REVERSAL';

-- AlterTable
ALTER TABLE "LedgerEntry"
ADD COLUMN     "collectionId" TEXT,
ADD COLUMN     "reversesLedgerEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reversesLedgerEntryId_key" ON "LedgerEntry"("reversesLedgerEntryId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_caseId_collectionId_idx" ON "LedgerEntry"("tenantId", "caseId", "collectionId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversesLedgerEntryId_fkey" FOREIGN KEY ("reversesLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;