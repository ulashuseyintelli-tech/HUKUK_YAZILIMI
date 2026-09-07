/*
 * F04 CANLI KABUL PAKETI — ORTAK KATMAN
 *
 * Bu paket F04 posting/reversal serilestirmesinin CANLI kabulunu yurutur.
 * Kod, sema veya servis DEGISTIRILMEZ; canli API'ye prototype/bariyer enjeksiyonu YAPILMAZ;
 * yeniden deployment YAPILMAZ. Yalniz kendi urettigi sentetik tenant'a yazar.
 *
 * ZORUNLU ORTAM DEGISKENLERI
 *   F04_DATABASE_URL   hedef PostgreSQL (canli kosumda canli DB, provada disposable DB)
 *   F04_API_BASE_URL   hedef API kokU (orn. http://127.0.0.1:8080)
 *
 * ISTEGE BAGLI
 *   F04_TENANT_SLUG    kurulumun urettigi slug (varsayilan: f04-acc-<8hex>)
 *   F04_LOCK_HOLD_MS   kilidin azami tutulma suresi (varsayilan 8000, tavan 30000)
 *   F04_STATE_FILE     adimlar arasi durum dosyasi (varsayilan ./f04-state.json)
 *
 * GUVENLIK KAPILARI (hepsi FAIL-CLOSED):
 *   G-1 Hedef tenant slug'i `f04-acc-` ile BASLAMALIDIR.
 *   G-2 Yazma yapan her adim, dokunulan her satirin tenantId'sini bu tenant ile karsilastirir.
 *   G-3 Kurulum, slug'i mevcut tenant'lardan HERHANGI BIRI ile cakisirsa DURUR.
 *   G-4 Kilit yalniz TEK bir Collection satirinda ve yalniz bu tenant'ta alinir.
 *   G-5 Kilit suresi asilirsa transaction ROLLBACK ile kapanir (kilit BIRAKILIR).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TENANT_PREFIX = 'f04-acc-';
// Baska programlarin olcum alanlari — bu paket bunlara ASLA yazmaz.
const FORBIDDEN_SLUGS = new Set([
  'telli-hukuk', 'demo-firma', 'local-development-office',
  'c36-smoke-principal', 'c36-smoke-principal-2',
]);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} tanimli degil — paket fail-closed durur`);
  return v;
}

function loadPrisma() {
  // Prisma client'i hedef surumun node_modules'undan yukle (F04_PRISMA_ROOT ile degistirilebilir).
  const root = process.env.F04_PRISMA_ROOT
    || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/node_modules/@prisma/client';
  const { PrismaClient } = require(root);
  return new PrismaClient({ datasources: { db: { url: requireEnv('F04_DATABASE_URL') } }, log: [] });
}

const STATE_FILE = () => process.env.F04_STATE_FILE || path.join(process.cwd(), 'f04-state.json');

function saveState(s) {
  fs.writeFileSync(STATE_FILE(), JSON.stringify(s, null, 1), 'utf8');
}
function loadState() {
  const p = STATE_FILE();
  if (!fs.existsSync(p)) throw new Error(`durum dosyasi yok: ${p} — once 01-setup calistirilmalidir`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** G-1: slug bu pakete ait mi? */
function assertOwnSlug(slug) {
  if (!slug || !slug.startsWith(TENANT_PREFIX)) {
    throw new Error(`G-1 IHLALI: '${slug}' bu pakete ait degil (beklenen prefix '${TENANT_PREFIX}')`);
  }
  if (FORBIDDEN_SLUGS.has(slug)) {
    throw new Error(`G-1 IHLALI: '${slug}' baska bir programin tenant'i`);
  }
}

/** G-2: verilen tenantId gercekten bu paketin urettigi tenant mi? */
async function assertOwnTenant(prisma, tenantId) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!t) throw new Error(`G-2 IHLALI: tenant bulunamadi (${tenantId})`);
  assertOwnSlug(t.slug);
  return t.slug;
}

function newSuffix() { return crypto.randomUUID().slice(0, 8); }

async function backendPid(tx) {
  const r = await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid');
  return Number(r[0].pid);
}

/** Verilen backend PID'i BEKLETEN pid listesi. */
async function blockingPids(prisma, pid) {
  const r = await prisma.$queryRawUnsafe('SELECT pg_blocking_pids($1) AS pids', pid);
  return (r[0].pids || []).map(Number);
}

/** `pid`, `holderPid` tarafindan bloke edilene kadar bekle (azami timeoutMs). */
async function waitUntilBlockedBy(prisma, pid, holderPid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = await blockingPids(prisma, pid);
    if (last.includes(holderPid)) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`pid ${pid}, ${holderPid} tarafindan BEKLETILMEDI (son gozlem: [${last.join(',')}])`);
}

/**
 * `holderPid`in BEKLETTIGI pid'ler. A2'de kilidi biz tuttugumuz icin yon budur:
 * "posting'in transaction'i bizim kilidimizde mi bekliyor?" sorusuna PostgreSQL'in kendi
 * `pg_blocking_pids` gorusuyle cevap verir.
 */
async function pidsBlockedBy(prisma, holderPid) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT pid, left(query, 300) AS "querySnippet", wait_event_type AS "waitEventType", wait_event AS "waitEvent"
       FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> $1 AND $1 = ANY(pg_blocking_pids(pid))`,
    holderPid,
  );
  return r.map((x) => ({ ...x, pid: Number(x.pid) }));
}

/** `holderPid` en az bir transaction'i bloke edene kadar bekle. */
async function waitUntilSomeoneBlockedBy(prisma, holderPid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await pidsBlockedBy(prisma, holderPid);
    if (rows.length > 0) return rows;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`kilit sahibi pid ${holderPid} ${timeoutMs} ms icinde HICBIR transaction'i bloke etmedi`);
}

/** Su an calisan sorgulardan, verilen tenant'a ait bekleyenleri bul (gozlem amacli). */
async function activeWaiters(prisma) {
  return prisma.$queryRawUnsafe(
    `SELECT pid, state, wait_event_type AS "waitEventType", wait_event AS "waitEvent",
            left(query, 60) AS "querySnippet"
       FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'`,
  );
}

async function httpJson(method, url, { token, body, timeoutMs = 60000 } = {}) {
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
    return { status: res.status, body: parsed, elapsedMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}

function log(...a) { console.log(...a); }
function step(id, msg) { console.log(`\n[${id}] ${msg}`); }

module.exports = {
  TENANT_PREFIX, FORBIDDEN_SLUGS,
  requireEnv, loadPrisma, saveState, loadState, assertOwnSlug, assertOwnTenant,
  newSuffix, backendPid, blockingPids, waitUntilBlockedBy, pidsBlockedBy, waitUntilSomeoneBlockedBy,
  activeWaiters, httpJson, log, step,
};
