/*
 * İ12 — AÇIK ÖLÇÜM TAMAMLAMALARI (R02) · gerçek claim/reclaim + hang-timeout + gecikmeli gönderim kontrolü
 * İ3 düzeneğini yeniden kullanır. Yalnız R01'de kapsanmayan ölçümler:
 *   CLAIM  · eşzamanlı iki yayın → gerçek claim (sendRequestedAt); biri PUBLISHED, diğeri
 *            SEND_ALREADY_CLAIMED/terminal; GERÇEK dispatcher.send TAM 1 (çift gönderim YOK)
 *   RECLAIM· sağlayıcı reddi (SEND_FAILED) sonrası re-publish → RECLAIM (SEND_FAILED→SEND_PENDING)
 *            → sink kabul → PUBLISHED; reclaim MEŞRU tekrar (kör tekrar değil, ürünün kendi yolu)
 *   HANG   · sink `hang` (yanıtsız) → nodemailer greeting-timeout (~30 sn, kaynakta explicit yok=default)
 *            → INDETERMINATE→SEND_FAILED; ARDINDAN bekle → gecikmeli/kör gönderim YOK (send +0),
 *            kayıt YOK (PUBLISHED değil). Bekleme süresi kaynağın timeout+retry penceresine bağlı.
 * Sonuçlar + gözlemler DURABLE dosyaya yazılır (silinmez; manifestlenir).
 */
'use strict';
const path = require('path'); const fs = require('fs'); const net = require('net');
const { spawn } = require('child_process');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const CONFIG_FILE = process.env.I3_API_CONFIG; const API_CFG = CONFIG_FILE ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null;
const SINK_PORT = API_CFG ? Number(API_CFG.smtpPort) : 2526; const CAPTURE = API_CFG ? API_CFG.sinkCaptureDir : null; const SPY_FILE = API_CFG ? API_CFG.spyCounterFile : null;
const EVID = process.env.I12_EVID_FILE || path.join(process.cwd(), 'i12-gaps2-evidence.txt');
function probeTcp(h, p, ms = 1200) { return new Promise((r) => { const s = new net.Socket(); let d = false; const f = (o) => { if (!d) { d = true; s.destroy(); r(o); } }; s.setTimeout(ms); s.once('connect', () => f(true)); s.once('timeout', () => f(false)); s.once('error', () => f(false)); s.connect(p, h); }); }
function startSink() { return new Promise((res, rej) => { const c = spawn(process.execPath, [path.join(I3, 'i3-sink.js')], { env: { ...process.env, I3_SMTP_PORT: String(SINK_PORT), I3_SMTP_CAPTURE: CAPTURE }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; const t = setTimeout(() => rej(new Error('sink hazir olmadi')), 5000); c.stdout.on('data', (d) => { o += d; if (o.includes('I3-SMTP-SINK-READY')) { clearTimeout(t); res(c); } }); c.on('error', (e) => { clearTimeout(t); rej(e); }); }); }
async function setMode(m) { fs.writeFileSync(path.join(CAPTURE, 'mode'), m || '', 'utf8'); await new Promise((r) => setTimeout(r, 80)); }
function sendCount() { try { return JSON.parse(fs.readFileSync(SPY_FILE, 'utf8')).dispatcherSend; } catch (e) { return null; } }
const codeOf = (r) => (r && r.body && (r.body.code || r.body.reasonCode || (r.body.message && (r.body.message.code || r.body.message.reasonCode)))) || '';
const ev = []; const rec = (s) => { ev.push(s); console.log('   · ' + s); };

async function bringToPublishReady(ctx, tag) {
  const { base, prisma, tokens, st } = ctx; const rid = `${st.runId}-${tag}`; const H = L.AH.httpJson;
  const chain = await prisma.$transaction(async (tx) => {
    const collection = await tx.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: new Date(), idempotencyKey: `i12b-col-${rid}`, status: 'CONFIRMED' }, select: { id: true } });
    const expense = await tx.expenseRequest.create({ data: { tenantId: st.tenantId, caseId: st.caseId, clientId: st.clientId, totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: st.actors.elev1.id }, select: { id: true } });
    const approval = await tx.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `i12b-${rid}` }, select: { id: true } });
    const disp = await tx.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: collection.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'DISTRIBUTION_APPROVED', totalAmount: '100.00', currency: 'TRY', approvalRequestId: approval.id, approvedById: st.actors.elev2.id, lines: { create: [{ type: 'CLIENT_PAYABLE', amount: '60.00', caseClientId: st.caseClientId }, { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '40.00', expenseRequestId: expense.id, caseClientId: st.caseClientId }] } }, select: { id: true } });
    return { dispositionId: disp.id };
  }, { timeout: 30000, maxWait: 10000 });
  await H('POST', `${base}/collection-dispositions/${chain.dispositionId}/post`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  const rC = await H('POST', `${base}/collection-dispositions/${chain.dispositionId}/financial-disclosure`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  const vid = ((rC.body && (rC.body.data || rC.body)) || {}).disclosureVersionId; if (!vid) throw new Error('surum yok');
  const url = (s) => `${base}/client-financial-disclosures/${vid}/${s}`;
  const aid = async (f) => { try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { [f]: true } }); return v[f] || null; } catch (e) { return null; } };
  await H('POST', url('request-office-approval'), { token: tokens.elev1, body: {} });
  await H('POST', url('complete-office-approval'), { token: tokens.elev2, body: { approvalRequestId: await aid('officeApprovalRequestId') } });
  await H('POST', url('request-content-approval'), { token: tokens.elev1, body: { approvedRecipientEmail: `client-${st.runId}@ah-harness.invalid` } });
  await H('POST', url('complete-content-approval'), { token: tokens.elev3, body: { approvalRequestId: await aid('contentApprovalRequestId') } });
  return { vid, url };
}
const statusOf = async (prisma, vid) => { try { return await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { status: true, providerMessageId: true, sendRequestedAt: true } }); } catch (e) { return null; } };

(async () => {
  const envInfo = L.AH.assertDisposableEnvironment();
  const base = L.AH.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  const password = `I12b!${require('crypto').randomBytes(18).toString('base64url')}7q`; process.env.AH_LOGIN_PASSWORD = password;
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH); const R = new L.Results();
  let st = null; let sinkProc = null; let setupDone = false;
  rec(`env=${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName} · API=${base} · runId=${runId}`);
  try {
    fs.mkdirSync(CAPTURE, { recursive: true }); sinkProc = await startSink();
    const rb = L.readRuntimeWitness(API_CFG);
    if (!(await probeTcp('127.0.0.1', SINK_PORT)) || !rb.ok || rb.provider !== 'smtp') throw new Error(`izolasyon on kosulu SAGLANMADI (runtimeOk=${rb.ok} provider=${rb.provider})`);
    rec(`izolasyon: sink 127.0.0.1:${SINK_PORT} · provider=smtp (tanik OK)`);
    setupDone = true;
    st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(password, 10)); st.runId = runId;
    const bound = await L.AH.verifyApiBoundToSameDatabase(prisma, base, st.actors.elev1.email, password, st.slug);
    if (!bound.bound) { await prisma.tenant.delete({ where: { id: st.foreignTenantId } }).catch(() => {}); await prisma.tenant.delete({ where: { id: st.tenantId } }).catch(() => {}); st = null; throw new Error(`API disposable DB'ye bagli DEGIL: ${bound.reason}`); }
    const tokens = {}; for (const a of ['elev1', 'elev2', 'elev3']) { const r = await L.AH.login(base, st.actors[a].email, password, st.slug); if (!r.ok) throw new Error(`${a} login HTTP ${r.status ?? 'belirsiz'}`); tokens[a] = r.token; }
    const ctx = { base, prisma, tokens, st };

    // ═══ CLAIM · eszamanli iki yayin ═══
    const vClaim = await bringToPublishReady(ctx, 'claim');
    await setMode('');
    const sB = sendCount();
    const [r1, r2] = await Promise.all([
      L.AH.httpJson('POST', vClaim.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 }),
      L.AH.httpJson('POST', vClaim.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 }),
    ]);
    const sA = sendCount(); const stC = await statusOf(prisma, vClaim.vid);
    const oks = [r1, r2].filter((r) => !r.indeterminate && r.status < 400).length;
    const losers = [r1, r2].filter((r) => !r.indeterminate && r.status >= 400);
    const loserCode = losers.map((r) => codeOf(r)).join(',');
    const claimGuard = losers.length === 1 && /SEND_ALREADY_CLAIMED|STATUS_INVALID|VERSION_TERMINAL|ALREADY_PUBLISHED/.test(loserCode);
    rec(`CLAIM: r1=${r1.status ?? 'bel'}/${codeOf(r1)} r2=${r2.status ?? 'bel'}/${codeOf(r2)} · gercek send ${sB}->${sA} · durum=${stC && stC.status}`);
    if (r1.indeterminate || r2.indeterminate || sB === null || sA === null || !stC) R.unmeasured('CLAIM', 'eszamanli claim', 'belirsiz/sayac okunamadi');
    else R.check('CLAIM', 'eszamanli iki yayin: TAM BIRI PUBLISHED, digeri claim/terminal guard ile RED · GERCEK send TAM 1 (cift gonderim YOK)',
      oks === 1 && claimGuard && stC.status === 'PUBLISHED' && (sA - sB) === 1,
      `2xx=${oks} · red kodu=${loserCode} · gercek send +${sA - sB} (beklenen 1) · durum=${stC.status}`);

    // ═══ RECLAIM · SEND_FAILED sonrasi re-publish ═══
    const vRe = await bringToPublishReady(ctx, 'reclaim');
    await setMode('reject'); const s0 = sendCount();
    const rFail = await L.AH.httpJson('POST', vRe.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
    const st1 = await statusOf(prisma, vRe.vid); const s1 = sendCount();
    await setMode(''); // sink kabul
    const rRe = await L.AH.httpJson('POST', vRe.url('retry-publication'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
    const st2 = await statusOf(prisma, vRe.vid); const s2 = sendCount();
    rec(`RECLAIM: 1.red durum=${st1 && st1.status} send+${s1 - s0} · 2.retry-publication HTTP ${rRe.status}/${codeOf(rRe)} durum=${st2 && st2.status} send+${s2 - s1} pmid=${st2 && st2.providerMessageId ? 'VAR' : 'yok'}`);
    if (rFail.indeterminate || rRe.indeterminate || !st1 || !st2 || s0 === null || s2 === null) R.unmeasured('RECLAIM', 'reclaim', 'belirsiz/sayac');
    else R.check('RECLAIM', 'reddi (SEND_FAILED) sonrasi /retry-publication RECLAIM eder (retrySend: SEND_FAILED->SEND_PENDING->PUBLISHED) · her denemede TAM 1 send (kor tekrar degil, urunun kendi reclaim yolu)',
      st1.status === 'SEND_FAILED' && (s1 - s0) === 1 && rRe.status < 400 && st2.status === 'PUBLISHED' && !!st2.providerMessageId && (s2 - s1) === 1,
      `1.durum=${st1.status} (send+${s1 - s0}) · 2.durum=${st2.status} pmid=${st2.providerMessageId ? 'VAR' : 'yok'} (send+${s2 - s1}) — reclaim MESRU tekrar`);

    // ═══ HANG · yanitsiz → greeting-timeout → SEND_FAILED; ARDINDAN gecikmeli gonderim YOK ═══
    const vHang = await bringToPublishReady(ctx, 'hang');
    await setMode('hang'); const h0 = sendCount();
    const tHang = Date.now();
    const rHang = await L.AH.httpJson('POST', vHang.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 60000 });
    const hangMs = Date.now() - tHang; const stH1 = await statusOf(prisma, vHang.vid); const h1 = sendCount();
    rec(`HANG: HTTP ${rHang.status ?? 'bel(client-abort)'} /${codeOf(rHang)} · ${hangMs}ms (nodemailer greeting-timeout ~30s) · durum=${stH1 && stH1.status} · send+${h1 - h0}`);
    // Kaynak timeout+retry penceresi sonrasi GECIKMELI gonderim kontrolu: ek bekleme
    await setMode(''); // sink artik kabul etse bile: kor tekrar OLMAMALI
    await new Promise((r) => setTimeout(r, 20000));
    const stH2 = await statusOf(prisma, vHang.vid); const h2 = sendCount();
    rec(`HANG-sonrasi (20s bekleme, sink kabul): durum=${stH2 && stH2.status} · send ${h1}->${h2} (gecikmeli/kor gonderim yok=${h2 === h1})`);
    if (!stH1 || !stH2 || h0 === null || h2 === null) R.unmeasured('HANG', 'hang timeout', 'sayac/durum okunamadi');
    else {
      const notPub = stH1.status !== 'PUBLISHED' && stH2.status !== 'PUBLISHED';
      const noDelayed = h2 === h1; // bekleme sonrasi EK send YOK
      R.check('HANG', 'yanitsiz sink → greeting-timeout → yayin TAMAMLANMAZ (PUBLISHED degil, pmid yok) · bekleme sonrasi GECIKMELI/kor gonderim YOK (send delta 0) · kayit YOK',
        notPub && !stH2.providerMessageId && noDelayed && (h1 - h0) === 1,
        `ilk send+${h1 - h0} · durum=${stH1.status}->${stH2.status} · bekleme sonrasi send delta=${h2 - h1} (0 beklenir) · pmid=${stH2.providerMessageId ? 'VAR(!)' : 'yok'}`);
    }
  } catch (e) { rec(`DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally {
    if (sinkProc && sinkProc.exitCode === null) sinkProc.kill();
    if (setupDone && st) { try { await prisma.user.updateMany({ where: { tenantId: st.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); const active = (await prisma.user.findMany({ where: { tenantId: st.tenantId, isActive: true }, select: { id: true } })).length; R.check('I12-V2', 'erisim sonlandirildi', active === 0, `aktif kalan=${active}`); } catch (e) { R.add('I12-V2', 'erisim sonlandirma', L.VERDICT.FAIL, `${e && e.message}`); } }
    const s = R.summary('İ12 ACIK OLCUM TAMAMLAMALARI (R02)');
    const out = { record: 'I12-GAPS2', runId, tenant: st ? st.slug : null, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })), evidence: ev };
    try { fs.writeFileSync(EVID, JSON.stringify(out, null, 1), 'utf8'); } catch (e) {}
    console.log(JSON.stringify({ record: 'I12-GAPS2', runId, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, results: out.results.map((r) => ({ id: r.id, verdict: r.verdict })) }, null, 1));
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
