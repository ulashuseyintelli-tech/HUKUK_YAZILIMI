'use strict';
/*
 * EXTACC D-5 R01 — PORTAL PAROLA SIFIRLAMA CANLI KABULÜ (client-external-access-r01 §7 D-5) + portal erişim kapanışı.
 *
 * AKIŞ   : ADRES KAPISI (alıcı adresi hiçbir mevcut portal hesabına bağlı değil; yazma YOK) → kurulum + makbuz (alıcı adresi
 *          makbuza/kanıta YAZILMAZ) → personel ile sentetik müvekkile portal hesabı (alıcı adresi + koşucu üretimi ilk parola;
 *          gönderim yok) → koşucu oturumu S0 → [1. konsol] QR /portal/forgot-password + adres → owner TELEFONDAN bir talep
 *          gönderir → koşucu DB'de token'ı görür (P5-TOKEN-ISSUED; bu anda GERÇEK e-posta gitmiştir) → koşucu bilinmeyen
 *          `.invalid` adresle gönderimsiz kontrol talebi → [2. konsol] YENİ PAROLA (yalnız konsol) → owner e-postadaki
 *          bağlantıyı telefonda açar, yeni parolayı girer, BİR KEZ giriş yapar → koşucu: token tüketildi + tokenVersion arttı
 *          (P5-CONSUMED), telefon girişi (P5-WAIT), S1 (yeni parola) 201 + liste yerel/dış 200, S0 ve eski parola 401,
 *          tek kullanım (parola özeti/sürüm sabit) → kapanış.
 * KAPANIŞ: disable-user → DB pasif + erişim kapalı + resetToken/Exp NULL (P5-C-TOKEN) + sürüm S1'inkinden büyük → yeni parola
 *          girişi yerel/dış 401 → S1 korumalı uçta yerel/dış 401 → personel/dosya kapanışı → (owner kararı) alıcı adresi
 *          sentetik hesapta `.invalid` ile ezilir. E-postayı silmek kapanış DEĞİLDİR; kanıt P5-C-TOKEN'dır.
 * ÖN KOŞUL: canlı dist D5-SEC-R01 içermeli (kapanış token temizler; reset isActive kapılı). Owner bloğu dist pinini doğrular.
 * YAPMAZ : e-postayı koşucu GÖNDERMEZ (talep owner telefonundan; ürün gönderir) · reset-password/change-password çağırmaz ·
 *          alıcı adresini/parolaları/token'ları/GO'yu hiçbir log-kanıta yazmaz · 503 teşhisi.
 * ÇIKIŞ  : 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF/ADRES REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA ·
 *          6 PORTAL ERİŞİMİ KAPANDIĞI DOĞRULANMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0).
 */
const fs = require('fs'); const crypto = require('crypto');
const H5 = require('../../client-h5-intake-url-r01/scripts/h5-url-live-run');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { assertReceiptIdentity } = require('../../client-live-acceptance-i12-r01/scripts/i12-live-identity');
const DISPLAY = require('../../client-extacc-intake-chain-r01/scripts/extacc-display');
const { L, isolationFingerprint, closeAccess, dbName } = I13;
const { scrub, addSecret, expectedOriginOf, errText, writeJson, writeEvidenceOrDemote } = H5;

const RECEIPT_RECORD = 'EXTACC-D5-SETUP-RECEIPT';
const GO_RE = /^OWNER-GO-CLIENT-EXTACC-D5-\d{8}-R\d{2}$/;
const FORBIDDEN = [/\/portal\/reset-password/, /\/portal\/change-password/, /\/portal\/documents/, /\/portal\/messages/];
const LIVE_PARAMS = Object.freeze({ D5_WAIT_MS: 20 * 60 * 1000, D5_POLL_MS: 5000, D5_VIEW_MS: 120000, D5_HTTP_TIMEOUT_MS: 15000, D5_CALL_TIMEOUT_MS: 30000, D5_LATE_CREATE_MS: 120000, D5_TOKEN_TTL_MS: 3600000 });
function effectiveParams(env) {
  const live = dbName(env.AH_DATABASE_URL || '') === 'hukuk_db' || (env.D5_EXPECT_DB || '') === 'hukuk_db';
  const p = { live }; for (const k of Object.keys(LIVE_PARAMS)) { const v = Number(env[k]); p[k] = live ? LIVE_PARAMS[k] : (Number.isFinite(v) && v > 0 ? v : LIVE_PARAMS[k]); } return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

function commonGates(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { code: 1, why: 'NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS doğrulaması kapalıyken koşulmaz' };
  const display = env.D5_DISPLAY || 'conout';
  if (display !== 'conout' && display !== 'none') return { code: 4, why: 'D5_DISPLAY conout|none olmalı' };
  if (display === 'none' && ((env.D5_EXPECT_DB || '') === 'hukuk_db' || dbName(env.AH_DATABASE_URL || '') === 'hukuk_db')) return { code: 4, why: 'D5_DISPLAY=none canlı DB ile kullanılamaz' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.D5_EXPECT_DB || env.D5_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.D5_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (!env.D5_API_BASE || env.D5_API_BASE !== env.D5_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  if (!expectedOriginOf(env.D5_EXPECT_BASE_URL)) return { code: 4, why: 'D5_EXPECT_BASE_URL https:// şemalı, yolsuz bir origin olmalı' };
  return null;
}
function runGates(env) {
  const c = commonGates(env); if (c) return c;
  if (env.D5_LIVE_CONFIRM !== '1') return { code: 3, why: 'D5_LIVE_CONFIRM=1 gerekli' };
  if (!(env.D5_LIVE_GO_REF && GO_RE.test(env.D5_LIVE_GO_REF.trim()))) return { code: 3, why: 'D5_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-EXTACC-D5-YYYYMMDD-RNN) gerekli' };
  if (env.D5_SEND_CONFIRM !== '1') return { code: 3, why: 'D5_SEND_CONFIRM=1 gerekli (owner: TEK gerçek e-posta gönderimi onayı)' };
  if (!isEmail(env.D5_RECIPIENT_EMAIL)) return { code: 4, why: 'D5_RECIPIENT_EMAIL geçerli bir e-posta adresi olmalı (yalnız owner konsolunda girilir)' };
  if (/\.invalid$/i.test(env.D5_RECIPIENT_EMAIL) || /@ah-harness\./i.test(env.D5_RECIPIENT_EMAIL)) return { code: 4, why: 'alıcı adresi sentetik olamaz (gerçek posta kutusu gerekir)' };
  const runId = String(env.D5_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'D5_RUNID 8 hex olmalı' };
  if (env.D5_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId ile eşleşmiyor' };
  return { code: 0, runId, origin: expectedOriginOf(env.D5_EXPECT_BASE_URL), display: env.D5_DISPLAY || 'conout' };
}

/** Portal durumu (salt okuma). E-posta değeri DÖNDÜRÜLMEZ (yalnız eşitlik/özet). */
async function portalState(prisma, clientId, expectEmail) {
  const u = await prisma.clientPortalUser.findUnique({ where: { clientId }, select: { email: true, isActive: true, tokenVersion: true, loginCount: true, lastLoginAt: true, passwordHash: true, resetToken: true, resetTokenExp: true } });
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { hasPortalAccess: true } });
  return { exists: !!u, emailMatches: u ? (expectEmail ? u.email.toLowerCase() === String(expectEmail).toLowerCase() : null) : null, emailIsScrubbed: u ? /\.invalid$/i.test(u.email) : null,
    isActive: u ? u.isActive : null, tokenVersion: u ? u.tokenVersion : null, loginCount: u ? u.loginCount : null, lastLoginAt: u && u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    pwDigest: u ? crypto.createHash('sha256').update(u.passwordHash).digest('hex').slice(0, 16) : null, // parola özeti DEĞİL: hash'in özeti (değişim tespiti)
    hasResetToken: u ? u.resetToken !== null : null, resetTokenExp: u && u.resetTokenExp ? u.resetTokenExp.toISOString() : null, hasPortalAccess: c ? c.hasPortalAccess : null, _email: u ? u.email : null };
}
const caseListMatches = (body, caseId, fileNumber) => Array.isArray(body) && body.length === 1 && body[0] && body[0].id === caseId && body[0].fileNumber === fileNumber;

/** ADRES KAPISI (salt okuma, yazmadan ÖNCE): alıcı adresi HERHANGİ bir portal hesabında (aktif/pasif, tüm tenantlar) varsa DUR. */
async function recipientGate(prisma, email) {
  const portal = await prisma.clientPortalUser.count({ where: { email: { equals: email, mode: 'insensitive' } } });
  const staff = await prisma.user.count({ where: { email: { equals: email, mode: 'insensitive' } } });
  return { portalMatches: portal, staffMatches: staff, ok: portal === 0 };
}

/** PORTAL ERİŞİM KAPANIŞI — D-4 R03 ile aynı kurallar (DB ve HTTP ayrı; sürüm kendisiyle karşılaştırılmaz; belirsiz oluşturma bekler) + P5-C-TOKEN. */
async function closePortal(R, prisma, base, origin, receipt, P, opts) {
  const o = opts || {}; const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
  const res = { ok: false, dbClosed: false, httpVerified: false, httpFailed: false, identity: null, disableCalls: [], productFinding: null, lateCreate: null };
  const ident = await assertReceiptIdentity(prisma, receipt); res.identity = ident.ok ? 'OK' : ident.reason;
  if (!ident.ok) { res.note = 'kimlik bağı DOĞRULANMADI — hiçbir yazma yapılmadı'; R.check('P5-C1', 'portal erişimi yetkili uçla kapatıldı', false, res.note); return res; }
  let st0 = await portalState(prisma, receipt.clientId, o.recipient);
  if (!st0.exists && o.createUncertain) {
    const t0 = Date.now(); while (!st0.exists && Date.now() - t0 < P.D5_LATE_CREATE_MS) { await sleep(P.D5_POLL_MS); st0 = await portalState(prisma, receipt.clientId, o.recipient); }
    res.lateCreate = st0.exists ? `hesap ilk sorguda YOKTU, ~${Math.round((Date.now() - t0) / 1000)} sn sonra GÖRÜLDÜ — kapatılıyor` : `hesap ${Math.round(P.D5_LATE_CREATE_MS / 1000)} sn görülmedi — geç oluşma DIŞLANAMADI`;
  }
  res.before = st0;
  if (!st0.exists) {
    if (o.createUncertain) { res.lateCreateRisk = true; R.unmeasured('P5-C1', 'portal erişimi yetkili uçla kapatıldı', `${res.lateCreate}; kapanış DOĞRULANMADI`); return res; }
    res.ok = true; res.dbClosed = true; res.note = o.absentNote || 'portal hesabı yok'; R.check('P5-C1', 'portal erişimi yetkili uçla kapatıldı', true, res.note); return res;
  }
  let disabledNow = false;
  if (st0.isActive || st0.hasPortalAccess) {
    for (let i = 0; i < 2; i++) {
      if ((!o.session || !o.session.token) && o.sessionProvider) { try { o.session = await o.sessionProvider(); res.disableCalls.push('personel oturumu kapatma için açıldı'); } catch (e) { res.disableCalls.push(`personel oturumu açılamadı: ${errText(e, 100)}`); } }
      if (!o.session || !o.session.token) { res.disableCalls.push('personel oturumu YOK'); break; }
      const r = await L.AH.httpJson('POST', `${base}/portal/admin/disable-user`, { token: o.session.token, body: { clientId: receipt.clientId }, timeoutMs: P.D5_CALL_TIMEOUT_MS });
      res.disableCalls.push(r.indeterminate ? 'belirsiz' : `HTTP ${r.status}`);
      if (!r.indeterminate && r.status >= 200 && r.status < 300) { disabledNow = true; break; }
      const now = await portalState(prisma, receipt.clientId, o.recipient); if (!now.isActive && !now.hasPortalAccess) { res.disableCalls.push('DB: kapalı görüldü'); break; }
      if (!r.indeterminate && r.status < 500) break;
    }
  } else res.disableCalls.push('çağrılmadı — hesap zaten pasif ve erişim kapalı');
  const st1 = await portalState(prisma, receipt.clientId, o.recipient); res.after = st1;
  const flags = st1.isActive === false && st1.hasPortalAccess === false;
  R.check('P5-C1', 'portal erişimi YETKİLİ uçla kapatıldı (admin/disable-user) ya da zaten kapalıydı', disabledNow || (!st0.isActive && !st0.hasPortalAccess) || flags, `çağrılar=${JSON.stringify(res.disableCalls)}${res.lateCreate ? ' · ' + res.lateCreate : ''}`);
  R.check('P5-C2', 'DB: portal kullanıcısı pasif · müvekkil portal erişimi kapalı', flags, `isActive=${st1.isActive} hasPortalAccess=${st1.hasPortalAccess}`);
  // P5-C-TOKEN: kapanıştan sonra KULLANILABİLİR sıfırlama token'ı KALMAZ (D5-SEC-R01 kapatma temizler). E-posta silmek kapanış değildir.
  R.check('P5-C-TOKEN', 'DB: kapanıştan sonra sıfırlama token\'ı YOK (resetToken/resetTokenExp NULL) — e-postadaki bağlantı kullanılamaz', st1.hasResetToken === false && st1.resetTokenExp === null,
    `hasResetToken=${st1.hasResetToken} resetTokenExp=${st1.resetTokenExp === null ? 'null' : 'VAR'}`);
  const issued = Number.isInteger(o.issuedVersion) ? o.issuedVersion : null; const openBefore = st0.isActive || st0.hasPortalAccess;
  const ref = issued !== null ? { value: issued, source: 'S1 oturumunun verildiği sürüm' } : (openBefore ? { value: st0.tokenVersion, source: 'bu kapanıştan hemen önceki sürüm' } : null);
  res.version = { before: st0.tokenVersion, after: st1.tokenVersion, issued, ref };
  const vdesc = 'DB: tokenVersion, S1 oturumunun verildiği (ya da kapanış öncesi) sürümden BÜYÜK';
  if (!ref) R.unmeasured('P5-C2V', vdesc, `hesap zaten kapalıydı ve verilme sürümü bilinmiyor — mevcut sürüm (${st1.tokenVersion}) kendisiyle karşılaştırılmaz`);
  else R.check('P5-C2V', vdesc, typeof st1.tokenVersion === 'number' && st1.tokenVersion > ref.value, `${ref.source}=${ref.value} → şimdiki=${st1.tokenVersion}`);
  const tmo = P.D5_HTTP_TIMEOUT_MS; let creds = o.creds || null;
  if (!creds && o.credsForClosed && flags) { try { creds = await o.credsForClosed(st1); res.measureCreds = 'pasif hesaba YALNIZ ölçüm için yeni rastgele parola yazıldı (hesap pasif kaldı)'; } catch (e) { res.measureCreds = `ölçüm parolası kurulamadı: ${errText(e, 120)}`; } }
  const nl = creds ? await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const nd = creds ? await L.AH.httpJson('POST', `${origin}/api/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const judge401 = (id, desc, r) => { if (!r) return R.unmeasured(id, desc, 'kimlik bilgisi yok — ölçülemez'); if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı'); if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`); return R.check(id, desc, r.status === 401, `HTTP ${r.status}`); };
  judge401('P5-C3L', 'kapanış sonrası YENİ portal girişi (yeni parola) YEREL 401', nl); judge401('P5-C3D', 'kapanış sonrası YENİ portal girişi (yeni parola) DIŞ HTTPS 401', nd);
  const el = o.portalToken ? await L.AH.httpJson('GET', `${base}/portal/cases`, { token: o.portalToken, timeoutMs: tmo }) : null;
  const ed = o.portalToken ? await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: o.portalToken, timeoutMs: tmo }) : null;
  const judgeSession = (id, desc, r) => { if (!r) return R.unmeasured(id, desc, o.noSessionWhy || 'koşumda S1 oturumu alınmadı — ölçülemez'); if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı'); if (r.status === 200) { res.productFinding = 'ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra sıfırlama SONRASI oturum korumalı uca erişmeye devam ediyor'; return R.check(id, desc, false, 'HTTP 200 — S1 OTURUMU KAPANMADI (ürün bulgusu)'); } if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`); return R.check(id, desc, r.status === 401, `HTTP ${r.status}`); };
  judgeSession('P5-C4L', 'kapanış sonrası S1 (sıfırlama SONRASI) oturumu korumalı uçta YEREL 401', el); judgeSession('P5-C4D', 'kapanış sonrası S1 oturumu korumalı uçta DIŞ HTTPS 401', ed);
  const st2 = await portalState(prisma, receipt.clientId, o.recipient);
  R.check('P5-C5', 'HTTP ölçümlerinden SONRA DB hâlâ kapalı (pasif + erişim kapalı + token yok + sürüm geri gitmedi)', st2.isActive === false && st2.hasPortalAccess === false && st2.hasResetToken === false && st2.tokenVersion === st1.tokenVersion, `isActive=${st2.isActive} token=${st2.hasResetToken} sürüm=${st2.tokenVersion}`);
  const httpIds = ['P5-C3L', 'P5-C3D', 'P5-C4L', 'P5-C4D'];
  res.dbClosed = v('P5-C2') === 'PASS' && v('P5-C-TOKEN') === 'PASS' && v('P5-C2V') !== 'FAIL' && v('P5-C5') === 'PASS';
  res.httpFailed = httpIds.some((id) => v(id) === 'FAIL'); res.httpVerified = httpIds.every((id) => v(id) === 'PASS'); res.httpUnmeasured = httpIds.filter((id) => v(id) === 'UNMEASURED');
  const required = ['P5-C3L', 'P5-C3D'].concat(o.sessionRequired === false ? [] : ['P5-C4L', 'P5-C4D']);
  res.ok = res.dbClosed && v('P5-C2V') === 'PASS' && !res.httpFailed && required.every((id) => v(id) === 'PASS') && !res.productFinding;
  return res;
}
/** (Owner kararı) sentetik hesaptaki alıcı adresini `.invalid` ile ezer — ürün ucu dışı doğrudan yazım; yalnız PASİF hesapta ve yalnız bu koşumun clientId'sinde. */
async function scrubRecipient(prisma, receipt, runId) {
  const r = await prisma.clientPortalUser.updateMany({ where: { clientId: receipt.clientId, isActive: false }, data: { email: `portal-d5-${runId}-closed@ah-harness.invalid` } });
  return r.count === 1;
}
function exitCodeOf(out, s) { if (!(out.portalClose && out.portalClose.ok)) return 6; if (!(out.closure && out.closure.ok)) return 5; if (out.fatal) return 1; if (s.fail > 0) return 2; if (s.unmeasured > 0) return 3; return 0; }
function recoverExitCode(out, s) { const pc = out.portalClose || {}; if (!pc.dbClosed || pc.httpFailed || pc.productFinding || pc.lateCreateRisk) return 6; if (!(out.closure && out.closure.ok)) return 5; if (out.fatal) return 1; if (s.fail > 0) return 2; if (s.unmeasured > 0) return 3; return 0; }
function recoveryAdvice(out, receiptPath) {
  const need = []; const pc = out.portalClose || {};
  if (!pc.ok) { if (pc.productFinding) need.push('PORTAL: S1 oturumu kapanmadı (ÜRÜN BULGUSU — Recover düzeltemez)'); else if (pc.lateCreateRisk) need.push('PORTAL: oluşturma belirsiz, hesap görülmedi — Recover BİR KEZ'); else if (pc.dbClosed) need.push(`PORTAL: DB kapalı ama HTTP reddi doğrulanmadı (ölçülemeyen: ${(pc.httpUnmeasured || []).join(',') || '-'})`); else need.push('PORTAL ERİŞİMİ kapandığı doğrulanmadı'); }
  if (!(out.closure && out.closure.ok)) need.push('PERSONEL/DOSYA KAPANIŞI doğrulanmadı');
  if (out.scrubRequested && !out.scrubDone) need.push('ALICI ADRESİ sentetik hesapta hâlâ duruyor (owner kararı ezme yapılamadı)');
  if (!need.length) return { gerekli: false };
  let onDisk = false; try { onDisk = !!receiptPath && fs.existsSync(receiptPath); } catch (e) { onDisk = false; }
  return { gerekli: true, neden: need, makbuz: receiptPath || null, makbuzDiskte: onDisk, adim: 'Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile BİR KEZ; kabul ölçütleri tekrarlanmaz.' };
}

// ------------------------------------------------------------------ RUN
async function runMode() {
  const g = runGates(process.env); if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const { runId, origin } = g; const base = process.env.D5_API_BASE;
  const pw = process.env.D5_LIVE_LOGIN_PW; const receiptPath = process.env.D5_RECEIPT; const evid = process.env.D5_EVID_FILE; const recipient = process.env.D5_RECIPIENT_EMAIL.trim();
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: D5_LIVE_LOGIN_PW + D5_RECEIPT + D5_EVID_FILE gerekli.'); process.exit(2); }
  addSecret(pw); addSecret(process.env.D5_LIVE_GO_REF); addSecret(process.env.AH_DATABASE_URL); addSecret(recipient); addSecret(recipient.toLowerCase());
  const P = effectiveParams(process.env);
  let con = null;
  if (g.display === 'conout') { try { con = DISPLAY.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok — ${errText(e, 120)} (hiçbir yazma yapılmadı)`); process.exit(4); } }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  // Owner ekranı: canlıda YALNIZ yerel konsol. Gösterimsiz izole testte (display=none; canlı DB ile kapı reddeder) satırlar
  // "telefon taklidi"nin okuduğu test dosyasına yazılır — bu dosya sırların kanıta yazılmadığını ölçen taramanın DIŞINDADIR.
  const showOwner = async (lines) => { if (con) return DISPLAY.show(con, lines); if (g.display === 'none' && process.env.D5_TEST_DISPLAY_SINK) fs.appendFileSync(process.env.D5_TEST_DISPLAY_SINK, lines.join('\n') + '\n'); };
  const initialPw = 'D5i!' + crypto.randomBytes(12).toString('base64url'); addSecret(initialPw); // hiç gösterilmez; sıfırlamayla değişecek
  const newPw = 'D5n!' + crypto.randomBytes(12).toString('base64url'); addSecret(newPw);          // yalnız 2. konsolda
  const fileNumber = `I3-${runId}`;
  const out = { record: 'EXTACC-D5-PORTAL-RESET-LIVE-RUN', revision: 'R01', runId, apiBase: base, expectedOrigin: origin, params: P, calledEndpoints: [], recipient: '[GİZLİ — kanıta yazılmaz]' };
  const call = (m, p) => out.calledEndpoints.push(`${m} ${p.replace(base, '<API>').replace(origin, '<DIŞ>')}`);
  let receipt = null; let fatal = null; let session = null; let s0 = null; let s1 = null; let stopped = null; let displayed = false; let createOutcome = null; let issuedVersion = null;
  try {
    // ADRES KAPISI — hiçbir yazmadan önce
    const gate = await recipientGate(prisma, recipient); out.recipientGate = { portalMatches: gate.portalMatches, staffMatches: gate.staffMatches };
    if (!gate.ok) { if (con) DISPLAY.close(con); console.error(`REDDEDİLDİ: alıcı adresi mevcut bir portal hesabına bağlı (eşleşme=${gate.portalMatches}) — mevcut hesap DEĞİŞTİRİLMEZ, yazma YOK`); await prisma.$disconnect().catch(() => {}); process.exit(4); }
    R.check('P5-GATE', 'alıcı adresi hiçbir portal hesabında yok (personel eşleşmesi yalnız sayı)', true, `portal=0 personel=${gate.staffMatches}`);
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10));
    receipt = { record: RECEIPT_RECORD, runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId, clientId: st.clientId, foreignClientId: st.foreignClientId, caseId: st.caseId,
      elevUserId: st.actors.elev1.id, elevEmail: st.actors.elev1.email, portalEmail: '[GİZLİ]', createdAt: new Date().toISOString() };
    out.receipt = receipt;
    try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); throw new Error('makbuz yazılamadı — portal hesabı AÇILMADI'); }
    call('POST', `${base}/auth/login`); session = await L.AH.login(base, st.actors.elev1.email, pw, st.slug); if (session && session.token) addSecret(session.token);
    if (!session.ok) throw new Error(`elev1 oturum açamadı (HTTP ${session.status ?? 'belirsiz'})`);
    R.check('P5-00', 'ÖLÇÜM GEÇERLİ: elev1 ADMIN değil', st.actors.elev1.role !== 'ADMIN', `elev1:${st.actors.elev1.role}`);
    const audit0 = await prisma.auditLog.count({ where: { tenantId: st.tenantId } });

    receipt.createAttemptedAt = new Date().toISOString(); try { writeJson(receiptPath, receipt); } catch (e) { delete receipt.createAttemptedAt; throw new Error('makbuza oluşturma denemesi yazılamadı — portal hesabı İSTENMEDİ'); }
    createOutcome = 'attempted'; call('POST', `${base}/portal/admin/create-user`);
    const cu = await L.AH.httpJson('POST', `${base}/portal/admin/create-user`, { token: session.token, body: { clientId: st.clientId, email: recipient, password: initialPw }, timeoutMs: P.D5_CALL_TIMEOUT_MS });
    createOutcome = cu.indeterminate || cu.status >= 500 ? 'uncertain' : (cu.status >= 200 && cu.status < 300 ? 'ok' : 'rejected');
    receipt.createOutcome = createOutcome; try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); }
    if (cu.indeterminate) R.unmeasured('P5-01', 'alıcı adresiyle sentetik müvekkile portal hesabı açıldı (gönderim yok)', 'yanıt alınamadı — hesap sonradan oluşabilir');
    else R.check('P5-01', 'alıcı adresiyle sentetik müvekkile portal hesabı açıldı (gönderim yok)', cu.status >= 200 && cu.status < 300, `HTTP ${cu.status}`);
    const s1st = await portalState(prisma, st.clientId, recipient);
    const p02 = createOutcome === 'ok' && s1st.exists && s1st.isActive === true && s1st.hasPortalAccess === true && s1st.emailMatches === true && s1st.hasResetToken === false;
    R.check('P5-02', 'DB: hesap aktif · erişim açık · adres alıcı · sıfırlama token\'ı yok', p02, `var=${s1st.exists} aktif=${s1st.isActive} erişim=${s1st.hasPortalAccess} adres=${s1st.emailMatches} token=${s1st.hasResetToken}`);
    if (!p02) stopped = 'portal hesabı beklenen durumda değil — konsol GÖSTERİLMEDİ';
    else { issuedVersion = s1st.tokenVersion; receipt.portalIssuedTokenVersion = s1st.tokenVersion; try { writeJson(receiptPath, receipt); } catch (e) { stopped = 'makbuza sürüm yazılamadı — konsol GÖSTERİLMEDİ'; } }
    if (!stopped) {
      call('POST', `${base}/portal/login`); const pl = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: recipient, password: initialPw }, timeoutMs: P.D5_HTTP_TIMEOUT_MS });
      s0 = pl.body && typeof pl.body.token === 'string' ? pl.body.token : null; if (s0) addSecret(s0);
      R.check('P5-03L', 'koşucu S0 (ilk parola) girişi YEREL 201', !pl.indeterminate && pl.status === 201 && !!s0, pl.indeterminate ? 'yanıt yok' : `HTTP ${pl.status}`);
      if (s0) { call('GET', '<DIŞ>/api/portal/cases'); const cd = await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: s0, timeoutMs: P.D5_HTTP_TIMEOUT_MS });
        if (cd.indeterminate || cd.status === 503) { R.unmeasured('P5-04D', 'S0 ile dosya listesi DIŞ HTTPS 200', cd.indeterminate ? 'yanıt yok' : 'HTTP 503 — neden UNKNOWN'); stopped = 'dış zincir ölçülemedi — konsol GÖSTERİLMEDİ'; }
        else R.check('P5-04D', 'S0 ile dosya listesi DIŞ HTTPS 200 ve YALNIZ bu koşumun dosyası', cd.status === 200 && caseListMatches(cd.body, st.caseId, fileNumber), `HTTP ${cd.status}`); }
      const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
      if (!stopped && !['P5-03L', 'P5-04D'].every((id) => v(id) === 'PASS')) stopped = 'gösterim öncesi kontroller PASS değil — konsol GÖSTERİLMEDİ, e-posta talebi BEKLENMEDİ';
    }
    // ---- 1. KONSOL: talep (GERÇEK e-posta ürün tarafından gönderilecek)
    let tokenSeen = false; let baseline = null;
    if (!stopped) {
      baseline = await portalState(prisma, st.clientId, recipient);
      { const qr = DISPLAY.renderQr(`${origin}/portal/forgot-password`); await showOwner(['============ EXTACC D-5 (1/2) — YALNIZ OWNER EKRANI ============', 'TELEFON: Wi-Fi KAPALI, mobil veri AÇIK, gizli sekme. QR "şifremi unuttum" sayfasını açar.', '', ...qr.lines, '', `${origin}/portal/forgot-password`, '', 'Bu adrese giriş için kullanacağınız e-posta adresi (aynı yazın):', `    ${recipient}`, '', 'Formu BİR KEZ gönderin. Bu adımda ürün gerçek bir e-posta GÖNDERİR (tek gönderim).', `Bekleme: en fazla ${Math.round(P.D5_WAIT_MS / 60000)} dk.`]); }
      displayed = true; R.check('P5-DISP1', 'talep sayfası + adres yalnız yerel konsola gösterildi', true, g.display === 'conout' ? 'CONOUT$' : 'gösterimsiz izole test');
      const t0 = Date.now();
      for (;;) { const s = await portalState(prisma, st.clientId, recipient); if (s.hasResetToken) { tokenSeen = true; out.tokenIssued = { atMs: Date.now() - t0, expIso: s.resetTokenExp }; break; } if (Date.now() - t0 >= P.D5_WAIT_MS) break; await sleep(P.D5_POLL_MS); }
      if (tokenSeen) { const exp = Date.parse(out.tokenIssued.expIso); const ttlOk = Math.abs(exp - Date.now() - P.D5_TOKEN_TTL_MS) < 5 * 60000;
        R.check('P5-TOKEN-ISSUED', 'talep sonrası DB\'de sıfırlama token\'ı (sha256) + süre ≈ 1 saat — bu anda ürün e-postayı göndermiştir (gönderim koşucu ölçümü DEĞİL)', ttlOk, `~${Math.round(out.tokenIssued.atMs / 1000)} sn · süre farkı ${Math.round((exp - Date.now()) / 60000)} dk`); }
      else { R.unmeasured('P5-TOKEN-ISSUED', 'talep sonrası token', 'pencere içinde token görülmedi (talep gönderilmedi / hesap bulunamadı / gönderim başarısız — DB\'den ayrılamaz)'); stopped = 'talep görülmedi — 2. konsol GÖSTERİLMEDİ'; }
      // Bilinmeyen adres (gönderimsiz): dış cevap aynı; bu koşumun tenant'ında değişiklik yok; audit sayısı ayrı; hız sınırı sayacı artar (raporlanır)
      call('POST', `${base}/portal/forgot-password (bilinmeyen .invalid adres)`);
      const unk = await L.AH.httpJson('POST', `${base}/portal/forgot-password`, { body: { email: `nobody-d5-${runId}@ah-harness.invalid` }, timeoutMs: P.D5_HTTP_TIMEOUT_MS });
      const after = await portalState(prisma, st.clientId, recipient); const audit1 = await prisma.auditLog.count({ where: { tenantId: st.tenantId } });
      R.check('P5-UNKNOWN', 'bilinmeyen adrese talep: aynı başarı cevabı; bu koşumun hesabında token durumu değişmedi; audit sayısı AYRI raporlandı; hız sınırı sayacı +1 (süreç içi)', !unk.indeterminate && unk.status < 300 && after.hasResetToken === tokenSeen, `HTTP ${unk.status} · audit ${audit0}→${audit1} · token=${after.hasResetToken}`);
    }
    // ---- 2. KONSOL: yeni parola
    let consumed = false; let phoneLogin = false;
    if (!stopped) {
      await showOwner(['', '============ EXTACC D-5 (2/2) — YENİ PAROLA (yalnız bu ekran) ============', 'Telefonda gelen e-postadaki bağlantıyı açın ve YENİ parola olarak şunu girin:', `    ${newPw}`, '', `Sonra bu parolayla BİR KEZ giriş yapın; listede YALNIZ ${fileNumber} görünmeli.`, 'Ardından AYNI bağlantıyı ikinci kez açıp deneyin (hata beklenir) — beyanda sorulur.']);
      R.check('P5-DISP2', 'yeni parola yalnız yerel konsola gösterildi', true, 'CONOUT$/none');
      const t1 = Date.now(); let s = null;
      // Sıfırlamanın TAMAMLANMASI parola hash'inin değişmesiyle görülür; token/sürüm sonuçları AYRI yargılanır (kusur ölçülemeyen değil FAIL olur).
      for (;;) { s = await portalState(prisma, st.clientId, recipient); if (s.pwDigest !== baseline.pwDigest) { consumed = true; break; } if (Date.now() - t1 >= P.D5_WAIT_MS) break; await sleep(P.D5_POLL_MS); }
      if (consumed) {
        R.check('P5-CONSUMED', 'sıfırlama tamamlandı (parola hash\'i değişti): token TÜKETİLDİ (null) + tokenVersion tam +1 arttı', s.hasResetToken === false && s.tokenVersion === baseline.tokenVersion + 1, `sürüm ${baseline.tokenVersion}→${s.tokenVersion} · token kaldı=${s.hasResetToken}`);
        // Giriş sayacı, talep ÖNCESİ taban değerle karşılaştırılır (koşucu bu aralıkta giriş yapmaz; telefon sıfırlamadan hemen sonra girmiş olabilir).
        const t2 = Date.now(); for (;;) { const q = await portalState(prisma, st.clientId, recipient); if (q.loginCount > baseline.loginCount) { phoneLogin = true; out.phoneLogin = { delta: q.loginCount - baseline.loginCount }; break; } if (Date.now() - t2 >= P.D5_WAIT_MS) break; await sleep(P.D5_POLL_MS); }
        if (phoneLogin) R.check('P5-WAIT', 'koşucu dışında yeni parolayla BAŞARILI giriş (DB loginCount; cihaz/ağ owner beyanı)', true, `artış=${out.phoneLogin.delta}`); else R.unmeasured('P5-WAIT', 'yeni parolayla telefon girişi', 'pencere içinde görülmedi');
        call('POST', `${base}/portal/login (S1)`); const l1 = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: recipient, password: newPw }, timeoutMs: P.D5_HTTP_TIMEOUT_MS });
        s1 = l1.body && typeof l1.body.token === 'string' ? l1.body.token : null; if (s1) addSecret(s1);
        R.check('P5-S1-OPEN', 'koşucu S1 (yeni parola) girişi YEREL 201 — sıfırlama SONRASI oturum', !l1.indeterminate && l1.status === 201 && !!s1, l1.indeterminate ? 'yanıt yok' : `HTTP ${l1.status}`);
        issuedVersion = (await portalState(prisma, st.clientId, recipient)).tokenVersion; receipt.portalIssuedTokenVersion = issuedVersion; try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); }
        if (s1) { const c1 = await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: s1, timeoutMs: P.D5_HTTP_TIMEOUT_MS }); R.check('P5-S1-EXT', 'S1 ile dosya listesi DIŞ HTTPS 200 (canlı oturum kanıtı)', c1.status === 200 && caseListMatches(c1.body, st.caseId, fileNumber), `HTTP ${c1.status}`); }
        const o0 = s0 ? await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: s0, timeoutMs: P.D5_HTTP_TIMEOUT_MS }) : null;
        if (o0) R.check('P5-S0', 'sıfırlama ÖNCESİ oturum S0 dış 401 (eski oturumlar düştü)', o0.status === 401, `HTTP ${o0.status}`); else R.unmeasured('P5-S0', 'S0 oturumu', 'S0 alınmadı');
        const op = await L.AH.httpJson('POST', `${origin}/api/portal/login`, { body: { email: recipient, password: initialPw }, timeoutMs: P.D5_HTTP_TIMEOUT_MS });
        R.check('P5-OLDPW', 'eski parola ile giriş dış 401', op.status === 401, `HTTP ${op.status}`);
        await sleep(P.D5_VIEW_MS); const z = await portalState(prisma, st.clientId, recipient);
        R.check('P5-SINGLE-USE', 'inceleme süresi boyunca parola hash\'i ve sürüm DEĞİŞMEDİ (aynı bağlantı ikinci kez işe yaramadı)', z.pwDigest === s.pwDigest && z.tokenVersion === s.tokenVersion && z.hasResetToken === false, `hash aynı=${z.pwDigest === s.pwDigest} sürüm=${z.tokenVersion}`);
      } else { for (const [id, d] of [['P5-CONSUMED', 'sıfırlama tamamlandı'], ['P5-WAIT', 'telefon girişi'], ['P5-S1-OPEN', 'S1'], ['P5-SINGLE-USE', 'tek kullanım']]) R.unmeasured(id, d, 'sıfırlama pencere içinde tamamlanmadı — token kapanışta iptal edilecek (P5-C-TOKEN)'); }
    } else { for (const [id, d] of [['P5-DISP2', 'yeni parola gösterimi'], ['P5-CONSUMED', 'sıfırlama'], ['P5-WAIT', 'telefon girişi'], ['P5-S1-OPEN', 'S1'], ['P5-SINGLE-USE', 'tek kullanım']]) R.unmeasured(id, d, stopped); }
  } catch (e) { fatal = errText(e, 300); }
  finally {
    if (con) { try { await DISPLAY.clear(con); } catch (e) { out.displayClearError = errText(e, 120); } DISPLAY.close(con); }
    try { out.portalClose = receipt ? await closePortal(R, prisma, base, origin, receipt, P, { session, creds: createOutcome ? { email: recipient, password: newPw } : null, portalToken: s1, issuedVersion, recipient,
      sessionRequired: !!s1, createUncertain: createOutcome === 'attempted' || createOutcome === 'uncertain', noSessionWhy: 'S1 oturumu alınmadı (sıfırlama tamamlanmadı) — sıfırlama sonrası oturum ölçülemez' }) : { ok: true, nothingCreated: true }; } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
    try { out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true }; } catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
    if (receipt) R.check('U-CLOSE', 'personel kullanıcıları pasif (tokenVersion++) + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
    out.scrubRequested = process.env.D5_SCRUB_RECIPIENT === '1';
    if (receipt && out.scrubRequested) { try { out.scrubDone = (await scrubRecipient(prisma, receipt, runId)) && (await portalState(prisma, receipt.clientId)).emailIsScrubbed === true; } catch (e) { out.scrubDone = false; out.scrubError = errText(e, 120); } R.check('P5-SCRUB', 'alıcı adresi sentetik hesapta .invalid ile ezildi (owner kararı; yalnız pasif hesap)', !!out.scrubDone, `yapıldı=${!!out.scrubDone}`); }
    if (receipt) R.check('P5-D9', 'PORTAL kapanışı birleşik: DB kapalı + token yok + gerekli HTTP reddi + personel/dosya kapanışı', !!(out.portalClose && out.portalClose.ok) && !!(out.closure && out.closure.ok), `portal=${!!(out.portalClose && out.portalClose.ok)} personel=${!!(out.closure && out.closure.ok)}${out.portalClose && out.portalClose.productFinding ? ' · ' + out.portalClose.productFinding : ''}`);
    out.productFinding = out.portalClose ? out.portalClose.productFinding || null : null; out.forbiddenEndpointCalled = out.calledEndpoints.some((c) => FORBIDDEN.some((re) => re.test(c)));
    try { const after = receipt ? await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]) : null; out.isolationAfter = after; const b = out.isolationBefore;
      if (after && b) R.check('U-ISO', 'bu koşumun iki sentetik tenantı DIŞINDAKİ tenantlarda kullanıcı/müvekkil SAYILARI önce/sonra aynı (yalnız sayı)', after.digest === b.digest, `önce=${b.digest}/${b.tenants} sonra=${after.digest}/${after.tenants}`); else R.unmeasured('U-ISO', 'sayım dağılımı', 'ölçülemedi'); } catch (e) { R.unmeasured('U-ISO', 'sayım dağılımı', `okunamadı: ${errText(e, 120)}`); }
    if (out.portalClose && out.portalClose.before) { delete out.portalClose.before._email; } if (out.portalClose && out.portalClose.after) { delete out.portalClose.after._email; }
    const s = R.summary(`EXTACC D-5 PORTAL SIFIRLAMA (runId=${runId})`);
    out.fatal = fatal; out.stopped = stopped; out.displayed = displayed; out.createOutcome = createOutcome; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })); out.recovery = recoveryAdvice(out, receipt ? receiptPath : null);
    if (out.recovery.gerekli) console.error(`KURTARMA/İNCELEME GEREKLİ: ${out.recovery.neden.join(' · ')}`);
    out.exitCode = exitCodeOf(out, s); out.exitCode = writeEvidenceOrDemote(evid, out); await prisma.$disconnect().catch(() => {}); process.exitCode = out.exitCode;
  }
}
// ------------------------------------------------------------------ RECOVER — kabul ölçütleri KOŞULMAZ
async function recoverMode() {
  const c = commonGates(process.env); if (c) { console.error(`REDDEDİLDİ: ${c.why}`); process.exit(c.code); }
  if (process.env.D5_RECOVER_CONFIRM !== '1') { console.error('REDDEDİLDİ: D5_RECOVER_CONFIRM=1 gerekli'); process.exit(3); }
  const base = process.env.D5_API_BASE; const origin = expectedOriginOf(process.env.D5_EXPECT_BASE_URL); const pw = process.env.D5_LIVE_LOGIN_PW; const evid = process.env.D5_EVID_FILE; const receiptPath = process.env.D5_RECEIPT;
  if (!pw || !evid || !receiptPath) { console.error('REDDEDİLDİ: D5_LIVE_LOGIN_PW + D5_EVID_FILE + D5_RECEIPT gerekli'); process.exit(2); }
  addSecret(pw); addSecret(process.env.AH_DATABASE_URL); const P = effectiveParams(process.env);
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error('REDDEDİLDİ: makbuz okunamadı'); process.exit(4); }
  if (!receipt || receipt.record !== RECEIPT_RECORD || !receipt.elevUserId || !receipt.elevEmail) { console.error('REDDEDİLDİ: makbuz biçimi/alanları eksik'); process.exit(4); }
  if (process.env.D5_RUNID && String(process.env.D5_RUNID).toLowerCase() !== String(receipt.runId).toLowerCase()) { console.error('REDDEDİLDİ: runId makbuzla eşleşmiyor'); process.exit(4); }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'EXTACC-D5-RECOVER', revision: 'R01', runId: receipt.runId, note: 'kabul ölçütleri KOŞULMADI; yalnız kapanış' };
  let session = null; let before = null;
  const createUncertain = !!receipt.createAttemptedAt && receipt.createOutcome !== 'ok' && receipt.createOutcome !== 'rejected';
  out.createEvidence = { attemptedAt: receipt.createAttemptedAt || null, outcome: receipt.createOutcome || null, uncertain: createUncertain };
  const elevOf = () => prisma.user.findFirst({ where: { id: receipt.elevUserId, tenantId: receipt.tenantId, email: receipt.elevEmail }, select: { id: true } });
  const openStaffSession = async () => { if (session && session.token) return session; const elev = await elevOf(); if (!elev) throw new Error('makbuzdaki kullanıcı sentetik tenantta yok'); await prisma.user.update({ where: { id: elev.id }, data: { passwordHash: await bcrypt.hash(pw, 10), isActive: true } }); out.temporaryAccess = 'sentetik personele geçici erişim; kapanışta yeniden kapatıldı'; session = await L.AH.login(base, receipt.elevEmail, pw, receipt.tenantSlug); if (session && session.token) addSecret(session.token); return session; };
  try { const ident = await assertReceiptIdentity(prisma, receipt); if (!ident.ok) { console.error(`REDDEDİLDİ: kimlik bağı doğrulanmadı (${ident.reason}) — HİÇBİR yazma yapılmadı`); await prisma.$disconnect().catch(() => {}); process.exit(4); }
    before = await portalState(prisma, receipt.clientId); if (before._email) addSecret(before._email);
    if (before.exists && (before.isActive || before.hasPortalAccess)) { if (!(await elevOf())) { console.error('REDDEDİLDİ: makbuzdaki kullanıcı yok — yazma yapılmadı'); await prisma.$disconnect().catch(() => {}); process.exit(4); } await openStaffSession(); } } catch (e) { out.fatal = errText(e, 200); }
  const issued = Number.isInteger(receipt.portalIssuedTokenVersion) ? receipt.portalIssuedTokenVersion : null; out.versionEvidence = { issuedFromReceipt: issued, beforeRecover: before ? before.tokenVersion : null };
  try { out.portalClose = await closePortal(R, prisma, base, origin, receipt, P, { session, sessionProvider: openStaffSession, issuedVersion: issued, sessionRequired: true, createUncertain,
    absentNote: receipt.createAttemptedAt ? `Recover anında portal hesabı YOK (oluşturma sonucu kesin: ${receipt.createOutcome})` : 'portal hesabı yok; makbuzda oluşturma denemesi kaydı yok',
    noSessionWhy: 'Recover: koşumun oturumu saklanmaz — S1 reddi Recover içinde ÖLÇÜLEMEZ; Run kanıtına bakın',
    credsForClosed: async (st) => { const tmp = 'D5r!' + crypto.randomBytes(12).toString('base64url'); addSecret(tmp); const u = await prisma.clientPortalUser.updateMany({ where: { clientId: receipt.clientId, isActive: false }, data: { passwordHash: await bcrypt.hash(tmp, 10) } }); if (u.count !== 1) throw new Error(`pasif hesap sayısı ${u.count}`); return { email: st._email, password: tmp }; } }); } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
  try { out.closure = await closeAccess(prisma, receipt); } catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
  R.check('U-CLOSE', 'personel kullanıcıları pasif + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
  out.scrubRequested = process.env.D5_SCRUB_RECIPIENT === '1';
  if (out.scrubRequested) { try { out.scrubDone = (await scrubRecipient(prisma, receipt, receipt.runId)) && (await portalState(prisma, receipt.clientId)).emailIsScrubbed === true; } catch (e) { out.scrubDone = false; } R.check('P5-SCRUB', 'alıcı adresi .invalid ile ezildi (owner kararı)', !!out.scrubDone, `yapıldı=${!!out.scrubDone}`); }
  if (out.portalClose && out.portalClose.before) delete out.portalClose.before._email; if (out.portalClose && out.portalClose.after) delete out.portalClose.after._email;
  const s = R.summary(`EXTACC D-5 KURTARMA (runId=${receipt.runId})`); out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
  out.exitCode = recoverExitCode(out, s); out.recovery = recoveryAdvice(out, receiptPath);
  if (out.recovery.gerekli && out.exitCode === 3) out.recovery.adim = 'Recover TEKRARLANMAZ: DB kapalı; ölçülemeyen satırlar Run kanıtıyla değerlendirilir.';
  out.exitCode = writeEvidenceOrDemote(evid, out); await prisma.$disconnect().catch(() => {}); process.exitCode = out.exitCode;
}
if (require.main === module) { const mode = String(process.env.D5_MODE || 'run').toLowerCase(); if (mode === 'run') runMode(); else if (mode === 'recover') recoverMode(); else { console.error(`REDDEDİLDİ: bilinmeyen D5_MODE '${mode}'`); process.exit(1); } }
module.exports = { commonGates, runGates, LIVE_PARAMS, effectiveParams, FORBIDDEN, RECEIPT_RECORD, recipientGate, recoverExitCode, exitCodeOf };
void scrub;
