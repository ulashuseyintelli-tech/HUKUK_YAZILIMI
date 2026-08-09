-- C1-B05-B — TYPED EXPENSE_ACTUAL posting + posting idempotency (YALNIZ additive/backward-compatible)
--
-- Owner kararı: generic BalanceLedger DEBIT gerçekleşen-masraf bildiriminin trigger'ı OLAMAZ.
-- Gerçek masraf yazım anında durable+typed sınıflandırılır; yalnız yetkili posting komutu üretir.
-- Tarihsel generic DEBIT satırları backfill EDİLMEZ (entryKind/postingKey NULL kalır).

-- 1) Typed sınıflandırma enum'u (yeni tip — mevcut hiçbir tipe dokunmaz)
CREATE TYPE "BalanceLedgerEntryKind" AS ENUM ('EXPENSE_ACTUAL');

-- 2) BalanceLedger additive kolonlar (NULL default → mevcut satırlar değişmez, tablo rewrite yok)
ALTER TABLE "BalanceLedger" ADD COLUMN "entryKind" "BalanceLedgerEntryKind";
ALTER TABLE "BalanceLedger" ADD COLUMN "postingKey" TEXT;

-- 3) Posting idempotency: aynı (tenantId, postingKey) için EN FAZLA 1 satır.
--    PostgreSQL unique index NULL'ları ayrık sayar → tüm mevcut satırlar (postingKey NULL) serbest.
CREATE UNIQUE INDEX "BalanceLedger_tenantId_postingKey_key" ON "BalanceLedger"("tenantId", "postingKey");

-- 4) Gerçekleşen-masraf bildirimi için ayrı şablon kategorisi (additive enum value)
ALTER TYPE "MessageTemplateCategory" ADD VALUE 'EXPENSE_ACTUAL';
