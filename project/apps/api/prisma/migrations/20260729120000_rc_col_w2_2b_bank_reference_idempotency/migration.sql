-- RC-COL-W2.2B-R01: bank reference idempotency.
-- The lock closes the preflight/create-index race without rewriting existing rows.
LOCK TABLE "BankTransaction" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "BankTransaction"
    WHERE "bankReferenceId" IS NOT NULL
      AND (
        btrim("bankReferenceId") = ''
        OR "bankReferenceId" <> btrim("bankReferenceId")
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'BANK_REFERENCE_PREFLIGHT_FAILED: blank or untrimmed bankReferenceId exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "BankTransaction"
    WHERE "bankReferenceId" IS NOT NULL
    GROUP BY "tenantId", "bankAccountId", "bankReferenceId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'BANK_REFERENCE_PREFLIGHT_FAILED: duplicate tenant/account/reference group exists';
  END IF;
END $$;

ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "ck_bank_transaction_reference_normalized"
  CHECK (
    "bankReferenceId" IS NULL
    OR (
      "bankReferenceId" = btrim("bankReferenceId")
      AND btrim("bankReferenceId") <> ''
    )
  );

CREATE UNIQUE INDEX "uq_bank_transaction_tenant_account_reference"
  ON "BankTransaction"("tenantId", "bankAccountId", "bankReferenceId");
