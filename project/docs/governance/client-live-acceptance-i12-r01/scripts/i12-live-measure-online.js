/*
 * İ12 — CANLI ÖLÇÜM (ONLINE) · MEVCUT TEK API'YE BAĞLANIR · setupI3/boot/hook/port-kill İÇERMEZ
 *
 * Bu betik canlı yürütmede KOŞAN ölçümdür. `i12-live-measure.js` (disposable prova) YERİNE §7.9 canlı
 * dizisinde çağrılır. Kendi API'sini KURMAZ/BOOT ETMEZ, i3-spy/cron-hook ENJEKTE ETMEZ, port üzerinden
 * süreç ÖLDÜRMEZ. Yalnızca:
 *   (1) ZATEN ÇALIŞAN tek canlı API'ye (HukukPlatform-API) HTTP ile bağlanır (I12_ONLINE_API_BASE),
 *   (2) kurulum MAKBUZUNDAKİ aynı tenant/runId/aktörleri kullanır (setupI3 KOŞMAZ; aktör kimlikleri
 *       makbuz e-postalarından DB okumasıyla çözülür — aynı DB'ye bağlı),
 *   (3) sentetik hedef tenant'a FD zinciri satırları yazar (yalnız makbuz tenantId'si) + HTTP yayınlar,
 *   (4) owner'ın canlı pencerede başlattığı SINK'i (loopback SMTP tuzağı) mod dosyasıyla yönlendirir ve
 *       conn / msg yakalama dosyalarını OKUR.
 *
 * SAYAÇ AYRIMI (AYRI raporlanır — eşit delta HER DURUMDA denklik SAYILMAZ):
 *   • sendCall  ≈ SMTP bağlantı denemesi (sink conn-*). Canlı pencerede alıcıya ATFEDİLEMEZ (pencere-içi
 *                toplam bağlantı); en iyi-çaba korroborasyon. conn'un send-çağrısını SADIK saydığının kesin
 *                kanıtı DISPOSABLE harness'tedir (conn==i3-spy send). Canlı bunu VARSAYMAZ, ayrı raporlar.
 *   • delivery  = sink msg-* (alıcı e-postasına göre RUN-SCOPED sayılır) — güvenilir, tenant/alıcıya atfedilir.
 *   • dbRecord  = DB durum değişimi (ClientInfoRequest / audit SENT / audit PUBLISHED) — tenant-scoped, güvenilir.
 *   Her gözlem KENDİ sözleşmesinde ölçülür: G3 sendCall+1 & delivery+1 & SENT+1 (başarılı gönderim → hepsi ARTAR);
 *   FD-RED sendCall+1 & delivery+0 (çağrı VAR, teslim YOK) — bu FARK, sendCall'ın teslimden bağımsız sayıldığını
 *   gösterir; asla "üç sayı eşit → denk" denmez.
 *
 * G5 (allowlist-dışı): mevcut API'yi mock sağlayıcıya BOOT EDEMEYİZ. Yalnız owner bu pencere için allowlist-DIŞI
 *   sağlayıcı pinlediyse (I12_G5_WINDOW=1) ölçülür; aksi halde 'ölçülmedi — ayrı restart pini gerekir' (PASS DEĞİL).
 * G7 (hedef-scoped cron teslim): MEVCUT API'DE ONAYLI DAR TETİK YOKTUR (scheduler.controller manuel-run yalnız
 *   run-all|payment-orders|nafaka|mts|uyap-retry; client-statement.monthlyDelivery HİÇBİR HTTP/manuel uca bağlı değil;
 *   runMonthlyDelivery scope={tenantId} DESTEKLER ama tek çağıranı global @Cron'dur). İkinci API açmadan / hook
 *   enjekte etmeden canlı tetiklenemez → 'ölçülmedi — KARAR GEREKLİ' (G7-LIVE-DECISION çıktısı). Davranış kanıtı
 *   DISPOSABLE harness'te (cron-hook) korunur.
 *
 * CANLI-GÜVENLİK KAPISI (fail-closed; G-0 DEĞİL): I12_LIVE_CONFIRM=1 · I12_LIVE_GO_REF DOLU · makbuz slug türetilene eşit.
 * KULLANIM: I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<ref> I12_ONLINE_API_BASE=<.../api> I12_SETUP_RECEIPT=<yol>
 *   I12_SINK_CAPTURE=<sink dizini> I12_LIVE_LOGIN_PW=<pw> AH_DATABASE_URL=<canlı DB> AH_PRISMA_ROOT=<...>
 *   [I12_G5_WINDOW=1] [I12_EVID_FILE=<yol>] node i12-live-measure-online.js
 * Sır (parola/smtpPass) makbuza/loga/çıktıya YAZILMAZ.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const net = require('net'); const os = require('os');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));

function probeTcp(host, port, timeoutMs = 1200) { return new Promise((resolve) => { const s = new net.Socket(); let done = false; const fin = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok); } }; s.setTimeout(timeoutMs); s.once('connect', () => fin(true)); s.once('timeout', () => fin(false)); s.once('error', () => fin(false)); s.connect(port, host); }); }
const CAPTURE = process.env.I12_SINK_CAPTURE;
async function setMode(m) { fs.writeFileSync(path.join(CAPTURE, 'mode'), m || '', 'utf8'); await new Promise((r) => setTimeout(r, 120)); }
const connCount = () => { try { return fs.readdirSync(CAPTURE).filter((f) => f.startsWith('conn-')).length; } catch (e) { return 0; } };
const msgToCount = (n) => { try { let k = 0; for (const f of fs.readdirSync(CAPTURE)) { if (!f.startsWith('msg-')) continue; if (new RegExp('^To:[^\\n]*' + n, 'm').test(fs.readFileSync(path.join(CAPTURE, f), 'utf8'))) k++; } return k; } catch (e) { return 0; } };
const audit = async (prisma, tenantId, action) => (await L.safeCount(() => prisma.auditLog.count({ where: { tenantId, action } }))).value;
const snap = async (prisma, vid) => { try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { status: true, providerMessageId: true } }); return { v, error: null }; } catch (e) { return { v: null, error: String(e) }; } };
function dbName(u) { try { return decodeURIComponent(new URL(u).pathname.replace(/^\//, '').split('/')[0]); } catch (e) { return null; } }

// FD sürümü üret + yayına hazır (elev1/2/3 onay zinciri). Yalnız makbuz tenant'ına yazar. vid+url döner ya da {error}.
async function bringToPublishReady(ctx, tag) {
  const { base, prisma, tokens, st } = ctx; const rid = `${st.runId}-${tag}`; const H = L.AH.httpJson;
  let dispositionId;
  try {
    const r = await prisma.$transaction(async (tx) => {
      const col = await tx.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: new Date(), idempotencyKey: `i12o-col-${rid}`, status: 'CONFIRMED' }, select: { id: true } });
      const exp = await tx.expenseRequest.create({ data: { tenantId: st.tenantId, caseId: st.caseId, clientId: st.clientId, totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: st.actors.elev1.id }, select: { id: true } });
      const ap = await tx.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `i12o-${rid}` }, select: { id: true } });
      const d = await tx.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: col.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'DISTRIBUTION_APPROVED', totalAmount: '100.00', currency: 'TRY', approvalRequestId: ap.id, approvedById: st.actors.elev2.id, lines: { create: [{ type: 'CLIENT_PAYABLE', amount: '60.00', caseClientId: st.caseClientId }, { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '40.00', expenseRequestId: exp.id, caseClientId: st.caseClientId }] } }, select: { id: true } });
      return d.id;
    }, { timeout: 30000, maxWait: 10000 });
    dispositionId = r;
  } catch (e) { return { error: `zincir: ${e && e.message ? e.message.slice(0, 140) : e}` }; }
  const rPost = await H('POST', `${base}/collection-dispositions/${dispositionId}/post`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  if (rPost.indeterminate || rPost.status >= 400) return { error: `post HTTP ${rPost.status ?? '?'}` };
  const rC = await H('POST', `${base}/collection-dispositions/${dispositionId}/financial-disclosure`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  const vid = ((rC.body && (rC.body.data || rC.body)) || {}).disclosureVersionId || null;
  if (!vid) return { error: `surum HTTP ${rC.status ?? '?'}` };
  const url = (s) => `${base}/client-financial-disclosures/${vid}/${s}`;
  const aid = async (f) => { try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { [f]: true } }); return v[f] || null; } catch (e) { return null; } };
  const rReqO = await H('POST', url('request-office-approval'), { token: tokens.elev1, body: {} });
  if (rReqO.indeterminate || rReqO.status >= 400) return { error: `ofis-talep HTTP ${rReqO.status ?? '?'}` };
  const rO = await H('POST', url('complete-office-approval'), { token: tokens.elev2, body: { approvalRequestId: await aid('officeApprovalRequestId') } });
  if (rO.indeterminate || rO.status >= 400) return { error: `ofis-onay HTTP ${rO.status ?? '?'}` };
  const rReqC = await H('POST', url('request-content-approval'), { token: tokens.elev1, body: { approvedRecipientEmail: `fd-${st.runId}@ah-harness.invalid` } });
  if (rReqC.indeterminate || rReqC.status >= 400) return { error: `icerik-talep HTTP ${rReqC.status ?? '?'}` };
  const rCC = await H('POST', url('complete-content-approval'), { token: tokens.elev3, body: { approvalRequestId: await aid('contentApprovalRequestId') } });
  if (rCC.indeterminate || rCC.status >= 400) return { error: `icerik-onay HTTP ${rCC.status ?? '?'}` };
  return { vid, url };
}

(async () => {
  if (process.env.I12_LIVE_CONFIRM !== '1') { console.error('REDDEDİLDİ: I12_LIVE_CONFIRM=1 gerekli.'); process.exit(3); }
  if (!(process.env.I12_LIVE_GO_REF && process.env.I12_LIVE_GO_REF.trim())) { console.error('REDDEDİLDİ: I12_LIVE_GO_REF DOLU olmalı.'); process.exit(3); }
  const base = process.env.I12_ONLINE_API_BASE; const receiptPath = process.env.I12_SETUP_RECEIPT;
  const pw = process.env.I12_LIVE_LOGIN_PW;
  if (!base || !receiptPath || !pw || !CAPTURE) { console.error('REDDEDİLDİ: I12_ONLINE_API_BASE + I12_SETUP_RECEIPT + I12_LIVE_LOGIN_PW + I12_SINK_CAPTURE gerekli.'); process.exit(2); }
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error(`REDDEDİLDİ: makbuz okunamadı: ${e}`); process.exit(2); }
  if (receipt.record !== 'I12-SETUP-RECEIPT' || !receipt.runId || !receipt.tenantId) { console.error('REDDEDİLDİ: makbuz biçimi geçersiz.'); process.exit(2); }
  const runId = String(receipt.runId).toLowerCase();
  const derivedSlug = `${L.AH.TENANT_PREFIX}${runId}`;
  if (receipt.tenantSlug !== derivedSlug) { console.error(`REDDEDİLDİ: makbuz slug '${receipt.tenantSlug}' türetilen '${derivedSlug}' ile eşleşmiyor.`); process.exit(4); }

  const prisma = L.AH.loadPrisma(); const R = new L.Results();
  const SENT = 'CLIENT_FINANCIAL_DISCLOSURE_SENT'; const PUB = 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED';
  const counters = []; // AYRI sayaç raporu (sendCall/delivery/dbRecord)
  let st = null;
  try {
    // ── Aktör kimliklerini MAKBUZ e-postalarından DB okumasıyla çöz (setupI3 KOŞULMAZ) ──
    const actorEmails = receipt.actors || { elev1: receipt.loginEmail };
    const actors = {};
    for (const tag of ['elev1', 'elev2', 'elev3', 'reviewer', 'user']) {
      const email = actorEmails[tag]; if (!email) continue;
      const u = await prisma.user.findFirst({ where: { tenantId: receipt.tenantId, email }, select: { id: true, email: true } });
      if (!u) throw new Error(`aktör '${tag}' (${email}) makbuz tenant'ında YOK — makbuz/kurulum tutarsız`);
      actors[tag] = { id: u.id, email: u.email };
    }
    if (!actors.elev1 || !actors.elev2 || !actors.elev3) throw new Error('elev1/2/3 aktörleri çözülemedi');
    st = { runId, tenantId: receipt.tenantId, slug: receipt.tenantSlug, caseId: receipt.caseId, caseClientId: receipt.caseClientId, clientId: receipt.clientId, actors };

    // ── KİMLİK: mevcut API AYNI DB'ye bağlı mı (login üzerinden) ──
    const bound = await L.AH.verifyApiBoundToSameDatabase(prisma, base, receipt.loginEmail, pw, receipt.tenantSlug);
    if (!bound.bound) throw new Error(`API↔DB bağı YOK/doğrulanamadı: ${bound.reason}`);
    const tokens = {};
    for (const a of ['elev1', 'elev2', 'elev3']) { const r = await L.AH.login(base, actors[a].email, pw, receipt.tenantSlug); if (!r.ok) throw new Error(`${a} login HTTP ${r.status ?? '?'}`); tokens[a] = r.token; }
    const ctx = { base, prisma, tokens, st };

    // ── İZOLASYON ÖN KOŞULU (gönderim yapılmadan): loopback sink erişilir + LAN sink erişilmez ──
    // NOT: canlı API'nin env sağlayıcısı betikten OKUNAMAZ; 'provider=smtp→sink' güvencesi owner'ın pinlenmiş
    // .env'ini DOĞRULAYAN preflight + restart + health kontrolüne dayanır. Buradaki ampirik teyit: ilk BAŞARILI
    // gönderim (G3) OUR sink'e bir conn düşürür; düşmezse GERÇEK-GÖNDERİM RİSKİ sayılır → gözlem PASS OLMAZ, durulur.
    const sinkHost = process.env.I12_SINK_HOST || '127.0.0.1'; const sinkPort = Number(process.env.I12_SINK_PORT || 2529);
    const loopbackOk = await probeTcp(sinkHost, sinkPort);
    let lanReach = false; for (const list of Object.values(os.networkInterfaces())) for (const ni of (list || [])) if (ni.family === 'IPv4' && !ni.internal) { if (await probeTcp(ni.address, sinkPort, 800)) lanReach = true; }
    const isoOk = loopbackOk && !lanReach;
    R.check('H5-00-ISO-ONLINE', 'izolasyon ön koşulu: loopback sink erişilir + LAN sink erişilmez + API↔DB bağlı — gönderim ancak bununla', isoOk && bound.bound, `loopbackSink=${loopbackOk} LANerişilmez=${!lanReach} apiDbBağlı=${bound.bound}`);
    if (!isoOk) throw new Error('izolasyon ön koşulu SAĞLANMADI — canlı ölçüm başlatılmaz');

    // ── G1/G2 — bilgi talebi red(A-9)/belirsiz(A-10); ClientInfoRequest YAZILMAZ; TEK sendCall ──
    const infoReqCount = async () => (await L.safeCount(() => prisma.clientInfoRequest.count({ where: { tenantId: st.tenantId } }))).value;
    const postInfoReq = (subject) => L.AH.httpJson('POST', `${base}/address-discovery/client-info-request`, { token: tokens.elev1, body: { caseId: st.caseId, clientId: st.clientId, emailTo: `alici-${runId}@ah-harness.invalid`, emailSubject: subject, emailBody: 'İ12 sentetik bilgi talebi.' }, timeoutMs: 25000 });
    for (const [id, mode, code, desc] of [['G1', 'reject', 'CLIENT_INFO_REQUEST_EMAIL_FAILED', 'A-9 sağlayıcı reddi'], ['G2', 'reset', 'CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE', 'A-10 belirsiz/timeout']]) {
      await setMode(mode);
      const rowB = await infoReqCount(); const connB = connCount();
      const r = await postInfoReq(`i12-${id}-${runId}`);
      const rowA = await infoReqCount(); const connA = connCount();
      const rcode = (r.body && (r.body.code || r.body.reasonCode || (r.body.message && (r.body.message.code || r.body.message.reasonCode)))) || '';
      counters.push({ obs: id, sendCall_conn: connA - connB, delivery_msg: 0, dbRecord_infoReq: rowA == null || rowB == null ? null : rowA - rowB });
      if (r.indeterminate || rowB == null || rowA == null) { R.unmeasured(id, desc, r.indeterminateReason || 'sayaç okunamadı'); continue; }
      R.check(id, `${desc}: HTTP 503 · ${code} · ClientInfoRequest YAZILMAZ (dbRecord+0) · TEK sendCall(conn) (kör tekrar YOK)`,
        r.status === 503 && new RegExp(code).test(String(rcode)) && (rowA - rowB) === 0 && (connA - connB) === 1,
        `HTTP ${r.status} · code=${rcode} · dbRecord+${rowA - rowB} · sendCall(conn)+${connA - connB}`);
    }

    // ── G3/G6 + G4 (onaylı yayın + dedupe) — sendCall/delivery/dbRecord AYRI ──
    const RCP = `fd-${runId}`;
    const v1 = await bringToPublishReady(ctx, 'can');
    if (v1.error) { R.unmeasured('G3', 'CANARY', v1.error); R.unmeasured('G6', 'audit ayrımı', v1.error); R.unmeasured('G4', 'dedupe', v1.error); }
    else {
      await setMode(''); // KABUL modu → başarılı gönderim
      const cB = connCount(), mB = msgToCount(RCP), aSB = await audit(prisma, st.tenantId, SENT), aPB = await audit(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      await new Promise((r) => setTimeout(r, 1200)); // sink msg diske insin
      const af = await snap(prisma, v1.vid); const cA = connCount(), mA = msgToCount(RCP), aSA = await audit(prisma, st.tenantId, SENT), aPA = await audit(prisma, st.tenantId, PUB);
      if (rPub.indeterminate || af.error) { R.unmeasured('G3', 'CANARY', rPub.indeterminateReason || af.error); R.unmeasured('G6', 'audit', 'G3 ölçülemedi'); R.unmeasured('G4', 'dedupe', 'G3 ölçülemedi'); }
      else {
        const sendD = cA - cB, delivD = mA - mB, sentD = aSA - aSB, pubD = aPA - aPB;
        counters.push({ obs: 'G3', sendCall_conn: sendD, delivery_msg: delivD, dbRecord_sent: sentD, dbRecord_pub: pubD });
        // Başarılı gönderim: üç sinyal de ARTAR (aynı tek gerçek gönderimin izleri) — eşitlik burada denklik DEĞİL, koşutluk.
        R.check('G3', 'onaylı yayın: PUBLISHED + providerMessageId + SENT+1/PUBLISHED+1(dbRecord) + delivery(msg)+1 + sendCall(conn)+1',
          rPub.status < 400 && af.v.status === 'PUBLISHED' && !!af.v.providerMessageId && sentD === 1 && pubD === 1 && delivD === 1 && sendD === 1,
          `HTTP ${rPub.status} · durum=${af.v.status} · providerMessageId=${af.v.providerMessageId ? 'VAR' : 'yok'} · SENT+${sentD}/PUBLISHED+${pubD} · delivery(msg)+${delivD} · sendCall(conn)+${sendD}`);
        R.check('G6', 'SENT ≠ PUBLISHED audit (iki AYRI aksiyon)', sentD === 1 && pubD === 1, `SENT+${sentD} · PUBLISHED+${pubD}`);
        // G4: ikinci yayın
        const cB2 = connCount(), mB2 = msgToCount(RCP), sB2 = await audit(prisma, st.tenantId, SENT), pB2 = await audit(prisma, st.tenantId, PUB);
        const rDup = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
        await new Promise((r) => setTimeout(r, 800));
        const cA2 = connCount(), mA2 = msgToCount(RCP), sA2 = await audit(prisma, st.tenantId, SENT), pA2 = await audit(prisma, st.tenantId, PUB); const af2 = await snap(prisma, v1.vid);
        const code = (rDup.body && (rDup.body.code || rDup.body.reasonCode || (rDup.body.message && (rDup.body.message.code || rDup.body.message.reasonCode)))) || '';
        counters.push({ obs: 'G4', sendCall_conn: cA2 - cB2, delivery_msg: mA2 - mB2, dbRecord_sent: sA2 - sB2, dbRecord_pub: pA2 - pB2 });
        if (rDup.indeterminate || af2.error) { R.unmeasured('G4', 'dedupe', rDup.indeterminateReason || af2.error); }
        else R.check('G4', 'ikinci yayın ilerlemez: 4xx state-guard · sendCall+0 · delivery+0 · dbRecord+0 · PUBLISHED kalır',
          rDup.status >= 400 && rDup.status < 500 && /STATUS_INVALID|ALREADY_PUBLISHED|VERSION_TERMINAL/.test(String(code)) && (cA2 - cB2) === 0 && (mA2 - mB2) === 0 && (sA2 - sB2) === 0 && (pA2 - pB2) === 0 && af2.v.status === 'PUBLISHED',
          `HTTP ${rDup.status} · code=${code} · sendCall(conn)+${cA2 - cB2} · delivery(msg)+${mA2 - mB2} · SENT+${sA2 - sB2}/PUBLISHED+${pA2 - pB2} · durum=${af2.v.status}`);
      }
    }

    // ── FD-RED (550) / FD-TMO (reset): sendCall TEK (+1) · delivery +0 (teslim YOK) — sendCall≠delivery AYRIMI ──
    for (const [tag, mode, id, desc] of [['red', 'reject', 'FD-RED', 'sağlayıcı reddi (550)'], ['tmo', 'reset', 'FD-TMO', 'reset/timeout']]) {
      const v = await bringToPublishReady(ctx, tag);
      if (v.error) { R.unmeasured(id, desc, v.error); continue; }
      await setMode(mode);
      const cB = connCount(), mB = msgToCount(`fd-${runId}`), pB = await audit(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', v.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 30000 });
      await new Promise((r) => setTimeout(r, 1000));
      const af = await snap(prisma, v.vid); const cA = connCount(), mA = msgToCount(`fd-${runId}`), pA = await audit(prisma, st.tenantId, PUB);
      if (rPub.indeterminate || af.error) { R.unmeasured(id, desc, rPub.indeterminateReason || af.error); continue; }
      const sendD = cA - cB, delivD = mA - mB, pubD = pA - pB;
      counters.push({ obs: id, sendCall_conn: sendD, delivery_msg: delivD, dbRecord_pub: pubD });
      // sendCall TEK: conn +1 (kör tekrar olsa +2). delivery +0 (reddedildi/reset → msg YOK). İkisinin FARKI kanıt.
      R.check(id, `${desc}: yayın TAMAMLANMAZ · PUBLISHED değil · sendCall(conn) TEK=+1 (kör tekrar +2 DEĞİL) · delivery(msg)+0 · PUBLISHED dbRecord+0`,
        af.v.status !== 'PUBLISHED' && !af.v.providerMessageId && sendD === 1 && delivD === 0 && pubD === 0,
        `HTTP ${rPub.status} · durum=${af.v.status} · sendCall(conn)+${sendD} · delivery(msg)+${delivD} · PUBLISHED dbRecord+${pubD}`);
    }

    // ── G5 (allowlist-DIŞI) — mevcut API mock'a boot EDİLEMEZ; yalnız owner bu pencerede allowlist-dışı pinlediyse ──
    if (process.env.I12_G5_WINDOW === '1') {
      const v5 = await bringToPublishReady(ctx, 'g5');
      if (v5.error) { R.unmeasured('G5', 'allowlist-dışı', v5.error); }
      else {
        const cB = connCount();
        const rPub = await L.AH.httpJson('POST', v5.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
        const af = await snap(prisma, v5.vid); const cA = connCount();
        const code = (rPub.body && (rPub.body.code || rPub.body.reasonCode || (rPub.body.message && (rPub.body.message.code || rPub.body.message.reasonCode)))) || '';
        counters.push({ obs: 'G5', sendCall_conn: cA - cB, delivery_msg: 0 });
        if (rPub.indeterminate || af.error) R.unmeasured('G5', 'allowlist-dışı', rPub.indeterminateReason || af.error);
        else R.check('G5', 'allowlist-DIŞI sağlayıcı: 403 PROVIDER_NOT_PRODUCTION · PUBLISHED değil · sendCall(conn)+0',
          rPub.status === 403 && /PROVIDER_NOT_PRODUCTION/.test(String(code)) && af.v.status !== 'PUBLISHED' && (cA - cB) === 0,
          `HTTP ${rPub.status} · code=${code} · durum=${af.v.status} · sendCall(conn)+${cA - cB}`);
      }
    } else {
      R.unmeasured('G5', 'allowlist-dışı', 'bu pencerede sağlayıcı allowlist-içi (smtp→sink); allowlist-dışı ölçümü AYRI restart pini (I12_G5_WINDOW) gerektirir — DISPOSABLE harness\'te ölçülü');
    }

    // ── G7 (hedef-scoped cron teslim) — MEVCUT API'DE ONAYLI DAR TETİK YOK → KARAR GEREKLİ ──
    R.unmeasured('G7-LIVE', 'hedef-scoped cron teslim', 'MEVCUT API\'de onaylı dar tetik YOK: scheduler.controller manuel-run yalnız run-all|payment-orders|nafaka|mts|uyap-retry; client-statement.monthlyDelivery hiçbir HTTP/manuel uca bağlı değil; runMonthlyDelivery scope={tenantId} DESTEKLER ama tek çağıranı global @Cron. İkinci API/hook YASAK → canlı tetiklenemez. Davranış kanıtı DISPOSABLE harness\'te (G7). KARAR: dar in-API manuel tetik ucu eklensin mi (ayrı ürün değişikliği + GO) yoksa G7 disposable-only mı kalsın.');

  } catch (e) { console.error(`\nÖLÇÜM DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally {
    // ERİŞİM KAPANIŞI (her koşulda; süreç ÖLDÜRME YOK, env/Office rollback AYRI recover girişinde).
    if (st) { try { await prisma.user.updateMany({ where: { tenantId: st.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); const active = (await prisma.user.findMany({ where: { tenantId: st.tenantId, isActive: true }, select: { id: true } })).length; R.check('I12-ACCESS-CLOSE', 'sentetik erişim sonlandırıldı (measure finally)', active === 0, `aktif=${active}`); } catch (e) { R.check('I12-ACCESS-CLOSE', 'sentetik erişim sonlandırıldı (measure finally)', false, `kapanış hatası: ${e && e.message ? e.message : e} — BAĞIMSIZ recover ZORUNLU`); } }
    const s = R.summary('İ12 CANLI ÖLÇÜM (ONLINE)');
    const out = { record: 'I12-LIVE-MEASURE-ONLINE', runId, tenant: st ? st.slug : null, apiBase: base, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, counters, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })) };
    console.log(JSON.stringify(out, null, 1));
    const EVID = process.env.I12_EVID_FILE; if (EVID) { try { fs.writeFileSync(EVID, JSON.stringify({ record: 'I12-LIVE-MEASURE-ONLINE', runId, counters, results: R.rows }, null, 1), 'utf8'); } catch (e) {} }
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
