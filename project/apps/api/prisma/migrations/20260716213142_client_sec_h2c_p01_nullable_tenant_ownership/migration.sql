-- AlterTable
ALTER TABLE "EsignLog" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "UyapRequestLog" ADD COLUMN     "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "EsignLog_tenantId_documentId_idx" ON "EsignLog"("tenantId", "documentId");

-- CreateIndex
CREATE INDEX "UyapRequestLog_tenantId_caseId_idx" ON "UyapRequestLog"("tenantId", "caseId");
