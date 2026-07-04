-- TM3 M1R-FU1 — POSTED reversal manuel-marker alanları (additive, nullable).
-- POSTED disposition'a PAYMENT_REVERSED geldiğinde status POSTED KALIR; finansal reversal
-- (ClientStatement/BalanceLedger/payout) YAZILMAZ; yalnız bu marker alanları persist edilir
-- (operasyonel görünürlük — manuel reversal takip kaçağını önler).
-- NOT: Bu migration PR'da kalır; shared/dev DB'ye apply için ayrı "uygula" talimatı beklenir.

-- AlterTable (nullable → mevcut kayıtlar için sorun çıkmaz, backfill gerekmez)
ALTER TABLE "CollectionDisposition" ADD COLUMN "manualReversalRequiredAt" TIMESTAMP(3);
ALTER TABLE "CollectionDisposition" ADD COLUMN "manualReversalReason" TEXT;
ALTER TABLE "CollectionDisposition" ADD COLUMN "manualReversalSourceActionId" TEXT;

-- CreateIndex (manuel reversal bekleyen POSTED disposition'ları tenant-scoped listelemek için)
CREATE INDEX "CollectionDisposition_tenantId_manualReversalRequiredAt_idx" ON "CollectionDisposition"("tenantId", "manualReversalRequiredAt");
