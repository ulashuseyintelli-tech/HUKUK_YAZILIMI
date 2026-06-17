-- PR-1: ExpenseBlockReason — "Ödeme/onay yok → işlem yapılmadı" savunma defteri (additive)
-- NOT: migrate diff çıktısındaki "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc"
-- satırı KASTEN dahil edilmedi. O, raw-SQL DESC index'inin Prisma drift'idir; bu PR'ın kapsamı dışı.

-- CreateEnum
CREATE TYPE "ExpenseBlockReasonCode" AS ENUM ('PAYMENT_NOT_RECEIVED', 'APPROVAL_PENDING', 'INSUFFICIENT_ADVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseBlockStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ExpenseBlockReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "expenseRequestId" TEXT,
    "blockedActionCode" TEXT NOT NULL,
    "reasonCode" "ExpenseBlockReasonCode" NOT NULL,
    "note" TEXT,
    "status" "ExpenseBlockStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "ExpenseBlockReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseBlockReason_tenantId_idx" ON "ExpenseBlockReason"("tenantId");

-- CreateIndex
CREATE INDEX "ExpenseBlockReason_caseId_idx" ON "ExpenseBlockReason"("caseId");

-- CreateIndex
CREATE INDEX "ExpenseBlockReason_expenseRequestId_idx" ON "ExpenseBlockReason"("expenseRequestId");

-- CreateIndex
CREATE INDEX "ExpenseBlockReason_status_idx" ON "ExpenseBlockReason"("status");

-- CreateIndex
CREATE INDEX "ExpenseBlockReason_createdAt_idx" ON "ExpenseBlockReason"("createdAt");

-- AddForeignKey
ALTER TABLE "ExpenseBlockReason" ADD CONSTRAINT "ExpenseBlockReason_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBlockReason" ADD CONSTRAINT "ExpenseBlockReason_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
