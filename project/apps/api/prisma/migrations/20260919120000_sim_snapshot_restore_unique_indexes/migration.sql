-- K1 — simulation_snapshots icin SQUASH'TA KAYBOLAN iki unique indeksin geri getirilmesi.
--
-- NE / NEDEN: `00000000000000_baseline` (30a0e256, 2026-06-06 squash) Prisma semasinin IFADE
-- EDEMEDIGI iki ham indeksi tasimadi. Kaynak sozlesme (DEGISTIRILMEDI, yalniz referans):
--   * migrations-archive/20260118000000_phase_9b_truth_layer
--       ux_sim_snap_one_baseline_per_incident ON (tenant_id, incident_id) WHERE is_baseline = true
--       ("Single baseline per (tenant, incident)" — Phase 9B Truth Layer sozlesmesinin cekirdegi)
--   * migrations-archive/20260121000000_phase_9b5_idempotency_index
--       uq_sim_snap_idempotency ON (tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash)
-- `PrismaSnapshotRepository.insert` icerik-idempotensi ve tek-baseline degismezi icin bu
-- indekslerin P2002'sine dayanir; squash sonrasi kurulan DB'lerde ikisi de YOKTU.
--
-- ── DURUM MATRISI (hepsi tek DO blogunda karar verilir) ──────────────────────────────────
--   indeks YOK                          -> on kontrol (cakisan veri) + olustur
--   ayni ADLI indeks VAR, tanim DOGRU,  -> dokunma (no-op)
--     unique + gecerli (indisvalid)
--   ayni ADLI indeks VAR ama tanim      -> ACIK HATA (ad eslesmesi tanim kaniti DEGILDIR)
--     farkli / unique degil / INVALID     (ornegin yarida kalmis es-zamanli insa)
--   cakisan (yinelenen) veri VAR        -> ACIK HATA; veri SILINMEZ / DEGISTIRILMEZ
-- Tanim karsilastirmasi `pg_get_indexdef` uzerinden, sema niteleyicisi soyularak yapilir.
--
-- ── ATOMIKLIK VE KILIT (Prisma migrate deploy ile uyumlu) ──────────────────────────────────
-- Prisma migration dosyasini tek transaction'da yurutur; tum kararlar ve iki CREATE tek DO
-- blogundadir -> herhangi bir hata = TAM GERI ALMA, kismi durum YOK (ikinci indeks dusse
-- birincisi de geri alinir).
-- Duz `CREATE UNIQUE INDEX` tabloda SHARE kilidi alir: insa suresince INSERT/UPDATE/DELETE
-- bekler, okumalar SURER. Es-zamanli (CONCURRENTLY) varyant transaction ICINDE CALISAMAZ ve
-- Prisma migration'inda kullanilamaz; basarisizlikta INVALID indeks birakir. Bu yuzden
-- BILINCLI OLARAK kullanilmadi. Buyuk tabloda kesinti kabul edilemezse izlenecek yol migration
-- DEGIL, yayin oncesi ayri operasyon karari: indeksi birebir ayni tanimla es-zamanli insa et,
-- `indisvalid` dogrula; bu migration o durumda "tanim dogru" dalina duser ve no-op kalir.
-- Kilit alinamazsa HIZLI DUS (canliyi kuyruga sokma); emsal: 20260908171230 (A07).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  spec record;
  existing record;
  actual_def text;
  dup_groups bigint;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      (1,
       'ux_sim_snap_one_baseline_per_incident',
       'CREATE UNIQUE INDEX ux_sim_snap_one_baseline_per_incident ON simulation_snapshots USING btree (tenant_id, incident_id) WHERE (is_baseline = true)',
       'CREATE UNIQUE INDEX ux_sim_snap_one_baseline_per_incident ON simulation_snapshots (tenant_id, incident_id) WHERE is_baseline = true',
       'SELECT count(*) FROM (SELECT 1 FROM simulation_snapshots WHERE is_baseline = true GROUP BY tenant_id, incident_id HAVING count(*) > 1) d'),
      (2,
       'uq_sim_snap_idempotency',
       'CREATE UNIQUE INDEX uq_sim_snap_idempotency ON simulation_snapshots USING btree (tenant_id, incident_id, COALESCE(run_id, ''__NO_RUN__''::text), calc_hash)',
       'CREATE UNIQUE INDEX uq_sim_snap_idempotency ON simulation_snapshots (tenant_id, incident_id, COALESCE(run_id, ''__NO_RUN__''), calc_hash)',
       'SELECT count(*) FROM (SELECT 1 FROM simulation_snapshots GROUP BY tenant_id, incident_id, COALESCE(run_id, ''__NO_RUN__''), calc_hash HAVING count(*) > 1) d')
    ) AS s(ord, name, expected_def, create_sql, dup_sql)
    ORDER BY ord
  LOOP
    SELECT ic.oid, ix.indisunique, ix.indisvalid, ix.indisready, t.relname AS table_name
      INTO existing
      FROM pg_class ic
      JOIN pg_namespace n ON n.oid = ic.relnamespace
      JOIN pg_index ix ON ix.indexrelid = ic.oid
      JOIN pg_class t ON t.oid = ix.indrelid
     WHERE ic.relname = spec.name
       AND ic.relkind = 'i'
       AND n.nspname = current_schema();

    IF FOUND THEN
      actual_def := regexp_replace(pg_get_indexdef(existing.oid), ' ON [^ ]+\.simulation_snapshots ', ' ON simulation_snapshots ');
      IF existing.table_name <> 'simulation_snapshots'
         OR NOT existing.indisunique
         OR NOT existing.indisvalid
         OR NOT existing.indisready
         OR actual_def <> spec.expected_def THEN
        RAISE EXCEPTION 'K1: % adli indeks VAR ama sozlesmeyle ESLESMIYOR (unique=%, valid=%, ready=%). Beklenen: % | Bulunan: %',
          spec.name, existing.indisunique, existing.indisvalid, existing.indisready, spec.expected_def, actual_def
          USING HINT = 'Indeksi elle inceleyin; bu migration mevcut indeksi DUSURMEZ/DEGISTIRMEZ.';
      END IF;
      RAISE NOTICE 'K1: % zaten dogru tanimla mevcut, dokunulmadi', spec.name;
    ELSE
      EXECUTE spec.dup_sql INTO dup_groups;
      IF dup_groups > 0 THEN
        RAISE EXCEPTION 'K1: % olusturulamaz: % adet yinelenen anahtar grubu var', spec.name, dup_groups
          USING HINT = 'Veri otomatik SILINMEZ/DEGISTIRILMEZ; yinelenen satirlar owner karariyla ayiklanmali.';
      END IF;
      EXECUTE spec.create_sql;
      RAISE NOTICE 'K1: % olusturuldu', spec.name;
    END IF;
  END LOOP;
END
$$;

-- `prisma migrate dev` bu ham indeksleri semada GORMEDIGI icin drift sanip DROP onerebilir
-- (emsal: 20260619000000_case_lawyer_one_responsible_per_case) — KOSMAYIN; `migrate deploy` kullanin.
