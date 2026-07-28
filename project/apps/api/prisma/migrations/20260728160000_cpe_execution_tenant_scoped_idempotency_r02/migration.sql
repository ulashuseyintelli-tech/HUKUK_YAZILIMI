-- UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02
-- CpeExecutionRecord.executionId: GLOBAL unique -> TENANT-SCOPED unique.
--
-- BULGU
-- `executionId` istemci govdesinden gelir (`ActionExecutedDto.executionId`,
-- POST /policy-engine/cases/:caseId/action-executed). Global `@unique` oldugu icin
-- tenant'lar tek idempotency namespace'ini paylasiyordu:
--   1) `findUnique({ executionId })` BASKA tenant'in kaydini dondurebiliyordu
--      -> execution status/errorCode capraz tenant sizintisi,
--   2) cagiran tenant'in kaydi "duplicate" sayilip state transition'i SESSIZCE atlaniyordu
--      -> baska bir tenant'in aksiyon hattini dondurabilen capraz tenant DoS.
--
-- Emsal: UyapOperation.@@unique([tenantId, idempotencyKey]) — idempotency namespace'i
-- tenant basinadir (UYAP-CONST-004).
--
-- VERI GUVENLIGI
-- Yeni kisit (tenantId, executionId) mevcut GLOBAL (executionId) kisitindan kesinlikle
-- DAHA ZAYIFTIR: global olarak tekil olan her satir, tenant basina da tekildir. Bu nedenle
-- mevcut veriyle catisma URETEMEZ. Yine de sessiz varsayim yerine ACIK dogrulama yapilir:
-- ayni (tenantId, executionId) ciftinden birden fazla satir bulunursa migration DURUR
-- (fail-closed). Sessiz onarim / veri silme / deduplikasyon YAPILMAZ.

DO $$
DECLARE
  duplicate_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "tenantId", "executionId"
    FROM "CpeExecutionRecord"
    GROUP BY "tenantId", "executionId"
    HAVING COUNT(*) > 1
  ) AS d;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02: % adet (tenantId, executionId) cifti birden fazla CpeExecutionRecord satirina sahip. Tenant-scoped idempotency kisiti uygulanamaz; veri once incelenmelidir (otomatik onarim YAPILMAZ).',
      duplicate_count;
  END IF;
END $$;

-- Tenant-scoped idempotency kisiti ONCE eklenir: hicbir anda kisitsiz pencere olusmaz.
CREATE UNIQUE INDEX "CpeExecutionRecord_tenantId_executionId_key"
  ON "CpeExecutionRecord" ("tenantId", "executionId");

-- Global kisit kaldirilir. `@@index([executionId])` (arama/raporlama icin) ayri olarak
-- asagida yeniden olusturulur — global unique index onu kapsiyordu.
ALTER TABLE "CpeExecutionRecord" DROP CONSTRAINT IF EXISTS "CpeExecutionRecord_executionId_key";
DROP INDEX IF EXISTS "CpeExecutionRecord_executionId_key";

CREATE INDEX IF NOT EXISTS "CpeExecutionRecord_executionId_idx"
  ON "CpeExecutionRecord" ("executionId");
