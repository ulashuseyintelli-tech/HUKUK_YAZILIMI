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
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FORBIDDEN_DB, resolveTestDatabaseUrl } from '../../../../test/test-db-env';

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

/**
 * Bir statement'ın önündeki yorum satırlarını atıp çıplak SQL'i verir. Ayırıcı yorumları
 * bir sonraki ifadeye iliştirdiği için BEGIN/COMMIT tespiti buna dayanır.
 */
export function bareStatement(statement: string): string {
  return statement.replace(/^(?:\s*--[^\n]*\n)*\s*/, '').trim();
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

      it('ADIM 0: transaction sınırı migration dosyasının KENDİSİNDE — explicit BEGIN ilk, COMMIT son ifadedir', () => {
        const statements = splitSqlStatements(MIGRATION_SQL).map(bareStatement);
        expect(statements[0]).toBe('BEGIN');
        expect(statements[statements.length - 1]).toBe('COMMIT');
        // Tek bir transaction: iç içe/ek BEGIN veya COMMIT yok.
        expect(statements.filter((x) => /^(BEGIN|COMMIT)$/i.test(x))).toHaveLength(2);
        // Repo emsali gerçekten var (bu iki migration her CI koşumunda deploy edilir).
        expect(
          readFileSync(
            join(__dirname, '../../../../prisma/migrations/00000000000001_legal_kernel_triggers/migration.sql'),
            'utf8',
          ),
        ).toMatch(/^BEGIN;/m);
      });

      it('teşhis telafisi: BLOCKED sonrası operatörün koşacağı sorgular header içinde KAYITLIDIR', () => {
        expect(MIGRATION_SQL).toContain('TEŞHİS SORGULARI');
        for (const counter of [
          'AS duplicate_manager',
          'AS duplicate_founder',
          'AS duplicate_staff_type',
          'AS orphan_lawyer',
          'AS cross_tenant_lawyer',
          'AS invalid_lawyer_id',
        ]) {
          expect(MIGRATION_SQL).toContain(counter);
        }
      });

      it('R01 repair owner kararları migration dosyasında KAYITLIDIR', () => {
        expect(MIGRATION_SQL).toContain('CUID PREFLIGHT DISPOSITION = OWNER_RATIFIED');
        expect(MIGRATION_SQL).toContain('AŞAMA 4 ANCHOR CATCH-UP = REQUIRED PREDECESSOR');
        expect(MIGRATION_SQL).toContain('OFFICE-WR01-B02-AŞAMA-1-2-TRANSACTION-ATOMICITY-REPAIR-R01');
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
    // (3a) ADIM 0 — TEK TRANSACTION GARANTİSİ, GERÇEK `prisma migrate deploy` YOLUNDA
    // ==========================================================================================
    //
    // (3) numaralı sandbox matrisi atomikliği KENDİ açtığı interactive transaction içinde
    // ölçer — yani sonuçta harness'ın transaction'ını sınar, migration'ın kendi sınırını
    // değil. Bu blok o boşluğu kapatır: gerçek Prisma Migrate motoru, gerçek migration
    // geçmişi ve gerçek `_prisma_migrations` ledger'ı üzerinden koşar.
    //
    // ÖLÇÜLEN GERÇEK (dürüstlük şerhi): Prisma Migrate 5.22 migration dosyasını explicit
    // BEGIN/COMMIT olmadan da kendi transaction'ına sarar. Bu testin kanıtladığı şey
    // "atomiklik ARTIK var" değil, "atomiklik ARTIK dosyanın kendi sözleşmesidir ve
    // gerçek deploy yolunda ÖLÇÜLÜYOR"dur.
    describe('ADIM 0 tek-transaction garantisi — gerçek prisma migrate deploy', () => {
      jest.setTimeout(600_000);

      const B02_DIR = '20260817120000_office_wr01_b02_effective_dated_work_pools';
      const PRISMA_DIR = join(__dirname, '../../../../prisma');
      const NEW_TYPES = [
        'OfficeWorkPoolKind',
        'OfficeWorkPoolMembershipProvenance',
        'OfficeWorkPoolEpochProvenance',
      ];

      let tmpRoot = '';
      let templateDb = '';
      let admin: PrismaClient;
      const createdDbs: string[] = [];

      /** Aynı sunucu, farklı veritabanı. Ad fail-closed doğrulanır (dev DB'ye asla). */
      function urlFor(db: string): string {
        expect(db).not.toBe(FORBIDDEN_DB);
        const url = new URL(TEST_DB_URL);
        url.pathname = `/${db}`;
        return url.toString();
      }

      function newDbName(label: string): string {
        return `b02tx_${label}_${randomUUID().replace(/-/g, '').slice(0, 16)}_test`;
      }

      function prismaCliEntry(): string {
        return require.resolve('prisma/package.json').replace(/package\.json$/, 'build/index.js');
      }

      function deploy(tree: string, url: string): { ok: boolean; output: string } {
        try {
          const out = execFileSync(
            process.execPath,
            [prismaCliEntry(), 'migrate', 'deploy', '--schema', join(tree, 'schema.prisma')],
            { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', stdio: 'pipe' },
          );
          return { ok: true, output: String(out) };
        } catch (error) {
          const e = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
          return {
            ok: false,
            output: `${String(e.stdout ?? '')}${String(e.stderr ?? '')}${String(e.message ?? '')}`,
          };
        }
      }

      function buildTree(
        name: string,
        mutate?: (sql: string) => string,
        dropB02 = false,
      ): string {
        const tree = join(tmpRoot, name);
        cpSync(join(PRISMA_DIR, 'migrations'), join(tree, 'migrations'), { recursive: true });
        cpSync(join(PRISMA_DIR, 'schema.prisma'), join(tree, 'schema.prisma'));
        const target = join(tree, 'migrations', B02_DIR);
        if (dropB02) {
          rmSync(target, { recursive: true, force: true });
        } else if (mutate) {
          writeFileSync(join(target, 'migration.sql'), mutate(MIGRATION_SQL), 'utf8');
        }
        return tree;
      }

      async function queryDb<T>(db: string, sql: string): Promise<T[]> {
        const client = new PrismaClient({ datasources: { db: { url: urlFor(db) } } });
        try {
          return await client.$queryRawUnsafe<T[]>(sql);
        } finally {
          await client.$disconnect();
        }
      }

      async function cloneTemplate(label: string): Promise<string> {
        const db = newDbName(label);
        createdDbs.push(db);
        await admin.$executeRawUnsafe(`CREATE DATABASE "${db}" TEMPLATE "${templateDb}"`);
        return db;
      }

      beforeAll(async () => {
        admin = new PrismaClient({ datasources: { db: { url: urlFor('postgres') } } });
        await admin.$connect();

        tmpRoot = mkdtempSync(join(tmpdir(), 'b02tx-'));

        // Şablon veritabanı: B02 HARİÇ gerçek migration geçmişi + gerçek fixture verisi.
        templateDb = newDbName('tmpl');
        createdDbs.push(templateDb);
        await admin.$executeRawUnsafe(`CREATE DATABASE "${templateDb}"`);

        const baseDeploy = deploy(buildTree('base', undefined, true), urlFor(templateDb));
        expect(baseDeploy.output).toContain('successfully applied');
        expect(baseDeploy.ok).toBe(true);

        const seed = new PrismaClient({ datasources: { db: { url: urlFor(templateDb) } } });
        try {
          await seed.tenant.create({
            data: { id: 'b02tx-t1', name: 'B02 TX Tenant', slug: `b02tx-${randomUUID()}` },
          });
          await seed.lawyer.createMany({
            data: [
              { id: 'b02tx-law-a', tenantId: 'b02tx-t1', name: 'A', surname: 'Yonetici' },
              { id: 'b02tx-law-b', tenantId: 'b02tx-t1', name: 'B', surname: 'Kurucu' },
            ],
          });
          await seed.office.create({
            data: {
              id: 'b02tx-off-1',
              tenantId: 'b02tx-t1',
              name: 'B02 TX Buro',
              escalationManagerLawyerIds: ['b02tx-law-a'],
              escalationFounderLawyerIds: ['b02tx-law-b'],
              opStaffTypes: ['MUHASEBE', 'SEKRETER'],
            },
          });
        } finally {
          // CREATE DATABASE ... TEMPLATE, şablona AÇIK bağlantı kalmamasını ister.
          await seed.$disconnect();
        }
      });

      afterAll(async () => {
        for (const db of [...createdDbs].reverse()) {
          try {
            await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
          } catch {
            /* temizlik best-effort */
          }
        }
        await admin.$disconnect();
        if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
      });

      it('KONTROL — gerçek B02, gerçek deploy: preflight geçer, backfill üretilir, V1-V10 PASS', async () => {
        const db = await cloneTemplate('ok');
        const result = deploy(buildTree('real'), urlFor(db));
        expect(result.output).toContain('successfully applied');
        expect(result.ok).toBe(true);

        const [counts] = await queryDb<{ memberships: bigint; epochs: bigint; legacy: bigint }>(
          db,
          `SELECT (SELECT COUNT(*) FROM "OfficeWorkPoolMembership")::bigint AS memberships,
                  (SELECT COUNT(*) FROM "OfficeWorkPoolEpoch")::bigint AS epochs,
                  (SELECT COUNT(*) FROM "OfficeWorkPoolMembership"
                    WHERE "provenance" = 'LEGACY_CUTOVER_IMPORT')::bigint AS legacy`,
        );
        // 1 Office × 3 havuz = 3 anchor · 2 staff type + 1 manager + 1 founder = 4 üyelik
        expect(Number(counts.epochs)).toBe(3);
        expect(Number(counts.memberships)).toBe(4);
        expect(Number(counts.legacy)).toBe(4);
      });

      it('ADIM 9 kasıtlı doğrulama hatası — deploy DÜŞER, type/table/index/constraint/backfill kalıntısı SIFIRDIR', async () => {
        const db = await cloneTemplate('fail');

        // Preflight'ı GEÇEN fakat ADIM 9'da düşen türev. Enjeksiyon V1-V10 IF'inin hemen
        // öncesindedir: CREATE TYPE/TABLE, anchor seed, backfill, CHECK'ler ve index'lerin
        // TAMAMI çalışmış olur — rollback bu yüzden gerçek bir kalıntı testidir.
        const inject = (sql: string): string => {
          const marker = '  IF v1_count_parity > 0 OR';
          expect(sql).toContain(marker);
          return sql.replace(
            marker,
            `  v10_anchor_boundary := 1; -- KASITLI ADIM 9 HATASI (yalniz test kopyasi)\n${marker}`,
          );
        };
        const result = deploy(buildTree('fail', inject), urlFor(db));

        expect(result.ok).toBe(false);

        // ÖLÇÜLEN DAVRANIŞ (ve bilinen bedeli): explicit `BEGIN;` altında RAISE olduğunda
        // Prisma Migrate migration'ın kendi fail-closed mesajını DEĞİL, jenerik abort
        // hatasını raporlar. Atomiklik korunur (aşağıdaki kalıntı ölçümü), TEŞHİS kaybolur;
        // telafi migration header'ındaki teşhis sorgularıdır (aşağıda ayrıca test edilir).
        expect(result.output).toMatch(/current transaction is aborted/i);

        const [residue] = await queryDb<{
          types: bigint;
          tables: bigint;
          indexes: bigint;
          checks: bigint;
          fkeys: bigint;
        }>(
          db,
          `SELECT
             (SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = 'public' AND t.typname IN (${NEW_TYPES.map((t) => `'${t}'`).join(', ')}))::bigint AS types,
             (SELECT COUNT(*) FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name LIKE 'OfficeWorkPool%')::bigint AS tables,
             (SELECT COUNT(*) FROM pg_indexes
               WHERE schemaname = 'public'
                 AND (indexname LIKE 'OfficeWorkPool%' OR indexname LIKE 'office_work_pool%'))::bigint AS indexes,
             (SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE 'office_work_pool%')::bigint AS checks,
             (SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE 'OfficeWorkPool%')::bigint AS fkeys`,
        );
        expect({
          types: Number(residue.types),
          tables: Number(residue.tables),
          indexes: Number(residue.indexes),
          checks: Number(residue.checks),
          fkeys: Number(residue.fkeys),
        }).toEqual({ types: 0, tables: 0, indexes: 0, checks: 0, fkeys: 0 });

        // Backfill kalıntısı: tablolar yok → satır da yok. Buna KARŞILIK kaynak veri
        // BOZULMADAN durur — yani rollback YALNIZ B02'yi geri aldı, öncesini değil.
        const [survivors] = await queryDb<{ offices: bigint; lawyers: bigint; arrays: bigint }>(
          db,
          `SELECT (SELECT COUNT(*) FROM "Office")::bigint AS offices,
                  (SELECT COUNT(*) FROM "Lawyer")::bigint AS lawyers,
                  (SELECT cardinality("escalationManagerLawyerIds") + cardinality("escalationFounderLawyerIds")
                          + cardinality("opStaffTypes") FROM "Office" LIMIT 1)::bigint AS arrays`,
        );
        expect(Number(survivors.offices)).toBe(1);
        expect(Number(survivors.lawyers)).toBe(2);
        expect(Number(survivors.arrays)).toBe(4);

        // Ledger: B02 BAŞARILI olarak işaretlenmemiştir → yeniden deneme mümkün kalır.
        const [ledger] = await queryDb<{ finished: bigint }>(
          db,
          `SELECT COUNT(*)::bigint AS finished FROM _prisma_migrations
            WHERE migration_name = '${B02_DIR}' AND finished_at IS NOT NULL`,
        );
        expect(Number(ledger.finished)).toBe(0);
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

      /**
       * Migration'ı TEK transaction'da sandbox şemasına uygular.
       *
       * Dosyanın kendi `BEGIN;` / `COMMIT;` çifti burada SOYULUR: bu harness zaten kendi
       * interactive transaction'ını açar ve `SET LOCAL search_path` ile sandbox şemasına
       * bağlar; iç içe COMMIT dış transaction'ı erken kapatırdı. Soyma sayısı ayrıca
       * YAPISAL BİR KONTROLDÜR — tam bir BEGIN ve tam bir COMMIT beklenir.
       */
      async function applyMigration(schema: string): Promise<{ ok: boolean; error?: string }> {
        const all = splitSqlStatements(MIGRATION_SQL);
        expect(all.filter((x) => /^BEGIN$/i.test(bareStatement(x)))).toHaveLength(1);
        expect(all.filter((x) => /^COMMIT$/i.test(bareStatement(x)))).toHaveLength(1);
        const statements = all.filter((x) => !/^(BEGIN|COMMIT)$/i.test(bareStatement(x)));
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
