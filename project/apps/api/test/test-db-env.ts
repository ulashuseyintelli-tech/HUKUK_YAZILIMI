/**
 * Test-infra fail-safe: jest koşusunda dev DB'ye (hukuk_db) yazımı KÖKTEN engeller.
 *
 * SORUN: `require('@prisma/client')` import anında `.env`'i process.env'e yükler (Prisma tryLoadEnvs;
 *   dotenv-stili, mevcut env'i override ETMEZ). Bu yüzden DATABASE_URL gated integration spec'leri
 *   DATABASE_URL="" verilmeden koşulduğunda dev `hukuk_db`'ye bağlanıp immutable satır yazardı.
 *
 * ÇÖZÜM: setupFiles (test-file require'ından — dolayısıyla @prisma/client'tan — ÖNCE çalışır)
 *   DATABASE_URL'i ÖNCEDEN set eder. Prisma override etmediği için prod/.env DATABASE_URL sızamaz.
 *   Gelen DATABASE_URL/.env TAMAMEN yok sayılır; yalnız TEST_DATABASE_URL belirleyicidir (fail-closed).
 */

/** Dev veritabanı adı — testlerde KESİNLİKLE yasak. */
export const FORBIDDEN_DB = 'hukuk_db';

/** Güvenli test-DB adı kalıbı: ad bu işaretlerden birini taşımalı. */
const SAFE_NAME_RE = /(test|gate|spec|ci|jest)/i;

function extractDbName(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL ayrıştırılamadı (geçersiz URL).');
  }
  return parsed.pathname.replace(/^\//, '');
}

/**
 * Test koşusu için kullanılacak DATABASE_URL'i belirler (fail-closed).
 * - TEST_DATABASE_URL yok → '' (gelen DATABASE_URL/.env yok sayılır → gated specs skip).
 * - TEST_DATABASE_URL db adı == hukuk_db → THROW (dev yasak).
 * - TEST_DATABASE_URL db adı test/gate/spec/ci/jest içermiyor → THROW (güvensiz hedef).
 * - aksi halde → TEST_DATABASE_URL.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const test = (env.TEST_DATABASE_URL ?? '').trim();
  if (!test) return '';

  const dbName = extractDbName(test);
  if (dbName === FORBIDDEN_DB) {
    throw new Error(
      `TEST_DATABASE_URL dev veritabanına (${FORBIDDEN_DB}) işaret edemez — testler dev DB'ye karşı KOŞULMAZ.`,
    );
  }
  if (!SAFE_NAME_RE.test(dbName)) {
    throw new Error(
      `TEST_DATABASE_URL veritabanı adı güvenli değil ('${dbName}'): adı test/gate/spec/ci/jest içermeli.`,
    );
  }
  return test;
}

/**
 * process.env.DATABASE_URL'i fail-safe değere set eder. setupFiles tarafından çağrılır —
 * @prisma/client require'ından ÖNCE çalışmalıdır (yoksa .env sızıntısı önlenemez).
 */
export function applyTestDatabaseEnv(env: NodeJS.ProcessEnv = process.env): void {
  env.DATABASE_URL = resolveTestDatabaseUrl(env);
}
