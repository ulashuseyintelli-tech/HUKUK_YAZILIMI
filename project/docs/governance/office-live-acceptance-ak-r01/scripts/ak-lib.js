/*
 * OFFICE RELEASE22 HEDEFLI KABUL (AK-2 + AK-1a) — ORTAK KATMAN
 *
 * NE: `OFFICE-LIVE-ACCEPTANCE-AK-R01.md` sozlesmesinin calistirilabilir karsiligi.
 * NE DEGIL: canli kabul yetkisi. Canli kosum yalniz owner'in AYRI OFFICE canli GO'su ile ve
 *     CLIENT I9 kapanisi dogrulandiktan sonra yapilir (belge §1). Disposable prova canli PASS SAYILMAZ.
 *
 * YENIDEN KULLANIM: genel yardimcilar (HTTP, login + hiz siniri butcesi, sonuc toplayici, sir
 * kapisi) `office-delivery-r01/scripts/ow-lib.js`'den ALINIR, KOPYALANMAZ. Bu dosya yalniz AK'ye
 * ozgu kimligi tasir: kendi tenant oneki, kendi ortam allowlist'i, kendi canli jetonu ve GO referansi.
 * A-03..A-07 canli jetonu (`YES-LIVE-OFFICE-ACCEPTANCE-A03-A07`) bu paketi CALISTIRAMAZ.
 *
 * ORTAM DEGISKENLERI
 *   AK_ENVIRONMENT      disposable | live   (VERILMEZSE `live` — fail-safe, en kisitli dal)
 *   AK_DATABASE_URL     hedef PostgreSQL (loopback + ortama gore port/ad allowlist'i)
 *   AK_API_BASE_URL     API koku, `/api` dahil (loopback; disposable'da canli port 8080 YASAK,
 *                       canlida YALNIZ 8080)
 *   AK_PRISMA_ROOT      `@prisma/client` dizini (ZORUNLU; canlida RELEASE22 kokununki)
 *   AK_BCRYPT_PATH      `bcrypt` paket dizini (ZORUNLU)
 *   AK_CONFIRM_LIVE     canli jeton (yalniz live)
 *   AK_OWNER_GO_REF     OWNER-GO-OFFICE-AK-YYYYMMDD-Rnn (yalniz live; bicim ZORUNLU)
 *   AK_STATE_FILE / AK_RESULT_FILE   repo DISI yollar (sir icermez)
 *
 * GUVENLIK KAPILARI (FAIL-CLOSED, ilk yazmadan ONCE)
 *   G-0  ortam izolasyonu + canli jeton + GO referansi + API/DB ortam caprazlama kilidi
 *   G-1  tenant slug'i `off-ak-` ile baslar; gercek ve baska kabul hatlarinin onekleri YASAK
 *   G-2  yazan her adim dokundugu tenant'i dogrular
 *   G-3  slug cakismasi -> DUR
 *   G-4  sir (parola/token) durum/sonuc dosyasina ve ciktiya YAZILMAZ (ow-lib assertNoSecrets)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OW = require('../../office-delivery-r01/scripts/ow-lib');

const TENANT_PREFIX = 'off-ak-';
const FORBIDDEN_SLUGS = OW.FORBIDDEN_SLUGS; // telli-hukuk, demo-firma, local-development-office, c36-smoke-*
/** Diger kabul hatlarinin alanlari: AK bunlara ASLA dokunmaz (A-03..A-07 dahil). */
const FORBIDDEN_PREFIXES = ['off-acc-', 'cl-acc-', 'f04-acc-', 'ah-'];

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const ENVIRONMENTS = {
  disposable: { dbPorts: new Set(['5441']), dbNames: new Set(['hukuk_office_ak_acc_test']) },
  live: { dbPorts: new Set(['5432']), dbNames: new Set(['hukuk_db']) },
};
/** Canli API portu. Disposable DB'ye yazarken canli API'ye istek atmak (ya da tersi) KILITLIDIR. */
const LIVE_API_PORT = '8080';
const LIVE_CONFIRM_TOKEN = 'YES-LIVE-OFFICE-ACCEPTANCE-AK2-AK1A';
const GO_REF_RE = /^OWNER-GO-OFFICE-AK-\d{8}-R\d{2}$/;

class EnvironmentGateError extends Error {
  constructor(m) { super(m); this.name = 'EnvironmentGateError'; this.gate = 'G-0'; }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new EnvironmentGateError(`${name} tanimli degil — fail-closed durur`);
  return v;
}

/**
 * G-0 — HERHANGI BIR YAZMADAN ONCE. Donen nesnede SIR YOK (host/port/ad).
 */
function assertRunEnvironment() {
  const environment = (process.env.AK_ENVIRONMENT || 'live').toLowerCase();
  const cfg = ENVIRONMENTS[environment];
  if (!cfg) throw new EnvironmentGateError(`G-0: gecersiz AK_ENVIRONMENT='${environment}' (disposable|live)`);

  let goRef = null;
  if (environment === 'live') {
    if (process.env.AK_CONFIRM_LIVE !== LIVE_CONFIRM_TOKEN) {
      throw new EnvironmentGateError("G-0: ortam 'live' ve AK_CONFIRM_LIVE jetonu YOK/yanlis — canliya yazma baslamaz");
    }
    goRef = process.env.AK_OWNER_GO_REF || '';
    if (!GO_REF_RE.test(goRef)) {
      throw new EnvironmentGateError(`G-0: AK_OWNER_GO_REF bicimi gecersiz ('${goRef}'; beklenen OWNER-GO-OFFICE-AK-YYYYMMDD-Rnn)`);
    }
  }

  let u;
  try { u = new URL(requireEnv('AK_DATABASE_URL')); } catch (e) {
    if (e instanceof EnvironmentGateError) throw e;
    throw new EnvironmentGateError('G-0: AK_DATABASE_URL cozumlenemedi — ortam BELIRSIZ');
  }
  const dbHost = u.hostname;
  const dbPort = u.port || '5432';
  const dbName = decodeURIComponent((u.pathname || '').replace(/^\//, ''));
  if (!LOOPBACK.has(dbHost)) throw new EnvironmentGateError(`G-0: DB host '${dbHost}' loopback degil`);
  if (!cfg.dbPorts.has(dbPort)) throw new EnvironmentGateError(`G-0: DB port '${dbPort}' '${environment}' allowlist'inde yok`);
  if (!cfg.dbNames.has(dbName)) throw new EnvironmentGateError(`G-0: DB adi '${dbName}' '${environment}' allowlist'inde yok`);

  let a;
  try { a = new URL(requireEnv('AK_API_BASE_URL')); } catch (e) {
    if (e instanceof EnvironmentGateError) throw e;
    throw new EnvironmentGateError('G-0: AK_API_BASE_URL cozumlenemedi');
  }
  const apiPort = a.port || '80';
  if (!LOOPBACK.has(a.hostname)) throw new EnvironmentGateError(`G-0: API host '${a.hostname}' loopback degil`);
  if (environment === 'disposable' && apiPort === LIVE_API_PORT) {
    throw new EnvironmentGateError('G-0: disposable DB ile CANLI API portu (8080) hedeflenemez');
  }
  if (environment === 'live' && apiPort !== LIVE_API_PORT) {
    throw new EnvironmentGateError(`G-0: canli DB ile canli olmayan API portu (${apiPort}) hedeflenemez`);
  }
  return { environment, dbHost, dbPort, dbName, apiHost: a.hostname, apiPort, goRef };
}

function apiBase() { return requireEnv('AK_API_BASE_URL').replace(/\/+$/, ''); }

function loadPrisma() {
  const { PrismaClient } = require(requireEnv('AK_PRISMA_ROOT'));
  return new PrismaClient({ datasources: { db: { url: requireEnv('AK_DATABASE_URL') } }, log: [] });
}
function loadBcrypt() { return require(requireEnv('AK_BCRYPT_PATH')); }

/** G-1 */
function assertOwnSlug(slug) {
  if (!slug || !slug.startsWith(TENANT_PREFIX)) {
    throw new Error(`G-1 IHLALI: '${slug}' bu pakete ait degil (beklenen onek '${TENANT_PREFIX}')`);
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

function slugFor(runId) {
  if (!/^[0-9a-f]{8}$/.test(String(runId || ''))) throw new Error(`gecersiz runId '${runId}' (8 hex)`);
  return `${TENANT_PREFIX}${runId}`;
}

// ── durum / sonuc dosyalari (repo DISI; sir YOK) ────────────────────────────────
function writeJsonNoSecrets(file, obj) {
  OW.assertNoSecrets(obj);
  fs.writeFileSync(file, JSON.stringify(obj, null, 1) + '\n', 'utf8');
}
function stateFile() { return process.env.AK_STATE_FILE || path.join(process.cwd(), 'ak-state.json'); }
function resultFile() { return process.env.AK_RESULT_FILE || path.join(process.cwd(), 'ak-result.json'); }
function saveState(s) { writeJsonNoSecrets(stateFile(), s); }

// ── olcum: tenant kapsamli anlik goruntu ────────────────────────────────────────
function stable(v) {
  if (v === null || typeof v !== 'object') return v instanceof Date ? v.toISOString() : v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(stable);
  const o = {};
  for (const k of Object.keys(v).sort()) o[k] = stable(v[k]);
  return o;
}
function digest(v) { return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex'); }

/**
 * Tenant'in kabul yuzeyindeki TUM satirlari (tum skalar alanlar, updatedAt dahil). Iki goruntunun
 * esitligi "bu aralikta bu tenant'ta YAZMA YOK" iddiasinin olcumudur. Olculemezse THROW
 * (cagiran OLCULEMEDI yazar; "degismedi" SAYILMAZ).
 */
async function snapshotTenant(prisma, tenantId) {
  const byId = { orderBy: { id: 'asc' } };
  const s = {
    lawyer: await prisma.lawyer.findMany({ where: { tenantId }, ...byId }),
    user: await prisma.user.findMany({ where: { tenantId }, ...byId }),
    office: await prisma.office.findMany({ where: { tenantId }, ...byId }),
    staffMember: await prisma.staffMember.findMany({ where: { tenantId }, ...byId }),
    // OfficeBankAccount tenantId TASIMAZ; tenant'a Office uzerinden baglidir (sema olculdu, prova A-1).
    officeBankAccount: await prisma.officeBankAccount.findMany({ where: { office: { tenantId } }, ...byId }),
    auditLog: await prisma.auditLog.findMany({ where: { tenantId }, ...byId, select: { id: true, action: true, entityId: true, userId: true } }),
    case: await prisma.case.findMany({ where: { tenantId }, ...byId, select: { id: true, status: true } }),
    client: await prisma.client.findMany({ where: { tenantId }, ...byId, select: { id: true } }),
  };
  if (s.lawyer.length === 0 || s.user.length === 0 || s.office.length === 0) {
    // Gozlem kumesi BOS olamaz: kurulum bu uc tabloya satir yazar (A-02 §10.1 dersi).
    throw new OW.ObservationError('anlik goruntu gozlem kumesi BOS (lawyer/user/office) — olcum anlamsiz');
  }
  const counts = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length]));
  return { digest: digest(s), counts, rows: s };
}
/** Iki goruntu arasindaki farkin insan-okunur ozeti (hangi tablo, hangi id). */
function diffSnapshots(a, b) {
  const out = [];
  for (const k of Object.keys(a.rows)) {
    const A = new Map(a.rows[k].map((r) => [r.id, digest(r)]));
    const B = new Map(b.rows[k].map((r) => [r.id, digest(r)]));
    for (const id of B.keys()) if (!A.has(id)) out.push(`${k}+${id}`);
    for (const id of A.keys()) if (!B.has(id)) out.push(`${k}-${id}`);
    for (const [id, d] of A) if (B.has(id) && B.get(id) !== d) out.push(`${k}~${id}`);
  }
  return out;
}

/**
 * YABANCI TENANT SAYI OZETI (I-3). Bu kosumun kendi alanlari (`ownSlugs`) HARIC her tenant icin kabul
 * yuzeyindeki tablolarin tenant bazli SATIR SAYISI; icerik OKUNMAZ (yalniz groupBy count). Ilk API
 * cagrisindan once ve kapanistan sonra esitligi, "baska tenant'ta satir eklenmedi/silinmedi/tasinmadi" iddiasinin
 * sayi duzeyindeki olcumudur. AuditLog DAHIL DEGIL (canlida gercek trafik surekli yazar; aktorlerimizin
 * yabanci audit izi I-1 ile ayrica olculur). Sinir: sayilar guncellemeyi gormez. Canlida eszamanli
 * gercek trafik fark uretirse I-3 PASS VERMEZ (fail-closed; sessiz PASS yok).
 */
async function foreignFingerprint(prisma, ownSlugs) {
  const own = await prisma.tenant.findMany({ where: { slug: { in: ownSlugs } }, select: { id: true } });
  const ex = own.map((t) => t.id);
  const notOwn = { tenantId: { notIn: ex } };
  const per = {};
  const totals = {};
  for (const m of ['user', 'lawyer', 'office', 'staffMember', 'case', 'client']) {
    const g = await prisma[m].groupBy({ by: ['tenantId'], where: notOwn, _count: { _all: true } });
    per[m] = g.map((r) => `${r.tenantId}:${r._count._all}`).sort();
    totals[m] = g.reduce((s, r) => s + r._count._all, 0);
  }
  // OfficeBankAccount tenantId TASIMAZ: yabanci Office uzerinden, officeId bazli
  const b = await prisma.officeBankAccount.groupBy({ by: ['officeId'], where: { office: notOwn }, _count: { _all: true } });
  per.officeBankAccount = b.map((r) => `${r.officeId}:${r._count._all}`).sort();
  totals.officeBankAccount = b.reduce((s, r) => s + r._count._all, 0);
  const tenants = await prisma.tenant.count({ where: { id: { notIn: ex } } });
  return { digest: digest({ tenants, per }), tenants, totals, excludedOwn: ex.length };
}

// ── karar fonksiyonlari (TEK KAYNAK; negatif kontroller de bunlari tuketir) ──────
function errorCode(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.code === 'string') return body.code;
  if (body.message && typeof body.message === 'object' && typeof body.message.code === 'string') return body.message.code;
  if (body.response && typeof body.response === 'object' && typeof body.response.code === 'string') return body.response.code;
  return null;
}
function errorText(body) {
  if (!body || typeof body !== 'object') return '';
  const m = body.message;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object' && typeof m.message === 'string') return m.message;
  if (Array.isArray(m)) return m.join(' | ');
  return typeof body.error === 'string' ? body.error : '';
}
/**
 * Kesin ret: YALNIZ 403 ve (verilmisse) birebir kod VE/VEYA metin parcasi. 401/400/404/500, belirsiz
 * HTTP veya farkli kod RET SAYILMAZ (yetki reddi yalniz kendi kapisinin 403'u ile kanitlanir).
 */
function isExactReject(res, { code, textIncludes, notCode } = {}) {
  if (!res || res.indeterminate || res.status !== 403) return false;
  const c = errorCode(res.body);
  if (code && c !== code) return false;
  if (notCode && c === notCode) return false;
  if (textIncludes && !errorText(res.body).includes(textIncludes)) return false;
  return true;
}
function isSuccess(res, statuses = [200, 201]) {
  return !!res && !res.indeterminate && statuses.includes(res.status);
}
function describe(res) {
  if (!res) return 'yanit yok';
  if (res.indeterminate) return `BELIRSIZ — ${res.indeterminateReason}`;
  const c = errorCode(res.body);
  const t = errorText(res.body);
  return `HTTP ${res.status}${c ? ` code=${c}` : ''}${t ? ` msg="${t.slice(0, 110)}"` : ''}`;
}

module.exports = {
  TENANT_PREFIX, FORBIDDEN_SLUGS, FORBIDDEN_PREFIXES, LIVE_CONFIRM_TOKEN, GO_REF_RE, LIVE_API_PORT,
  EnvironmentGateError, ObservationError: OW.ObservationError,
  requireEnv, assertRunEnvironment, apiBase, loadPrisma, loadBcrypt,
  assertOwnSlug, assertOwnTenant, slugFor,
  writeJsonNoSecrets, stateFile, resultFile, saveState,
  snapshotTenant, diffSnapshots, digest, foreignFingerprint,
  errorCode, errorText, isExactReject, isSuccess, describe,
  // ow-lib'den yeniden kullanilanlar (kopya DEGIL)
  httpJson: OW.httpJson, login: OW.login, makeRecorder: OW.makeRecorder, assertNoSecrets: OW.assertNoSecrets,
  log: OW.log, step: OW.step, newRunId: OW.newRunId,
};
