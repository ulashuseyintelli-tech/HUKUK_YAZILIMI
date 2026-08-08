-- X3-B02 / C3 — Persistent client statement delivery claim and retry ledger.
-- PDF/Buffer/body content is deliberately absent. Production apply and feature-flag
-- activation are separate owner-gated production work (ACTIVATION_PENDING).

-- CreateEnum
CREATE TYPE "ClientStatementDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- ClientStatement gets a tenant+client scoped candidate key so a delivery row cannot
-- reference a statement belonging to another tenant or client.
CREATE UNIQUE INDEX "ClientStatement_id_tenantId_clientId_key"
  ON "ClientStatement"("id", "tenantId", "clientId");

-- CreateTable
CREATE TABLE "ClientStatementDeliveryLedger" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "ClientStatementDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "reservedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientStatementDeliveryLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementDeliveryLedger_dedupeKey_key"
  ON "ClientStatementDeliveryLedger"("dedupeKey");

CREATE INDEX "ClientStatementDeliveryLedger_tenantId_status_idx"
  ON "ClientStatementDeliveryLedger"("tenantId", "status");

CREATE INDEX "ClientStatementDeliveryLedger_tenantId_clientId_idx"
  ON "ClientStatementDeliveryLedger"("tenantId", "clientId");

-- AddForeignKey
ALTER TABLE "ClientStatementDeliveryLedger"
  ADD CONSTRAINT "ClientStatementDeliveryLedger_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientStatementDeliveryLedger"
  ADD CONSTRAINT "ClientStatementDeliveryLedger_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientStatementDeliveryLedger"
  ADD CONSTRAINT "ClientStmtDelivery_statement_scope_fkey"
  FOREIGN KEY ("statementId", "tenantId", "clientId")
  REFERENCES "ClientStatement"("id", "tenantId", "clientId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
