-- C3-B01 (§13/5 K5.3-K5.5, decision-log 2026-08-03) — KVKK md.5/1 açık rıza kaydı
-- (ClientConsent) + isteğe bağlı iletişim varsayılanlarının kapatılması.
-- PRODUCTION APPLY: WAVE 4 / C3-PROD-ACTIVATION (ayrı owner yetkisi) — bu dosya
-- engineering teslimidir; bu görevde canlı DB'ye UYGULANMAZ.

-- CreateEnum
CREATE TYPE "ClientConsentStatus" AS ENUM ('GRANTED', 'REVOKED');

-- CreateTable
CREATE TABLE "ClientConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "status" "ClientConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "revokedByUserId" TEXT,
    "source" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientConsent_id_tenantId_key" ON "ClientConsent"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ClientConsent_tenantId_clientId_activity_status_idx" ON "ClientConsent"("tenantId", "clientId", "activity", "status");

-- CreateIndex
CREATE INDEX "ClientConsent_tenantId_idx" ON "ClientConsent"("tenantId");

-- CreateIndex
CREATE INDEX "ClientConsent_clientId_idx" ON "ClientConsent"("clientId");

-- AddForeignKey (tenant kanıtı DB seviyesinde — ClientPoaTenant deseni)
ALTER TABLE "ClientConsent" ADD CONSTRAINT "ClientConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (composite: cross-tenant consent↔client bağı imkânsız)
ALTER TABLE "ClientConsent" ADD CONSTRAINT "ClientConsent_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable — K5.3: yeni kayıtların isteğe bağlı iletişim varsayılanı FALSE
ALTER TABLE "Client" ALTER COLUMN "sendBirthdayGreeting" SET DEFAULT false;
ALTER TABLE "Client" ALTER COLUMN "sendAnniversaryGreeting" SET DEFAULT false;
ALTER TABLE "Client" ALTER COLUMN "sendHolidayGreeting" SET DEFAULT false;

-- Data — K5.5: mevcut müvekkiller için zorunlu olmayan iletişimler DERHAL kapalıdır.
-- Bu, ratifiye edilmiş geri dönüşsüz tercih sıfırlamasıdır ("mevcut default true
-- korunmaz"); go-forward rıza kaynağı ClientConsent kaydıdır.
UPDATE "Client"
SET "sendBirthdayGreeting" = false,
    "sendAnniversaryGreeting" = false,
    "sendHolidayGreeting" = false
WHERE "sendBirthdayGreeting" = true
   OR "sendAnniversaryGreeting" = true
   OR "sendHolidayGreeting" = true;
