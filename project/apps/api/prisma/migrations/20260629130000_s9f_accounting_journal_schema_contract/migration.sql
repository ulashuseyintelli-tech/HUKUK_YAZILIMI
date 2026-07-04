-- S9F - AccountingJournalEntry / AccountingJournalLine schema contract.
-- Additive only: no live posting service, no controller, no endpoint, no backfill.
-- Existing LedgerEntry/LedgerAllocation remain TBK100/legal allocation ledger.

-- CreateEnum
CREATE TYPE "AccountingJournalEntryType" AS ENUM (
    'COLLECTION_DISTRIBUTION_POSTED',
    'CLIENT_PAYOUT_RECORDED',
    'CLIENT_OFFSET_APPLIED',
    'CLIENT_OFFSET_REVERSED',
    'CLIENT_ADVANCE_LEDGER_RECORDED',
    'ACCOUNTING_JOURNAL_REVERSAL'
);

-- CreateEnum
CREATE TYPE "AccountingJournalSourceType" AS ENUM (
    'COLLECTION_DISPOSITION_LINE',
    'CLIENT_PAYOUT',
    'CLIENT_OFFSET',
    'BALANCE_LEDGER',
    'ACCOUNTING_JOURNAL_ENTRY'
);

-- CreateEnum
CREATE TYPE "AccountingAccountCode" AS ENUM (
    'CASH_CLEARING',
    'CLIENT_PAYABLE',
    'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE',
    'CLIENT_EXPENSE_RECEIVABLE',
    'ATTORNEY_FEE_REVENUE',
    'FIRM_EXPENSE_REIMBURSEMENT',
    'CLIENT_ADVANCE_BALANCE'
);

-- CreateEnum
CREATE TYPE "AccountingJournalDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "AccountingJournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "entryType" "AccountingJournalEntryType" NOT NULL,
    "sourceType" "AccountingJournalSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceAction" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceHash" TEXT,
    "metadata" JSONB,
    "sourceOccurredAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedById" TEXT,
    "reversalOfEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingJournalLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "accountCode" "AccountingAccountCode" NOT NULL,
    "direction" "AccountingJournalDirection" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "caseId" TEXT,
    "clientId" TEXT,
    "caseClientId" TEXT,
    "collectionId" TEXT,
    "dispositionLineId" TEXT,
    "payoutId" TEXT,
    "offsetId" TEXT,
    "balanceLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: append-only idempotency and source guards.
CREATE UNIQUE INDEX "AccountingJournalEntry_tenantId_idempotencyKey_key" ON "AccountingJournalEntry"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "accounting_journal_entry_source_unique" ON "AccountingJournalEntry"("tenantId", "sourceType", "sourceId", "sourceAction");
CREATE UNIQUE INDEX "AccountingJournalEntry_reversalOfEntryId_key" ON "AccountingJournalEntry"("reversalOfEntryId");

-- CreateIndex: entry query dimensions.
CREATE INDEX "AccountingJournalEntry_tenantId_caseId_currency_idx" ON "AccountingJournalEntry"("tenantId", "caseId", "currency");
CREATE INDEX "AccountingJournalEntry_tenantId_entryType_idx" ON "AccountingJournalEntry"("tenantId", "entryType");
CREATE INDEX "AccountingJournalEntry_tenantId_sourceType_sourceId_idx" ON "AccountingJournalEntry"("tenantId", "sourceType", "sourceId");
CREATE INDEX "AccountingJournalEntry_tenantId_postedAt_idx" ON "AccountingJournalEntry"("tenantId", "postedAt");
CREATE INDEX "AccountingJournalEntry_reversalOfEntryId_idx" ON "AccountingJournalEntry"("reversalOfEntryId");

-- CreateIndex: line ordering and reporting dimensions.
CREATE UNIQUE INDEX "AccountingJournalLine_journalEntryId_lineNo_key" ON "AccountingJournalLine"("journalEntryId", "lineNo");
CREATE INDEX "AccountingJournalLine_tenantId_caseId_currency_idx" ON "AccountingJournalLine"("tenantId", "caseId", "currency");
CREATE INDEX "AccountingJournalLine_tenantId_accountCode_idx" ON "AccountingJournalLine"("tenantId", "accountCode");
CREATE INDEX "AccountingJournalLine_tenantId_caseClientId_idx" ON "AccountingJournalLine"("tenantId", "caseClientId");
CREATE INDEX "AccountingJournalLine_tenantId_clientId_idx" ON "AccountingJournalLine"("tenantId", "clientId");
CREATE INDEX "AccountingJournalLine_collectionId_idx" ON "AccountingJournalLine"("collectionId");
CREATE INDEX "AccountingJournalLine_dispositionLineId_idx" ON "AccountingJournalLine"("dispositionLineId");
CREATE INDEX "AccountingJournalLine_payoutId_idx" ON "AccountingJournalLine"("payoutId");
CREATE INDEX "AccountingJournalLine_offsetId_idx" ON "AccountingJournalLine"("offsetId");
CREATE INDEX "AccountingJournalLine_balanceLedgerId_idx" ON "AccountingJournalLine"("balanceLedgerId");

-- AddForeignKey: only journal entry -> line and reversal self-reference are enforced in S9F.
-- Source dimensions remain scalar to avoid changing owner tables or runtime behavior.
ALTER TABLE "AccountingJournalEntry" ADD CONSTRAINT "AccountingJournalEntry_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingJournalLine" ADD CONSTRAINT "AccountingJournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (Prisma schema language does not express these; additive table-only guards).
ALTER TABLE "AccountingJournalEntry" ADD CONSTRAINT "AccountingJournalEntry_sourceId_not_blank_chk" CHECK (length(trim("sourceId")) > 0);
ALTER TABLE "AccountingJournalEntry" ADD CONSTRAINT "AccountingJournalEntry_sourceAction_not_blank_chk" CHECK (length(trim("sourceAction")) > 0);
ALTER TABLE "AccountingJournalEntry" ADD CONSTRAINT "AccountingJournalEntry_idempotencyKey_not_blank_chk" CHECK (length(trim("idempotencyKey")) > 0);
ALTER TABLE "AccountingJournalLine" ADD CONSTRAINT "AccountingJournalLine_amount_positive_chk" CHECK ("amount" > 0);
ALTER TABLE "AccountingJournalLine" ADD CONSTRAINT "AccountingJournalLine_lineNo_positive_chk" CHECK ("lineNo" > 0);