/*
 * OFFICE C1 / C2 / C3 HEDEFLI KABUL — ORTAK KATMAN
 *
 * NE: `OFFICE-LIVE-ACCEPTANCE-C123-R01.md` sozlesmesinin calistirilabilir karsiligi.
 * NE DEGIL: canli kabul yetkisi. Canli kosum yalniz owner'in AYRI GO'su ile yapilir (belge §1).
 *   Disposable prova canli PASS SAYILMAZ.
 *
 * YENIDEN KULLANIM: HTTP, login (+ hiz siniri butcesi), sonuc toplayici ve sir kapisi
 * `office-delivery-r01/scripts/ow-lib.js`'den ALINIR, KOPYALANMAZ (AK paketiyle ayni desen).
 * Bu dosya yalniz C123'e ozgu kimligi tasir: kendi tenant oneki, ortam allowlist'i, canli jetonu,
 * GO referansi ve DMMF tabanli tenant yazma olcumu.
 *
 * ORTAM DEGISKENLERI
 *   C123_ENVIRONMENT   disposable | live   (VERILMEZSE `live` — fail-safe, en kisitli dal)
 *   C123_DATABASE_URL  hedef PostgreSQL (loopback + ortama gore port/ad allowlist'i)
 *   C123_API_BASE_URL  API koku, `/api` dahil (disposable'da 8080 YASAK; canlida YALNIZ 8080)
 *   C123_PRISMA_ROOT   `@prisma/client` dizini (ZORUNLU; hedef dist'in kokununku)
 *   C123_BCRYPT_PATH   `bcrypt` paket dizini (ZORUNLU)
 *   C123_DIST_ROOT     hedef API dist `src` dizini (artefakt bagi kontrolu icin ZORUNLU)
 *   C123_CONFIRM_LIVE  canli jeton (yalniz live)
 *   C123_OWNER_GO_REF  OWNER-GO-OFFICE-C123-YYYYMMDD-Rnn (yalniz live; bicim ZORUNLU)
 *   C123_STATE_FILE / C123_RESULT_FILE   repo DISI yollar (sir icermez)
 *
 * GUVENLIK KAPILARI (FAIL-CLOSED, ilk yazmadan ONCE)
 *   G-0  ortam izolasyonu + canli jeton + GO referansi + API/DB ortam caprazlama kilidi
 *   G-1  tenant slug'i `off-c123-` ile baslar; gercek ve baska kabul hatlarinin onekleri YASAK
 *   G-2  yazan her adim dokundugu tenant'i dogrular
 *   G-3  slug cakismasi -> DUR
 *   G-4  sir (parola/token) durum/sonuc dosyasina ve ciktiya YAZILMAZ (ow-lib assertNoSecrets)
 *   G-5  DIS ETKI YASAGI: FD `publish` / `retry-publication` / `reverse` / `supersede` uclari bu
 *        paketin HTTP katmanindan CAGRILAMAZ (musteriye gonderim tek bu uclarda; belge §6)
 *   G-6  ARTEFAKT BAGI: hedef dist'teki ayirt edici dosyalarin sha256'si belgedeki pinle esit olmali
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OW = require('../../office-delivery-r01/scripts/ow-lib');

const TENANT_PREFIX = 'off-c123-';
const FORBIDDEN_SLUGS = OW.FORBIDDEN_SLUGS; // telli-hukuk, demo-firma, local-development-office, c36-smoke-*
/** Diger kabul hatlarinin alanlari: C123 bunlara ASLA dokunmaz. */
const FORBIDDEN_PREFIXES = ['off-acc-', 'off-ak-', 'cl-acc-', 'f04-acc-', 'ah-'];

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const ENVIRONMENTS = {
  disposable: { dbPorts: new Set(['5456']), dbNames: new Set(['hukuk_office_c123_acc_test']) },
  live: { dbPorts: new Set(['5432']), dbNames: new Set(['hukuk_db']) },
};
const LIVE_API_PORT = '8080';
const LIVE_CONFIRM_TOKEN = 'YES-LIVE-OFFICE-ACCEPTANCE-C123';
const GO_REF_RE = /^OWNER-GO-OFFICE-C123-\d{8}-R\d{2}$/;

/** G-5: musteriye gonderim uretebilen uclar. Bu paketten HIC cagrilmaz. */
const FORBIDDEN_ROUTE_RE = /\/(publish|retry-publication|reverse|supersede)(\/|\?|$)/;

/**
 * G-6: artefakt bagi. Anahtar = dist `src` altindaki goreli yol; deger = beklenen sha256 (BUYUK harf).
 * Degerler provada canli R25B dist'inden (C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23) OLCULDU ve
 * belgeye (§3) yazildi. `marker` dosyada aranan, degisikligi ayirt eden metindir.
 */
const DIST_PINS = require('./c-dist-pins.json');

class EnvironmentGateError extends Error {
  constructor(m) { super(m); this.name = 'EnvironmentGateError'; this.gate = 'G-0'; }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new EnvironmentGateError(`${name} tanimli degil — fail-closed durur`);
  return v;
}

/** G-0 — HERHANGI BIR YAZMADAN ONCE. Donen nesnede SIR YOK. */
function assertRunEnvironment() {
  const environment = (process.env.C123_ENVIRONMENT || 'live').toLowerCase();
  const cfg = ENVIRONMENTS[environment];
  if (!cfg) throw new EnvironmentGateError(`G-0: gecersiz C123_ENVIRONMENT='${environment}' (disposable|live)`);

  let goRef = null;
  if (environment === 'live') {
    if (process.env.C123_CONFIRM_LIVE !== LIVE_CONFIRM_TOKEN) {
      throw new EnvironmentGateError("G-0: ortam 'live' ve C123_CONFIRM_LIVE jetonu YOK/yanlis — canliya yazma baslamaz");
    }
    goRef = process.env.C123_OWNER_GO_REF || '';
    if (!GO_REF_RE.test(goRef)) {
      throw new EnvironmentGateError(`G-0: C123_OWNER_GO_REF bicimi gecersiz ('${goRef}'; beklenen OWNER-GO-OFFICE-C123-YYYYMMDD-Rnn)`);
    }
  }

  let u;
  try { u = new URL(requireEnv('C123_DATABASE_URL')); } catch (e) {
    if (e instanceof EnvironmentGateError) throw e;
    throw new EnvironmentGateError('G-0: C123_DATABASE_URL cozumlenemedi — ortam BELIRSIZ');
  }
  const dbHost = u.hostname;
  const dbPort = u.port || '5432';
  const dbName = decodeURIComponent((u.pathname || '').replace(/^\//, ''));
  if (!LOOPBACK.has(dbHost)) throw new EnvironmentGateError(`G-0: DB host '${dbHost}' loopback degil`);
  if (!cfg.dbPorts.has(dbPort)) throw new EnvironmentGateError(`G-0: DB port '${dbPort}' '${environment}' allowlist'inde yok`);
  if (!cfg.dbNames.has(dbName)) throw new EnvironmentGateError(`G-0: DB adi '${dbName}' '${environment}' allowlist'inde yok`);

  let a;
  try { a = new URL(requireEnv('C123_API_BASE_URL')); } catch (e) {
    if (e instanceof EnvironmentGateError) throw e;
    throw new EnvironmentGateError('G-0: C123_API_BASE_URL cozumlenemedi');
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

/** G-6 — hedef dist'teki ayirt edici dosyalar pinle BIREBIR ayni ve isaret metni mevcut olmali. */
function assertDistBinding() {
  const root = requireEnv('C123_DIST_ROOT');
  const out = { root, files: {}, ok: true };
  for (const [rel, pin] of Object.entries(DIST_PINS.files)) {
    const f = path.join(root, rel);
    let buf;
    try { buf = fs.readFileSync(f); } catch (e) {
      out.ok = false; out.files[rel] = { error: `okunamadi: ${e.code || e.message}` }; continue;
    }
    const sha = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    const markerPresent = buf.toString('utf8').includes(pin.marker);
    const match = sha === pin.sha256 && markerPresent;
    if (!match) out.ok = false;
    out.files[rel] = { sha256: sha, expected: pin.sha256, markerPresent, match };
  }
  if (!out.ok) {
    const e = new EnvironmentGateError(`G-6: hedef dist artefakt bagi TUTMADI — ${JSON.stringify(out.files)}`);
    e.gate = 'G-6'; e.detail = out; throw e;
  }
  return out;
}

function apiBase() { return requireEnv('C123_API_BASE_URL').replace(/\/+$/, ''); }
function loadPrismaModule() { return require(requireEnv('C123_PRISMA_ROOT')); }
function loadPrisma() {
  const { PrismaClient } = loadPrismaModule();
  return new PrismaClient({ datasources: { db: { url: requireEnv('C123_DATABASE_URL') } }, log: [] });
}
function loadBcrypt() { return require(requireEnv('C123_BCRYPT_PATH')); }

/** G-5 korumali HTTP: yasakli dis-etki uclari istek YAPILMADAN reddedilir. */
async function httpJson(method, url, opts) {
  if (FORBIDDEN_ROUTE_RE.test(url)) throw new Error(`G-5 IHLALI: dis etkili uc cagrilamaz (${method} ${url})`);
  return OW.httpJson(method, url, opts);
}

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
function stateFile() { return process.env.C123_STATE_FILE || path.join(process.cwd(), 'c123-state.json'); }
function resultFile() { return process.env.C123_RESULT_FILE || path.join(process.cwd(), 'c123-result.json'); }
function saveState(s) { writeJsonNoSecrets(stateFile(), s); }

// ── olcum: DMMF tabanli TENANT KAPSAMLI anlik goruntu ──────────────────────────
function stable(v) {
  if (v === null || typeof v !== 'object') return typeof v === 'bigint' ? v.toString() : v;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString('hex');
  if (Array.isArray(v)) return v.map(stable);
  if (typeof v.toFixed === 'function' && typeof v.toString === 'function' && v.constructor && v.constructor.name === 'Decimal') return v.toString();
  const o = {};
  for (const k of Object.keys(v).sort()) o[k] = stable(v[k]);
  return o;
}
function digest(v) { return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex'); }

const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Kapsam PLANI (bir kez kurulur): semadaki her modelden
 *   (a) skaler `tenantId` alani olanlar  -> `where: { tenantId }`
 *   (b) tenantId'siz ama (a)'daki bir modele TEK alanli FK ile baglananlar -> `where: { <fk>: { in: parentIds } }`
 * Boylece "iş / audit / FD / dava / taraf" kayitlarinin TAMAMI tek olcumde gorulur; tablo listesi elle
 * secilmez (yeni tablo sessizce kacmaz). Kapsam disi kalanlar (tenant'a iki adimdan uzak) plana
 * `unscoped` olarak yazilir — iddia bu kapsamla SINIRLIDIR.
 */
function scopePlan(prismaModule) {
  const dmmf = prismaModule.Prisma && prismaModule.Prisma.dmmf;
  if (!dmmf || !dmmf.datamodel) throw new OW.ObservationError('Prisma DMMF okunamadi — olcum plani kurulamaz');
  const models = dmmf.datamodel.models;
  const byName = new Map(models.map((m) => [m.name, m]));
  const direct = [];
  const child = [];
  const unscoped = [];
  for (const m of models) {
    const hasTenant = m.fields.some((f) => f.name === 'tenantId' && f.kind === 'scalar');
    if (hasTenant) { direct.push({ model: lcFirst(m.name), name: m.name }); continue; }
    const rel = m.fields.find((f) => f.kind === 'object' && f.relationFromFields && f.relationFromFields.length === 1
      && byName.get(f.type) && byName.get(f.type).fields.some((x) => x.name === 'tenantId' && x.kind === 'scalar'));
    if (rel) child.push({ model: lcFirst(m.name), name: m.name, fk: rel.relationFromFields[0], parent: lcFirst(rel.type), parentKey: (rel.relationToFields && rel.relationToFields[0]) || 'id' });
    else unscoped.push(m.name);
  }
  return { direct, child, unscoped };
}

async function snapshotTenant(prisma, plan, tenantId) {
  const rows = {};
  const parentKeys = {};
  for (const d of plan.direct) {
    const r = await prisma[d.model].findMany({ where: { tenantId } });
    rows[d.name] = r;
  }
  for (const c of plan.child) {
    const parentRows = rows[plan.direct.find((d) => d.model === c.parent).name] || [];
    const keys = parentRows.map((p) => p[c.parentKey]).filter((x) => x !== null && x !== undefined);
    parentKeys[c.name] = keys.length;
    rows[c.name] = keys.length ? await prisma[c.model].findMany({ where: { [c.fk]: { in: keys } } }) : [];
  }
  const keyOf = (r) => (r.id !== undefined ? String(r.id) : digest(r));
  const map = {};
  for (const [k, list] of Object.entries(rows)) {
    const m = new Map();
    for (const r of list) m.set(keyOf(r), digest(r));
    map[k] = m;
  }
  const counts = Object.fromEntries(Object.entries(rows).filter(([, v]) => v.length).map(([k, v]) => [k, v.length]));
  if (!counts.Tenant && !counts.User) {
    // Gozlem kumesi BOS olamaz: kurulum User/Office yazar (A-02 §10.1 dersi).
  }
  if (!counts.User || !counts.Office) throw new OW.ObservationError('anlik goruntu gozlem kumesi BOS (User/Office) — olcum anlamsiz');
  return { map, counts, digest: digest(Object.fromEntries(Object.entries(map).map(([k, m]) => [k, [...m.entries()].sort()]))) };
}

/** `Model+id` (eklendi) · `Model-id` (silindi) · `Model~id` (degisti) */
function diffSnapshots(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a.map), ...Object.keys(b.map)])) {
    const A = a.map[k] || new Map();
    const B = b.map[k] || new Map();
    for (const id of B.keys()) if (!A.has(id)) out.push(`${k}+${id}`);
    for (const id of A.keys()) if (!B.has(id)) out.push(`${k}-${id}`);
    for (const [id, d] of A) if (B.has(id) && B.get(id) !== d) out.push(`${k}~${id}`);
  }
  return out;
}
function diffShape(diff) {
  const c = {};
  for (const s of diff) { const m = /^(\w+)([+~-])/.exec(s); const k = `${m[1]}${m[2]}`; c[k] = (c[k] || 0) + 1; }
  return Object.keys(c).sort().map((k) => `${k}${c[k] > 1 ? `x${c[k]}` : ''}`).join(',');
}

/**
 * YABANCI TENANT SAYI OZETI (I-3; AK ile ayni yontem): kendi alanlar HARIC tenant bazli satir sayilari.
 * AuditLog DAHIL DEGIL (canlida gercek trafik yazar). Sinir: sayilar guncellemeyi gormez.
 */
async function foreignFingerprint(prisma, ownSlugs) {
  const own = await prisma.tenant.findMany({ where: { slug: { in: ownSlugs } }, select: { id: true } });
  const ex = own.map((t) => t.id);
  const notOwn = { tenantId: { notIn: ex } };
  const per = {}; const totals = {};
  for (const m of ['user', 'lawyer', 'office', 'case', 'client', 'debtor', 'officeApprovalRequest', 'collectionDisposition', 'clientFinancialDisclosure']) {
    const g = await prisma[m].groupBy({ by: ['tenantId'], where: notOwn, _count: { _all: true } });
    per[m] = g.map((r) => `${r.tenantId}:${r._count._all}`).sort();
    totals[m] = g.reduce((s, r) => s + r._count._all, 0);
  }
  const tenants = await prisma.tenant.count({ where: { id: { notIn: ex } } });
  return { digest: digest({ tenants, per }), tenants, totals, excludedOwn: ex.length };
}

// ── karar fonksiyonlari (TEK KAYNAK) ─────────────────────────────────────────────
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
/** Kesin ret: YALNIZ beklenen HTTP durumu ve (verilmisse) birebir kod / metin parcasi. */
function isExactReject(res, { status = 403, code, textIncludes } = {}) {
  if (!res || res.indeterminate || res.status !== status) return false;
  if (code && errorCode(res.body) !== code) return false;
  if (textIncludes && !errorText(res.body).includes(textIncludes)) return false;
  return true;
}
function isSuccess(res, statuses = [200, 201]) { return !!res && !res.indeterminate && statuses.includes(res.status); }
function describe(res) {
  if (!res) return 'yanit yok';
  if (res.indeterminate) return `BELIRSIZ — ${res.indeterminateReason}`;
  const c = errorCode(res.body); const t = errorText(res.body);
  return `HTTP ${res.status}${c ? ` code=${c}` : ''}${t ? ` msg="${t.slice(0, 110)}"` : ''}`;
}

module.exports = {
  TENANT_PREFIX, FORBIDDEN_PREFIXES, LIVE_CONFIRM_TOKEN, GO_REF_RE, LIVE_API_PORT, FORBIDDEN_ROUTE_RE, DIST_PINS,
  EnvironmentGateError, ObservationError: OW.ObservationError,
  requireEnv, assertRunEnvironment, assertDistBinding, apiBase, loadPrismaModule, loadPrisma, loadBcrypt,
  assertOwnSlug, assertOwnTenant, slugFor,
  writeJsonNoSecrets, stateFile, resultFile, saveState,
  scopePlan, snapshotTenant, diffSnapshots, diffShape, digest, foreignFingerprint,
  errorCode, errorText, isExactReject, isSuccess, describe,
  httpJson, login: OW.login, makeRecorder: OW.makeRecorder, assertNoSecrets: OW.assertNoSecrets,
  log: OW.log, step: OW.step, newRunId: OW.newRunId,
};
