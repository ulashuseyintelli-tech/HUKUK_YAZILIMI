-- Faz 4.0: ClientIntelStatement — müvekkil yumuşak-istihbarat beyanı (immutable/append-only, additive)
-- NOT: migrate diff'teki alakasız "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc"
-- satırı KASTEN dahil edilmedi (mevcut drift; Faz 2/3 ile aynı).

-- CreateEnum
CREATE TYPE "ClientIntelCategory" AS ENUM ('INCOME_SOURCE', 'COMMERCIAL_RELATION', 'FAMILY_CIRCLE', 'DIGITAL_FOOTPRINT', 'PAYMENT_HISTORY', 'STRATEGY');

-- CreateEnum
CREATE TYPE "ClientIntelSource" AS ENUM ('CLIENT_DECLARATION');

-- CreateEnum
CREATE TYPE "ClientIntelConfidence" AS ENUM ('DECLARED');

-- CreateEnum
CREATE TYPE "ClientIntelStatus" AS ENUM ('ACTIVE', 'RETRACTED', 'SUPERSEDED', 'FALSE_POSITIVE');

-- CreateTable
CREATE TABLE "ClientIntelStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "category" "ClientIntelCategory" NOT NULL,
    "label" TEXT,
    "value" TEXT NOT NULL,
    "note" TEXT,
    "source" "ClientIntelSource" NOT NULL DEFAULT 'CLIENT_DECLARATION',
    "confidence" "ClientIntelConfidence" NOT NULL DEFAULT 'DECLARED',
    "status" "ClientIntelStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lifecycleNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientIntelStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientIntelStatement_tenantId_debtorId_idx" ON "ClientIntelStatement"("tenantId", "debtorId");

-- CreateIndex
CREATE INDEX "ClientIntelStatement_caseId_idx" ON "ClientIntelStatement"("caseId");

-- CreateIndex
CREATE INDEX "ClientIntelStatement_debtorId_status_idx" ON "ClientIntelStatement"("debtorId", "status");

-- CreateIndex
CREATE INDEX "ClientIntelStatement_status_idx" ON "ClientIntelStatement"("status");

-- CreateIndex
CREATE INDEX "ClientIntelStatement_createdAt_idx" ON "ClientIntelStatement"("createdAt");

-- AddForeignKey
ALTER TABLE "ClientIntelStatement" ADD CONSTRAINT "ClientIntelStatement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIntelStatement" ADD CONSTRAINT "ClientIntelStatement_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
