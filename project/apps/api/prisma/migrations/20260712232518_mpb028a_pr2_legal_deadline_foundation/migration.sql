-- CreateEnum
CREATE TYPE "LegalDeadlineType" AS ENUM ('OBJECTION_PERIOD');

-- CreateEnum
CREATE TYPE "LegalDeadlineSnapshotStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "Tk21Type" ADD VALUE 'TK_20';

-- CreateTable
CREATE TABLE "LegalDeadlineSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseDebtorId" TEXT,
    "sourceTebligatId" TEXT NOT NULL,
    "deadlineType" "LegalDeadlineType" NOT NULL,
    "legalServiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "finalizationDate" TIMESTAMP(3),
    "calculationRule" TEXT NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "deadlineReasonCode" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesSnapshotId" TEXT,
    "status" "LegalDeadlineSnapshotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDeadlineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDeadlineSnapshot_supersedesSnapshotId_key" ON "LegalDeadlineSnapshot"("supersedesSnapshotId");

-- CreateIndex
CREATE INDEX "LegalDeadlineSnapshot_tenantId_idx" ON "LegalDeadlineSnapshot"("tenantId");

-- CreateIndex
CREATE INDEX "LegalDeadlineSnapshot_caseId_idx" ON "LegalDeadlineSnapshot"("caseId");

-- CreateIndex
CREATE INDEX "LegalDeadlineSnapshot_sourceTebligatId_idx" ON "LegalDeadlineSnapshot"("sourceTebligatId");

-- CreateIndex
CREATE INDEX "LegalDeadlineSnapshot_status_idx" ON "LegalDeadlineSnapshot"("status");

-- CreateIndex
CREATE INDEX "LegalDeadlineSnapshot_tenantId_sourceTebligatId_status_idx" ON "LegalDeadlineSnapshot"("tenantId", "sourceTebligatId", "status");

-- AddForeignKey
ALTER TABLE "LegalDeadlineSnapshot" ADD CONSTRAINT "LegalDeadlineSnapshot_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDeadlineSnapshot" ADD CONSTRAINT "LegalDeadlineSnapshot_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDeadlineSnapshot" ADD CONSTRAINT "LegalDeadlineSnapshot_sourceTebligatId_fkey" FOREIGN KEY ("sourceTebligatId") REFERENCES "Tebligat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDeadlineSnapshot" ADD CONSTRAINT "LegalDeadlineSnapshot_supersedesSnapshotId_fkey" FOREIGN KEY ("supersedesSnapshotId") REFERENCES "LegalDeadlineSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
