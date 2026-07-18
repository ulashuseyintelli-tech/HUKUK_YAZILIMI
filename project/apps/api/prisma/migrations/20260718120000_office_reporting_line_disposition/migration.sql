-- OFFICE CAP-02 — Top-Level Disposition Persistence (Option B: ReportingLine extension)
-- Additive + backward-compatible. Bütün migration TEK transaction'da koşar: preflight
-- anomali bulursa RAISE eder → her şey rollback olur (kısmi durum YOK, sessiz onarım YOK).

-- CreateEnum
CREATE TYPE "ReportingLineDisposition" AS ENUM ('MANAGED', 'TOP_LEVEL');

-- AlterTable: disposition kolonu (mevcut satırlar DEFAULT ile MANAGED) + managerUserId nullable
ALTER TABLE "ReportingLine" ADD COLUMN "disposition" "ReportingLineDisposition" NOT NULL DEFAULT 'MANAGED';
ALTER TABLE "ReportingLine" ALTER COLUMN "managerUserId" DROP NOT NULL;

-- Migration preflight: integrity constraint'lerden ÖNCE mevcut kanonik veriyi doğrula.
-- Anomali varsa BLOCKED — exact count/category ile; sessiz normalize/merge/delete YASAK.
DO $$
DECLARE
  dup_active integer;
  self_manager_active integer;
  managed_without_manager integer;
BEGIN
  SELECT COALESCE(COUNT(*), 0) INTO dup_active FROM (
    SELECT "tenantId", "actorUserId"
    FROM "ReportingLine"
    WHERE "validUntil" IS NULL
    GROUP BY "tenantId", "actorUserId"
    HAVING COUNT(*) > 1
  ) d;

  SELECT COALESCE(COUNT(*), 0) INTO self_manager_active FROM "ReportingLine"
    WHERE "validUntil" IS NULL
      AND "managerUserId" IS NOT NULL
      AND "actorUserId" = "managerUserId";

  SELECT COALESCE(COUNT(*), 0) INTO managed_without_manager FROM "ReportingLine"
    WHERE "disposition" = 'MANAGED' AND "managerUserId" IS NULL;

  IF dup_active > 0 OR self_manager_active > 0 OR managed_without_manager > 0 THEN
    RAISE EXCEPTION 'BLOCKED reporting-line disposition preflight: duplicate_active=%, self_manager_active=%, managed_without_manager=%. Manuel remediation gerekir (sessiz normalize/merge/delete yasak).',
      dup_active, self_manager_active, managed_without_manager;
  END IF;
END $$;

-- DB-level integrity: disposition <-> managerUserId nullability (app-level sayım TEK sınır DEĞİL)
ALTER TABLE "ReportingLine" ADD CONSTRAINT "reporting_line_disposition_manager_ck"
  CHECK (
    ("disposition" = 'MANAGED' AND "managerUserId" IS NOT NULL)
    OR ("disposition" = 'TOP_LEVEL' AND "managerUserId" IS NULL)
  );

-- DB-level integrity: aktör başına TEK aktif disposition (yalnız validUntil IS NULL için)
CREATE UNIQUE INDEX "reporting_line_one_active_per_actor"
  ON "ReportingLine" ("tenantId", "actorUserId")
  WHERE "validUntil" IS NULL;
