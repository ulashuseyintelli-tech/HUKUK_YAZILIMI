-- =============================================================================
-- DEBTOR-OF01-HISTORY-P01
-- ServiceOccurrence: immutable/supersedable "gozlemlenen hukuki olgu" katmani.
-- Kaynak: DEBTOR-DBP-04 §12.2 (ServiceOccurrence Owner-Ratified Contract), PR #1498.
-- Bu migration YALNIZ additive schema foundation'dir: backfill, runtime wiring,
-- servis/controller/DTO/API entegrasyonu bu is'in KAPSAMI DISINDADIR.
-- =============================================================================

-- CreateEnum
CREATE TYPE "ServiceOccurrenceType" AS ENUM ('POSTAL_DELIVERY_RESULT', 'ELECTRONIC_DELIVERY_RESULT', 'MANUAL_ATTESTATION', 'LEGACY_BASELINE');

-- CreateEnum
CREATE TYPE "ServiceOccurrenceTimePrecision" AS ENUM ('DATE_ONLY', 'EXACT_TIME');

-- CreateEnum
CREATE TYPE "ServiceOccurrenceStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ServiceOccurrenceProvenanceStatus" AS ENUM ('LEGACY_CURRENT_STATE');

-- CreateTable
CREATE TABLE "ServiceOccurrence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseDebtorId" TEXT,
    "sourceTebligatId" TEXT NOT NULL,
    "occurrenceType" "ServiceOccurrenceType" NOT NULL,
    "sourceSystemCode" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "timePrecision" "ServiceOccurrenceTimePrecision" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "recordedByUserId" TEXT,
    "recordedBySystem" TEXT,
    "barcodeNo" TEXT,
    "sourceNote" VARCHAR(500),
    "sourcePayloadHash" TEXT,
    "evidenceReference" TEXT,
    "supersedesOccurrenceId" TEXT,
    "status" "ServiceOccurrenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "correctionReasonCode" TEXT,
    "provenanceStatus" "ServiceOccurrenceProvenanceStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOccurrence_supersedesOccurrenceId_key" ON "ServiceOccurrence"("supersedesOccurrenceId");

-- CreateIndex
CREATE INDEX "ServiceOccurrence_tenantId_sourceTebligatId_idx" ON "ServiceOccurrence"("tenantId", "sourceTebligatId");

-- CreateIndex
CREATE INDEX "ServiceOccurrence_tenantId_caseId_idx" ON "ServiceOccurrence"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "ServiceOccurrence_tenantId_caseDebtorId_idx" ON "ServiceOccurrence"("tenantId", "caseDebtorId");

-- CreateIndex
CREATE INDEX "ServiceOccurrence_tenantId_occurredOn_idx" ON "ServiceOccurrence"("tenantId", "occurredOn");

-- CreateIndex
CREATE INDEX "ServiceOccurrence_sourceTebligatId_status_idx" ON "ServiceOccurrence"("sourceTebligatId", "status");

-- CreateIndex
CREATE INDEX "ServiceOccurrence_barcodeNo_idx" ON "ServiceOccurrence"("barcodeNo");

-- CreateIndex
-- Tenant-scoped composite FK hedefi (bkz. asagida ServiceOccurrence_tenantId_sourceTebligatId_fkey).
-- Prisma schema.prisma DSL'i bu index'i @@unique olarak temsil eder (OFFICE-AUTH-P02-HARDENING-R01
-- User_tenantId_id_key emsaliyle ayni desen).
CREATE UNIQUE INDEX "Tebligat_tenantId_id_key" ON "Tebligat"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "ServiceOccurrence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "ServiceOccurrence_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Tenant-scoped composite FK: cross-tenant bir sourceTebligatId atamasi DB seviyesinde reddedilir.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "ServiceOccurrence_tenantId_sourceTebligatId_fkey" FOREIGN KEY ("tenantId", "sourceTebligatId") REFERENCES "Tebligat"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "ServiceOccurrence_supersedesOccurrenceId_fkey" FOREIGN KEY ("supersedesOccurrenceId") REFERENCES "ServiceOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- CHECK constraints (DBP-04 §12.2 OD-SO-02/03/04 field-contract invariantlari).
-- Prisma schema.prisma DSL'i CHECK constraint ifade edemedigi icin elle eklenmistir
-- (20260721010000_office_auth_p02_hardening_r01_composite_fk ile ayni yaklasim).
-- =============================================================================

-- occ_time_precision_date_only_check: timePrecision=DATE_ONLY ise occurredAt bos olmalidir.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_time_precision_date_only_check"
    CHECK ("timePrecision" <> 'DATE_ONLY' OR "occurredAt" IS NULL);

-- occ_time_precision_exact_time_check: timePrecision=EXACT_TIME ise occurredAt dolu olmalidir.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_time_precision_exact_time_check"
    CHECK ("timePrecision" <> 'EXACT_TIME' OR "occurredAt" IS NOT NULL);

-- occ_supersedes_requires_reason_check: bir occurrence baskasini supersede ediyorsa gerekce zorunludur.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_supersedes_requires_reason_check"
    CHECK ("supersedesOccurrenceId" IS NULL OR "correctionReasonCode" IS NOT NULL);

-- occ_reason_requires_supersedes_check: gerekce kodu yalniz gercek bir supersession baglaminda anlamlidir.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_reason_requires_supersedes_check"
    CHECK ("correctionReasonCode" IS NULL OR "supersedesOccurrenceId" IS NOT NULL);

-- occ_actor_required_check: her occurrence bir insan (recordedByUserId) veya sistem (recordedBySystem) atifina sahip olmalidir.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_actor_required_check"
    CHECK ("recordedByUserId" IS NOT NULL OR "recordedBySystem" IS NOT NULL);

-- occ_legacy_baseline_system_check: LEGACY_BASELINE kaydi OD-SO-03 sabitlerine (recordedBySystem=LEGACY_MIGRATION, recordedByUserId=NULL) uymalidir.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_legacy_baseline_system_check"
    CHECK ("occurrenceType" <> 'LEGACY_BASELINE' OR ("recordedBySystem" = 'LEGACY_MIGRATION' AND "recordedByUserId" IS NULL));

-- occ_no_self_supersession_check: bir occurrence kendisini supersede edemez.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_no_self_supersession_check"
    CHECK ("supersedesOccurrenceId" IS NULL OR "supersedesOccurrenceId" <> "id");

-- =============================================================================
-- Immutability / supersession guard triggerlari.
-- DELETE: repo-genelinde mevcut paylasilan raise_immutable_error() fonksiyonu
-- (00000000000001_legal_kernel_triggers) yeniden kullanilir; yeni bir generic
-- immutability framework'u OLUSTURULMAZ.
-- UPDATE: yalniz status ACTIVE -> SUPERSEDED gecisine izin veren DAR bir guard;
-- diger tum factual kolonlar IS DISTINCT FROM ile immutable kalir.
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_service_occurrence_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status"
     AND NOT (OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED') THEN
    RAISE EXCEPTION 'service_occurrence_illegal_status_transition: only ACTIVE -> SUPERSEDED is allowed, got % -> %',
      OLD."status", NEW."status"
      USING ERRCODE = '45012';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."caseId" IS DISTINCT FROM OLD."caseId"
    OR NEW."caseDebtorId" IS DISTINCT FROM OLD."caseDebtorId"
    OR NEW."sourceTebligatId" IS DISTINCT FROM OLD."sourceTebligatId"
    OR NEW."occurrenceType" IS DISTINCT FROM OLD."occurrenceType"
    OR NEW."sourceSystemCode" IS DISTINCT FROM OLD."sourceSystemCode"
    OR NEW."sourceCode" IS DISTINCT FROM OLD."sourceCode"
    OR NEW."occurredOn" IS DISTINCT FROM OLD."occurredOn"
    OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
    OR NEW."timePrecision" IS DISTINCT FROM OLD."timePrecision"
    OR NEW."recordedAt" IS DISTINCT FROM OLD."recordedAt"
    OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
    OR NEW."recordedByUserId" IS DISTINCT FROM OLD."recordedByUserId"
    OR NEW."recordedBySystem" IS DISTINCT FROM OLD."recordedBySystem"
    OR NEW."barcodeNo" IS DISTINCT FROM OLD."barcodeNo"
    OR NEW."sourceNote" IS DISTINCT FROM OLD."sourceNote"
    OR NEW."sourcePayloadHash" IS DISTINCT FROM OLD."sourcePayloadHash"
    OR NEW."evidenceReference" IS DISTINCT FROM OLD."evidenceReference"
    OR NEW."supersedesOccurrenceId" IS DISTINCT FROM OLD."supersedesOccurrenceId"
    OR NEW."correctionReasonCode" IS DISTINCT FROM OLD."correctionReasonCode"
    OR NEW."provenanceStatus" IS DISTINCT FROM OLD."provenanceStatus"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'service_occurrence_immutable_violation: only status ACTIVE -> SUPERSEDED transition is allowed, all other columns are immutable'
      USING ERRCODE = '45010';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_service_occurrence_factual_update ON "ServiceOccurrence";
CREATE TRIGGER prevent_service_occurrence_factual_update
  BEFORE UPDATE ON "ServiceOccurrence"
  FOR EACH ROW EXECUTE FUNCTION validate_service_occurrence_update();

DROP TRIGGER IF EXISTS prevent_service_occurrence_delete ON "ServiceOccurrence";
CREATE TRIGGER prevent_service_occurrence_delete
  BEFORE DELETE ON "ServiceOccurrence"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();
