-- S8-B FAZ-1b — Masraf reimbursement application projection + ExpenseRequest dağıtım-onay ekseni.
--
-- TAMAMEN ADDITIVE: yeni enum'lar (CREATE TYPE) + yeni kolonlar (DEFAULT'lu/nullable) + yeni tablo.
-- Yeni enum'lar CREATE TYPE ile geldiği için aynı migration'da kolon referansı GÜVENLİ
-- (ALTER TYPE ADD VALUE split sorunu YOK; FAZ-0'dan farklı — orada mevcut enum'a değer ekleniyordu).
--
-- ⚠️ NOT: Bu migration PR'da kalır; dev/shared DB'ye apply için AYRI owner "uygula" talimatı beklenir
--    (FAZ-0 precedent; `migrate status` ile pending kontrolü sonrası `migrate deploy`).
-- ⚠️ BACKFILL (grandfather PAID/RECEIVED → APPROVED) bu migration'a DAHİL DEĞİL — ayrı owner-gated
--    data step (additive migration tüm satırları PENDING_APPROVAL bırakır; LAWYER_PAID grandfather YOK).

-- CreateEnum
CREATE TYPE "ExpenseApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpenseApplicationKind" AS ENUM ('APPLY', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ExpenseReimbursementScope" AS ENUM ('CLIENT_FRONTED', 'FIRM_FRONTED');

-- AlterTable
ALTER TABLE "ExpenseRequest" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "expenseApprovalStatus" "ExpenseApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "CollectionDispositionLine" ADD COLUMN     "expenseRequestId" TEXT;

-- CreateTable
CREATE TABLE "CollectionDispositionExpenseApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "expenseRequestId" TEXT NOT NULL,
    "collectionDispositionId" TEXT NOT NULL,
    "collectionDispositionLineId" TEXT NOT NULL,
    "kind" "ExpenseApplicationKind" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "reimbursementScope" "ExpenseReimbursementScope" NOT NULL,
    "reversesApplicationId" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionDispositionExpenseApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CDEApp_tenant_expense_idx" ON "CollectionDispositionExpenseApplication"("tenantId", "expenseRequestId");

-- CreateIndex
CREATE INDEX "CDEApp_disposition_idx" ON "CollectionDispositionExpenseApplication"("collectionDispositionId");

-- CreateIndex
CREATE INDEX "CDEApp_line_idx" ON "CollectionDispositionExpenseApplication"("collectionDispositionLineId");

-- CreateIndex
CREATE INDEX "CDEApp_createdAt_idx" ON "CollectionDispositionExpenseApplication"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CDEApp_line_kind_key" ON "CollectionDispositionExpenseApplication"("tenantId", "collectionDispositionLineId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CDEApp_reverses_key" ON "CollectionDispositionExpenseApplication"("tenantId", "reversesApplicationId");

-- CreateIndex
CREATE INDEX "ExpenseRequest_tenantId_expenseApprovalStatus_approvedAt_idx" ON "ExpenseRequest"("tenantId", "expenseApprovalStatus", "approvedAt");

-- CreateIndex
CREATE INDEX "CollectionDispositionLine_expenseRequestId_idx" ON "CollectionDispositionLine"("expenseRequestId");

-- AddForeignKey
ALTER TABLE "CollectionDispositionExpenseApplication" ADD CONSTRAINT "CDEApp_disposition_fkey" FOREIGN KEY ("collectionDispositionId") REFERENCES "CollectionDisposition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionDispositionExpenseApplication" ADD CONSTRAINT "CDEApp_line_fkey" FOREIGN KEY ("collectionDispositionLineId") REFERENCES "CollectionDispositionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
