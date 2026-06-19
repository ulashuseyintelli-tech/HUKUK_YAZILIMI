-- CreateEnum
CREATE TYPE "CaseDebtorLifecycleStatus" AS ENUM ('ACTIVE', 'PASSIVE');

-- AlterTable
ALTER TABLE "CaseDebtor" ADD COLUMN     "lifecycleStatus" "CaseDebtorLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "passivatedAt" TIMESTAMP(3),
ADD COLUMN     "passivatedById" TEXT,
ADD COLUMN     "passivationEffectiveAt" TIMESTAMP(3),
ADD COLUMN     "passivationNote" TEXT,
ADD COLUMN     "passivationReason" TEXT;

-- CreateIndex
CREATE INDEX "CaseDebtor_caseId_lifecycleStatus_idx" ON "CaseDebtor"("caseId", "lifecycleStatus");
