-- PR-3: ClientStatement + ClientStatementLine — müvekkil ekstresi (immutable snapshot, additive)
-- NOT: migrate diff çıktısındaki "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc"
-- satırı KASTEN dahil edilmedi (raw-SQL DESC index drift'i; kapsam dışı — PR-1/PR-2 ile aynı).

-- CreateEnum
CREATE TYPE "ClientStatementStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'VOID');

-- CreateEnum
CREATE TYPE "ClientStatementLineType" AS ENUM ('ADVANCE_CREDIT', 'CLIENT_PAYMENT', 'EXPENSE_ACTUAL', 'EXPENSE_REQUESTED', 'REFUND', 'ADJUST');

-- CreateTable
CREATE TABLE "ClientStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL,
    "closingBalance" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "ClientStatementStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidNote" TEXT,
    "note" TEXT,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineDate" TIMESTAMP(3) NOT NULL,
    "lineType" "ClientStatementLineType" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "runningBalance" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientStatement_tenantId_idx" ON "ClientStatement"("tenantId");

-- CreateIndex
CREATE INDEX "ClientStatement_caseId_idx" ON "ClientStatement"("caseId");

-- CreateIndex
CREATE INDEX "ClientStatement_clientId_idx" ON "ClientStatement"("clientId");

-- CreateIndex
CREATE INDEX "ClientStatement_status_idx" ON "ClientStatement"("status");

-- CreateIndex
CREATE INDEX "ClientStatement_createdAt_idx" ON "ClientStatement"("createdAt");

-- CreateIndex
CREATE INDEX "ClientStatementLine_statementId_idx" ON "ClientStatementLine"("statementId");

-- CreateIndex
CREATE INDEX "ClientStatementLine_lineType_idx" ON "ClientStatementLine"("lineType");

-- CreateIndex
CREATE INDEX "ClientStatementLine_lineDate_idx" ON "ClientStatementLine"("lineDate");

-- AddForeignKey
ALTER TABLE "ClientStatement" ADD CONSTRAINT "ClientStatement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStatement" ADD CONSTRAINT "ClientStatement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStatementLine" ADD CONSTRAINT "ClientStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "ClientStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
