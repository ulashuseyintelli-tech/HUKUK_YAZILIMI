-- Faz 4.2: ClientIntakeLink/Submission/Field — dış-form intake persistence (additive, yalnız şema)
-- NOT: migrate diffteki alakasiz "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc"
-- KASTEN dahil edilmedi (mevcut drift; Faz 2/3/4.0 ile ayni).

-- CreateEnum
CREATE TYPE "ClientIntakeLinkStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ClientIntakeSubmissionStatus" AS ENUM ('CLIENT_SUBMITTED', 'IN_REVIEW', 'PARTIALLY_PROMOTED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientIntakeFieldReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientIntakeFieldCategory" AS ENUM ('INCOME_SOURCE', 'COMMERCIAL_RELATION', 'FAMILY_CIRCLE', 'DIGITAL_FOOTPRINT', 'PAYMENT_HISTORY', 'STRATEGY', 'ADDRESS', 'ASSET', 'CONTACT');


-- CreateTable
CREATE TABLE "ClientIntakeLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ClientIntakeLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "scope" "ClientIntakeFieldCategory"[],
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientIntakeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientIntakeSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "intakeLinkId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "ClientIntakeSubmissionStatus" NOT NULL DEFAULT 'CLIENT_SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sourceMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientIntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientIntakeField" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "category" "ClientIntakeFieldCategory" NOT NULL,
    "label" TEXT,
    "value" TEXT NOT NULL,
    "note" TEXT,
    "reviewStatus" "ClientIntakeFieldReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "promotedRefType" TEXT,
    "promotedRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientIntakeField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientIntakeLink_tenantId_idx" ON "ClientIntakeLink"("tenantId");

-- CreateIndex
CREATE INDEX "ClientIntakeLink_caseId_idx" ON "ClientIntakeLink"("caseId");

-- CreateIndex
CREATE INDEX "ClientIntakeLink_clientId_idx" ON "ClientIntakeLink"("clientId");

-- CreateIndex
CREATE INDEX "ClientIntakeLink_tokenHash_idx" ON "ClientIntakeLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientIntakeLink_status_idx" ON "ClientIntakeLink"("status");

-- CreateIndex
CREATE INDEX "ClientIntakeSubmission_tenantId_idx" ON "ClientIntakeSubmission"("tenantId");

-- CreateIndex
CREATE INDEX "ClientIntakeSubmission_intakeLinkId_idx" ON "ClientIntakeSubmission"("intakeLinkId");

-- CreateIndex
CREATE INDEX "ClientIntakeSubmission_caseId_idx" ON "ClientIntakeSubmission"("caseId");

-- CreateIndex
CREATE INDEX "ClientIntakeSubmission_status_idx" ON "ClientIntakeSubmission"("status");

-- CreateIndex
CREATE INDEX "ClientIntakeSubmission_createdAt_idx" ON "ClientIntakeSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "ClientIntakeField_submissionId_idx" ON "ClientIntakeField"("submissionId");

-- CreateIndex
CREATE INDEX "ClientIntakeField_category_idx" ON "ClientIntakeField"("category");

-- CreateIndex
CREATE INDEX "ClientIntakeField_reviewStatus_idx" ON "ClientIntakeField"("reviewStatus");

-- AddForeignKey
ALTER TABLE "ClientIntakeLink" ADD CONSTRAINT "ClientIntakeLink_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIntakeLink" ADD CONSTRAINT "ClientIntakeLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIntakeSubmission" ADD CONSTRAINT "ClientIntakeSubmission_intakeLinkId_fkey" FOREIGN KEY ("intakeLinkId") REFERENCES "ClientIntakeLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIntakeSubmission" ADD CONSTRAINT "ClientIntakeSubmission_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIntakeSubmission" ADD CONSTRAINT "ClientIntakeSubmission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIntakeField" ADD CONSTRAINT "ClientIntakeField_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ClientIntakeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

