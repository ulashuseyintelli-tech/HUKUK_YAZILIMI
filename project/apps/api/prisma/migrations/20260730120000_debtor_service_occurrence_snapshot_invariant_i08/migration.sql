-- =============================================================================
-- DEBTOR-SERVICE-OCCURRENCE-SNAPSHOT-INVARIANT-P1-I08 (eski roadmap TASK 07)
--
-- INVARIANT (repository-truth: service-occurrence-deadline-calculation-lock.ts
-- yorumu + her iki yazicinin da existingActive sorgusu ile birebir ayni):
--   Her (tenantId, sourceTebligatId) icin en fazla BIR ACTIVE LegalDeadlineSnapshot
--   olabilir. Bir Tebligat'in zaman icinde birden fazla ServiceOccurrence'i olabilir
--   (bu BILINCLI/tasarim geregi — ServiceOccurrence kendi ayri invariant'ina sahiptir,
--   asagida aciklanir), ama en fazla bir ACTIVE deadline hesabi gecerli olmalidir.
--
-- BUGUNE KADARKI KORUMA: yalniz APPLICATION-level (pg_advisory_xact_lock +
-- transaction-ici locked re-read + idempotent/fail-closed/supersede karar agaci,
-- bkz. ServiceOccurrenceDeadlineCalculationService.calculateForOccurrence). Legacy
-- yazici (LegalDeadlineService.calculateDeadline) ayni existingActive sorgusunu
-- kullanir ama lock ALMAZ — uretim caller'i YOKTUR (DEBTOR-LEGAL-DEADLINE-LEGACY-
-- PATH-DISPOSITION-P1-I07 ile no-new-caller guard'i kondu, PR #1920).
--
-- AMPIRIK KANIT (disposable Postgres, bu gorevin ANALYZE fazinda, repo'ya commit
-- edilmeyen gecici script ile): app-katmanini tamamen bypass eden dogrudan INSERT
-- ile ayni (tenantId, sourceTebligatId) icin IKI BAGIMSIZ ACTIVE satir basariyla
-- olusturulabildi — DB seviyesinde HICBIR engel yoktu. Bu migration o bosluğu kapatir.
--
-- SIRALAMA UYUMU: her iki yazici da (legacy + canonical) ONCE eski ACTIVE satiri
-- SUPERSEDED yapar, SONRA yeni ACTIVE satiri INSERT eder (ayni transaction icinde,
-- Postgres MVCC self-visibility sayesinde INSERT ani itibariyla eski satir zaten
-- SUPERSEDED gorunur) — bu asagidaki partial unique index ile CATISMAZ.
--
-- FAIL-FAST/NON-DESTRUCTIVE (RC-COL-W2.2B-R01 bank-reference-idempotency emsali,
-- bkz. 20260729120000_rc_col_w2_2b_bank_reference_idempotency): mevcut veride
-- ihlal varsa bu migration SESSIZCE davranmaz/veri BOZMAZ — acikca FAIL eder.
-- Cleanup gerekirse bu, AYRI ve owner-onayli bir sonraki adimdir.
-- =============================================================================

LOCK TABLE "LegalDeadlineSnapshot" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "LegalDeadlineSnapshot"
    WHERE status = 'ACTIVE'
    GROUP BY "tenantId", "sourceTebligatId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'LEGAL_DEADLINE_SNAPSHOT_PREFLIGHT_FAILED: duplicate ACTIVE rows already exist for some tenantId+sourceTebligatId — cleanup requires a separate owner-approved step before this migration can apply.';
  END IF;
END $$;

CREATE UNIQUE INDEX "LegalDeadlineSnapshot_one_active_per_tebligat"
  ON "LegalDeadlineSnapshot"("tenantId", "sourceTebligatId")
  WHERE status = 'ACTIVE';

-- =============================================================================
-- ServiceOccurrence icin KASITLI OLARAK YENI bir constraint EKLENMEDI:
--
-- 1) "Bir tebligat'in zaman icinde birden fazla ServiceOccurrence'i olabilir"
--    BILINCLI tasarim karari (service-occurrence-deadline-calculation-lock.ts
--    yorumu, owner brief S10) — append-only olgu gecmisi modeli, "en fazla bir
--    ACTIVE" burada YANLIS invariant olurdu.
-- 2) ServiceOccurrence'in KENDI gercek invariant'i ("bir supersession ZINCIRinde
--    en fazla bir ACTIVE uye") zaten DB seviyesinde uygulaniyor:
--    supersedesOccurrenceId @unique (ServiceOccurrence_supersedesOccurrenceId_key,
--    20260721210134_of01_history_p01_service_occurrence) + immutability trigger'i
--    (yalniz ACTIVE->SUPERSEDED gecisine izin verir) — bir onceki kaydi IKI FARKLI
--    yeni kayit supersede EDEMEZ.
-- 3) ServiceOccurrenceService.supersedeOccurrence yazma SIRASI (ONCE yeni ACTIVE
--    INSERT, SONRA eski satir SUPERSEDED update) bu gorevdeki
--    LegalDeadlineSnapshot yazicilarinin sirasindan FARKLIDIR — (tenantId,
--    sourceTebligatId) uzerinde boyle bir partial unique index eklenseydi,
--    transaction icinde GECICI olarak iki ACTIVE satir bir arada var olacagi icin
--    KENDI DOGRU akisiyla CATISIRDI. Bu yeniden-siralama/DEFERRABLE calismasi,
--    farkli bir invariant hedefledigi icin AYRI bir gorevdir (TASK 08 kapsami
--    disinda — bkz. I08 ANALYZE raporu "Migration Options" bolumu).
-- =============================================================================
