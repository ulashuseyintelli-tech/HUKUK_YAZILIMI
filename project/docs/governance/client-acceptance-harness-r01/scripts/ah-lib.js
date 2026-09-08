/*
 * CLIENT KABUL ALTYAPISI (İ1a) — ORTAK KATMAN
 *
 * Amaç: sekiz hizmetin kabul koşumları için **izole** ortam, kimlik/yetki kurulumu, gönderim
 * izolasyonu ve erişim sonlandırma. Bu paket **kabul senaryolarını içermez** (o İ3'tür).
 *
 * F04 kabul paketinden BAĞIMSIZDIR: ne `f04-run.js` (bilinen kusur B(i): çıkış kodu beyaz
 * listesi) ne de kilit tutan `f04-02-a2-race.js` (bilinen kusur A) yolundan geçilir. Devralınan
 * şey kod değil, **ders**tir (fail-closed ölçüm · sırsız runId · finally'de erişim kapatma).
 *
 * ZORUNLU ORTAM DEĞİŞKENLERİ
 *   AH_DATABASE_URL   hedef PostgreSQL — **disposable olmak ZORUNDA** (G-0)
 *   AH_API_BASE_URL   yerel API kökü   — **loopback olmak ZORUNDA** (G-0)
 * İSTEĞE BAĞLI
 *   AH_RUN_ID (8 hex) · AH_STATE_FILE · AH_LOGIN_PASSWORD (verilmezse üretilir, BASILMAZ)
 *
 * GÜVENLİK KAPILARI (hepsi FAIL-CLOSED, ilk yazmadan ÖNCE çalışır):
 *   G-0  Ortam izolasyonu: DB host loopback + port allowlist + veritabanı adı allowlist;
 *        API kökü loopback. Üretim işaretlerinden HERHANGİ BİRİ görülürse **yazma BAŞLAMAZ**.
 *   G-1  Tenant slug'ı `ah-` ile başlamalı; bilinen gerçek/başka-program slug'ları YASAK.
 *   G-2  Yazma yapan her adım dokunduğu satırın tenant'ını doğrular.
 *   G-3  Slug çakışması → DUR.
 *   G-4  Sır (parola/token) çıktıya, durum dosyasına veya repoya YAZILMAZ.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TENANT_PREFIX = 'ah-';
/** Bu paketin ASLA dokunmayacağı tenant'lar (gerçek ofis + başka programların alanları). */
const FORBIDDEN_SLUGS = new Set([
  'telli-hukuk', 'demo-firma', 'local-development-office',
  'c36-smoke-principal', 'c36-smoke-principal-2',
]);
/** Disposable kabul edilen tek yapılandırma (genişletmek owner kararıdır). */
const ALLOWED_DB_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const ALLOWED_DB_PORTS = new Set(['5439']);
const ALLOWED_DB_NAMES = new Set(['hukuk_fix1_test']);
const ALLOWED_API_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} tanimli degil — fail-closed durur`);
  return v;
}

class EnvironmentGateError extends Error {
  constructor(m) { super(m); this.name = 'EnvironmentGateError'; this.gate = 'G-0'; }
}

/**
 * G-0 — ORTAM İZOLASYONU. **Herhangi bir yazmadan ÖNCE** çağrılır.
 * Ortam belirsizse (parse edilemeyen URL, allowlist dışı host/port/ad) yazma BAŞLAMAZ.
 * Dönen nesnede sır YOKTUR: yalnız host/port/veritabanı adı.
 */
function assertDisposableEnvironment() {
  const raw = requireEnv('AH_DATABASE_URL');
  let u;
  try { u = new URL(raw); } catch (e) {
    throw new EnvironmentGateError('AH_DATABASE_URL cozumlenemedi — ortam BELIRSIZ, yazma baslamaz');
  }
  const host = u.hostname;
  const port = u.port || '5432';
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!ALLOWED_DB_HOSTS.has(host)) {
    throw new EnvironmentGateError(`DB host '${host}' loopback DEGIL — production baglantisi riski, yazma baslamaz`);
  }
  if (!ALLOWED_DB_PORTS.has(port)) {
    throw new EnvironmentGateError(`DB port '${port}' disposable allowlist'te DEGIL (${[...ALLOWED_DB_PORTS].join(',')})`);
  }
  if (!ALLOWED_DB_NAMES.has(dbName)) {
    throw new EnvironmentGateError(`DB adi '${dbName}' disposable allowlist'te DEGIL (${[...ALLOWED_DB_NAMES].join(',')})`);
  }

  const api = requireEnv('AH_API_BASE_URL');
  let a;
  try { a = new URL(api); } catch (e) {
    throw new EnvironmentGateError('AH_API_BASE_URL cozumlenemedi — ortam BELIRSIZ');
  }
  if (!ALLOWED_API_HOSTS.has(a.hostname)) {
    throw new EnvironmentGateError(`API host '${a.hostname}' loopback DEGIL — yazma baslamaz`);
  }
  return { dbHost: host, dbPort: port, dbName, apiHost: a.hostname, apiPort: a.port || '80' };
}

/**
 * G-0 ikinci katman: API'nin GERÇEKTEN aynı disposable veritabanına bağlı olduğunu kanıtla.
 * Yöntem: DB'ye bir işaret tenant yazılır, API'nin login ucundan o tenant'ın *varlığı* üzerinden
 * ayırt edilir. Burada daha ucuz ve yeterli bir kanıt kullanılır: kurulum sonrası ilk login
 * denemesi. `ah-01-setup` bunu `verifyApiBoundToSameDatabase` ile yapar.
 */
async function verifyApiBoundToSameDatabase(prisma, base, email, password, tenantSlug) {
  const res = await httpJson('POST', `${base}/auth/login`, {
    body: { email, password, tenantSlug },
  });
  if (res.indeterminate) {
    return { bound: false, reason: `API yanit vermedi: ${res.indeterminateReason}` };
  }
  // HTTP 429 bir BAĞLANTI kanıtı değildir: `login-rate-limit.guard.ts` isteği kimlik
  // doğrulamaya ULAŞMADAN reddeder (IP başına 10/dk, aşılırsa 5 dk blok). Bunu "API başka
  // veritabanına bağlı" diye yorumlamak YANLIŞ olur — ölçüm YAPILAMADI demektir.
  if (res.status === 429) {
    const retry = (res.body && res.body.retryAfter) || null;
    return {
      bound: false, rateLimited: true,
      reason: `hiz siniri (HTTP 429) — baglanti OLCULEMEDI, "baska DB" anlamina GELMEZ`
        + `${retry ? `; ~${retry} sn sonra tekrar denenebilir` : ''}`,
    };
  }
  if (res.status === 200 || res.status === 201) {
    return { bound: true, reason: 'disposable DB\'ye yazilan sentetik hesap API uzerinden dogrulandi' };
  }
  return { bound: false, reason: `login HTTP ${res.status} — API BASKA bir veritabanina bagli olabilir` };
}

function loadPrisma(role) {
  const root = process.env.AH_PRISMA_ROOT
    || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/node_modules/@prisma/client';
  const { PrismaClient } = require(root);
  const url = (role === 'observer' && process.env.AH_OBSERVER_DATABASE_URL) || requireEnv('AH_DATABASE_URL');
  return new PrismaClient({ datasources: { db: { url } }, log: [] });
}

const STATE_FILE = () => process.env.AH_STATE_FILE || path.join(process.cwd(), 'ah-state.json');

/** G-4: sır alanları durum dosyasına ASLA yazılmaz. */
const SECRET_KEYS = new Set(['password', 'loginPassword', 'token', 'accessToken', 'passwordHash']);
function saveState(s) {
  for (const k of Object.keys(s)) {
    if (SECRET_KEYS.has(k)) throw new Error(`G-4 IHLALI: '${k}' durum dosyasina yazilamaz`);
  }
  fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...s, secretsStored: false }, null, 1), 'utf8');
}
function loadState() {
  const p = STATE_FILE();
  if (!fs.existsSync(p)) {
    throw new Error([
      `durum dosyasi yok: ${p}`,
      '  Kurulum COMMIT edilip dosya yazilamamis olabilir. Kurtarma:',
      '  AH_RUN_ID=<kosum kimligi> node ah-00-recover.js',
      '  (kosum kimligi tenant slug\'inin son parcasidir: ah-<runId>; SIR ICERMEZ)',
    ].join('\n'));
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Parola yalnız bellekte/alt süreç ortamında taşınır; hiçbir yere yazılmaz (G-4). */
function requireLoginPassword() {
  const v = process.env.AH_LOGIN_PASSWORD;
  if (!v) {
    throw new Error([
      'AH_LOGIN_PASSWORD tanimli degil — parola durum dosyasinda SAKLANMAZ ve CIKTIYA BASILMAZ.',
      '  Tek yurutucu (ah-run.js) onu bellekte uretip alt surece gecirir.',
    ].join('\n'));
  }
  return v;
}

function assertOwnSlug(slug) {
  if (!slug || !slug.startsWith(TENANT_PREFIX)) {
    throw new Error(`G-1 IHLALI: '${slug}' bu pakete ait degil (beklenen prefix '${TENANT_PREFIX}')`);
  }
  if (FORBIDDEN_SLUGS.has(slug)) throw new Error(`G-1 IHLALI: '${slug}' korunan bir tenant`);
}

async function assertOwnTenant(prisma, tenantId) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!t) throw new Error(`G-2 IHLALI: tenant bulunamadi (${tenantId})`);
  assertOwnSlug(t.slug);
  return t.slug;
}

/** Durum dosyası kaybolursa runId ile yeniden inşa (yalnız kimlikler; sır YOK). */
async function recoverState(prisma, runId) {
  const slug = `${TENANT_PREFIX}${runId}`;
  assertOwnSlug(slug);
  const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (!tenant) throw new Error(`kurtarma basarisiz: '${slug}' bulunamadi`);
  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id }, select: { id: true, email: true, role: true }, orderBy: { email: 'asc' },
  });
  const client = await prisma.client.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  const pick = (tag) => users.find((u) => u.email.startsWith(`${tag}-`)) || null;
  const viewer = pick('viewer'); const user = pick('user'); const elevated = pick('elevated');
  return {
    package: 'CLIENT-ACCEPTANCE-HARNESS-R01', recovered: true, runId, slug,
    tenantId: tenant.id, clientId: client && client.id,
    actors: {
      viewer: viewer && { id: viewer.id, email: viewer.email, role: viewer.role },
      user: user && { id: user.id, email: user.email, role: user.role },
      elevated: elevated && { id: elevated.id, email: elevated.email, role: elevated.role },
    },
  };
}

/**
 * HTTP. İstemci timeout'u sunucu işlemini İPTAL ETMEZ → abort/ağ hatası BELİRSİZ sonuçtur
 * (`indeterminate`), başarısızlık değil. Otomatik tekrar gönderim YAPILMAZ.
 */
async function httpJson(method, url, { token, body, timeoutMs = 30000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = { raw: text.slice(0, 400) }; }
    return { status: res.status, body: parsed, elapsedMs: Date.now() - started, indeterminate: false };
  } catch (e) {
    return {
      status: null, body: null, elapsedMs: Date.now() - started, indeterminate: true,
      indeterminateReason: e && e.name === 'AbortError'
        ? `istemci timeout (${timeoutMs} ms) — sunucu islemi DEVAM EDIYOR OLABILIR`
        : `tasima hatasi: ${e && e.message}`,
    };
  } finally { clearTimeout(timer); }
}

/** Login → token (token DÖNDÜRÜLÜR ama hiçbir yere YAZILMAZ). */
async function login(base, email, password, tenantSlug) {
  const r = await httpJson('POST', `${base}/auth/login`, { body: { email, password, tenantSlug } });
  if (r.indeterminate) return { ok: false, indeterminate: true, reason: r.indeterminateReason };
  const b = r.body || {};
  const token = b.token || b.access_token || b.accessToken || (b.data && (b.data.token || b.data.access_token));
  return { ok: !!token, status: r.status, token: token || null, body: b };
}

/**
 * Komşu verinin DEĞİŞMEDİĞİNİ ölçmek için kompakt parmak izi.
 * Disposable veritabanında binlerce tenant olabilir; tenant başına sorgu atmak yerine iki
 * `groupBy` ile tüm dağılım alınır ve sha256'lanır. Kendi tenant'ımız kapsam DIŞIDIR.
 */
async function isolationFingerprint(prisma, ownTenantId) {
  const [clients, users] = await Promise.all([
    prisma.client.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } }),
  ]);
  const acc = new Map();
  for (const r of clients) {
    if (r.tenantId === ownTenantId) continue;
    acc.set(r.tenantId, { c: r._count._all, u: 0 });
  }
  for (const r of users) {
    if (r.tenantId === ownTenantId) continue;
    const e = acc.get(r.tenantId) || { c: 0, u: 0 };
    e.u = r._count._all;
    acc.set(r.tenantId, e);
  }
  const rows = [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, v]) => `${id}:${v.c}:${v.u}`);
  return {
    tenantsObserved: rows.length,
    clientTotal: rows.reduce((n, r) => n + Number(r.split(':')[1]), 0),
    userTotal: rows.reduce((n, r) => n + Number(r.split(':')[2]), 0),
    digest: crypto.createHash('sha256').update(rows.join('|')).digest('hex').slice(0, 16),
  };
}

function newRunId() { return crypto.randomBytes(4).toString('hex'); }
function log(...a) { console.log(...a); }
function step(id, msg) { console.log(`\n[${id}] ${msg}`); }

module.exports = {
  TENANT_PREFIX, FORBIDDEN_SLUGS,
  requireEnv, assertDisposableEnvironment, verifyApiBoundToSameDatabase, EnvironmentGateError,
  loadPrisma, saveState, loadState, requireLoginPassword, recoverState,
  assertOwnSlug, assertOwnTenant, httpJson, login, newRunId, log, step, isolationFingerprint,
};
