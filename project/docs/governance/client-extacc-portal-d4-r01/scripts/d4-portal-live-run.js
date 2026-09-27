'use strict';
/*
 * EXTACC D-4 R01 — PORTAL GİRİŞİ CANLI KABULÜ (client-external-access-r01 §7 D-4) + portal erişim kapanışı.
 *
 * AKIŞ   : kurulum + makbuz → personel (elev1) ile sentetik müvekkile portal hesabı (`POST /portal/admin/create-user`;
 *          gönderim YOK) → koşucu kendi portal oturumunu alır (yerel) → dosya listesi yerel + dış HTTPS = yalnız bu koşumun
 *          dosyası → yanlış parola yerel + dış 401 → giriş sayfasının QR'ı + e-posta + GEÇİCİ PAROLA yalnız owner konsolunda →
 *          owner TELEFONDAN (mobil veri, gizli sekme) BİR KEZ giriş yapar ve listeyi görür → koşucu DB'den girişi SALT OKUMA
 *          algılar → kısa görüntüleme süresi → kapanış.
 * KAPANIŞ: yetkili uç `POST /portal/admin/disable-user` → DB (portal kullanıcısı pasif, tokenVersion arttı, müvekkil portal
 *          erişimi kapalı) → YENİ giriş yerel + dış 401 → koşumda alınmış MEVCUT oturumla korumalı uç yerel + dış 401 →
 *          personel/dosya kapanışı (closeAccess). Mevcut oturum reddedilmezse ÜRÜN BULGUSU yazılır ve kapanış PASS SAYILMAZ.
 * YAPMAZ : e-posta/SMS (forgot/reset-password çağrılmaz) · belge/mesaj yazma · telefondan başka cihaza geçiş · 503 teşhisi.
 * SIR    : geçici portal parolası, personel parolası, token'lar, GO ve DB URL hiçbir log/kanıta yazılmaz (H5 temizleyici);
 *          parola yalnız konsola (extacc-display.js, CONOUT$) çizilir.
 * ÇIKIŞ  : 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA KAPANIŞI ·
 *          6 PORTAL ERİŞİMİ KAPANDIĞI DOĞRULANMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0).
 */
const fs = require('fs'); const crypto = require('crypto');
const H5 = require('../../client-h5-intake-url-r01/scripts/h5-url-live-run');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { assertReceiptIdentity } = require('../../client-live-acceptance-i12-r01/scripts/i12-live-identity');
const DISPLAY = require('../../client-extacc-intake-chain-r01/scripts/extacc-display');
const { L, isolationFingerprint, closeAccess, dbName } = I13;
const { scrub, addSecret, expectedOriginOf, errText, writeJson, writeEvidenceOrDemote } = H5;

const RECEIPT_RECORD = 'EXTACC-D4-SETUP-RECEIPT';
const GO_RE = /^OWNER-GO-CLIENT-EXTACC-D4-\d{8}-R\d{2}$/;
// Gönderim yapabilecek ya da kapsam dışı portal yazma uçları — koşucu ÇAĞIRMAZ (kaynak + çağrı listesi denetimi).
const FORBIDDEN_PORTAL = [/\/portal\/forgot-password/, /\/portal\/reset-password/, /\/portal\/change-password/, /\/portal\/documents/, /\/portal\/messages/];

// CANLI SÜRELER SABİT (bağlı DB `hukuk_db` ise ortam yok sayılır); izole testler kısaltabilir.
const LIVE_PARAMS = Object.freeze({ D4_WAIT_MS: 20 * 60 * 1000, D4_POLL_MS: 5000, D4_VIEW_MS: 120000, D4_HTTP_TIMEOUT_MS: 15000, D4_CALL_TIMEOUT_MS: 30000 });
function effectiveParams(env) {
  const live = dbName(env.AH_DATABASE_URL || '') === 'hukuk_db' || (env.D4_EXPECT_DB || '') === 'hukuk_db';
  const p = { live };
  for (const k of Object.keys(LIVE_PARAMS)) { const v = Number(env[k]); p[k] = live ? LIVE_PARAMS[k] : (Number.isFinite(v) && v > 0 ? v : LIVE_PARAMS[k]); }
  return p;
}

function commonGates(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { code: 1, why: 'NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS doğrulaması kapalıyken koşulmaz' };
  const display = env.D4_DISPLAY || 'conout';
  if (display !== 'conout' && display !== 'none') return { code: 4, why: 'D4_DISPLAY conout|none olmalı' };
  if (display === 'none' && ((env.D4_EXPECT_DB || '') === 'hukuk_db' || dbName(env.AH_DATABASE_URL || '') === 'hukuk_db')) return { code: 4, why: 'D4_DISPLAY=none canlı DB ile kullanılamaz' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.D4_EXPECT_DB || env.D4_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.D4_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (!env.D4_API_BASE || env.D4_API_BASE !== env.D4_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  const origin = expectedOriginOf(env.D4_EXPECT_BASE_URL);
  if (!origin) return { code: 4, why: 'D4_EXPECT_BASE_URL https:// şemalı, yolsuz bir origin olmalı' };
  return null;
}
function runGates(env) {
  const c = commonGates(env); if (c) return c;
  if (env.D4_LIVE_CONFIRM !== '1') return { code: 3, why: 'D4_LIVE_CONFIRM=1 gerekli' };
  if (!(env.D4_LIVE_GO_REF && GO_RE.test(env.D4_LIVE_GO_REF.trim()))) return { code: 3, why: 'D4_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-EXTACC-D4-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.D4_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'D4_RUNID 8 hex olmalı' };
  if (env.D4_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId ile eşleşmiyor' };
  return { code: 0, runId, origin: expectedOriginOf(env.D4_EXPECT_BASE_URL), display: env.D4_DISPLAY || 'conout' };
}

/** Portal durumu (salt okuma): hesap + müvekkil erişim bayrağı. */
async function portalState(prisma, clientId) {
  const u = await prisma.clientPortalUser.findUnique({ where: { clientId }, select: { email: true, isActive: true, tokenVersion: true, loginCount: true, lastLoginAt: true } });
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { hasPortalAccess: true } });
  return { exists: !!u, email: u ? u.email : null, isActive: u ? u.isActive : null, tokenVersion: u ? u.tokenVersion : null, loginCount: u ? u.loginCount : null,
    lastLoginAt: u && u.lastLoginAt ? u.lastLoginAt.toISOString() : null, hasPortalAccess: c ? c.hasPortalAccess : null };
}
const caseListMatches = (body, caseId, fileNumber) => Array.isArray(body) && body.length === 1 && body[0] && body[0].id === caseId && body[0].fileNumber === fileNumber;

/**
 * PORTAL ERİŞİM KAPANIŞI — yetkili uç + DB + yeni giriş + MEVCUT oturum. Kimlik bağı doğrulanmazsa yazma YOK.
 * `session` personel oturumu (disable için), `portalToken` koşumda alınmış portal oturumu (mevcut oturum ölçümü).
 */
async function closePortal(R, prisma, base, origin, receipt, session, creds, portalToken, P, before) {
  const res = { ok: false, identity: null, disableCalls: [], productFinding: null };
  const ident = await assertReceiptIdentity(prisma, receipt);
  res.identity = ident.ok ? 'OK' : ident.reason;
  if (!ident.ok) { res.note = 'kimlik bağı DOĞRULANMADI — hiçbir yazma yapılmadı'; R.check('P-C1', 'portal erişimi yetkili uçla kapatıldı', false, res.note); return res; }
  const st0 = await portalState(prisma, receipt.clientId);
  res.before = st0;
  if (!st0.exists) { res.ok = true; res.note = 'portal hesabı hiç açılmadı'; R.check('P-C1', 'portal erişimi yetkili uçla kapatıldı', true, res.note); return res; }
  if (st0.isActive || st0.hasPortalAccess) {
    for (let i = 0; i < 2; i++) {
      if (!session || !session.token) { res.disableCalls.push('personel oturumu YOK'); break; }
      const r = await L.AH.httpJson('POST', `${base}/portal/admin/disable-user`, { token: session.token, body: { clientId: receipt.clientId }, timeoutMs: P.D4_CALL_TIMEOUT_MS });
      res.disableCalls.push(r.indeterminate ? 'belirsiz' : `HTTP ${r.status}`);
      if (!r.indeterminate && r.status >= 200 && r.status < 300) break;
      const now = await portalState(prisma, receipt.clientId);
      if (!now.isActive && !now.hasPortalAccess) { res.disableCalls.push('DB: zaten kapalı'); break; }
      if (!r.indeterminate && r.status < 500) break;
    }
  }
  const st1 = await portalState(prisma, receipt.clientId); res.after = st1;
  const dbOk = st1.isActive === false && st1.hasPortalAccess === false && typeof st1.tokenVersion === 'number' && typeof (before && before.tokenVersion) === 'number' && st1.tokenVersion > before.tokenVersion;
  R.check('P-C1', 'portal erişimi YETKİLİ uçla kapatıldı (admin/disable-user)', res.disableCalls.some((x) => /^HTTP 2\d\d$/.test(x)) || (!st0.isActive && !st0.hasPortalAccess), `çağrılar=${JSON.stringify(res.disableCalls)}`);
  R.check('P-C2', 'DB: portal kullanıcısı pasif · tokenVersion arttı · müvekkil portal erişimi kapalı', dbOk,
    `isActive=${st1.isActive} tokenVersion ${before ? before.tokenVersion : '?'}→${st1.tokenVersion} hasPortalAccess=${st1.hasPortalAccess}`);
  // YENİ giriş reddi (yerel + dış)
  const tmo = P.D4_HTTP_TIMEOUT_MS;
  const nl = creds ? await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const nd = creds ? await L.AH.httpJson('POST', `${origin}/api/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const judge401 = (id, desc, r) => {
    if (!r) return R.unmeasured(id, desc, 'kimlik bilgisi bu koşumda yok (Recover) — ölçülemez');
    if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı (zaman aşımı/taşıma)');
    if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`);
    return R.check(id, desc, r.status === 401, `HTTP ${r.status}`);
  };
  judge401('P-C3L', 'kapanış sonrası YENİ portal girişi YEREL 401', nl);
  judge401('P-C3D', 'kapanış sonrası YENİ portal girişi DIŞ HTTPS 401', nd);
  // MEVCUT oturum reddi (yerel + dış): koşumda alınmış portal token'ı ile korumalı uç
  const el = portalToken ? await L.AH.httpJson('GET', `${base}/portal/cases`, { token: portalToken, timeoutMs: tmo }) : null;
  const ed = portalToken ? await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: portalToken, timeoutMs: tmo }) : null;
  const judgeSession = (id, desc, r) => {
    if (!r) return R.unmeasured(id, desc, 'koşumda portal oturumu alınmadı — mevcut oturum ölçülemez');
    if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı (zaman aşımı/taşıma)');
    if (r.status === 200) { res.productFinding = 'ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra MEVCUT oturum korumalı uca erişmeye devam ediyor'; return R.check(id, desc, false, 'HTTP 200 — MEVCUT OTURUM KAPANMADI (ürün bulgusu)'); }
    if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`);
    return R.check(id, desc, r.status === 401, `HTTP ${r.status}`);
  };
  judgeSession('P-C4L', 'kapanış sonrası MEVCUT portal oturumu korumalı uçta YEREL 401', el);
  judgeSession('P-C4D', 'kapanış sonrası MEVCUT portal oturumu korumalı uçta DIŞ HTTPS 401', ed);
  const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
  res.ok = dbOk && ['P-C3L', 'P-C3D', 'P-C4L', 'P-C4D'].every((id) => v(id) === 'PASS' || (!creds && /P-C3/.test(id) && v(id) === 'UNMEASURED') || (!portalToken && /P-C4/.test(id) && v(id) === 'UNMEASURED'));
  if (res.productFinding) res.ok = false;
  return res;
}

function exitCodeOf(out, s) {
  if (!(out.portalClose && out.portalClose.ok)) return 6;
  if (!(out.closure && out.closure.ok)) return 5;
  if (out.fatal) return 1;
  if (s.fail > 0) return 2;
  if (s.unmeasured > 0) return 3;
  return 0;
}
function recoveryAdvice(out, receiptPath) {
  const need = [];
  if (!(out.portalClose && out.portalClose.ok)) need.push(out.portalClose && out.portalClose.productFinding ? 'PORTAL: mevcut oturum kapanmadı (ÜRÜN BULGUSU — Recover bunu düzeltemez; token 7 gün geçerli)' : 'PORTAL ERİŞİMİ kapandığı doğrulanmadı');
  if (!(out.closure && out.closure.ok)) need.push('PERSONEL/DOSYA KAPANIŞI doğrulanmadı');
  if (!need.length) return { gerekli: false };
  let onDisk = false; try { onDisk = !!receiptPath && fs.existsSync(receiptPath); } catch (e) { onDisk = false; }
  return { gerekli: true, neden: need, makbuz: receiptPath || null, makbuzDiskte: onDisk,
    adim: 'Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile BİR KEZ; kabul ölçütleri tekrarlanmaz.' };
}

// ------------------------------------------------------------------ RUN
async function runMode() {
  const g = runGates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const { runId, origin } = g; const base = process.env.D4_API_BASE;
  const pw = process.env.D4_LIVE_LOGIN_PW; const receiptPath = process.env.D4_RECEIPT; const evid = process.env.D4_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: D4_LIVE_LOGIN_PW + D4_RECEIPT + D4_EVID_FILE gerekli.'); process.exit(2); }
  addSecret(pw); addSecret(process.env.D4_LIVE_GO_REF); addSecret(process.env.AH_DATABASE_URL);
  const P = effectiveParams(process.env);
  let con = null;
  if (g.display === 'conout') { try { con = DISPLAY.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok — ${errText(e, 120)} (hiçbir yazma yapılmadı)`); process.exit(4); } }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const portalPw = 'D4p!' + crypto.randomBytes(12).toString('base64url'); addSecret(portalPw);
  const portalEmail = `portal-d4-${runId}@ah-harness.invalid`;
  const fileNumber = `I3-${runId}`;
  const out = { record: 'EXTACC-D4-PORTAL-LIVE-RUN', revision: 'R01', runId, apiBase: base, expectedOrigin: origin, params: P, calledEndpoints: [] };
  const call = (m, p) => out.calledEndpoints.push(`${m} ${p.replace(base, '<API>').replace(origin, '<DIŞ>')}`);
  let receipt = null; let fatal = null; let session = null; let portalToken = null; let stopped = null; let displayed = false; let loginSeen = false; let baseline = null;
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10));
    receipt = { record: RECEIPT_RECORD, runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId, clientId: st.clientId,
      foreignClientId: st.foreignClientId, caseId: st.caseId, elevUserId: st.actors.elev1.id, elevEmail: st.actors.elev1.email, portalEmail, createdAt: new Date().toISOString() };
    out.receipt = receipt;
    try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); throw new Error('makbuz yazılamadı — portal hesabı AÇILMADI'); }
    call('POST', `${base}/auth/login`);
    session = await L.AH.login(base, st.actors.elev1.email, pw, st.slug);
    if (session && session.token) addSecret(session.token);
    if (!session.ok) throw new Error(`elev1 oturum açamadı (HTTP ${session.status ?? 'belirsiz'})`);
    R.check('P-00', 'ÖLÇÜM GEÇERLİ: elev1 ADMIN değil', st.actors.elev1.role !== 'ADMIN', `elev1:${st.actors.elev1.role}`);

    // Portal hesabı — gönderim YOK (create-user yalnız kayıt + audit; kaynakta ve canlı dist'te doğrulandı)
    call('POST', `${base}/portal/admin/create-user`);
    const cu = await L.AH.httpJson('POST', `${base}/portal/admin/create-user`, { token: session.token, body: { clientId: st.clientId, email: portalEmail, password: portalPw }, timeoutMs: P.D4_CALL_TIMEOUT_MS });
    R.check('P-01', 'sentetik müvekkile portal hesabı yetkili uçla açıldı (gönderim yok)', !cu.indeterminate && cu.status >= 200 && cu.status < 300, cu.indeterminate ? 'yanıt alınamadı' : `HTTP ${cu.status}`);
    const s1 = await portalState(prisma, st.clientId);
    const p02 = s1.exists && s1.isActive === true && s1.hasPortalAccess === true && s1.email === portalEmail;
    R.check('P-02', 'DB: portal hesabı aktif · müvekkil portal erişimi açık · e-posta doğru', p02, `aktif=${s1.isActive} erişim=${s1.hasPortalAccess} e-posta eşit=${s1.email === portalEmail}`);
    if (!p02) stopped = 'portal hesabı beklenen durumda değil — giriş bilgisi GÖSTERİLMEDİ';

    if (!stopped) {
      // Koşucunun KENDİ portal oturumu (kapanışta "mevcut oturum" ölçümü için)
      call('POST', `${base}/portal/login`);
      const pl = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: portalEmail, password: portalPw }, timeoutMs: P.D4_HTTP_TIMEOUT_MS });
      portalToken = pl.body && typeof pl.body.token === 'string' ? pl.body.token : null; if (portalToken) addSecret(portalToken);
      R.check('P-03L', 'koşucu portal girişi YEREL 201 + oturum', !pl.indeterminate && pl.status === 201 && !!portalToken, pl.indeterminate ? 'yanıt yok' : `HTTP ${pl.status}`);
      if (portalToken) {
        call('GET', `${base}/portal/cases`);
        const cl = await L.AH.httpJson('GET', `${base}/portal/cases`, { token: portalToken, timeoutMs: P.D4_HTTP_TIMEOUT_MS });
        call('GET', '<DIŞ>/api/portal/cases');
        const cd = await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: portalToken, timeoutMs: P.D4_HTTP_TIMEOUT_MS });
        R.check('P-04L', 'dosya listesi YEREL 200 ve YALNIZ bu koşumun dosyası', cl.status === 200 && caseListMatches(cl.body, st.caseId, fileNumber), `HTTP ${cl.status} · kayıt=${Array.isArray(cl.body) ? cl.body.length : '-'} · eşleşme=${caseListMatches(cl.body, st.caseId, fileNumber)}`);
        if (cd.indeterminate || cd.status === 503) { R.unmeasured('P-04D', 'dosya listesi DIŞ HTTPS 200', cd.indeterminate ? 'yanıt yok' : 'HTTP 503 — neden UNKNOWN'); stopped = 'dış zincir ölçülemedi — giriş bilgisi GÖSTERİLMEDİ'; }
        else R.check('P-04D', 'dosya listesi DIŞ HTTPS 200 ve YALNIZ bu koşumun dosyası', cd.status === 200 && caseListMatches(cd.body, st.caseId, fileNumber), `HTTP ${cd.status} · eşleşme=${caseListMatches(cd.body, st.caseId, fileNumber)}`);
      }
      // Yanlış parola (yerel + dış) — hesabın kendisiyle, parola farklı
      const wrong = portalPw + 'x';
      call('POST', `${base}/portal/login (yanlış parola)`);
      const wl = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: portalEmail, password: wrong }, timeoutMs: P.D4_HTTP_TIMEOUT_MS });
      call('POST', '<DIŞ>/api/portal/login (yanlış parola)');
      const wd = await L.AH.httpJson('POST', `${origin}/api/portal/login`, { body: { email: portalEmail, password: wrong }, timeoutMs: P.D4_HTTP_TIMEOUT_MS });
      R.check('P-05L', 'yanlış parola YEREL 401', !wl.indeterminate && wl.status === 401, wl.indeterminate ? 'yanıt yok' : `HTTP ${wl.status}`);
      if (wd.indeterminate || wd.status === 503 || wd.status === 429) R.unmeasured('P-05D', 'yanlış parola DIŞ HTTPS 401', wd.indeterminate ? 'yanıt yok' : `HTTP ${wd.status} — neden UNKNOWN`);
      else R.check('P-05D', 'yanlış parola DIŞ HTTPS 401', wd.status === 401, `HTTP ${wd.status}`);
      const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
      if (!stopped && !['P-03L', 'P-04L', 'P-04D'].every((id) => v(id) === 'PASS')) stopped = 'portal girişi/dosya listesi koşucu tarafında doğrulanmadı — giriş bilgisi GÖSTERİLMEDİ';
    }

    if (!stopped) {
      baseline = await portalState(prisma, st.clientId); out.baseline = { loginCount: baseline.loginCount, tokenVersion: baseline.tokenVersion };
      if (con) {
        const qr = DISPLAY.renderQr(`${origin}/portal/login`);
        await DISPLAY.show(con, [
          '============ EXTACC D-4 — YALNIZ OWNER EKRANI (kayda ALINMAZ) ============',
          'TELEFON: Wi-Fi KAPALI, mobil veri AÇIK, gizli sekme. QR portal giriş sayfasını açar.', '', ...qr.lines, '', `${origin}/portal/login`, '',
          'Giriş bilgisi (yalnız bu koşum için; koşum sonunda devre dışı kalır):', `    E-posta : ${portalEmail}`, `    Parola  : ${portalPw}`, '',
          `Girişten sonra dosya listesinde YALNIZ şu dosya numarası görünmeli: ${fileNumber}`,
          `Girişi BİR KEZ yapın. Giriş algılanınca ${Math.round(P.D4_VIEW_MS / 1000)} sn inceleme süresi verilir; sonra erişim kapatılır ve ekran temizlenir.`,
          'Kapanıştan sonra telefonda sayfayı YENİLEYİN; oturumun kapandığını görün (owner beyanında sorulur).',
          `Bekleme: en fazla ${Math.round(P.D4_WAIT_MS / 60000)} dk.`,
        ]);
      }
      displayed = true;
      R.check('P-DISP', 'giriş bilgisi yalnız yerel konsola gösterildi', true, g.display === 'conout' ? 'CONOUT$' : 'gösterimsiz izole test');
      const t0 = Date.now();
      for (;;) {
        const s = await portalState(prisma, st.clientId);
        if (typeof s.loginCount === 'number' && s.loginCount > baseline.loginCount) { loginSeen = true; out.phoneLogin = { loginCountDelta: s.loginCount - baseline.loginCount }; break; }
        if (Date.now() - t0 >= P.D4_WAIT_MS) break;
        await new Promise((r) => setTimeout(r, P.D4_POLL_MS));
      }
      out.wait = { loginSeen, elapsedMs: Date.now() - t0, windowMs: P.D4_WAIT_MS };
      if (loginSeen) {
        R.check('P-WAIT', 'koşucu dışında BAŞARILI portal girişi pencere içinde görüldü (DB loginCount)', out.phoneLogin.loginCountDelta >= 1,
          `artış=${out.phoneLogin.loginCountDelta} · ~${Math.round((Date.now() - t0) / 1000)} sn (cihaz/ağ = owner beyanı)`);
        if (con) { try { await DISPLAY.show(con, ['', `Giriş algılandı. ${Math.round(P.D4_VIEW_MS / 1000)} sn sonra erişim kapatılacak; dosya listesini şimdi inceleyin.`]); } catch (e) { /* gösterim ikincil */ } }
        await new Promise((r) => setTimeout(r, P.D4_VIEW_MS));
      } else R.unmeasured('P-WAIT', 'başarılı portal girişi pencere içinde görüldü', 'giriş görülmedi — owner beyanı ile ayrılır (açılamadı / denenmedi / başarısız)');
    } else {
      for (const [id, desc] of [['P-DISP', 'giriş bilgisi gösterildi'], ['P-WAIT', 'başarılı portal girişi görüldü']]) R.unmeasured(id, desc, stopped);
    }
  } catch (e) { fatal = errText(e, 300); }
  finally {
    if (con) { try { await DISPLAY.clear(con); } catch (e) { out.displayClearError = errText(e, 120); } DISPLAY.close(con); }
    try {
      out.portalClose = receipt ? await closePortal(R, prisma, base, origin, receipt, session, { email: portalEmail, password: portalPw }, portalToken, P, baseline || (await portalState(prisma, receipt.clientId).catch(() => null)))
        : { ok: true, nothingCreated: true };
    } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
    try { out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true }; }
    catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
    if (receipt) R.check('U-CLOSE', 'personel kullanıcıları pasif (tokenVersion++) + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
    if (receipt) R.check('P-D9', 'PORTAL erişim kapanışı birleşik: DB kapalı + yeni giriş yerel/dış 401 + MEVCUT oturum yerel/dış 401 + personel/dosya kapanışı',
      !!(out.portalClose && out.portalClose.ok) && !!(out.closure && out.closure.ok), `portal=${!!(out.portalClose && out.portalClose.ok)} personel=${!!(out.closure && out.closure.ok)}${out.portalClose && out.portalClose.productFinding ? ' · ' + out.portalClose.productFinding : ''}`);
    out.productFinding = out.portalClose ? out.portalClose.productFinding || null : null;
    out.forbiddenEndpointCalled = out.calledEndpoints.some((c) => FORBIDDEN_PORTAL.some((re) => re.test(c)));
    try {
      const after = receipt ? await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]) : null;
      out.isolationAfter = after; const b = out.isolationBefore;
      if (after && b) R.check('U-ISO', 'bu koşumun iki sentetik tenantı DIŞINDAKİ tenantlarda tenant başına kullanıcı ve müvekkil SAYILARI önce/sonra aynı (önceki test tenantları dahil; yalnız sayı)',
        after.digest === b.digest, `önce=${b.digest}/${b.tenants} sonra=${after.digest}/${after.tenants}`);
      else R.unmeasured('U-ISO', 'sayım dağılımı', 'ölçülemedi');
    } catch (e) { R.unmeasured('U-ISO', 'sayım dağılımı', `okunamadı: ${errText(e, 120)}`); }
    const s = R.summary(`EXTACC D-4 PORTAL GİRİŞİ (runId=${runId})`);
    out.fatal = fatal; out.stopped = stopped; out.displayed = displayed; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    out.recovery = recoveryAdvice(out, receipt ? receiptPath : null);
    if (out.recovery.gerekli) console.error(`KURTARMA/İNCELEME GEREKLİ: ${out.recovery.neden.join(' · ')}`);
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
  if (process.env.D4_RECOVER_CONFIRM !== '1') { console.error('REDDEDİLDİ: D4_RECOVER_CONFIRM=1 gerekli'); process.exit(3); }
  const base = process.env.D4_API_BASE; const origin = expectedOriginOf(process.env.D4_EXPECT_BASE_URL);
  const pw = process.env.D4_LIVE_LOGIN_PW; const evid = process.env.D4_EVID_FILE; const receiptPath = process.env.D4_RECEIPT;
  if (!pw || !evid || !receiptPath) { console.error('REDDEDİLDİ: D4_LIVE_LOGIN_PW + D4_EVID_FILE + D4_RECEIPT gerekli'); process.exit(2); }
  addSecret(pw); addSecret(process.env.AH_DATABASE_URL);
  const P = effectiveParams(process.env);
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error('REDDEDİLDİ: makbuz okunamadı'); process.exit(4); }
  if (!receipt || receipt.record !== RECEIPT_RECORD || !receipt.elevUserId || !receipt.elevEmail) { console.error('REDDEDİLDİ: makbuz biçimi/alanları eksik'); process.exit(4); }
  if (process.env.D4_RUNID && String(process.env.D4_RUNID).toLowerCase() !== String(receipt.runId).toLowerCase()) { console.error('REDDEDİLDİ: runId makbuzla eşleşmiyor'); process.exit(4); }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'EXTACC-D4-RECOVER', revision: 'R01', runId: receipt.runId, note: 'kabul ölçütleri KOŞULMADI; yalnız kapanış' };
  let session = null; let before = null;
  try {
    const ident = await assertReceiptIdentity(prisma, receipt);
    if (!ident.ok) { console.error(`REDDEDİLDİ: kimlik bağı doğrulanmadı (${ident.reason}) — HİÇBİR yazma yapılmadı`); await prisma.$disconnect().catch(() => {}); process.exit(4); }
    before = await portalState(prisma, receipt.clientId);
    if (before.exists && (before.isActive || before.hasPortalAccess)) {
      const elev = await prisma.user.findFirst({ where: { id: receipt.elevUserId, tenantId: receipt.tenantId, email: receipt.elevEmail }, select: { id: true } });
      if (!elev) { console.error('REDDEDİLDİ: makbuzdaki kullanıcı sentetik tenantta yok — yazma yapılmadı'); await prisma.$disconnect().catch(() => {}); process.exit(4); }
      await prisma.user.update({ where: { id: elev.id }, data: { passwordHash: await bcrypt.hash(pw, 10), isActive: true } });
      out.temporaryAccess = 'makbuzdaki sentetik personele geçici erişim; kapanışta yeniden kapatıldı';
      session = await L.AH.login(base, receipt.elevEmail, pw, receipt.tenantSlug);
      if (session && session.token) addSecret(session.token);
    }
  } catch (e) { out.fatal = errText(e, 200); }
  try { out.portalClose = await closePortal(R, prisma, base, origin, receipt, session, null, null, P, before); } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
  try { out.closure = await closeAccess(prisma, receipt); } catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
  R.check('U-CLOSE', 'personel kullanıcıları pasif + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
  R.summary(`EXTACC D-4 KURTARMA (runId=${receipt.runId})`);
  out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
  out.exitCode = !(out.portalClose && out.portalClose.ok) ? 6 : !(out.closure && out.closure.ok) ? 5 : out.fatal ? 1 : 0;
  out.recovery = recoveryAdvice(out, receiptPath);
  out.exitCode = writeEvidenceOrDemote(evid, out);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = out.exitCode;
}

if (require.main === module) {
  const mode = String(process.env.D4_MODE || 'run').toLowerCase();
  if (mode === 'run') runMode();
  else if (mode === 'recover') recoverMode();
  else { console.error(`REDDEDİLDİ: bilinmeyen D4_MODE '${mode}'`); process.exit(1); }
}
module.exports = { commonGates, runGates, LIVE_PARAMS, effectiveParams, FORBIDDEN_PORTAL, RECEIPT_RECORD, caseListMatches };
void scrub;
