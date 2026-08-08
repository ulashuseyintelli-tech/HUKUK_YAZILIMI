-- X3-B02 — Faiz projection enum foundation.
-- PostgreSQL requires new enum values to commit before a later migration may use
-- them in a CHECK constraint. Production apply remains ACTIVATION_PENDING.

-- AlterEnum
ALTER TYPE "ClientStatementLineType" ADD VALUE 'INFORMATIONAL_ACCRUED_INTEREST';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'COLLECTED_CLIENT_INTEREST';
