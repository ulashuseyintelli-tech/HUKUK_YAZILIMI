/*
 * CLIENT İ1b — CANLI SENTETİK KABUL ALANI KÜTÜPHANESİ (TEK KAYNAK)
 *
 * NEDEN AYRI: İ1a düzeneği (`ah-lib.js`) G-0 kapısında YALNIZ `127.0.0.1:5439/hukuk_fix1_test`
 * kabul eder ve bunun env ile aşılma yolu YOKTUR (tasarım gereği). İ5b'nin kapatıcısı
 * (`f04-09`) ise `f04-acc-` önekine bağlıdır. İ1b canlı `hukuk_db`'ye `cl-acc-` önekiyle yazar;
 * bu yüzden kendi ortam kapısı ve öneki olan dar bir kütüphane gerekir.
 *
 * KAPILAR
 *   G-0  ORTAM: `CL_ENVIRONMENT` ZORUNLU ve {disposable|live}. Her ortamın KENDİ DB allowlist'i
 *        vardır; `live` ayrıca `CL_OWNER_GO_REF` ister (owner'ın YAZILI canlı-yazma onayı).
 *        Eksik/uyumsuz → HİÇBİR yazma başlamaz.
 *   G-1  Slug `cl-acc-<8hex>`; bilinen gerçek/başka-program slug'ları ve yabancı önekler YASAK.
 *   G-2  Dokunulan her tenant'ın slug'ı G-1'den geçer (kapatma dahil).
 *   G-3  Slug çakışması → DUR.
 *   G-4  Sır (parola/token/URL) çıktıya, durum dosyasına veya repoya YAZILMAZ.
 *
 * KAPATMA MANTIĞI KOPYALANMAZ: İ5b'de gerçek hata yollarında doğrulanan
 * `f04-lib.revokeTenantAccess` yeniden kullanılır; yalnız sahiplik kapısı bu paketinki olur.
 */
'use strict';
const path = require('path');
const F04 = require(path.join(__dirname, '../../f04-live-acceptance-r01/scripts/f04-lib.js'));

const TENANT_PREFIX = 'cl-acc-';

// Başka programların/kişilerin alanları — bu paket bunlara ASLA yazmaz.
const FORBIDDEN_SLUGS = new Set([
  'telli-hukuk', 'demo-firma', 'local-development-office',
  'c36-smoke-principal', 'c36-smoke-principal-2',
]);
// Yabancı sentetik önekler — İ1a (disposable), F04, OFFICE kabul alanları.
const FOREIGN_PREFIXES = ['ah-', 'f04-acc-', 'off-acc-', 'o4-acc-', 'i3-'];

const ENVIRONMENTS = {
  disposable: { hosts: ['127.0.0.1', 'localhost'], ports: ['5439'], dbs: ['hukuk_fix1_test'] },
  live:       { hosts: ['127.0.0.1', 'localhost'], ports: ['5432'], dbs: ['hukuk_db'] },
};

class EnvironmentGateError extends Error {
  constructor(m) { super(m); this.name = 'EnvironmentGateError'; this.gate = 'G-0'; }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} tanimli degil — paket fail-closed durur`);
  return v;
}

/**
 * G-0 — ORTAM KAPISI. Yazmadan ÖNCE çağrılır. Sonuç nesnesi SIR İÇERMEZ.
 * `live` yalnız CL_OWNER_GO_REF ile açılır; bu bir yetki ÜRETMEZ, owner'ın yazılı onayının
 * koşuma BAĞLANDIĞINI kayda geçirir (makbuzda görünür).
 */
function assertEnvironment() {
  const envName = (process.env.CL_ENVIRONMENT || '').toLowerCase();
  if (!ENVIRONMENTS[envName]) {
    throw new EnvironmentGateError(`CL_ENVIRONMENT='${envName || 'yok'}' — {disposable|live} ZORUNLU; ortam BELIRSIZ, yazma baslamaz`);
  }
  const spec = ENVIRONMENTS[envName];
  const raw = requireEnv('CL_DATABASE_URL');
  let u;
  try { u = new URL(raw); } catch (e) { throw new EnvironmentGateError('CL_DATABASE_URL cozumlenemedi — ortam BELIRSIZ'); }
  const host = u.hostname; const port = u.port || '5432';
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0]);
  if (!spec.hosts.includes(host)) throw new EnvironmentGateError(`DB host '${host}' loopback DEGIL — yazma baslamaz`);
  if (!spec.ports.includes(port)) throw new EnvironmentGateError(`DB port '${port}' '${envName}' allowlist'inde DEGIL (${spec.ports.join(',')})`);
  if (!spec.dbs.includes(dbName)) throw new EnvironmentGateError(`DB adi '${dbName}' '${envName}' allowlist'inde DEGIL (${spec.dbs.join(',')})`);

  let ownerGoRef = null;
  if (envName === 'live') {
    ownerGoRef = process.env.CL_OWNER_GO_REF || '';
    if (!/^OWNER-GO-CLIENT-I1B-[0-9]{8}-R[0-9]{2}$/.test(ownerGoRef)) {
      throw new EnvironmentGateError('CL_ENVIRONMENT=live icin CL_OWNER_GO_REF (OWNER-GO-CLIENT-I1B-YYYYMMDD-Rnn) ZORUNLU — owner onayi olmadan canli yazma BASLAMAZ');
    }
  }
  return { environment: envName, dbHost: host, dbPort: port, dbName, ownerGoRef };
}

/** G-1 */
function assertOwnSlug(slug) {
  if (!slug || !slug.startsWith(TENANT_PREFIX)) throw new Error(`G-1 IHLALI: '${slug}' bu pakete ait degil (beklenen prefix '${TENANT_PREFIX}')`);
  if (FORBIDDEN_SLUGS.has(slug)) throw new Error(`G-1 IHLALI: '${slug}' korunan tenant`);
  for (const p of FOREIGN_PREFIXES) if (slug.startsWith(p)) throw new Error(`G-1 IHLALI: '${slug}' yabanci onek '${p}'`);
}

/** G-2 */
async function assertOwnTenant(prisma, tenantId) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!t) throw new Error(`G-2 IHLALI: tenant bulunamadi (${tenantId})`);
  assertOwnSlug(t.slug);
  return t.slug;
}

function loadPrisma() {
  const root = process.env.CL_PRISMA_ROOT
    || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/@prisma/client';
  const { PrismaClient } = require(root);
  return new PrismaClient({ datasources: { db: { url: requireEnv('CL_DATABASE_URL') } }, log: [] });
}

/** Alan YALNIZ runId ile bulunur (durum dosyasına bağımlı DEĞİL). Salt-okuma. */
async function findAcceptanceField(prisma, runId) {
  const id = String(runId || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(id)) throw new Error(`gecersiz runId='${runId}' (8 hex bekleniyor)`);
  const slug = `${TENANT_PREFIX}${id}`;
  assertOwnSlug(slug);
  const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (!tenant) return { runId: id, slug, exists: false, tenantId: null };
  const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, isActive: true, tokenVersion: true } });
  return { runId: id, slug, exists: true, tenantId: tenant.id, users, activeUsers: users.filter((u) => u.isActive).length };
}

/**
 * ERİŞİM KAPATMA — İ5b'de doğrulanmış mantık (`f04-lib.revokeTenantAccess`) AYNEN kullanılır;
 * yalnız sahiplik kapısı bu paketin G-2'sidir. Tekrarı güvenlidir.
 */
async function revokeTenantAccess(prisma, tenantId) {
  return F04.revokeTenantAccess(prisma, tenantId, { assertOwn: assertOwnTenant });
}

/** G-4: durum dosyasına sır yazılmaz. */
const SECRET_KEYS = new Set(['password', 'passwordHash', 'token', 'jwt', 'secret', 'databaseUrl', 'CL_DATABASE_URL', 'CL_LOGIN_PASSWORD']);
function assertNoSecrets(obj, p = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.has(k)) throw new Error(`G-4 IHLALI: '${p}${k}' durum dosyasina yazilamaz`);
    if (v && typeof v === 'object') assertNoSecrets(v, `${p}${k}.`);
  }
}

module.exports = {
  TENANT_PREFIX, FORBIDDEN_SLUGS, FOREIGN_PREFIXES, ENVIRONMENTS, EnvironmentGateError,
  requireEnv, assertEnvironment, assertOwnSlug, assertOwnTenant, loadPrisma,
  findAcceptanceField, revokeTenantAccess, assertNoSecrets,
};
