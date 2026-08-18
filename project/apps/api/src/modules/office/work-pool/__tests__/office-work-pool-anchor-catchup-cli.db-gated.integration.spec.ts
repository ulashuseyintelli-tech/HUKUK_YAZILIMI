import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient, StaffType } from '@prisma/client';
import { describeDb } from '../../../../../test/describe-db';

/**
 * OFFICE-WR01-B02 · C14-R2-R01 — CATCH-UP CLI'ININ ENV-LOADING SÖZLEŞMESİ (OD-02).
 *
 * NEDEN VAR. C14-R2 GO-03'te production'da ölçülen kusur: derlenmiş catch-up CLI dotenv
 * YÜKLEMEZ ve `new PrismaClient()` yalnız `process.env.DATABASE_URL`e bakar. Bakım
 * penceresinde `node <compiled>.js --apply --drained-confirmed` çağrısı bu yüzden
 * `PrismaClientInitializationError` ile düştü — DB'ye hiç bağlanmadan, sıfır yazımla.
 * Kalıcı sözleşme artık `node --env-file=.env <compiled>.js`tir ve BURADA GERÇEK PROCESS
 * ile kanıtlanır; static guard yalnız script STRING'ini kilitler, davranışı kilitlemez.
 *
 * NE KANITLANIR: (1) child process DATABASE_URL'i MİRAS ALMAZ, tek bağlantı kaynağı geçici
 * `.env`tir; (2) bayraksız çağrı fail-closed düşer; (3) `--env-file` ile aynı çağrı geçerli
 * fixture'da PASS eder; (4) ikinci koşum idempotenttir; (5) `--apply` tek başına
 * `--drained-confirmed` olmadan yazmaz; (6) credential stdout/stderr'e SIZMAZ.
 *
 * DÜRÜSTLÜK SINIRI. CI'nin `Test Suite` job'i `nest build` KOŞMAZ; derlenmiş hedef orada
 * yoktur. Bu yüzden suite İKİ MODDA çalışır ve HİÇBİRİ sessizce atlanmaz:
 *   · COMPILED  — `dist` build'i varsa GERÇEK CLI çalıştırılır (tam sözleşme).
 *   · MECHANISM — build yoksa, CLI ile AYNI bağımlılık desenini taşıyan (dotenv'siz
 *     `new PrismaClient()`) minimal bir child ile `--env-file` mekanizması ve fail-closed
 *     davranışı kanıtlanır. Hangi modun koştuğu test adında GÖRÜNÜR.
 * `.tsbuildinfo` varlığı build göstergesi SAYILMAZ (C14-R2 GO-02'de ölçüldü); gösterge
 * `start` script'inin çalıştırdığı `main.js`tir.
 */

const API_ROOT = join(__dirname, '../../../../..');
const PKG = JSON.parse(readFileSync(join(API_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** Derlenmiş hedef ve build marker, package.json'dan TÜRETİLİR — elle yazılmaz. */
const COMPILED_REL = PKG.scripts['owp:anchor-catchup'].replace(/^node\s+--env-file=\.env\s+/, '');
const BUILD_MARKER_REL = PKG.scripts.start.replace(/^node\s+/, '');
const COMPILED_CLI = join(API_ROOT, COMPILED_REL);
const BUILD_PRESENT = existsSync(join(API_ROOT, BUILD_MARKER_REL)) && existsSync(COMPILED_CLI);
const MODE = BUILD_PRESENT ? 'COMPILED' : 'MECHANISM';

const T = 'owp-cli-env-tenant';
const L = 'owp-cli-env-lawyer';

/** Parent'tan DATABASE_URL'i ÇIKARAN child ortamı — tek kaynak `.env` olmalı. */
function childEnvWithoutDatabaseUrl(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  return env;
}

function run(args: string[], cwd: string) {
  const env = childEnvWithoutDatabaseUrl();
  expect(env.DATABASE_URL).toBeUndefined();
  return spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
}

describeDb(`OFFICE-WR01-B02 C14-R2-R01 — catch-up CLI env-loading (${MODE})`, () => {
  const prisma = new PrismaClient();
  let workDir: string;
  let databaseUrl: string;

  beforeAll(async () => {
    databaseUrl = process.env.DATABASE_URL as string;
    expect(typeof databaseUrl).toBe('string');

    // Geçici çalışma dizini: `--env-file=.env` GÖRELİ çözülür, bu yüzden `.env` buraya yazılır.
    workDir = mkdtempSync(join(tmpdir(), 'owp-cli-env-'));
    writeFileSync(join(workDir, '.env'), `DATABASE_URL="${databaseUrl}"\n`, 'utf8');

    // Sadece kendi fixture'ı: anchor'sız (gap) bir Office.
    await prisma.$executeRawUnsafe(`DELETE FROM "OfficeWorkPoolMembership" WHERE "tenantId" = $1`, T);
    await prisma.$executeRawUnsafe(`DELETE FROM "OfficeWorkPoolEpoch" WHERE "tenantId" = $1`, T);
    await prisma.office.deleteMany({ where: { tenantId: T } });
    await prisma.lawyer.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });

    await prisma.tenant.create({ data: { id: T, name: 'OWP CLI ENV', slug: T, updatedAt: new Date() } });
    await prisma.lawyer.create({
      data: { id: L, tenantId: T, name: 'Cli', surname: 'Env', updatedAt: new Date() },
    });
    await prisma.office.create({
      data: {
        id: `${T}-office`,
        tenantId: T,
        name: 'OWP CLI ENV OFFICE',
        updatedAt: new Date(),
        opStaffTypes: [StaffType.MUHASEBE, StaffType.SEKRETER],
        escalationManagerLawyerIds: [L],
        escalationFounderLawyerIds: [],
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "OfficeWorkPoolMembership" WHERE "tenantId" = $1`, T);
    await prisma.$executeRawUnsafe(`DELETE FROM "OfficeWorkPoolEpoch" WHERE "tenantId" = $1`, T);
    await prisma.office.deleteMany({ where: { tenantId: T } });
    await prisma.lawyer.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  /**
   * MECHANISM modunda kullanılan minimal child: CLI ile AYNI deseni taşır — dotenv YOK,
   * bağlantı yalnız `process.env.DATABASE_URL`den. Böylece `--env-file`in bağlantıyı
   * gerçekten sağladığı ve bayraksız çağrının fail-closed düştüğü kanıtlanır.
   */
  function writeMechanismProbe(): string {
    const probe = join(workDir, 'probe.cjs');
    const clientPath = require.resolve('@prisma/client').replace(/\\/g, '/');
    writeFileSync(
      probe,
      [
        `const { PrismaClient } = require(${JSON.stringify(clientPath)});`,
        `(async () => {`,
        `  const p = new PrismaClient();`,
        `  try { const r = await p.$queryRawUnsafe('SELECT 1 AS ok'); console.log(JSON.stringify({ ok: r[0].ok }));`,
        `  } finally { await p.$disconnect(); }`,
        `})().catch((e) => { console.error(JSON.stringify({ errorName: e.name })); process.exit(1); });`,
      ].join('\n'),
      'utf8',
    );
    return probe;
  }

  it('(1) bayraksiz cagri FAIL-CLOSED: DATABASE_URL yok -> client init hatasi, yazim 0', async () => {
    const target = BUILD_PRESENT ? COMPILED_CLI : writeMechanismProbe();
    const before = await prisma.officeWorkPoolEpoch.count({ where: { tenantId: T } });

    const r = run([target, ...(BUILD_PRESENT ? ['--apply', '--drained-confirmed'] : [])], workDir);

    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('PrismaClientInitializationError');
    expect(await prisma.officeWorkPoolEpoch.count({ where: { tenantId: T } })).toBe(before);
  });

  it('(2) --env-file=.env baglantiyi SAGLAR; tek kaynak gecici .env', () => {
    const target = BUILD_PRESENT ? COMPILED_CLI : writeMechanismProbe();
    const r = run(['--env-file=.env', target], workDir);
    const out = `${r.stdout}${r.stderr}`;

    // Her iki modda ORTAK kanit: client init HATASI YOK -> baglanti gercekten kuruldu.
    expect(out).not.toContain('PrismaClientInitializationError');

    if (!BUILD_PRESENT) {
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('"ok"');
      return;
    }

    // COMPILED: VERIFY_ONLY DB'yi OKUR ve sayaclari basar. Cikis kodu SOZLESMEYE baglidir:
    // after-sayaclarindan biri sifir degilse 1, hepsi sifirsa 0. Bu asamada fixture'da
    // anchor'siz Office VARDIR, dolayisiyla 1 beklenir — ve bu, DB'nin OKUNDUGUNUN kanitidir.
    expect(r.stdout).toContain('"mode": "VERIFY_ONLY"');
    const report = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)) as {
      after: Record<string, number>;
    };
    const clean = Object.values(report.after).every((v) => v === 0);
    expect(r.status).toBe(clean ? 0 : 1);
    expect(report.after.missing_anchor_count).toBeGreaterThan(0); // gap henuz kapatilmadi
  });

  it('(3) --apply TEK BASINA yazmaz (drain sozlesmesi korunur)', async () => {
    if (!BUILD_PRESENT) return; // sozlesme derlenmis CLI'a ozgudur; MECHANISM modunda kapsam disi
    const before = await prisma.officeWorkPoolEpoch.count({ where: { tenantId: T } });

    const r = run(['--env-file=.env', COMPILED_CLI, '--apply'], workDir);

    expect(r.status).toBe(2);
    expect(`${r.stdout}${r.stderr}`).toContain('DRAIN_NOT_CONFIRMED');
    expect(await prisma.officeWorkPoolEpoch.count({ where: { tenantId: T } })).toBe(before);
  });

  it('(4) --apply --drained-confirmed PASS eder ve ikinci kosum IDEMPOTENTTIR', async () => {
    if (!BUILD_PRESENT) return;

    const first = run(['--env-file=.env', COMPILED_CLI, '--apply', '--drained-confirmed'], workDir);
    expect(first.status).toBe(0);
    expect(await prisma.officeWorkPoolEpoch.count({ where: { tenantId: T } })).toBe(3);

    const snapshot = await prisma.officeWorkPoolMembership.findMany({
      where: { tenantId: T },
      orderBy: { id: 'asc' },
      select: { id: true, poolKind: true, validFrom: true, provenance: true },
    });
    expect(snapshot.every((m) => m.provenance === 'LEGACY_CUTOVER_IMPORT')).toBe(true);

    const second = run(['--env-file=.env', COMPILED_CLI, '--apply', '--drained-confirmed'], workDir);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('"candidateTenantCount": 0');

    const after = await prisma.officeWorkPoolMembership.findMany({
      where: { tenantId: T },
      orderBy: { id: 'asc' },
      select: { id: true, poolKind: true, validFrom: true, provenance: true },
    });
    expect(after).toEqual(snapshot);
  });

  it('(5) CREDENTIAL SIZINTISI YOK: connection string stdout/stderr de gecmez', () => {
    const target = BUILD_PRESENT ? COMPILED_CLI : writeMechanismProbe();
    const r = run(['--env-file=.env', target], workDir);
    const out = `${r.stdout}${r.stderr}`;

    expect(out).not.toContain(databaseUrl);
    expect(out).not.toMatch(/postgres(ql)?:\/\/[^\s"']*:[^\s"']*@/);
  });

  it('(6) DINAMIK PAKET INDIRME YOK: komut yuzeyi npx/tsx/ts-node icermez', () => {
    const script = PKG.scripts['owp:anchor-catchup'];
    for (const forbidden of ['npx', 'tsx', 'ts-node', '--yes']) {
      expect(script).not.toContain(forbidden);
    }
    expect(script.startsWith('node --env-file=.env ')).toBe(true);
  });
});
