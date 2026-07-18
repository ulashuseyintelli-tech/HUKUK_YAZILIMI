-- CreateEnum
CREATE TYPE "BankSettlementEvidenceSource" AS ENUM (
    'VALIDATED_PROVIDER_ATTESTATION',
    'SETTLEMENT_VERIFIER'
);

-- CreateEnum
CREATE TYPE "BankSettlementEvidenceOutcome" AS ENUM ('SETTLED', 'REJECTED');

-- CreateTable
CREATE TABLE "BankSettlementEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "source" "BankSettlementEvidenceSource" NOT NULL,
    "outcome" "BankSettlementEvidenceOutcome" NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "actorId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "supersedesEvidenceId" TEXT,

    CONSTRAINT "BankSettlementEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankSettlementEvidence_verifier_actor_check"
        CHECK ("source" <> 'SETTLEMENT_VERIFIER' OR "actorId" IS NOT NULL)
);

-- AlterTable
ALTER TABLE "BankTransaction"
ADD COLUMN "settlementEvidenceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BankSettlementEvidence_tenantId_id_key"
ON "BankSettlementEvidence"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BankSettlementEvidence_tenantId_idempotencyKey_key"
ON "BankSettlementEvidence"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BankSettlementEvidence_tenantId_supersedesEvidenceId_key"
ON "BankSettlementEvidence"("tenantId", "supersedesEvidenceId");

-- CreateIndex
CREATE INDEX "BankSettlementEvidence_tenantId_idx"
ON "BankSettlementEvidence"("tenantId");

-- CreateIndex
CREATE INDEX "BankSettlementEvidence_source_idx"
ON "BankSettlementEvidence"("source");

-- CreateIndex
CREATE INDEX "BankSettlementEvidence_outcome_idx"
ON "BankSettlementEvidence"("outcome");

-- CreateIndex
CREATE INDEX "BankSettlementEvidence_actorId_idx"
ON "BankSettlementEvidence"("actorId");

-- CreateIndex
CREATE INDEX "BankSettlementEvidence_observedAt_idx"
ON "BankSettlementEvidence"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_tenantId_settlementEvidenceId_key"
ON "BankTransaction"("tenantId", "settlementEvidenceId");

-- AddForeignKey
ALTER TABLE "BankSettlementEvidence"
ADD CONSTRAINT "BankSettlementEvidence_supersedesEvidenceId_tenantId_fkey"
FOREIGN KEY ("tenantId", "supersedesEvidenceId")
REFERENCES "BankSettlementEvidence"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction"
ADD CONSTRAINT "BankTransaction_settlementEvidenceId_tenantId_fkey"
FOREIGN KEY ("tenantId", "settlementEvidenceId")
REFERENCES "BankSettlementEvidence"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable append-only evidence: correction is a new row linked by supersedesEvidenceId.
CREATE TRIGGER prevent_bank_settlement_evidence_update
BEFORE UPDATE ON "BankSettlementEvidence"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER prevent_bank_settlement_evidence_delete
BEFORE DELETE ON "BankSettlementEvidence"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();
