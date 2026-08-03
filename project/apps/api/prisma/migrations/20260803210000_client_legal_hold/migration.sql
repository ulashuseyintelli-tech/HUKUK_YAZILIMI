-- C3-B03 (§13/8 K8.3-K8.4, decision-log 2026-08-03) — LEGAL HOLD kaydı.
-- K8.1/K8.5: saklama süresi ve silme yöntemi SEÇİLMEDİ — bu migration hiçbir veri silmez;
-- scheduler/otomatik silme YOKTUR. PRODUCTION APPLY: WAVE 4 / C3-PROD-ACTIVATION.

-- CreateEnum
CREATE TYPE "ClientLegalHoldStatus" AS ENUM ('ACTIVE', 'RELEASE_REQUESTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ClientLegalHoldScopeType" AS ENUM ('CLIENT', 'CASE', 'RECORD_FAMILY');

-- CreateTable
CREATE TABLE "ClientLegalHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopeType" "ClientLegalHoldScopeType" NOT NULL,
    "caseId" TEXT,
    "recordFamily" TEXT,
    "status" "ClientLegalHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "placedByUserId" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "releaseReason" TEXT,
    "releaseRequestedByUserId" TEXT,
    "releaseRequestedAt" TIMESTAMP(3),
    "releasedByUserId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientLegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientLegalHold_id_tenantId_key" ON "ClientLegalHold"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ClientLegalHold_tenantId_clientId_status_idx" ON "ClientLegalHold"("tenantId", "clientId", "status");

-- CreateIndex
CREATE INDEX "ClientLegalHold_tenantId_status_idx" ON "ClientLegalHold"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClientLegalHold_tenantId_idx" ON "ClientLegalHold"("tenantId");

-- CreateIndex
CREATE INDEX "ClientLegalHold_clientId_idx" ON "ClientLegalHold"("clientId");

-- AddForeignKey
ALTER TABLE "ClientLegalHold" ADD CONSTRAINT "ClientLegalHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (hold kanıtı müvekkil silinerek kaybedilemez: RESTRICT)
ALTER TABLE "ClientLegalHold" ADD CONSTRAINT "ClientLegalHold_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
