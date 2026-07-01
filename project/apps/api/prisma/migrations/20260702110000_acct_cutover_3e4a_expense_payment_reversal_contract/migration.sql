-- ACCT-CUTOVER-3E4A ExpensePayment reversal domain contract skeleton.
-- Durable idempotency and correlation substrate only; no runtime refund, backfill write, or primary switch.

CREATE TYPE "ExpensePaymentReversalKind" AS ENUM ('REVERSAL');

CREATE TYPE "ExpensePaymentReversalStatus" AS ENUM (
  'PENDING',
  'JOURNAL_REVERSED',
  'BALANCE_REVERSED',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "ExpensePaymentReversal" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "expensePaymentId" TEXT NOT NULL,
  "expenseRequestId" TEXT NOT NULL,
  "kind" "ExpensePaymentReversalKind" NOT NULL DEFAULT 'REVERSAL',
  "status" "ExpensePaymentReversalStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(15,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "originalJournalEntryId" TEXT NOT NULL,
  "reversalJournalEntryId" TEXT,
  "originalBalanceLedgerId" TEXT,
  "reversalBalanceLedgerId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpensePaymentReversal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpensePaymentReversal_originalJournalEntryId_key" ON "ExpensePaymentReversal"("originalJournalEntryId");
CREATE UNIQUE INDEX "ExpensePaymentReversal_reversalJournalEntryId_key" ON "ExpensePaymentReversal"("reversalJournalEntryId");
CREATE UNIQUE INDEX "ExpensePaymentReversal_originalBalanceLedgerId_key" ON "ExpensePaymentReversal"("originalBalanceLedgerId");
CREATE UNIQUE INDEX "ExpensePaymentReversal_reversalBalanceLedgerId_key" ON "ExpensePaymentReversal"("reversalBalanceLedgerId");
CREATE UNIQUE INDEX "ExpensePaymentReversal_tenantId_expensePaymentId_kind_key" ON "ExpensePaymentReversal"("tenantId", "expensePaymentId", "kind");
CREATE UNIQUE INDEX "ExpensePaymentReversal_tenantId_idempotencyKey_key" ON "ExpensePaymentReversal"("tenantId", "idempotencyKey");
CREATE INDEX "ExpensePaymentReversal_tenantId_idx" ON "ExpensePaymentReversal"("tenantId");
CREATE INDEX "ExpensePaymentReversal_expensePaymentId_idx" ON "ExpensePaymentReversal"("expensePaymentId");
CREATE INDEX "ExpensePaymentReversal_expenseRequestId_idx" ON "ExpensePaymentReversal"("expenseRequestId");
CREATE INDEX "ExpensePaymentReversal_tenantId_status_idx" ON "ExpensePaymentReversal"("tenantId", "status");
CREATE INDEX "ExpensePaymentReversal_requestedAt_idx" ON "ExpensePaymentReversal"("requestedAt");

ALTER TABLE "ExpensePaymentReversal"
  ADD CONSTRAINT "ExpensePaymentReversal_expensePaymentId_fkey"
  FOREIGN KEY ("expensePaymentId") REFERENCES "ExpensePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpensePaymentReversal"
  ADD CONSTRAINT "ExpensePaymentReversal_expenseRequestId_fkey"
  FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpensePaymentReversal"
  ADD CONSTRAINT "ExpensePaymentReversal_originalJournalEntryId_fkey"
  FOREIGN KEY ("originalJournalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpensePaymentReversal"
  ADD CONSTRAINT "ExpensePaymentReversal_reversalJournalEntryId_fkey"
  FOREIGN KEY ("reversalJournalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpensePaymentReversal"
  ADD CONSTRAINT "ExpensePaymentReversal_originalBalanceLedgerId_fkey"
  FOREIGN KEY ("originalBalanceLedgerId") REFERENCES "BalanceLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpensePaymentReversal"
  ADD CONSTRAINT "ExpensePaymentReversal_reversalBalanceLedgerId_fkey"
  FOREIGN KEY ("reversalBalanceLedgerId") REFERENCES "BalanceLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;