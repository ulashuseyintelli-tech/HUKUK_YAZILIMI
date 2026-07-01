-- ACCT-CUTOVER-3C3B3 Expense application journal source contract skeleton.
-- Additive enum-only migration; no runtime posting, reversal wiring, backfill, or primary switch.

ALTER TYPE "AccountingJournalEntryType" ADD VALUE 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED';
ALTER TYPE "AccountingJournalEntryType" ADD VALUE 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED';
ALTER TYPE "AccountingJournalSourceType" ADD VALUE 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION';