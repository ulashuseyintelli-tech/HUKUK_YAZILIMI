'use strict';
/*
 * EXTACC D-7 R01 — PORTAL MESAJ AKIŞI CANLI KABULÜ (client-external-access-r01 §7 D-7; tanım: D-8 paketi §5) + portal erişim kapanışı.
 *
 * AKIŞ   : kurulum + makbuz (sentetik tenant + yabancı tenantta bir dosya) → personel (elev1) ile sentetik müvekkile portal hesabı
 *          (`POST /portal/admin/create-user`; gönderim YOK) → koşucu kendi portal oturumunu alır (yerel) → dosya listesi dış HTTPS
 *          yalnız bu koşumun dosyası → MESAJ ÖLÇÜMLERİ (koşucu oturumuyla, DIŞ HTTPS):
 *            D7-1  POST /api/portal/messages {content:'D7-<runId>'} 201 + DB satırı (clientId/tenantId/senderType=CLIENT/isRead=false)
 *            D7-2  GET /api/portal/messages 200 ve YALNIZ bu koşumun mesajları
 *            D7-4N/D7-4S/D7-4U kapsam dışı caseId (yabancı tenant dosyası / AYNI tenantta başka müvekkilin dosyası / bulunmayan id)
 *                  → 400 "Geçersiz dosya referansı" (kaynak R27 CLIENT-K1; tanımdaki 404 DEĞİL) ve satır YAZILMAZ ·
 *                  D7-4P kendi dosyasıyla 201 (pozitif kontrol)
 *            D7-3  personel yanıtı YEREL API'den (`POST /portal/admin/messages/:clientId`, elev1) → dış GET'te görünür ·
 *            D7-3N PortalNotification (MESAJ) satırı +1 · D7-3U unread-count 1 → mark-read → 0 (+DB isRead) — personel yanıtı ya da
 *                  sayaç/mark-read çağrısı yanıtsız kalırsa bu ikisi FAIL değil ÖLÇÜLEMEYEN ·
 *            D7-3G personel GET admin/messages/:clientId (yerel) 200, gövde `{ client, messages }` (kaynak getClientMessages; çıplak
 *                  dizi DEĞİL) ve müvekkil mesajlarını okundu işaretler · D7-3F yabancı tenant müvekkiline personel mesajı 404
 *          → [GÖSTERİM KAPISI] → QR /portal/messages + giriş bilgisi yalnız owner konsolunda → owner TELEFONDAN giriş yapar,
 *          mesajları görür, isterse bir mesaj gönderir → giriş DB'den algılanınca koşucu İKİNCİ personel yanıtını gönderir (D7-3B;
 *          owner rozet/sayaç ve yeni mesajı görür) → inceleme süresi → kapanış.
 * KAPANIŞ: D-4 R03 kuralları (DB ve HTTP ayrı; sürüm verilme sürümüyle karşılaştırılır; belirsiz oluşturma bekler; Recover
 *          ölçülemeyeni 0 yapmaz) — korumalı uç bu pakette `GET /api/portal/messages`. MESAJ KALINTISI: PortalMessage /
 *          PortalNotification satırları SİLİNMEZ (ürünte silme ucu YOK); "saklandı: n satır (sentetik tenant CLOSED)" raporlanır.
 *          Koşucu hiç mesaj yazmadıysa (ya da Recover makbuzunda koşucu mesaj id listesi yoksa) P7-MSG-KEPT boş-doğrulama ile PASS
 *          verilmez: ÖLÇÜLEMEYEN + yalnız rapor. Koşucunun yazdığı mesaj id'leri makbuza (`runnerMessageIds`) yazılır; Recover bunlarla sayar.
 * YAN ETKİ (kaynak R27): müvekkil mesajı → yalnız PortalMessage satırı (bildirim/e-posta/audit/outbox YOK); personel yanıtı →
 *          PortalMessage + PortalNotification satırı (e-posta/audit YOK). Hiçbir adrese gönderim denemesi yoktur.
 * YAPMAZ : e-posta/SMS · forgot/reset/change-password · belge uçları · dış admin uçları (D7-5 = D-8 kapsamı, yalnız not) ·
 *          mesaj/bildirim silme · telefon mesajının İÇERİĞİNİ kanıta yazma (yalnız sayı/uzunluk).
 * SIR    : geçici portal parolası, personel parolası, token'lar, GO ve DB URL hiçbir log/kanıta yazılmaz (H5 temizleyici).
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

const RECEIPT_RECORD = 'EXTACC-D7-SETUP-RECEIPT';
const GO_RE = /^OWNER-GO-CLIENT-EXTACC-D7-\d{8}-R\d{2}$/;
// Gönderim yapabilecek ya da kapsam dışı portal uçları — koşucu ÇAĞIRMAZ (kaynak + çağrı listesi denetimi).
const FORBIDDEN_PORTAL = [/\/portal\/forgot-password/, /\/portal\/reset-password/, /\/portal\/change-password/, /\/portal\/documents/];
// Personel yönetim uçları YALNIZ yerel API'den; dış origin üzerinden admin çağrısı yasaktır (D-8: kenar 403 verir; burada ölçülmez).
const EXTERNAL_ADMIN_RE = /^<DIŞ>\/api\/portal\/admin/;
// Kaynak R27 portal.service.ts resolveCaseReference: kapsam dışı/bulunmayan/biçimsiz caseId → 400 (varlık sızdırılmaz).
const FOREIGN_CASE_EXPECT = 400;

// CANLI SÜRELER SABİT (bağlı DB `hukuk_db` ise ortam yok sayılır); izole testler kısaltabilir.
const LIVE_PARAMS = Object.freeze({ D7_WAIT_MS: 20 * 60 * 1000, D7_POLL_MS: 5000, D7_VIEW_MS: 120000, D7_HTTP_TIMEOUT_MS: 15000, D7_CALL_TIMEOUT_MS: 30000,
  D7_LATE_CREATE_MS: 120000 });
function effectiveParams(env) {
  const live = dbName(env.AH_DATABASE_URL || '') === 'hukuk_db' || (env.D7_EXPECT_DB || '') === 'hukuk_db';
  const p = { live };
  for (const k of Object.keys(LIVE_PARAMS)) { const v = Number(env[k]); p[k] = live ? LIVE_PARAMS[k] : (Number.isFinite(v) && v > 0 ? v : LIVE_PARAMS[k]); }
  return p;
}

function commonGates(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { code: 1, why: 'NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS doğrulaması kapalıyken koşulmaz' };
  const display = env.D7_DISPLAY || 'conout';
  if (display !== 'conout' && display !== 'none') return { code: 4, why: 'D7_DISPLAY conout|none olmalı' };
  if (display === 'none' && ((env.D7_EXPECT_DB || '') === 'hukuk_db' || dbName(env.AH_DATABASE_URL || '') === 'hukuk_db')) return { code: 4, why: 'D7_DISPLAY=none canlı DB ile kullanılamaz' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.D7_EXPECT_DB || env.D7_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.D7_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (!env.D7_API_BASE || env.D7_API_BASE !== env.D7_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  const origin = expectedOriginOf(env.D7_EXPECT_BASE_URL);
  if (!origin) return { code: 4, why: 'D7_EXPECT_BASE_URL https:// şemalı, yolsuz bir origin olmalı' };
  return null;
}
function runGates(env) {
  const c = commonGates(env); if (c) return c;
  if (env.D7_LIVE_CONFIRM !== '1') return { code: 3, why: 'D7_LIVE_CONFIRM=1 gerekli' };
  if (!(env.D7_LIVE_GO_REF && GO_RE.test(env.D7_LIVE_GO_REF.trim()))) return { code: 3, why: 'D7_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-EXTACC-D7-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.D7_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'D7_RUNID 8 hex olmalı' };
  if (env.D7_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId ile eşleşmiyor' };
  return { code: 0, runId, origin: expectedOriginOf(env.D7_EXPECT_BASE_URL), display: env.D7_DISPLAY || 'conout' };
}

/** Portal durumu (salt okuma): hesap + müvekkil erişim bayrağı. */
async function portalState(prisma, clientId) {
  const u = await prisma.clientPortalUser.findUnique({ where: { clientId }, select: { email: true, isActive: true, tokenVersion: true, loginCount: true, lastLoginAt: true } });
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { hasPortalAccess: true } });
  return { exists: !!u, email: u ? u.email : null, isActive: u ? u.isActive : null, tokenVersion: u ? u.tokenVersion : null, loginCount: u ? u.loginCount : null,
    lastLoginAt: u && u.lastLoginAt ? u.lastLoginAt.toISOString() : null, hasPortalAccess: c ? c.hasPortalAccess : null };
}
const caseListMatches = (body, caseId, fileNumber) => Array.isArray(body) && body.length === 1 && body[0] && body[0].id === caseId && body[0].fileNumber === fileNumber;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** MESAJ KALINTISI (salt okuma): bu koşumun müvekkiline ait PortalMessage / PortalNotification satır sayıları. İçerik OKUNMAZ. */
async function messageResidue(prisma, receipt, runnerIds) {
  const rows = await prisma.portalMessage.findMany({ where: { clientId: receipt.clientId, tenantId: receipt.tenantId }, select: { id: true, senderType: true, isRead: true, caseId: true } });
  const own = new Set(runnerIds || []);
  const phone = rows.filter((r) => r.senderType === 'CLIENT' && !own.has(r.id));
  const notes = await prisma.portalNotification.count({ where: { clientId: receipt.clientId } });
  return { portalMessages: rows.length, client: rows.filter((r) => r.senderType === 'CLIENT').length, office: rows.filter((r) => r.senderType === 'OFFICE').length,
    runnerWritten: own.size, phoneSent: phone.length, portalNotifications: notes, deleted: false, note: 'satırlar SİLİNMEDİ (ürünte silme ucu yok); sentetik tenant kapanışıyla erişilemez' };
}

/**
 * PORTAL ERİŞİM KAPANIŞI — D-4 R03 kuralları birebir (korumalı uç: GET /api/portal/messages).
 *   dbClosed = P7-C2 PASS · P7-C2V FAIL değil · P7-C5 PASS ; HTTP = P7-C3L/C3D yeni giriş · P7-C4L/C4D mevcut oturum.
 * Sürüm KENDİSİYLE karşılaştırılmaz (issuedVersion → kapanış öncesi sürüm → ÖLÇÜLEMEYEN). Belirsiz oluşturma bekler.
 */
async function closePortal(R, prisma, base, origin, receipt, P, opts) {
  const o = opts || {};
  const res = { ok: false, dbClosed: false, httpVerified: false, httpFailed: false, identity: null, disableCalls: [], productFinding: null, lateCreate: null };
  const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
  const ident = await assertReceiptIdentity(prisma, receipt);
  res.identity = ident.ok ? 'OK' : ident.reason;
  if (!ident.ok) { res.note = 'kimlik bağı DOĞRULANMADI — hiçbir yazma yapılmadı'; R.check('P7-C1', 'portal erişimi yetkili uçla kapatıldı', false, res.note); return res; }
  let st0 = await portalState(prisma, receipt.clientId);
  if (!st0.exists && o.createUncertain) {
    const t0 = Date.now();
    while (!st0.exists && Date.now() - t0 < P.D7_LATE_CREATE_MS) { await sleep(P.D7_POLL_MS); st0 = await portalState(prisma, receipt.clientId); }
    res.lateCreate = st0.exists ? `hesap ilk sorguda YOKTU, ~${Math.round((Date.now() - t0) / 1000)} sn sonra GÖRÜLDÜ (geç oluşma) — kapatılıyor`
      : `hesap ${Math.round(P.D7_LATE_CREATE_MS / 1000)} sn boyunca görülmedi — geç oluşma DIŞLANAMADI`;
  }
  res.before = st0;
  if (!st0.exists) {
    if (o.createUncertain) { res.lateCreateRisk = true; R.unmeasured('P7-C1', 'portal erişimi yetkili uçla kapatıldı', `${res.lateCreate}; kapanış DOĞRULANMADI`); return res; }
    res.ok = true; res.dbClosed = true; res.note = o.absentNote || 'portal hesabı yok (oluşturma isteği gönderilmedi ya da kesin reddedildi)';
    R.check('P7-C1', 'portal erişimi yetkili uçla kapatıldı', true, res.note); return res;
  }
  let disabledNow = false;
  if (st0.isActive || st0.hasPortalAccess) {
    for (let i = 0; i < 2; i++) {
      if ((!o.session || !o.session.token) && o.sessionProvider) {
        try { o.session = await o.sessionProvider(); res.disableCalls.push('personel oturumu kapatma için açıldı'); } catch (e) { res.disableCalls.push(`personel oturumu açılamadı: ${errText(e, 100)}`); }
      }
      if (!o.session || !o.session.token) { res.disableCalls.push('personel oturumu YOK'); break; }
      const r = await L.AH.httpJson('POST', `${base}/portal/admin/disable-user`, { token: o.session.token, body: { clientId: receipt.clientId }, timeoutMs: P.D7_CALL_TIMEOUT_MS });
      res.disableCalls.push(r.indeterminate ? 'belirsiz' : `HTTP ${r.status}`);
      if (!r.indeterminate && r.status >= 200 && r.status < 300) { disabledNow = true; break; }
      const now = await portalState(prisma, receipt.clientId);
      if (!now.isActive && !now.hasPortalAccess) { res.disableCalls.push('DB: kapalı görüldü'); break; }
      if (!r.indeterminate && r.status < 500) break;
    }
  } else res.disableCalls.push('çağrılmadı — hesap zaten pasif ve erişim kapalı');
  const st1 = await portalState(prisma, receipt.clientId); res.after = st1;
  const flags = st1.isActive === false && st1.hasPortalAccess === false;
  R.check('P7-C1', 'portal erişimi YETKİLİ uçla kapatıldı (admin/disable-user) ya da zaten kapalıydı', disabledNow || (!st0.isActive && !st0.hasPortalAccess) || flags,
    `çağrılar=${JSON.stringify(res.disableCalls)}${res.lateCreate ? ' · ' + res.lateCreate : ''}`);
  R.check('P7-C2', 'DB: portal kullanıcısı pasif · müvekkil portal erişimi kapalı', flags, `isActive=${st1.isActive} hasPortalAccess=${st1.hasPortalAccess}`);
  const issued = Number.isInteger(o.issuedVersion) ? o.issuedVersion : null;
  const openBefore = st0.isActive || st0.hasPortalAccess;
  const ref = issued !== null ? { value: issued, source: 'oturumların verildiği sürüm' } : (openBefore ? { value: st0.tokenVersion, source: 'bu kapanıştan hemen önceki sürüm' } : null);
  res.version = { before: st0.tokenVersion, after: st1.tokenVersion, issued, ref };
  const vdesc = 'DB: tokenVersion, oturumların verildiği (ya da kapanış öncesi) sürümden BÜYÜK';
  if (!ref) R.unmeasured('P7-C2V', vdesc, `hesap zaten kapalıydı ve oturumların verildiği sürüm bilinmiyor — mevcut sürüm (${st1.tokenVersion}) kendisiyle karşılaştırılmaz`);
  else R.check('P7-C2V', vdesc, typeof st1.tokenVersion === 'number' && st1.tokenVersion > ref.value, `${ref.source}=${ref.value} → şimdiki=${st1.tokenVersion}`);

  const tmo = P.D7_HTTP_TIMEOUT_MS;
  let creds = o.creds || null;
  if (!creds && o.credsForClosed && flags) { try { creds = await o.credsForClosed(st1); res.measureCreds = 'pasif hesaba YALNIZ ölçüm için yeni rastgele parola yazıldı (hesap pasif kaldı)'; } catch (e) { res.measureCreds = `ölçüm parolası kurulamadı: ${errText(e, 120)}`; } }
  const nl = creds ? await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const nd = creds ? await L.AH.httpJson('POST', `${origin}/api/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const judge401 = (id, desc, r) => {
    if (!r) return R.unmeasured(id, desc, `kimlik bilgisi yok${res.measureCreds ? ' (' + res.measureCreds + ')' : ''} — ölçülemez`);
    if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı (zaman aşımı/taşıma)');
    if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`);
    return R.check(id, desc, r.status === 401, `HTTP ${r.status}${res.measureCreds && !o.creds ? ' · ' + res.measureCreds : ''}`);
  };
  judge401('P7-C3L', 'kapanış sonrası YENİ portal girişi YEREL 401', nl);
  judge401('P7-C3D', 'kapanış sonrası YENİ portal girişi DIŞ HTTPS 401', nd);
  const el = o.portalToken ? await L.AH.httpJson('GET', `${base}/portal/messages`, { token: o.portalToken, timeoutMs: tmo }) : null;
  const ed = o.portalToken ? await L.AH.httpJson('GET', `${origin}/api/portal/messages`, { token: o.portalToken, timeoutMs: tmo }) : null;
  const judgeSession = (id, desc, r) => {
    if (!r) return R.unmeasured(id, desc, o.noSessionWhy || 'koşumda portal oturumu alınmadı — mevcut oturum ölçülemez');
    if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı (zaman aşımı/taşıma)');
    if (r.status === 200) { res.productFinding = 'ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra MEVCUT oturum mesaj ucuna erişmeye devam ediyor'; return R.check(id, desc, false, 'HTTP 200 — MEVCUT OTURUM KAPANMADI (ürün bulgusu)'); }
    if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`);
    return R.check(id, desc, r.status === 401, `HTTP ${r.status}`);
  };
  judgeSession('P7-C4L', 'kapanış sonrası MEVCUT portal oturumu mesaj ucunda (GET /portal/messages) YEREL 401', el);
  judgeSession('P7-C4D', 'kapanış sonrası MEVCUT portal oturumu mesaj ucunda DIŞ HTTPS 401', ed);
  const st2 = await portalState(prisma, receipt.clientId);
  R.check('P7-C5', 'HTTP ölçümlerinden SONRA DB hâlâ kapalı (pasif + erişim kapalı + sürüm geri gitmedi)',
    st2.isActive === false && st2.hasPortalAccess === false && st2.tokenVersion === st1.tokenVersion, `isActive=${st2.isActive} hasPortalAccess=${st2.hasPortalAccess} sürüm=${st2.tokenVersion}`);
  const httpIds = ['P7-C3L', 'P7-C3D', 'P7-C4L', 'P7-C4D'];
  res.dbClosed = v('P7-C2') === 'PASS' && v('P7-C2V') !== 'FAIL' && v('P7-C5') === 'PASS';
  res.httpFailed = httpIds.some((id) => v(id) === 'FAIL');
  res.httpVerified = httpIds.every((id) => v(id) === 'PASS');
  res.httpUnmeasured = httpIds.filter((id) => v(id) === 'UNMEASURED');
  const required = ['P7-C3L', 'P7-C3D'].concat(o.sessionRequired === false ? [] : ['P7-C4L', 'P7-C4D']);
  res.ok = res.dbClosed && v('P7-C2V') === 'PASS' && !res.httpFailed && required.every((id) => v(id) === 'PASS') && !res.productFinding;
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
/** Recover çıkışı: DB kapanmadı ya da HTTP reddi FAIL → 6 · personel → 5 · hata → 1 · ölçülemeyen varsa 3 (asla 0 değil) · 0. */
function recoverExitCode(out, s) {
  const pc = out.portalClose || {};
  if (!pc.dbClosed || pc.httpFailed || pc.productFinding || pc.lateCreateRisk) return 6;
  if (!(out.closure && out.closure.ok)) return 5;
  if (out.fatal) return 1;
  if (s.fail > 0) return 2;
  if (s.unmeasured > 0) return 3;
  return 0;
}
function recoveryAdvice(out, receiptPath) {
  const need = [];
  const pc = out.portalClose || {};
  if (!pc.ok) {
    if (pc.productFinding) need.push('PORTAL: mevcut oturum kapanmadı (ÜRÜN BULGUSU — Recover bunu düzeltemez; token 7 gün geçerli)');
    else if (pc.lateCreateRisk) need.push('PORTAL: oluşturma isteği belirsiz ve hesap görülmedi — geç oluşma dışlanamadı; birkaç dakika sonra Recover BİR KEZ');
    else if (pc.dbClosed) need.push(`PORTAL: DB kapalı ama HTTP reddi doğrulanmadı (ölçülemeyen: ${(pc.httpUnmeasured || []).join(',') || '-'})`);
    else need.push('PORTAL ERİŞİMİ kapandığı doğrulanmadı');
  }
  if (!(out.closure && out.closure.ok)) need.push('PERSONEL/DOSYA KAPANIŞI doğrulanmadı');
  if (!need.length) return { gerekli: false };
  let onDisk = false; try { onDisk = !!receiptPath && fs.existsSync(receiptPath); } catch (e) { onDisk = false; }
  return { gerekli: true, neden: need, makbuz: receiptPath || null, makbuzDiskte: onDisk,
    adim: 'Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile BİR KEZ; kabul ölçütleri tekrarlanmaz.' };
}

// Mesaj listesi gövdesi: dizi, her öğe bu koşumun yazdığı id'lerden (yalnız bu koşumun mesajları; başka müvekkil/tenant satırı yok).
function listOnlyOwn(body, ownIds) {
  if (!Array.isArray(body)) return { ok: false, why: 'dizi değil' };
  const own = new Set(ownIds); const foreign = body.filter((m) => !m || !own.has(m.id)).length;
  // Boş liste + hiç yazılmamış mesaj "yalnız bu koşumun mesajları" sayılmaz (boş doğrulama yok): en az bir kendi mesajı ŞART.
  return { ok: own.size >= 1 && foreign === 0 && body.length === own.size, why: `kayıt=${body.length} beklenen=${own.size} yabancı=${foreign}` };
}

// ------------------------------------------------------------------ RUN
async function runMode() {
  const g = runGates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const { runId, origin } = g; const base = process.env.D7_API_BASE;
  const pw = process.env.D7_LIVE_LOGIN_PW; const receiptPath = process.env.D7_RECEIPT; const evid = process.env.D7_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: D7_LIVE_LOGIN_PW + D7_RECEIPT + D7_EVID_FILE gerekli.'); process.exit(2); }
  addSecret(pw); addSecret(process.env.D7_LIVE_GO_REF); addSecret(process.env.AH_DATABASE_URL);
  const P = effectiveParams(process.env);
  let con = null;
  if (g.display === 'conout') { try { con = DISPLAY.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok — ${errText(e, 120)} (hiçbir yazma yapılmadı)`); process.exit(4); } }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  // Owner ekranı: canlıda YALNIZ yerel konsol. Gösterimsiz izole testte (display=none; canlı DB ile kapı reddeder) satırlar
  // "telefon taklidi"nin okuduğu test dosyasına yazılır — bu dosya sırların kanıta yazılmadığını ölçen taramanın DIŞINDADIR.
  const showOwner = async (lines) => { if (con) return DISPLAY.show(con, lines); if (g.display === 'none' && process.env.D7_TEST_DISPLAY_SINK) fs.appendFileSync(process.env.D7_TEST_DISPLAY_SINK, lines.join('\n') + '\n'); };
  const portalPw = 'D7p!' + crypto.randomBytes(12).toString('base64url'); addSecret(portalPw);
  const portalEmail = `portal-d7-${runId}@ah-harness.invalid`;
  const fileNumber = `I3-${runId}`;
  const MSG = { client: `D7-${runId}`, clientCase: `D7-${runId}-CASE`, office1: `D7-${runId}-OFFICE-1`, office2: `D7-${runId}-OFFICE-2` };
  const out = { record: 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN', revision: 'R01', runId, apiBase: base, expectedOrigin: origin, params: P, calledEndpoints: [], foreignCaseExpect: FOREIGN_CASE_EXPECT,
    d75Note: 'D7-5 (dış admin uçları 403) bu koşucuda ÇAĞRILMAZ/ÖLÇÜLMEZ — D-8 kapsamı (d8-staff-surface-probe.js). Admin uçları yalnız yerel API ile kullanıldı.' };
  const call = (m, p) => out.calledEndpoints.push(`${m} ${p.replace(base, '<API>').replace(origin, '<DIŞ>')}`);
  const ownIds = []; // koşucunun yazdığı (müvekkil + personel) mesaj id'leri
  let receipt = null; let fatal = null; let session = null; let portalToken = null; let stopped = null; let displayed = false; let loginSeen = false; let baseline = null;
  let createOutcome = null; let issuedVersion = null;
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10));
    // Kapsam dışı dosya: YABANCI sentetik tenantta (ah-<runId>-x) bir dosya — D7-4N için; gerçek müvekkil verisi DEĞİL.
    const fcase = await prisma.case.create({ data: { tenantId: st.foreignTenantId, fileNumber: `I3-${runId}-xf`, type: 'GENERAL_EXECUTION' }, select: { id: true } });
    // Kapsam dışı dosya (2): AYNI sentetik tenantta, setupI3'ün İKİNCİ sentetik müvekkiline (otherClientId) bağlı, showToClient=true bir dosya —
    // D7-4S için: tek kapsam dışılık müvekkil bağıdır. closeAccess tenanttaki tüm ACTIVE dosyaları kapatır (bu da dahil).
    const scase = await prisma.case.create({ data: { tenantId: st.tenantId, clientId: st.otherClientId, showToClient: true, fileNumber: `I3-${runId}-s`, type: 'GENERAL_EXECUTION' }, select: { id: true } });
    receipt = { record: RECEIPT_RECORD, runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId, clientId: st.clientId,
      foreignClientId: st.foreignClientId, caseId: st.caseId, foreignCaseId: fcase.id, sameTenantOtherClientId: st.otherClientId, sameTenantOtherCaseId: scase.id,
      elevUserId: st.actors.elev1.id, elevEmail: st.actors.elev1.email, portalEmail, createdAt: new Date().toISOString() };
    out.receipt = receipt;
    try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); throw new Error('makbuz yazılamadı — portal hesabı AÇILMADI'); }
    call('POST', `${base}/auth/login`);
    session = await L.AH.login(base, st.actors.elev1.email, pw, st.slug);
    if (session && session.token) addSecret(session.token);
    if (!session.ok) throw new Error(`elev1 oturum açamadı (HTTP ${session.status ?? 'belirsiz'})`);
    R.check('P7-00', 'ÖLÇÜM GEÇERLİ: elev1 ADMIN değil', st.actors.elev1.role !== 'ADMIN', `elev1:${st.actors.elev1.role}`);

    // Portal hesabı — gönderim YOK. Deneme makbuza ÖNCE yazılır (D-4 R03).
    receipt.createAttemptedAt = new Date().toISOString();
    try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); delete receipt.createAttemptedAt; throw new Error('makbuza oluşturma denemesi yazılamadı — portal hesabı İSTENMEDİ'); }
    createOutcome = 'attempted';
    call('POST', `${base}/portal/admin/create-user`);
    const cu = await L.AH.httpJson('POST', `${base}/portal/admin/create-user`, { token: session.token, body: { clientId: st.clientId, email: portalEmail, password: portalPw }, timeoutMs: P.D7_CALL_TIMEOUT_MS });
    createOutcome = cu.indeterminate || cu.status >= 500 ? 'uncertain' : (cu.status >= 200 && cu.status < 300 ? 'ok' : 'rejected');
    receipt.createOutcome = createOutcome;
    try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); }
    if (cu.indeterminate) R.unmeasured('P7-01', 'sentetik müvekkile portal hesabı yetkili uçla açıldı (gönderim yok)', 'yanıt alınamadı — hesap SONRADAN oluşmuş olabilir (kapanış bekler)');
    else R.check('P7-01', 'sentetik müvekkile portal hesabı yetkili uçla açıldı (gönderim yok)', cu.status >= 200 && cu.status < 300, `HTTP ${cu.status}${cu.status >= 500 ? ' — hesap oluşmuş olabilir (kapanış bekler)' : ''}`);
    const s1 = await portalState(prisma, st.clientId);
    const p02 = createOutcome === 'ok' && s1.exists && s1.isActive === true && s1.hasPortalAccess === true && s1.email === portalEmail;
    R.check('P7-02', 'DB: portal hesabı aktif · müvekkil portal erişimi açık · e-posta doğru', p02, `var=${s1.exists} aktif=${s1.isActive} erişim=${s1.hasPortalAccess} e-posta eşit=${s1.email === portalEmail}`);
    if (!p02) stopped = 'portal hesabı beklenen durumda değil — mesaj ölçümü ve gösterim YAPILMADI';
    else {
      issuedVersion = s1.tokenVersion; receipt.portalIssuedTokenVersion = s1.tokenVersion;
      try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); stopped = 'makbuza oturum sürümü yazılamadı — gösterim YAPILMADI'; }
    }

    if (!stopped) {
      call('POST', `${base}/portal/login`);
      const pl = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: portalEmail, password: portalPw }, timeoutMs: P.D7_HTTP_TIMEOUT_MS });
      portalToken = pl.body && typeof pl.body.token === 'string' ? pl.body.token : null; if (portalToken) addSecret(portalToken);
      R.check('P7-03L', 'koşucu portal girişi YEREL 201 + oturum', !pl.indeterminate && pl.status === 201 && !!portalToken, pl.indeterminate ? 'yanıt yok' : `HTTP ${pl.status}`);
      if (portalToken) {
        call('GET', '<DIŞ>/api/portal/cases');
        const cd = await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: portalToken, timeoutMs: P.D7_HTTP_TIMEOUT_MS });
        if (cd.indeterminate || cd.status === 503) { R.unmeasured('P7-04D', 'dosya listesi DIŞ HTTPS 200', cd.indeterminate ? 'yanıt yok' : 'HTTP 503 — neden UNKNOWN'); stopped = 'dış zincir ölçülemedi — mesaj ölçümü ve gösterim YAPILMADI'; }
        else R.check('P7-04D', 'dosya listesi DIŞ HTTPS 200 ve YALNIZ bu koşumun dosyası', cd.status === 200 && caseListMatches(cd.body, st.caseId, fileNumber), `HTTP ${cd.status} · eşleşme=${caseListMatches(cd.body, st.caseId, fileNumber)}`);
      } else stopped = 'koşucu portal oturumu alınamadı — mesaj ölçümü ve gösterim YAPILMADI';
    }

    // ---------------------------------------------------------------- MESAJ ÖLÇÜMLERİ (koşucu oturumu; DIŞ HTTPS)
    const msgIds = ['D7-1', 'D7-2', 'D7-4N', 'D7-4S', 'D7-4U', 'D7-4P', 'D7-3', 'D7-3N', 'D7-3U', 'D7-3G', 'D7-3F'];
    if (!stopped) {
      const tmo = P.D7_HTTP_TIMEOUT_MS; const ctmo = P.D7_CALL_TIMEOUT_MS;
      const msgWhere = { clientId: st.clientId, tenantId: st.tenantId };
      const msgCount = () => prisma.portalMessage.count({ where: msgWhere });
      const noteCount = () => prisma.portalNotification.count({ where: { clientId: st.clientId } });
      const count0 = await msgCount(); const notes0 = await noteCount();
      out.messageBaseline = { portalMessages: count0, portalNotifications: notes0 };
      const judgeExt = (id, desc, r, ok, obs) => { if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı (zaman aşımı/taşıma)'); if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`); return R.check(id, desc, ok, obs); };

      // D7-1: müvekkil mesajı (dış) → 201 + DB satırı
      call('POST', '<DIŞ>/api/portal/messages');
      const m1 = await L.AH.httpJson('POST', `${origin}/api/portal/messages`, { token: portalToken, body: { content: MSG.client }, timeoutMs: tmo });
      const m1id = m1.body && typeof m1.body.id === 'string' ? m1.body.id : null; if (m1id) ownIds.push(m1id);
      const row1 = m1id ? await prisma.portalMessage.findUnique({ where: { id: m1id }, select: { clientId: true, tenantId: true, senderType: true, isRead: true, caseId: true, content: true } }) : null;
      const row1ok = !!row1 && row1.clientId === st.clientId && row1.tenantId === st.tenantId && row1.senderType === 'CLIENT' && row1.isRead === false && row1.caseId === null && row1.content === MSG.client;
      judgeExt('D7-1', 'müvekkil mesajı DIŞ HTTPS POST /api/portal/messages 201 + DB satırı (clientId/tenantId/senderType=CLIENT/isRead=false/caseId=null)', m1, m1.status === 201 && row1ok,
        `HTTP ${m1.status} · satır=${!!row1} · alanlar=${row1ok}`);

      // D7-2: liste (dış) → 200, YALNIZ bu koşumun mesajları
      call('GET', '<DIŞ>/api/portal/messages');
      const l1 = await L.AH.httpJson('GET', `${origin}/api/portal/messages`, { token: portalToken, timeoutMs: tmo });
      const l1o = listOnlyOwn(l1.body, ownIds);
      judgeExt('D7-2', 'mesaj listesi DIŞ HTTPS GET /api/portal/messages 200 ve YALNIZ bu koşumun mesajları (id kümesi)', l1, l1.status === 200 && l1o.ok, `HTTP ${l1.status} · ${l1o.why}`);

      // D7-4N / D7-4U: kapsam dışı caseId → 400 (kaynak); satır YAZILMAZ. D7-4P: kendi dosyası → 201.
      const c1 = await msgCount();
      call('POST', '<DIŞ>/api/portal/messages (yabancı tenant caseId)');
      const fx = await L.AH.httpJson('POST', `${origin}/api/portal/messages`, { token: portalToken, body: { content: `${MSG.client}-FOREIGN`, caseId: receipt.foreignCaseId }, timeoutMs: tmo });
      // Ürün yanlışlıkla kabul ederse satır yine bu koşumun yazdığıdır (kusur D7-4N'de yargılanır; liste ölçümlerinde "yabancı" sayılmaz).
      if (fx.body && typeof fx.body.id === 'string') ownIds.push(fx.body.id);
      const fxRows = await prisma.portalMessage.count({ where: { caseId: receipt.foreignCaseId } }); const c2 = await msgCount();
      judgeExt('D7-4N', `kapsam dışı caseId (YABANCI tenant dosyası) ile POST → ${FOREIGN_CASE_EXPECT} (kaynak R27 CLIENT-K1 "Geçersiz dosya referansı"; tanımdaki 404 değil) ve satır YAZILMADI`, fx,
        fx.status === FOREIGN_CASE_EXPECT && fxRows === 0 && c2 === c1, `HTTP ${fx.status} · yabancı caseId satırı=${fxRows} · sayı ${c1}→${c2}`);
      // D7-4S: AYNI tenantta BAŞKA müvekkilin dosyası (showToClient=true; tek kapsam dışılık müvekkil bağı) → 400, satır YAZILMAZ.
      call('POST', '<DIŞ>/api/portal/messages (aynı tenant başka müvekkil caseId)');
      const sx = await L.AH.httpJson('POST', `${origin}/api/portal/messages`, { token: portalToken, body: { content: `${MSG.client}-SAMETENANT`, caseId: receipt.sameTenantOtherCaseId }, timeoutMs: tmo });
      if (sx.body && typeof sx.body.id === 'string') ownIds.push(sx.body.id);
      const sxRows = await prisma.portalMessage.count({ where: { caseId: receipt.sameTenantOtherCaseId } }); const c2s = await msgCount();
      judgeExt('D7-4S', `kapsam dışı caseId (AYNI tenantta BAŞKA müvekkilin dosyası) ile POST → ${FOREIGN_CASE_EXPECT} (yabancı ile aynı cevap) ve satır YAZILMADI`, sx,
        sx.status === FOREIGN_CASE_EXPECT && sxRows === 0 && c2s === c2 && sx.status === fx.status, `HTTP ${sx.status} · başka müvekkil caseId satırı=${sxRows} · sayı ${c2}→${c2s}`);
      const bogus = 'c' + crypto.randomBytes(12).toString('hex');
      call('POST', '<DIŞ>/api/portal/messages (bulunmayan caseId)');
      const ux = await L.AH.httpJson('POST', `${origin}/api/portal/messages`, { token: portalToken, body: { content: `${MSG.client}-UNKNOWN`, caseId: bogus }, timeoutMs: tmo });
      if (ux.body && typeof ux.body.id === 'string') ownIds.push(ux.body.id);
      const c3 = await msgCount();
      judgeExt('D7-4U', `bulunmayan caseId ile POST → ${FOREIGN_CASE_EXPECT} ve satır YAZILMADI (varlık sızdırılmaz: yabancı ile aynı cevap)`, ux, ux.status === FOREIGN_CASE_EXPECT && c3 === c2s && ux.status === fx.status, `HTTP ${ux.status} · sayı ${c2s}→${c3}`);
      call('POST', '<DIŞ>/api/portal/messages (kendi caseId)');
      const px = await L.AH.httpJson('POST', `${origin}/api/portal/messages`, { token: portalToken, body: { content: MSG.clientCase, caseId: st.caseId }, timeoutMs: tmo });
      const pxid = px.body && typeof px.body.id === 'string' ? px.body.id : null; if (pxid) ownIds.push(pxid);
      const pxRow = pxid ? await prisma.portalMessage.findUnique({ where: { id: pxid }, select: { caseId: true, senderType: true } }) : null;
      judgeExt('D7-4P', 'pozitif kontrol: KENDİ dosyasının caseId\'si ile POST 201 ve satırda caseId doğru', px, px.status === 201 && !!pxRow && pxRow.caseId === st.caseId && pxRow.senderType === 'CLIENT', `HTTP ${px.status} · caseId eşit=${!!pxRow && pxRow.caseId === st.caseId}`);

      // D7-3: personel yanıtı YEREL API (elev1) → dış GET'te görünür · D7-3N bildirim satırı +1
      call('POST', `${base}/portal/admin/messages/:clientId`);
      const o1 = await L.AH.httpJson('POST', `${base}/portal/admin/messages/${st.clientId}`, { token: session.token, body: { content: MSG.office1 }, timeoutMs: ctmo });
      const o1id = o1.body && typeof o1.body.id === 'string' ? o1.body.id : null; if (o1id) ownIds.push(o1id);
      const o1row = o1id ? await prisma.portalMessage.findUnique({ where: { id: o1id }, select: { clientId: true, tenantId: true, senderType: true, senderId: true, isRead: true, content: true } }) : null;
      const o1ok = !!o1row && o1row.clientId === st.clientId && o1row.tenantId === st.tenantId && o1row.senderType === 'OFFICE' && o1row.senderId === st.actors.elev1.id && o1row.isRead === false && o1row.content === MSG.office1;
      call('GET', '<DIŞ>/api/portal/messages');
      const l2 = await L.AH.httpJson('GET', `${origin}/api/portal/messages`, { token: portalToken, timeoutMs: tmo });
      const l2o = listOnlyOwn(l2.body, ownIds); const seenOffice = Array.isArray(l2.body) && l2.body.some((m) => m && m.id === o1id && m.senderType === 'OFFICE' && m.content === MSG.office1);
      const o1status = o1.indeterminate ? 'yanıt yok' : `HTTP ${o1.status}`;
      if (o1.indeterminate) R.unmeasured('D7-3', 'personel yanıtı', 'yanıt alınamadı');
      else judgeExt('D7-3', 'personel yanıtı YEREL POST /portal/admin/messages/:clientId (elev1) 201 + DB OFFICE satırı → müvekkil dış GET listesinde görünür (yine yalnız bu koşum)', l2,
        o1.status === 201 && o1ok && l2.status === 200 && l2o.ok && seenOffice, `personel ${o1status} · satır=${o1ok} · liste HTTP ${l2.status} · ${l2o.why} · yanıt görüldü=${seenOffice}`);
      const notes1 = await noteCount();
      const note = await prisma.portalNotification.findFirst({ where: { clientId: st.clientId, type: 'MESAJ' }, orderBy: { createdAt: 'desc' }, select: { linkUrl: true, isRead: true, caseId: true } });
      const d3nDesc = 'personel yanıtı PortalNotification satırı üretti: +1 (type MESAJ, linkUrl /portal/messages) — kaynakta sendMessageFromOffice → createNotification; e-posta YOK';
      // Personel yanıtı yanıtsız kaldıysa bildirim sayısı yargılanamaz (satır geç yazılmış olabilir): FAIL değil ÖLÇÜLEMEYEN.
      if (o1.indeterminate) R.unmeasured('D7-3N', d3nDesc, `personel yanıtı yanıt alınamadı — bildirim ölçülemez (bildirim ${notes0}→${notes1})`);
      else R.check('D7-3N', d3nDesc, notes1 - notes0 === 1 && !!note && note.linkUrl === '/portal/messages', `bildirim ${notes0}→${notes1} · linkUrl=${note ? note.linkUrl : '-'}`);

      // D7-3U: okunmamış sayacı 1 → mark-read → 0 (+DB isRead/readAt). Herhangi bir adım yanıtsızsa ÖLÇÜLEMEYEN (FAIL değil).
      call('GET', '<DIŞ>/api/portal/messages/unread-count');
      const u1 = await L.AH.httpJson('GET', `${origin}/api/portal/messages/unread-count`, { token: portalToken, timeoutMs: tmo });
      call('POST', '<DIŞ>/api/portal/messages/mark-read');
      const mr = await L.AH.httpJson('POST', `${origin}/api/portal/messages/mark-read`, { token: portalToken, body: {}, timeoutMs: tmo });
      call('GET', '<DIŞ>/api/portal/messages/unread-count');
      const u2 = await L.AH.httpJson('GET', `${origin}/api/portal/messages/unread-count`, { token: portalToken, timeoutMs: tmo });
      const o1after = o1id ? await prisma.portalMessage.findUnique({ where: { id: o1id }, select: { isRead: true, readAt: true } }) : null;
      const cnt = (r) => (r.body && typeof r.body.count === 'number' ? r.body.count : null);
      const d3uDesc = 'okunmamış sayacı DIŞ: unread-count 1 → mark-read 2xx → unread-count 0; DB: personel mesajı isRead=true + readAt';
      const d3uPending = o1.indeterminate ? 'personel yanıtı' : (u1.indeterminate ? 'ilk unread-count' : (mr.indeterminate ? 'mark-read' : null));
      if (d3uPending) R.unmeasured('D7-3U', d3uDesc, `${d3uPending} çağrısı yanıt alınamadı (zaman aşımı/taşıma) — sayaç yargılanamaz`);
      else judgeExt('D7-3U', d3uDesc, u2,
        u1.status === 200 && cnt(u1) === 1 && mr.status >= 200 && mr.status < 300 && u2.status === 200 && cnt(u2) === 0 && !!o1after && o1after.isRead === true && o1after.readAt !== null,
        `unread ${cnt(u1)} → mark-read HTTP ${mr.status} → unread ${cnt(u2)} · DB isRead=${o1after ? o1after.isRead : '-'}`);

      // D7-3G: personel GET (yerel) 200, gövde ÜRÜN SÖZLEŞMESİ `{ client, messages }` (kaynak getClientMessages; çıplak dizi DEĞİL) +
      //        müvekkil mesajlarını okundu işaretler (ürün yan etkisi) · D7-3F: yabancı tenant müvekkili → 404
      call('GET', `${base}/portal/admin/messages/:clientId`);
      const ag = await L.AH.httpJson('GET', `${base}/portal/admin/messages/${st.clientId}`, { token: session.token, timeoutMs: ctmo });
      const agList = ag.body && typeof ag.body === 'object' && !Array.isArray(ag.body) && Array.isArray(ag.body.messages) ? ag.body.messages : null;
      const agShape = agList ? '{client,messages}' : (Array.isArray(ag.body) ? 'çıplak dizi (ürün sözleşmesi DEĞİL)' : 'tanınmadı');
      const agOwn = agList ? ownIds.filter((id) => agList.some((m) => m && m.id === id)).length : 0;
      const clientUnreadAfter = await prisma.portalMessage.count({ where: { ...msgWhere, senderType: 'CLIENT', isRead: false } });
      if (ag.indeterminate) R.unmeasured('D7-3G', 'personel GET', 'yanıt alınamadı');
      else R.check('D7-3G', 'personel YEREL GET /portal/admin/messages/:clientId 200: gövde { client, messages } ve bu koşumun tüm mesajları listede; müvekkil mesajları okundu işaretlendi (kaynak yan etkisi)',
        ag.status === 200 && !!agList && agOwn === ownIds.length && clientUnreadAfter === 0,
        `HTTP ${ag.status} · gövde=${agShape} · listede=${agOwn}/${ownIds.length} · okunmamış müvekkil mesajı=${clientUnreadAfter}`);
      call('POST', `${base}/portal/admin/messages/:foreignClientId`);
      const fo = await L.AH.httpJson('POST', `${base}/portal/admin/messages/${st.foreignClientId}`, { token: session.token, body: { content: `${MSG.office1}-FOREIGN` }, timeoutMs: ctmo });
      const foRows = await prisma.portalMessage.count({ where: { clientId: st.foreignClientId } });
      if (fo.indeterminate) R.unmeasured('D7-3F', 'yabancı müvekkile personel mesajı', 'yanıt alınamadı');
      else R.check('D7-3F', 'personel, YABANCI tenant müvekkiline mesaj gönderemez: 404 ve satır YOK (tenant kapsamı)', fo.status === 404 && foRows === 0, `HTTP ${fo.status} · yabancı müvekkil satırı=${foRows}`);

      // Koşucunun yazdığı mesaj id'leri makbuza: Recover kalıntıyı bunlarla sayar (yoksa yalnız rapor / ÖLÇÜLEMEYEN).
      receipt.runnerMessageIds = ownIds.slice();
      try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); }
      const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
      // GÖSTERİM KAPISI: oturum, dış liste ve temel mesaj akışı PASS değilse giriş bilgisi GÖSTERİLMEZ, telefon BEKLENMEZ.
      const GATE = ['P7-03L', 'P7-04D', 'D7-1', 'D7-2', 'D7-3', 'D7-3U'];
      out.displayGate = GATE.map((id) => `${id}=${v(id) || 'YOK'}`);
      if (!GATE.every((id) => v(id) === 'PASS')) stopped = `gösterim öncesi zorunlu kontroller PASS değil (${GATE.filter((id) => v(id) !== 'PASS').join(',')}) — giriş bilgisi GÖSTERİLMEDİ, telefon BEKLENMEDİ`;
    } else {
      for (const id of msgIds) R.unmeasured(id, 'mesaj ölçümü', stopped);
    }

    // ---------------------------------------------------------------- OWNER TELEFONU
    if (!stopped) {
      baseline = await portalState(prisma, st.clientId); out.baseline = { loginCount: baseline.loginCount, tokenVersion: baseline.tokenVersion };
      const qr = DISPLAY.renderQr(`${origin}/portal/messages`);
      await showOwner([
        '============ EXTACC D-7 — YALNIZ OWNER EKRANI (kayda ALINMAZ) ============',
        'TELEFON: Wi-Fi KAPALI, mobil veri AÇIK, gizli sekme. QR portal MESAJ sayfasını açar (giriş istenir).', '', ...qr.lines, '', `${origin}/portal/messages`, `Giriş sayfası: ${origin}/portal/login`, '',
        'Giriş bilgisi (yalnız bu koşum için; koşum sonunda kapatma adımı çalışır, sonucu owner bloğu bildirir):', `    E-posta : ${portalEmail}`, `    Parola  : ${portalPw}`, '',
        `Girişten sonra mesaj sayfasında bu koşumun ÜÇ mesajı görünmeli: ${MSG.client} · ${MSG.clientCase} · ${MSG.office1}`,
        'İsterseniz telefondan KISA bir mesaj gönderin (kişisel veri YAZMAYIN; içerik kanıta yazılmaz, yalnız sayısı).',
        `Giriş algılanınca koşucu İKİNCİ bir personel yanıtı gönderir (${MSG.office2}); rozet/okunmamış sayacını ve yeni mesajı izleyin.`,
        `Girişi BİR KEZ yapın. Giriş algılanınca ${Math.round(P.D7_VIEW_MS / 1000)} sn inceleme süresi verilir; sonra ekran temizlenir ve kapatma adımı çalışır.`,
        'Owner bloğu sorduğunda telefonda sayfayı YENİLEYİN ve ekranda gördüğünüzü yanıtlayın.',
        `Bekleme: en fazla ${Math.round(P.D7_WAIT_MS / 60000)} dk.`,
      ]);
      displayed = true;
      R.check('P7-DISP', 'giriş bilgisi + mesaj sayfası QR yalnız yerel konsola gösterildi', true, g.display === 'conout' ? 'CONOUT$' : 'gösterimsiz izole test');
      const t0 = Date.now();
      for (;;) {
        const s = await portalState(prisma, st.clientId);
        if (typeof s.loginCount === 'number' && s.loginCount > baseline.loginCount) { loginSeen = true; out.phoneLogin = { loginCountDelta: s.loginCount - baseline.loginCount }; break; }
        if (Date.now() - t0 >= P.D7_WAIT_MS) break;
        await sleep(P.D7_POLL_MS);
      }
      out.wait = { loginSeen, elapsedMs: Date.now() - t0, windowMs: P.D7_WAIT_MS };
      if (loginSeen) {
        R.check('P7-WAIT', 'koşucu dışında BAŞARILI portal girişi pencere içinde görüldü (DB loginCount)', out.phoneLogin.loginCountDelta >= 1,
          `artış=${out.phoneLogin.loginCountDelta} · ~${Math.round((Date.now() - t0) / 1000)} sn (cihaz/ağ = owner beyanı)`);
        // D7-3B: telefon girişinden SONRA ikinci personel yanıtı — owner rozet/sayacı ve yeni mesajı telefonda görür (beyan).
        call('POST', `${base}/portal/admin/messages/:clientId (2. yanıt)`);
        const o2 = await L.AH.httpJson('POST', `${base}/portal/admin/messages/${st.clientId}`, { token: session.token, body: { content: MSG.office2 }, timeoutMs: P.D7_CALL_TIMEOUT_MS });
        const o2id = o2.body && typeof o2.body.id === 'string' ? o2.body.id : null; if (o2id) ownIds.push(o2id);
        if (o2id) { receipt.runnerMessageIds = ownIds.slice(); try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); } }
        const o2row = o2id ? await prisma.portalMessage.findUnique({ where: { id: o2id }, select: { clientId: true, tenantId: true, senderType: true, senderId: true, content: true } }) : null;
        const o2ok = !!o2row && o2row.clientId === st.clientId && o2row.tenantId === st.tenantId && o2row.senderType === 'OFFICE' && o2row.senderId === st.actors.elev1.id && o2row.content === MSG.office2;
        call('GET', '<DIŞ>/api/portal/messages/unread-count (2. yanıt sonrası)');
        const u3 = await L.AH.httpJson('GET', `${origin}/api/portal/messages/unread-count`, { token: portalToken, timeoutMs: P.D7_HTTP_TIMEOUT_MS });
        const u3c = u3.body && typeof u3.body.count === 'number' ? u3.body.count : null;
        if (o2.indeterminate) R.unmeasured('D7-3B', 'telefon girişinden sonra 2. personel yanıtı', 'yanıt alınamadı');
        else R.check('D7-3B', 'telefon girişinden SONRA 2. personel yanıtı yerel 201 + DB OFFICE satırı (clientId/tenantId/senderId/content); okunmamış sayacı raporlandı (telefon sayfası mark-read çağırabilir — yargılanmaz)', o2.status === 201 && o2ok,
          `HTTP ${o2.status} · satır=${o2ok} · unread-count(2. yanıt sonrası)=${u3c === null ? '-' : u3c}`);
        await showOwner(['', `Giriş algılandı; 2. personel yanıtı gönderildi (${MSG.office2}). ${Math.round(P.D7_VIEW_MS / 1000)} sn sonra kapatma adımı çalışacak; mesaj sayfasını ve rozeti şimdi inceleyin.`]);
        await sleep(P.D7_VIEW_MS);
        const o2after = o2id ? await prisma.portalMessage.findUnique({ where: { id: o2id }, select: { isRead: true } }) : null;
        out.phoneObservation = { office2ReadByPhone: o2after ? o2after.isRead : null, note: 'yalnız gözlem: telefon sayfası mark-read çağırdıysa true; owner beyanıyla birlikte değerlendirilir' };
      } else {
        R.unmeasured('P7-WAIT', 'başarılı portal girişi pencere içinde görüldü', 'giriş görülmedi — owner beyanı ile ayrılır (açılamadı / denenmedi / başarısız)');
        R.unmeasured('D7-3B', 'telefon girişinden sonra 2. personel yanıtı', 'telefon girişi görülmedi — gönderilmedi');
      }
    } else {
      for (const [id, desc] of [['P7-DISP', 'giriş bilgisi gösterildi'], ['P7-WAIT', 'başarılı portal girişi görüldü'], ['D7-3B', '2. personel yanıtı']]) R.unmeasured(id, desc, stopped);
    }
  } catch (e) { fatal = errText(e, 300); }
  finally {
    if (con) { try { await DISPLAY.clear(con); } catch (e) { out.displayClearError = errText(e, 120); } DISPLAY.close(con); }
    try {
      out.portalClose = receipt ? await closePortal(R, prisma, base, origin, receipt, P, {
        session, creds: createOutcome ? { email: portalEmail, password: portalPw } : null, portalToken, issuedVersion,
        sessionRequired: !!portalToken || displayed, createUncertain: createOutcome === 'attempted' || createOutcome === 'uncertain',
        noSessionWhy: displayed ? 'gösterim yapıldı ama koşucu oturumu yok — mevcut oturum ölçülemez' : 'koşumda portal oturumu alınmadı ve giriş bilgisi gösterilmedi — mevcut oturum ölçülemez' })
        : { ok: true, nothingCreated: true };
      out.createOutcome = createOutcome;
    } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
    try { out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true }; }
    catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
    if (receipt) R.check('U-CLOSE', 'personel kullanıcıları pasif (tokenVersion++) + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
    // MESAJ KALINTISI: satırlar SİLİNMEZ; "saklandı" raporlanır (silinmiş gibi DEĞİL). Koşucunun yazdığı satırların tamamı yerinde olmalı.
    // Koşucu hiç mesaj yazmadıysa 0===0 boş-doğrulaması PASS SAYILMAZ: ÖLÇÜLEMEYEN + yalnız rapor.
    if (receipt) {
      try {
        const res = await messageResidue(prisma, receipt, ownIds); out.messageResidue = res;
        const keptText = `saklandı: ${res.portalMessages} mesaj (koşucu ${res.runnerWritten} · telefon ${res.phoneSent}) + ${res.portalNotifications} bildirim satırı (sentetik tenant CLOSED; portal pasif) — SİLİNMEDİ`;
        if (!ownIds.length) R.unmeasured('P7-MSG-KEPT', 'mesaj kalıntısı: satırlar SİLİNMEDİ (silme ucu yok)', `koşucu mesaj yazmadı — kalıntı yalnız raporlandı: ${keptText}`);
        else {
          const own = await prisma.portalMessage.count({ where: { id: { in: ownIds } } });
          R.check('P7-MSG-KEPT', 'mesaj kalıntısı: koşucunun yazdığı PortalMessage satırlarının TAMAMI yerinde; PortalMessage/PortalNotification SİLİNMEDİ (silme ucu yok) — saklandı, sentetik tenant CLOSED',
            own === ownIds.length && res.deleted === false, `yerinde=${own}/${ownIds.length} · ${keptText}`);
        }
      } catch (e) { R.unmeasured('P7-MSG-KEPT', 'mesaj kalıntısı', `okunamadı: ${errText(e, 120)}`); }
    }
    if (receipt) R.check('P7-D9', 'PORTAL erişim kapanışı birleşik: DB kapalı + gerekli HTTP reddi (yeni giriş yerel/dış 401 + MEVCUT oturum mesaj ucunda yerel/dış 401) + personel/dosya kapanışı',
      !!(out.portalClose && out.portalClose.ok) && !!(out.closure && out.closure.ok), `portal=${!!(out.portalClose && out.portalClose.ok)} personel=${!!(out.closure && out.closure.ok)}${out.portalClose && out.portalClose.productFinding ? ' · ' + out.portalClose.productFinding : ''}`);
    out.productFinding = out.portalClose ? out.portalClose.productFinding || null : null;
    out.forbiddenEndpointCalled = out.calledEndpoints.some((c) => FORBIDDEN_PORTAL.some((re) => re.test(c)));
    out.externalAdminCalled = out.calledEndpoints.some((c) => EXTERNAL_ADMIN_RE.test(c.replace(/^[A-Z]+ /, '')));
    try {
      const after = receipt ? await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]) : null;
      out.isolationAfter = after; const b = out.isolationBefore;
      if (after && b) R.check('U-ISO', 'bu koşumun iki sentetik tenantı DIŞINDAKİ tenantlarda tenant başına kullanıcı ve müvekkil SAYILARI önce/sonra aynı (yalnız sayı)',
        after.digest === b.digest, `önce=${b.digest}/${b.tenants} sonra=${after.digest}/${after.tenants}`);
      else R.unmeasured('U-ISO', 'sayım dağılımı', 'ölçülemedi');
    } catch (e) { R.unmeasured('U-ISO', 'sayım dağılımı', `okunamadı: ${errText(e, 120)}`); }
    const s = R.summary(`EXTACC D-7 PORTAL MESAJ AKIŞI (runId=${runId})`);
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
  if (process.env.D7_RECOVER_CONFIRM !== '1') { console.error('REDDEDİLDİ: D7_RECOVER_CONFIRM=1 gerekli'); process.exit(3); }
  const base = process.env.D7_API_BASE; const origin = expectedOriginOf(process.env.D7_EXPECT_BASE_URL);
  const pw = process.env.D7_LIVE_LOGIN_PW; const evid = process.env.D7_EVID_FILE; const receiptPath = process.env.D7_RECEIPT;
  if (!pw || !evid || !receiptPath) { console.error('REDDEDİLDİ: D7_LIVE_LOGIN_PW + D7_EVID_FILE + D7_RECEIPT gerekli'); process.exit(2); }
  addSecret(pw); addSecret(process.env.AH_DATABASE_URL);
  const P = effectiveParams(process.env);
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error('REDDEDİLDİ: makbuz okunamadı'); process.exit(4); }
  if (!receipt || receipt.record !== RECEIPT_RECORD || !receipt.elevUserId || !receipt.elevEmail) { console.error('REDDEDİLDİ: makbuz biçimi/alanları eksik'); process.exit(4); }
  if (process.env.D7_RUNID && String(process.env.D7_RUNID).toLowerCase() !== String(receipt.runId).toLowerCase()) { console.error('REDDEDİLDİ: runId makbuzla eşleşmiyor'); process.exit(4); }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'EXTACC-D7-RECOVER', revision: 'R01', runId: receipt.runId, note: 'kabul ölçütleri KOŞULMADI; yalnız kapanış (mesaj satırları SİLİNMEZ)' };
  let session = null; let before = null;
  const createUncertain = !!receipt.createAttemptedAt && receipt.createOutcome !== 'ok' && receipt.createOutcome !== 'rejected';
  out.createEvidence = { attemptedAt: receipt.createAttemptedAt || null, outcome: receipt.createOutcome || null, uncertain: createUncertain };
  const elevOf = () => prisma.user.findFirst({ where: { id: receipt.elevUserId, tenantId: receipt.tenantId, email: receipt.elevEmail }, select: { id: true } });
  const openStaffSession = async () => {
    if (session && session.token) return session;
    const elev = await elevOf();
    if (!elev) throw new Error('makbuzdaki kullanıcı sentetik tenantta yok');
    await prisma.user.update({ where: { id: elev.id }, data: { passwordHash: await bcrypt.hash(pw, 10), isActive: true } });
    out.temporaryAccess = 'makbuzdaki sentetik personele geçici erişim; kapanışta yeniden kapatıldı';
    session = await L.AH.login(base, receipt.elevEmail, pw, receipt.tenantSlug);
    if (session && session.token) addSecret(session.token);
    return session;
  };
  try {
    const ident = await assertReceiptIdentity(prisma, receipt);
    if (!ident.ok) { console.error(`REDDEDİLDİ: kimlik bağı doğrulanmadı (${ident.reason}) — HİÇBİR yazma yapılmadı`); await prisma.$disconnect().catch(() => {}); process.exit(4); }
    before = await portalState(prisma, receipt.clientId);
    if (before.exists && (before.isActive || before.hasPortalAccess)) {
      if (!(await elevOf())) { console.error('REDDEDİLDİ: makbuzdaki kullanıcı sentetik tenantta yok — yazma yapılmadı'); await prisma.$disconnect().catch(() => {}); process.exit(4); }
      await openStaffSession();
    }
  } catch (e) { out.fatal = errText(e, 200); }
  const issued = Number.isInteger(receipt.portalIssuedTokenVersion) ? receipt.portalIssuedTokenVersion : null;
  out.versionEvidence = { issuedFromReceipt: issued, beforeRecover: before ? before.tokenVersion : null };
  try {
    out.portalClose = await closePortal(R, prisma, base, origin, receipt, P, {
      session, sessionProvider: openStaffSession, issuedVersion: issued, sessionRequired: true, createUncertain,
      absentNote: receipt.createAttemptedAt ? `Recover anında portal hesabı YOK (oluşturma sonucu kesin: ${receipt.createOutcome})` : 'portal hesabı yok; makbuzda oluşturma denemesi kaydı yok',
      noSessionWhy: 'Recover: koşumun oturumu saklanmaz (sır) — mevcut oturum reddi Recover\'da ÖLÇÜLEMEZ; Run kanıtındaki P7-C4 satırlarına bakın',
      credsForClosed: async (st) => {
        const tmp = 'D7r!' + crypto.randomBytes(12).toString('base64url'); addSecret(tmp);
        const u = await prisma.clientPortalUser.updateMany({ where: { clientId: receipt.clientId, isActive: false }, data: { passwordHash: await bcrypt.hash(tmp, 10) } });
        if (u.count !== 1) throw new Error(`pasif hesap sayısı ${u.count}`);
        return { email: st.email, password: tmp };
      } });
  } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
  try { out.closure = await closeAccess(prisma, receipt); } catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
  R.check('U-CLOSE', 'personel kullanıcıları pasif + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
  // Kalıntı: makbuzdaki koşucu mesaj id'leri (runnerMessageIds) varsa GERÇEK sayım; yoksa sabit koşullu PASS yerine ÖLÇÜLEMEYEN + rapor.
  try {
    const ids = Array.isArray(receipt.runnerMessageIds) ? receipt.runnerMessageIds.filter((x) => typeof x === 'string') : [];
    const res = await messageResidue(prisma, receipt, ids); out.messageResidue = res;
    const keptText = `saklandı: ${res.portalMessages} mesaj (koşucu ${res.runnerWritten} · telefon ${res.phoneSent}) + ${res.portalNotifications} bildirim satırı (sentetik tenant CLOSED) — SİLİNMEDİ`;
    if (!ids.length) R.unmeasured('P7-MSG-KEPT', 'mesaj kalıntısı (satırlar SİLİNMEZ; silme ucu yok)', `makbuzda koşucu mesaj id listesi yok — kalıntı yalnız raporlandı: ${keptText}`);
    else {
      const own = await prisma.portalMessage.count({ where: { id: { in: ids } } });
      R.check('P7-MSG-KEPT', 'mesaj kalıntısı: makbuzdaki koşucu mesaj satırlarının TAMAMI yerinde (satırlar SİLİNMEZ; silme ucu yok)', own === ids.length && res.deleted === false, `yerinde=${own}/${ids.length} · ${keptText}`);
    }
  } catch (e) { R.unmeasured('P7-MSG-KEPT', 'mesaj kalıntısı', `okunamadı: ${errText(e, 120)}`); }
  const s = R.summary(`EXTACC D-7 KURTARMA (runId=${receipt.runId})`);
  out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
  out.exitCode = recoverExitCode(out, s);
  out.recovery = recoveryAdvice(out, receiptPath);
  if (out.recovery.gerekli && out.exitCode === 3) out.recovery.adim = 'Recover TEKRARLANMAZ: DB kapalı; Recover içinde ölçülemeyen satırlar (mevcut oturum) Run kanıtından değerlendirilir — CLIENT inceler.';
  out.exitCode = writeEvidenceOrDemote(evid, out);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = out.exitCode;
}

if (require.main === module) {
  const mode = String(process.env.D7_MODE || 'run').toLowerCase();
  if (mode === 'run') runMode();
  else if (mode === 'recover') recoverMode();
  else { console.error(`REDDEDİLDİ: bilinmeyen D7_MODE '${mode}'`); process.exit(1); }
}
module.exports = { commonGates, runGates, LIVE_PARAMS, effectiveParams, FORBIDDEN_PORTAL, EXTERNAL_ADMIN_RE, FOREIGN_CASE_EXPECT, RECEIPT_RECORD, caseListMatches, listOnlyOwn, recoverExitCode, exitCodeOf };
void scrub;
