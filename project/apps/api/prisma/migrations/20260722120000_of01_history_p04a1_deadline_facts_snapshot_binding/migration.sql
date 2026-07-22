-- =============================================================================
-- DEBTOR-OF01-HISTORY-P04-A1
-- ServiceOccurrence uzerinde deadline hesabi icin gerekli immutable raw/context
-- fact'ler (addressTypeAtOccurrence, serviceDateRole) + LegalDeadlineSnapshot ->
-- ServiceOccurrence additive, tenant-safe binding (sourceServiceOccurrenceId).
-- Kaynak: DEBTOR-OF01-HISTORY-P04-CONTRACT-01 analiz raporu SS9 (deadline input
-- gap) + SS5 (snapshot binding) + owner P04-A1 GO-IMPLEMENT brief'i.
-- Bu migration YALNIZ additive/constraint-only'dir: data update/backfill/drop/
-- rename/enum value removal YOK.
-- =============================================================================

-- CreateEnum
-- Hangi teslim/tevdi MEKANIZMASI gozlemlendi (dar, repository'de gercekten
-- ayristirilan 3 sinif). Legal rejim (Tk21Type) veya kanal DEGILDIR.
CREATE TYPE "ServiceOccurrenceServiceDateRole" AS ENUM ('DIRECT_DELIVERY', 'MUHTAR_DELIVERY', 'PUBLICATION');

-- AlterTable: ServiceOccurrence - deadline-hesabi icin gerekli context fact'ler.
-- Her ikisi de DB seviyesinde nullable (legacy + basarisiz/yonlendirme sonuclari
-- icin) - zorunluluk asagidaki CHECK constraint'lerle daha dar ifade edilir.
ALTER TABLE "ServiceOccurrence" ADD COLUMN     "addressTypeAtOccurrence" "TebligatAddressType",
ADD COLUMN     "serviceDateRole" "ServiceOccurrenceServiceDateRole";

-- AlterTable: LegalDeadlineSnapshot - additive occurrence-binding (nullable, UNIQUE degil -
-- bir occurrence birden fazla calculationVersion snapshot'ina kaynaklik edebilir).
ALTER TABLE "LegalDeadlineSnapshot" ADD COLUMN     "sourceServiceOccurrenceId" TEXT;

-- CreateIndex
CREATE INDEX "LegalDeadlineSnapshot_tenantId_sourceServiceOccurrenceId_idx" ON "LegalDeadlineSnapshot"("tenantId", "sourceServiceOccurrenceId");

-- CreateIndex
-- LegalDeadlineSnapshot'in tenant-safe composite FK hedefi. id zaten globally-unique
-- oldugu icin bu ek kisitlama yeni bir catisma riski YARATMAZ.
CREATE UNIQUE INDEX "ServiceOccurrence_tenantId_id_sourceTebligatId_key" ON "ServiceOccurrence"("tenantId", "id", "sourceTebligatId");

-- DropForeignKey
-- LegalDeadlineSnapshot.sourceTebligatId'nin tek-kolon FK'si, tenant-scoped composite'e
-- yukseltmek icin kaldiriliyor (ServiceOccurrence->Tebligat / PasswordResetToken->User emsali).
ALTER TABLE "LegalDeadlineSnapshot" DROP CONSTRAINT "LegalDeadlineSnapshot_sourceTebligatId_fkey";

-- AddForeignKey
-- Yukseltilmis composite tenant FK: LegalDeadlineSnapshot(tenantId,sourceTebligatId) -> Tebligat(tenantId,id).
ALTER TABLE "LegalDeadlineSnapshot" ADD CONSTRAINT "LegalDeadlineSnapshot_tenantId_sourceTebligatId_fkey" FOREIGN KEY ("tenantId", "sourceTebligatId") REFERENCES "Tebligat"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Tenant-safe occurrence binding: (tenantId,sourceServiceOccurrenceId,sourceTebligatId) ->
-- ServiceOccurrence(tenantId,id,sourceTebligatId). Bu TEK composite FK hem cross-tenant hem
-- "occurrence ve snapshot farkli Tebligat'a ait" durumunu DB seviyesinde reddeder (P04-CONTRACT-01
-- SS9/TEST-09/TEST-10). sourceServiceOccurrenceId NULL oldugunda (legacy snapshot) constraint
-- trivially saglanir (SQL composite-FK MATCH SIMPLE semantigi).
ALTER TABLE "LegalDeadlineSnapshot" ADD CONSTRAINT "LegalDeadlineSnapshot_tenantId_sourceServiceOccurrenceId_s_fkey" FOREIGN KEY ("tenantId", "sourceServiceOccurrenceId", "sourceTebligatId") REFERENCES "ServiceOccurrence"("tenantId", "id", "sourceTebligatId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- CHECK constraints (owner brief SS6 - non-legacy/legacy ayrimi + SS4 field-pairing).
-- Prisma schema.prisma DSL'i CHECK constraint ifade edemedigi icin elle eklenmistir
-- (ayni yaklasim: 20260721210134_of01_history_p01_service_occurrence).
-- =============================================================================

-- occ_p04a1_address_type_required_for_nonlegacy_check: LEGACY_BASELINE disinda her
-- occurrence icin addressTypeAtOccurrence ZORUNLUDUR (Tebligat.addressType her zaman
-- mevcuttur - "historically unverifiable" istisnasi yalniz LEGACY_BASELINE'a aittir).
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1_address_type_required_for_nonlegacy_check"
    CHECK ("occurrenceType" = 'LEGACY_BASELINE' OR "addressTypeAtOccurrence" IS NOT NULL);

-- occ_p04a1_service_date_role_requires_address_type_check: serviceDateRole doluysa
-- addressTypeAtOccurrence de dolu olmalidir (serviceDateRole HICBIR ZAMAN tek basina
-- gelmez). Ters yon ZORUNLU DEGILDIR: basarisiz/yonlendirme sonuclarinda (ornegin
-- adres bulunamadi) hicbir teslim/tevdi MEKANIZMASI gerceklesmedigi icin
-- serviceDateRole bilincli olarak NULL kalir, addressTypeAtOccurrence yine de
-- doldurulur (context fact, sonuctan BAGIMSIZ her zaman gozlemlenebilir).
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1_service_date_role_requires_address_type_check"
    CHECK ("serviceDateRole" IS NULL OR "addressTypeAtOccurrence" IS NOT NULL);

-- =============================================================================
-- Immutability trigger genisletmesi (owner brief SS4 - "immutable raw/context fact'ler").
-- 20260721210134_of01_history_p01_service_occurrence'in validate_service_occurrence_update()
-- fonksiyonu sabit kodlanmis bir kolon listesi kontrol eder; yeni eklenen 2 kolon bu listede
-- YOKTU (yeni kolonlar varsayilan olarak mutable kalirdi). Ayni fonksiyon adi CREATE OR REPLACE
-- ile genisletilir - trigger'in kendisi (prevent_service_occurrence_factual_update) YENIDEN
-- OLUSTURULMAZ, yalniz cagirdigi fonksiyonun govdesi guncellenir.
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
    OR NEW."addressTypeAtOccurrence" IS DISTINCT FROM OLD."addressTypeAtOccurrence"
    OR NEW."serviceDateRole" IS DISTINCT FROM OLD."serviceDateRole"
  THEN
    RAISE EXCEPTION 'service_occurrence_immutable_violation: only status ACTIVE -> SUPERSEDED transition is allowed, all other columns are immutable'
      USING ERRCODE = '45010';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
