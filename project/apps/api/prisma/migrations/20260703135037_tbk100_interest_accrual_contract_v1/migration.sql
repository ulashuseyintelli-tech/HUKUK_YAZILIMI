-- CreateEnum
CREATE TYPE "InterestAccrualStatus" AS ENUM ('ACCRUES', 'NO_INTEREST', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InterestStartDateProvenance" AS ENUM ('DOCUMENT_DUE_DATE', 'CONTRACTUAL_DUE_DATE', 'DEFAULT_NOTICE_DATE', 'JUDGMENT_DATE', 'JUDGMENT_FINALIZATION_DATE', 'ENFORCEMENT_PROCEEDING_DATE', 'MANUAL_LAWYER_CONFIRMED');

-- AlterTable
ALTER TABLE "ClaimItem" ADD COLUMN     "interestAccrualStatus" "InterestAccrualStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "interestStartDateProvenance" "InterestStartDateProvenance",
ADD COLUMN     "noInterestConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "noInterestConfirmedById" TEXT,
ADD COLUMN     "noInterestReason" TEXT;

-- TBK100 Interest Accrual Contract v1 — deterministic itemType-based backfill (owner-approved,
-- 2026-07-03). Bu bir hukuki tahmin DEĞİL: itemType zaten bilinen, değişmeyen bir sınıflandırma.
-- PRINCIPAL/INTEREST kalemleri kolon varsayımıyla (UNKNOWN) kalır, ayrı UPDATE gerekmez.
-- Audit alanları (noInterestReason/noInterestConfirmedById/At) BİLİNÇLİ OLARAK boş bırakılır: bu yeni
-- bir karar değil, mevcut davranışın (sabit tutar muamelesi) açık hale getirilmesidir.
-- ClaimItemType gerçek enum üyeleri (schema.prisma:5026-5041) — 'COMMISSION' claim-item-classifier.ts'in
-- ancillary-mapping sözlüğünde var ama Prisma ClaimItemType enum'unda YOK (önceden var olan tutarsızlık,
-- bu migration'da dokunulmadı); WHERE listesi yalnız GERÇEK enum üyelerini içerir.
UPDATE "ClaimItem" SET "interestAccrualStatus" = 'NO_INTEREST'
WHERE "itemType" IN (
  'EXPENSE', 'FEE', 'ATTORNEY_FEE', 'CHECK_PENALTY', 'PENALTY',
  'CONTRACTUAL_PENALTY', 'OTHER', 'TAX_KDV', 'TAX_BSMV', 'TAX_KKDF'
);
