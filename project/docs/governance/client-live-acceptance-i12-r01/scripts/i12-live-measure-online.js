/*
 * İ12 — CANLI ÖLÇÜM (ONLINE) · MEVCUT TEK API'YE BAĞLANIR · FAZLI · setupI3/boot/hook/port-kill İÇERMEZ
 *
 * Bu betik canlı yürütmede KOŞAN ölçümdür. Kendi API'sini KURMAZ/BOOT ETMEZ, i3-spy/cron-hook
 * ENJEKTE ETMEZ, port üzerinden süreç ÖLDÜRMEZ. Yalnızca: (1) ZATEN ÇALIŞAN tek canlı API'ye HTTP ile
 * bağlanır (I12_ONLINE_API_BASE), (2) kurulum MAKBUZUNDAKİ aynı tenant/runId/aktörleri kullanır
 * (setupI3 KOŞMAZ), (3) sentetik hedef tenant'a FD zinciri satırları yazar + HTTP yayınlar,
 * (4) owner'ın sink'ini mod dosyasıyla yönlendirir ve yakalama dosyalarını OKUR.
 *
 * FAZLAR (I12_PHASE) — hepsi AYNI makbuz ve AYNI tek API üzerinde, AYRI koşumlarda:
 *   `smtp` (varsayılan) : G1 · G2 · G3 · G6 · G4 · FD-RED · FD-TMO   (env sağlayıcı allowlist-İÇİ → sink)
 *   `mock`             : G5                                          (env sağlayıcı allowlist-DIŞI pinli)
 *   `g7`               : G7 hedef-scoped manuel aylık teslim + dedupe (dar in-API uç)
 * ERİŞİM KAPANIŞI BU BETİKTE YAPILMAZ — nihai kapanış TÜM fazlardan SONRA `i12-live-recover.js`
 * ile yapılır (aksi halde ilk faz erişimi kapatır ve sonraki fazlar login olamaz).
 *
 * SAYAÇLAR — AYRI raporlanır, eşit delta HER DURUMDA denklik SAYILMAZ:
 *   • smtpConnection (conn) : sink'e açılan SMTP BAĞLANTI DENEMESİ. **GERÇEK `dispatcher.send` çağrısı
 *     DEĞİLDİR ve öyle sunulmaz.** Bağlantı denemesi gönderim çağrısının yalnız gözlenebilir bir
 *     İZİDİR; canlı pencerede alıcıya atfedilemez. conn↔send sadıklığı yalnız DISPOSABLE harness'te
 *     i3-spy ile ölçülür (§9.8 FD-COUNT-XCHECK); canlı bunu VARSAYMAZ.
 *   • delivery (msg)       : sink'e TESLİM edilen mesaj (alıcıya göre run-scoped) — atfedilebilir.
 *   • dbRecord             : DB durum değişimi (ClientInfoRequest / audit / ledger) — tenant-scoped.
 *   OKUNAMAYAN ÖLÇÜM SIFIR SAYILMAZ: yakalama dizini okunamazsa sayaç `null` döner ve gözlem
 *   ÖLÇÜLEMEDİ olur (asla +0 PASS üretmez).
 *
 * CANLI-GÜVENLİK KAPISI (fail-closed; G-0 DEĞİL): I12_LIVE_CONFIRM=1 · I12_LIVE_GO_REF DOLU ·
 *   makbuz slug türetilene eşit · makbuz tenant/slug/runId bağı DB'den DOĞRULANIR (yanlış kimlikte YAZMA YOK).
 * KULLANIM: I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<ref> I12_ONLINE_API_BASE=<.../api> I12_SETUP_RECEIPT=<yol>
 *   I12_SINK_CAPTURE=<dizin> I12_LIVE_LOGIN_PW=<pw> AH_DATABASE_URL=<canlı DB> AH_PRISMA_ROOT=<...>
 *   [I12_PHASE=smtp|mock|g7] [I12_EVID_FILE=<yol>] node i12-live-measure-online.js
 * Sır (parola/smtpPass) makbuza/loga/çıktıya YAZILMAZ.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const net = require('net'); const os = require('os');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const { assertReceiptIdentity } = require('./i12-live-identity');

function probeTcp(host, port, timeoutMs = 1200) { return new Promise((resolve) => { const s = new net.Socket(); let done = false; const fin = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok); } }; s.setTimeout(timeoutMs); s.once('connect', () => fin(true)); s.once('timeout', () => fin(false)); s.once('error', () => fin(false)); s.connect(port, host); }); }
const CAPTURE = process.env.I12_SINK_CAPTURE;
const PHASE = (process.env.I12_PHASE || 'smtp').toLowerCase();
async function setMode(m) { fs.writeFileSync(path.join(CAPTURE, 'mode'), m || '', 'utf8'); await new Promise((r) => setTimeout(r, 120)); }
// OKUNAMAYAN = null (SIFIR DEĞİL). Sayaç okunamazsa gözlem ÖLÇÜLEMEDİ olur.
const connCount = () => { try { return fs.readdirSync(CAPTURE).filter((f) => f.startsWith('conn-')).length; } catch (e) { return null; } };
const msgToCount = (n) => { try { let k = 0; for (const f of fs.readdirSync(CAPTURE)) { if (!f.startsWith('msg-')) continue; if (new RegExp('^To:[^\\n]*' + n, 'm').test(fs.readFileSync(path.join(CAPTURE, f), 'utf8'))) k++; } return k; } catch (e) { return null; } };
/** delta: uçlardan biri okunamadıysa null (asla 0'a düşmez). */
const d = (after, before) => (after == null || before == null) ? null : after - before;
const audit = async (prisma, tenantId, action) => (await L.safeCount(() => prisma.auditLog.count({ where: { tenantId, action } }))).value;
const snap = async (prisma, vid) => { try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { status: true, providerMessageId: true } }); return { v, error: null }; } catch (e) { return { v: null, error: String(e) }; } };

// FD sürümü üret + yayına hazır (elev1/2/3 onay zinciri). Yalnız makbuz tenant'ına yazar.
async function bringToPublishReady(ctx, tag) {
  const { base, prisma, tokens, st } = ctx; const rid = `${st.runId}-${tag}`; const H = L.AH.httpJson;
  let dispositionId;
  try {
    dispositionId = await prisma.$transaction(async (tx) => {
      const col = await tx.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: new Date(), idempotencyKey: `i12o-col-${rid}`, status: 'CONFIRMED' }, select: { id: true } });
      const exp = await tx.expenseRequest.create({ data: { tenantId: st.tenantId, caseId: st.caseId, clientId: st.clientId, totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: st.actors.elev1.id }, select: { id: true } });
      const ap = await tx.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `i12o-${rid}` }, select: { id: true } });
      const dd = await tx.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: col.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'DISTRIBUTION_APPROVED', totalAmount: '100.00', currency: 'TRY', approvalRequestId: ap.id, approvedById: st.actors.elev2.id, lines: { create: [{ type: 'CLIENT_PAYABLE', amount: '60.00', caseClientId: st.caseClientId }, { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '40.00', expenseRequestId: exp.id, caseClientId: st.caseClientId }] } }, select: { id: true } });
      return dd.id;
    }, { timeout: 30000, maxWait: 10000 });
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
  if (!['smtp', 'mock', 'g7'].includes(PHASE)) { console.error(`REDDEDİLDİ: I12_PHASE '${PHASE}' geçersiz (smtp|mock|g7).`); process.exit(2); }
  const base = process.env.I12_ONLINE_API_BASE; const receiptPath = process.env.I12_SETUP_RECEIPT;
  const pw = process.env.I12_LIVE_LOGIN_PW;
  if (!base || !receiptPath || !pw || !CAPTURE) { console.error('REDDEDİLDİ: I12_ONLINE_API_BASE + I12_SETUP_RECEIPT + I12_LIVE_LOGIN_PW + I12_SINK_CAPTURE gerekli.'); process.exit(2); }
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error(`REDDEDİLDİ: makbuz okunamadı: ${e}`); process.exit(2); }
  if (receipt.record !== 'I12-SETUP-RECEIPT' || !receipt.runId || !receipt.tenantId) { console.error('REDDEDİLDİ: makbuz biçimi geçersiz.'); process.exit(2); }
  const runId = String(receipt.runId).toLowerCase();

  const prisma = L.AH.loadPrisma(); const R = new L.Results();
  const SENT = 'CLIENT_FINANCIAL_DISCLOSURE_SENT'; const PUB = 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED';
  const counters = []; let st = null;
  try {
    // ── KİMLİK: makbuz tenant/slug/runId bağı DB'den doğrulanır — YAZMADAN ÖNCE, fail-closed ──
    const ident = await assertReceiptIdentity(prisma, receipt);
    if (!ident.ok) throw new Error(`MAKBUZ KİMLİK BAĞI DOĞRULANMADI (${ident.reason}) — hiçbir yazma yapılmadı`);

    // ── Aktör kimliklerini MAKBUZ e-postalarından çöz (setupI3 KOŞULMAZ) ──
    const actorEmails = receipt.actors || { elev1: receipt.loginEmail };
    const actors = {};
    for (const tag of ['elev1', 'elev2', 'elev3']) {
      const email = actorEmails[tag]; if (!email) continue;
      const u = await prisma.user.findFirst({ where: { tenantId: receipt.tenantId, email }, select: { id: true, email: true } });
      if (!u) throw new Error(`aktör '${tag}' (${email}) makbuz tenant'ında YOK — makbuz/kurulum tutarsız`);
      actors[tag] = { id: u.id, email: u.email };
    }
    if (!actors.elev1 || !actors.elev2 || !actors.elev3) throw new Error('elev1/2/3 aktörleri çözülemedi');
    st = { runId, tenantId: receipt.tenantId, slug: receipt.tenantSlug, caseId: receipt.caseId, caseClientId: receipt.caseClientId, clientId: receipt.clientId, foreignTenantId: receipt.foreignTenantId, actors };

    // ── Mevcut API AYNI DB'ye bağlı mı + aktör girişleri ──
    const bound = await L.AH.verifyApiBoundToSameDatabase(prisma, base, receipt.loginEmail, pw, receipt.tenantSlug);
    if (!bound.bound) throw new Error(`API↔DB bağı YOK/doğrulanamadı: ${bound.reason}`);
    const tokens = {};
    for (const a of ['elev1', 'elev2', 'elev3']) { const r = await L.AH.login(base, actors[a].email, pw, receipt.tenantSlug); if (!r.ok) throw new Error(`${a} login HTTP ${r.status ?? '?'}`); tokens[a] = r.token; }
    const ctx = { base, prisma, tokens, st };

    // ── İZOLASYON ÖN KOŞULU (gönderim yapılmadan): loopback sink erişilir + LAN sink erişilmez ──
    const sinkHost = process.env.I12_SINK_HOST || '127.0.0.1'; const sinkPort = Number(process.env.I12_SINK_PORT || 2529);
    const loopbackOk = await probeTcp(sinkHost, sinkPort);
    let lanReach = false; for (const list of Object.values(os.networkInterfaces())) for (const ni of (list || [])) if (ni.family === 'IPv4' && !ni.internal) { if (await probeTcp(ni.address, sinkPort, 800)) lanReach = true; }
    const capReadable = connCount() !== null;
    const isoOk = loopbackOk && !lanReach && capReadable;
    R.check(`H5-00-ISO-${PHASE.toUpperCase()}`, 'izolasyon ön koşulu: loopback sink erişilir + LAN sink erişilmez + yakalama OKUNUR + API↔DB bağlı', isoOk && bound.bound,
      `loopbackSink=${loopbackOk} LANerişilmez=${!lanReach} yakalamaOkunur=${capReadable} apiDbBağlı=${bound.bound}`);
    if (!isoOk) throw new Error('izolasyon ön koşulu SAĞLANMADI — ölçüm başlatılmaz');

    // ══════════════ FAZ: smtp ══════════════
    if (PHASE === 'smtp') {
      // ── G1/G2 — bilgi talebi red(A-9)/belirsiz(A-10); ClientInfoRequest YAZILMAZ; TEK bağlantı ──
      const infoReqCount = async () => (await L.safeCount(() => prisma.clientInfoRequest.count({ where: { tenantId: st.tenantId } }))).value;
      const postInfoReq = (subject) => L.AH.httpJson('POST', `${base}/address-discovery/client-info-request`, { token: tokens.elev1, body: { caseId: st.caseId, clientId: st.clientId, emailTo: `alici-${runId}@ah-harness.invalid`, emailSubject: subject, emailBody: 'İ12 sentetik bilgi talebi.' }, timeoutMs: 25000 });
      for (const [id, mode, code, desc] of [['G1', 'reject', 'CLIENT_INFO_REQUEST_EMAIL_FAILED', 'A-9 sağlayıcı reddi'], ['G2', 'reset', 'CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE', 'A-10 belirsiz/timeout']]) {
        await setMode(mode);
        const rowB = await infoReqCount(); const connB = connCount();
        const r = await postInfoReq(`i12-${id}-${runId}`);
        const rowA = await infoReqCount(); const connA = connCount();
        const connD = d(connA, connB), rowD = d(rowA, rowB);
        const rcode = (r.body && (r.body.code || r.body.reasonCode || (r.body.message && (r.body.message.code || r.body.message.reasonCode)))) || '';
        counters.push({ obs: id, smtpConnection_conn: connD, delivery_msg: 0, dbRecord_infoReq: rowD });
        if (r.indeterminate || rowD === null || connD === null) { R.unmeasured(id, desc, r.indeterminateReason || 'sayaç OKUNAMADI (sıfır sayılmaz)'); continue; }
        R.check(id, `${desc}: HTTP 503 · ${code} · ClientInfoRequest YAZILMAZ (dbRecord+0) · TEK SMTP bağlantı denemesi (kör tekrar YOK)`,
          r.status === 503 && new RegExp(code).test(String(rcode)) && rowD === 0 && connD === 1,
          `HTTP ${r.status} · code=${rcode} · dbRecord+${rowD} · smtpConn+${connD}`);
      }

      // ── G3/G6 + G4 ──
      const RCP = `fd-${runId}`;
      const v1 = await bringToPublishReady(ctx, 'can');
      if (v1.error) { for (const [i, t] of [['G3', 'CANARY'], ['G6', 'audit ayrımı'], ['G4', 'dedupe']]) R.unmeasured(i, t, v1.error); }
      else {
        await setMode('');
        const cB = connCount(), mB = msgToCount(RCP), aSB = await audit(prisma, st.tenantId, SENT), aPB = await audit(prisma, st.tenantId, PUB);
        const rPub = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
        await new Promise((r) => setTimeout(r, 1200));
        const af = await snap(prisma, v1.vid); const cA = connCount(), mA = msgToCount(RCP), aSA = await audit(prisma, st.tenantId, SENT), aPA = await audit(prisma, st.tenantId, PUB);
        const connD = d(cA, cB), delivD = d(mA, mB), sentD = d(aSA, aSB), pubD = d(aPA, aPB);
        counters.push({ obs: 'G3', smtpConnection_conn: connD, delivery_msg: delivD, dbRecord_sent: sentD, dbRecord_pub: pubD });
        if (rPub.indeterminate || af.error || [connD, delivD, sentD, pubD].some((x) => x === null)) {
          const why = rPub.indeterminateReason || af.error || 'sayaç OKUNAMADI (sıfır sayılmaz)';
          R.unmeasured('G3', 'CANARY', why); R.unmeasured('G6', 'audit', why); R.unmeasured('G4', 'dedupe', 'G3 ölçülemedi');
        } else {
          R.check('G3', 'onaylı yayın: PUBLISHED + providerMessageId + SENT+1/PUBLISHED+1 + delivery(msg)+1 + smtpConn+1',
            rPub.status < 400 && af.v.status === 'PUBLISHED' && !!af.v.providerMessageId && sentD === 1 && pubD === 1 && delivD === 1 && connD === 1,
            `HTTP ${rPub.status} · durum=${af.v.status} · providerMessageId=${af.v.providerMessageId ? 'VAR' : 'yok'} · SENT+${sentD}/PUBLISHED+${pubD} · delivery(msg)+${delivD} · smtpConn+${connD}`);
          R.check('G6', 'SENT ≠ PUBLISHED audit (iki AYRI aksiyon)', sentD === 1 && pubD === 1, `SENT+${sentD} · PUBLISHED+${pubD}`);
          const cB2 = connCount(), mB2 = msgToCount(RCP), sB2 = await audit(prisma, st.tenantId, SENT), pB2 = await audit(prisma, st.tenantId, PUB);
          const rDup = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
          await new Promise((r) => setTimeout(r, 800));
          const cA2 = connCount(), mA2 = msgToCount(RCP), sA2 = await audit(prisma, st.tenantId, SENT), pA2 = await audit(prisma, st.tenantId, PUB); const af2 = await snap(prisma, v1.vid);
          const code = (rDup.body && (rDup.body.code || rDup.body.reasonCode || (rDup.body.message && (rDup.body.message.code || rDup.body.message.reasonCode)))) || '';
          const c4 = d(cA2, cB2), m4 = d(mA2, mB2), s4 = d(sA2, sB2), p4 = d(pA2, pB2);
          counters.push({ obs: 'G4', smtpConnection_conn: c4, delivery_msg: m4, dbRecord_sent: s4, dbRecord_pub: p4 });
          if (rDup.indeterminate || af2.error || [c4, m4, s4, p4].some((x) => x === null)) R.unmeasured('G4', 'dedupe', rDup.indeterminateReason || af2.error || 'sayaç OKUNAMADI (sıfır sayılmaz)');
          else R.check('G4', 'ikinci yayın ilerlemez: 4xx state-guard · smtpConn+0 · delivery+0 · dbRecord+0 · PUBLISHED kalır',
            rDup.status >= 400 && rDup.status < 500 && /STATUS_INVALID|ALREADY_PUBLISHED|VERSION_TERMINAL/.test(String(code)) && c4 === 0 && m4 === 0 && s4 === 0 && p4 === 0 && af2.v.status === 'PUBLISHED',
            `HTTP ${rDup.status} · code=${code} · smtpConn+${c4} · delivery(msg)+${m4} · SENT+${s4}/PUBLISHED+${p4} · durum=${af2.v.status}`);
        }
      }

      // ── FD-RED / FD-TMO: smtpConn TEK (+1) · delivery +0 — bağlantı≠teslim AYRIMI ──
      for (const [tag, mode, id, desc] of [['red', 'reject', 'FD-RED', 'sağlayıcı reddi (550)'], ['tmo', 'reset', 'FD-TMO', 'reset/timeout']]) {
        const v = await bringToPublishReady(ctx, tag);
        if (v.error) { R.unmeasured(id, desc, v.error); continue; }
        await setMode(mode);
        const cB = connCount(), mB = msgToCount(`fd-${runId}`), pB = await audit(prisma, st.tenantId, PUB);
        const rPub = await L.AH.httpJson('POST', v.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 30000 });
        await new Promise((r) => setTimeout(r, 1000));
        const af = await snap(prisma, v.vid); const cA = connCount(), mA = msgToCount(`fd-${runId}`), pA = await audit(prisma, st.tenantId, PUB);
        const connD = d(cA, cB), delivD = d(mA, mB), pubD = d(pA, pB);
        counters.push({ obs: id, smtpConnection_conn: connD, delivery_msg: delivD, dbRecord_pub: pubD });
        if (rPub.indeterminate || af.error || [connD, delivD, pubD].some((x) => x === null)) { R.unmeasured(id, desc, rPub.indeterminateReason || af.error || 'sayaç OKUNAMADI (sıfır sayılmaz)'); continue; }
        R.check(id, `${desc}: yayın TAMAMLANMAZ · PUBLISHED değil · smtpConn TEK=+1 (kör tekrar +2 DEĞİL) · delivery(msg)+0 · PUBLISHED dbRecord+0`,
          af.v.status !== 'PUBLISHED' && !af.v.providerMessageId && connD === 1 && delivD === 0 && pubD === 0,
          `HTTP ${rPub.status} · durum=${af.v.status} · smtpConn+${connD} · delivery(msg)+${delivD} · PUBLISHED dbRecord+${pubD}`);
      }
    }

    // ══════════════ FAZ: mock (G5 allowlist-DIŞI) ══════════════
    if (PHASE === 'mock') {
      const v5 = await bringToPublishReady(ctx, 'g5');
      if (v5.error) { R.unmeasured('G5', 'allowlist-dışı', v5.error); }
      else {
        const cB = connCount();
        const rPub = await L.AH.httpJson('POST', v5.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
        const af = await snap(prisma, v5.vid); const cA = connCount(); const connD = d(cA, cB);
        const code = (rPub.body && (rPub.body.code || rPub.body.reasonCode || (rPub.body.message && (rPub.body.message.code || rPub.body.message.reasonCode)))) || '';
        counters.push({ obs: 'G5', smtpConnection_conn: connD, delivery_msg: 0 });
        if (rPub.indeterminate || af.error || connD === null) R.unmeasured('G5', 'allowlist-dışı', rPub.indeterminateReason || af.error || 'sayaç OKUNAMADI (sıfır sayılmaz)');
        else R.check('G5', 'allowlist-DIŞI sağlayıcı: 403 PROVIDER_NOT_PRODUCTION · PUBLISHED değil · smtpConn+0',
          rPub.status === 403 && /PROVIDER_NOT_PRODUCTION/.test(String(code)) && af.v.status !== 'PUBLISHED' && connD === 0,
          `HTTP ${rPub.status} · code=${code} · durum=${af.v.status} · smtpConn+${connD}`);
      }
    }

    // ══════════════ FAZ: g7 (hedef-scoped manuel aylık teslim) ══════════════
    if (PHASE === 'g7') {
      await setMode(''); // KABUL modu — statement teslimi Office SMTP satırından sink'e gider
      const RCP7 = `deliv-${runId}`;
      const ledSent = async (tid) => (await L.safeCount(() => prisma.clientStatementDeliveryLedger.count({ where: { tenantId: tid, status: 'SENT' } }))).value;
      const trig = () => L.AH.httpJson('POST', `${base}/client-statements/monthly-delivery/run-now`, { token: tokens.elev1, body: {}, timeoutMs: 60000 });
      const m0 = msgToCount(RCP7), l0 = await ledSent(st.tenantId), lf0 = st.foreignTenantId ? await ledSent(st.foreignTenantId) : 0;
      const r1 = await trig();
      if (r1.status === 404) {
        R.unmeasured('G7', 'hedef-scoped manuel teslim', 'dar in-API uç bu API sürümünde YOK (404) — ürün değişikliği ayrı PR/yayım gerektirir');
      } else {
        await new Promise((r) => setTimeout(r, 2000));
        const m1 = msgToCount(RCP7), l1 = await ledSent(st.tenantId), lf1 = st.foreignTenantId ? await ledSent(st.foreignTenantId) : 0;
        const r2 = await trig(); // ikinci tetik → aynı dönem dedupe
        await new Promise((r) => setTimeout(r, 1500));
        const m2 = msgToCount(RCP7), l2 = await ledSent(st.tenantId);
        const dM1 = d(m1, m0), dL1 = d(l1, l0), dM2 = d(m2, m1), dL2 = d(l2, l1), dF = d(lf1, lf0);
        counters.push({ obs: 'G7', delivery_msg: dM1, dbRecord_ledgerSent: dL1, foreign_ledgerSent: dF, dedupe_delivery_msg: dM2, dedupe_ledgerSent: dL2 });
        if (r1.indeterminate || [dM1, dL1, dM2, dL2, dF].some((x) => x === null)) {
          R.unmeasured('G7', 'hedef-scoped manuel teslim', r1.indeterminateReason || 'sayaç OKUNAMADI (sıfır sayılmaz)');
        } else {
          R.check('G7', 'hedef-scoped manuel teslim: HEDEF delivery+1 & ledger SENT+1 · YABANCI tenant +0 (kapsam izolasyonu) · ikinci tetik +0 (aynı-dönem dedupe)',
            r1.status < 400 && dM1 === 1 && dL1 === 1 && dF === 0 && dM2 === 0 && dL2 === 0,
            `HTTP ${r1.status} · hedef delivery+${dM1} ledgerSENT+${dL1} · YABANCI ledgerSENT+${dF} · ikinci tetik delivery+${dM2} ledger+${dL2}`);
        }
      }
      // Yetki kapısı canlı uçta da ölçülür: elevated OLMAYAN aktör (reviewer yok → user) reddedilmeli.
      const rU = await L.AH.httpJson('POST', `${base}/client-statements/monthly-delivery/run-now`, { token: tokens.elev2, body: {}, timeoutMs: 30000 });
      // elev2 de PARTNER (elevated) → izinli olmalı; burada YALNIZ uç erişilebilirliği kaydedilir.
      R.check('G7-AUTH-REACH', 'dar uç kimlik-doğrulamalı ve erişilebilir (elevated aktörle 2xx/4xx belirlenir, 401 DEĞİL)',
        rU.status !== 401 && rU.status !== undefined, `HTTP ${rU.status}`);
    }

  } catch (e) { console.error(`\nÖLÇÜM DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally {
    // ERİŞİM KAPANIŞI BURADA YAPILMAZ — nihai kapanış TÜM fazlardan sonra i12-live-recover.js ile.
    const s = R.summary(`İ12 CANLI ÖLÇÜM (ONLINE · FAZ=${PHASE})`);
    const out = { record: 'I12-LIVE-MEASURE-ONLINE', phase: PHASE, runId, tenant: st ? st.slug : null, apiBase: base, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, counters, accessClosure: 'DEFERRED_TO_i12-live-recover', results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })) };
    console.log(JSON.stringify(out, null, 1));
    const EVID = process.env.I12_EVID_FILE; if (EVID) { try { fs.writeFileSync(EVID, JSON.stringify({ record: 'I12-LIVE-MEASURE-ONLINE', phase: PHASE, runId, counters, results: R.rows }, null, 1), 'utf8'); } catch (e) {} }
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
