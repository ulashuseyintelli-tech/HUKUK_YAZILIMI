-- OFFICE CAP-02 — ReportingLine Date-Range Integrity Remediation
-- Additive integrity hardening (DB-only CHECK; Prisma model DEĞİŞMEZ). Tek transaction:
-- preflight malformed kayıt bulursa RAISE eder → rollback (kısmi durum YOK, sessiz
-- repair/swap/normalize/close/delete YOK). Data repair NOT AUTHORIZED.

-- Migration preflight: constraint'ten ÖNCE mevcut ReportingLine kayıtlarını doğrula:
-- validUntil dolu VE validFrom > validUntil olan malformed satırlar.
DO $$
DECLARE
  invalid_date_range integer;
BEGIN
  SELECT COALESCE(COUNT(*), 0) INTO invalid_date_range FROM "ReportingLine"
    WHERE "validUntil" IS NOT NULL AND "validFrom" > "validUntil";

  IF invalid_date_range > 0 THEN
    RAISE EXCEPTION 'BLOCKED reporting-line date-range preflight: invalid_date_range=%. Manuel remediation gerekir (sessiz repair/swap/normalize/close/delete yasak).',
      invalid_date_range;
  END IF;
END $$;

-- DB-level integrity: validUntil doluysa validFrom'dan önce olamaz (nihai sınır).
-- Açık-uçlu (validUntil IS NULL) ve eşit (validFrom = validUntil) kayıtlar geçerlidir.
ALTER TABLE "ReportingLine" ADD CONSTRAINT "reporting_line_valid_date_range_ck"
  CHECK ("validUntil" IS NULL OR "validFrom" <= "validUntil");
