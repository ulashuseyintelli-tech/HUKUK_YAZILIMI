-- =============================================================================
-- DEBTOR-OF01-HISTORY-P04-A1-R1
-- P04-B'nin kendi STOP-02 bulgusunu cozer: serviceDateRole=MUHTAR_DELIVERY uc ayri
-- hukuki rejimi (TK_21_1/TK_21_2/TK_20) birbirine karistiriyordu. determinePttResultAction()
-- zaten dogru hesapladigi rejimi (tk21Type) ServiceOccurrence'a kalici olarak tasir.
-- Bu migration YALNIZ additive'dir: yeni enum + nullable kolon + CHECK constraint +
-- immutability trigger genisletmesi. Data update/backfill/drop/rename YOK.
--
-- NOT: `prisma migrate dev --create-only` iki ILGISIZ RenameForeignKey ifadesi de uretti
-- (BankSettlementEvidence/BankTransaction, RCV-COL/banking alani) - bu, bu gorevin
-- schema.prisma degisikligiyle HICBIR ILGISI OLMAYAN, onceden var olan bir shadow-DB
-- diff artefaktidir (FK constraint adlandirma sirasi farkindan kaynaklanan drift).
-- ADDITIVE ONLY kapsamini korumak icin BILINCLI OLARAK CIKARILDI - bu migration
-- yalniz ServiceOccurrence uzerinde calisir.
-- =============================================================================

-- CreateEnum
CREATE TYPE "ServiceOccurrenceRegimeCode" AS ENUM ('DIRECT_DELIVERY', 'TK_21_1', 'TK_21_2', 'TK_20', 'PUBLICATION');

-- AlterTable
ALTER TABLE "ServiceOccurrence" ADD COLUMN     "serviceRegimeCode" "ServiceOccurrenceRegimeCode";

-- =============================================================================
-- CHECK constraints (owner brief SS10 - repository-truth ile dogrulanmis, guvenli
-- eslesme; ayni yaklasim: 20260721210134/20260722120000 migration'lari).
-- =============================================================================

-- occ_p04a1r1_regime_code_pairs_with_date_role_check: serviceRegimeCode'un null'lugu
-- serviceDateRole'un null'luguyla BIREBIR eslesmelidir (biri doluysa digeri de dolu
-- olmali) VE dolu oldugunda ikisi arasindaki eslesme tebligat.service.ts
-- deriveServiceDateRole()'un KENDI mantigiyla (her dalda dogrulanmis) birebir
-- uyumlu olmalidir. Bu, YENI bir hukuki genelleme DEGILDIR - mevcut kodun zaten
-- urettigi eslesmenin DB seviyesinde ifadesidir. LEGACY_BASELINE (historically
-- unverifiable) bu kisitlamadan tamamen MUAFTIR.
-- NOT: `serviceRegimeCode = 'X'` gibi esitlik ifadeleri serviceRegimeCode NULL iken UNKNOWN
-- dondurur (FALSE DEGIL) - Postgres CHECK constraint'i UNKNOWN sonucunu "saglandi" sayar. Bu
-- yuzden her dal ACIKCA IS NOT NULL ile korunur; aksi halde serviceRegimeCode=NULL +
-- serviceDateRole=DIRECT_DELIVERY gibi gecersiz bir satir sessizce KABUL EDILIRDI.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1r1_regime_code_pairs_with_date_role_check"
    CHECK (
      "occurrenceType" = 'LEGACY_BASELINE'
      OR ("serviceRegimeCode" IS NULL AND "serviceDateRole" IS NULL)
      OR (
        "serviceRegimeCode" IS NOT NULL AND "serviceDateRole" IS NOT NULL
        AND (
          ("serviceRegimeCode" = 'DIRECT_DELIVERY' AND "serviceDateRole" = 'DIRECT_DELIVERY')
          OR ("serviceRegimeCode" IN ('TK_21_1', 'TK_21_2', 'TK_20') AND "serviceDateRole" = 'MUHTAR_DELIVERY')
          OR ("serviceRegimeCode" = 'PUBLICATION' AND "serviceDateRole" = 'PUBLICATION')
        )
      )
    );

-- =============================================================================
-- Immutability trigger genisletmesi (P01/P04-A1 emsali - yeni kolon varsayilan
-- olarak mutable kalirdi, ayni fonksiyon adi CREATE OR REPLACE ile genisletilir).
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
    OR NEW."serviceRegimeCode" IS DISTINCT FROM OLD."serviceRegimeCode"
  THEN
    RAISE EXCEPTION 'service_occurrence_immutable_violation: only status ACTIVE -> SUPERSEDED transition is allowed, all other columns are immutable'
      USING ERRCODE = '45010';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
