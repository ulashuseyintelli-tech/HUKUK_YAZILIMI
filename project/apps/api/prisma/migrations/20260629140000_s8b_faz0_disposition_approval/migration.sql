-- S8-B FAZ-0 — Disposition approval lifecycle
-- HELD_PENDING_DISTRIBUTION → DISTRIBUTION_RECOMMENDED → DISTRIBUTION_APPROVED → POSTED.
-- Politikanın çekirdek vaadi: Partner/Manager onayı (P4) olmadan disposition POSTED olamaz.
-- NOT: Bu migration PR'da kalır; shared/dev DB'ye apply için ayrı "uygula" talimatı beklenir.
-- (ALTER TYPE ADD VALUE: yalnız EKLER, aynı migration'da KULLANILMAZ → PG 12+ güvenli; M2 precedent ile aynı desen.)

-- AlterEnum: onay yaşam döngüsü statüleri (additive)
ALTER TYPE "CollectionDispositionStatus" ADD VALUE 'DISTRIBUTION_RECOMMENDED';
ALTER TYPE "CollectionDispositionStatus" ADD VALUE 'DISTRIBUTION_APPROVED';

-- AlterTable: recommend/approve damgaları + P4 OfficeApprovalRequest referansı (scalar; postedAt/postedById ZATEN var).
ALTER TABLE "CollectionDisposition" ADD COLUMN "recommendedAt" TIMESTAMP(3);
ALTER TABLE "CollectionDisposition" ADD COLUMN "recommendedById" TEXT;
ALTER TABLE "CollectionDisposition" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "CollectionDisposition" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "CollectionDisposition" ADD COLUMN "approvalRequestId" TEXT;
