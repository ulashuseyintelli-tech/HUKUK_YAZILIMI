-- OFFICE-WR01-B02 — EFFECTIVE-DATED WORK POOLS: AŞAMA 1 (SCHEMA) + AŞAMA 2 (VALIDATED BACKFILL)
--
-- KAYNAK SÖZLEŞME
--   project/docs/governance/office-wr01-decomposition-r01/b02-effective-dated-pools-design-r01.md
--   (PR #2444, squash 75edf7af) — §6 schema contract · §8.4 migration planı ADIM 0-9 ·
--   §8.6 doğrulama sorguları V1-V10 · owner kararları OD-B02-01..04 RATIFIED (2026-08-17) ·
--   düzeltmeler CF-B02-01 (anchor) / CF-B02-02 (concurrency) / CF-B02-03 (effectiveAt).
--
-- KAPSAM SINIRI (§9.2). Bu migration YALNIZ AŞAMA 1-2'dir. Yeni tabloları okuyan veya yazan
--   HİÇBİR runtime yüzeyi YOKTUR; source-of-truth hâlâ Office.opStaffTypes /
--   Office.escalationManagerLawyerIds / Office.escalationFounderLawyerIds düz dizileridir.
--   Resolver (AŞAMA 3), dual-write (AŞAMA 4) ve okuma cutover'ı (AŞAMA 6) AYRI authority ister.
--
-- ADIM 0 — TEK TRANSACTION. Bütün migration tek transaction'da koşar (Prisma Migrate davranışı;
--   repo emsali: 20260718120000_office_reporting_line_disposition, 20260718140000). Preflight
--   veya doğrulama anomali bulursa RAISE EXCEPTION → TAM ROLLBACK. Kısmi durum YOK, sessiz
--   onarım YOK. ADIM 4'ün `ON COMMIT DROP` temp tablosu bu gereksinimi yapısal olarak da
--   zorunlu kılar: transaction dışında koşulursa migration ADIM 5'te gürültülü biçimde durur.
--
-- BU MIGRATION HİÇBİR SATIRI UPDATE VEYA DELETE ETMEZ (§8.5). Legacy diziler yalnız OKUNUR;
--   veri kaybı olasılığı SIFIRDIR ve geri dönüş (forward-fix) yalnız yeni tabloları düşürmektir.

-- =============================================================================================
-- ADIM 1 — PREFLIGHT / VALIDATION (constraint'lerden ÖNCE)
-- =============================================================================================
-- Mevcut üç alan bugüne kadar FK'siz çıplak dizi olarak yaşadı (schema.prisma:2402-2403, 2411):
-- referans bütünlüğü hiçbir katmanda doğrulanmadı (tasarım §2.4). §6.2'nin composite FK'si bu
-- tolere edilen çöpü fail-closed hâle getirir; bu yüzden preflight ZORUNLUDUR.
--
-- Anomali bulunursa çözüm owner'lı pre-clean kapısına aittir; bu dosyaya politika GÖMÜLMEZ
-- (20260802190000_client_identity_active_partial_unique'in birebir ilkesi).
-- SESSİZ DÜŞÜRME / NORMALIZE / MERGE / DELETE YASAKTIR.
--
-- INVALID sınıfının sınırı (dürüstlük şerhi): tasarım §8.4 ADIM 1(d) "boş string / whitespace /
-- cuid olmayan değer" der. Burada boş/whitespace UYGULANIR, "cuid formatı" UYGULANMAZ:
-- repository'de Lawyer id'leri tek biçimli cuid DEĞİLDİR (test/seed yolları açık id verir), bu
-- yüzden bir cuid regex'i GEÇERLİ ve FK'yi sağlayan referansları reddederdi. Gerçek bütünlük
-- boşluğunu ORPHAN (b) + CROSS-TENANT (c) zaten kapatır: boş olmayan ve aynı tenant'ta gerçek
-- bir Lawyer'a karşılık gelmeyen her değer orada yakalanır. Format kontrolü bu kümeye hiçbir
-- şey eklemez, yalnız yanlış-pozitif üretirdi.
DO $preflight$
DECLARE
  duplicate_manager    integer;
  duplicate_founder    integer;
  duplicate_staff_type integer;
  orphan_lawyer        integer;
  cross_tenant_lawyer  integer;
  invalid_lawyer_id    integer;
  invalid_staff_type   integer;
BEGIN
  -- (a) DUPLICATE — aynı dizide tekrarlanan değer
  SELECT COALESCE(COUNT(*), 0) INTO duplicate_manager FROM (
    SELECT x."tenantId", x."member"
    FROM (SELECT o."tenantId", unnest(o."escalationManagerLawyerIds") AS "member" FROM "Office" o) x
    GROUP BY x."tenantId", x."member" HAVING COUNT(*) > 1
  ) d;

  SELECT COALESCE(COUNT(*), 0) INTO duplicate_founder FROM (
    SELECT x."tenantId", x."member"
    FROM (SELECT o."tenantId", unnest(o."escalationFounderLawyerIds") AS "member" FROM "Office" o) x
    GROUP BY x."tenantId", x."member" HAVING COUNT(*) > 1
  ) d;

  SELECT COALESCE(COUNT(*), 0) INTO duplicate_staff_type FROM (
    SELECT x."tenantId", x."member"
    FROM (SELECT o."tenantId", unnest(o."opStaffTypes") AS "member" FROM "Office" o) x
    GROUP BY x."tenantId", x."member" HAVING COUNT(*) > 1
  ) d;

  -- (b) ORPHAN — Lawyer tablosunda hiç karşılığı OLMAYAN id
  SELECT COALESCE(COUNT(*), 0) INTO orphan_lawyer FROM (
    SELECT DISTINCT x."tenantId", x."member"
    FROM (
      SELECT o."tenantId", unnest(o."escalationManagerLawyerIds" || o."escalationFounderLawyerIds") AS "member"
      FROM "Office" o
    ) x
    WHERE btrim(x."member") <> ''
      AND NOT EXISTS (SELECT 1 FROM "Lawyer" l WHERE l."id" = x."member")
  ) o1;

  -- (c) CROSS-TENANT — Lawyer VAR ama başka tenant'a ait (ORPHAN ile ayrık kümedir)
  SELECT COALESCE(COUNT(*), 0) INTO cross_tenant_lawyer FROM (
    SELECT DISTINCT x."tenantId", x."member"
    FROM (
      SELECT o."tenantId", unnest(o."escalationManagerLawyerIds" || o."escalationFounderLawyerIds") AS "member"
      FROM "Office" o
    ) x
    WHERE EXISTS (SELECT 1 FROM "Lawyer" l WHERE l."id" = x."member")
      AND NOT EXISTS (SELECT 1 FROM "Lawyer" l WHERE l."id" = x."member" AND l."tenantId" = x."tenantId")
  ) c1;

  -- (d) INVALID — boş string / yalnız whitespace
  SELECT COALESCE(COUNT(*), 0) INTO invalid_lawyer_id FROM (
    SELECT x."tenantId", x."member"
    FROM (
      SELECT o."tenantId", unnest(o."escalationManagerLawyerIds" || o."escalationFounderLawyerIds") AS "member"
      FROM "Office" o
    ) x
    WHERE x."member" IS NULL OR btrim(x."member") = ''
  ) i1;

  -- (e) ENUM — opStaffTypes içinde geçersiz değer. DB enum'u bunu zaten engeller; sayaç
  --     tasarımın tamlık talebi için tutulur ve yapısal olarak 0'dır.
  invalid_staff_type := 0;

  IF duplicate_manager > 0 OR duplicate_founder > 0 OR duplicate_staff_type > 0
     OR orphan_lawyer > 0 OR cross_tenant_lawyer > 0
     OR invalid_lawyer_id > 0 OR invalid_staff_type > 0 THEN
    RAISE EXCEPTION 'BLOCKED office-work-pool backfill preflight: duplicate_manager=%, duplicate_founder=%, duplicate_staff_type=%, orphan_lawyer=%, cross_tenant_lawyer=%, invalid_lawyer_id=%, invalid_staff_type=%. Owner-lu pre-clean kapisi gerekir (sessiz normalize/merge/delete yasak).',
      duplicate_manager, duplicate_founder, duplicate_staff_type,
      orphan_lawyer, cross_tenant_lawyer, invalid_lawyer_id, invalid_staff_type;
  END IF;
END $preflight$;

-- =============================================================================================
-- ADIM 2 — CREATE TYPE
-- =============================================================================================
-- CreateEnum
CREATE TYPE "OfficeWorkPoolKind" AS ENUM ('OP_STAFF_TYPE', 'ESCALATION_MANAGER', 'ESCALATION_FOUNDER');

-- CreateEnum
CREATE TYPE "OfficeWorkPoolMembershipProvenance" AS ENUM ('LEGACY_CUTOVER_IMPORT', 'ADMIN_DECLARED', 'OWNER_EVIDENCED_HISTORICAL');

-- CreateEnum
CREATE TYPE "OfficeWorkPoolEpochProvenance" AS ENUM ('LEGACY_CUTOVER_IMPORT', 'TENANT_PROVISIONED', 'OWNER_EVIDENCED_HISTORICAL');

-- =============================================================================================
-- ADIM 3 — CREATE TABLE (membership + anchor AYNI migration'da; G1 / §9.5 AŞAMA 1)
-- =============================================================================================
-- CreateTable
CREATE TABLE "OfficeWorkPoolMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poolKind" "OfficeWorkPoolKind" NOT NULL,
    "memberLawyerId" TEXT,
    "memberStaffType" "StaffType",
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "provenance" "OfficeWorkPoolMembershipProvenance" NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeWorkPoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeWorkPoolEpoch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poolKind" "OfficeWorkPoolKind" NOT NULL,
    "knownFrom" TIMESTAMP(3) NOT NULL,
    "provenance" "OfficeWorkPoolEpochProvenance" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeWorkPoolEpoch_pkey" PRIMARY KEY ("id")
);

-- =============================================================================================
-- ADIM 4 — SNAPSHOT: cutoverAt TEK KEZ hesaplanır
-- =============================================================================================
-- Aynı transaction içinde now() zaten sabittir; buna rağmen değer TEK bir taşıyıcıya alınır
-- (§8.4). Sebep niyeti açık kılmak değil yalnızca: anchor'ların knownFrom değeri ile
-- membership'lerin validFrom değerinin AYNI KAYNAKTAN yazıldığı yapısal olarak garanti edilir
-- (§6.6 sınır ilişkisi; V10 bunu ayrıca ölçer).
--
-- NOT (CF-B02-03 sınırı): kilit-sonrası clock_timestamp() sözleşmesi RUNTIME mutation yolunun
-- kuralıdır (§11.5.9) ve AŞAMA 4'e aittir. Migration'da kilit beklemesi ve rakip mutation
-- yoktur; burada transaction-sabit snapshot DOĞRU olandır.
-- `AT TIME ZONE 'UTC'` açıktır ve gereklidir: kolonlar Prisma varsayılanıyla TIMESTAMP(3)
-- (timezone'suz) ve Prisma bu değerleri UTC instant olarak okur/yazar (§7.3). Çıplak
-- `now()::timestamp` oturum saat dilimine göre yerel duvar saati üretirdi.
CREATE TEMPORARY TABLE "_b02_cutover_snapshot" ON COMMIT DROP AS
  SELECT (now() AT TIME ZONE 'UTC')::timestamp(3) AS "cutoverAt";

-- =============================================================================================
-- ADIM 5 — ANCHOR SEED (CF-B02-01) — BACKFILL'DEN ÖNCE, BAĞLAYICI SIRA
-- =============================================================================================
-- Anchor'ın varlığı üyeliğe BAĞLI DEĞİLDİR: üç havuzu da boş olan bir tenant'ta hiç membership
-- satırı oluşmaz. Sıra tersine çevrilirse boş havuzlu tenant'lar sessizce anchor'sız kalır ve
-- CF-B02-01'in kapattığı boşluk yeniden açılır (§8.4).
--
-- Her mevcut Office için TAM 3 anchor. Beklenen: count("Office") × 3 (V8 ölçer).
--
-- id: uygulama satırları @default(cuid()) ile doğar; DB kolonunun default'u YOKTUR, bu yüzden
-- backfill kendi opak TEXT id'sini üretir (gen_random_uuid()::text, PG16 yerleşiği; baseline
-- migration'ında da kullanılır). Id biçimi hiçbir sözleşme taşımaz.
INSERT INTO "OfficeWorkPoolEpoch" ("id", "tenantId", "poolKind", "knownFrom", "provenance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       o."tenantId",
       k."kind",
       s."cutoverAt",
       'LEGACY_CUTOVER_IMPORT'::"OfficeWorkPoolEpochProvenance",
       s."cutoverAt",
       s."cutoverAt"
FROM "Office" o
CROSS JOIN (VALUES
    ('OP_STAFF_TYPE'::"OfficeWorkPoolKind"),
    ('ESCALATION_MANAGER'::"OfficeWorkPoolKind"),
    ('ESCALATION_FOUNDER'::"OfficeWorkPoolKind")
  ) AS k("kind")
CROSS JOIN "_b02_cutover_snapshot" s;

-- =============================================================================================
-- ADIM 6 — BACKFILL (OD-B02-01 = A: cutover-only effective; geçmiş tarih İCAT EDİLMEZ)
-- =============================================================================================
-- validFrom = cutoverAt · validUntil = NULL · revokedAt = NULL · provenance = LEGACY_CUTOVER_IMPORT.
-- validFrom bir İTHAL tarihidir; "politika gerçekte ne zaman başladı" (§4 T1) sorusunun cevabı
-- DEĞİLDİR ve hiçbir yerde öyle sunulamaz. cutover ÖNCESİ sorgular anchor sayesinde UNKNOWN döner.
--
-- Sıra sabittir (OP_STAFF_TYPE → ESCALATION_MANAGER → ESCALATION_FOUNDER); semantik taşımaz,
-- determinizm içindir. Boş dizide unnest 0 satır üretir → membership YOK, anchor VAR.

-- OP_STAFF_TYPE
INSERT INTO "OfficeWorkPoolMembership" ("id", "tenantId", "poolKind", "memberLawyerId", "memberStaffType", "validFrom", "provenance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       x."tenantId",
       'OP_STAFF_TYPE'::"OfficeWorkPoolKind",
       NULL,
       x."member",
       s."cutoverAt",
       'LEGACY_CUTOVER_IMPORT'::"OfficeWorkPoolMembershipProvenance",
       s."cutoverAt",
       s."cutoverAt"
FROM (SELECT o."tenantId", unnest(o."opStaffTypes") AS "member" FROM "Office" o) x
CROSS JOIN "_b02_cutover_snapshot" s;

-- ESCALATION_MANAGER
INSERT INTO "OfficeWorkPoolMembership" ("id", "tenantId", "poolKind", "memberLawyerId", "memberStaffType", "validFrom", "provenance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       x."tenantId",
       'ESCALATION_MANAGER'::"OfficeWorkPoolKind",
       x."member",
       NULL,
       s."cutoverAt",
       'LEGACY_CUTOVER_IMPORT'::"OfficeWorkPoolMembershipProvenance",
       s."cutoverAt",
       s."cutoverAt"
FROM (SELECT o."tenantId", unnest(o."escalationManagerLawyerIds") AS "member" FROM "Office" o) x
CROSS JOIN "_b02_cutover_snapshot" s;

-- ESCALATION_FOUNDER
INSERT INTO "OfficeWorkPoolMembership" ("id", "tenantId", "poolKind", "memberLawyerId", "memberStaffType", "validFrom", "provenance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       x."tenantId",
       'ESCALATION_FOUNDER'::"OfficeWorkPoolKind",
       x."member",
       NULL,
       s."cutoverAt",
       'LEGACY_CUTOVER_IMPORT'::"OfficeWorkPoolMembershipProvenance",
       s."cutoverAt",
       s."cutoverAt"
FROM (SELECT o."tenantId", unnest(o."escalationFounderLawyerIds") AS "member" FROM "Office" o) x
CROSS JOIN "_b02_cutover_snapshot" s;

-- =============================================================================================
-- ADIM 7 — CHECK CONSTRAINT'LER (§6.3) — veri girdikten SONRA
-- =============================================================================================
-- Sıra bilinçlidir: constraint'ler ADIM 6'nın ürettiği satırları da doğrular, yani backfill'in
-- kendisi de bu sözleşmeye tabi olur.

-- 1) Üye taşıyıcısı XOR (ReportingLine disposition CHECK emsali)
ALTER TABLE "OfficeWorkPoolMembership" ADD CONSTRAINT "office_work_pool_member_carrier_xor_ck"
  CHECK (("memberLawyerId" IS NOT NULL) <> ("memberStaffType" IS NOT NULL));

-- 2) poolKind ↔ taşıyıcı tutarlılığı
ALTER TABLE "OfficeWorkPoolMembership" ADD CONSTRAINT "office_work_pool_kind_carrier_ck"
  CHECK (
    ("poolKind" = 'OP_STAFF_TYPE' AND "memberStaffType" IS NOT NULL)
    OR ("poolKind" IN ('ESCALATION_MANAGER', 'ESCALATION_FOUNDER') AND "memberLawyerId" IS NOT NULL)
  );

-- 3) Tarih aralığı — SIFIR UZUNLUKLU ARALIK YASAK.
--    ReportingLine'dan (reporting_line_valid_date_range_ck, `<=`) BİLİNÇLİ SAPMA: B02 yarı-açık
--    aralık [validFrom, validUntil) kullandığı için validFrom = validUntil hiçbir zaman aktif
--    olmayan bir satırdır — yani sessiz çöp. Emsal körlemesine kopyalanmamıştır (§6.3).
ALTER TABLE "OfficeWorkPoolMembership" ADD CONSTRAINT "office_work_pool_valid_range_ck"
  CHECK ("validUntil" IS NULL OR "validFrom" < "validUntil");

-- 4) Revocation aralığı
ALTER TABLE "OfficeWorkPoolMembership" ADD CONSTRAINT "office_work_pool_revoked_range_ck"
  CHECK ("revokedAt" IS NULL OR "revokedAt" >= "validFrom");

-- 5) revokedAt ↔ revokedByUserId birlikteliği
ALTER TABLE "OfficeWorkPoolMembership" ADD CONSTRAINT "office_work_pool_revoked_actor_ck"
  CHECK (("revokedAt" IS NULL) = ("revokedByUserId" IS NULL));

-- =============================================================================================
-- ADIM 8 — INDEX'LER (§6.3 partial unique + §6.4) VE FOREIGN KEY'LER
-- =============================================================================================
-- FK'ler bilinçli olarak backfill'den SONRA kurulur: ALTER TABLE ... ADD FOREIGN KEY mevcut
-- satırları doğrular, yani backfill'in tenant-güvenliği DB tarafından KANITLANIR (V6 bunu
-- ayrıca ölçer).

-- CreateIndex
CREATE INDEX "OfficeWorkPoolMembership_tenantId_idx" ON "OfficeWorkPoolMembership"("tenantId");

-- CreateIndex
CREATE INDEX "OfficeWorkPoolMembership_tenantId_poolKind_validFrom_idx" ON "OfficeWorkPoolMembership"("tenantId", "poolKind", "validFrom");

-- CreateIndex
CREATE INDEX "OfficeWorkPoolMembership_tenantId_poolKind_validUntil_idx" ON "OfficeWorkPoolMembership"("tenantId", "poolKind", "validUntil");

-- CreateIndex
CREATE INDEX "OfficeWorkPoolMembership_memberLawyerId_idx" ON "OfficeWorkPoolMembership"("memberLawyerId");

-- CreateIndex
CREATE INDEX "OfficeWorkPoolEpoch_tenantId_idx" ON "OfficeWorkPoolEpoch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeWorkPoolEpoch_tenantId_poolKind_key" ON "OfficeWorkPoolEpoch"("tenantId", "poolKind");

-- Partial unique index'ler (§6.3). Prisma bunları model düzeyinde İFADE EDEMEZ; raw SQL zorunlu.
-- Repo-native emsal: reporting_line_one_active_per_actor (20260718120000),
-- Client_tenantId_tckn_active_unique (20260802190000).
--
-- DÜRÜSTLÜK ŞERHİ (§6.3): bu index yalnız AÇIK UÇLU satırlarda tekilliği garanti eder.
-- Kapalı aralıkların birbiriyle örtüşmesini ENGELLEMEZ. Tam aralık-örtüşmesi engeli PostgreSQL'de
-- yalnız EXCLUDE USING gist + btree_gist ile kurulur; repository'de bu desen HİÇ kullanılmamıştır
-- (tam tarama: 0 eşleşme) ve tasarım onu bilinçli olarak REDDETMİŞTİR. Kapalı-aralık örtüşmesi
-- uygulama katmanında engellenir ve V5 sorgusuyla İZLENİR — bu bir garanti değil, kontroldür.
CREATE UNIQUE INDEX "office_work_pool_one_open_lawyer_membership"
  ON "OfficeWorkPoolMembership" ("tenantId", "poolKind", "memberLawyerId")
  WHERE "validUntil" IS NULL AND "revokedAt" IS NULL AND "memberLawyerId" IS NOT NULL;

CREATE UNIQUE INDEX "office_work_pool_one_open_stafftype_membership"
  ON "OfficeWorkPoolMembership" ("tenantId", "poolKind", "memberStaffType")
  WHERE "validUntil" IS NULL AND "revokedAt" IS NULL AND "memberStaffType" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "OfficeWorkPoolMembership" ADD CONSTRAINT "OfficeWorkPoolMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Office"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeWorkPoolMembership" ADD CONSTRAINT "OfficeWorkPoolMembership_memberLawyerId_tenantId_fkey" FOREIGN KEY ("memberLawyerId", "tenantId") REFERENCES "Lawyer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeWorkPoolEpoch" ADD CONSTRAINT "OfficeWorkPoolEpoch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Office"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================================
-- ADIM 9 — DOĞRULAMA (§8.6 V1-V10). Herhangi biri başarısızsa RAISE EXCEPTION → TAM ROLLBACK.
-- =============================================================================================
DO $verify$
DECLARE
  v1_count_parity      integer;
  v2_set_parity        integer;
  v3_open_uniqueness   integer;
  v4_range_consistency integer;
  v5_interval_overlap  integer;
  v6_tenant_integrity  integer;
  v7_provenance        integer;
  v8_anchor_missing    integer;
  v8_anchor_total      integer;
  v8_anchor_expected   integer;
  v9_empty_pool_parity integer;
  v10_anchor_boundary  integer;
BEGIN
  -- V1 SAYIM PARİTESİ — her tenant × havuz için açık satır sayısı == legacy dizi kardinalitesi
  SELECT COALESCE(COUNT(*), 0) INTO v1_count_parity FROM (
    SELECT o."tenantId", k."kind"
    FROM "Office" o
    CROSS JOIN (VALUES
        ('OP_STAFF_TYPE'::"OfficeWorkPoolKind"),
        ('ESCALATION_MANAGER'::"OfficeWorkPoolKind"),
        ('ESCALATION_FOUNDER'::"OfficeWorkPoolKind")
      ) AS k("kind")
    WHERE (
      CASE k."kind"
        WHEN 'OP_STAFF_TYPE'      THEN cardinality(o."opStaffTypes")
        WHEN 'ESCALATION_MANAGER' THEN cardinality(o."escalationManagerLawyerIds")
        ELSE                           cardinality(o."escalationFounderLawyerIds")
      END
    ) <> (
      SELECT COUNT(*) FROM "OfficeWorkPoolMembership" m
      WHERE m."tenantId" = o."tenantId" AND m."poolKind" = k."kind"
        AND m."validUntil" IS NULL AND m."revokedAt" IS NULL
    )
  ) x;

  -- V2 KÜME PARİTESİ — sıra önemsiz küme eşitliği (havuz başına ayrı ölçülür)
  SELECT COALESCE(COUNT(*), 0) INTO v2_set_parity FROM (
    SELECT o."tenantId"
    FROM "Office" o
    WHERE
      (SELECT COALESCE(array_agg(DISTINCT e::text ORDER BY e::text), ARRAY[]::text[])
         FROM unnest(o."opStaffTypes") e)
      IS DISTINCT FROM
      (SELECT COALESCE(array_agg(DISTINCT m."memberStaffType"::text ORDER BY m."memberStaffType"::text), ARRAY[]::text[])
         FROM "OfficeWorkPoolMembership" m
        WHERE m."tenantId" = o."tenantId" AND m."poolKind" = 'OP_STAFF_TYPE'
          AND m."validUntil" IS NULL AND m."revokedAt" IS NULL)
      OR
      (SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), ARRAY[]::text[])
         FROM unnest(o."escalationManagerLawyerIds") e)
      IS DISTINCT FROM
      (SELECT COALESCE(array_agg(DISTINCT m."memberLawyerId" ORDER BY m."memberLawyerId"), ARRAY[]::text[])
         FROM "OfficeWorkPoolMembership" m
        WHERE m."tenantId" = o."tenantId" AND m."poolKind" = 'ESCALATION_MANAGER'
          AND m."validUntil" IS NULL AND m."revokedAt" IS NULL)
      OR
      (SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), ARRAY[]::text[])
         FROM unnest(o."escalationFounderLawyerIds") e)
      IS DISTINCT FROM
      (SELECT COALESCE(array_agg(DISTINCT m."memberLawyerId" ORDER BY m."memberLawyerId"), ARRAY[]::text[])
         FROM "OfficeWorkPoolMembership" m
        WHERE m."tenantId" = o."tenantId" AND m."poolKind" = 'ESCALATION_FOUNDER'
          AND m."validUntil" IS NULL AND m."revokedAt" IS NULL)
  ) x;

  -- V3 TEKİLLİK — açık uçlu satırlarda (tenantId, poolKind, üye) tekil
  SELECT COALESCE(COUNT(*), 0) INTO v3_open_uniqueness FROM (
    SELECT m."tenantId", m."poolKind", m."memberLawyerId", m."memberStaffType"
    FROM "OfficeWorkPoolMembership" m
    WHERE m."validUntil" IS NULL AND m."revokedAt" IS NULL
    GROUP BY m."tenantId", m."poolKind", m."memberLawyerId", m."memberStaffType"
    HAVING COUNT(*) > 1
  ) x;

  -- V4 ARALIK TUTARLILIĞI
  SELECT COALESCE(COUNT(*), 0) INTO v4_range_consistency FROM "OfficeWorkPoolMembership"
    WHERE ("validUntil" IS NOT NULL AND "validFrom" >= "validUntil")
       OR ("revokedAt" IS NOT NULL AND "revokedAt" < "validFrom");

  -- V5 ÖRTÜŞME — kapalı aralıklar; partial unique index'in KAPATMADIĞI yüzey (§6.3 şerhi).
  --    Etkin bitiş = LEAST(validUntil, revokedAt); null'lar sonsuz sayılır (§7.2).
  SELECT COALESCE(COUNT(*), 0) INTO v5_interval_overlap
  FROM "OfficeWorkPoolMembership" a
  JOIN "OfficeWorkPoolMembership" b
    ON a."id" < b."id"
   AND a."tenantId" = b."tenantId"
   AND a."poolKind" = b."poolKind"
   AND a."memberLawyerId" IS NOT DISTINCT FROM b."memberLawyerId"
   AND a."memberStaffType" IS NOT DISTINCT FROM b."memberStaffType"
   AND a."validFrom" < LEAST(COALESCE(b."validUntil", 'infinity'::timestamp), COALESCE(b."revokedAt", 'infinity'::timestamp))
   AND b."validFrom" < LEAST(COALESCE(a."validUntil", 'infinity'::timestamp), COALESCE(a."revokedAt", 'infinity'::timestamp));

  -- V6 TENANT BÜTÜNLÜĞÜ — FK zaten garanti eder; V6 FK'nin KURULDUĞUNUN kanıtıdır
  SELECT COALESCE(COUNT(*), 0) INTO v6_tenant_integrity
  FROM "OfficeWorkPoolMembership" m
  JOIN "Lawyer" l ON l."id" = m."memberLawyerId"
  WHERE m."memberLawyerId" IS NOT NULL AND l."tenantId" <> m."tenantId";

  -- V7 PROVENANCE — tüm satırlar LEGACY_CUTOVER_IMPORT ve tenant başına TEK validFrom
  SELECT COALESCE(COUNT(*), 0) INTO v7_provenance FROM (
    SELECT 1 FROM "OfficeWorkPoolMembership" WHERE "provenance" <> 'LEGACY_CUTOVER_IMPORT'
    UNION ALL
    SELECT 1 FROM "OfficeWorkPoolMembership"
     WHERE "provenance" = 'LEGACY_CUTOVER_IMPORT'
     GROUP BY "tenantId" HAVING COUNT(DISTINCT "validFrom") <> 1
  ) x;

  -- V8 ANCHOR EKSİKSİZLİĞİ (CF-B02-01)
  SELECT COALESCE(COUNT(*), 0) INTO v8_anchor_missing FROM (
    SELECT o."tenantId", k."kind"
    FROM "Office" o
    CROSS JOIN (VALUES
        ('OP_STAFF_TYPE'::"OfficeWorkPoolKind"),
        ('ESCALATION_MANAGER'::"OfficeWorkPoolKind"),
        ('ESCALATION_FOUNDER'::"OfficeWorkPoolKind")
      ) AS k("kind")
    WHERE NOT EXISTS (
      SELECT 1 FROM "OfficeWorkPoolEpoch" e
      WHERE e."tenantId" = o."tenantId" AND e."poolKind" = k."kind"
    )
  ) x;
  SELECT COALESCE(COUNT(*), 0) INTO v8_anchor_total    FROM "OfficeWorkPoolEpoch";
  SELECT COALESCE(COUNT(*), 0) * 3 INTO v8_anchor_expected FROM "Office";

  -- V9 BOŞ HAVUZ PARİTESİ (CF-B02-01) — legacy dizisi BOŞ olan her (tenant, havuz) için
  --    membership == 0 (doğru) VE anchor == 1 (ZORUNLU).
  --    Parite sorguları "iki taraf da boş" durumunda SESSİZCE geçer; bu yüzden V9 ayrı kalemdir.
  SELECT COALESCE(COUNT(*), 0) INTO v9_empty_pool_parity FROM (
    SELECT o."tenantId", k."kind"
    FROM "Office" o
    CROSS JOIN (VALUES
        ('OP_STAFF_TYPE'::"OfficeWorkPoolKind"),
        ('ESCALATION_MANAGER'::"OfficeWorkPoolKind"),
        ('ESCALATION_FOUNDER'::"OfficeWorkPoolKind")
      ) AS k("kind")
    WHERE (
      CASE k."kind"
        WHEN 'OP_STAFF_TYPE'      THEN cardinality(o."opStaffTypes")
        WHEN 'ESCALATION_MANAGER' THEN cardinality(o."escalationManagerLawyerIds")
        ELSE                           cardinality(o."escalationFounderLawyerIds")
      END
    ) = 0
    AND (
      (SELECT COUNT(*) FROM "OfficeWorkPoolMembership" m
        WHERE m."tenantId" = o."tenantId" AND m."poolKind" = k."kind") <> 0
      OR
      (SELECT COUNT(*) FROM "OfficeWorkPoolEpoch" e
        WHERE e."tenantId" = o."tenantId" AND e."poolKind" = k."kind") <> 1
    )
  ) x;

  -- V10 ANCHOR ↔ MEMBERSHIP SINIRI (CF-B02-01)
  SELECT COALESCE(COUNT(*), 0) INTO v10_anchor_boundary
  FROM "OfficeWorkPoolMembership" m
  LEFT JOIN "OfficeWorkPoolEpoch" e
    ON e."tenantId" = m."tenantId" AND e."poolKind" = m."poolKind"
  WHERE m."provenance" = 'LEGACY_CUTOVER_IMPORT'
    AND (e."id" IS NULL OR e."knownFrom" > m."validFrom");

  IF v1_count_parity > 0 OR v2_set_parity > 0 OR v3_open_uniqueness > 0
     OR v4_range_consistency > 0 OR v5_interval_overlap > 0 OR v6_tenant_integrity > 0
     OR v7_provenance > 0 OR v8_anchor_missing > 0 OR v8_anchor_total <> v8_anchor_expected
     OR v9_empty_pool_parity > 0 OR v10_anchor_boundary > 0 THEN
    RAISE EXCEPTION 'BLOCKED office-work-pool backfill verification: v1_count_parity=%, v2_set_parity=%, v3_open_uniqueness=%, v4_range_consistency=%, v5_interval_overlap=%, v6_tenant_integrity=%, v7_provenance=%, v8_anchor_missing=%, v8_anchor_total=%, v8_anchor_expected=%, v9_empty_pool_parity=%, v10_anchor_boundary=%.',
      v1_count_parity, v2_set_parity, v3_open_uniqueness,
      v4_range_consistency, v5_interval_overlap, v6_tenant_integrity,
      v7_provenance, v8_anchor_missing, v8_anchor_total, v8_anchor_expected,
      v9_empty_pool_parity, v10_anchor_boundary;
  END IF;
END $verify$;
