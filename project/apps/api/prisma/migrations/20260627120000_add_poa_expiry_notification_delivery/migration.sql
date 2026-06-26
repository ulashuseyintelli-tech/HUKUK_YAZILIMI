CREATE TYPE "PoaExpiryDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "PoaExpiryRecipientSource" AS ENUM ('PRIMARY_ATTORNEY', 'POA_ATTORNEY', 'ESCALATION_MANAGER', 'ADMIN_FALLBACK');

CREATE TABLE "PoaExpiryNotificationDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poaId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientSource" "PoaExpiryRecipientSource" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "status" "PoaExpiryDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "reservedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoaExpiryNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PoaExpiryNotificationDelivery_dedupeKey_key" ON "PoaExpiryNotificationDelivery"("dedupeKey");
CREATE INDEX "PoaExpiryNotificationDelivery_tenantId_status_createdAt_idx" ON "PoaExpiryNotificationDelivery"("tenantId", "status", "createdAt");
CREATE INDEX "PoaExpiryNotificationDelivery_tenantId_poaId_idx" ON "PoaExpiryNotificationDelivery"("tenantId", "poaId");
CREATE INDEX "PoaExpiryNotificationDelivery_tenantId_clientId_idx" ON "PoaExpiryNotificationDelivery"("tenantId", "clientId");

ALTER TABLE "PoaExpiryNotificationDelivery" ADD CONSTRAINT "PoaExpiryNotificationDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoaExpiryNotificationDelivery" ADD CONSTRAINT "PoaExpiryNotificationDelivery_poaId_fkey" FOREIGN KEY ("poaId") REFERENCES "ClientPowerOfAttorney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoaExpiryNotificationDelivery" ADD CONSTRAINT "PoaExpiryNotificationDelivery_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;