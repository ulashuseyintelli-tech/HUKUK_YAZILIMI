-- CreateTable
CREATE TABLE "LegalTimeShadowDiff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sourceTebligatId" TEXT,
    "legacySource" TEXT NOT NULL,
    "canonicalSource" TEXT NOT NULL,
    "legacyDate" TIMESTAMP(3),
    "canonicalDate" TIMESTAMP(3),
    "deltaDays" INTEGER,
    "reasonCode" TEXT NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalTimeShadowDiff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalTimeShadowDiff_tenantId_idx" ON "LegalTimeShadowDiff"("tenantId");

-- CreateIndex
CREATE INDEX "LegalTimeShadowDiff_caseId_idx" ON "LegalTimeShadowDiff"("caseId");

-- CreateIndex
CREATE INDEX "LegalTimeShadowDiff_sourceTebligatId_idx" ON "LegalTimeShadowDiff"("sourceTebligatId");

-- CreateIndex
CREATE INDEX "LegalTimeShadowDiff_tenantId_createdAt_idx" ON "LegalTimeShadowDiff"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "LegalTimeShadowDiff" ADD CONSTRAINT "LegalTimeShadowDiff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalTimeShadowDiff" ADD CONSTRAINT "LegalTimeShadowDiff_sourceTebligatId_fkey" FOREIGN KEY ("sourceTebligatId") REFERENCES "Tebligat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
