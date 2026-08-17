/**
 * OFFICE-WR01-B02 — AŞAMA 1-2 (schema + validated backfill) migration doğrulaması.
 *
 * Kaynak sözleşme: project/docs/governance/office-wr01-decomposition-r01/
 *   b02-effective-dated-pools-design-r01.md (PR #2444, squash 75edf7af)
 *   §6 schema · §8.4 ADIM 0-9 · §8.6 V1-V10 · OD-B02-01..04 RATIFIED · CF-B02-01/02/03.
 *
 * NE KANITLANIR
 *   (1) Migration dosyası ADIM sırasını ve yasakları TAŞIR (statik SQL sözleşmesi).
 *   (2) `prisma migrate deploy` ile GERÇEKTEN uygulanmış kanonik şemada tablo/enum/CHECK/
 *       partial-unique/FK nesneleri VARDIR ve davranışları beklenendir.
 *   (3) M1-M7 fixture matrisi: migration dosyası, izole bir PostgreSQL şeması içinde
 *       GERÇEKTEN yeniden uygulanır. Mutlu yollar backfill pariteliğini, anomali yolları
 *       fail-closed RAISE + TAM ROLLBACK davranışını kanıtlar.
 *
 * NE KANITLANMAZ (dürüstlük sınırı)
 *   - Resolver (AŞAMA 3), dual-write (AŞAMA 4), cutover (AŞAMA 6) davranışı: bu PR'da YOK.
 *   - M1-M7 sandbox'ı, migration'ın DOKUNDUĞU yüzeyin minimal DDL'ini kurar (Office/Lawyer/
 *     StaffType). Kanonik şemanın tamamı değildir; tam-şema kanıtı (2) numaralı bloktadır.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'OFFICE-WR01-B02 DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const MIGRATION_DIR = '20260817120000_office_wr01_b02_effective_dated_work_pools';
const MIGRATION_SQL = readFileSync(
  join(__dirname, '../../../../prisma/migrations', MIGRATION_DIR, 'migration.sql'),
  'utf8',
);

/**
 * Dollar-quote farkındalıklı statement ayırıcı. `DO $preflight$ ... $preflight$` blokları
 * noktalı virgül içerdiği için düz `split(';')` KULLANILAMAZ. Ayırıcının doğruluğu ayrıca
 * M1/M2'nin gerçekten uygulanmasıyla kanıtlanır: bozuk bir ayırma mutlu yolu düşürürdü.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);

    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (sql[i] === "'") {
      const close = /'(?:[^']|'')*'/y;
      close.lastIndex = i;
      const match = close.exec(sql);
      if (match) {
        current += match[0];
        i += match[0].length;
        continue;
      }
    }

    const dollarOpen = /\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/y;
    dollarOpen.lastIndex = i;
    const tag = dollarOpen.exec(sql);
    if (tag) {
      const closeIndex = sql.indexOf(tag[0], i + tag[0].length);
      const stop = closeIndex === -1 ? sql.length : closeIndex + tag[0].length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (sql[i] === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i += 1;
      continue;
    }

    current += sql[i];
    i += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Migration'ın DOKUNDUĞU yüzeyin minimal ama birebir DDL'i (sandbox baseline). */
const SANDBOX_BASELINE = [
  `CREATE TYPE "StaffType" AS ENUM ('STAJYER_AVUKAT','OFIS_KATIBI','ADLI_KATIP','SEKRETER','MUHASEBE','ARSIV','DIGER')`,
  `CREATE TABLE "Office" (
     "id" TEXT NOT NULL,
     "tenantId" TEXT NOT NULL,
     "escalationManagerLawyerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
     "escalationFounderLawyerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
     "opStaffTypes" "StaffType"[] NOT NULL DEFAULT ARRAY['MUHASEBE','ADLI_KATIP','SEKRETER']::"StaffType"[],
     CONSTRAINT "Office_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX "Office_tenantId_key" ON "Office"("tenantId")`,
  `CREATE TABLE "Lawyer" (
     "id" TEXT NOT NULL,
     "tenantId" TEXT NOT NULL,
     CONSTRAINT "Lawyer_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX "Lawyer_id_tenantId_key" ON "Lawyer"("id", "tenantId")`,
];

describeWithDisposableDb(
  'OFFICE-WR01-B02 AŞAMA 1-2 — effective-dated work pool migration (disposable PostgreSQL)',
  () => {
    jest.setTimeout(180_000);
    let prisma: PrismaClient;

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    // ==========================================================================================
    // (1) STATİK SQL SÖZLEŞMESİ — ADIM sırası ve yasaklar
    // ==========================================================================================
    describe('migration dosyası sözleşmesi (§8.4 ADIM 0-9)', () => {
      const indexOf = (needle: string) => MIGRATION_SQL.indexOf(needle);

      it('ADIM 1 preflight, CREATE TYPE/TABLE öncesinde koşar ve fail-closed RAISE eder', () => {
        expect(indexOf('DO $preflight$')).toBeGreaterThanOrEqual(0);
        expect(indexOf('DO $preflight$')).toBeLessThan(indexOf('CREATE TYPE "OfficeWorkPoolKind"'));
        expect(indexOf('DO $preflight$')).toBeLessThan(indexOf('CREATE TABLE "OfficeWorkPoolMembership"'));
        expect(MIGRATION_SQL).toContain('BLOCKED office-work-pool backfill preflight');
        for (const counter of [
          'duplicate_manager',
          'duplicate_founder',
          'duplicate_staff_type',
          'orphan_lawyer',
          'cross_tenant_lawyer',
          'invalid_lawyer_id',
          'invalid_staff_type',
        ]) {
          expect(MIGRATION_SQL).toContain(counter);
        }
      });

      it('G1: anchor tablosu membership ile AYNI migration dosyasındadır (§9.5 AŞAMA 1)', () => {
        expect(MIGRATION_SQL).toContain('CREATE TABLE "OfficeWorkPoolMembership"');
        expect(MIGRATION_SQL).toContain('CREATE TABLE "OfficeWorkPoolEpoch"');
      });

      it('G2: ADIM 5 anchor seed, ADIM 6 backfill INSERT\'lerinden ÖNCEDİR (CF-B02-01)', () => {
        const anchorSeed = indexOf('INSERT INTO "OfficeWorkPoolEpoch"');
        const firstBackfill = indexOf('INSERT INTO "OfficeWorkPoolMembership"');
        expect(anchorSeed).toBeGreaterThanOrEqual(0);
        expect(firstBackfill).toBeGreaterThanOrEqual(0);
        expect(anchorSeed).toBeLessThan(firstBackfill);
      });

      it('cutoverAt TEK KEZ, açık UTC ile hesaplanır; her INSERT\'te now() çağrılmaz (§8.4 ADIM 4)', () => {
        expect(MIGRATION_SQL).toContain(`(now() AT TIME ZONE 'UTC')::timestamp(3) AS "cutoverAt"`);
        // Zaman kaynağı yalnız snapshot tanımında üretilir; INSERT gövdeleri onu okur.
        // Yorumlar çıkarılır — ADIM 4 şerhi zaman kaynağını tartışırken adını anar.
        const executable = MIGRATION_SQL.replace(/--[^\n]*/g, '');
        expect(executable.match(/now\(\)/g) ?? []).toHaveLength(1);
        expect(executable).toMatch(/s\."cutoverAt"/);
      });

      it('CHECK\'ler backfill SONRASI, index/FK\'ler en sonda kurulur (ADIM 7-8)', () => {
        const lastBackfill = MIGRATION_SQL.lastIndexOf('INSERT INTO "OfficeWorkPoolMembership"');
        expect(lastBackfill).toBeLessThan(indexOf('office_work_pool_member_carrier_xor_ck'));
        expect(indexOf('office_work_pool_revoked_actor_ck')).toBeLessThan(
          indexOf('office_work_pool_one_open_lawyer_membership'),
        );
        expect(indexOf('office_work_pool_one_open_stafftype_membership')).toBeLessThan(
          indexOf('OfficeWorkPoolMembership_memberLawyerId_tenantId_fkey'),
        );
      });

      it('ADIM 9 doğrulaması V1-V10 sayaçlarının TAMAMINI taşır (§8.6)', () => {
        for (const counter of [
          'v1_count_parity',
          'v2_set_parity',
          'v3_open_uniqueness',
          'v4_range_consistency',
          'v5_interval_overlap',
          'v6_tenant_integrity',
          'v7_provenance',
          'v8_anchor_missing',
          'v9_empty_pool_parity',
          'v10_anchor_boundary',
        ]) {
          expect(MIGRATION_SQL).toContain(counter);
        }
        expect(MIGRATION_SQL).toContain('BLOCKED office-work-pool backfill verification');
      });

      it('legacy alanlara YAZMAZ ve hiçbir satırı silmez (§8.5)', () => {
        expect(MIGRATION_SQL).not.toMatch(/UPDATE\s+"Office"/i);
        expect(MIGRATION_SQL).not.toMatch(/DELETE\s+FROM/i);
        expect(MIGRATION_SQL).not.toMatch(/DROP\s+TABLE\s+"Office"|DROP\s+COLUMN|TRUNCATE/i);
      });

      it('repo-novel EXCLUDE/btree_gist/tstzrange altyapısı GETİRMEZ (§6.3 dürüstlük şerhi)', () => {
        // Yorum satırları çıkarılır: §6.3 şerhi bu desenlerin NEDEN reddedildiğini açıklamak
        // için adlarını anar; yasak çalıştırılabilir SQL'e ilişkindir.
        const executable = MIGRATION_SQL.replace(/--[^\n]*/g, '');
        expect(executable).not.toMatch(/EXCLUDE\s+USING|btree_gist|tstzrange/i);
      });
    });

    // ==========================================================================================
    // (2) KANONİK ŞEMA — `prisma migrate deploy` ile gerçekten uygulanmış hâl
    // ==========================================================================================
    describe('uygulanmış kanonik şema', () => {
      it('iki tablo ve üç enum kanonik şemada mevcuttur', async () => {
        const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name IN ('OfficeWorkPoolMembership', 'OfficeWorkPoolEpoch')
          ORDER BY table_name`;
        expect(tables.map((t) => t.table_name)).toEqual([
          'OfficeWorkPoolEpoch',
          'OfficeWorkPoolMembership',
        ]);

        const types = await prisma.$queryRaw<Array<{ typname: string }>>`
          SELECT t.typname FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = current_schema()
            AND t.typname IN ('OfficeWorkPoolKind', 'OfficeWorkPoolMembershipProvenance', 'OfficeWorkPoolEpochProvenance')
          ORDER BY t.typname`;
        expect(types).toHaveLength(3);
      });

      it('beş CHECK constraint kuruludur (§6.3)', async () => {
        const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'public."OfficeWorkPoolMembership"'::regclass AND contype = 'c'
          ORDER BY conname`;
        expect(rows.map((r) => r.conname)).toEqual([
          'office_work_pool_kind_carrier_ck',
          'office_work_pool_member_carrier_xor_ck',
          'office_work_pool_revoked_actor_ck',
          'office_work_pool_revoked_range_ck',
          'office_work_pool_valid_range_ck',
        ]);
      });

      it('iki partial unique index yalnız AÇIK UÇLU satırları bağlar (§6.3)', async () => {
        const rows = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
          SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname IN ('office_work_pool_one_open_lawyer_membership', 'office_work_pool_one_open_stafftype_membership')
          ORDER BY indexname`;
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.indexdef).toContain('WHERE');
          expect(row.indexdef).toContain('validUntil');
          expect(row.indexdef).toContain('revokedAt');
        }
      });

      it('tenant-safe composite FK RESTRICT, Office FK CASCADE davranışındadır (§6.2)', async () => {
        const rows = await prisma.$queryRaw<Array<{ conname: string; confdeltype: string }>>`
          SELECT conname, confdeltype::text FROM pg_constraint
          WHERE conrelid IN ('public."OfficeWorkPoolMembership"'::regclass, 'public."OfficeWorkPoolEpoch"'::regclass)
            AND contype = 'f'
          ORDER BY conname`;
        const byName = new Map(rows.map((r) => [r.conname, r.confdeltype]));
        expect(byName.get('OfficeWorkPoolMembership_memberLawyerId_tenantId_fkey')).toBe('r');
        expect(byName.get('OfficeWorkPoolMembership_tenantId_fkey')).toBe('c');
        expect(byName.get('OfficeWorkPoolEpoch_tenantId_fkey')).toBe('c');
      });

      it('AŞAMA 1-2 sınırı: kanonik şemada bu tabloları okuyan/yazan yüzey olmadığı için tablolar sistemce doldurulmaz', async () => {
        // Bu iddia bir davranış testi değil, aşama sınırının açık kaydıdır: migration
        // yalnız MEVCUT Office satırlarından türetir; runtime hiçbir yerde yazmaz.
        const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count FROM "OfficeWorkPoolMembership"
          WHERE "provenance" <> 'LEGACY_CUTOVER_IMPORT'`;
        expect(Number(count)).toBe(0);
      });
    });

    // ==========================================================================================
    // (3) M1-M7 FIXTURE MATRİSİ — migration izole şemada GERÇEKTEN yeniden uygulanır
    // ==========================================================================================
    describe('M1-M7 fixture matrisi', () => {
      const createdSchemas: string[] = [];

      afterAll(async () => {
        for (const schema of createdSchemas) {
          await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        }
      });

      async function createSandbox(fixtures: string[]): Promise<string> {
        const schema = `b02_mig_${randomUUID().replace(/-/g, '')}`;
        createdSchemas.push(schema);
        await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        // SET LOCAL yalnız TEK bağlantıda geçerlidir; interactive transaction bunu garanti eder.
        await prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            for (const statement of [...SANDBOX_BASELINE, ...fixtures]) {
              await tx.$executeRawUnsafe(statement);
            }
          },
          { timeout: 60_000, maxWait: 20_000 },
        );
        return schema;
      }

      /** Migration'ı TEK transaction'da sandbox şemasına uygular. */
      async function applyMigration(schema: string): Promise<{ ok: boolean; error?: string }> {
        const statements = splitSqlStatements(MIGRATION_SQL);
        try {
          await prisma.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
              for (const statement of statements) {
                await tx.$executeRawUnsafe(statement);
              }
            },
            { timeout: 60_000, maxWait: 20_000 },
          );
          return { ok: true };
        } catch (error) {
          return { ok: false, error: String((error as Error).message ?? error) };
        }
      }

      async function countIn(schema: string, table: string): Promise<number> {
        const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count FROM "${schema}"."${table}"`,
        );
        return Number(rows[0].count);
      }

      /** RAISE sonrası artık kalmadığını kanıtlar: yeni tablo/tip SIFIR olmalıdır. */
      async function residue(schema: string): Promise<{ tables: number; types: number }> {
        const [tables] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count FROM information_schema.tables
             WHERE table_schema = '${schema}' AND table_name LIKE 'OfficeWorkPool%'`,
        );
        const [types] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = '${schema}' AND t.typname LIKE 'OfficeWorkPool%'`,
        );
        return { tables: Number(tables.count), types: Number(types.count) };
      }

      it('statement ayırıcı, DO bloklarını bölmeden migration\'ı parçalar', () => {
        const statements = splitSqlStatements(MIGRATION_SQL);
        const doBlocks = statements.filter((s) => s.includes('DO $'));
        expect(doBlocks).toHaveLength(2);
        expect(doBlocks[0]).toContain('BLOCKED office-work-pool backfill preflight');
        expect(doBlocks[1]).toContain('BLOCKED office-work-pool backfill verification');
      });

      it('M1 — üç havuzu da BOŞ olan mevcut Office: membership=0, epoch=3 (CF-B02-01)', async () => {
        const schema = await createSandbox([
          `INSERT INTO "Office"("id","tenantId","escalationManagerLawyerIds","escalationFounderLawyerIds","opStaffTypes")
             VALUES ('off-empty','t-empty', ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::"StaffType"[])`,
        ]);

        const result = await applyMigration(schema);
        expect(result.error).toBeUndefined();
        expect(result.ok).toBe(true);

        expect(await countIn(schema, 'OfficeWorkPoolMembership')).toBe(0);
        expect(await countIn(schema, 'OfficeWorkPoolEpoch')).toBe(3);

        const anchors = await prisma.$queryRawUnsafe<
          Array<{ poolKind: string; provenance: string }>
        >(`SELECT "poolKind"::text, "provenance"::text FROM "${schema}"."OfficeWorkPoolEpoch" ORDER BY "poolKind"::text`);
        expect(anchors.map((a) => a.poolKind).sort()).toEqual([
          'ESCALATION_FOUNDER',
          'ESCALATION_MANAGER',
          'OP_STAFF_TYPE',
        ]);
        expect(anchors.every((a) => a.provenance === 'LEGACY_CUTOVER_IMPORT')).toBe(true);
      });

      it('M2 — dolu havuzlar: V1-V10 PASS, tek validFrom, tek provenance, anchor<=membership', async () => {
        const schema = await createSandbox([
          `INSERT INTO "Lawyer"("id","tenantId") VALUES ('law-a','t1'),('law-b','t1'),('law-c','t1'),('law-x','t2')`,
          `INSERT INTO "Office"("id","tenantId","escalationManagerLawyerIds","escalationFounderLawyerIds","opStaffTypes")
             VALUES ('off-1','t1', ARRAY['law-a','law-b'], ARRAY['law-c'], ARRAY['MUHASEBE','SEKRETER']::"StaffType"[]),
                    ('off-2','t2', ARRAY['law-x'], ARRAY[]::TEXT[], ARRAY['ARSIV']::"StaffType"[])`,
        ]);

        const result = await applyMigration(schema);
        expect(result.error).toBeUndefined();
        expect(result.ok).toBe(true);

        // 2 office × 3 havuz
        expect(await countIn(schema, 'OfficeWorkPoolEpoch')).toBe(6);
        // t1: 2 staff + 2 manager + 1 founder = 5 · t2: 1 staff + 1 manager = 2
        expect(await countIn(schema, 'OfficeWorkPoolMembership')).toBe(7);

        const [summary] = await prisma.$queryRawUnsafe<
          Array<{ distinct_valid_from: bigint; non_legacy: bigint; closed_rows: bigint }>
        >(`SELECT COUNT(DISTINCT "validFrom")::bigint AS distinct_valid_from,
                  COUNT(*) FILTER (WHERE "provenance" <> 'LEGACY_CUTOVER_IMPORT')::bigint AS non_legacy,
                  COUNT(*) FILTER (WHERE "validUntil" IS NOT NULL OR "revokedAt" IS NOT NULL)::bigint AS closed_rows
             FROM "${schema}"."OfficeWorkPoolMembership"`);
        expect(Number(summary.distinct_valid_from)).toBe(1);
        expect(Number(summary.non_legacy)).toBe(0);
        expect(Number(summary.closed_rows)).toBe(0);

        // Tüm cutover damgaları TEK snapshot'tan: anchor.knownFrom == membership.validFrom
        const [boundary] = await prisma.$queryRawUnsafe<Array<{ violations: bigint }>>(
          `SELECT COUNT(*)::bigint AS violations
             FROM "${schema}"."OfficeWorkPoolMembership" m
             JOIN "${schema}"."OfficeWorkPoolEpoch" e
               ON e."tenantId" = m."tenantId" AND e."poolKind" = m."poolKind"
            WHERE e."knownFrom" <> m."validFrom"`,
        );
        expect(Number(boundary.violations)).toBe(0);

        // Küme pariteliği: legacy dizi == yeni tablo (tenant × havuz)
        const [parity] = await prisma.$queryRawUnsafe<Array<{ mismatches: bigint }>>(
          `SELECT COUNT(*)::bigint AS mismatches FROM "${schema}"."Office" o
            WHERE (SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), ARRAY[]::text[])
                     FROM unnest(o."escalationManagerLawyerIds") e)
                  IS DISTINCT FROM
                  (SELECT COALESCE(array_agg(DISTINCT m."memberLawyerId" ORDER BY m."memberLawyerId"), ARRAY[]::text[])
                     FROM "${schema}"."OfficeWorkPoolMembership" m
                    WHERE m."tenantId" = o."tenantId" AND m."poolKind" = 'ESCALATION_MANAGER'
                      AND m."validUntil" IS NULL AND m."revokedAt" IS NULL)`,
        );
        expect(Number(parity.mismatches)).toBe(0);
      });

      const anomalies: Array<{ id: string; label: string; counter: string; fixtures: string[] }> = [
        {
          id: 'M3',
          label: 'DUPLICATE — aynı dizide tekrarlanan lawyer id',
          counter: 'duplicate_manager=1',
          fixtures: [
            `INSERT INTO "Lawyer"("id","tenantId") VALUES ('law-dup','t1')`,
            `INSERT INTO "Office"("id","tenantId","escalationManagerLawyerIds","opStaffTypes")
               VALUES ('o','t1', ARRAY['law-dup','law-dup'], ARRAY[]::"StaffType"[])`,
          ],
        },
        {
          id: 'M4',
          label: 'ORPHAN — Lawyer tablosunda karşılığı olmayan id',
          counter: 'orphan_lawyer=1',
          fixtures: [
            `INSERT INTO "Office"("id","tenantId","escalationManagerLawyerIds","opStaffTypes")
               VALUES ('o','t1', ARRAY['ghost-lawyer'], ARRAY[]::"StaffType"[])`,
          ],
        },
        {
          id: 'M5',
          label: 'CROSS-TENANT — başka tenant\'a ait Lawyer id',
          counter: 'cross_tenant_lawyer=1',
          fixtures: [
            `INSERT INTO "Lawyer"("id","tenantId") VALUES ('law-other','t2')`,
            `INSERT INTO "Office"("id","tenantId","escalationManagerLawyerIds","opStaffTypes")
               VALUES ('o','t1', ARRAY['law-other'], ARRAY[]::"StaffType"[])`,
          ],
        },
        {
          id: 'M6',
          label: 'INVALID — yalnız whitespace taşıyan id',
          counter: 'invalid_lawyer_id=1',
          fixtures: [
            `INSERT INTO "Office"("id","tenantId","escalationManagerLawyerIds","opStaffTypes")
               VALUES ('o','t1', ARRAY['   '], ARRAY[]::"StaffType"[])`,
          ],
        },
        {
          id: 'M3b',
          label: 'DUPLICATE — aynı dizide tekrarlanan staff type',
          counter: 'duplicate_staff_type=1',
          fixtures: [
            `INSERT INTO "Office"("id","tenantId","opStaffTypes")
               VALUES ('o','t1', ARRAY['SEKRETER','SEKRETER']::"StaffType"[])`,
          ],
        },
      ];

      it.each(anomalies)(
        '$id — $label: RAISE + TAM ROLLBACK, kalıntı YOK',
        async ({ counter, fixtures }) => {
          const schema = await createSandbox(fixtures);

          const result = await applyMigration(schema);
          expect(result.ok).toBe(false);
          expect(result.error).toContain('BLOCKED office-work-pool backfill preflight');
          expect(result.error).toContain(counter);

          expect(await residue(schema)).toEqual({ tables: 0, types: 0 });
          // Baseline veri korunur: migration hiçbir mevcut satırı silmez/değiştirmez.
          expect(await countIn(schema, 'Office')).toBe(1);
        },
      );

      it('M7 — ENUM anomalisi yapısal olarak ERİŞİLEMEZDİR: DB enum\'u geçersiz değeri reddeder', async () => {
        const schema = await createSandbox([]);
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO "${schema}"."Office"("id","tenantId","opStaffTypes")
               VALUES ('bad','t-bad', ARRAY['NOT_A_STAFF_TYPE']::"${schema}"."StaffType"[])`,
          ),
        ).rejects.toThrow(/invalid input value for enum/i);
        // Bu yüzden migration'daki invalid_staff_type sayacı tasarımın tamlık talebi gereği
        // tutulur ve yapısal olarak 0'dır (§8.4 ADIM 1(e)).
        expect(MIGRATION_SQL).toContain('invalid_staff_type := 0;');
      });
    });
  },
);
