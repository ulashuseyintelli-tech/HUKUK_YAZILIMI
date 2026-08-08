-- X3-B02 — Faiz projection persistence only.
-- CLIENT faiz hesaplamaz: informational tutar RECEIVABLE interest-engine sonucudur;
-- collected tutar confirmed LedgerAllocation + POSTED disposition line kaynağına bağlıdır.
-- PRODUCTION APPLY bu engineering diliminin dışındadır (ACTIVATION_PENDING).

-- AlterTable
ALTER TABLE "ClientStatementLine"
  ADD COLUMN "interestAmount" DECIMAL(15,2),
  ADD COLUMN "sourceLedgerAllocationId" TEXT,
  ADD COLUMN "sourceDispositionLineId" TEXT;

-- The immutable statement snapshot must preserve both legal allocation and POSTED
-- client-entitlement sources. Nullable semantics leave non-interest rows untouched.
CREATE UNIQUE INDEX "ClientStatementLine_interest_source_key"
  ON "ClientStatementLine"("statementId", "sourceLedgerAllocationId", "sourceDispositionLineId");

-- Structural double-counting and non-cash guards. Runtime additionally verifies tenant,
-- case, client, CONFIRMED ledger and POSTED disposition scopes before persistence.
ALTER TABLE "ClientStatementLine"
  ADD CONSTRAINT "ClientStatementLine_interest_shape_check" CHECK (
    (
      "lineType" = 'INFORMATIONAL_ACCRUED_INTEREST'
      AND "interestAmount" IS NOT NULL
      AND "interestAmount" >= 0
      AND "debit" = 0
      AND "credit" = 0
      AND "sourceLedgerAllocationId" IS NULL
      AND "sourceDispositionLineId" IS NULL
    )
    OR
    (
      "lineType" = 'COLLECTED_CLIENT_INTEREST'
      AND "interestAmount" IS NOT NULL
      AND "interestAmount" > 0
      AND "debit" = 0
      AND "credit" = "interestAmount"
      AND "sourceLedgerAllocationId" IS NOT NULL
      AND "sourceDispositionLineId" IS NOT NULL
    )
    OR
    (
      "lineType" NOT IN ('INFORMATIONAL_ACCRUED_INTEREST', 'COLLECTED_CLIENT_INTEREST')
      AND "interestAmount" IS NULL
      AND "sourceLedgerAllocationId" IS NULL
      AND "sourceDispositionLineId" IS NULL
    )
  );
