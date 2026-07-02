CREATE TYPE "ClientDocumentRequestStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "ClientDocumentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "requestedDocumentCodes" TEXT[],
    "templateCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" "ClientDocumentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notificationId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDocumentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientDocumentRequest_tenantId_idempotencyKey_key" ON "ClientDocumentRequest"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "ClientDocumentRequest_tenantId_dedupeKey_key" ON "ClientDocumentRequest"("tenantId", "dedupeKey");
CREATE INDEX "ClientDocumentRequest_tenantId_idx" ON "ClientDocumentRequest"("tenantId");
CREATE INDEX "ClientDocumentRequest_clientId_idx" ON "ClientDocumentRequest"("clientId");
CREATE INDEX "ClientDocumentRequest_caseId_idx" ON "ClientDocumentRequest"("caseId");
CREATE INDEX "ClientDocumentRequest_notificationId_idx" ON "ClientDocumentRequest"("notificationId");
CREATE INDEX "ClientDocumentRequest_status_idx" ON "ClientDocumentRequest"("status");
CREATE INDEX "ClientDocumentRequest_tenantId_clientId_status_createdAt_idx" ON "ClientDocumentRequest"("tenantId", "clientId", "status", "createdAt");

ALTER TABLE "ClientDocumentRequest" ADD CONSTRAINT "ClientDocumentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientDocumentRequest" ADD CONSTRAINT "ClientDocumentRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientDocumentRequest" ADD CONSTRAINT "ClientDocumentRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientDocumentRequest" ADD CONSTRAINT "ClientDocumentRequest_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "ClientNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;