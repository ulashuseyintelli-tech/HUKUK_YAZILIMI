-- DEBTOR-CPE-TENANT-HARDENING-P1-I01 (bulgu: DEBTOR-IDOR-02)
--
-- Amac: CpeExecutionRecord'a canonical `tenantId` eklemek. Onceden execution kaydinin
-- tenant baglami YALNIZ `caseId` uzerinden dolayli turetilebiliyordu; bu kolon ile
-- retention/incident/raporlama sorgulari tenant'i dogrudan ve dogrulanabilir sekilde
-- filtreleyebilir, ve cross-tenant bir bag DB seviyesinde imkansiz hale gelir.
--
-- Kapsam siniri: YALNIZ tenant binding. Yeni lifecycle alani YOK, yeni statu YOK,
-- mevcut kolonlarin semantigi DEGISMEZ, baska modele DOKUNULMAZ.
--
-- Silent repair YASAK: case'i cozulemeyen (orphan) satir varsa migration FAIL eder;
-- tahminle veya varsayilan tenant ile doldurma YAPILMAZ.
--
-- LIVE MIGRATION APPLY: bu dosya canli/uretim veritabanina BU GOREV KAPSAMINDA
-- UYGULANMAZ. Dogrulama yalnizca disposable/test veritabaninda yapilir; canli
-- uygulama ayri, owner tarafindan yetkilendirilen migration train adimidir.

-- ============================================================
-- 1) tenantId kolonunu NULLABLE ekle (mevcut satirlar bozulmaz)
-- ============================================================
ALTER TABLE "CpeExecutionRecord" ADD COLUMN "tenantId" TEXT;

-- ============================================================
-- 2) BACKFILL: tenantId <- canonical Case.tenantId
--    Case, CPE'nin tenant otoritesidir (CasePolicyEngine her entrypoint'te
--    case sahipligini bu alan uzerinden dogrular).
-- ============================================================
UPDATE "CpeExecutionRecord" r
SET "tenantId" = c."tenantId"
FROM "Case" c
WHERE c."id" = r."caseId";

-- ============================================================
-- 3) ASSERT: cozulemeyen (orphan) satir kalmamali
-- ============================================================
DO $$
DECLARE unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM "CpeExecutionRecord" WHERE "tenantId" IS NULL;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'DEBTOR-CPE-TENANT-HARDENING-P1-I01 BLOCKER: % CpeExecutionRecord satiri icin canonical Case.tenantId cozulemedi (orphan caseId). Silent repair yasaktir.', unresolved_count;
  END IF;
END $$;

-- 3a) ASSERT: cozulen tenantId gercekten var olan bir Tenant'a isaret etmeli
DO $$
DECLARE dangling_count INTEGER;
BEGIN
  SELECT count(*) INTO dangling_count
  FROM "CpeExecutionRecord" r
  LEFT JOIN "Tenant" t ON t."id" = r."tenantId"
  WHERE t."id" IS NULL;
  IF dangling_count > 0 THEN
    RAISE EXCEPTION 'DEBTOR-CPE-TENANT-HARDENING-P1-I01 BLOCKER: % CpeExecutionRecord satirinin tenantId degeri mevcut olmayan bir Tenant''a isaret ediyor.', dangling_count;
  END IF;
END $$;

-- ============================================================
-- 4) SET NOT NULL — artik tenant baglami zorunlu
-- ============================================================
ALTER TABLE "CpeExecutionRecord" ALTER COLUMN "tenantId" SET NOT NULL;

-- ============================================================
-- 5) FK + tenant-aware index'ler
-- ============================================================
ALTER TABLE "CpeExecutionRecord"
  ADD CONSTRAINT "CpeExecutionRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CpeExecutionRecord_tenantId_idx" ON "CpeExecutionRecord"("tenantId");
CREATE INDEX "CpeExecutionRecord_tenantId_caseId_idx" ON "CpeExecutionRecord"("tenantId", "caseId");
CREATE INDEX "CpeExecutionRecord_tenantId_status_createdAt_idx" ON "CpeExecutionRecord"("tenantId", "status", "createdAt");
