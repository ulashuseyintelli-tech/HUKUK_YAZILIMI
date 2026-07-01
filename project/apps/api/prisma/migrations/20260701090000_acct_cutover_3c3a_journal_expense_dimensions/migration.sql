-- ACCT-CUTOVER-3C3A - AccountingJournalLine expense dimension schema gate.
-- Additive nullable scalar dimensions only; no source enum, posting, FK, or cutover behavior.

ALTER TABLE "AccountingJournalLine"
  ADD COLUMN "expenseRequestId" TEXT,
  ADD COLUMN "expensePaymentId" TEXT,
  ADD COLUMN "expenseApplicationId" TEXT;

CREATE INDEX "AccountingJournalLine_expenseRequestId_idx" ON "AccountingJournalLine"("expenseRequestId");
CREATE INDEX "AccountingJournalLine_expensePaymentId_idx" ON "AccountingJournalLine"("expensePaymentId");
CREATE INDEX "AccountingJournalLine_expenseApplicationId_idx" ON "AccountingJournalLine"("expenseApplicationId");
