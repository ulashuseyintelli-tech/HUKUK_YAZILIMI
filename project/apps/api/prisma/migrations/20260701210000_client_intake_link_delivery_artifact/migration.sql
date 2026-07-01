CREATE TYPE "ClientIntakeLinkDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "ClientIntakeLinkDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "intakeLinkId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" "ClientIntakeLinkDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "notificationId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientIntakeLinkDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientIntakeLinkDelivery_tenantId_idempotencyKey_key" ON "ClientIntakeLinkDelivery"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "ClientIntakeLinkDelivery_tenantId_dedupeKey_key" ON "ClientIntakeLinkDelivery"("tenantId", "dedupeKey");
CREATE UNIQUE INDEX "ClientIntakeLinkDelivery_intakeLinkId_channel_key" ON "ClientIntakeLinkDelivery"("intakeLinkId", "channel");
CREATE INDEX "ClientIntakeLinkDelivery_tenantId_idx" ON "ClientIntakeLinkDelivery"("tenantId");
CREATE INDEX "ClientIntakeLinkDelivery_clientId_idx" ON "ClientIntakeLinkDelivery"("clientId");
CREATE INDEX "ClientIntakeLinkDelivery_caseId_idx" ON "ClientIntakeLinkDelivery"("caseId");
CREATE INDEX "ClientIntakeLinkDelivery_intakeLinkId_idx" ON "ClientIntakeLinkDelivery"("intakeLinkId");
CREATE INDEX "ClientIntakeLinkDelivery_notificationId_idx" ON "ClientIntakeLinkDelivery"("notificationId");
CREATE INDEX "ClientIntakeLinkDelivery_status_idx" ON "ClientIntakeLinkDelivery"("status");

ALTER TABLE "ClientIntakeLinkDelivery" ADD CONSTRAINT "ClientIntakeLinkDelivery_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientIntakeLinkDelivery" ADD CONSTRAINT "ClientIntakeLinkDelivery_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientIntakeLinkDelivery" ADD CONSTRAINT "ClientIntakeLinkDelivery_intakeLinkId_fkey" FOREIGN KEY ("intakeLinkId") REFERENCES "ClientIntakeLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientIntakeLinkDelivery" ADD CONSTRAINT "ClientIntakeLinkDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "ClientNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;