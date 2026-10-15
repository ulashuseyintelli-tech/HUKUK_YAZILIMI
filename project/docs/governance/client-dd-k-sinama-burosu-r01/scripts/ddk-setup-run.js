/*
 * CLIENT DD (K) — AYRI SINAMA BÜROSU: KURULUM / KAPANIŞ KOŞUCUSU (R01)
 *
 * Owner kararı Ek 72 madde 2 (2026-10-15): ayrı sınama bürosu için kurulum bloğu + hedefli testler + PR (HAZIRLIK). Bu dosya
 * canlıda ancak owner bloğu (`ddk-owner-block.ps1`) üzerinden, owner'ın AYRI canlı onayı ve GO ref'iyle çalışır.
 *
 * KİPLER (DDK_MODE)
 *   kur    Tek işlemde DÖRT satır yazar: Tenant · User (USER, bcrypt parola özeti) · Lawyer (PARTNER, userId = User) · Client (PERSON,
 *          kimliksiz, `.invalid` e-posta). Yazdığını geri okur. Makbuz yazar (parola YOK). Geri okuma + makbuz + kanıt tutarsa personel
 *          giriş bilgisini YALNIZ yerel konsola (extacc-display.js, CONOUT$) çizer — stdout / stderr / kanıt / makbuz DEĞİL.
 *   kapat  Makbuzdaki sentetik kullanıcıyı kapatır: `User.isActive = false`, `tokenVersion` +1. Geri okur. Kullanıcı zaten pasifse
 *          YAZMAZ (çıkış 0, `zatenKapali`). Portal / müvekkil satırlarını YALNIZ OKUR (bilgi; o büroyla sınırlı).
 *
 * KAPILAR (hepsi ilk veritabanı bağlantısından ÖNCE; fail-closed)
 *   - bağlı veritabanı kimliği beyanla aynı (DDK_EXPECT_DB) ve İZİNLİ iki kimlikten biri (adreste izin listesi dışında sorgu parametresi
 *     — ör. `host`, `port`, `options` — ya da `#` parçası varsa adres REDDEDİLİR):
 *       canlı : 127.0.0.1:5432/hukuk_db  → DDK_LIVE_CONFIRM=1 + DDK_LIVE_GO_REF (OWNER-GO-CLIENT-DDK-YYYYMMDD-RNN) ŞART
 *       sınama: 127.0.0.1:5451/ddk_test  → yalnız öz-test
 *   - kur: slug `ah-<runId>` (ortak düzenek önek kuralı; yasak slug listesi) · aynı slug varsa YAZMADAN dur · gösterim `conout`
 *     (canlıda ZORUNLU; `none` yalnız sınama veritabanında) · konsol açılamazsa bağlanmadan dur
 *   - kapat: makbuz alanları runId'den türeyen değerlerle aynı (slug, personel e-postası) + makbuz kimlik bağı DB'den doğrulanır
 *     (i12-live-identity) + büro adı runId'den türeyen ad + kullanıcı o büroya ait + büroda tek kullanıcı
 * SIR: parola (DDK_LOGIN_PW) ve GO ref kanıta / makbuza / çıktıya YAZILMAZ; veritabanı adresi yazılmaz.
 *
 * ÇIKIŞ: 0 TAMAM · 1 beklenmeyen hata · 2 kullanım / yapılandırma · 3 canlı onay / GO eksik · 4 kimlik / hedef / çakışma / konsol reddi
 *        (YAZMA YOK) · 5 kapanış doğrulanamadı · 6 kurulum geri okuması tutmadı · 7 kanıt / makbuz yazılamadı
 *        · 8 kurulum tamam, giriş bilgisi konsola çizilemedi (Kapat ile kapatılır)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GOV = path.resolve(__dirname, '../..');
const AH = require(path.join(GOV, 'client-acceptance-harness-r01', 'scripts', 'ah-lib'));
const { assertReceiptIdentity } = require(path.join(GOV, 'client-live-acceptance-i12-r01', 'scripts', 'i12-live-identity'));
const DISPLAY = require(path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-display'));

const RECORD_EVIDENCE = 'CLIENT-DDK-EVIDENCE';
const RECORD_RECEIPT = 'CLIENT-DDK-SETUP-RECEIPT';
const GO_RE = /^OWNER-GO-CLIENT-DDK-\d{8}-R\d{2}$/;
const LIVE_DB = Object.freeze({ host: '127.0.0.1', port: '5432', name: 'hukuk_db' });
const TEST_DB = Object.freeze({ host: '127.0.0.1', port: '5451', name: 'ddk_test' });
const MAIL_DOMAIN = 'ddk-sinama.invalid';

const EXIT = Object.freeze({ OK: 0, ERROR: 1, USAGE: 2, CONFIRM: 3, REJECT: 4, CLOSE_UNVERIFIED: 5, SETUP_READBACK: 6, EVIDENCE: 7, DISPLAY: 8 });

/** Bağlantı hedefini DEĞİŞTİRMEYEN sorgu parametreleri (Prisma / PostgreSQL bağlantı ayarları). Liste dışı her parametre adresi geçersiz kılar. */
const SAFE_QUERY = new Set(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout', 'socket_timeout', 'statement_cache_size', 'application_name', 'pgbouncer', 'sslmode']);

/** Bağlantı adresinden kimlik (bağlanmadan). Ayrıştırılamazsa ya da izin listesi dışı sorgu parametresi / `#` varsa null. */
function dbIdentity(url) {
  try {
    const u = new URL(String(url || ''));
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    if (u.hash) return null;
    for (const k of u.searchParams.keys()) { if (!SAFE_QUERY.has(k)) return null; }
    return { host: u.hostname, port: u.port || '5432', name: decodeURIComponent(u.pathname.replace(/^\//, '')) };
  } catch (e) { return null; }
}
const sameIdentity = (a, b) => !!a && !!b && a.host === b.host && a.port === b.port && a.name === b.name;

/**
 * Bütün kapılar — SAF işlev; veritabanına bağlanmaz. { code: 0, ... } ya da { code, why }.
 */
function gates(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { code: EXIT.USAGE, why: 'NODE_TLS_REJECT_UNAUTHORIZED=0 ile koşulmaz' };
  const mode = String(env.DDK_MODE || '');
  if (mode !== 'kur' && mode !== 'kapat') return { code: EXIT.USAGE, why: 'DDK_MODE kur|kapat olmalı' };
  const bound = dbIdentity(env.AH_DATABASE_URL);
  if (!bound) return { code: EXIT.USAGE, why: 'AH_DATABASE_URL ayrıştırılamadı ya da izinsiz sorgu parametresi taşıyor' };
  if (!env.DDK_EXPECT_DB || env.DDK_EXPECT_DB !== bound.name) return { code: EXIT.REJECT, why: `beklenen DB '${env.DDK_EXPECT_DB || ''}' != bağlı '${bound.name}'` };
  const live = sameIdentity(bound, LIVE_DB);
  const test = sameIdentity(bound, TEST_DB);
  if (!live && !test) return { code: EXIT.REJECT, why: `izinli olmayan veritabanı kimliği ${bound.host}:${bound.port}/${bound.name}` };
  if (live) {
    if (env.DDK_LIVE_CONFIRM !== '1') return { code: EXIT.CONFIRM, why: 'canlı veritabanı: DDK_LIVE_CONFIRM=1 gerekli' };
    if (!(env.DDK_LIVE_GO_REF && GO_RE.test(String(env.DDK_LIVE_GO_REF).trim()))) {
      return { code: EXIT.CONFIRM, why: 'canlı veritabanı: DDK_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-DDK-YYYYMMDD-RNN) gerekli' };
    }
  }
  if (!env.DDK_EVID_FILE) return { code: EXIT.USAGE, why: 'DDK_EVID_FILE gerekli' };
  if (!env.DDK_RECEIPT) return { code: EXIT.USAGE, why: 'DDK_RECEIPT gerekli' };
  if (mode === 'kur') {
    const display = String(env.DDK_DISPLAY || 'conout');
    if (display !== 'conout' && display !== 'none') return { code: EXIT.USAGE, why: 'DDK_DISPLAY conout|none olmalı' };
    if (display === 'none' && live) return { code: EXIT.REJECT, why: 'DDK_DISPLAY=none canlı veritabanıyla kullanılamaz' };
    const runId = String(env.DDK_RUNID || '').toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(runId)) return { code: EXIT.USAGE, why: 'DDK_RUNID 8 hex olmalı' };
    const pw = String(env.DDK_LOGIN_PW || '');
    if (pw.length < 12) return { code: EXIT.USAGE, why: 'DDK_LOGIN_PW en az 12 karakter olmalı (blok üretir)' };
    const slug = `${AH.TENANT_PREFIX}${runId}`;
    try { AH.assertOwnSlug(slug); } catch (e) { return { code: EXIT.REJECT, why: `slug kuralı: ${e.message}` }; }
    if (AH.FORBIDDEN_SLUGS.has(slug)) return { code: EXIT.REJECT, why: 'yasak slug' };
    return { code: EXIT.OK, mode, live, runId, slug, display };
  }
  return { code: EXIT.OK, mode, live };
}

/** Kurulumda yazılacak dört satırın değerleri (parola özeti hariç). Sentetik ad / e-posta; kimlik numarası YOK. */
function setupRows(runId) {
  return {
    tenant: { name: `DD-K Sinama Burosu ${runId}`, slug: `${AH.TENANT_PREFIX}${runId}` },
    user: { email: `ddk-personel-${runId}@${MAIL_DOMAIN}`, name: 'DDK', surname: `Sinama ${runId}`, role: 'USER', isActive: true },
    lawyer: { name: 'DDK', surname: `Sinama ${runId}`, lawyerRank: 'PARTNER' },
    client: { type: 'PERSON', firstName: 'DDK', lastName: `Sinama Muvekkil ${runId}`, displayName: `DDK Sinama Muvekkil ${runId}`,
      name: `DDK Sinama Muvekkil ${runId}`, email: `ddk-muvekkil-${runId}@${MAIL_DOMAIN}` },
  };
}

function writeJsonNew(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 1), { encoding: 'utf8', flag: 'wx' });   // var olan dosyanın ÜZERİNE YAZMAZ
}

/** Sır taraması: verilen değerlerden biri metinde geçiyorsa true. */
function containsSecret(text, secrets) { return secrets.filter(Boolean).some((s) => String(text).includes(String(s))); }

async function kur(prisma, bcrypt, g, env, out) {
  const rows = setupRows(g.runId);
  // ÇAKIŞMA: aynı slug varsa YAZMADAN dur (slug @unique; yarışta ikinci işlem P2002 ile geri alınır → çıkış 1, satır YOK).
  const clash = await prisma.tenant.findFirst({ where: { slug: rows.tenant.slug }, select: { id: true } });
  if (clash) { out.reject = 'SLUG_CLASH'; return EXIT.REJECT; }
  const hash = await bcrypt.hash(String(env.DDK_LOGIN_PW), 10);
  const ids = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({ data: rows.tenant, select: { id: true } });
    const u = await tx.user.create({ data: { tenantId: t.id, ...rows.user, passwordHash: hash }, select: { id: true } });
    const l = await tx.lawyer.create({ data: { tenantId: t.id, ...rows.lawyer, userId: u.id }, select: { id: true } });
    const c = await tx.client.create({ data: { tenantId: t.id, ...rows.client }, select: { id: true } });
    return { tenantId: t.id, userId: u.id, lawyerId: l.id, clientId: c.id };
  });
  out.written = { tenant: 1, user: 1, lawyer: 1, client: 1 };
  out.committed = true;
  const receipt = { record: RECORD_RECEIPT, runId: g.runId, tenantId: ids.tenantId, tenantSlug: rows.tenant.slug, userId: ids.userId,
    userEmail: rows.user.email, lawyerId: ids.lawyerId, clientId: ids.clientId, createdAt: new Date().toISOString() };
  try { writeJsonNew(env.DDK_RECEIPT, receipt); out.receiptWritten = true; } catch (e) { out.receiptWritten = false; out.receiptError = e.code || e.name; }
  out.receipt = receipt;

  // GERİ OKUMA — yalnız bu koşumun satırları (öteki bürolarda sayım YOK).
  const t = await prisma.tenant.findUnique({ where: { id: ids.tenantId }, select: { slug: true, lifecycle: true } });
  const u = await prisma.user.findUnique({ where: { id: ids.userId }, select: { tenantId: true, email: true, role: true, isActive: true, tokenVersion: true, passwordHash: true } });
  const l = await prisma.lawyer.findUnique({ where: { id: ids.lawyerId }, select: { tenantId: true, userId: true, lawyerRank: true, isActive: true, tckn: true } });
  const c = await prisma.client.findUnique({ where: { id: ids.clientId }, select: { tenantId: true, type: true, tckn: true, vkn: true, identityNo: true, isActive: true, hasPortalAccess: true, portalUserId: true } });
  const counts = {
    users: await prisma.user.count({ where: { tenantId: ids.tenantId } }),
    lawyers: await prisma.lawyer.count({ where: { tenantId: ids.tenantId } }),
    staff: await prisma.staffMember.count({ where: { tenantId: ids.tenantId } }),
    clients: await prisma.client.count({ where: { tenantId: ids.tenantId } }),
    portalUsers: await prisma.clientPortalUser.count({ where: { clientId: ids.clientId } }),
  };
  const pwOk = !!(u && u.passwordHash) && await bcrypt.compare(String(env.DDK_LOGIN_PW), u.passwordHash);
  const checks = [
    ['tenant slug + ACTIVE', !!t && t.slug === rows.tenant.slug && t.lifecycle === 'ACTIVE'],
    ['user: aynı büro · USER · etkin · e-posta', !!u && u.tenantId === ids.tenantId && u.role === 'USER' && u.isActive === true && u.email === rows.user.email],
    ['user parola özeti verilen parolayla eşleşir', pwOk],
    ['lawyer: aynı büro · PARTNER · userId bağlı · etkin · kimlik boş', !!l && l.tenantId === ids.tenantId && l.lawyerRank === 'PARTNER' && l.userId === ids.userId && l.isActive === true && !l.tckn],
    ['client: aynı büro · PERSON · kimlik boş · etkin · portal yok', !!c && c.tenantId === ids.tenantId && c.type === 'PERSON' && !c.tckn && !c.vkn && !c.identityNo && c.isActive === true && c.hasPortalAccess === false && !c.portalUserId],
    ['büroda yalnız bu satırlar (1 kullanıcı · 1 avukat · 0 personel profili · 1 müvekkil · 0 portal hesabı)', counts.users === 1 && counts.lawyers === 1 && counts.staff === 0 && counts.clients === 1 && counts.portalUsers === 0],
  ];
  out.readback = { tokenVersion: u ? u.tokenVersion : null, counts };
  out.checks = checks.map(([ad, ok]) => ({ ad, ok: !!ok }));
  if (!checks.every(([, ok]) => ok)) return EXIT.SETUP_READBACK;
  if (!out.receiptWritten) return EXIT.EVIDENCE;
  return EXIT.OK;
}

async function kapat(prisma, env, out) {
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(env.DDK_RECEIPT, 'utf8')); } catch (e) { out.reject = 'RECEIPT_UNREADABLE'; return EXIT.REJECT; }
  const runId = receipt && typeof receipt.runId === 'string' ? receipt.runId : '';
  if (!receipt || receipt.record !== RECORD_RECEIPT || !/^[0-9a-f]{8}$/.test(runId) || !receipt.userId || !receipt.clientId
    || receipt.userEmail !== setupRows(runId).user.email) { out.reject = 'RECEIPT_FIELDS'; return EXIT.REJECT; }
  out.runId = runId;
  const ident = await assertReceiptIdentity(prisma, { runId, tenantId: receipt.tenantId, tenantSlug: receipt.tenantSlug });
  out.identity = ident.ok ? 'IDENTITY_OK' : String(ident.reason || '').split(' ')[0];
  if (!ident.ok) { out.reject = 'IDENTITY'; return EXIT.REJECT; }
  const tn = await prisma.tenant.findUnique({ where: { id: receipt.tenantId }, select: { name: true } });
  if (!tn || tn.name !== setupRows(runId).tenant.name) { out.reject = 'TENANT_NAME'; return EXIT.REJECT; }
  const before = await prisma.user.findUnique({ where: { id: receipt.userId }, select: { tenantId: true, email: true, isActive: true, tokenVersion: true } });
  if (!before || before.tenantId !== receipt.tenantId || before.email !== receipt.userEmail) { out.reject = 'USER_NOT_IN_TENANT'; return EXIT.REJECT; }
  const tenantUsers = await prisma.user.count({ where: { tenantId: receipt.tenantId } });
  if (tenantUsers !== 1) { out.reject = 'TENANT_USER_COUNT'; return EXIT.REJECT; }
  out.before = { isActive: before.isActive, tokenVersion: before.tokenVersion };
  let r = { count: 0 };
  if (before.isActive === false) {
    out.zatenKapali = true;   // ikinci Kapat: yazma YOK (tokenVersion yeniden artırılmaz)
  } else {
    r = await prisma.user.updateMany({ where: { id: receipt.userId, tenantId: receipt.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
  }
  out.updated = r.count;
  const after = await prisma.user.findUnique({ where: { id: receipt.userId }, select: { isActive: true, tokenVersion: true } });
  const client = await prisma.client.findFirst({ where: { id: receipt.clientId, tenantId: receipt.tenantId }, select: { isActive: true, hasPortalAccess: true } });
  const portal = client ? await prisma.clientPortalUser.findUnique({ where: { clientId: receipt.clientId }, select: { isActive: true, tokenVersion: true } }) : null;
  out.after = after ? { isActive: after.isActive, tokenVersion: after.tokenVersion } : null;
  out.bilgi = { portalHesabi: portal ? { var: true, isActive: portal.isActive, tokenVersion: portal.tokenVersion } : { var: false },
    muvekkil: client ? { isActive: client.isActive, hasPortalAccess: client.hasPortalAccess } : null };
  const ok = out.zatenKapali
    ? r.count === 0 && !!after && after.isActive === false && after.tokenVersion === before.tokenVersion
    : r.count === 1 && !!after && after.isActive === false && after.tokenVersion === before.tokenVersion + 1;
  out.checks = [{ ad: out.zatenKapali ? 'kullanıcı zaten pasif — yazma YOK (yalnız sentetik kullanıcı)' : 'kullanıcı pasif + tokenVersion +1 (yalnız sentetik kullanıcı)', ok }];
  return ok ? EXIT.OK : EXIT.CLOSE_UNVERIFIED;
}

/** Personel giriş bilgisini YALNIZ yerel konsola çizer (stdout / stderr / dosya DEĞİL). */
async function showLogin(con, runId, pw) {
  const rows = setupRows(runId);
  await DISPLAY.show(con, ['', 'KURULUM DOĞRULANDI — sentetik personel giriş bilgisi (YALNIZ bu pencerede; bir yere yazmayın):',
    `  Kurum    : ${rows.tenant.slug}`, `  E-posta  : ${rows.user.email}`, `  Parola   : ${pw}`, '']);
}

async function main() {
  const env = process.env;
  const g = gates(env);
  const secrets = [env.DDK_LOGIN_PW, env.DDK_LIVE_GO_REF, env.AH_DATABASE_URL];
  const out = { record: RECORD_EVIDENCE, mode: env.DDK_MODE || null, startedAt: new Date().toISOString() };
  if (g.code !== EXIT.OK) {
    console.error(`REDDEDİLDİ: ${g.why} (veritabanına bağlanılmadı; yazma YOK)`);
    process.exitCode = g.code; return;
  }
  // Konsol, veritabanı bağlantısından ÖNCE açılır: açılamazsa hiçbir yazma yapılmadan durulur.
  let con = null;
  if (g.mode === 'kur' && g.display === 'conout') {
    try { con = DISPLAY.openConsole(); } catch (e) {
      console.error('REDDEDİLDİ: yerel konsol açılamadı (veritabanına bağlanılmadı; yazma YOK)'); process.exitCode = EXIT.REJECT; return;
    }
  }
  out.live = g.live; out.db = g.live ? 'canli' : 'sinama';
  if (g.mode === 'kur') { out.runId = g.runId; out.display = g.display; }
  let code = EXIT.ERROR; let prisma = null;
  try {
    prisma = AH.loadPrisma();
    const bcrypt = require(env.AH_BCRYPT_PATH);
    code = g.mode === 'kur' ? await kur(prisma, bcrypt, g, env, out) : await kapat(prisma, env, out);
  } catch (e) {
    out.error = e && e.name ? e.name : 'Error';
    code = EXIT.ERROR;
  } finally {
    if (prisma) { try { await prisma.$disconnect(); } catch (e) { /* yok sayılır */ } }
  }
  out.exitCode = code; out.finishedAt = new Date().toISOString();
  const text = JSON.stringify(out, null, 1);
  if (containsSecret(text, secrets)) {
    console.error('DUR: kanıt metninde sır bulundu — kanıt YAZILMADI'); process.exitCode = EXIT.EVIDENCE;
    if (con) DISPLAY.close(con); return;
  }
  try { writeJsonNew(env.DDK_EVID_FILE, out); } catch (e) { console.error(`kanıt yazılamadı (${e.code || e.name})`); if (code === EXIT.OK) code = EXIT.EVIDENCE; }
  for (const c of out.checks || []) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.ad}`);
  if (out.reject) console.log(`RET: ${out.reject} (yazma YOK)`);
  if (out.committed && code !== EXIT.OK) console.log('NOT: dört satır YAZILDI (işlem tamamlandı); kanıttaki kimliklere bakın');
  if (out.zatenKapali) console.log('NOT: kullanıcı zaten pasifti — yazma YOK');
  if (con) {
    if (code === EXIT.OK) {
      try { await showLogin(con, g.runId, env.DDK_LOGIN_PW); console.log('GÖSTERİM: giriş bilgisi yerel konsola çizildi'); }
      catch (e) { console.error('giriş bilgisi konsola çizilemedi — sentetik kullanıcı Kapat ile kapatılmalı'); code = EXIT.DISPLAY; }
    }
    DISPLAY.close(con);
  }
  console.log(`SONUC: ${g.mode} çıkış ${code}`);
  process.exitCode = code;
}

module.exports = { gates, dbIdentity, setupRows, containsSecret, EXIT, GO_RE, LIVE_DB, TEST_DB, MAIL_DOMAIN, RECORD_RECEIPT, RECORD_EVIDENCE };
if (require.main === module) { main(); }
