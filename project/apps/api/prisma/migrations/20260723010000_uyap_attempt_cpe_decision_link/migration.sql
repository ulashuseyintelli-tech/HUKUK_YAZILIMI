-- CreateTable
CREATE TABLE "UyapAttemptCpeDecisionLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "cpeDecisionLogId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UyapAttemptCpeDecisionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UyapAttemptCpeDecisionLink_tenantId_idx" ON "UyapAttemptCpeDecisionLink"("tenantId");

-- CreateIndex
CREATE INDEX "UyapAttemptCpeDecisionLink_caseId_idx" ON "UyapAttemptCpeDecisionLink"("caseId");

-- CreateIndex
CREATE INDEX "UyapAttemptCpeDecisionLink_attemptId_idx" ON "UyapAttemptCpeDecisionLink"("attemptId");

-- CreateIndex
CREATE INDEX "UyapAttemptCpeDecisionLink_operationId_idx" ON "UyapAttemptCpeDecisionLink"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "UyapAttemptCpeDecisionLink_cpeDecisionLogId_key" ON "UyapAttemptCpeDecisionLink"("cpeDecisionLogId");

-- CreateIndex
CREATE UNIQUE INDEX "UyapOperation_id_caseId_tenantId_key" ON "UyapOperation"("id", "caseId", "tenantId");

-- AddForeignKey
ALTER TABLE "UyapAttemptCpeDecisionLink" ADD CONSTRAINT "UyapAttemptCpeDecisionLink_attemptId_operationId_tenantId_fkey" FOREIGN KEY ("attemptId", "operationId", "tenantId") REFERENCES "UyapAttempt"("id", "operationId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapAttemptCpeDecisionLink" ADD CONSTRAINT "UyapAttemptCpeDecisionLink_operationId_caseId_tenantId_fkey" FOREIGN KEY ("operationId", "caseId", "tenantId") REFERENCES "UyapOperation"("id", "caseId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UyapAttemptCpeDecisionLink" ADD CONSTRAINT "UyapAttemptCpeDecisionLink_cpeDecisionLogId_caseId_fkey" FOREIGN KEY ("cpeDecisionLogId", "caseId") REFERENCES "CpeDecisionLog"("id", "caseId") ON DELETE RESTRICT ON UPDATE CASCADE;
