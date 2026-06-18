-- N2: CaseInstrument kanonik bağ — caseId FK + ClaimItem.instrumentId nullable FK + index (additive, yalnız şema)
-- CaseInstrument = hukuki dayanak evrakı (kanonik) · ClaimItem = parasal yansıma; bağ = ClaimItem.instrumentId
-- onDelete: CaseInstrument.caseId = CASCADE (case silinince evrak da silinir, AS2);
--           ClaimItem.instrumentId = SET NULL (evrak silinse de parasal kalem yaşar).
-- NOT: migrate diff'teki alakasız "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc"
-- KASTEN dahil edilmedi (mevcut drift; önceki migration'larla aynı).

-- AlterTable
ALTER TABLE "ClaimItem" ADD COLUMN     "instrumentId" TEXT;

-- CreateIndex
CREATE INDEX "ClaimItem_instrumentId_idx" ON "ClaimItem"("instrumentId");

-- AddForeignKey
ALTER TABLE "ClaimItem" ADD CONSTRAINT "ClaimItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "CaseInstrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseInstrument" ADD CONSTRAINT "CaseInstrument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
