-- ACCT-CUTOVER-3E4B2H1: Raw Collection cash journal source contract skeleton.
-- Contract only: no live write, no backfill write, no primary summary switch.
ALTER TYPE "AccountingJournalEntryType" ADD VALUE 'COLLECTION_CASH_RECEIPT_RECORDED';
ALTER TYPE "AccountingJournalEntryType" ADD VALUE 'COLLECTION_CASH_RECEIPT_REVERSED';
ALTER TYPE "AccountingJournalSourceType" ADD VALUE 'COLLECTION';
ALTER TYPE "AccountingAccountCode" ADD VALUE 'CASE_COLLECTION_CLEARING';