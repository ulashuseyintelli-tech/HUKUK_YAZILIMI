-- C3-B02 (§13/6 K6.1-K6.5, decision-log 2026-08-03) — aydınlatma versiyon+teslim kaydı
-- ve ilgili kişi başvuru (DSAR) statü makinesi.
-- PRODUCTION APPLY: WAVE 4 / C3-PROD-ACTIVATION (ayrı owner yetkisi) — engineering teslimi.

-- CreateEnum
CREATE TYPE "ClientDataSubjectRequestType" AS ENUM ('ACCESS_CONFIRMATION', 'INFORMATION', 'PURPOSE_REVIEW', 'THIRD_PARTY_DISCLOSURE', 'RECTIFICATION', 'ERASURE', 'THIRD_PARTY_NOTIFICATION', 'AUTOMATED_DECISION_OBJECTION', 'DAMAGES');

-- CreateEnum
CREATE TYPE "ClientDataSubjectRequestStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'RESPONDED');

-- CreateTable
CREATE TABLE "ClientDisclosureText" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDisclosureText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDisclosureDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "disclosureTextId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "deliveredByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDisclosureDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDataSubjectRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ClientDataSubjectRequestType" NOT NULL,
    "status" "ClientDataSubjectRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "channel" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "assignedToUserId" TEXT,
    "summary" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" TEXT,
    "responseNote" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientDisclosureText_tenantId_version_key" ON "ClientDisclosureText"("tenantId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDisclosureText_id_tenantId_key" ON "ClientDisclosureText"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ClientDisclosureText_tenantId_idx" ON "ClientDisclosureText"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDisclosureDelivery_id_tenantId_key" ON "ClientDisclosureDelivery"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ClientDisclosureDelivery_tenantId_clientId_idx" ON "ClientDisclosureDelivery"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "ClientDisclosureDelivery_tenantId_idx" ON "ClientDisclosureDelivery"("tenantId");

-- CreateIndex
CREATE INDEX "ClientDisclosureDelivery_clientId_idx" ON "ClientDisclosureDelivery"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDataSubjectRequest_id_tenantId_key" ON "ClientDataSubjectRequest"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ClientDataSubjectRequest_tenantId_status_dueAt_idx" ON "ClientDataSubjectRequest"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ClientDataSubjectRequest_tenantId_clientId_idx" ON "ClientDataSubjectRequest"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "ClientDataSubjectRequest_tenantId_idx" ON "ClientDataSubjectRequest"("tenantId");

-- CreateIndex
CREATE INDEX "ClientDataSubjectRequest_clientId_idx" ON "ClientDataSubjectRequest"("clientId");

-- AddForeignKey
ALTER TABLE "ClientDisclosureText" ADD CONSTRAINT "ClientDisclosureText_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDisclosureDelivery" ADD CONSTRAINT "ClientDisclosureDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDisclosureDelivery" ADD CONSTRAINT "ClientDisclosureDelivery_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (teslim kanıtı metin versiyonuna bağlı — versiyon silinemez: RESTRICT)
ALTER TABLE "ClientDisclosureDelivery" ADD CONSTRAINT "ClientDisclosureDelivery_disclosureTextId_tenantId_fkey" FOREIGN KEY ("disclosureTextId", "tenantId") REFERENCES "ClientDisclosureText"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDataSubjectRequest" ADD CONSTRAINT "ClientDataSubjectRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDataSubjectRequest" ADD CONSTRAINT "ClientDataSubjectRequest_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
