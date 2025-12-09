-- CreateEnum
CREATE TYPE "WorkflowStage" AS ENUM ('INITIAL', 'PAYMENT_ORDER', 'WAITING_RESPONSE', 'OBJECTION', 'ENFORCEMENT', 'SEIZURE', 'SALE_REQUEST', 'AUCTION', 'COLLECTION', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'CLOSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'AUTO', 'SYSTEM', 'AI');

-- CreateEnum
CREATE TYPE "EnforcementType" AS ENUM ('BANK_INQUIRY', 'BANK_SEIZURE', 'VEHICLE_INQUIRY', 'VEHICLE_SEIZURE', 'PROPERTY_INQUIRY', 'PROPERTY_SEIZURE', 'SALARY_SEIZURE', 'MOVABLE_SEIZURE', 'TRAVEL_BAN', 'SALE_REQUEST', 'AUCTION');

-- CreateEnum
CREATE TYPE "EnforcementStatus" AS ENUM ('PENDING', 'REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('FORM_SELECTION', 'NEXT_ACTION', 'ENFORCEMENT_TYPE', 'RISK_ASSESSMENT', 'COLLECTION_STRATEGY', 'CASE_CLOSURE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_ORDER', 'SEIZURE_NOTICE', 'SALE_NOTICE', 'REMINDER', 'INFO', 'WARNING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('E_TEBLIGAT', 'PTT', 'SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'SENT', 'DELIVERED', 'READ', 'RESPONDED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "autoActionsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isAutoMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAutoActionAt" TIMESTAMP(3),
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "riskScore" INTEGER,
ADD COLUMN     "workflowStage" "WorkflowStage" NOT NULL DEFAULT 'INITIAL';

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "formTypeCode" TEXT,
    "steps" JSONB NOT NULL,
    "triggers" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseLifecycle" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stage" "WorkflowStage" NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "triggeredBy" "TriggerType" NOT NULL DEFAULT 'MANUAL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseLifecycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnforcementAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "EnforcementType" NOT NULL,
    "status" "EnforcementStatus" NOT NULL DEFAULT 'PENDING',
    "targetType" TEXT,
    "targetDetails" JSONB,
    "requestDate" TIMESTAMP(3),
    "responseDate" TIMESTAMP(3),
    "responseDetails" JSONB,
    "amount" DECIMAL(15,2),
    "notes" TEXT,
    "documentPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnforcementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskReport" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "collectionProb" INTEGER,
    "recommendedAction" TEXT,
    "factors" JSONB,
    "assetAnalysis" JSONB,
    "debtorAnalysis" JSONB,
    "aiSuggestions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionType" "DecisionType" NOT NULL,
    "decision" TEXT NOT NULL,
    "reasoning" TEXT,
    "confidence" INTEGER,
    "inputData" JSONB,
    "outcome" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationQueue" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT,
    "content" TEXT,
    "templateCode" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "responseAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowTemplate_tenantId_idx" ON "WorkflowTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_tenantId_code_key" ON "WorkflowTemplate"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CaseLifecycle_caseId_idx" ON "CaseLifecycle"("caseId");

-- CreateIndex
CREATE INDEX "CaseLifecycle_stage_idx" ON "CaseLifecycle"("stage");

-- CreateIndex
CREATE INDEX "CaseLifecycle_createdAt_idx" ON "CaseLifecycle"("createdAt");

-- CreateIndex
CREATE INDEX "EnforcementAction_caseId_idx" ON "EnforcementAction"("caseId");

-- CreateIndex
CREATE INDEX "EnforcementAction_type_idx" ON "EnforcementAction"("type");

-- CreateIndex
CREATE INDEX "EnforcementAction_status_idx" ON "EnforcementAction"("status");

-- CreateIndex
CREATE INDEX "RiskReport_caseId_idx" ON "RiskReport"("caseId");

-- CreateIndex
CREATE INDEX "RiskReport_overallScore_idx" ON "RiskReport"("overallScore");

-- CreateIndex
CREATE INDEX "DecisionLog_caseId_idx" ON "DecisionLog"("caseId");

-- CreateIndex
CREATE INDEX "DecisionLog_decisionType_idx" ON "DecisionLog"("decisionType");

-- CreateIndex
CREATE INDEX "DecisionLog_isAutomatic_idx" ON "DecisionLog"("isAutomatic");

-- CreateIndex
CREATE INDEX "NotificationQueue_caseId_idx" ON "NotificationQueue"("caseId");

-- CreateIndex
CREATE INDEX "NotificationQueue_status_idx" ON "NotificationQueue"("status");

-- CreateIndex
CREATE INDEX "NotificationQueue_scheduledAt_idx" ON "NotificationQueue"("scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationQueue_expiresAt_idx" ON "NotificationQueue"("expiresAt");

-- CreateIndex
CREATE INDEX "Case_workflowStage_idx" ON "Case"("workflowStage");

-- CreateIndex
CREATE INDEX "Case_nextActionAt_idx" ON "Case"("nextActionAt");

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLifecycle" ADD CONSTRAINT "CaseLifecycle_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnforcementAction" ADD CONSTRAINT "EnforcementAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskReport" ADD CONSTRAINT "RiskReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLog" ADD CONSTRAINT "DecisionLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
