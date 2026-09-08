/*
 * OFFICE YAZMA KABUL HARNESS'I — ORTAK KATMAN (A-02 §8 provasi)
 *
 * NE: `OFFICE-YAZMA-KABUL-PAKETI-R01.md` (A-02) sozlesmesinin CALISTIRILABILIR karsiligi.
 *     Belge sozlesmedir; bu betikler onun uygulamasidir. Belge YENIDEN YAZILMAZ.
 * NE DEGIL: canli kabul. Bu harness A-01 tamamlanmadan CANLIYA kosulmaz; su anki izinli tek
 *     kullanim disposable provadir (paketin kendi dogrulugunu kanitlar).
 *
 * F04 PAKETININ KANITLANMIS IKI KUSURU BURADA TEKRARLANMAZ:
 *   - Kapanis `finally` yolunda calisir ve envanter hatasi kapanisi ENGELLEMEZ.
 *   - Kapatma dallarinda CIKIS KODU BEYAZ LISTESI YOKTUR (fail-open kusuru).
 * Ucuncu ders: olcum yapilamiyorsa sonuc OLCULEMEDI + nonzero; "yok" SAYILMAZ.
 *
 * ZORUNLU ORTAM DEGISKENLERI
 *   OW_DATABASE_URL   hedef PostgreSQL — disposable olmak ZORUNDA (G-0)
 *   OW_API_BASE_URL   API koku — loopback olmak ZORUNDA (G-0)
 * ISTEGE BAGLI
 *   OW_RUN_ID (8 hex) · OW_STATE_FILE · OW_LOGIN_PASSWORD (verilmezse uretilir, BASILMAZ)
 *   OW_ENVIRONMENT (disposable|live; VERILMEZSE `live` VARSAYILIR — fail-safe)
 *
 * GUVENLIK KAPILARI (hepsi FAIL-CLOSED, ilk yazmadan ONCE)
 *   G-0  Ortam izolasyonu: DB host loopback + port + ad allowlist; API koku loopback.
 *   G-1  Tenant slug'i `off-acc-` ile baslamali; gercek/baska-program slug'lari YASAK.
 *   G-2  Yazan her adim dokundugu satirin tenant'ini dogrular.
 *   G-3  Slug cakismasi → DUR.
 *   G-4  Sir (parola/token) durum dosyasina, ciktiya veya repoya YAZILMAZ.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TENANT_PREFIX = 'off-acc-';

/** Bu paketin ASLA dokunmayacagi tenant'lar (A-02 §1). */
const FORBIDDEN_SLUGS = new Set([
  'telli-hukuk',
  'demo-firma',
  'local-development-office',
  'c36-smoke-principal',
  'c36-smoke-principal-2',
]);
/** F04 kabul hattinin alani; OFFICE kabulune devredilmez (A-02 §1). */
const FORBIDDEN_PREFIXES = ['f04-acc-', 'ah-'];

// Disposable kabul edilen TEK yapilandirma. Genisletmek owner kararidir.
const ALLOWED_DB_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const ALLOWED_DB_PORTS = new Set(['5439']);
const ALLOWED_DB_NAMES = new Set(['hukuk_office_acc_test']);
const ALLOWED_API_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} tanimli degil — fail-closed durur`);
  return v;
}

class EnvironmentGateError extends Error {
  constructor(m) { super(m); this.name = 'EnvironmentGateError'; this.gate = 'G-0'; }
}
/** Zorunlu bir olcum YAPILAMADI — sonuc "yok" DEGIL, "bilinmiyor". */
class ObservationError extends Error {
  constructor(m) { super(m); this.name = 'ObservationError'; this.observationFailed = true; }
}

/**
 * G-0 — ORTAM IZOLASYONU. HERHANGI BIR YAZMADAN ONCE cagrilir.
 * Ortam belirsizse (parse edilemeyen URL, allowlist disi host/port/ad) yazma BASLAMAZ.
 * Donen nesnede SIR YOKTUR: yalniz host/port/veritabani adi.
 */
function assertDisposableEnvironment() {
  const raw = requireEnv('OW_DATABASE_URL');
  let u;
  try { u = new URL(raw); } catch (e) {
    throw new EnvironmentGateError('OW_DATABASE_URL cozumlenemedi — ortam BELIRSIZ, yazma baslamaz');
  }
  const host = u.hostname;
  const port = u.port || '5432';
  const dbName = decodeURIComponent((u.pathname || '').replace(/^\//, ''));
  if (!ALLOWED_DB_HOSTS.has(host)) {
    throw new EnvironmentGateError(`G-0 IHLALI: DB host '${host}' loopback degil`);
  }
  if (!ALLOWED_DB_PORTS.has(port)) {
    throw new EnvironmentGateError(`G-0 IHLALI: DB port '${port}' disposable allowlist'te yok`);
  }
  if (!ALLOWED_DB_NAMES.has(dbName)) {
    throw new EnvironmentGateError(`G-0 IHLALI: DB adi '${dbName}' disposable allowlist'te yok`);
  }

  const apiRaw = requireEnv('OW_API_BASE_URL');
  let a;
  try { a = new URL(apiRaw); } catch (e) {
    throw new EnvironmentGateError('OW_API_BASE_URL cozumlenemedi — ortam BELIRSIZ');
  }
  if (!ALLOWED_API_HOSTS.has(a.hostname)) {
    throw new EnvironmentGateError(`G-0 IHLALI: API host '${a.hostname}' loopback degil`);
  }
  return { dbHost: host, dbPort: port, dbName, apiHost: a.hostname, apiPort: a.port || '80' };
}

function loadPrisma() {
  const root = process.env.OW_PRISMA_ROOT
    || path.join(__dirname, '../../../../apps/api/node_modules/@prisma/client');
  const { PrismaClient } = require(root);
  return new PrismaClient({ datasources: { db: { url: requireEnv('OW_DATABASE_URL') } }, log: [] });
}

const STATE_FILE = () => process.env.OW_STATE_FILE || path.join(process.cwd(), 'ow-state.json');

/** G-4: sir alanlari durum dosyasina YAZILAMAZ. Yazmaya calisan cagri HATA alir. */
const SECRET_KEYS = /(password|passwd|secret|token|apikey|api_key)/i;
function assertNoSecrets(obj, trail = '$') {
  if (obj === null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.test(k) && v !== false && v !== null && v !== undefined && v !== '') {
      throw new Error(`G-4 IHLALI: '${trail}.${k}' durum dosyasina yazilamaz (sir)`);
    }
    assertNoSecrets(v, `${trail}.${k}`);
  }
}
function saveState(s) {
  assertNoSecrets(s);
  fs.writeFileSync(STATE_FILE(), JSON.stringify(s, null, 1), 'utf8');
}
function loadState() {
  const p = STATE_FILE();
  if (!fs.existsSync(p)) {
    throw new Error([
      `durum dosyasi yok: ${p}`,
      '  Kurulum COMMIT edildikten sonra dosya yazilamamis olabilir. Kurtarma:',
      '  OW_RUN_ID=<kosum kimligi> node ow-00-recover.js',
    ].join('\n'));
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function requireLoginPassword() {
  const v = process.env.OW_LOGIN_PASSWORD;
  if (!v) throw new Error('OW_LOGIN_PASSWORD tanimli degil — parola durum dosyasinda SAKLANMAZ');
  return v;
}

/** G-1 */
function assertOwnSlug(slug) {
  if (!slug || !slug.startsWith(TENANT_PREFIX)) {
    throw new Error(`G-1 IHLALI: '${slug}' bu pakete ait degil (beklenen prefix '${TENANT_PREFIX}')`);
  }
  if (FORBIDDEN_SLUGS.has(slug)) throw new Error(`G-1 IHLALI: '${slug}' gercek/baska program tenant'i`);
  for (const p of FORBIDDEN_PREFIXES) {
    if (slug.startsWith(p)) throw new Error(`G-1 IHLALI: '${slug}' baska bir kabul hattina ait`);
  }
}
/** G-2 */
async function assertOwnTenant(prisma, tenantId) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!t) throw new Error(`G-2 IHLALI: tenant bulunamadi (${tenantId})`);
  assertOwnSlug(t.slug);
  return t.slug;
}

/**
 * HTTP. Istemci timeout'u SUNUCU ISLEMINI IPTAL ETMEZ → sonuc BELIRSIZ isaretlenir ve
 * cagiran onu salt-okuma ile uzlastirir. Otomatik tekrar gonderim ASLA yapilmaz.
 */
async function httpJson(method, url, { token, body, timeoutMs = 30000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
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
      indeterminateReason: (e && e.name === 'AbortError')
        ? `istemci timeout (${timeoutMs} ms) — sunucu islemi DEVAM EDIYOR OLABILIR`
        : `tasima hatasi: ${e && e.message}`,
    };
  } finally { clearTimeout(timer); }
}

/** AUTH-01: login govdesi `tenantSlug` ZORUNLU ister; yanit alani `token`. */
async function login(base, email, password, tenantSlug, { rateLimitBudgetMs = 360000 } = {}) {
  // OLCULEN KISIT (login-rate-limit.guard.ts): WINDOW_MS 60 s / MAX_ATTEMPTS 10; limit
  // ASILDIGINDA resetAt **BLOCK_DURATION_MS = 5 dk** olarak uzatilir. Bloke istek erken
  // THROW ettigi icin yeniden deneme kilidi UZATMAZ. Sunucu 429 govdesinde `retryAfter`
  // (saniye) doner — ONU esas aliyoruz. Bu bir urun kusuru DEGIL, harness kisitidir ve
  // CANLI kabul kosumu da ayni duvara carpar.
  const deadline = Date.now() + rateLimitBudgetMs;
  let r = null;
  for (;;) {
    r = await httpJson('POST', `${base}/auth/login`, { body: { email, password, tenantSlug } });
    if (r.status !== 429 || Date.now() >= deadline) break;
    const ra = Number((r.body && r.body.retryAfter) || 15);
    const waitMs = Math.min(Math.max(ra, 5) * 1000 + 2000, Math.max(deadline - Date.now(), 0));
    if (waitMs <= 0) break;
    console.log(`      [login] rate-limit 429 — sunucu retryAfter=${ra}s; ${Math.round(waitMs / 1000)}s beklenecek`);
    await new Promise((res) => setTimeout(res, waitMs));
  }
  const b = r.body || {};
  const token = b.token || b.access_token || b.accessToken
    || (b.data && (b.data.token || b.data.access_token || b.data.accessToken));
  if (!token) throw new Error(`login basarisiz (HTTP ${r.status}) — ${email}`);
  return token;
}

/**
 * Oturum cozumleme — ADIM BASINA LOGIN YAPMAZ.
 *
 * OLCULEN KISIT: `LoginRateLimitGuard` tekrarli girisleri **429** ile reddeder. Her kabul
 * adimi kendi login'ini yaparsa tam kosum limiti asar ve adimlar OLCULEMEDEN duser (prova
 * sirasinda gercekten oldu). Bu bir urun kusuru DEGIL, harness kisitidir — ve CANLI kosum
 * da ayni duvara carpardi.
 *
 * Cozum: tek yurutucu (`ow-run.js`) oturumu BIR KEZ acar ve token'lari alt sureclere ORTAM
 * DEGISKENI ile gecirir (parolayla ayni muamele). Token durum dosyasina YAZILMAZ (G-4).
 */
async function resolveTokens(base, st) {
  const adminPw = requireLoginPassword();
  const staffPw = process.env.OW_STAFF_PASSWORD || adminPw;
  const admin = process.env.OW_ADMIN_TOKEN || (await login(base, st.adminEmail, adminPw, st.slug));
  const staff = process.env.OW_STAFF_TOKEN || (await login(base, st.staffEmail, staffPw, st.slug));
  return { admin, staff };
}

// ── sonuc toplayici ────────────────────────────────────────────────────────────
function makeRecorder(label) {
  const results = [];
  return {
    results,
    ok(id, desc, cond, observed) {
      results.push({ id, desc, ok: !!cond, observed });
      console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${id.padEnd(10)} ${desc}\n             ${observed}`);
      return !!cond;
    },
    /** Olculemeyen zorunlu sonuc: PASS SAYILMAZ. */
    unmeasured(id, desc, why) {
      results.push({ id, desc, ok: false, unmeasured: true, observed: `OLCULEMEDI — ${why}` });
      console.log(`  ????  ${id.padEnd(10)} ${desc}\n             OLCULEMEDI — ${why}`);
      return false;
    },
    summary() {
      const pass = results.filter((r) => r.ok).length;
      const unmeasured = results.filter((r) => r.unmeasured).length;
      const fail = results.length - pass;
      console.log(`\n${label}: ${pass}/${results.length} PASS · FAIL ${fail} · OLCULEMEDI ${unmeasured}`);
      return { label, pass, fail, unmeasured, total: results.length, results };
    },
  };
}

function log(...a) { console.log(...a); }
function step(id, msg) { console.log(`\n[${id}] ${msg}`); }
function newRunId() { return crypto.randomBytes(4).toString('hex'); }

module.exports = {
  TENANT_PREFIX, FORBIDDEN_SLUGS, FORBIDDEN_PREFIXES,
  ALLOWED_DB_NAMES, ALLOWED_DB_PORTS,
  requireEnv, assertDisposableEnvironment, EnvironmentGateError, ObservationError,
  loadPrisma, saveState, loadState, assertNoSecrets, requireLoginPassword,
  assertOwnSlug, assertOwnTenant, httpJson, login, resolveTokens,
  makeRecorder, log, step, newRunId,
};
