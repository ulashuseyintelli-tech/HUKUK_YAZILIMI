-- ACCT-CUTOVER-3C3B1 ExpenseRequest journal source contract skeleton.
-- Additive enum-only migration; no runtime posting, backfill, or primary switch.

ALTER TYPE "AccountingJournalEntryType" ADD VALUE 'EXPENSE_REQUEST_RECORDED';
ALTER TYPE "AccountingJournalEntryType" ADD VALUE 'EXPENSE_REQUEST_CANCELLED';
ALTER TYPE "AccountingJournalSourceType" ADD VALUE 'EXPENSE_REQUEST';
