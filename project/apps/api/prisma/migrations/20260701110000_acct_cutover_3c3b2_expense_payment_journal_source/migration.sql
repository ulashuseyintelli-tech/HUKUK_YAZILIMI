-- ACCT-CUTOVER-3C3B2 ExpensePayment journal source contract skeleton.
-- Additive enum-only migration; no runtime posting, reversal/refund, backfill, or primary switch.

ALTER TYPE "AccountingJournalEntryType" ADD VALUE 'EXPENSE_PAYMENT_RECORDED';
ALTER TYPE "AccountingJournalSourceType" ADD VALUE 'EXPENSE_PAYMENT';
