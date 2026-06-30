-- S8-B FAZ-2 — CaseFeeAgreement (Akdi Ücret Sözleşmesi) schema contract.
--
-- TAMAMEN ADDITIVE: yeni enum'lar (CREATE TYPE) + yeni tablo (CaseFeeAgreement) +
-- CollectionDispositionLine'a nullable provenance kolonu (feeAgreementId). Mevcut veri/davranış
-- DOKUNULMAZ: journal mapping (CONTRACTUAL_FEE_WITHHELD -> ATTORNEY_FEE_REVENUE) DEGISMEZ;
-- fee-line caseClientId=null (Q3) kurali DEGISMEZ. Self-FK supersedesId yalniz yeni tablo icinde
-- (model-ici versiyonlama; shared CaseClient/User modellerine FK YOK).
--
-- ⚠️ APPLY EDILMEDI: Bu migration PR'da kalir. dev/shared DB'ye apply AYRI owner "uygula" talimati
--    bekler (FAZ-0/FAZ-1b precedent; `migrate status` -> `migrate deploy`). BACKFILL YOK (ileriye
--    donuk opt-in; mevcut fee line'lar feeAgreementId=null kalir). Distribution entegrasyonu /
--    service / flag AYRI sonraki dilimlerdir (bu migration onlari ICERMEZ).

-- CreateEnum
CREATE TYPE "FeeAgreementType" AS ENUM ('FLAT_AMOUNT', 'PERCENTAGE_OF_COLLECTION');

-- CreateEnum
CREATE TYPE "FeeAgreementBase" AS ENUM ('GROSS', 'NET_OF_EXPENSE');

-- CreateEnum
CREATE TYPE "FeeAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'TERMINATED');

-- AlterTable
ALTER TABLE "CollectionDispositionLine" ADD COLUMN     "feeAgreementId" TEXT;

-- CreateTable
CREATE TABLE "CaseFeeAgreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseClientId" TEXT NOT NULL,
    "feeType" "FeeAgreementType" NOT NULL,
    "flatAmount" DECIMAL(15,2),
    "percentageBps" INTEGER,
    "feeBase" "FeeAgreementBase" NOT NULL DEFAULT 'GROSS',
    "status" "FeeAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "supersedesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseFeeAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseFeeAgreement_tenantId_caseClientId_status_idx" ON "CaseFeeAgreement"("tenantId", "caseClientId", "status");

-- CreateIndex
CREATE INDEX "CaseFeeAgreement_tenantId_caseClientId_effectiveFrom_idx" ON "CaseFeeAgreement"("tenantId", "caseClientId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CaseFeeAgreement_supersedesId_idx" ON "CaseFeeAgreement"("supersedesId");

-- CreateIndex
CREATE INDEX "CollectionDispositionLine_feeAgreementId_idx" ON "CollectionDispositionLine"("feeAgreementId");

-- AddForeignKey
ALTER TABLE "CaseFeeAgreement" ADD CONSTRAINT "CaseFeeAgreement_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CaseFeeAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
