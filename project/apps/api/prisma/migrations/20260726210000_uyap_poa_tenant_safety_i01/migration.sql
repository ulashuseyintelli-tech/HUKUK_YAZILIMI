-- UYAP-POA-TENANT-SAFETY-I01 (D-1 + D-2, owner DECISION-2: YALNIZ TENANT SAFETY DELTA)
--
-- Amac: ClientPowerOfAttorney ve PoaLawyer'a canonical tenantId eklemek ve cross-tenant
-- POA/Lawyer baglarini DB seviyesinde imkansiz kilmak (INV-07, INV-08).
--
-- Owner sinirlari: yeni lifecycle alani YOK, POA<->Case relation YOK, delegation tablosu YOK,
-- legacy PowerOfAttorney modeline DOKUNULMAZ.
--
-- Silent repair YASAK: cozulemeyen veya cross-tenant kayit varsa migration FAIL eder.

-- ============================================================
-- 1) tenantId kolonlarini NULLABLE ekle
-- ============================================================
ALTER TABLE "ClientPowerOfAttorney" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PoaLawyer" ADD COLUMN "tenantId" TEXT;

-- ============================================================
-- 2) ClientPowerOfAttorney.tenantId <- canonical Client.tenantId
-- ============================================================
UPDATE "ClientPowerOfAttorney" p
SET "tenantId" = c."tenantId"
FROM "Client" c
WHERE c."id" = p."clientId";

-- 2a) FAIL: client'i cozulemeyen POA (orphan) — tahminle tenant atanmaz
DO $$
DECLARE unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO unresolved_count FROM "ClientPowerOfAttorney" WHERE "tenantId" IS NULL;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'UYAP-POA-TENANT-SAFETY-I01 BLOCKER: % ClientPowerOfAttorney satiri icin canonical Client.tenantId cozulemedi (orphan clientId). Silent repair yasaktir.', unresolved_count;
  END IF;
END $$;

-- ============================================================
-- 3) PoaLawyer.tenantId <- POA tenant; Lawyer tenant ile DOGRULA
-- ============================================================

-- 3a) FAIL: POA tenant'i ile Lawyer tenant'i uyusmayan mevcut bag (cross-tenant veri)
DO $$
DECLARE cross_tenant_count INTEGER;
BEGIN
  SELECT count(*) INTO cross_tenant_count
  FROM "PoaLawyer" pl
  JOIN "ClientPowerOfAttorney" p ON p."id" = pl."poaId"
  JOIN "Lawyer" l ON l."id" = pl."lawyerId"
  WHERE p."tenantId" IS DISTINCT FROM l."tenantId";
  IF cross_tenant_count > 0 THEN
    RAISE EXCEPTION 'UYAP-POA-TENANT-SAFETY-I01 BLOCKER: % PoaLawyer satirinda POA tenant != Lawyer tenant. Cross-tenant veri repair/tasima/silme YAPILMAZ; owner karari gerekir.', cross_tenant_count;
  END IF;
END $$;

-- 3b) FAIL: POA veya Lawyer kaydi bulunmayan PoaLawyer (orphan)
DO $$
DECLARE orphan_count INTEGER;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "PoaLawyer" pl
  LEFT JOIN "ClientPowerOfAttorney" p ON p."id" = pl."poaId"
  LEFT JOIN "Lawyer" l ON l."id" = pl."lawyerId"
  WHERE p."id" IS NULL OR l."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'UYAP-POA-TENANT-SAFETY-I01 BLOCKER: % orphan PoaLawyer satiri (POA veya Lawyer yok).', orphan_count;
  END IF;
END $$;

-- 3c) Backfill (POA ve Lawyer tenant'i yukarida esit dogrulandi)
UPDATE "PoaLawyer" pl
SET "tenantId" = p."tenantId"
FROM "ClientPowerOfAttorney" p
WHERE p."id" = pl."poaId";

-- 3d) FAIL: kalan NULL
DO $$
DECLARE unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO unresolved_count FROM "PoaLawyer" WHERE "tenantId" IS NULL;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'UYAP-POA-TENANT-SAFETY-I01 BLOCKER: % PoaLawyer satiri icin tenantId cozulemedi.', unresolved_count;
  END IF;
END $$;

-- ============================================================
-- 4) NOT NULL
-- ============================================================
ALTER TABLE "ClientPowerOfAttorney" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PoaLawyer" ALTER COLUMN "tenantId" SET NOT NULL;

-- ============================================================
-- 5) Composite FK hedefleri (repo precedent: UyapOperation composite tenant-safe FK)
-- ============================================================
CREATE UNIQUE INDEX "ClientPowerOfAttorney_id_tenantId_key" ON "ClientPowerOfAttorney"("id", "tenantId");

-- ============================================================
-- 6) Tenant-safe composite FK'lar — eski tek-alanli FK'lar birakilir
-- ============================================================
ALTER TABLE "ClientPowerOfAttorney" DROP CONSTRAINT IF EXISTS "ClientPowerOfAttorney_clientId_fkey";
ALTER TABLE "ClientPowerOfAttorney"
  ADD CONSTRAINT "ClientPowerOfAttorney_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PoaLawyer" DROP CONSTRAINT IF EXISTS "PoaLawyer_poaId_fkey";
ALTER TABLE "PoaLawyer"
  ADD CONSTRAINT "PoaLawyer_poaId_tenantId_fkey"
  FOREIGN KEY ("poaId", "tenantId") REFERENCES "ClientPowerOfAttorney"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PoaLawyer" DROP CONSTRAINT IF EXISTS "PoaLawyer_lawyerId_fkey";
ALTER TABLE "PoaLawyer"
  ADD CONSTRAINT "PoaLawyer_lawyerId_tenantId_fkey"
  FOREIGN KEY ("lawyerId", "tenantId") REFERENCES "Lawyer"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 7) Tenant sorgu index'leri
-- ============================================================
CREATE INDEX "ClientPowerOfAttorney_tenantId_idx" ON "ClientPowerOfAttorney"("tenantId");
CREATE INDEX "ClientPowerOfAttorney_tenantId_clientId_idx" ON "ClientPowerOfAttorney"("tenantId", "clientId");
CREATE INDEX "PoaLawyer_tenantId_idx" ON "PoaLawyer"("tenantId");
CREATE INDEX "PoaLawyer_tenantId_lawyerId_idx" ON "PoaLawyer"("tenantId", "lawyerId");
