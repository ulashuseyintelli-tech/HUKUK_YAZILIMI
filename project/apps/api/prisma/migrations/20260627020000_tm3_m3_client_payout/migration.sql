-- TM3 M3 — ClientPayout (müvekkile ödeme kaydı, DAR model) + CLIENT_PAYOUT_SENT statement line tipi.
-- NOT: Bu migration PR'da kalır; shared/dev DB'ye apply için ayrı "uygula" talimatı beklenir.
-- D1: payout = ClientPayout + CLIENT_PAYOUT_SENT; BalanceLedger DEĞİL. ClientPayout LEDGER DEĞİLDİR.

-- CreateEnum
CREATE TYPE "ClientPayoutStatus" AS ENUM ('RECORDED');

-- AlterEnum: payout statement satırı (proceeds tarafı debit)
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CLIENT_PAYOUT_SENT';

-- CreateTable
CREATE TABLE "ClientPayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseClientId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "ClientPayoutStatus" NOT NULL DEFAULT 'RECORDED',
    "idempotencyKey" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (tenant-scoped idempotency)
CREATE UNIQUE INDEX "ClientPayout_tenantId_idempotencyKey_key" ON "ClientPayout"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ClientPayout_tenantId_caseId_caseClientId_idx" ON "ClientPayout"("tenantId", "caseId", "caseClientId");

-- CreateIndex
CREATE INDEX "ClientPayout_tenantId_caseId_paidAt_idx" ON "ClientPayout"("tenantId", "caseId", "paidAt");
