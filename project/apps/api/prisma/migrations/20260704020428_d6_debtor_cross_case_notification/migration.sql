-- CreateEnum
CREATE TYPE "DebtorNotificationFieldGroup" AS ENUM ('ADDRESS', 'KEP_ADDRESS', 'IDENTITY', 'NAME');

-- CreateEnum
CREATE TYPE "DebtorNotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DebtorNotificationRecipientSource" AS ENUM ('RESPONSIBLE_LAWYER', 'FALLBACK_LAWYER', 'TEBLIGAT_STAFF');

-- CreateEnum
CREATE TYPE "DebtorCrossCaseNotificationStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'EXPIRED');

-- CreateTable
CREATE TABLE "DebtorCrossCaseNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "sourceCaseId" TEXT,
    "affectedCaseId" TEXT NOT NULL,
    "affectedCaseDebtorId" TEXT NOT NULL,
    "fieldGroup" "DebtorNotificationFieldGroup" NOT NULL,
    "severity" "DebtorNotificationSeverity" NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "recipientSource" "DebtorNotificationRecipientSource" NOT NULL,
    "status" "DebtorCrossCaseNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtorCrossCaseNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DebtorCrossCaseNotification_dedupeKey_key" ON "DebtorCrossCaseNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "DebtorCrossCaseNotification_tenantId_recipientUserId_status_idx" ON "DebtorCrossCaseNotification"("tenantId", "recipientUserId", "status");

-- CreateIndex
CREATE INDEX "DebtorCrossCaseNotification_tenantId_debtorId_idx" ON "DebtorCrossCaseNotification"("tenantId", "debtorId");

-- CreateIndex
CREATE INDEX "DebtorCrossCaseNotification_affectedCaseId_idx" ON "DebtorCrossCaseNotification"("affectedCaseId");

-- CreateIndex
CREATE INDEX "DebtorCrossCaseNotification_expiresAt_idx" ON "DebtorCrossCaseNotification"("expiresAt");

-- AddForeignKey
ALTER TABLE "DebtorCrossCaseNotification" ADD CONSTRAINT "DebtorCrossCaseNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtorCrossCaseNotification" ADD CONSTRAINT "DebtorCrossCaseNotification_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtorCrossCaseNotification" ADD CONSTRAINT "DebtorCrossCaseNotification_sourceCaseId_fkey" FOREIGN KEY ("sourceCaseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtorCrossCaseNotification" ADD CONSTRAINT "DebtorCrossCaseNotification_affectedCaseId_fkey" FOREIGN KEY ("affectedCaseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtorCrossCaseNotification" ADD CONSTRAINT "DebtorCrossCaseNotification_affectedCaseDebtorId_fkey" FOREIGN KEY ("affectedCaseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
