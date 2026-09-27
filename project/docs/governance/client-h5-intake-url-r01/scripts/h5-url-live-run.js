'use strict';
/*
 * H5-URL — DAR CANLI KABUL (R02): `PUBLIC_INTAKE_BASE_URL` ile üretilen intake bağlantısının MUTLAK, beklenen
 * HTTPS origin'e ait ve yerelde + dış zincirde geçerli olması; ardından bağlantının İPTALİ ve erişim kapanışı.
 *
 * R02 DÜZELTMELERİ (kaynaktan doğrulandı, 2026-09-27):
 *   K-1 R01 `POST /client-intake-links/case/:caseId` çağırıyordu. O uç `create()` → `notifyLink()` →
 *       `dispatcher.dispatch()` zincirini koşar; yani GÖNDERİM yapar. R02 yalnız GÖNDERİMSİZ ucu çağırır:
 *       `POST /clients/:clientId/cases/:caseId/intake-links` → `createForClientWorkspace()` (dispatch yok).
 *       `create-and-deliver` ucu ÇAĞRILMAZ. `clientId` gövdede değil URL'dedir.
 *   K-2 R01 kapanışı kullanıcıları pasifleştirip Case'i CLOSED yapıyordu, bağlantıyı İPTAL ETMİYORDU. Public
 *       doğrulayıcı yalnız bağlantının status/expiresAt/useCount alanlarına bakar; Case ya da kullanıcı durumuna
 *       bakmaz. R02 kapanışta önce yetkili uçla (`POST /client-intake-links/:id/revoke`) iptal eder, DB'de
 *       REVOKED'u ve public 404'ü ölçer, SONRA kullanıcı/dosya kapanışını yapar.
 *
 * ÖLÇER  : U-00 ölçüm geçerliliği · U-01 mutlak URL · U-02 URL = <base>/intake/<ham token> · U-URL URL kapısı
 *          (beklenen HTTPS origin + yol) · U-03a dış HTTPS sayfa · U-03b-L YEREL API · U-03b-D DIŞ HTTPS API ·
 *          U-04 okuma ucunda ham token yok · U-REV-DB iptal (DB) · U-REV-PUB-L / -D iptal sonrası public 404 ·
 *          U-CLOSE kullanıcı/dosya kapanışı · U-ISO sayım dağılımı.
 * YAPMAZ : gönderim YOK · public SUBMIT (POST) YOK · yönlendirme İZLENMEZ · URL kapısı geçmeden token içeren
 *          HİÇBİR adrese istek YOK · 503/zaman aşımı için neden TEŞHİS EDİLMEZ ve PASS SAYILMAZ · otomatik
 *          kabul tekrarı YOK.
 * SIR    : ham token, parola, Authorization/JWT, DB URL ve GO ref hiçbir çıktıya yazılmaz; konsol ve kanıt
 *          yazımı tek temizleyiciden geçer. Token yalnız sha256 + uzunluk olarak raporlanır.
 * MODLAR : H5U_MODE=run (varsayılan) · H5U_MODE=recover (yalnız kapanışı tamamlar; kabul ÖLÇÜTLERİ KOŞULMAZ).
 * ÇIKIŞ  : 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ (yazma yok)
 *          7 SONUÇ KANITI YAZILAMADI · 5 KULLANICI/DOSYA KAPANIŞI DOĞRULANMADI · 6 BAĞLANTI İPTALİ DOĞRULANMADI
 *          Öncelik: 6 > 5 > 7 > 1 > 2 > 3 > 0.
 *
 * R03 (inceleme düzeltmeleri, 2026-09-27):
 *   F-1 Oluşturma sonucu BELİRSİZSE (zaman aşımı, 5xx, 201 ama link id yok) DB'de kayıt bulunamaması iptal kanıtı
 *       DEĞİLDİR: istek sunucuda sürüyor olabilir ve kayıt kapanış sorgularından SONRA oluşabilir. Bu durumda
 *       iptal DOĞRULANMADI sayılır (çıkış 6) ve kurtarma gereksinimi korunur. Bekleme eklenmez; bekleme kanıt değildir.
 *       Makbuz, oluşturma isteğinden ÖNCE `createAttemptedAt` ile güncellenir; Recover aynı kuralı uygular.
 *   F-2 Makbuz yazılamazsa (ya da oluşturma denemesi makbuza işlenemezse) oturum açma/oluşturma adımına GEÇİLMEZ;
 *       o ana kadar kurulan sentetik veri yine kapatılır. Sonuç kanıtı yazılamazsa çıkış 0 OLAMAZ (7); 6 ve 5 korunur.
 */
const fs = require('fs'); const crypto = require('crypto');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { assertReceiptIdentity } = require('../../client-live-acceptance-i12-r01/scripts/i12-live-identity');
const { L, isolationFingerprint, closeAccess, dbName } = I13;

// ------------------------------------------------------------------ sır temizleyici
const SECRETS = new Set();
function addSecret(s) { if (s !== undefined && s !== null && String(s).length >= 6) SECRETS.add(String(s)); }
function scrub(v) {
  let s = typeof v === 'string' ? v : (v instanceof Error ? String(v.message) : (() => { try { return JSON.stringify(v); } catch (e) { return String(v); } })());
  for (const k of SECRETS) if (s.includes(k)) s = s.split(k).join('[GİZLİ]');
  return s;
}
const _log = console.log.bind(console); const _err = console.error.bind(console);
console.log = (...a) => _log(...a.map(scrub));
console.error = (...a) => _err(...a.map(scrub));
function writeJson(file, obj) { fs.writeFileSync(file, scrub(JSON.stringify(obj, null, 1)), 'utf8'); }

/** Hata özeti: Prisma çok satırlı hata verir ve asıl DB nedeni SON satırdadır; ilk + son satır korunur. */
function errText(e, n) {
  const lines = String((e && e.message) || e).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const t = lines.length > 1 ? `${lines[0]} … ${lines[lines.length - 1]}` : (lines[0] || 'bilinmeyen hata');
  return t.slice(0, n || 300);
}
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').toUpperCase();
const RECEIPT_RECORD = 'H5-URL-SETUP-RECEIPT';
const DISPATCH_ENDPOINT_FORBIDDEN = [/\/client-intake-links\/case\//, /\/create-and-deliver/];

function expectedOriginOf(v) {
  let u; try { u = new URL(String(v || '')); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  return u.origin;
}

function commonGates(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { code: 1, why: 'NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS doğrulaması kapalıyken koşulmaz' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.H5U_EXPECT_DB || env.H5U_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.H5U_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (!env.H5U_API_BASE || env.H5U_API_BASE !== env.H5U_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  return null;
}

function runGates(env) {
  const c = commonGates(env); if (c) return c;
  if (env.H5U_LIVE_CONFIRM !== '1') return { code: 3, why: 'H5U_LIVE_CONFIRM=1 gerekli' };
  if (!(env.H5U_LIVE_GO_REF && /^OWNER-GO-CLIENT-H5URL-\d{8}-R\d{2}$/.test(env.H5U_LIVE_GO_REF.trim()))) {
    return { code: 3, why: 'H5U_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-H5URL-YYYYMMDD-RNN) gerekli' };
  }
  const runId = String(env.H5U_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'H5U_RUNID 8 hex olmalı' };
  if (env.H5U_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId ile eşleşmiyor' };
  const origin = expectedOriginOf(env.H5U_EXPECT_BASE_URL);
  if (!origin) return { code: 4, why: 'H5U_EXPECT_BASE_URL https:// şemalı, yolsuz bir origin olmalı' };
  return { code: 0, runId, origin };
}

function timeoutOf(name, dflt) { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n : dflt; }

/** Süre sınırlı GET; yönlendirme İZLENMEZ. Hata metni kaydedilmez (URL içerebilir) — yalnız sınıf + kod. */
async function boundedGet(url, timeoutMs) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctl.signal });
    try { await r.arrayBuffer(); } catch (e) { /* gövde okunamadı: durum kodu yine geçerli */ }
    return { status: r.status };
  } catch (e) {
    const timedOut = !!(e && e.name === 'AbortError');
    const code = e && e.cause && e.cause.code ? String(e.cause.code) : null;
    return { status: null, timedOut, error: timedOut ? `zaman aşımı (${timeoutMs} ms)` : `bağlantı hatası${code ? ` (${code})` : ''}` };
  } finally { clearTimeout(t); }
}

/** Geçerlilik ölçümü sınıflandırması: 200 PASS · 503/429/zaman aşımı/bağlantı ÖLÇÜLEMEYEN · diğer FAIL. */
function judgeValid(R, id, desc, r) {
  if (r.status === 200) return R.check(id, desc, true, 'HTTP 200');
  if (r.status === null) return R.unmeasured(id, desc, r.error);
  if (r.status === 503) return R.unmeasured(id, desc, 'HTTP 503 — nedeni bu koşumda ÖLÇÜLMEDİ');
  if (r.status === 429) return R.unmeasured(id, desc, 'HTTP 429 — hız sınırı; geçerlilik ÖLÇÜLEMEDİ');
  if (r.status >= 300 && r.status < 400) return R.check(id, desc, false, `HTTP ${r.status} — yönlendirme döndü (İZLENMEDİ)`);
  return R.check(id, desc, false, `HTTP ${r.status}`);
}
/** İptal sonrası ölçümü: 404 PASS · 200 FAIL (iptal etkisiz) · 503/429/zaman aşımı ÖLÇÜLEMEYEN · diğer FAIL. */
function judgeRevoked(R, id, desc, r) {
  if (r.status === 404) return { v: R.check(id, desc, true, 'HTTP 404'), live: false };
  if (r.status === 200) return { v: R.check(id, desc, false, 'HTTP 200 — bağlantı iptale rağmen GEÇERLİ'), live: true };
  if (r.status === null) return { v: R.unmeasured(id, desc, r.error), live: null };
  if (r.status === 503) return { v: R.unmeasured(id, desc, 'HTTP 503 — nedeni bu koşumda ÖLÇÜLMEDİ'), live: null };
  if (r.status === 429) return { v: R.unmeasured(id, desc, 'HTTP 429 — hız sınırı'), live: null };
  return { v: R.check(id, desc, false, `HTTP ${r.status}`), live: null };
}

/**
 * Bu koşuma ait bağlantıları YETKİLİ uçla iptal eder ve DB'de doğrular. Yalnız kimlik bağı doğrulanmış
 * sentetik tenant/case/client üçlüsünde arar; oluşturma yanıtı alınamadıysa da (zaman aşımı) kayıt
 * OLUŞMUŞ OLABİLİR varsayımıyla buradan bulunur. Kimlik doğrulanmazsa HİÇBİR çağrı/yazma yapılmaz.
 */
async function revokeOwnLinks(prisma, base, receipt, session, expect) {
  const exp = expect || { attempted: false, outcome: null, linkId: null };
  const res = { ok: false, identity: null, linksBefore: [], foreignTenantLinks: null, revokeCalls: [], linksAfter: [], note: null,
    createExpectation: { attempted: !!exp.attempted, outcome: exp.outcome || null, linkId: exp.linkId ? 'VAR' : 'YOK' }, createProof: null };
  const ident = await assertReceiptIdentity(prisma, receipt);
  res.identity = ident.ok ? 'OK' : ident.reason;
  if (!ident.ok) { res.note = 'kimlik bağı DOĞRULANMADI — hiçbir iptal/yazma yapılmadı'; return res; }
  const where = { tenantId: receipt.tenantId, caseId: receipt.caseId, clientId: receipt.clientId };
  const sel = { id: true, status: true, tenantId: true, caseId: true, clientId: true };
  const before = await prisma.clientIntakeLink.findMany({ where, select: sel });
  res.linksBefore = before.map((l) => ({ id: l.id, status: l.status }));
  res.foreignTenantLinks = receipt.foreignTenantId ? await prisma.clientIntakeLink.count({ where: { tenantId: receipt.foreignTenantId } }) : 0;
  const tmo = timeoutOf('H5U_REVOKE_TIMEOUT_MS', 30000);
  for (const l of before.filter((x) => x.status === 'ACTIVE')) {
    const call = { id: l.id, attempts: [] };
    if (!session || !session.token) { call.attempts.push('oturum YOK — yetkili uç çağrılamadı'); res.revokeCalls.push(call); continue; }
    for (let i = 0; i < 2; i++) {
      const r = await L.AH.httpJson('POST', `${base}/client-intake-links/${l.id}/revoke`, { token: session.token, timeoutMs: tmo });
      call.attempts.push(r.indeterminate ? 'belirsiz (zaman aşımı/taşıma)' : `HTTP ${r.status}`);
      if (!r.indeterminate && (r.status === 200 || r.status === 201)) break;
      // Başarı gelmediyse sunucu işlemi yine de tamamlanmış olabilir: DB'den ÖLÇ, tahmin etme.
      const now = await prisma.clientIntakeLink.findUnique({ where: { id: l.id }, select: { status: true } });
      if (!now || now.status !== 'ACTIVE') { call.attempts.push(`DB durumu=${now ? now.status : 'YOK'}`); break; }
      // 4xx istemci hatası tekrar edilmez; yalnız belirsiz/5xx için TEK tekrar.
      if (!r.indeterminate && r.status < 500) break;
    }
    res.revokeCalls.push(call);
  }
  const after = await prisma.clientIntakeLink.findMany({ where, select: sel });
  res.linksAfter = after.map((l) => ({ id: l.id, status: l.status }));
  const ownOk = after.every((l) => l.tenantId === receipt.tenantId && l.caseId === receipt.caseId && l.clientId === receipt.clientId);
  // F-1: bu koşum TEK oluşturma isteği gönderir. Sonuç belirsizse kaydın VAR olduğu görülmeden iptal kanıtlanamaz:
  // boş sorgu "hiç oluşmadı" demek değildir, istek sunucuda hâlâ sürüyor olabilir.
  if (exp.outcome === 'confirmed') {
    res.createProof = after.length === 1 && after[0].id === exp.linkId;
    if (!res.createProof) res.note = `oluşturma yanıtındaki bağlantı DB'de tek kayıt olarak BULUNAMADI (kayıt sayısı=${after.length})`;
  } else if (exp.attempted && exp.outcome !== 'none') {
    res.createProof = after.length >= 1;
    if (!res.createProof) {
      res.note = 'oluşturma sonucu BELİRSİZ ve DB\'de kayıt YOK — istek sunucuda sürüyor olabilir, kayıt SONRADAN oluşabilir; '
        + 'iptal DOĞRULANAMADI (bekleme kanıt değildir)';
    }
  } else {
    res.createProof = true; // oluşturma denenmedi ya da sunucu kesin olarak reddetti (4xx)
  }
  res.ok = ownOk && after.every((l) => l.status !== 'ACTIVE') && res.foreignTenantLinks === 0 && res.createProof === true;
  return res;
}

function recoveryAdvice(out, receiptPath) {
  const need = [];
  if (!(out.linkRevoke && out.linkRevoke.ok)) need.push('BAĞLANTI İPTALİ doğrulanmadı — sentetik bağlantı AÇIK kalmış olabilir');
  if (!(out.closure && out.closure.ok)) need.push('KULLANICI/DOSYA KAPANIŞI doğrulanmadı');
  if (need.length === 0) return { gerekli: false };
  let onDisk = false; try { onDisk = !!receiptPath && fs.existsSync(receiptPath); } catch (e) { onDisk = false; }
  if (!onDisk) need.push('makbuz DİSKTE YOK — Recover koşulamaz; sentetik kimlikler bu kanıtın `receipt` alanındadır, elle kapanış gerekir');
  return {
    gerekli: true, neden: need, makbuz: receiptPath || null, makbuzDiskte: onDisk,
    adim: 'Owner kurtarma bloğunu `-Mode Recover -ReceiptFile <makbuz>` ile BİR KEZ koşar. Kurtarma kabul ölçütlerini '
      + 'TEKRARLAMAZ; yalnız makbuz kimliği doğrulanmış sentetik tenantta bağlantıyı yetkili uçla iptal eder ve kapanışı tamamlar.',
  };
}

/** F-2: sonuç kanıtı yazılamazsa çıkış 0 OLAMAZ → 7. İptal (6) ve kapanış (5) hataları önceliğini KORUR. */
function writeEvidenceOrDemote(file, out) {
  try { writeJson(file, out); return out.exitCode; }
  catch (e) {
    console.error(`SONUÇ KANITI YAZILAMADI: ${errText(e, 160)}`);
    if (out.exitCode === 6 || out.exitCode === 5) return out.exitCode;
    console.error('  çıkış 7: kanıt olmadan sonuç doğrulanamaz; 0 VERİLMEZ');
    return 7;
  }
}

function exitCodeOf(out, s) {
  if (!(out.linkRevoke && out.linkRevoke.ok)) return 6;
  if (!(out.closure && out.closure.ok)) return 5;
  if (out.fatal) return 1;
  if (s.fail > 0) return 2;
  if (s.unmeasured > 0) return 3;
  return 0;
}

// ------------------------------------------------------------------ kapanış (her iki modda ortak)
async function finalizeClosure(R, prisma, base, origin, receipt, session, raw, urlGateOk, expect) {
  const out = {};
  if (!receipt) {
    out.linkRevoke = { ok: true, nothingCreated: true, note: 'kurulum makbuzu yok — bu koşum tenant/bağlantı oluşturmadı' };
    out.closure = { ok: true, nothingToClose: true, wroteNothing: true };
    return out;
  }
  // 1) ÖNCE bağlantı iptali (kullanıcılar henüz aktif; yetkili uç JWT ister)
  try { out.linkRevoke = await revokeOwnLinks(prisma, base, receipt, session, expect); }
  catch (e) { out.linkRevoke = { ok: false, reason: `iptal adımı hata verdi: ${errText(e)}` }; }
  R.check('U-REV-DB', 'bu koşuma ait TÜM bağlantılar DB\'de ACTIVE DEĞİL (iptal), oluşturma sonucu kayıtla KANITLI ve yabancı tenantta bağlantı YOK', !!out.linkRevoke.ok,
    `kimlik=${out.linkRevoke.identity || '-'} · önce=${JSON.stringify(out.linkRevoke.linksBefore || [])} · sonra=${JSON.stringify(out.linkRevoke.linksAfter || [])} · yabancı=${out.linkRevoke.foreignTenantLinks}`
    + ` · oluşturma=${JSON.stringify(out.linkRevoke.createExpectation || null)} kanıt=${out.linkRevoke.createProof}${out.linkRevoke.note ? ` · NOT: ${out.linkRevoke.note}` : ''}`);
  // 2) public 404 — yalnız ham token biliniyorsa VE URL kapısı geçtiyse
  if (raw && urlGateOk) {
    const tmo = timeoutOf('H5U_LOCAL_TIMEOUT_MS', 15000);
    const tmoX = timeoutOf('H5U_EXTERNAL_TIMEOUT_MS', 15000);
    const l = judgeRevoked(R, 'U-REV-PUB-L', 'iptal sonrası YEREL public API aynı token için 404', await boundedGet(`${base}/public/intake/${raw}`, tmo));
    const d = judgeRevoked(R, 'U-REV-PUB-D', 'iptal sonrası DIŞ HTTPS public API aynı token için 404', await boundedGet(`${origin}/api/public/intake/${raw}`, tmoX));
    if (l.live === true || d.live === true) { out.linkRevoke.ok = false; out.linkRevoke.note = 'public uç iptale rağmen 200 döndü'; }
  } else {
    const why = raw ? 'URL kapısı geçmedi — token içeren adrese istek GÖNDERİLMEDİ' : 'ham token bu koşumda alınmadı — public 404 ölçülemez (DB ölçümü geçerli)';
    R.unmeasured('U-REV-PUB-L', 'iptal sonrası YEREL public API 404', why);
    R.unmeasured('U-REV-PUB-D', 'iptal sonrası DIŞ HTTPS public API 404', why);
  }
  // 3) SONRA kullanıcı/dosya kapanışı — iptal başarısız olsa da ÇALIŞIR (hata yolunda da temizlik)
  try { out.closure = await closeAccess(prisma, receipt); }
  catch (e) { out.closure = { ok: false, reason: errText(e) }; }
  R.check('U-CLOSE', 'kullanıcılar pasif (tokenVersion++) + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
  return out;
}

// ------------------------------------------------------------------ RUN
async function runMode() {
  const g = runGates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const runId = g.runId; const origin = g.origin; const base = process.env.H5U_API_BASE;
  const webBase = String(process.env.H5U_EXPECT_BASE_URL).replace(/\/+$/, '');
  const pw = process.env.H5U_LIVE_LOGIN_PW; const receiptPath = process.env.H5U_RECEIPT; const evid = process.env.H5U_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: H5U_LIVE_LOGIN_PW + H5U_RECEIPT + H5U_EVID_FILE gerekli.'); process.exit(2); }
  addSecret(pw); addSecret(process.env.H5U_LIVE_GO_REF); addSecret(process.env.AH_DATABASE_URL);

  const R = new L.Results();
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'H5-URL-LIVE-RUN', revision: 'R03', runId, apiBase: base, expectedOrigin: origin, calledEndpoints: [] };
  let receipt = null; let fatal = null; let session = null; let raw = null; let urlGateOk = false;
  const expect = { attempted: false, outcome: null, linkId: null };
  const call = (m, p) => out.calledEndpoints.push(`${m} ${p.replace(base, '<API>')}`);
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    receipt = { record: RECEIPT_RECORD, runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, foreignClientId: st.foreignClientId, caseId: st.caseId,
      elevUserId: st.actors.elev1.id, elevEmail: st.actors.elev1.email, createdAt: new Date().toISOString() };
    out.receipt = receipt; // yalnız kimlikler; makbuz diske yazılamazsa elle kurtarma için kanıtta kalır
    // F-2: makbuz diske yazılamazsa Recover mümkün olmaz — oluşturma adımına GEÇİLMEZ; finally kurulumu kapatır.
    try { writeJson(receiptPath, receipt); } catch (e) {
      out.receiptWriteError = errText(e, 160);
      throw new Error('makbuz yazılamadı — oturum açma ve bağlantı oluşturma adımlarına GEÇİLMEDİ');
    }

    call('POST', `${base}/auth/login`);
    session = await L.AH.login(base, st.actors.elev1.email, pw, st.slug);
    if (session && session.token) addSecret(session.token);
    if (!session.ok) throw new Error(`elev1 oturum açamadı (HTTP ${session.status ?? 'belirsiz'})`);
    const sameRole = st.actors.user.role === st.actors.elev1.role && st.actors.user.role !== 'ADMIN';
    R.check('U-00', 'ÖLÇÜM GEÇERLİ: elev1 ADMIN değil, yetki PARTNER bağından gelir', sameRole, `user:${st.actors.user.role} elev1:${st.actors.elev1.role}`);

    // GÖNDERİMSİZ bağlantı üretimi — createForClientWorkspace (dispatch YOK). clientId URL'de.
    const createPath = `${base}/clients/${st.clientId}/cases/${st.caseId}/intake-links`;
    if (DISPATCH_ENDPOINT_FORBIDDEN.some((re) => re.test(createPath))) throw new Error('gönderim yapan uç seçildi — DURDU');
    // F-1: oluşturma denemesi istekten ÖNCE makbuza işlenir; işlenemezse istek GÖNDERİLMEZ.
    const attempted = Object.assign({}, receipt, { createAttemptedAt: new Date().toISOString() });
    try { writeJson(receiptPath, attempted); } catch (e) {
      out.receiptWriteError = errText(e, 160);
      throw new Error('oluşturma denemesi makbuza işlenemedi — bağlantı oluşturma isteği GÖNDERİLMEDİ');
    }
    receipt = attempted; out.receipt = receipt;
    expect.attempted = true; expect.outcome = 'uncertain';
    call('POST', createPath);
    const cr = await L.AH.httpJson('POST', createPath, { token: session.token, body: { scope: ['ADDRESS'] }, timeoutMs: timeoutOf('H5U_CREATE_TIMEOUT_MS', 30000) });
    const d = (cr && cr.body && cr.body.data) || {};
    const url = typeof d.intakeUrl === 'string' ? d.intakeUrl : null;
    raw = typeof d.rawToken === 'string' ? d.rawToken : null;
    if (raw) addSecret(raw);
    const linkId = d.link && d.link.id ? d.link.id : null;
    // Sonuç sınıfı: 201 + link id = kesin · 4xx = sunucu kesin reddetti · zaman aşımı/taşıma/5xx/eksik yanıt = BELİRSİZ.
    expect.outcome = (!cr.indeterminate && cr.status === 201 && linkId) ? 'confirmed'
      : (!cr.indeterminate && cr.status >= 400 && cr.status < 500) ? 'none' : 'uncertain';
    expect.linkId = linkId;
    try { writeJson(receiptPath, Object.assign({}, receipt, { createOutcome: expect.outcome, createLinkId: linkId })); receipt = Object.assign({}, receipt, { createOutcome: expect.outcome, createLinkId: linkId }); out.receipt = receipt; }
    catch (e) { out.receiptOutcomeWriteError = errText(e, 160); } // en iyi çaba: Recover yazılamazsa BELİRSİZ kuralını uygular
    out.create = { status: cr.status, indeterminate: !!cr.indeterminate, outcome: expect.outcome, hasUrl: !!url, hasRawToken: !!raw, linkId: linkId ? 'VAR' : 'YOK',
      rawTokenSha256: raw ? sha(raw) : null, rawTokenLength: raw ? raw.length : 0 };
    if (cr.indeterminate || cr.status !== 201 || !url || !raw) {
      const why = cr.indeterminate
        ? 'oluşturma yanıtı ALINAMADI (zaman aşımı/taşıma) — kayıt OLUŞMUŞ OLABİLİR; kapanışta sentetik kimliklerle araştırılır'
        : `bağlantı üretilemedi (HTTP ${cr.status})`;
      for (const [id, desc] of [['U-01', 'mutlak URL'], ['U-02', 'URL = base + /intake/<token>'], ['U-URL', 'URL kapısı'],
        ['U-03a', 'DIŞ HTTPS sayfa'], ['U-03b-L', 'YEREL API geçerli'], ['U-03b-D', 'DIŞ HTTPS API geçerli'], ['U-04', 'okuma ucunda ham token yok']]) {
        R.unmeasured(id, desc, why);
      }
    } else {
      let parsed = null; try { parsed = new URL(url); } catch (e) { parsed = null; }
      const absolute = !!parsed && /^https?:$/.test(parsed.protocol) && !!parsed.host && !url.includes('\\');
      R.check('U-01', 'intakeUrl MUTLAK (şema + host) ve ters bölü içermez', absolute,
        `şema=${parsed ? parsed.protocol : 'YOK'} · host=${parsed ? parsed.host : 'YOK'} · uzunluk=${url.length}`);
      const expected = `${webBase}/intake/${raw}`;
      R.check('U-02', 'intakeUrl = <PUBLIC_INTAKE_BASE_URL>/intake/<ham token>', url === expected,
        `eşit=${url === expected} · beklenen ön ek=${webBase}/intake/ · token sha256=${sha(raw).slice(0, 16)}`);
      urlGateOk = absolute && url === expected && parsed.protocol === 'https:' && parsed.origin === origin
        && parsed.pathname === `/intake/${raw}` && !parsed.search && !parsed.hash;
      R.check('U-URL', 'URL KAPISI: https + beklenen origin + /intake/<token> (geçmezse token içeren adrese istek YOK)', urlGateOk,
        `origin eşit=${parsed ? parsed.origin === origin : false} · https=${parsed ? parsed.protocol === 'https:' : false} · yol=${parsed ? (parsed.pathname === `/intake/${raw}` ? 'doğru' : 'FARKLI') : 'YOK'}`);
      if (!urlGateOk) {
        for (const [id, desc] of [['U-03a', 'DIŞ HTTPS sayfa'], ['U-03b-L', 'YEREL API geçerli'], ['U-03b-D', 'DIŞ HTTPS API geçerli']]) {
          R.unmeasured(id, desc, 'URL kapısı geçmedi — token içeren adrese istek GÖNDERİLMEDİ');
        }
      } else {
        const tmo = timeoutOf('H5U_LOCAL_TIMEOUT_MS', 15000); const tmoX = timeoutOf('H5U_EXTERNAL_TIMEOUT_MS', 15000);
        call('GET', '<DIŞ>/intake/<token>');
        judgeValid(R, 'U-03a', 'DIŞ HTTPS: müvekkile verilen adres (sayfa) 200', await boundedGet(url, tmoX));
        call('GET', `${base}/public/intake/<token>`);
        judgeValid(R, 'U-03b-L', 'YEREL: API /public/intake/<token> 200 (bağlantı geçerli)', await boundedGet(`${base}/public/intake/${raw}`, tmo));
        call('GET', '<DIŞ>/api/public/intake/<token>');
        judgeValid(R, 'U-03b-D', 'DIŞ HTTPS: /api/public/intake/<token> 200 (tünel + kenar zinciri)', await boundedGet(`${origin}/api/public/intake/${raw}`, tmoX));
      }
      if (!linkId) {
        R.unmeasured('U-04', 'okuma ucunda ham token yok', 'link id yanıtta yok');
      } else {
        call('GET', `${base}/client-intake-links/<id>`);
        const rd = await L.AH.httpJson('GET', `${base}/client-intake-links/${linkId}`, { token: session.token });
        const leaked = JSON.stringify(rd.body || {}).includes(raw);
        R.check('U-04', 'okuma ucunda HAM TOKEN yok', rd.status === 200 && !leaked, `okuma HTTP ${rd.status} · ham token görünüyor=${leaked}`);
      }
    }
  } catch (e) { fatal = String((e && e.message) || e); }
  finally {
    try {
      const fin = await finalizeClosure(R, prisma, base, origin, receipt, session, raw, urlGateOk, expect);
      if (receipt && receipt.tenantId) out.calledEndpoints.push('POST <API>/client-intake-links/<id>/revoke (kapanış, bağlantı başına)');
      Object.assign(out, fin);
    } catch (e) { out.linkRevoke = out.linkRevoke || { ok: false, reason: 'kapanış çerçevesi hata verdi' }; out.closure = out.closure || { ok: false, reason: String((e && e.message) || e).slice(0, 160) }; }
    out.dispatchEndpointCalled = out.calledEndpoints.some((c) => DISPATCH_ENDPOINT_FORBIDDEN.some((re) => re.test(c)));
    try {
      const after = receipt ? await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]) : null;
      out.isolationAfter = after; const b = out.isolationBefore;
      if (after && b) R.check('U-ISO', 'sentetik OLMAYAN tenantların müvekkil/kullanıcı SAYI dağılımı değişmedi (tam veri bütünlüğü DEĞİLDİR)',
        after.digest === b.digest, `önce=${b.digest}/${b.tenants} sonra=${after.digest}/${after.tenants}`);
      else R.unmeasured('U-ISO', 'sayım dağılımı', 'ölçülemedi');
    } catch (e) { R.unmeasured('U-ISO', 'sayım dağılımı', `okunamadı: ${String(e.message || e).slice(0, 120)}`); }
    const s = R.summary(`H5-URL DAR CANLI KABUL R02 (runId=${runId})`);
    out.fatal = fatal; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    out.recovery = recoveryAdvice(out, receipt ? receiptPath : null);
    if (out.recovery.gerekli) console.error(`KURTARMA GEREKLİ: ${out.recovery.neden.join(' · ')}\n  ${out.recovery.adim}\n  makbuz: ${out.recovery.makbuz}`);
    out.exitCode = exitCodeOf(out, s);
    out.exitCode = writeEvidenceOrDemote(evid, out);
    await prisma.$disconnect().catch(() => {});
    process.exitCode = out.exitCode;
  }
}

// ------------------------------------------------------------------ RECOVER — kabul ölçütleri KOŞULMAZ
async function recoverMode() {
  const c = commonGates(process.env);
  if (c) { console.error(`REDDEDİLDİ: ${c.why}`); process.exit(c.code); }
  if (process.env.H5U_RECOVER_CONFIRM !== '1') { console.error('REDDEDİLDİ: H5U_RECOVER_CONFIRM=1 gerekli'); process.exit(3); }
  const base = process.env.H5U_API_BASE; const pw = process.env.H5U_LIVE_LOGIN_PW; const evid = process.env.H5U_EVID_FILE;
  const receiptPath = process.env.H5U_RECEIPT;
  if (!pw || !evid || !receiptPath) { console.error('REDDEDİLDİ: H5U_LIVE_LOGIN_PW + H5U_EVID_FILE + H5U_RECEIPT gerekli'); process.exit(2); }
  addSecret(pw); addSecret(process.env.AH_DATABASE_URL);
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error('REDDEDİLDİ: makbuz okunamadı'); process.exit(4); }
  if (!receipt || receipt.record !== RECEIPT_RECORD || !receipt.elevUserId || !receipt.elevEmail) { console.error('REDDEDİLDİ: makbuz biçimi/alanları eksik'); process.exit(4); }
  if (process.env.H5U_RUNID && String(process.env.H5U_RUNID).toLowerCase() !== String(receipt.runId).toLowerCase()) { console.error('REDDEDİLDİ: runId makbuzla eşleşmiyor'); process.exit(4); }

  const R = new L.Results();
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'H5-URL-RECOVER', revision: 'R03', runId: receipt.runId, note: 'kabul ölçütleri KOŞULMADI; yalnız kapanış tamamlandı' };
  let session = null;
  // F-1: Run'ın oluşturma beklentisi makbuzdan. Deneme işaretli ve sonuç kesin 'none' değilse, kayıt görülmeden iptal
  // kanıtlanmış SAYILMAZ (kayıt hâlâ oluşabilir).
  const attemptedFlag = !!receipt.createAttemptedAt;
  const expect = { attempted: attemptedFlag,
    outcome: receipt.createOutcome || (attemptedFlag ? 'uncertain' : null), linkId: receipt.createLinkId || null };
  out.createExpectationFromReceipt = { attempted: expect.attempted, outcome: expect.outcome };
  try {
    const ident = await assertReceiptIdentity(prisma, receipt);
    if (!ident.ok) { console.error(`REDDEDİLDİ: kimlik bağı doğrulanmadı (${ident.reason}) — HİÇBİR yazma yapılmadı`); await prisma.$disconnect().catch(() => {}); process.exit(4); }
    const active = await prisma.clientIntakeLink.count({ where: { tenantId: receipt.tenantId, caseId: receipt.caseId, clientId: receipt.clientId, status: 'ACTIVE' } });
    out.activeLinksAtStart = active;
    if (active > 0) {
      // Yetkili iptal JWT ister; ilk koşumun parolası süreçle birlikte YOK oldu. Makbuzdaki sentetik kullanıcıya
      // GEÇİCİ erişim verilir (yalnız kimliği doğrulanmış tenantta), sonra closeAccess bunu yeniden kapatır.
      const elev = await prisma.user.findFirst({ where: { id: receipt.elevUserId, tenantId: receipt.tenantId, email: receipt.elevEmail }, select: { id: true } });
      if (!elev) { console.error('REDDEDİLDİ: makbuzdaki kullanıcı sentetik tenantta bulunamadı — yazma yapılmadı'); await prisma.$disconnect().catch(() => {}); process.exit(4); }
      await prisma.user.update({ where: { id: elev.id }, data: { passwordHash: await bcrypt.hash(pw, 10), isActive: true } });
      out.temporaryAccess = 'makbuzdaki sentetik kullanıcıya geçici erişim verildi; kapanışta yeniden kapatıldı';
      session = await L.AH.login(base, receipt.elevEmail, pw, receipt.tenantSlug);
      if (session && session.token) addSecret(session.token);
    }
  } catch (e) { out.fatal = String((e && e.message) || e).slice(0, 200); }
  const fin = await finalizeClosure(R, prisma, base, null, receipt, session, null, false, expect);
  Object.assign(out, fin);
  const s = R.summary(`H5-URL KURTARMA (runId=${receipt.runId})`);
  out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
  // Kurtarmada public 404 ÖLÇÜLEMEZ (ham token bilinmiyor); çıkış yalnız kapanış ölçümlerine bağlıdır.
  out.exitCode = !(out.linkRevoke && out.linkRevoke.ok) ? 6 : !(out.closure && out.closure.ok) ? 5 : out.fatal ? 1 : 0;
  out.recovery = recoveryAdvice(out, receiptPath);
  if (out.recovery.gerekli) console.error(`KURTARMA HÂLÂ GEREKLİ: ${out.recovery.neden.join(' · ')}`);
  out.exitCode = writeEvidenceOrDemote(evid, out);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = out.exitCode;
}

if (require.main === module) {
  const mode = String(process.env.H5U_MODE || 'run').toLowerCase();
  if (mode === 'run') runMode();
  else if (mode === 'recover') recoverMode();
  else { console.error(`REDDEDİLDİ: bilinmeyen H5U_MODE '${mode}'`); process.exit(1); }
}

// EXTACC R01 (client-extacc-intake-chain-r01) aynı güvenceleri yeniden kullanır; yalnız dışa aktarım genişletildi,
// davranış DEĞİŞMEDİ.
module.exports = { expectedOriginOf, scrub, addSecret, DISPATCH_ENDPOINT_FORBIDDEN, exitCodeOf, errText, sha, writeJson,
  timeoutOf, boundedGet, judgeValid, judgeRevoked, revokeOwnLinks, recoveryAdvice, writeEvidenceOrDemote, finalizeClosure };
