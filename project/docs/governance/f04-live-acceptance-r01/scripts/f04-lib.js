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
 *   F04_LOCK_BUDGET_MS ORTAK kilit butcesi: gozlem + tutma (varsayilan 3500, tavan 4000)
 *   F04_LOGIN_PASSWORD sentetik hesabin parolasi (durum dosyasinda SAKLANMAZ)
 *   F04_RUN_ID         kosum kimligi (8 hex; slug'a gomulur, SIR ICERMEZ)
 *   F04_ENVIRONMENT    live | disposable — purge/reverse yalniz disposable'da
 *   F04_STATE_FILE     adimlar arasi durum dosyasi (varsayilan ./f04-state.json)
 *
 * GUVENLIK KAPILARI (hepsi FAIL-CLOSED):
 *   G-1 Hedef tenant slug'i `f04-acc-` ile BASLAMALIDIR.
 *   G-2 Yazma yapan her adim, dokunulan her satirin tenantId'sini bu tenant ile karsilastirir.
 *   G-3 Kurulum, slug'i mevcut tenant'lardan HERHANGI BIRI ile cakisirsa DURUR.
 *   G-4 Kilit yalniz TEK bir Collection satirinda ve yalniz bu tenant'ta alinir.
 *   G-5 ORTAK butce dolarsa transaction kapanir (kilit BIRAKILIR); tek bir gozlem
 *       sorgusu bile butceyi asamaz.
 *   G-6 Zorunlu bir olcum YAPILAMAZSA sonuc 'yok/temiz' SAYILMAZ (fail-closed).
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

function loadPrisma(role) {
  // Prisma client'i hedef surumun node_modules'undan yukle (F04_PRISMA_ROOT ile degistirilebilir).
  const root = process.env.F04_PRISMA_ROOT
    || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/node_modules/@prisma/client';
  const { PrismaClient } = require(root);
  // Gozlem baglantisi ayri bir URL ile kurulabilir; negatif kontrol bunu bilerek gecersiz
  // vererek "gozlem YAPILAMADI" yolunun dogru calistigini kanitlar.
  const url = (role === 'observer' && process.env.F04_OBSERVER_DATABASE_URL)
    || requireEnv('F04_DATABASE_URL');
  return new PrismaClient({ datasources: { db: { url } }, log: [] });
}

const STATE_FILE = () => process.env.F04_STATE_FILE || path.join(process.cwd(), 'f04-state.json');

function saveState(s) {
  fs.writeFileSync(STATE_FILE(), JSON.stringify(s, null, 1), 'utf8');
}
function loadState() {
  const p = STATE_FILE();
  if (!fs.existsSync(p)) {
    throw new Error([
      `durum dosyasi yok: ${p}`,
      '  Kurulum COMMIT edildikten sonra dosya yazilamamis olabilir. Kurtarma:',
      '  F04_RUN_ID=<kosum kimligi> node f04-00-recover-state.js',
      "  (kosum kimligi tenant slug'inin son parcasidir: f04-acc-<runId>; SIR ICERMEZ)",
    ].join('\n'));
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Parola ASLA durum dosyasina yazilmaz. Adimlar onu `F04_LOGIN_PASSWORD` ortam
 * degiskeninden alir; kurulum uretmisse degeri BIR KEZ stdout'a basar.
 */
function requireLoginPassword() {
  const v = process.env.F04_LOGIN_PASSWORD;
  if (!v) {
    throw new Error([
      'F04_LOGIN_PASSWORD tanimli degil — parola durum dosyasinda SAKLANMAZ.',
      '  01-setup ciktisinda bir kez basilan degeri ortam degiskeni olarak verin.',
    ].join('\n'));
  }
  return v;
}

/** Durum dosyasini CANLI DB'den yeniden insa et (yalniz kimlikler; sir YOK). */
async function recoverState(prisma, runId) {
  const slug = `${TENANT_PREFIX}${runId}`;
  assertOwnSlug(slug);
  const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (!tenant) throw new Error(`kurtarma basarisiz: '${slug}' tenant'i bulunamadi`);
  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id }, select: { id: true, email: true } });
  const client = await prisma.client.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  const kase = await prisma.case.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  const caseClient = kase
    ? await prisma.caseClient.findFirst({ where: { caseId: kase.id }, select: { id: true } })
    : null;
  const collection = await prisma.collection.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  const expenseRequest = await prisma.expenseRequest.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  const approval = await prisma.officeApprovalRequest.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  const disposition = await prisma.collectionDisposition.findFirst({
    where: { tenantId: tenant.id }, select: { id: true, lines: { select: { id: true } } },
  });
  return {
    package: 'F04-LIVE-ACCEPTANCE-R01', recovered: true, runId, slug,
    tenantId: tenant.id, userId: user && user.id, userEmail: user && user.email,
    clientId: client && client.id, caseId: kase && kase.id, caseClientId: caseClient && caseClient.id,
    collectionId: collection && collection.id, expenseRequestId: expenseRequest && expenseRequest.id,
    approvalRequestId: approval && approval.id, dispositionId: disposition && disposition.id,
    lineId: disposition && disposition.lines[0] && disposition.lines[0].id,
  };
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

/**
 * `holderPid` en az bir transaction'i bloke edene kadar bekle — ama YALNIZ ortak kilit
 * butcesi icinde. `deadlineAt`, kilidin ALINDIGI andan itibaren hesaplanan mutlak zamandir;
 * gozlem ile kilidin tutulma suresi AYRI butceler DEGILDIR. Butce dolarsa cagiran
 * transaction'i kapatir (kilit birakilir).
 *
 * Gozlem sorgusunun KENDISI hata verirse bu "bekleme yok" DEMEK DEGILDIR — hata yukari
 * firlatilir (fail-closed); cagiran bunu OLCULEMEDI olarak isaretler.
 */
async function waitUntilSomeoneBlockedBy(prisma, holderPid, deadlineAt) {
  let observeError = null;
  while (Date.now() < deadlineAt) {
    let rows;
    try {
      // TEK bir gozlem sorgusu bile butceyi ASMAMALIDIR: sorgu kalan sure ile yaristirilir.
      // (Provada gecersiz bir gozlem baglantisi ~2 s takildi; butce kucukse bu asim olurdu.)
      const remainingForQuery = deadlineAt - Date.now();
      rows = await Promise.race([
        pidsBlockedBy(prisma, holderPid),
        new Promise((_, rej) => setTimeout(
          () => rej(new BudgetExceededError('kilit butcesi gozlem sorgusu sirasinda doldu')),
          Math.max(1, remainingForQuery),
        )),
      ]);
    } catch (e) {
      if (e && e.budgetExceeded) throw e;
      observeError = e;
      throw new ObservationError(`kilit gozlemi YAPILAMADI (pg_blocking_pids hatasi): ${e && e.message}`);
    }
    if (rows.length > 0) return rows;
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(120, remaining)));
  }
  if (observeError) throw new ObservationError(`kilit gozlemi YAPILAMADI: ${observeError.message}`);
  throw new BudgetExceededError(
    `kilit butcesi doldu: pid ${holderPid} butce icinde HICBIR transaction'i bloke etmedi`,
  );
}

/** Zorunlu bir olcum YAPILAMADI (sonuc "yok" DEGIL, "bilinmiyor"). */
class ObservationError extends Error {
  constructor(m) { super(m); this.name = 'ObservationError'; this.observationFailed = true; }
}
/** Ortak kilit butcesi doldu. */
class BudgetExceededError extends Error {
  constructor(m) { super(m); this.name = 'BudgetExceededError'; this.budgetExceeded = true; }
}

/**
 * Kilit butcesi kilidin ALINDIGI andan itibaren gecerlidir ve kilit alindiktan SONRAKI
 * BUTUN islemleri kapsar. Her adimdan once/sonra cagrilir; asilmissa transaction hemen
 * sonlandirilir (kilit birakilir) ve sonuc PASS SAYILMAZ.
 */
function assertWithinBudget(deadlineAt, label) {
  const over = Date.now() - deadlineAt;
  if (over >= 0) {
    throw new BudgetExceededError(`kilit butcesi doldu (${label}; +${over} ms)`);
  }
  return deadlineAt - Date.now();
}

/**
 * Verilen backend pid'in OTURUM ve TRANSACTION durumu. Kilidin gercekten sonlandigini
 * DOLAYLI degil DOGRUDAN dogrulamak icin kullanilir.
 *   present=false            -> oturum kapandi (kilit yok)
 *   inTransaction=false      -> transaction bitti (kilit birakildi)
 *   inTransaction=true       -> HALA acik transaction (SIZINTI)
 */
async function sessionTxState(prisma, pid) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT state, (xact_start IS NOT NULL) AS "inXact", backend_type AS "backendType"
       FROM pg_stat_activity WHERE pid = $1`,
    pid,
  );
  if (r.length === 0) return { present: false, state: null, inTransaction: false };
  return { present: true, state: r[0].state, inTransaction: !!r[0].inXact };
}

/**
 * Kilidin sonlandigini DOGRUDAN dogrula. Olculemezse "sonlandi" SAYILMAZ:
 * ObservationError firlatir (fail-closed).
 */
async function assertLockReleased(prisma, holderPid) {
  let st;
  try {
    st = await sessionTxState(prisma, holderPid);
  } catch (e) {
    throw new ObservationError(`kilit sonlanmasi DOGRULANAMADI (pg_stat_activity): ${e && e.message}`);
  }
  let blocked;
  try {
    blocked = await pidsBlockedBy(prisma, holderPid);
  } catch (e) {
    throw new ObservationError(`kilit sonlanmasi DOGRULANAMADI (pg_blocking_pids): ${e && e.message}`);
  }
  return {
    released: !st.present || (!st.inTransaction && blocked.length === 0),
    session: st,
    stillBlocking: blocked.length,
  };
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

/**
 * HTTP cagrisi. **Istemci tarafi timeout/abort SUNUCU ISLEMINI IPTAL ETMEZ** — istek sunucuda
 * calismaya devam ediyor olabilir. Bu yuzden abort/ag hatasi bir BASARISIZLIK degil, sonucu
 * BELIRSIZ bir cagri olarak dondurulur (`indeterminate: true`) ve cagiran bunu salt-okuma ile
 * uzlastirmak zorundadir. Otomatik tekrar gonderim ASLA yapilmaz.
 */
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
    return { status: res.status, body: parsed, elapsedMs: Date.now() - started, indeterminate: false };
  } catch (e) {
    // Abort, soket kopmasi, DNS vb.: sunucu istegi TAMAMLAMIS OLABILIR.
    return {
      status: null, body: null, elapsedMs: Date.now() - started, indeterminate: true,
      indeterminateReason: (e && e.name === 'AbortError')
        ? `istemci timeout (${timeoutMs} ms) — sunucu islemi DEVAM EDIYOR OLABILIR`
        : `tasima hatasi: ${e && e.message}`,
    };
  } finally { clearTimeout(timer); }
}

function log(...a) { console.log(...a); }
function step(id, msg) { console.log(`\n[${id}] ${msg}`); }

// =========================================================================================
// KABUL ALANININ BULUNMASI VE ERISIMIN KAPATILMASI — TEK KAYNAK
//
// KUSUR B (paket §11): yurutucu erisimi yalniz `setupCode 0|4` iken kapatiyordu. Oysa
// `f04-01-setup.js:222` EXPECTED kontrolu `$transaction` COMMIT ETTIKTEN SONRA calisir ve
// exit 1 uretir; ayrica `spawnSync(timeout)` commit sonrasi oldururse exit 124 olur. Her iki
// halde de kayitlar MEVCUTTUR ama yurutucu "kurulum commit edilmedi" deyip hesabi ACIK BIRAKIR.
//
// Cozum: cikis kodu beyaz listesi YERINE, YAZMADAN ONCE belirlenmis `runId` ile alan aranir.
// `runId` yurutucuda (f04-run.js) hicbir yazma yapilmadan uretilir ve tenant slug'ina
// (`f04-acc-<runId>`) GOMULUDUR; bu yuzden hangi hata yolundan gecilirse gecilsin alan
// bulunabilir. Bulunamiyorsa bu bir OLCUMDUR ("alan yok"), varsayim degildir.
//
// Kararin tek kaynakta olmasi sart: kopya yazilirsa biri duzeltilip digeri bayat kalir.
// =========================================================================================

/**
 * Kabul alanini YALNIZ `runId`den bulur. SALT-OKUMA; hicbir kayit olusturmaz/degistirmez.
 * Durum dosyasina BAGIMLI DEGILDIR — surec zorla sonlandirilmis olsa da calisir.
 */
async function findAcceptanceField(prisma, runId) {
  const id = String(runId || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(id)) throw new Error(`gecersiz runId='${runId}' (8 hex bekleniyor)`);
  const slug = `${TENANT_PREFIX}${id}`;
  assertOwnSlug(slug); // G-1: baska programin tenant'ina ASLA dokunulmaz
  const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (!tenant) return { runId: id, slug, exists: false, tenantId: null };
  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id }, select: { id: true, isActive: true, tokenVersion: true },
  });
  return {
    runId: id, slug, exists: true, tenantId: tenant.id,
    users, activeUsers: users.filter((u) => u.isActive).length,
  };
}

/**
 * Bu kosuma ait tenant'in ERISIMINI kapatir: `isActive=false` + `tokenVersion++`.
 * Finansal ve audit kayitlarina DOKUNULMAZ. TEKRARI GUVENLIDIR — ikinci cagri
 * `deactivated:0` dondurur ve kapali durumu bozmaz.
 *
 * Olculemeyen kalem "korundu" SAYILMAZ; bu durumda `preserved:false` doner.
 */
async function revokeTenantAccess(prisma, tenantId) {
  await assertOwnTenant(prisma, tenantId); // G-2
  const T = { tenantId };
  const sel = { id: true, isActive: true, tokenVersion: true };
  const before = await prisma.user.findMany({ where: T, select: sel });

  const countEvidence = async () => {
    const out = {}; const errs = [];
    for (const [k, model] of [
      ['collection', 'collection'], ['disposition', 'collectionDisposition'],
      ['journal', 'accountingJournalEntry'],
      ['expenseApplication', 'collectionDispositionExpenseApplication'], ['audit', 'auditLog'],
    ]) {
      try { out[k] = await prisma[model].count({ where: T }); }
      catch (e) { out[k] = 'SAYILAMADI'; errs.push(k); }
    }
    return { out, errs };
  };
  const pre = await countEvidence();

  const deactivated = await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false, tokenVersion: { increment: 1 } },
    });
    return r.count;
  });

  const after = await prisma.user.findMany({ where: T, select: sel });
  const post = await countEvidence();

  const stillActive = after.filter((u) => u.isActive).length;
  const bumped = after.filter((u) => {
    const b = before.find((x) => x.id === u.id);
    return b && u.tokenVersion > b.tokenVersion;
  }).length;

  const comparable = Object.keys(post.out)
    .filter((k) => post.out[k] !== 'SAYILAMADI' && pre.out[k] !== 'SAYILAMADI');
  const changed = comparable.filter((k) => post.out[k] !== pre.out[k]);
  const notComparable = Object.keys(post.out).filter((k) => !comparable.includes(k));
  const preserved = changed.length === 0 && notComparable.length === 0;
  const closed = stillActive === 0;

  return {
    deactivated, stillActive, tokenVersionBumped: bumped,
    // Ikinci cagri: kapatilacak aktif kullanici KALMAMIS demektir (tekrar guvenli).
    alreadyClosed: deactivated === 0 && before.length > 0 && before.every((u) => !u.isActive),
    userCount: before.length,
    accessClosed: closed, evidencePreserved: preserved,
    evidenceChanged: changed, evidenceNotMeasurable: notComparable,
    financialAuditCounts: post.out,
    verdict: closed && preserved
      ? 'ERISIM SONLANDIRILDI - finansal/audit kanit KORUNDU'
      : !closed ? 'EKSIK - erisim TAM KAPANMADI'
        : changed.length ? 'EKSIK - kanit DEGISTI: ' + changed.join(', ')
          : 'EKSIK - kapanis DOGRULANAMADI (olculemeyen: ' + notComparable.join(', ') + ')',
  };
}

module.exports = {
  TENANT_PREFIX, FORBIDDEN_SLUGS,
  requireEnv, loadPrisma, saveState, loadState, requireLoginPassword, recoverState,
  assertOwnSlug, assertOwnTenant, findAcceptanceField, revokeTenantAccess,
  newSuffix, backendPid, blockingPids, waitUntilBlockedBy, pidsBlockedBy, waitUntilSomeoneBlockedBy,
  ObservationError, BudgetExceededError, assertWithinBudget, sessionTxState, assertLockReleased,
  activeWaiters, httpJson, log, step,
};
