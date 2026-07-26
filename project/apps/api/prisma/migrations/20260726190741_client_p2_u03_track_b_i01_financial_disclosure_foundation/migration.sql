-- CreateEnum
CREATE TYPE "ClientFinancialDisclosureStatus" AS ENUM ('DRAFT', 'OFFICE_APPROVAL_PENDING', 'OFFICE_APPROVED', 'CONTENT_APPROVAL_PENDING', 'CONTENT_APPROVED', 'SEND_PENDING', 'SEND_FAILED', 'PUBLISHED', 'CANCELLED', 'SUPERSEDED', 'REVERSED');

-- CreateTable
CREATE TABLE "ClientFinancialDisclosure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseClientId" TEXT NOT NULL,
    "collectionDispositionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientFinancialDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFinancialDisclosureVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disclosureId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ClientFinancialDisclosureStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceCollectionId" TEXT NOT NULL,
    "sourceCollectionAmount" DECIMAL(15,2) NOT NULL,
    "sourceCollectionDate" TIMESTAMP(3) NOT NULL,
    "dispositionTotalAmount" DECIMAL(15,2) NOT NULL,
    "dispositionPostedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "totalCollected" DECIMAL(15,2) NOT NULL,
    "clientNetAmount" DECIMAL(15,2) NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "officeApprovalRequestId" TEXT,
    "officeApprovedAt" TIMESTAMP(3),
    "officeApprovedById" TEXT,
    "notificationContent" TEXT,
    "notificationContentHash" TEXT,
    "contentApprovedAt" TIMESTAMP(3),
    "contentApprovedById" TEXT,
    "approvedRecipientEmail" TEXT,
    "approvedRecipientPortalUserId" TEXT,
    "sendIdempotencyKey" TEXT NOT NULL,
    "sendRequestedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "providerAcceptedAt" TIMESTAMP(3),
    "sendFailureCode" TEXT,
    "sendFailureDetail" TEXT,
    "publishedAt" TIMESTAMP(3),
    "supersedesVersionId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientFinancialDisclosureVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFinancialDisclosureLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disclosureVersionId" TEXT NOT NULL,
    "type" "CollectionDispositionLineType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "sourceDispositionLineId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFinancialDisclosureLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosure_currentVersionId_key" ON "ClientFinancialDisclosure"("currentVersionId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosure_tenantId_caseId_idx" ON "ClientFinancialDisclosure"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosure_tenantId_caseClientId_idx" ON "ClientFinancialDisclosure"("tenantId", "caseClientId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosure_collectionDispositionId_idx" ON "ClientFinancialDisclosure"("collectionDispositionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosure_tenantId_id_key" ON "ClientFinancialDisclosure"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosure_tenantId_collectionDispositionId_key" ON "ClientFinancialDisclosure"("tenantId", "collectionDispositionId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosureVersion_tenantId_disclosureId_idx" ON "ClientFinancialDisclosureVersion"("tenantId", "disclosureId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosureVersion_tenantId_status_idx" ON "ClientFinancialDisclosureVersion"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosureVersion_sourceCollectionId_idx" ON "ClientFinancialDisclosureVersion"("sourceCollectionId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosureVersion_publishedAt_idx" ON "ClientFinancialDisclosureVersion"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosureVersion_tenantId_id_key" ON "ClientFinancialDisclosureVersion"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosureVersion_tenantId_disclosureId_vers_key" ON "ClientFinancialDisclosureVersion"("tenantId", "disclosureId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosureVersion_tenantId_sendIdempotencyKe_key" ON "ClientFinancialDisclosureVersion"("tenantId", "sendIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosureVersion_tenantId_supersedesVersion_key" ON "ClientFinancialDisclosureVersion"("tenantId", "supersedesVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosureVersion_tenantId_officeApprovalReq_key" ON "ClientFinancialDisclosureVersion"("tenantId", "officeApprovalRequestId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosureLine_tenantId_disclosureVersionId_idx" ON "ClientFinancialDisclosureLine"("tenantId", "disclosureVersionId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosureLine_sourceDispositionLineId_idx" ON "ClientFinancialDisclosureLine"("sourceDispositionLineId");

-- CreateIndex
CREATE INDEX "ClientFinancialDisclosureLine_type_idx" ON "ClientFinancialDisclosureLine"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosureLine_tenantId_id_key" ON "ClientFinancialDisclosureLine"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancialDisclosureLine_tenantId_disclosureVersionId__key" ON "ClientFinancialDisclosureLine"("tenantId", "disclosureVersionId", "sourceDispositionLineId");

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosure" ADD CONSTRAINT "ClientFinancialDisclosure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosure" ADD CONSTRAINT "ClientFinancialDisclosure_tenantId_caseId_fkey" FOREIGN KEY ("tenantId", "caseId") REFERENCES "Case"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosure" ADD CONSTRAINT "ClientFinancialDisclosure_caseClientId_fkey" FOREIGN KEY ("caseClientId") REFERENCES "CaseClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosure" ADD CONSTRAINT "ClientFinancialDisclosure_collectionDispositionId_fkey" FOREIGN KEY ("collectionDispositionId") REFERENCES "CollectionDisposition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosure" ADD CONSTRAINT "ClientFinancialDisclosure_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ClientFinancialDisclosureVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosureVersion" ADD CONSTRAINT "ClientFinancialDisclosureVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosureVersion" ADD CONSTRAINT "ClientFinancialDisclosureVersion_tenantId_disclosureId_fkey" FOREIGN KEY ("tenantId", "disclosureId") REFERENCES "ClientFinancialDisclosure"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosureVersion" ADD CONSTRAINT "ClientFinancialDisclosureVersion_tenantId_supersedesVersio_fkey" FOREIGN KEY ("tenantId", "supersedesVersionId") REFERENCES "ClientFinancialDisclosureVersion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosureLine" ADD CONSTRAINT "ClientFinancialDisclosureLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosureLine" ADD CONSTRAINT "ClientFinancialDisclosureLine_tenantId_disclosureVersionId_fkey" FOREIGN KEY ("tenantId", "disclosureVersionId") REFERENCES "ClientFinancialDisclosureVersion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFinancialDisclosureLine" ADD CONSTRAINT "ClientFinancialDisclosureLine_sourceDispositionLineId_fkey" FOREIGN KEY ("sourceDispositionLineId") REFERENCES "CollectionDispositionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
