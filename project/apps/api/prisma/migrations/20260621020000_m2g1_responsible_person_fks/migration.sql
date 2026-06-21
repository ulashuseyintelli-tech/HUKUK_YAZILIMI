-- M2-G1: Dosya Sorumlusu = gerçek kişi (Lawyer XOR StaffMember).
-- Additive: 2 nullable FK + index + DB CHECK. sorumluPersonelId DOKUNULMADI. Data backfill YOK.
-- NOT: pre-existing "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc" drift KASITLI HARİÇ
--      tutuldu (bu migration'a ait değil; raw-desc-index drift'i, D-G0/D-G3a ile aynı gerekçe).

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "responsibleLawyerId" TEXT,
ADD COLUMN     "responsibleStaffId" TEXT;

-- CreateIndex
CREATE INDEX "Case_responsibleLawyerId_idx" ON "Case"("responsibleLawyerId");

-- CreateIndex
CREATE INDEX "Case_responsibleStaffId_idx" ON "Case"("responsibleStaffId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_responsibleLawyerId_fkey" FOREIGN KEY ("responsibleLawyerId") REFERENCES "Lawyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_responsibleStaffId_fkey" FOREIGN KEY ("responsibleStaffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DB CHECK (M2-G1 kararı): ikisi birden dolu OLAMAZ; ikisi de NULL olabilir (legacy/sahipsiz geçişi).
-- exactly-one zorunluluğu uygulama katmanında M2-G3'te gelir; DB yalnız "both-set yasak" garantisi verir.
ALTER TABLE "Case" ADD CONSTRAINT "Case_responsible_person_not_both"
  CHECK (NOT ("responsibleLawyerId" IS NOT NULL AND "responsibleStaffId" IS NOT NULL));
