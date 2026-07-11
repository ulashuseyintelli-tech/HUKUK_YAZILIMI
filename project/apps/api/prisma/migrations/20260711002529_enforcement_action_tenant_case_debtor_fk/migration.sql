-- AlterTable
ALTER TABLE "EnforcementAction" ADD COLUMN     "caseDebtorId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "EnforcementAction_tenantId_idx" ON "EnforcementAction"("tenantId");

-- CreateIndex
CREATE INDEX "EnforcementAction_caseDebtorId_idx" ON "EnforcementAction"("caseDebtorId");

-- CreateIndex
CREATE INDEX "EnforcementAction_tenantId_caseId_idx" ON "EnforcementAction"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "EnforcementAction" ADD CONSTRAINT "EnforcementAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnforcementAction" ADD CONSTRAINT "EnforcementAction_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
