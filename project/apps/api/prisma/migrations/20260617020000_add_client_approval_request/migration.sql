-- PR-2: ClientApprovalRequest + ClientApprovalEvent — müvekkil onay defteri (additive)
-- NOT: migrate diff çıktısındaki "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc"
-- satırı KASTEN dahil edilmedi (raw-SQL DESC index drift'i; bu PR'ın kapsamı dışı — PR-1 ile aynı).

-- CreateEnum
CREATE TYPE "ClientApprovalSubjectType" AS ENUM ('EXPENSE_REQUEST', 'OPERATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientApprovalStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClientApprovalChannel" AS ENUM ('EMAIL', 'PORTAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ClientApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "ClientApprovalEventType" AS ENUM ('CREATED', 'SENT', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ClientApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subjectType" "ClientApprovalSubjectType" NOT NULL,
    "subjectId" TEXT,
    "subjectLabel" TEXT,
    "status" "ClientApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "ClientApprovalChannel" NOT NULL DEFAULT 'EMAIL',
    "title" TEXT,
    "description" TEXT,
    "requestedById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decision" "ClientApprovalDecision",
    "decisionNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientApprovalEvent" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "eventType" "ClientApprovalEventType" NOT NULL,
    "fromStatus" "ClientApprovalStatus",
    "toStatus" "ClientApprovalStatus" NOT NULL,
    "byUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_tenantId_idx" ON "ClientApprovalRequest"("tenantId");

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_caseId_idx" ON "ClientApprovalRequest"("caseId");

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_clientId_idx" ON "ClientApprovalRequest"("clientId");

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_status_idx" ON "ClientApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_subjectType_subjectId_idx" ON "ClientApprovalRequest"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_createdAt_idx" ON "ClientApprovalRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ClientApprovalEvent_approvalRequestId_idx" ON "ClientApprovalEvent"("approvalRequestId");

-- CreateIndex
CREATE INDEX "ClientApprovalEvent_createdAt_idx" ON "ClientApprovalEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ClientApprovalRequest" ADD CONSTRAINT "ClientApprovalRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApprovalRequest" ADD CONSTRAINT "ClientApprovalRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApprovalEvent" ADD CONSTRAINT "ClientApprovalEvent_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ClientApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
