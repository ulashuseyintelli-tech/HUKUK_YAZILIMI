-- CreateEnum
CREATE TYPE "UyapInternalOperationState" AS ENUM ('DRAFT', 'VALIDATED', 'AWAITING_APPROVAL', 'APPROVED', 'AWAITING_SIGNATURE', 'SIGNED', 'ATTEMPT_IN_PROGRESS', 'MANUAL_REVIEW_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UyapProviderState" AS ENUM ('NOT_DISPATCHED', 'DISPATCH_IN_PROGRESS', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'OUTCOME_UNKNOWN');

-- CreateEnum
CREATE TYPE "UyapLegalEffectState" AS ENUM ('NONE', 'PENDING_CONFIRMATION', 'CONFIRMED');

-- CreateTable
CREATE TABLE "UyapOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "operationType" VARCHAR(128) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actingLawyerId" TEXT,
    "representedPartyId" TEXT,
    "approverId" TEXT,
    "signatureOwnerId" TEXT,
    "clientRequestId" VARCHAR(256),
    "httpCorrelationId" VARCHAR(256),
    "idempotencyKey" VARCHAR(256) NOT NULL,
    "internalState" "UyapInternalOperationState" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "UyapOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UyapAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "previousAttemptId" TEXT,
    "internalState" "UyapInternalOperationState" NOT NULL DEFAULT 'ATTEMPT_IN_PROGRESS',
    "providerState" "UyapProviderState" NOT NULL DEFAULT 'NOT_DISPATCHED',
    "legalEffectState" "UyapLegalEffectState" NOT NULL DEFAULT 'NONE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "providerTransactionId" TEXT,
    "providerIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UyapAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UyapOperation_tenantId_idx" ON "UyapOperation"("tenantId");

-- CreateIndex
CREATE INDEX "UyapOperation_tenantId_caseId_idx" ON "UyapOperation"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "UyapOperation_operationType_idx" ON "UyapOperation"("operationType");

-- CreateIndex
CREATE INDEX "UyapOperation_clientRequestId_idx" ON "UyapOperation"("clientRequestId");

-- CreateIndex
CREATE INDEX "UyapOperation_httpCorrelationId_idx" ON "UyapOperation"("httpCorrelationId");

-- CreateIndex
CREATE INDEX "UyapOperation_internalState_idx" ON "UyapOperation"("internalState");

-- CreateIndex
CREATE UNIQUE INDEX "UyapOperation_id_tenantId_key" ON "UyapOperation"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UyapOperation_tenantId_idempotencyKey_key" ON "UyapOperation"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UyapAttempt_tenantId_idx" ON "UyapAttempt"("tenantId");

-- CreateIndex
CREATE INDEX "UyapAttempt_operationId_idx" ON "UyapAttempt"("operationId");

-- CreateIndex
CREATE INDEX "UyapAttempt_providerState_idx" ON "UyapAttempt"("providerState");

-- CreateIndex
CREATE INDEX "UyapAttempt_legalEffectState_idx" ON "UyapAttempt"("legalEffectState");

-- CreateIndex
CREATE UNIQUE INDEX "UyapAttempt_id_tenantId_key" ON "UyapAttempt"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UyapAttempt_id_operationId_tenantId_key" ON "UyapAttempt"("id", "operationId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UyapAttempt_operationId_attemptNumber_key" ON "UyapAttempt"("operationId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_id_tenantId_key" ON "Client"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_id_tenantId_key" ON "Case"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Lawyer_id_tenantId_key" ON "Lawyer"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_caseId_tenantId_fkey" FOREIGN KEY ("caseId", "tenantId") REFERENCES "Case"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_actorUserId_tenantId_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_actingLawyerId_tenantId_fkey" FOREIGN KEY ("actingLawyerId", "tenantId") REFERENCES "Lawyer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_representedPartyId_tenantId_fkey" FOREIGN KEY ("representedPartyId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_approverId_tenantId_fkey" FOREIGN KEY ("approverId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_signatureOwnerId_tenantId_fkey" FOREIGN KEY ("signatureOwnerId", "tenantId") REFERENCES "Lawyer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapAttempt" ADD CONSTRAINT "UyapAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapAttempt" ADD CONSTRAINT "UyapAttempt_operationId_tenantId_fkey" FOREIGN KEY ("operationId", "tenantId") REFERENCES "UyapOperation"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapAttempt" ADD CONSTRAINT "UyapAttempt_previousAttemptId_operationId_tenantId_fkey" FOREIGN KEY ("previousAttemptId", "operationId", "tenantId") REFERENCES "UyapAttempt"("id", "operationId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- P-E5A-R1 structural CHECK constraints (Prisma schema-native CHECK desteklemez; additive raw SQL).
-- Yalniz structural invariant'lar; cross-state hukuki kombinasyon/transition enforcement P-E5D'ye aittir.
ALTER TABLE "UyapOperation" ADD CONSTRAINT "UyapOperation_version_positive_check" CHECK ("version" >= 1);
ALTER TABLE "UyapAttempt" ADD CONSTRAINT "UyapAttempt_attemptNumber_positive_check" CHECK ("attemptNumber" >= 1);
ALTER TABLE "UyapAttempt" ADD CONSTRAINT "UyapAttempt_finishedAt_order_check" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");
ALTER TABLE "UyapAttempt" ADD CONSTRAINT "UyapAttempt_first_attempt_pairing_check" CHECK (("attemptNumber" = 1 AND "previousAttemptId" IS NULL) OR ("attemptNumber" > 1 AND "previousAttemptId" IS NOT NULL));
