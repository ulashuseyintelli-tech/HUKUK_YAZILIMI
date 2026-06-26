-- TM3 M1 — Müvekkil Settlement Bridge: CollectionDisposition + CollectionDispositionLine
-- NOT: Bu migration PR'da kalır; shared/dev DB'ye apply için ayrı "uygula" talimatı beklenir.

-- CreateEnum
CREATE TYPE "CollectionDispositionStatus" AS ENUM ('HELD_PENDING_DISTRIBUTION', 'POSTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CollectionDispositionBeneficiaryScope" AS ENUM ('SINGLE_CASE_CLIENT', 'CASE_CREDITOR_CLUSTER');

-- CreateEnum
CREATE TYPE "CollectionDispositionLineType" AS ENUM ('CLIENT_PAYABLE', 'CONTRACTUAL_FEE_WITHHELD', 'FIRM_EXPENSE_REIMBURSEMENT', 'CLIENT_EXPENSE_REIMBURSEMENT', 'OFFSET_CLIENT_ADVANCE', 'HELD_PENDING_DISTRIBUTION', 'OTHER');

-- CreateTable
CREATE TABLE "CollectionDisposition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "beneficiaryScope" "CollectionDispositionBeneficiaryScope" NOT NULL,
    "caseClientId" TEXT,
    "status" "CollectionDispositionStatus" NOT NULL DEFAULT 'HELD_PENDING_DISTRIBUTION',
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "sourcePaymentEventId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionDispositionLine" (
    "id" TEXT NOT NULL,
    "dispositionId" TEXT NOT NULL,
    "type" "CollectionDispositionLineType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "caseClientId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionDispositionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionDisposition_collectionId_key" ON "CollectionDisposition"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionDisposition_tenantId_caseId_idx" ON "CollectionDisposition"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "CollectionDisposition_tenantId_status_idx" ON "CollectionDisposition"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CollectionDisposition_caseClientId_idx" ON "CollectionDisposition"("caseClientId");

-- CreateIndex
CREATE INDEX "CollectionDispositionLine_dispositionId_idx" ON "CollectionDispositionLine"("dispositionId");

-- CreateIndex
CREATE INDEX "CollectionDispositionLine_type_idx" ON "CollectionDispositionLine"("type");

-- AddForeignKey
ALTER TABLE "CollectionDispositionLine" ADD CONSTRAINT "CollectionDispositionLine_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "CollectionDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
