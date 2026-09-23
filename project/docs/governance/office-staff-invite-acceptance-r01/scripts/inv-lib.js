/*
 * OFFICE PERSONEL DAVETI — UCTAN UCA KABUL: ORTAK KATMAN
 *
 * NE: davet olustur -> yerel yakalayicida TESLIM -> gercek kabul ucu -> yeni parolayla giris ->
 *     ayni token'in TEKRAR reddi -> erisim kapanisi. Olcum HTTP + DB okumasi ile yapilir.
 * NE DEGIL: canli kabul yetkisi. Canli kosum ayri owner GO'su ve ayri .env penceresi ister.
 *
 * SIR KAPILARI
 *   - Ham davet token'i YALNIZ bellekte tutulur; kanitlara yalniz sha256'si yazilir.
 *   - Parolalar surecte uretilir; dosyaya/ciktiya yazilmaz.
 *   - Cikti yazicisi metin duzeyinde FAIL-CLOSED: token/parola deseni tasiyan nesne yazilamaz.
 *
 * ORTAM DEGISKENLERI
 *   INV_ENVIRONMENT    disposable | live   (VERILMEZSE live — fail-safe)
 *   INV_DATABASE_URL   hedef PostgreSQL (loopback; live -> 5432/hukuk_db, disposable -> BASKA)
 *   INV_API_BASE_URL   API koku (`/api` dahil; live -> yalniz 8080, disposable -> 8080 YASAK)
 *   INV_PRISMA_ROOT    `@prisma/client` dizini (ZORUNLU)
 *   INV_BCRYPT_PATH    `bcrypt` paket dizini (ZORUNLU)
 *   INV_SINK_DIR       yerel e-posta yakalayicisinin yazdigi dizin (ZORUNLU)
 *   INV_CONFIRM_LIVE   canli jeton (yalniz live)
 *   INV_OWNER_GO_REF   OWNER-GO-OFFICE-INVITE-YYYYMMDD-Rnn (yalniz live; bicim ZORUNLU)
 *   INV_RESULT_FILE    repo DISI sonuc yolu
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const TENANT_PREFIX = 'inv-';
/** Diger kabul hatlarinin alanlari: bu paket onlara ASLA dokunmaz. */
const FORBIDDEN_PREFIXES = ['off-c123-', 'off-acc-', 'off-ak-', 'cl-acc-', 'f04-acc-', 'ah-'];
const FORBIDDEN_SLUGS = new Set(['telli-hukuk', 'demo-firma', 'local-development-office']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const LIVE_DB_PORT = '5432';
const LIVE_DB_NAME = 'hukuk_db';
const LIVE_API_PORT = '8080';
const LIVE_CONFIRM_TOKEN = 'YES-LIVE-OFFICE-INVITE-ACCEPTANCE';
const GO_REF_RE = /^OWNER-GO-OFFICE-INVITE-\d{8}-R\d{2}$/;
const GO_REF_ANY_RE = /OWNER-GO-OFFICE-INVITE-\d{8}-R\d{2}/;
/** Kabul baglantisindaki ham token deseni (base64url, 32 bayt -> 43 karakter). */
const RAW_TOKEN_RE = /[A-Za-z0-9_-]{43}/;

class GateError extends Error {
  constructor(m, gate) { super(m); this.name = 'GateError'; this.gate = gate || 'G-0'; }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new GateError(`${name} tanimli degil — fail-closed durur`);
  return v;
}

/** G-1: yalnizca bu paketin kendi alani. */
function assertOwnSlug(slug) {
  if (!slug.startsWith(TENANT_PREFIX)) throw new GateError(`G-1: '${slug}' bu paketin oneki degil`, 'G-1');
  if (FORBIDDEN_SLUGS.has(slug)) throw new GateError(`G-1: '${slug}' korunan alan`, 'G-1');
  for (const p of FORBIDDEN_PREFIXES) {
    if (slug.startsWith(p)) throw new GateError(`G-1: '${slug}' baska kabul hattinin alani`, 'G-1');
  }
}

/** G-2: dokunulan tenant gercekten bu kosumun tenant'i mi. */
async function assertOwnTenant(prisma, tenantId) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!t) throw new GateError(`G-2: tenant ${tenantId} yok`, 'G-2');
  assertOwnSlug(t.slug);
  return t.slug;
}

/** G-0: ortam izolasyonu. HERHANGI BIR YAZMADAN ONCE. Donen nesnede SIR YOK. */
function assertRunEnvironment() {
  const environment = (process.env.INV_ENVIRONMENT || 'live').toLowerCase();
  if (environment !== 'live' && environment !== 'disposable') {
    throw new GateError(`G-0: gecersiz INV_ENVIRONMENT='${environment}' (disposable|live)`);
  }
  let goRefSha256 = null;
  if (environment === 'live') {
    if (process.env.INV_CONFIRM_LIVE !== LIVE_CONFIRM_TOKEN) {
      throw new GateError("G-0: ortam 'live' ve INV_CONFIRM_LIVE jetonu YOK/yanlis — canliya yazma baslamaz");
    }
    const goRef = process.env.INV_OWNER_GO_REF || '';
    if (!GO_REF_RE.test(goRef)) {
      // Girilen deger YAZDIRILMAZ.
      throw new GateError('G-0: INV_OWNER_GO_REF bicimi gecersiz (beklenen OWNER-GO-OFFICE-INVITE-YYYYMMDD-Rnn)');
    }
    goRefSha256 = crypto.createHash('sha256').update(goRef).digest('hex').toUpperCase();
  }

  let u;
  try { u = new URL(requireEnv('INV_DATABASE_URL')); } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError('G-0: INV_DATABASE_URL cozumlenemedi — ortam BELIRSIZ');
  }
  const dbHost = u.hostname;
  const dbPort = u.port || LIVE_DB_PORT;
  const dbName = decodeURIComponent((u.pathname || '').replace(/^\//, ''));
  if (!LOOPBACK.has(dbHost)) throw new GateError(`G-0: DB host '${dbHost}' loopback degil`);
  if (environment === 'live' && (dbPort !== LIVE_DB_PORT || dbName !== LIVE_DB_NAME)) {
    throw new GateError(`G-0: 'live' icin beklenen ${LIVE_DB_PORT}/${LIVE_DB_NAME}; olculen ${dbPort}/${dbName}`);
  }
  if (environment === 'disposable' && (dbPort === LIVE_DB_PORT || dbName === LIVE_DB_NAME)) {
    throw new GateError(`G-0: disposable kosum CANLI DB'yi (${dbPort}/${dbName}) hedefleyemez`);
  }

  let a;
  try { a = new URL(requireEnv('INV_API_BASE_URL')); } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError('G-0: INV_API_BASE_URL cozumlenemedi');
  }
  const apiPort = a.port || '80';
  if (!LOOPBACK.has(a.hostname)) throw new GateError(`G-0: API host '${a.hostname}' loopback degil`);
  if (environment === 'live' && apiPort !== LIVE_API_PORT) {
    throw new GateError(`G-0: canli DB ile canli olmayan API portu (${apiPort}) hedeflenemez`);
  }
  if (environment === 'disposable' && apiPort === LIVE_API_PORT) {
    throw new GateError('G-0: disposable DB ile CANLI API portu (8080) hedeflenemez');
  }
  return { environment, dbHost, dbPort, dbName, apiHost: a.hostname, apiPort, goRefSha256 };
}

/** API gercekten HEDEF veritabanina mi bagli: sentinel tenant yazip API'den gorunurlugunu olcer. */
async function verifyApiBoundToSameDatabase(prisma, apiBase, adminToken, expectTenantId) {
  const me = await httpJson('GET', `${apiBase}/auth/me`, null, adminToken);
  if (me.status !== 200) throw new GateError(`G-0: /auth/me ${me.status} — API kimligi dogrulanamadi`);
  // /auth/me yaniti `{ user: <allowlist projeksiyonu> }` seklindedir (auth.controller.ts:63).
  const u = (me.body && me.body.user) || me.body || {};
  const seen = u.tenantId || (u.tenant && u.tenant.id);
  if (seen !== expectTenantId) {
    throw new GateError(`G-0: API baska veritabanina bagli gorunuyor (tenant ${seen} != ${expectTenantId})`);
  }
  return true;
}

function httpJson(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body === null || body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: {
        ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 400) }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(apiBase, email, password, tenantSlug) {
  // AUTH-01: giris tenant kapsamlidir; `tenantSlug` ZORUNLU girdidir.
  const r = await httpJson('POST', `${apiBase}/auth/login`, { email, password, tenantSlug });
  const token = r.body && (r.body.accessToken || r.body.access_token || r.body.token);
  return { status: r.status, token: token || null, body: r.body };
}

/**
 * Yerel yakalayicidaki EN YENI mesaji bulur ve kabul baglantisindaki ham token'i cikarir.
 * Ham token DONER ama cagiran onu YALNIZ bellekte kullanir; kanit dosyalarina sha256'si yazilir.
 * "HTTP 200" tek basina teslim sayilmaz: teslim yalnizca yakalayicida dosya olusursa kanitlanir.
 */
function readCapturedInvite(sinkDir, recipient, sinceMs) {
  const files = fs.existsSync(sinkDir) ? fs.readdirSync(sinkDir) : [];
  const hits = [];
  for (const f of files) {
    const p = path.join(sinkDir, f);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || st.mtimeMs < sinceMs) continue;
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    if (!text.includes(recipient)) continue;
    hits.push({ file: f, text, mtimeMs: st.mtimeMs });
  }
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!hits.length) return { delivered: false, file: null, rawToken: null, acceptPathSeen: false };
  const top = hits[0];
  const decoded = decodeQuotedPrintable(top.text);
  const acceptPathSeen = /\/auth\/accept-invite\?token=/.test(decoded);
  const m = decoded.match(/\/auth\/accept-invite\?token=([A-Za-z0-9_%-]+)/);
  const rawToken = m ? decodeURIComponent(m[1]) : null;
  return { delivered: true, file: top.file, rawToken, acceptPathSeen, messageCount: hits.length };
}

/** SMTP yakalayicilari govdeyi quoted-printable yazabilir; baglanti satir sonlarindan bolunur. */
function decodeQuotedPrintable(text) {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex').toUpperCase(); }

/** G-4: sir (ham token/parola/GO ref) cikti dosyasina YAZILAMAZ — metin duzeyinde fail-closed. */
function writeJsonNoSecrets(file, obj, secrets) {
  const text = JSON.stringify(obj, null, 1) + '\n';
  if (GO_REF_ANY_RE.test(text)) throw new Error(`G-4 IHLALI: GO ref literali '${path.basename(file)}' dosyasina yazilamaz`);
  for (const s of secrets || []) {
    if (s && text.includes(s)) throw new Error(`G-4 IHLALI: sir '${path.basename(file)}' dosyasina yazilamaz (deger YAZDIRILMAZ)`);
  }
  if (RAW_TOKEN_RE.test(text.replace(/[0-9A-F]{64}/g, ''))) {
    throw new Error(`G-4 IHLALI: '${path.basename(file)}' ham token bicimi tasiyor olabilir — yazma REDDEDILDI`);
  }
  fs.writeFileSync(file, text, 'utf8');
}

function loadPrisma() {
  const { PrismaClient } = require(requireEnv('INV_PRISMA_ROOT'));
  return new PrismaClient({ datasources: { db: { url: requireEnv('INV_DATABASE_URL') } }, log: [] });
}
function loadBcrypt() { return require(requireEnv('INV_BCRYPT_PATH')); }

/** Sentetik olmayan tarafin degismedigini olcmek icin parmak izi. */
async function isolationFingerprint(prisma, ownTenantIds) {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  const foreign = tenants.filter((t) => !ownTenantIds.includes(t.id));
  const rows = [];
  for (const t of foreign) {
    const [user, invite] = await Promise.all([
      prisma.user.count({ where: { tenantId: t.id } }),
      prisma.userInvite.count({ where: { tenantId: t.id } }),
    ]);
    rows.push(`${t.slug}|${user}|${invite}`);
  }
  rows.sort();
  return { tenants: foreign.length, digest: sha256(rows.join('\n')).slice(0, 16).toLowerCase() };
}

/**
 * KOSUM MAKBUZU — kurtarmanin yetkisi buna baglidir.
 * Yalniz "inv- onekli tenant" kosulu YETMEZ: kurtarma, makbuzdaki runId + tenantId + kullanici/davet
 * kimlikleriyle DB'yi karsilastirir; biri tutmazsa HIC YAZMADAN durur (baska sentetik kosuma dokunmaz).
 */
function writeReceipt(file, receipt) {
  writeJsonNoSecrets(file, { record: 'OFFICE-INVITE-RECEIPT', ...receipt }, []);
  return sha256(fs.readFileSync(file, 'utf8'));
}

function readReceipt(file) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (r.record !== 'OFFICE-INVITE-RECEIPT') throw new GateError('G-2: makbuz kaydi bicimi taninmiyor', 'G-2');
  for (const k of ['runId', 'slug', 'tenantId', 'adminUserId', 'invitedUserId', 'inviteId']) {
    if (!r[k]) throw new GateError(`G-2: makbuzda '${k}' yok — kurtarma YETKISIZ`, 'G-2');
  }
  return r;
}

/** G-2b: makbuz ile DB birebir ortusmeli. Tutmazsa YAZMA YOK. */
async function assertReceiptMatchesDb(prisma, receipt) {
  const slug = `${TENANT_PREFIX}${receipt.runId}`;
  if (receipt.slug !== slug) throw new GateError(`G-2b: makbuz slug'i runId ile tutarsiz (${receipt.slug}) — YAZMA YOK`, 'G-2b');
  assertOwnSlug(slug);
  const tenant = await prisma.tenant.findUnique({ where: { id: receipt.tenantId }, select: { id: true, slug: true } });
  if (!tenant) throw new GateError('G-2b: makbuzdaki tenant DB icinde YOK — YAZMA YOK', 'G-2b');
  if (tenant.slug !== slug) throw new GateError(`G-2b: tenant slug uyusmuyor (DB ${tenant.slug} != makbuz ${slug}) — YAZMA YOK`, 'G-2b');
  const users = await prisma.user.findMany({ where: { id: { in: [receipt.adminUserId, receipt.invitedUserId] } }, select: { id: true, tenantId: true } });
  if (users.length !== 2) throw new GateError('G-2b: makbuzdaki iki kullanicidan biri YOK — YAZMA YOK', 'G-2b');
  for (const u of users) {
    if (u.tenantId !== tenant.id) throw new GateError('G-2b: makbuz kullanicisi BASKA tenant icinde — YAZMA YOK', 'G-2b');
  }
  const invite = await prisma.userInvite.findUnique({ where: { id: receipt.inviteId }, select: { tenantId: true, userId: true } });
  if (!invite) throw new GateError('G-2b: makbuzdaki davet kaydi YOK — YAZMA YOK', 'G-2b');
  if (invite.tenantId !== tenant.id || invite.userId !== receipt.invitedUserId) {
    throw new GateError('G-2b: davet kaydi makbuzla ortusmuyor — YAZMA YOK', 'G-2b');
  }
  return { slug, tenantId: tenant.id, checked: ['runId', 'slug', 'tenantId', 'adminUserId', 'invitedUserId', 'inviteId'] };
}

/**
 * HEDEF-DISI ALICI TESPITI (onleme DEGIL, TESPIT).
 * Yakalama dosyalarindaki zarf alicilari (`X-INV-Rcpt`) beklenen sentetik adresle karsilastirilir.
 * Urunde alici allowlist'i YOKTUR; bu olcum yalnizca pencerede hedef disina mesaj cikip cikmadigini
 * SONRADAN tespit eder.
 */
function scanCaptureRecipients(captureDir, expectedRecipients) {
  const files = fs.existsSync(captureDir) ? fs.readdirSync(captureDir).filter((f) => f.endsWith('.eml')) : [];
  const offTarget = [];
  for (const f of files) {
    const head = fs.readFileSync(path.join(captureDir, f), 'utf8').split(/\r?\n/).slice(0, 4).join('\n');
    const m = head.match(/X-INV-Rcpt:\s*(.*)/);
    const rcpts = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (!rcpts.length) { offTarget.push({ file: f, reason: 'zarf alicisi OKUNAMADI (OLCULEMEDI)' }); continue; }
    for (const r of rcpts) if (!expectedRecipients.includes(r)) offTarget.push({ file: f, recipient: r, reason: 'hedef DISI' });
  }
  return { files: files.length, offTarget, measured: files.length > 0 };
}

/**
 * YAKALAMA TEMIZLIGI — yakalama dosyalari HAM TOKEN tasir; kanit dizinine KONMAZ.
 * Kosum sonunda silinir ve silinme DOGRULANIR (kalan dosya sayisi raporlanir).
 */
function purgeCapture(captureDir) {
  if (!fs.existsSync(captureDir)) return { purged: 0, remaining: 0, existed: false };
  const files = fs.readdirSync(captureDir);
  let purged = 0;
  for (const f of files) {
    try { fs.unlinkSync(path.join(captureDir, f)); purged += 1; } catch { /* kalan sayilir */ }
  }
  const remaining = fs.readdirSync(captureDir).length;
  return { purged, remaining, existed: true };
}

function newRunId() { return crypto.randomBytes(4).toString('hex'); }
function log(...a) { console.log(...a); }

module.exports = {
  TENANT_PREFIX, GateError, GO_REF_RE, RAW_TOKEN_RE,
  requireEnv, assertRunEnvironment, assertOwnSlug, assertOwnTenant, verifyApiBoundToSameDatabase,
  httpJson, login, readCapturedInvite, decodeQuotedPrintable, sha256, writeJsonNoSecrets,
  writeReceipt, readReceipt, assertReceiptMatchesDb, scanCaptureRecipients, purgeCapture,
  loadPrisma, loadBcrypt, isolationFingerprint, newRunId, log,
};
