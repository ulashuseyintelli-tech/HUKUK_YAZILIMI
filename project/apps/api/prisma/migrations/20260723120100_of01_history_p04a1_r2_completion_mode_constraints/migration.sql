-- =============================================================================
-- DEBTOR-OF01-HISTORY-P04-A1-R2 (2/2 - CHECK constraint + immutability trigger)
-- Onceki migration'da (20260723120000) eklenen serviceCompletionMode/
-- substituteRecipientBasis kolonlarini ve ServiceOccurrenceRegimeCode'un yeni
-- degerlerini (IMMEDIATE_SERVICE/TK_20_TEMPORARY_ABSENCE/ELECTRONIC) referans
-- eden constraint'ler AYRI bir migration dosyasinda olmak ZORUNDADIR (Postgres
-- ADD VALUE transaction kisiti - bkz. onceki dosyanin aciklamasi).
--
-- OWNER "STOP-03 RESOLUTION" (TK_21_1/TK_21_2 notu): serviceCompletionMode, TK_21_1/TK_21_2
-- icin BU GOREVDE deterministik degildir (mevcut pttResult sinyali "muhtarliga birakildi"
-- disinda ihbarname yapistirilip yapistirilmadigini AYRICA dogrulamiyor - owner'in kendi
-- talimati: "Sirf tk21Type degerinden completion mode uydurulmayacak", deterministik degilse
-- HARD STOP/REPORT). Bu yuzden serviceCompletionMode, serviceRegimeCode/serviceDateRole'den
-- BAGIMSIZ nullable birakilir (R1'in "3'u birlikte dolu/null" kuralinin SIKILASTIRILMASI
-- DEGIL) - yalniz TK_20_TEMPORARY_ABSENCE icin operator-saglanan zorunlu girdi oldugu icin
-- AYRI, DAR bir constraint ile non-null zorunlu kilinir. Bu tasarim TK_21_1/TK_21_2'nin R1'de
-- zaten calisan yazimini KORUR (regresyon YOK).
-- =============================================================================

-- occ_p04a1r1_regime_code_pairs_with_date_role_check YERINE gecer: mantik AYNI (yalniz
-- serviceRegimeCode<->serviceDateRole eslesmesi, R1'deki gibi) - degisen SADECE yeniden
-- adlandirilan deger isimleridir (DIRECT_DELIVERY->IMMEDIATE_SERVICE, TK_20->TK_20_TEMPORARY_ABSENCE).
-- Eski DIRECT_DELIVERY/TK_20 degerleri bu constraint'in OR listesinde BILINCLI OLARAK yer
-- almaz (write-path bir daha asla yazmayacak) - yani artik constraint tarafindan da REDDEDILIR.
ALTER TABLE "ServiceOccurrence" DROP CONSTRAINT "occ_p04a1r1_regime_code_pairs_with_date_role_check";

ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1r2_regime_code_pairs_with_date_role_check"
    CHECK (
      "occurrenceType" = 'LEGACY_BASELINE'
      OR ("serviceRegimeCode" IS NULL AND "serviceDateRole" IS NULL)
      OR (
        "serviceRegimeCode" IS NOT NULL AND "serviceDateRole" IS NOT NULL
        AND (
          ("serviceRegimeCode" = 'IMMEDIATE_SERVICE' AND "serviceDateRole" = 'DIRECT_DELIVERY')
          OR ("serviceRegimeCode" IN ('TK_21_1', 'TK_21_2', 'TK_20_TEMPORARY_ABSENCE') AND "serviceDateRole" = 'MUHTAR_DELIVERY')
          OR ("serviceRegimeCode" = 'PUBLICATION' AND "serviceDateRole" = 'PUBLICATION')
        )
      )
    );

-- occ_p04a1r2_completion_mode_consistent_with_regime_check: serviceCompletionMode NULL
-- olabilir (TK_21_1/TK_21_2 icin bugun budur - yukaridaki aciklama) ama DOLU oldugunda
-- serviceRegimeCode ile TUTARSIZ bir deger asla yazilamaz.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1r2_completion_mode_consistent_with_regime_check"
    CHECK (
      "occurrenceType" = 'LEGACY_BASELINE'
      OR "serviceCompletionMode" IS NULL
      OR (
        "serviceRegimeCode" IS NOT NULL
        AND (
          ("serviceRegimeCode" = 'IMMEDIATE_SERVICE' AND "serviceCompletionMode" IN ('DIRECT_RECIPIENT_DELIVERY', 'DELIVERED_TO_AUTHORIZED_PERSON'))
          OR ("serviceRegimeCode" = 'TK_20_TEMPORARY_ABSENCE' AND "serviceCompletionMode" IN ('DELIVERED_TO_AUTHORIZED_PERSON', 'NOTICE_POSTED'))
          OR ("serviceRegimeCode" IN ('TK_21_1', 'TK_21_2') AND "serviceCompletionMode" = 'NOTICE_POSTED')
          OR ("serviceRegimeCode" = 'PUBLICATION' AND "serviceCompletionMode" = 'PUBLICATION')
        )
      )
    );

-- occ_p04a1r2_tk20_requires_completion_mode_check: TK_20_TEMPORARY_ABSENCE icin owner
-- karari geregi tk20CompletionMode OPERATOR-ZORUNLU girdi - bu rejimde serviceCompletionMode
-- ASLA null kalamaz (diger rejimlerden farkli olarak). IS DISTINCT FROM NULL-safe'tir
-- (serviceRegimeCode NULL iken UNKNOWN degil, dogrudan TRUE dondurur).
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1r2_tk20_requires_completion_mode_check"
    CHECK (
      "occurrenceType" = 'LEGACY_BASELINE'
      OR "serviceRegimeCode" IS DISTINCT FROM 'TK_20_TEMPORARY_ABSENCE'
      OR "serviceCompletionMode" IS NOT NULL
    );

-- occ_p04a1r2_substitute_recipient_basis_requires_authorized_person_check:
-- substituteRecipientBasis yalniz serviceCompletionMode=DELIVERED_TO_AUTHORIZED_PERSON
-- oldugunda anlamlidir - digerlerinde her zaman NULL olmalidir. LEGACY_BASELINE (historically
-- unverifiable) diger constraint ile AYNI gerekce ile MUAFTIR - probe testte (occ_check_probe,
-- TEST I) bu muafiyet ilk taslakta EKSIKTI, disposable-DB'de fiilen test edilerek yakalandi.
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1r2_substitute_recipient_basis_requires_authorized_person_check"
    CHECK (
      "occurrenceType" = 'LEGACY_BASELINE'
      OR "substituteRecipientBasis" IS NULL
      OR ("serviceCompletionMode" IS NOT NULL AND "serviceCompletionMode" = 'DELIVERED_TO_AUTHORIZED_PERSON')
    );

-- occ_p04a1r2_tk20_authorized_person_requires_basis_check: owner karari - TK_20 +
-- DELIVERED_TO_AUTHORIZED_PERSON icin substituteRecipientBasis ZORUNLU (NOTICE_POSTED icin
-- OPTIONAL kalir - owner: "Repository'de notice-posted vakasinda da dayanak kesin olarak
-- tutulabiliyorsa nullable yerine required yapilabilir; tahmin yasaktir" - bugun boyle bir
-- kesin kaynak YOK, bu yuzden NOTICE_POSTED'da nullable birakildi).
ALTER TABLE "ServiceOccurrence" ADD CONSTRAINT "occ_p04a1r2_tk20_authorized_person_requires_basis_check"
    CHECK (
      "occurrenceType" = 'LEGACY_BASELINE'
      OR "serviceRegimeCode" IS DISTINCT FROM 'TK_20_TEMPORARY_ABSENCE'
      OR "serviceCompletionMode" IS DISTINCT FROM 'DELIVERED_TO_AUTHORIZED_PERSON'
      OR "substituteRecipientBasis" IS NOT NULL
    );

-- =============================================================================
-- Immutability trigger genisletmesi (R1 emsali - yeni kolonlar varsayilan
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
    OR NEW."serviceCompletionMode" IS DISTINCT FROM OLD."serviceCompletionMode"
    OR NEW."substituteRecipientBasis" IS DISTINCT FROM OLD."substituteRecipientBasis"
  THEN
    RAISE EXCEPTION 'service_occurrence_immutable_violation: only status ACTIVE -> SUPERSEDED transition is allowed, all other columns are immutable'
      USING ERRCODE = '45010';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
