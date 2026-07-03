-- P0-1 · Collection idempotency (S9 blocker kapanışı)
-- Amaç: aynı gerçek tahsilatın çift kaydını (double-click / network retry / duplicate
--   webhook / paralel istek) DB seviyesinde engellemek. Üç katman:
--     (A) Collection.idempotencyKey + (tenantId, idempotencyKey) unique  → universal dedup
--     (B) external-source partial unique (tenant, case, source, sourceId) → dış-kaynak dedup
--     (C) ledger-posting partial unique (tenant, collectionId, PAYMENT)   → çift authoritative posting engeli
-- Kaba (caseId, amount, date) unique KULLANILMAZ: aynı gün-tutar meşru ikinci ödeme mümkün kalır.
-- Backfill fail-closed (outbox tenantId deseni): NULL kalırsa SET NOT NULL patlar.

-- ── (A.1) idempotencyKey kolonu (önce nullable) ─────────────────────────────
ALTER TABLE "Collection" ADD COLUMN "idempotencyKey" TEXT;

-- ── (A.2) Legacy satırları deterministik key ile backfill ───────────────────
--   id cuid (satır-bazında unique) → 'legacy:'||id tenant içinde de çakışmaz.
UPDATE "Collection" SET "idempotencyKey" = 'legacy:' || "id" WHERE "idempotencyKey" IS NULL;

-- ── (A.3) Fail-closed guard: NULL kalan varsa açık hata ─────────────────────
DO $$
DECLARE
  null_count BIGINT;
BEGIN
  SELECT count(*) INTO null_count FROM "Collection" WHERE "idempotencyKey" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Collection.idempotencyKey backfill eksik: % satır NULL — NOT NULL uygulanamaz', null_count;
  END IF;
END $$;

-- ── (A.4) NOT NULL + universal idempotency unique ───────────────────────────
ALTER TABLE "Collection" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "Collection_tenantId_idempotencyKey_key"
  ON "Collection" ("tenantId", "idempotencyKey");

-- ── (B) External-source dedup partial unique ────────────────────────────────
--   Mevcut app pre-check'in (caseId, sourceType, sourceId) DB backstop'u.
--   sourceId NULL veya CANCELLED satırlar hariç → MANUAL/no-source etkilenmez,
--   iptal edilmiş kayıt yeniden kaydı bloklamaz. Cross-case aynı sourceId serbest.
DO $$
DECLARE
  dup_count BIGINT;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT 1 FROM "Collection"
    WHERE "sourceId" IS NOT NULL AND "status" <> 'CANCELLED'
    GROUP BY "tenantId", "caseId", "sourceType", "sourceId"
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'External-source duplicate Collection tespit edildi (% grup) — index kurulamaz; önce mutabakat/iptal gerekir (silme YASAK)', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX "Collection_source_dedupe_key"
  ON "Collection" ("tenantId", "caseId", "sourceType", "sourceId")
  WHERE "sourceId" IS NOT NULL AND "status" <> 'CANCELLED';

-- ── (C) Ledger-posting idempotency partial unique ───────────────────────────
--   Bir collection için tek CONFIRMED PAYMENT LedgerEntry. REVERSAL/ADJUST/CANCELLED
--   bloklanmaz (farklı entryType/status). Çoklu satır LedgerAllocation altında → etkilenmez.
DO $$
DECLARE
  dup_count BIGINT;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT 1 FROM "LedgerEntry"
    WHERE "collectionId" IS NOT NULL AND "entryType" = 'PAYMENT' AND "status" = 'CONFIRMED'
    GROUP BY "tenantId", "collectionId"
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Aynı collection için çift CONFIRMED PAYMENT LedgerEntry tespit edildi (% grup) — index kurulamaz; önce mutabakat gerekir (silme YASAK)', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX "LedgerEntry_collection_payment_key"
  ON "LedgerEntry" ("tenantId", "collectionId")
  WHERE "collectionId" IS NOT NULL AND "entryType" = 'PAYMENT' AND "status" = 'CONFIRMED';
