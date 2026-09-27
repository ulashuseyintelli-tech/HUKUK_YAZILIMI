'use strict';
/*
 * EXTACC R01 — DIŞ ERİŞİM INTAKE ZİNCİRİ CANLI KABULÜ: D-1 / D-2 / D-3 / D-9 (client-external-access-r01 §7).
 *
 * AKIŞ   : kurulum + makbuz → GÖNDERİMSİZ bağlantı (30 dk geçerli, tek kullanım) → URL kapısı + yerel/dış GET 200 →
 *          adres + QR YALNIZ owner konsolunda (extacc-display.js) → owner TELEFONDAN (mobil veri) açar ve BİR KEZ gönderir →
 *          betik DB'yi SALT OKUMA yoklar → D-3 doğrulaması → kapanış (iptal/USED + yerel/dış 404 + DB durumu + kullanıcı/
 *          dosya kapanışı) → geç gönderim yoklaması.
 * YAPMAZ : public POST (betik HİÇ göndermez; tek gönderim owner telefonundan) · gönderim yapan bağlantı uçları · e-posta/
 *          SMS · yönlendirme izleme · 503 için neden teşhisi (neden UNKNOWN; koşum görüntülemeden ÖNCE durur).
 * KANIT  : mobil ağ kanıtı DEĞİLDİR — `ipHash` yalnız loopback/unknown değerlerinin DIŞLANMASI olarak ölçülür; ham IP ya da
 *          ipHash kanıta yazılmaz. Mobil ağ = telefon gözlemi + owner beyanı (owner bloğu ayrı kaydeder).
 *          Gönderim satırı yoksa sonuç ÖLÇÜLEMEYEN'dir: "owner göndermedi" ile "sayfa başarı gösterdi ama satır yok
 *          (honeypot vb.)" DB'den ayırt EDİLEMEZ → owner beyanıyla ayrılır.
 * YENİDEN KULLANIM (client-h5-intake-url-r01/scripts/h5-url-live-run.js R03): sır temizleyici, URL kökeni, gönderim
 *          uçları yasağı, revokeOwnLinks (belirsiz oluşturma kanıtı), finalizeClosure, kanıt yazma kuralı, çıkış önceliği.
 * ÇIKIŞ  : 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 7 KANIT YAZILAMADI · 5 KAPANIŞ ·
 *          6 İPTAL/BAĞLANTI AÇIK (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0).
 */
const fs = require('fs'); const crypto = require('crypto'); const path = require('path');
const H5 = require('../../client-h5-intake-url-r01/scripts/h5-url-live-run');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { assertReceiptIdentity } = require('../../client-live-acceptance-i12-r01/scripts/i12-live-identity');
const DISPLAY = require('./extacc-display');
const { L, isolationFingerprint, dbName } = I13;
const { scrub, addSecret, expectedOriginOf, DISPATCH_ENDPOINT_FORBIDDEN, exitCodeOf, errText, sha, writeJson,
  boundedGet, judgeValid, finalizeClosure, recoveryAdvice, writeEvidenceOrDemote } = H5;

const RECEIPT_RECORD = 'EXTACC-SETUP-RECEIPT';
const GO_RE = /^OWNER-GO-CLIENT-EXTACC-\d{8}-R\d{2}$/;
const num = (name, dflt) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n : dflt; };
const LOOPBACK_HASHES = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'unknown', ''].map((v) => crypto.createHash('sha256').update(v).digest('hex'));

// ------------------------------------------------------------------ kapılar
function commonGates(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { code: 1, why: 'NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS doğrulaması kapalıyken koşulmaz' };
  const display = env.EXA_DISPLAY || 'conout';
  if (display !== 'conout' && display !== 'none') return { code: 4, why: 'EXA_DISPLAY conout|none olmalı' };
  // Gösterimsiz mod YALNIZ izole test içindir: canlı DB adıyla reddedilir.
  if (display === 'none' && (env.EXA_EXPECT_DB || '') === 'hukuk_db') return { code: 4, why: 'EXA_DISPLAY=none canlı DB ile kullanılamaz' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.EXA_EXPECT_DB || env.EXA_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.EXA_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (!env.EXA_API_BASE || env.EXA_API_BASE !== env.EXA_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  return null;
}
function runGates(env) {
  const c = commonGates(env); if (c) return c;
  if (env.EXA_LIVE_CONFIRM !== '1') return { code: 3, why: 'EXA_LIVE_CONFIRM=1 gerekli' };
  if (!(env.EXA_LIVE_GO_REF && GO_RE.test(env.EXA_LIVE_GO_REF.trim()))) return { code: 3, why: 'EXA_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-EXTACC-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.EXA_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'EXA_RUNID 8 hex olmalı' };
  if (env.EXA_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId ile eşleşmiyor' };
  const origin = expectedOriginOf(env.EXA_EXPECT_BASE_URL);
  if (!origin) return { code: 4, why: 'EXA_EXPECT_BASE_URL https:// şemalı, yolsuz bir origin olmalı' };
  return { code: 0, runId, origin, display: env.EXA_DISPLAY || 'conout' };
}

// ------------------------------------------------------------------ salt okuma ölçümler
async function canonicalSnapshot(prisma, receipt) {
  const [debtorAddresses, intel, notif, infoReq, deliveries] = await Promise.all([
    prisma.debtorAddress.findMany({ where: { debtorId: receipt.debtorId }, orderBy: { id: 'asc' } }),
    prisma.clientIntelStatement.findMany({ where: { tenantId: receipt.tenantId }, orderBy: { id: 'asc' } }),
    prisma.clientNotification.count({ where: { tenantId: receipt.tenantId } }),
    prisma.clientInfoRequest.count({ where: { tenantId: receipt.tenantId } }),
    prisma.clientIntakeLinkDelivery.count({ where: { tenantId: receipt.tenantId } }),
  ]);
  return { canonical: sha(JSON.stringify({ debtorAddresses, intel })), debtorAddresses: debtorAddresses.length, intel: intel.length,
    sideEffects: { clientNotification: notif, clientInfoRequest: infoReq, clientIntakeLinkDelivery: deliveries } };
}
const submissionsOf = (prisma, linkId) => prisma.clientIntakeSubmission.findMany({ where: { intakeLinkId: linkId },
  select: { id: true, tenantId: true, caseId: true, clientId: true, status: true, sourceMeta: true, fields: { select: { category: true, value: true, reviewStatus: true } } } });

/** D-3: salt okuma işlem içinde gönderimin doğru yere, doğru biçimde düştüğünü ölçer. Ham IP/ipHash kanıta YAZILMAZ. */
async function verifyD3(R, prisma, receipt, linkId, marker, before) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const subs = await submissionsOf(tx, linkId);
    R.check('E-10', 'bağlantıya bağlı TEK gönderim', subs.length === 1, `gönderim sayısı=${subs.length}`);
    const s = subs[0];
    if (!s) { for (const id of ['E-11', 'E-12', 'E-13', 'E-17']) R.unmeasured(id, 'gönderim alanları', 'gönderim yok'); }
    else {
      R.check('E-11', 'gönderim tenant/dosya/müvekkil = makbuz', s.tenantId === receipt.tenantId && s.caseId === receipt.caseId && s.clientId === receipt.clientId,
        `tenant=${s.tenantId === receipt.tenantId} dosya=${s.caseId === receipt.caseId} müvekkil=${s.clientId === receipt.clientId}`);
      R.check('E-12', 'statü CLIENT_SUBMITTED', s.status === 'CLIENT_SUBMITTED', `statü=${s.status}`);
      const f = s.fields || [];
      R.check('E-13', 'tek alan: ADDRESS, değer işaret metnini içerir, inceleme PENDING', f.length === 1 && f[0].category === 'ADDRESS' && String(f[0].value).includes(marker) && f[0].reviewStatus === 'PENDING',
        `alan sayısı=${f.length} · kategori=${f[0] ? f[0].category : '-'} · işaret=${f[0] ? String(f[0].value).includes(marker) : false} · inceleme=${f[0] ? f[0].reviewStatus : '-'}`);
      const ipHash = s.sourceMeta && typeof s.sourceMeta === 'object' ? String(s.sourceMeta.ipHash || '') : '';
      R.check('E-17', 'ipHash loopback/unknown DEĞİL (yalnız DIŞLAMA; mobil ağ kanıtı DEĞİLDİR)', ipHash.length === 64 && !LOOPBACK_HASHES.includes(ipHash),
        `ipHash var=${ipHash.length === 64} · loopback/unknown dışı=${ipHash.length === 64 && !LOOPBACK_HASHES.includes(ipHash)} (değer kaydedilmedi)`);
    }
    const link = await tx.clientIntakeLink.findUnique({ where: { id: linkId }, select: { status: true, useCount: true, maxUses: true } });
    R.check('E-14', 'bağlantı USED · useCount=1 · maxUses=1', !!link && link.status === 'USED' && link.useCount === 1 && link.maxUses === 1,
      `durum=${link ? link.status : 'YOK'} useCount=${link ? link.useCount : '-'} maxUses=${link ? link.maxUses : '-'}`);
    const after = await canonicalSnapshot(tx, receipt);
    R.check('E-15', 'kanonik hedefler (DebtorAddress, ClientIntelStatement) önce/sonra AYNI', after.canonical === before.canonical,
      `önce=${before.canonical.slice(0, 12)} sonra=${after.canonical.slice(0, 12)} · DebtorAddress ${before.debtorAddresses}→${after.debtorAddresses} · Intel ${before.intel}→${after.intel}`);
    const se = JSON.stringify(after.sideEffects) === JSON.stringify(before.sideEffects);
    R.check('E-16', 'bildirim/bilgi talebi/teslim kaydı oluşmadı (önce/sonra aynı)', se, `önce=${JSON.stringify(before.sideEffects)} sonra=${JSON.stringify(after.sideEffects)}`);
  });
}

// ------------------------------------------------------------------ RUN
async function runMode() {
  const g = runGates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const { runId, origin } = g; const base = process.env.EXA_API_BASE;
  const webBase = String(process.env.EXA_EXPECT_BASE_URL).replace(/\/+$/, '');
  const pw = process.env.EXA_LIVE_LOGIN_PW; const receiptPath = process.env.EXA_RECEIPT; const evid = process.env.EXA_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: EXA_LIVE_LOGIN_PW + EXA_RECEIPT + EXA_EVID_FILE gerekli.'); process.exit(2); }
  addSecret(pw); addSecret(process.env.EXA_LIVE_GO_REF); addSecret(process.env.AH_DATABASE_URL);

  // Gösterim kanalı HİÇBİR yazmadan ÖNCE açılır: konsol yoksa koşum başlamaz (token başka kanala düşmesin).
  let con = null;
  if (g.display === 'conout') {
    try { con = DISPLAY.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok — ${errText(e, 120)} (hiçbir yazma yapılmadı)`); process.exit(4); }
  }
  const R = new L.Results();
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const marker = `EXTACC-${runId}`;
  const out = { record: 'EXTACC-INTAKE-LIVE-RUN', revision: 'R01', runId, apiBase: base, expectedOrigin: origin, marker, calledEndpoints: [] };
  const expect = { attempted: false, outcome: null, linkId: null };
  let receipt = null; let fatal = null; let session = null; let raw = null; let urlGateOk = false; let linkId = null;
  let before = null; let displayed = false; let rowSeen = false; let stopped = null;
  const call = (m, p) => out.calledEndpoints.push(`${m} ${p.replace(base, '<API>')}`);
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10));
    receipt = { record: RECEIPT_RECORD, runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, foreignClientId: st.foreignClientId, caseId: st.caseId, debtorId: st.debtorId,
      elevUserId: st.actors.elev1.id, elevEmail: st.actors.elev1.email, createdAt: new Date().toISOString() };
    out.receipt = receipt;
    try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); throw new Error('makbuz yazılamadı — oturum açma ve bağlantı oluşturma adımlarına GEÇİLMEDİ'); }

    call('POST', `${base}/auth/login`);
    session = await L.AH.login(base, st.actors.elev1.email, pw, st.slug);
    if (session && session.token) addSecret(session.token);
    if (!session.ok) throw new Error(`elev1 oturum açamadı (HTTP ${session.status ?? 'belirsiz'})`);
    R.check('E-00', 'ÖLÇÜM GEÇERLİ: elev1 ADMIN değil', st.actors.user.role === st.actors.elev1.role && st.actors.elev1.role !== 'ADMIN', `elev1:${st.actors.elev1.role}`);

    // GÖNDERİMSİZ oluşturma — 30 dk geçerli, tek kullanım (CreateClientWorkspaceIntakeLinkDto: scope · expiresAt · maxUses).
    const createPath = `${base}/clients/${st.clientId}/cases/${st.caseId}/intake-links`;
    if (DISPATCH_ENDPOINT_FORBIDDEN.some((re) => re.test(createPath))) throw new Error('gönderim yapan uç seçildi — DURDU');
    const ttl = num('EXA_LINK_TTL_MS', 30 * 60 * 1000); const expiresAt = new Date(Date.now() + ttl).toISOString();
    const attempted = Object.assign({}, receipt, { createAttemptedAt: new Date().toISOString() });
    try { writeJson(receiptPath, attempted); } catch (e) { out.receiptWriteError = errText(e, 160); throw new Error('oluşturma denemesi makbuza işlenemedi — istek GÖNDERİLMEDİ'); }
    receipt = attempted; out.receipt = receipt; expect.attempted = true; expect.outcome = 'uncertain';
    call('POST', createPath);
    const cr = await L.AH.httpJson('POST', createPath, { token: session.token, body: { scope: ['ADDRESS'], expiresAt, maxUses: 1 }, timeoutMs: num('EXA_CREATE_TIMEOUT_MS', 30000) });
    const d = (cr && cr.body && cr.body.data) || {};
    const url = typeof d.intakeUrl === 'string' ? d.intakeUrl : null;
    raw = typeof d.rawToken === 'string' ? d.rawToken : null; if (raw) addSecret(raw);
    linkId = d.link && d.link.id ? d.link.id : null;
    expect.outcome = (!cr.indeterminate && cr.status === 201 && linkId) ? 'confirmed' : (!cr.indeterminate && cr.status >= 400 && cr.status < 500) ? 'none' : 'uncertain';
    expect.linkId = linkId;
    try { const r2 = Object.assign({}, receipt, { createOutcome: expect.outcome, createLinkId: linkId }); writeJson(receiptPath, r2); receipt = r2; out.receipt = receipt; }
    catch (e) { out.receiptOutcomeWriteError = errText(e, 160); }
    out.create = { status: cr.status, indeterminate: !!cr.indeterminate, outcome: expect.outcome, hasUrl: !!url, hasRawToken: !!raw, rawTokenSha256: raw ? sha(raw) : null };
    if (expect.outcome !== 'confirmed' || !url || !raw) {
      if (cr.indeterminate) R.unmeasured('E-01', 'gönderimsiz uçtan bağlantı üretildi (201 + link id)', 'yanıt ALINAMADI — kayıt OLUŞMUŞ OLABİLİR (kapanışta sentetik kimliklerle aranır)');
      else R.check('E-01', 'gönderimsiz uçtan bağlantı üretildi (201 + link id)', false, `HTTP ${cr.status}${cr.status === 503 ? ' — neden UNKNOWN' : ''}`);
      stopped = 'bağlantı üretilemedi';
    } else {
      R.check('E-01', 'gönderimsiz uçtan bağlantı üretildi (201 + link id)', true, 'HTTP 201');
      const l = await prisma.clientIntakeLink.findUnique({ where: { id: linkId }, select: { status: true, useCount: true, maxUses: true, expiresAt: true } });
      const skew = l && l.expiresAt ? Math.abs(l.expiresAt.getTime() - Date.parse(expiresAt)) : null;
      R.check('E-02', 'DB: ACTIVE · useCount 0 · maxUses 1 · expiresAt istenen değer (±2 sn)', !!l && l.status === 'ACTIVE' && l.useCount === 0 && l.maxUses === 1 && skew !== null && skew <= 2000,
        `durum=${l ? l.status : 'YOK'} useCount=${l ? l.useCount : '-'} maxUses=${l ? l.maxUses : '-'} expiresAt sapma ms=${skew}`);
      let parsed = null; try { parsed = new URL(url); } catch (e) { parsed = null; }
      urlGateOk = !!parsed && url === `${webBase}/intake/${raw}` && parsed.protocol === 'https:' && parsed.origin === origin && parsed.pathname === `/intake/${raw}` && !parsed.search && !parsed.hash && !url.includes('\\');
      R.check('E-URL', 'URL KAPISI: https + beklenen origin + /intake/<token>', urlGateOk, `origin eşit=${parsed ? parsed.origin === origin : false} · https=${parsed ? parsed.protocol === 'https:' : false}`);
      if (!urlGateOk) stopped = 'URL kapısı geçmedi — adres GÖSTERİLMEDİ';
      else {
        call('GET', `${base}/public/intake/<token>`);
        const loc = await boundedGet(`${base}/public/intake/${raw}`, num('H5U_LOCAL_TIMEOUT_MS', 15000));
        call('GET', '<DIŞ>/api/public/intake/<token>');
        const ext = await boundedGet(`${origin}/api/public/intake/${raw}`, num('H5U_EXTERNAL_TIMEOUT_MS', 15000));
        const why503 = (r) => (r.status === 503 ? 'HTTP 503 — neden UNKNOWN (bu koşumda ölçülmedi); koşum DURDU' : null);
        if (loc.status === 503 || ext.status === 503) {
          R.unmeasured('E-03L', 'gösterimden önce YEREL public GET 200', why503(loc) || `HTTP ${loc.status}`);
          R.unmeasured('E-03D', 'gösterimden önce DIŞ HTTPS public GET 200', why503(ext) || `HTTP ${ext.status}`);
          stopped = 'HTTP 503 — neden UNKNOWN; adres GÖSTERİLMEDİ';
        } else {
          judgeValid(R, 'E-03L', 'gösterimden önce YEREL public GET 200', loc);
          judgeValid(R, 'E-03D', 'gösterimden önce DIŞ HTTPS public GET 200', ext);
          if (loc.status !== 200 || ext.status !== 200) stopped = 'bağlantı gösterimden önce geçerli ölçülmedi — adres GÖSTERİLMEDİ';
        }
      }
    }

    if (!stopped) {
      before = await canonicalSnapshot(prisma, receipt);
      if (con) {
        const qr = DISPLAY.renderQr(url);
        await DISPLAY.show(con, [
          '==================== H5/EXTACC — YALNIZ OWNER EKRANI (kayda ALINMAZ) ====================',
          'Telefonda: Wi-Fi KAPALI, mobil veri AÇIK, gizli sekme. QR\'ı okutun ya da adresi açın.',
          'Adres alanına AYNEN şunu yazın ve BİR KEZ gönderin:', `    ${marker} sentetik adres`,
          '', ...qr.lines, '', url, '',
          `Bekleme: en fazla ${Math.round(num('EXA_WAIT_MS', 25 * 60 * 1000) / 60000)} dk. Gönderim algılanınca ekran temizlenir.`,
        ]);
        out.qrModules = qr.modules;
      }
      displayed = true;
      R.check('E-DISP', 'adres yalnız yerel konsola gösterildi (kanıt/log dışı kanal)', true, g.display === 'conout' ? 'CONOUT$' : 'gösterimsiz izole test');

      // Owner telefonundan gönderir; betik YALNIZ OKUR.
      const waitMs = num('EXA_WAIT_MS', 25 * 60 * 1000); const pollMs = num('EXA_POLL_MS', 5000); const t0 = Date.now();
      for (;;) {
        const n = await prisma.clientIntakeSubmission.count({ where: { intakeLinkId: linkId } });
        if (n > 0) { rowSeen = true; break; }
        if (Date.now() - t0 >= waitMs) break;
        await new Promise((r) => setTimeout(r, pollMs));
      }
      out.wait = { rowSeen, elapsedMs: Date.now() - t0, windowMs: waitMs };
      if (rowSeen) R.check('E-WAIT', 'gönderim satırı pencere içinde görüldü', true, `~${Math.round((Date.now() - t0) / 1000)} sn`);
      else R.unmeasured('E-WAIT', 'gönderim satırı pencere içinde görüldü',
        'gönderim satırı YOK — "owner göndermedi" ile "sayfa başarı gösterdi ama satır yok (honeypot vb.)" DB\'den AYIRT EDİLEMEZ; owner beyanı ile ayrılır');
    } else {
      for (const [id, desc] of [['E-DISP', 'adres yerel konsola gösterildi'], ['E-WAIT', 'gönderim satırı görüldü']]) R.unmeasured(id, desc, stopped);
    }
  } catch (e) { fatal = errText(e, 300); }
  finally {
    if (con) { try { await DISPLAY.clear(con); } catch (e) { out.displayClearError = errText(e, 120); } DISPLAY.close(con); }
    try {
      const fin = await finalizeClosure(R, prisma, base, origin, receipt, session, raw, urlGateOk, expect);
      Object.assign(out, fin);
    } catch (e) { out.linkRevoke = out.linkRevoke || { ok: false, reason: 'kapanış çerçevesi hata verdi' }; out.closure = out.closure || { ok: false, reason: errText(e, 160) }; }
    // Geç gönderim: pencere ya da kapanış sırasında gelen satır. Varsa D-3 onun üzerinde YİNE ölçülür.
    try {
      if (linkId && before) {
        const nNow = await prisma.clientIntakeSubmission.count({ where: { intakeLinkId: linkId } });
        const late = !rowSeen && nNow > 0; out.lateSubmission = late;
        if (late) R.check('E-LATE', 'gönderim pencere içinde geldi (geç gönderim YOK)', false, `pencere sonrası/kapanış sırasında gelen gönderim=${nNow}`);
        if (rowSeen || late) await verifyD3(R, prisma, receipt, linkId, marker, before);
        else for (const id of ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17']) R.unmeasured(id, 'D-3', 'gönderim satırı yok');
      } else {
        for (const id of ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17']) R.unmeasured(id, 'D-3', stopped || fatal || 'bağlantı yok');
      }
    } catch (e) { R.unmeasured('E-D3', 'D-3 doğrulaması', `okunamadı: ${errText(e, 160)}`); }
    // D-9 birleşik: DB'de ACTIVE bağlantı yok (USED/REVOKED) + yerel VE dış public 404 + kullanıcı/dosya kapanışı.
    try {
      const linksAfter = (out.linkRevoke && out.linkRevoke.linksAfter) || [];
      const states = linksAfter.map((x) => x.status);
      const pub = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
      const okD9 = linksAfter.length >= (expect.outcome === 'confirmed' ? 1 : 0) && states.every((s) => s === 'USED' || s === 'REVOKED')
        && pub('U-REV-PUB-L') === 'PASS' && pub('U-REV-PUB-D') === 'PASS' && !!(out.closure && out.closure.ok);
      const pubUnmeasured = ['U-REV-PUB-L', 'U-REV-PUB-D'].some((id) => pub(id) === 'UNMEASURED');
      if (linksAfter.length === 0 && !(out.linkRevoke && out.linkRevoke.nothingCreated)) R.unmeasured('E-D9', 'D-9 birleşik kapanış', 'bu koşumun bağlantısı DB\'de yok');
      else if (pubUnmeasured && states.every((s) => s === 'USED' || s === 'REVOKED') && out.closure && out.closure.ok) {
        R.unmeasured('E-D9', 'D-9 birleşik kapanış', `DB=${JSON.stringify(states)} ve kapanış tamam; public 404 ÖLÇÜLEMEDİ (yerel=${pub('U-REV-PUB-L')} dış=${pub('U-REV-PUB-D')})`);
      } else R.check('E-D9', 'D-9: DB\'de ACTIVE yok (USED/REVOKED) + yerel ve dış public 404 + kullanıcı/dosya kapanışı', okD9,
        `DB=${JSON.stringify(states)} · yerel=${pub('U-REV-PUB-L')} · dış=${pub('U-REV-PUB-D')} · kapanış=${!!(out.closure && out.closure.ok)}`);
    } catch (e) { R.unmeasured('E-D9', 'D-9 birleşik kapanış', errText(e, 120)); }
    out.dispatchEndpointCalled = out.calledEndpoints.some((c) => DISPATCH_ENDPOINT_FORBIDDEN.some((re) => re.test(c)));
    out.scriptPublicPostCount = out.calledEndpoints.filter((c) => /^POST .*\/public\/intake\//.test(c)).length;
    try {
      const after = receipt ? await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]) : null;
      out.isolationAfter = after; const b = out.isolationBefore;
      if (after && b) R.check('U-ISO', 'sentetik OLMAYAN tenantlarda tenant başına kullanıcı ve müvekkil SAYILARI önce/sonra aynı (ekleme/silme yokluğu ÇIKARILMAZ)',
        after.digest === b.digest, `önce=${b.digest}/${b.tenants} sonra=${after.digest}/${after.tenants}`);
      else R.unmeasured('U-ISO', 'sayım dağılımı', 'ölçülemedi');
    } catch (e) { R.unmeasured('U-ISO', 'sayım dağılımı', `okunamadı: ${errText(e, 120)}`); }
    const s = R.summary(`EXTACC R01 INTAKE ZİNCİRİ (runId=${runId})`);
    out.fatal = fatal; out.stopped = stopped; out.displayed = displayed; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    out.recovery = recoveryAdvice(out, receipt ? receiptPath : null);
    if (out.recovery.gerekli) console.error(`KURTARMA GEREKLİ: ${out.recovery.neden.join(' · ')}\n  makbuz: ${out.recovery.makbuz}`);
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
  if (process.env.EXA_RECOVER_CONFIRM !== '1') { console.error('REDDEDİLDİ: EXA_RECOVER_CONFIRM=1 gerekli'); process.exit(3); }
  const base = process.env.EXA_API_BASE; const pw = process.env.EXA_LIVE_LOGIN_PW; const evid = process.env.EXA_EVID_FILE; const receiptPath = process.env.EXA_RECEIPT;
  if (!pw || !evid || !receiptPath) { console.error('REDDEDİLDİ: EXA_LIVE_LOGIN_PW + EXA_EVID_FILE + EXA_RECEIPT gerekli'); process.exit(2); }
  addSecret(pw); addSecret(process.env.AH_DATABASE_URL);
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error('REDDEDİLDİ: makbuz okunamadı'); process.exit(4); }
  if (!receipt || receipt.record !== RECEIPT_RECORD || !receipt.elevUserId || !receipt.elevEmail) { console.error('REDDEDİLDİ: makbuz biçimi/alanları eksik'); process.exit(4); }
  if (process.env.EXA_RUNID && String(process.env.EXA_RUNID).toLowerCase() !== String(receipt.runId).toLowerCase()) { console.error('REDDEDİLDİ: runId makbuzla eşleşmiyor'); process.exit(4); }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'EXTACC-RECOVER', revision: 'R01', runId: receipt.runId, note: 'kabul ölçütleri KOŞULMADI; yalnız kapanış' };
  const att = !!receipt.createAttemptedAt;
  const expect = { attempted: att, outcome: receipt.createOutcome || (att ? 'uncertain' : null), linkId: receipt.createLinkId || null };
  let session = null;
  try {
    const ident = await assertReceiptIdentity(prisma, receipt);
    if (!ident.ok) { console.error(`REDDEDİLDİ: kimlik bağı doğrulanmadı (${ident.reason}) — HİÇBİR yazma yapılmadı`); await prisma.$disconnect().catch(() => {}); process.exit(4); }
    const active = await prisma.clientIntakeLink.count({ where: { tenantId: receipt.tenantId, caseId: receipt.caseId, clientId: receipt.clientId, status: 'ACTIVE' } });
    out.activeLinksAtStart = active;
    if (active > 0) {
      const elev = await prisma.user.findFirst({ where: { id: receipt.elevUserId, tenantId: receipt.tenantId, email: receipt.elevEmail }, select: { id: true } });
      if (!elev) { console.error('REDDEDİLDİ: makbuzdaki kullanıcı sentetik tenantta yok — yazma yapılmadı'); await prisma.$disconnect().catch(() => {}); process.exit(4); }
      await prisma.user.update({ where: { id: elev.id }, data: { passwordHash: await bcrypt.hash(pw, 10), isActive: true } });
      out.temporaryAccess = 'makbuzdaki sentetik kullanıcıya geçici erişim; kapanışta yeniden kapatıldı';
      session = await L.AH.login(base, receipt.elevEmail, pw, receipt.tenantSlug);
      if (session && session.token) addSecret(session.token);
    }
  } catch (e) { out.fatal = errText(e, 200); }
  Object.assign(out, await finalizeClosure(R, prisma, base, null, receipt, session, null, false, expect));
  R.summary(`EXTACC KURTARMA (runId=${receipt.runId})`);
  out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
  out.exitCode = !(out.linkRevoke && out.linkRevoke.ok) ? 6 : !(out.closure && out.closure.ok) ? 5 : out.fatal ? 1 : 0;
  out.recovery = recoveryAdvice(out, receiptPath);
  out.exitCode = writeEvidenceOrDemote(evid, out);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = out.exitCode;
}

if (require.main === module) {
  const mode = String(process.env.EXA_MODE || 'run').toLowerCase();
  if (mode === 'run') runMode();
  else if (mode === 'recover') recoverMode();
  else { console.error(`REDDEDİLDİ: bilinmeyen EXA_MODE '${mode}'`); process.exit(1); }
}
module.exports = { commonGates, runGates, LOOPBACK_HASHES, RECEIPT_RECORD };
