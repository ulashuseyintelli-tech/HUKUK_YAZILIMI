-- PR-D4e-1: Borçlu saha istihbaratı ALTYAPISI. "Bu adreste fiilen ne var?" → borçlu-anchored +
-- adres-referanslı. Task = iş emri (subtype=DEBTOR_INTELLIGENCE); DebtorIntelligence = SONUÇ+KANIT.
-- Task'a addressId (görev hangi adres için). ADDITIVE: yeni tablo+enum+nullable kolon. Tetik/UI/skor YOK.
-- onDelete: Debtor CASCADE (borçlu yoksa istihbarat anlamsız) · Address/Case SET NULL (iz kalır).
-- NOT: DB apply (migrate deploy) ayrı; prod N/A.

-- Enums
CREATE TYPE "DebtorIntelType" AS ENUM ('LOCATION_VERIFICATION', 'ACTIVITY_CHECK', 'ASSET_SIGHTING', 'NEIGHBOR_CONFIRM');
CREATE TYPE "DebtorIntelResult" AS ENUM ('PENDING_VERIFICATION', 'IN_FIELD', 'VERIFIED_PRESENT', 'VERIFIED_ABSENT', 'INCONCLUSIVE', 'NOT_FOUND');

-- Task.addressId (istihbarat görevi hangi adres için; adres silinirse görev kalır)
ALTER TABLE "Task" ADD COLUMN "addressId" TEXT;
CREATE INDEX "Task_addressId_idx" ON "Task"("addressId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "DebtorAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DebtorIntelligence (sonuç+kanıt)
CREATE TABLE "DebtorIntelligence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "addressId" TEXT,
    "caseId" TEXT,
    "intelType" "DebtorIntelType" NOT NULL,
    "result" "DebtorIntelResult" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "confidence" INTEGER,
    "evidence" JSONB,
    "note" TEXT,
    "createdById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtorIntelligence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtorIntelligence_tenantId_debtorId_idx" ON "DebtorIntelligence"("tenantId", "debtorId");
CREATE INDEX "DebtorIntelligence_addressId_idx" ON "DebtorIntelligence"("addressId");
CREATE INDEX "DebtorIntelligence_caseId_idx" ON "DebtorIntelligence"("caseId");
CREATE INDEX "DebtorIntelligence_debtorId_createdAt_idx" ON "DebtorIntelligence"("debtorId", "createdAt");

ALTER TABLE "DebtorIntelligence" ADD CONSTRAINT "DebtorIntelligence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtorIntelligence" ADD CONSTRAINT "DebtorIntelligence_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtorIntelligence" ADD CONSTRAINT "DebtorIntelligence_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "DebtorAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DebtorIntelligence" ADD CONSTRAINT "DebtorIntelligence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DebtorIntelligence" ADD CONSTRAINT "DebtorIntelligence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
