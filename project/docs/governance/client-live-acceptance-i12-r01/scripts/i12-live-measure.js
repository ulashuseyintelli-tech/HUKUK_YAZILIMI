/*
 * İ12 — DISPOSABLE ÖLÇÜM PROVASI (7 gözlem) · SELF-CONTAINED HARNESS · sink+spy+cron-hook
 *
 * ⚠️ SINIFLANDIRMA (R04g): Bu betik DISPOSABLE PROVADIR — CANLIDA KOŞMAZ.
 *   Kendi ortamını KENDİSİ kurar (setupI3), dist'i --require i3-spy + i12-cron-hook ile YENİDEN BOOT eder,
 *   port üzerinden süreç ÖLDÜRÜR (taskkill) ve G7'yi cron-hook 'direct' ile ENJEKTE eder. Bunların HİÇBİRİ
 *   pinli tek canlı API'ye (HukukPlatform-API) karşı geçerli/izinli DEĞİLDİR. Bu yüzden §7.9 CANLI dizisinden
 *   ÇIKARILDI. Canlı ölçüm AYRI giriş noktasındadır: `i12-live-measure-online.js` (mevcut API'ye bağlanır;
 *   setupI3/boot/hook/port-kill İÇERMEZ). Bu betiğin 12/12 kanıtı yalnız DISPOSABLE ortam davranışını belgeler.
 *
 * G-0 (assertDisposableEnvironment) EN BAŞTA çağrılır: AH_DATABASE_URL loopback + port∈{5439} + db∈{hukuk_fix1_test}
 *   değilse HİÇBİR yazma/süreç-başlatma yapılmadan REDDEDER. Böylece bu prova betiği canlı DB'de asla koşamaz.
 *
 * Yedi gözlem tek koşumda, tek (disposable) API'ye karşı, YALNIZ sentetik hedef tenant kapsamında:
 *   G1/G2  — bilgi talebi red/belirsiz
 *   G3/G6  — onaylı FD yayını: PUBLISHED + providerMessageId + SENT=1/PUBLISHED=1 audit (AYRI)
 *   G4     — aynı sürüm ikinci yayın: 4xx state-guard · gönderim +0 · audit +0
 *   FD-RED — sağlayıcı reddi (550): SEND_FAILED · gönderim TEK · audit +0
 *   FD-TMO — reset/timeout: SEND_FAILED · gönderim TEK (kör tekrar YOK)
 *   G5     — allowlist-DIŞI sağlayıcı (mock reboot): 403 PROVIDER_NOT_PRODUCTION · gönderim=0
 *   G7     — hedef-scoped runMonthlyDelivery (cron-hook ENJEKSİYON): gerçek gönderim + ledger SENT + dedupe
 *
 * FD SAYAÇ AYRIMI: gönderim-çağrısı ≈ SMTP bağlantı denemesi (sink conn-*), teslim = sink msg-*,
 * çift/kör = conn-* > beklenen. Bu disposable provada i3-spy `dispatcherSend` sayacı conn-* ile ÇAPRAZ-DOĞRULANIR
 * (conn-delta == send-delta) → conn-*'ın send-çağrısını sadık saydığı kanıtlanır. Ölçülemeyen PASS OLMAZ (üç değerli).
 *
 * KULLANIM (yalnız disposable): AH_DATABASE_URL(5439/hukuk_fix1_test) AH_API_BASE_URL AH_PRISMA_ROOT AH_BCRYPT_PATH
 *   I3_DIST_MAIN I3_DIST_ROOT I3_SMTP_PORT I12_WORK_DIR I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<ref> node i12-live-measure.js
 * G-0 KALDIRILMAZ. Sır makbuz/loga yazılmaz.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const net = require('net'); const os = require('os');
const { spawn, execSync } = require('child_process');
function probeTcp(host, port, timeoutMs = 1200) { return new Promise((resolve) => { const s = new net.Socket(); let done = false; const fin = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok); } }; s.setTimeout(timeoutMs); s.once('connect', () => fin(true)); s.once('timeout', () => fin(false)); s.once('error', () => fin(false)); s.connect(port, host); }); }
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const WORK = process.env.I12_WORK_DIR || process.cwd();
const PORT = Number(process.env.I12_MEASURE_PORT || 8100);
const SMTP_PORT = Number(process.env.I3_SMTP_PORT || 2529);
const DIST_MAIN = process.env.I3_DIST_MAIN;
const CAPTURE = path.join(WORK, 'meas-capture'); const SPY_FILE = path.join(WORK, 'meas-spy.json');
const CONFIG_FILE = path.join(WORK, 'meas-api-config.json');
const CRON_STATE = path.join(WORK, 'meas-cron-state.json'); const CRON_TRIG = path.join(WORK, 'meas-cron-trig.txt'); const CRON_RES = path.join(WORK, 'meas-cron-res.json');
const CRON_HOOK = path.join(__dirname, 'i12-cron-hook.js'); const SPY_HOOK = path.join(I3, 'i3-spy.js');

function listenersOn(p) { try { return [...new Set(execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${p}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^\d+$/.test(x)))]; } catch (e) { return []; } }
function stopPort(p) { for (const pid of listenersOn(p)) { try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch (e) {} } }
function startSink() { return new Promise((res, rej) => { const c = spawn(process.execPath, [path.join(I3, 'i3-sink.js')], { env: { ...process.env, I3_SMTP_PORT: String(SMTP_PORT), I3_SMTP_CAPTURE: CAPTURE }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; const t = setTimeout(() => rej(new Error('sink')), 5000); c.stdout.on('data', (d) => { o += d; if (o.includes('I3-SMTP-SINK-READY')) { clearTimeout(t); res(c); } }); }); }
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
async function waitFor(fn, ms, s = 500) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, s)); } return null; }
async function setMode(m) { fs.writeFileSync(path.join(CAPTURE, 'mode'), m || '', 'utf8'); await new Promise((r) => setTimeout(r, 100)); }
const connCount = () => { try { return fs.readdirSync(CAPTURE).filter((f) => f.startsWith('conn-')).length; } catch (e) { return 0; } };
const spySend = () => { try { return JSON.parse(fs.readFileSync(SPY_FILE, 'utf8')).dispatcherSend; } catch (e) { return null; } };
const sinkMsgTo = (n) => { try { let k = 0; for (const f of fs.readdirSync(CAPTURE)) { if (!f.startsWith('msg-')) continue; if (new RegExp('^To:[^\\n]*' + n, 'm').test(fs.readFileSync(path.join(CAPTURE, f), 'utf8'))) k++; } return k; } catch (e) { return 0; } };
const audit = async (prisma, tenantId, action) => (await L.safeCount(() => prisma.auditLog.count({ where: { tenantId, action } }))).value;

// API'yi ÇİFT --require (i3-spy + cron-hook) ile başlatır, config yazar (runH5 witness için).
async function bootApi(provider) {
  stopPort(PORT);
  const instanceToken = crypto.randomBytes(8).toString('hex');
  const env = { ...process.env, DATABASE_URL: L.AH.requireEnv('AH_DATABASE_URL'), REDIS_URL: process.env.I12_REDIS_URL || 'redis://127.0.0.1:6390', REDIS_KEY_PREFIX: `meas:${crypto.randomBytes(4).toString('hex')}:`, PORT: String(PORT), NODE_ENV: 'development', JWT_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ORIGIN: 'http://127.0.0.1:3999', EMAIL_PROVIDER: provider, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_USER: 'i3-sink@ah-harness.invalid', SMTP_PASS: 'i3-no-auth', EMAIL_FROM: 'noreply@ah-harness.invalid', CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED: 'true', CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED: 'true', CLIENT_STATEMENT_MONTHLY_DELIVERY: 'true', I3_INSTANCE_TOKEN: instanceToken, I3_SPY_FILE: SPY_FILE, I3_SMTP_CAPTURE: CAPTURE, I3_DIST_ROOT: process.env.I3_DIST_ROOT, I12_CRON_STATE: CRON_STATE, I12_CRON_TRIGGER: CRON_TRIG, I12_CRON_RESULT: CRON_RES };
  const out = fs.openSync(path.join(WORK, 'meas-api.log'), 'a');
  const child = spawn(process.execPath, ['--require', SPY_HOOK, '--require', CRON_HOOK, DIST_MAIN], { cwd: WORK, env, detached: true, stdio: ['ignore', out, out] }); child.unref();
  if (!await waitFor(async () => (listenersOn(PORT).length ? true : null), 45000, 1000)) throw new Error('API dinlemedi');
  const pid = listenersOn(PORT)[0];
  const config = { record: 'I3-API-CONFIG', instanceToken, pid: Number(pid), apiBaseUrl: `http://127.0.0.1:${PORT}/api`, apiPort: PORT, emailProvider: provider, smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, sinkCaptureDir: CAPTURE, spyCounterFile: SPY_FILE, allowlistBypassed: false, secretsInConfig: false, distMain: DIST_MAIN, apiReachable: true };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 1), 'utf8');
  await new Promise((r) => setTimeout(r, 1500)); // spy witness + cron predicate
  return config;
}

// FD sürümü üret + yayına hazır (elev1/2/3 onay zinciri). vid+url döner ya da {error}.
async function bringToPublishReady(ctx, tag) {
  const { base, prisma, tokens, st } = ctx; const rid = `${st.runId}-${tag}`; const H = L.AH.httpJson;
  let dispositionId;
  try {
    const r = await prisma.$transaction(async (tx) => {
      const col = await tx.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: new Date(), idempotencyKey: `i12m-col-${rid}`, status: 'CONFIRMED' }, select: { id: true } });
      const exp = await tx.expenseRequest.create({ data: { tenantId: st.tenantId, caseId: st.caseId, clientId: st.clientId, totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: st.actors.elev1.id }, select: { id: true } });
      const ap = await tx.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `i12m-${rid}` }, select: { id: true } });
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
  const rReqC = await H('POST', url('request-content-approval'), { token: tokens.elev1, body: { approvedRecipientEmail: `client-${st.runId}@ah-harness.invalid` } });
  if (rReqC.indeterminate || rReqC.status >= 400) return { error: `icerik-talep HTTP ${rReqC.status ?? '?'}` };
  const rCC = await H('POST', url('complete-content-approval'), { token: tokens.elev3, body: { approvalRequestId: await aid('contentApprovalRequestId') } });
  if (rCC.indeterminate || rCC.status >= 400) return { error: `icerik-onay HTTP ${rCC.status ?? '?'}` };
  return { vid, url };
}
const snap = async (prisma, vid) => { try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { status: true, providerMessageId: true } }); return { v, error: null }; } catch (e) { return { v: null, error: String(e) }; } };

(async () => {
  // G-0 (KALDIRILMAZ): bu DISPOSABLE provadır — canlı DB'de/API'de asla koşmaz. Yazma/süreç-başlatmadan ÖNCE.
  L.AH.assertDisposableEnvironment();
  if (process.env.I12_LIVE_CONFIRM !== '1') { console.error('REDDEDİLDİ: I12_LIVE_CONFIRM=1 gerekli.'); process.exit(3); }
  if (!(process.env.I12_LIVE_GO_REF && process.env.I12_LIVE_GO_REF.trim())) { console.error('REDDEDİLDİ: I12_LIVE_GO_REF DOLU olmalı.'); process.exit(3); }
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  const pw = `I12m!${crypto.randomBytes(16).toString('base64url')}`;
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH); const R = new L.Results();
  const SENT = 'CLIENT_FINANCIAL_DISCLOSURE_SENT'; const PUB = 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED';
  let st = null, sinkProc = null, apiUp = false;
  const crossChecks = [];
  try {
    fs.mkdirSync(CAPTURE, { recursive: true }); for (const f of fs.readdirSync(CAPTURE)) { if (/^(msg-|conn-)/.test(f)) try { fs.unlinkSync(path.join(CAPTURE, f)); } catch (e) {} }
    try { fs.unlinkSync(CRON_STATE); } catch (e) {} try { fs.unlinkSync(CRON_RES); } catch (e) {} fs.writeFileSync(CRON_TRIG, '', 'utf8');
    st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    // G7 statement aktivitesi + Office SMTP (env dolaylı; statement Office'ten okur → sink)
    const now = new Date(); const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 10, 0, 0));
    await prisma.caseClient.update({ where: { id: st.caseClientId }, data: { role: 'ALACAKLI' } });
    await prisma.client.update({ where: { id: st.clientId }, data: { email: `deliv-${runId}@ah-harness.invalid` } });
    const col = await prisma.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: prev, idempotencyKey: `i12m-g7-${runId}`, status: 'CONFIRMED' }, select: { id: true } });
    const ap = await prisma.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'x', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: prev, savedIntent: {}, payloadHash: `i12m-g7-${runId}` }, select: { id: true } });
    await prisma.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: col.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'POSTED', postedAt: prev, totalAmount: '100.00', currency: 'TRY', approvalRequestId: ap.id, approvedById: st.actors.elev2.id, lines: { create: [{ type: 'CLIENT_PAYABLE', amount: '100.00', caseClientId: st.caseClientId }] } }, select: { id: true } });
    await prisma.messageTemplate.create({ data: { tenantId: st.tenantId, code: 'STATEMENT_READY', name: 'Ekstre', category: 'STATEMENT_READY', channel: 'EMAIL', subject: 'Ekstre', body: 'Sayin muvekkil', isActive: true } });
    await prisma.office.upsert({ where: { tenantId: st.tenantId }, update: { smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpSecure: false }, create: { tenantId: st.tenantId, name: 'İ12 Ölçüm Büro', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpUser: 'i12m@ah.invalid', smtpPass: 'x', smtpSecure: false } });

    // ═══ BOOT-1 (smtp) ═══
    sinkProc = await startSink();
    const cfg = await bootApi('smtp'); apiUp = true;
    const base = cfg.apiBaseUrl;
    const bound = await L.AH.verifyApiBoundToSameDatabase(prisma, base, st.actors.elev1.email, pw, st.slug);
    if (!bound.bound) throw new Error(`API↔DB bağı YOK: ${bound.reason}`);
    const tokens = {}; for (const a of ['elev1', 'elev2', 'elev3', 'reviewer', 'user']) { const r = await L.AH.login(base, st.actors[a].email, pw, st.slug); if (!r.ok) throw new Error(`${a} login HTTP ${r.status ?? '?'}`); tokens[a] = r.token; }
    const ctx = { base, prisma, tokens, st };

    // ═══ İZOLASYON ÖN KOŞULU (gönderim yapılmadan): loopback erişilir + LAN erişilmez + provider=smtp→sink + witness ═══
    const rb = L.readRuntimeWitness(cfg);
    const loopbackOk = await probeTcp('127.0.0.1', SMTP_PORT);
    let lanReach = false; for (const list of Object.values(os.networkInterfaces())) for (const ni of (list || [])) if (ni.family === 'IPv4' && !ni.internal) { if (await probeTcp(ni.address, SMTP_PORT, 800)) lanReach = true; }
    const isoOk = loopbackOk && !lanReach && String(cfg.emailProvider).toLowerCase() === 'smtp' && rb.ok;
    R.check('H5-00-ISO', 'izolasyon ön koşulu: loopback erişilir + LAN erişilmez + provider=smtp (tanık) — sonda dahil gönderim ancak bununla', isoOk, `loopback=${loopbackOk} LANerişilmez=${!lanReach} provider=${cfg.emailProvider} tanık=${rb.ok}`);
    if (!isoOk) throw new Error('izolasyon ön koşulu SAĞLANMADI — ölçüm başlatılmaz');

    // ═══ G1/G2 — bilgi talebi red(A-9)/belirsiz(A-10); ClientInfoRequest YAZILMAZ; tek bağlantı ═══
    const infoReqCount = async () => (await L.safeCount(() => prisma.clientInfoRequest.count({ where: { tenantId: st.tenantId } }))).value;
    const postInfoReq = (subject) => L.AH.httpJson('POST', `${base}/address-discovery/client-info-request`, { token: tokens.elev1, body: { caseId: st.caseId, clientId: st.clientId, emailTo: `alici-${runId}@ah-harness.invalid`, emailSubject: subject, emailBody: 'İ12 sentetik bilgi talebi.' }, timeoutMs: 25000 });
    for (const [id, mode, code, desc] of [['G1', 'reject', 'CLIENT_INFO_REQUEST_EMAIL_FAILED', 'A-9 sağlayıcı reddi'], ['G2', 'reset', 'CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE', 'A-10 belirsiz/timeout']]) {
      await setMode(mode);
      const rowB = await infoReqCount(); const connB = connCount();
      const r = await postInfoReq(`i12-${id}-${runId}`);
      const rowA = await infoReqCount(); const connA = connCount();
      const rcode = (r.body && (r.body.code || r.body.reasonCode || (r.body.message && (r.body.message.code || r.body.message.reasonCode)))) || '';
      if (r.indeterminate || rowB == null || rowA == null) { R.unmeasured(id, desc, r.indeterminateReason || 'sayaç okunamadı'); continue; }
      R.check(id, `${desc}: HTTP 503 · ${code} · ClientInfoRequest YAZILMAZ (+0) · TEK bağlantı (kör tekrar YOK)`,
        r.status === 503 && new RegExp(code).test(String(rcode)) && (rowA - rowB) === 0 && (connA - connB) === 1,
        `HTTP ${r.status} · code=${rcode} · ClientInfoRequest +${rowA - rowB} · conn +${connA - connB} (tek=${(connA - connB) === 1})`);
    }

    // ═══ G3/G6 + G4 (onaylı yayın + dedupe) — conn+spy sayaç ayrımı ═══
    const v1 = await bringToPublishReady(ctx, 'can');
    if (v1.error) { R.unmeasured('G3', 'CANARY', v1.error); R.unmeasured('G6', 'audit ayrımı', v1.error); R.unmeasured('G4', 'dedupe', v1.error); }
    else {
      await setMode('');
      const cB = connCount(), yB = spySend(), aSB = await audit(prisma, st.tenantId, SENT), aPB = await audit(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      const af = await snap(prisma, v1.vid); const cA = connCount(), yA = spySend(), aSA = await audit(prisma, st.tenantId, SENT), aPA = await audit(prisma, st.tenantId, PUB);
      if (rPub.indeterminate || af.error) { R.unmeasured('G3', 'CANARY', rPub.indeterminateReason || af.error); R.unmeasured('G6', 'audit', 'G3 ölçülemedi'); R.unmeasured('G4', 'dedupe', 'G3 ölçülemedi'); }
      else {
        const connD = cA - cB, sentD = aSA - aSB, pubD = aPA - aPB, spyD = (yA !== null && yB !== null) ? yA - yB : null;
        crossChecks.push({ obs: 'G3', connDelta: connD, spyDelta: spyD });
        R.check('G3', 'onaylı yayın: PUBLISHED + providerMessageId + SENT+1/PUBLISHED+1 + gönderim(conn) +1',
          rPub.status < 400 && af.v.status === 'PUBLISHED' && !!af.v.providerMessageId && sentD === 1 && pubD === 1 && connD === 1,
          `HTTP ${rPub.status} · durum=${af.v.status} · providerMessageId=${af.v.providerMessageId ? 'VAR' : 'yok'} · SENT+${sentD} · PUBLISHED+${pubD} · conn+${connD}${spyD !== null ? ` (spy send+${spyD})` : ''}`);
        R.check('G6', 'SENT ≠ PUBLISHED audit (iki AYRI aksiyon)', sentD === 1 && pubD === 1, `SENT+${sentD} · PUBLISHED+${pubD}`);
        // G4: ikinci yayın
        await setMode('');
        const cB2 = connCount(), sB2 = await audit(prisma, st.tenantId, SENT), pB2 = await audit(prisma, st.tenantId, PUB);
        const rDup = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
        const cA2 = connCount(), sA2 = await audit(prisma, st.tenantId, SENT), pA2 = await audit(prisma, st.tenantId, PUB); const af2 = await snap(prisma, v1.vid);
        const code = (rDup.body && (rDup.body.code || rDup.body.reasonCode || (rDup.body.message && (rDup.body.message.code || rDup.body.message.reasonCode)))) || '';
        if (rDup.indeterminate || af2.error) { R.unmeasured('G4', 'dedupe', rDup.indeterminateReason || af2.error); }
        else R.check('G4', 'ikinci yayın ilerlemez: 4xx state-guard · gönderim(conn) +0 · audit +0 · PUBLISHED kalır',
          rDup.status >= 400 && rDup.status < 500 && /STATUS_INVALID|ALREADY_PUBLISHED|VERSION_TERMINAL/.test(String(code)) && (cA2 - cB2) === 0 && (sA2 - sB2) === 0 && (pA2 - pB2) === 0 && af2.v.status === 'PUBLISHED',
          `HTTP ${rDup.status} · code=${code} · conn+${cA2 - cB2} · SENT+${sA2 - sB2}/PUBLISHED+${pA2 - pB2} · durum=${af2.v.status}`);
      }
    }

    // ═══ FD-RED (reject 550) ═══
    for (const [tag, mode, id, desc] of [['red', 'reject', 'FD-RED', 'sağlayıcı reddi (550)'], ['tmo', 'reset', 'FD-TMO', 'reset/timeout']]) {
      const v = await bringToPublishReady(ctx, tag);
      if (v.error) { R.unmeasured(id, desc, v.error); continue; }
      await setMode(mode);
      const cB = connCount(), yB = spySend(), pB = await audit(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', v.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 30000 });
      const af = await snap(prisma, v.vid); const cA = connCount(), yA = spySend(), pA = await audit(prisma, st.tenantId, PUB);
      if (rPub.indeterminate || af.error) { R.unmeasured(id, desc, rPub.indeterminateReason || af.error); continue; }
      const connD = cA - cB, pubD = pA - pB, spyD = (yA !== null && yB !== null) ? yA - yB : null;
      crossChecks.push({ obs: id, connDelta: connD, spyDelta: spyD });
      // gönderim TEK: conn +1 (kör tekrar olsa +2 olurdu); teslim yok (msg artmaz — reddedildi/reset)
      R.check(id, `${desc}: yayın TAMAMLANMAZ · PUBLISHED değil · gönderim(conn) TEK=+1 (kör tekrar +2 DEĞİL) · PUBLISHED audit +0`,
        af.v.status !== 'PUBLISHED' && !af.v.providerMessageId && connD === 1 && pubD === 0,
        `HTTP ${rPub.status} · durum=${af.v.status} · conn+${connD} (tek=${connD === 1})${spyD !== null ? ` · spy send+${spyD}` : ''} · PUBLISHED audit+${pubD}`);
    }

    // ═══ G7 (hedef-scoped teslim) — cron-hook 'direct' ═══
    await setMode(''); // sink KABUL moduna (FD-TMO 'reset'ten sonra) — statement gönderimi başarılı olsun
    await waitFor(async () => readJson(CRON_STATE), 8000);
    const ledSent = async () => (await L.safeCount(() => prisma.clientStatementDeliveryLedger.count({ where: { tenantId: st.tenantId, status: 'SENT' } }))).value;
    const RCP = `deliv-${runId}`;
    const m0 = sinkMsgTo(RCP), l0 = await ledSent();
    try { fs.unlinkSync(CRON_RES); } catch (e) {} fs.writeFileSync(CRON_TRIG, `direct ${st.tenantId}`, 'utf8');
    const r1 = await waitFor(async () => { const r = readJson(CRON_RES); return r && r.record === 'I12-CRON-DIRECT' ? r : null; }, 25000, 400);
    await new Promise((r) => setTimeout(r, 1500));
    const m1 = sinkMsgTo(RCP), l1 = await ledSent();
    // 2. tetik (dedupe)
    try { fs.unlinkSync(CRON_RES); } catch (e) {} fs.writeFileSync(CRON_TRIG, `direct ${st.tenantId}`, 'utf8');
    await waitFor(async () => { const r = readJson(CRON_RES); return r && r.record === 'I12-CRON-DIRECT' ? r : null; }, 25000, 400);
    await new Promise((r) => setTimeout(r, 1200));
    const m2 = sinkMsgTo(RCP), l2 = await ledSent();
    if (!r1) R.unmeasured('G7', 'cron teslim', 'direct tetik tamamlanmadı');
    else R.check('G7', 'hedef-scoped teslim: ilk tetik gönderim+1 & ledger SENT+1; ikinci tetik +0 (dedupe)',
      (m1 - m0) === 1 && (l1 - l0) === 1 && (m2 - m1) === 0 && (l2 - l1) === 0,
      `ilk: sink+${m1 - m0} ledgerSENT+${l1 - l0} · ikinci: sink+${m2 - m1} ledger+${l2 - l1}`);

    // ═══ BOOT-2 (mock) → G5 allowlist-DIŞI ═══
    // v5 zincirini smtp boot HÂLÂ AYAKTAYKEN hazırla (yayına-hazır sürüm); sonra mock boot'ta yayınla.
    const v5 = await bringToPublishReady(ctx, 'g5');
    stopPort(PORT); apiUp = false;
    const cfg2 = await bootApi('mock'); apiUp = true;
    const tok5 = {}; for (const a of ['elev1', 'elev3']) { const r = await L.AH.login(cfg2.apiBaseUrl, st.actors[a].email, pw, st.slug); tok5[a] = r.ok ? r.token : null; }
    if (v5.error || !tok5.elev3) { R.unmeasured('G5', 'allowlist-dışı', v5.error || 'login'); }
    else {
      const cB = connCount(), pB = await audit(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', `${cfg2.apiBaseUrl}/client-financial-disclosures/${v5.vid}/publish`, { token: tok5.elev3, body: {}, timeoutMs: 25000 });
      const af = await snap(prisma, v5.vid); const cA = connCount(), pA = await audit(prisma, st.tenantId, PUB);
      const code = (rPub.body && (rPub.body.code || rPub.body.reasonCode || (rPub.body.message && (rPub.body.message.code || rPub.body.message.reasonCode)))) || '';
      if (rPub.indeterminate || af.error) R.unmeasured('G5', 'allowlist-dışı', rPub.indeterminateReason || af.error);
      else R.check('G5', 'allowlist-DIŞI sağlayıcı: 403 PROVIDER_NOT_PRODUCTION · PUBLISHED değil · gönderim(conn) +0',
        rPub.status === 403 && /PROVIDER_NOT_PRODUCTION/.test(String(code)) && af.v.status !== 'PUBLISHED' && (cA - cB) === 0,
        `HTTP ${rPub.status} · code=${code} · durum=${af.v.status} · conn+${cA - cB}`);
    }

    // ═══ FD SAYAÇ AYRIMI KANITI: conn-delta == spy-delta (izolede i3-spy varsa) ═══
    const xc = crossChecks.filter((c) => c.spyDelta !== null);
    if (xc.length === 0) R.unmeasured('FD-COUNT-XCHECK', 'conn==spy çapraz', 'spy okunamadı');
    else R.check('FD-COUNT-XCHECK', 'FD sayaç ayrımı: her gözlemde SMTP conn-delta == i3-spy send-delta (conn-* send-çağrısını sadık sayar; çift/kör conn ile ayrılır)',
      xc.every((c) => c.connDelta === c.spyDelta),
      xc.map((c) => `${c.obs}: conn+${c.connDelta}==spy+${c.spyDelta}`).join(' · '));

  } catch (e) { console.error(`\nÖLÇÜM DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally {
    stopPort(PORT); if (sinkProc && sinkProc.exitCode === null) sinkProc.kill();
    if (st) { try { await prisma.user.updateMany({ where: { tenantId: st.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); const active = (await prisma.user.findMany({ where: { tenantId: st.tenantId, isActive: true }, select: { id: true } })).length; R.check('I12-CLOSE', 'erişim sonlandırıldı', active === 0, `aktif=${active}`); } catch (e) {} }
    const s = R.summary('İ12 DISPOSABLE ÖLÇÜM PROVASI');
    console.log(JSON.stringify({ record: 'I12-DISPOSABLE-MEASURE', note: 'DISPOSABLE prova — canlı değil', runId, tenant: st ? st.slug : null, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })) }, null, 1));
    const EVID = process.env.I12_EVID_FILE; if (EVID) { try { fs.writeFileSync(EVID, JSON.stringify({ record: 'I12-DISPOSABLE-MEASURE', note: 'DISPOSABLE prova — canlı değil', runId, results: R.rows }, null, 1), 'utf8'); } catch (e) {} }
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
