-- outbox-tenancy Adım B (D2): legacy NULL backfill + NOT NULL enforcement.
-- add_outbox_tenant_id (20260611000000) nullable kolonu ekledi; bu migration:
--   1) NULL tenantId'leri Case.tenantId'den backfill eder (Case otoriter kaynak;
--      resolveTenantIdOrThrow ile aynı join: caseId = Case.id),
--   2) hâlâ NULL kalan (orphan caseId / Case yok) satır varsa FAIL-CLOSED abort eder
--      (force NOT NULL yok, orphan SİLME yok — bilinçli ele alınsın),
--   3) kolonu NOT NULL'a çevirir.
-- Backfill set-based + idempotent (yalnız NULL satırlara dokunur). Prisma migration tek tx →
-- guard RAISE ederse tüm migration rollback (atomik).

-- 1) Backfill from Case (authoritative tenant source)
UPDATE "IcrabotOutboxAction" o
SET "tenantId" = c."tenantId"
FROM "Case" c
WHERE o."caseId" = c."id"
  AND o."tenantId" IS NULL;

-- 2) Fail-closed guard: orphan/NULL kalırsa migration'ı patlat (rollback).
DO $$
DECLARE
  remaining_null bigint;
BEGIN
  SELECT count(*) INTO remaining_null
  FROM "IcrabotOutboxAction"
  WHERE "tenantId" IS NULL;

  IF remaining_null > 0 THEN
    RAISE EXCEPTION 'outbox_tenant_backfill_incomplete: % satir tenantId NULL kaldi (orphan caseId, Case yok). Migration abort; orphan satirlar ayrica ele alinmali (bu migrationda SILME yok).', remaining_null;
  END IF;
END $$;

-- 3) Enforce NOT NULL
ALTER TABLE "IcrabotOutboxAction" ALTER COLUMN "tenantId" SET NOT NULL;
