-- P4-1 — Office (kurumsal) Approval Engine substrate (ADDITIVE; geri-uyumlu, eski API kırılmaz).
-- DROP / mevcut-kolon-ALTER YOK. Henüz hiçbir akışa bağlı DEĞİL (substrate-only).

-- CreateEnum
CREATE TYPE "OfficeApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfficeApprovalExecutionStatus" AS ENUM ('NOT_RUN', 'RUNNING', 'SUCCEEDED', 'FAILED', 'STALE');

-- AlterTable (additive: default false → mevcut satırlar etkilenmez)
ALTER TABLE "Lawyer" ADD COLUMN     "canApproveOfficeActions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OfficeApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actionCode" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "approverUserId" TEXT,
    "status" "OfficeApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "executionStatus" "OfficeApprovalExecutionStatus" NOT NULL DEFAULT 'NOT_RUN',
    "savedIntent" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "reason" TEXT,
    "decisionNote" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "OfficeApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeApprovalRequest_tenantId_status_idx" ON "OfficeApprovalRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OfficeApprovalRequest_tenantId_approverUserId_status_idx" ON "OfficeApprovalRequest"("tenantId", "approverUserId", "status");

-- CreateIndex
CREATE INDEX "OfficeApprovalRequest_tenantId_requesterUserId_idx" ON "OfficeApprovalRequest"("tenantId", "requesterUserId");

-- CreateIndex
CREATE INDEX "OfficeApprovalRequest_targetType_targetRef_idx" ON "OfficeApprovalRequest"("targetType", "targetRef");

-- CreateIndex
CREATE INDEX "OfficeApprovalRequest_expiresAt_idx" ON "OfficeApprovalRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeApprovalRequest_tenantId_idempotencyKey_key" ON "OfficeApprovalRequest"("tenantId", "idempotencyKey");
