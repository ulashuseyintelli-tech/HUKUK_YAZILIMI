-- C3-B04 (§13/7 K7.1-K7.5, decision-log 2026-08-03) — ÖZEL NİTELİKLİ VERİ korumalı kaydı.
-- İçerik uygulama seviyesinde AES-256-GCM şifreli saklanır; düz metin kolonu YOKTUR.
-- K7.4 mevcut-veri taraması BU MIGRATION'DA YOK (yalnız WAVE 4 read-only, ayrı yetki).
-- PRODUCTION APPLY: WAVE 4 / C3-PROD-ACTIVATION (ayrı owner yetkisi) — engineering teslimi.

-- CreateEnum
CREATE TYPE "ClientSpecialDataCategory" AS ENUM ('RACE_ETHNIC_ORIGIN', 'POLITICAL_OPINION', 'PHILOSOPHICAL_BELIEF', 'RELIGION_SECT', 'APPEARANCE_DRESS', 'ASSOCIATION_FOUNDATION_UNION_MEMBERSHIP', 'HEALTH', 'SEXUAL_LIFE', 'CRIMINAL_CONVICTION_SECURITY_MEASURES', 'BIOMETRIC', 'GENETIC');

-- CreateTable
CREATE TABLE "ClientSpecialCategoryRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "category" "ClientSpecialDataCategory" NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientSpecialCategoryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientSpecialCategoryRecord_id_tenantId_key" ON "ClientSpecialCategoryRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ClientSpecialCategoryRecord_tenantId_clientId_category_idx" ON "ClientSpecialCategoryRecord"("tenantId", "clientId", "category");

-- CreateIndex
CREATE INDEX "ClientSpecialCategoryRecord_tenantId_idx" ON "ClientSpecialCategoryRecord"("tenantId");

-- CreateIndex
CREATE INDEX "ClientSpecialCategoryRecord_clientId_idx" ON "ClientSpecialCategoryRecord"("clientId");

-- AddForeignKey
ALTER TABLE "ClientSpecialCategoryRecord" ADD CONSTRAINT "ClientSpecialCategoryRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (özel nitelikli kayıt, müvekkil silinerek dolaylı kaybedilemez: RESTRICT)
ALTER TABLE "ClientSpecialCategoryRecord" ADD CONSTRAINT "ClientSpecialCategoryRecord_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
