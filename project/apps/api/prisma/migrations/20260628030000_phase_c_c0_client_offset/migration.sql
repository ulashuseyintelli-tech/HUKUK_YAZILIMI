-- TM3 Faz C C-0 — ClientOffset persistence foundation.
-- ADR: docs/finance/adr-client-offset-cross-ledger-settlement.md
-- YALNIZ persistence (tablo + enum + constraint/index). apply/reverse/outstanding/statement/audit/approval
-- LOGIC'i YOK → hiçbir runtime davranış değişmez. APPLY yalnız owner açık "uygula" (prisma migrate deploy) ile.
-- Non-destructive + additive: mevcut tablo/veri etkilenmez; backfill YOK.

-- CreateEnum
CREATE TYPE "ClientOffsetKind" AS ENUM ('APPLY', 'REVERSAL');

-- AlterEnum — 4 yeni statement satır tipi. YALNIZ EKLENİR; bu migration'da KULLANILMAZ (veri/satır üretmez).
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CLIENT_OFFSET_PAYABLE_APPLIED';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CLIENT_OFFSET_EXPENSE_APPLIED';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CLIENT_OFFSET_PAYABLE_REVERSED';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CLIENT_OFFSET_EXPENSE_REVERSED';

-- CreateTable
CREATE TABLE "ClientOffset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "kind" "ClientOffsetKind" NOT NULL,
    "payableCaseId" TEXT NOT NULL,
    "payableCaseClientId" TEXT NOT NULL,
    "expenseCaseId" TEXT NOT NULL,
    "expenseRequestId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "approvalRef" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "reason" TEXT,
    "reversesOffsetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOffset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientOffset_tenantId_idempotencyKey_key" ON "ClientOffset"("tenantId", "idempotencyKey");

-- Double-reversal guard: bir APPLY en fazla bir kez reverse edilir.
-- Postgres: NULL'lar distinct sayılır → reversesOffsetId=NULL olan APPLY satırları bu unique'e takılmaz.
CREATE UNIQUE INDEX "ClientOffset_tenantId_reversesOffsetId_key" ON "ClientOffset"("tenantId", "reversesOffsetId");

-- CreateIndex
CREATE INDEX "ClientOffset_tenantId_clientId_currency_kind_idx" ON "ClientOffset"("tenantId", "clientId", "currency", "kind");
CREATE INDEX "ClientOffset_payableCaseClientId_idx" ON "ClientOffset"("payableCaseClientId");
CREATE INDEX "ClientOffset_expenseRequestId_idx" ON "ClientOffset"("expenseRequestId");
CREATE INDEX "ClientOffset_createdAt_idx" ON "ClientOffset"("createdAt");

-- CHECK constraints (Prisma şema dili CHECK desteklemez → raw SQL; Prisma drift bunları izlemez).
-- amount > 0
ALTER TABLE "ClientOffset" ADD CONSTRAINT "ClientOffset_amount_positive_chk" CHECK ("amount" > 0);
-- kind ↔ reversesOffsetId tutarlılığı: APPLY → null, REVERSAL → not null
ALTER TABLE "ClientOffset" ADD CONSTRAINT "ClientOffset_kind_reverses_chk" CHECK (
  ("kind" = 'APPLY' AND "reversesOffsetId" IS NULL)
  OR ("kind" = 'REVERSAL' AND "reversesOffsetId" IS NOT NULL)
);
