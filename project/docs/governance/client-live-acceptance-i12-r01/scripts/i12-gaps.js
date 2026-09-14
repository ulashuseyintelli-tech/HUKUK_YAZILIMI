/*
 * İ12 — H6 GÖNDERİM KABUL YENİLEMESİ · AÇIK ÖLÇÜM KOLLARI (smtp instance)
 *
 * İ3 düzeneğini (kapanmış, kanıtlanmış) YENİDEN KULLANIR — yeni izolasyon/erişim mekanizması KURMAZ.
 * Yalnız İ3-GREEN kanıtının KAPSAMADIĞI ölçümleri tamamlar:
 *   FD-RED  · sağlayıcı reddi (sink 550) → SEND_FAILED, PUBLISHED değil, providerMessageId yok, TEK send
 *   FD-TMO  · timeout/ECONNRESET (sink reset) → yayın tamamlanmaz, TEK send (ikinci çağrı YOK), sonrası kayıt/gönderim yok
 *   G3-CAN  · onaylı yayın → PUBLISHED + providerMessageId + runId-kapsamlı SENT=1/PUBLISHED=1 + duplicate=0
 *   G4-DED  · aynı sürüm ikinci yayın → ALREADY_PUBLISHED; gerçek send ARTMAZ; yeni audit YOK (çağrı/kayıt sayıları AYRI)
 *   G6-SEP  · SENT ≠ PUBLISHED audit ayrımı (G3-CAN'dan)
 * Ölçülemeyen sonuç PASS OLMAZ (i3-lib üç değerli). Sağlayıcıya gönderim yalnız loopback sink'e.
 *
 * KULLANIM (yalnız izole prova):
 *   AH_DATABASE_URL=... AH_API_BASE_URL=http://127.0.0.1:8099/api I3_API_CONFIG=<cfg> I3_SMTP_PORT=2526
 *   AH_PRISMA_ROOT=<r23 prisma> AH_BCRYPT_PATH=<r23 bcrypt> node i12-gaps.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));

const CONFIG_FILE = process.env.I3_API_CONFIG;
const API_CFG = CONFIG_FILE ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null;
const SINK_PORT = API_CFG ? Number(API_CFG.smtpPort) : Number(process.env.I3_SMTP_PORT || 2526);
const CAPTURE = API_CFG ? API_CFG.sinkCaptureDir : path.join(process.cwd(), 'i3-smtp-capture');
const SPY_FILE = API_CFG ? API_CFG.spyCounterFile : null;

function probeTcp(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const s = new net.Socket(); let done = false;
    const fin = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok); } };
    s.setTimeout(timeoutMs);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));
    s.once('error', () => fin(false));
    s.connect(port, host);
  });
}
function startSink() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(I3, 'i3-sink.js')], {
      env: { ...process.env, I3_SMTP_PORT: String(SINK_PORT), I3_SMTP_CAPTURE: CAPTURE },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const t = setTimeout(() => reject(new Error('i3-sink 5 sn icinde hazir olmadi')), 5000);
    child.stdout.on('data', (d) => { out += d.toString(); if (out.includes('I3-SMTP-SINK-READY')) { clearTimeout(t); resolve(child); } });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}
function sinkFiles(pre) { try { return fs.readdirSync(CAPTURE).filter((f) => f.startsWith(pre)); } catch (e) { return []; } }
async function setMode(m) { fs.writeFileSync(path.join(CAPTURE, 'mode'), m || '', 'utf8'); await new Promise((r) => setTimeout(r, 80)); }
function sendCount() { try { return JSON.parse(fs.readFileSync(SPY_FILE, 'utf8')).dispatcherSend; } catch (e) { return null; } }
function connCount() { return sinkFiles('conn-').length; }

/** action-bazli audit sayaci (disposable tenant = runId kapsami). */
async function auditCount(prisma, tenantId, action) {
  const r = await L.safeCount(() => prisma.auditLog.count({ where: { tenantId, action } }));
  return r; // { value, error }
}

/** Bir FD surumu uretir ve YAYINA HAZIR (icerik onaylanmis) hale getirir; vid doner ya da {error}. */
async function bringToPublishReady(ctx, tag) {
  const { base, prisma, tokens, st } = ctx;
  // Zincir kayitlari (benzersiz idempotencyKey)
  const rid = `${st.runId}-${tag}`;
  let chain;
  try {
    chain = await prisma.$transaction(async (tx) => {
      const collection = await tx.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: new Date(), idempotencyKey: `i12-col-${rid}`, status: 'CONFIRMED' }, select: { id: true } });
      const expense = await tx.expenseRequest.create({ data: { tenantId: st.tenantId, caseId: st.caseId, clientId: st.clientId, totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: st.actors.elev1.id }, select: { id: true } });
      const approval = await tx.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `i12-${rid}` }, select: { id: true } });
      const disposition = await tx.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: collection.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'DISTRIBUTION_APPROVED', totalAmount: '100.00', currency: 'TRY', approvalRequestId: approval.id, approvedById: st.actors.elev2.id, lines: { create: [ { type: 'CLIENT_PAYABLE', amount: '60.00', caseClientId: st.caseClientId }, { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '40.00', expenseRequestId: expense.id, caseClientId: st.caseClientId } ] } }, select: { id: true } });
      return { dispositionId: disposition.id };
    }, { timeout: 30000, maxWait: 10000 });
  } catch (e) { return { error: `zincir kurulamadi: ${e && e.message ? e.message.slice(0, 160) : e}` }; }

  const H = L.AH.httpJson;
  const rPost = await H('POST', `${base}/collection-dispositions/${chain.dispositionId}/post`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  if (rPost.indeterminate || rPost.status >= 400) return { error: `post basarisiz HTTP ${rPost.status ?? 'belirsiz'}` };
  const rCreate = await H('POST', `${base}/collection-dispositions/${chain.dispositionId}/financial-disclosure`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  const cd = (rCreate.body && (rCreate.body.data || rCreate.body)) || {};
  const vid = cd.disclosureVersionId || null;
  if (!vid) return { error: `surum uretilemedi HTTP ${rCreate.status ?? 'belirsiz'}` };
  const url = (s) => `${base}/client-financial-disclosures/${vid}/${s}`;
  const approvalIdOf = async (field) => { try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { [field]: true } }); return v[field] || null; } catch (e) { return null; } };
  // ofis onay talebi + tamamla (elev2)
  const rReqO = await H('POST', url('request-office-approval'), { token: tokens.elev1, body: {} });
  if (rReqO.indeterminate || rReqO.status >= 400) return { error: `ofis onay talebi HTTP ${rReqO.status ?? 'belirsiz'}` };
  const rO = await H('POST', url('complete-office-approval'), { token: tokens.elev2, body: { approvalRequestId: await approvalIdOf('officeApprovalRequestId') } });
  if (rO.indeterminate || rO.status >= 400) return { error: `ofis onayi HTTP ${rO.status ?? 'belirsiz'}` };
  // icerik onay talebi + tamamla (elev3)
  const rReqC = await H('POST', url('request-content-approval'), { token: tokens.elev1, body: { approvedRecipientEmail: `client-${st.runId}@ah-harness.invalid` } });
  if (rReqC.indeterminate || rReqC.status >= 400) return { error: `icerik onay talebi HTTP ${rReqC.status ?? 'belirsiz'}` };
  const rC = await H('POST', url('complete-content-approval'), { token: tokens.elev3, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } });
  if (rC.indeterminate || rC.status >= 400) return { error: `icerik onayi HTTP ${rC.status ?? 'belirsiz'} code=${(rC.body && (rC.body.code||rC.body.reasonCode))||''}` };
  return { vid, url };
}

async function snap(prisma, vid) {
  try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { status: true, providerMessageId: true, providerAcceptedAt: true } }); return { v, error: null }; }
  catch (e) { return { v: null, error: e && e.message ? e.message : String(e) }; }
}

(async () => {
  const envInfo = L.AH.assertDisposableEnvironment();
  const base = L.AH.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  const password = `I12!${crypto.randomBytes(18).toString('base64url')}7q`;
  process.env.AH_LOGIN_PASSWORD = password;
  console.log(`İ12 ACIK OLCUM KOLLARI — runId=${runId} · db=${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName} · API=${base}`);

  const prisma = L.AH.loadPrisma();
  const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const R = new L.Results();
  let st = null; let sinkProc = null; let setupDone = false;

  try {
    fs.mkdirSync(CAPTURE, { recursive: true });
    sinkProc = await startSink();
    const sinkOk = await probeTcp('127.0.0.1', SINK_PORT);
    // Runtime tanik + izolasyon: provider=smtp→sink, LAN erisilmez
    const rb = L.readRuntimeWitness(API_CFG);
    if (!sinkOk || !rb.ok || rb.provider !== 'smtp') {
      throw new Error(`izolasyon on kosulu SAGLANMADI (sinkOk=${sinkOk} runtimeOk=${rb.ok} provider=${rb.provider})`);
    }
    console.log(`  izolasyon: sink 127.0.0.1:${SINK_PORT} · provider=smtp (tanik OK) · send sayaci ${sendCount()}`);

    setupDone = true;
    const passwordHash = await bcrypt.hash(password, 10);
    st = await L.setupI3(prisma, bcrypt, runId, passwordHash); st.runId = runId;
    const bound = await L.AH.verifyApiBoundToSameDatabase(prisma, base, st.actors.elev1.email, password, st.slug);
    if (!bound.bound) { await prisma.tenant.delete({ where: { id: st.foreignTenantId } }).catch(() => {}); await prisma.tenant.delete({ where: { id: st.tenantId } }).catch(() => {}); st = null; throw new Error(`API disposable DB'ye bagli DEGIL: ${bound.reason}`); }
    const tokens = {};
    for (const a of ['elev1', 'elev2', 'elev3', 'reviewer', 'user']) { const r = await L.AH.login(base, st.actors[a].email, password, st.slug); if (!r.ok) throw new Error(`${a} login HTTP ${r.status ?? 'belirsiz'}`); tokens[a] = r.token; }
    const ctx = { base, prisma, tokens, st };
    const SENT = 'CLIENT_FINANCIAL_DISCLOSURE_SENT';
    const PUB = 'CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED';

    // ═══ G3-CAN + G6-SEP: onayli yayin ═══
    const v1 = await bringToPublishReady(ctx, 'can');
    if (v1.error) { R.unmeasured('G3-CAN', 'onayli yayin (CANARY)', v1.error); R.unmeasured('G6-SEP', 'SENT/PUBLISHED ayrimi', v1.error); R.unmeasured('G4-DED', 'dedupe', v1.error); }
    else {
      await setMode(''); // accept
      const sBefore = sendCount(); const aSentB = await auditCount(prisma, st.tenantId, SENT); const aPubB = await auditCount(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      const after = await snap(prisma, v1.vid); const sAfter = sendCount();
      const aSentA = await auditCount(prisma, st.tenantId, SENT); const aPubA = await auditCount(prisma, st.tenantId, PUB);
      if (rPub.indeterminate || after.error || aSentB.error || aPubB.error || aSentA.error || aPubA.error || sBefore === null || sAfter === null) {
        R.unmeasured('G3-CAN', 'onayli yayin (CANARY)', rPub.indeterminateReason || after.error || 'sayac/audit okunamadi'); R.unmeasured('G6-SEP', 'SENT/PUBLISHED ayrimi', 'G3 olculemedi');
      } else {
        const sentDelta = aSentA.value - aSentB.value; const pubDelta = aPubA.value - aPubB.value; const sendDelta = sAfter - sBefore;
        const published = after.v.status === 'PUBLISHED' && !!after.v.providerMessageId;
        R.check('G3-CAN', 'onayli yayin: PUBLISHED + providerMessageId + SENT=1/PUBLISHED=1 (runId) + duplicate=0 + gercek send=1',
          rPub.status < 400 && published && sentDelta === 1 && pubDelta === 1 && sendDelta === 1,
          `HTTP ${rPub.status} · durum=${after.v.status} · providerMessageId=${after.v.providerMessageId ? 'VAR' : 'yok'} · SENT +${sentDelta} · PUBLISHED +${pubDelta} · gercek send +${sendDelta} (duplicate=${(sentDelta>1||pubDelta>1)?'VAR(!)':'0'})`);
        R.check('G6-SEP', 'SENT ile PUBLISHED AYRI audit aksiyonu (biri digerinin yerine gecmez)',
          sentDelta === 1 && pubDelta === 1,
          `SENT +${sentDelta} · PUBLISHED +${pubDelta} — iki AYRI aksiyon`);

        // ═══ G4-DED: ayni surum ikinci yayin ═══
        await setMode('');
        const sB2 = sendCount(); const sentB2 = await auditCount(prisma, st.tenantId, SENT); const pubB2 = await auditCount(prisma, st.tenantId, PUB);
        const rDup = await L.AH.httpJson('POST', v1.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
        const sA2 = sendCount(); const sentA2 = await auditCount(prisma, st.tenantId, SENT); const pubA2 = await auditCount(prisma, st.tenantId, PUB);
        const after2 = await snap(prisma, v1.vid);
        if (rDup.indeterminate || sB2 === null || sA2 === null || sentB2.error || pubB2.error || after2.error) {
          R.unmeasured('G4-DED', 'dedupe/reclaim', rDup.indeterminateReason || 'sayac okunamadi');
        } else {
          const code = (rDup.body && (rDup.body.code || rDup.body.reasonCode || (rDup.body.message && (rDup.body.message.code||rDup.body.message.reasonCode)))) || '';
          const sendD2 = sA2 - sB2; const sentD2 = sentA2.value - sentB2.value; const pubD2 = pubA2.value - pubB2.value;
          // PUBLISHED surumde ikinci publish, beginSend'in durum kapisiyla (publication.service.js:54
          // assertExactStatus(CONTENT_APPROVED) → status PUBLISHED oldugu icin STATUS_INVALID; ya da
          // assertNotTerminal → VERSION_TERMINAL; dispatchAndPublish'e HIC ULASILMADIGI icin
          // ALREADY_PUBLISHED gozlenmeyebilir). Uc kod da "zaten sonlanmis/gecilmis durum" ailesidir.
          // DEDUPE/RECLAIM KABULU = SIFIR-DELTA INVARIANT: 4xx red · gercek send +0 · yeni audit +0 ·
          // durum PUBLISHED kalir (beklenen cagri/kayit sayilari AYRI yazildi).
          const stateGuard = /STATUS_INVALID|ALREADY_PUBLISHED|VERSION_TERMINAL/.test(String(code));
          R.check('G4-DED', 'ikinci yayin ILERLEMEZ: 4xx state-guard (gozlenen STATUS_INVALID) · gercek send BEKLENEN +0 (gozlenen) · yeni audit BEKLENEN +0/+0 (gozlenen) · durum PUBLISHED kalir',
            rDup.status >= 400 && rDup.status < 500 && stateGuard && sendD2 === 0 && sentD2 === 0 && pubD2 === 0 && after2.v.status === 'PUBLISHED',
            `HTTP ${rDup.status} · code=${code} · gercek send +${sendD2} (beklenen +0) · audit SENT +${sentD2}/PUBLISHED +${pubD2} (beklenen +0/+0) · durum=${after2.v.status}`);
        }
      }
    }

    // ═══ FD-RED: saglayici reddi (sink 550) ═══
    const v2 = await bringToPublishReady(ctx, 'red');
    if (v2.error) { R.unmeasured('FD-RED', 'saglayici reddi', v2.error); }
    else {
      await setMode('reject');
      const sB = sendCount(); const connB = connCount(); const pubB = await auditCount(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', v2.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      const after = await snap(prisma, v2.vid); const sA = sendCount(); const connA = connCount(); const pubA = await auditCount(prisma, st.tenantId, PUB);
      if (rPub.indeterminate || after.error || sB === null || sA === null || pubB.error || pubA.error) { R.unmeasured('FD-RED', 'saglayici reddi', rPub.indeterminateReason || after.error || 'sayac okunamadi'); }
      else {
        const sendD = sA - sB; const pubD = pubA.value - pubB.value;
        R.check('FD-RED', 'saglayici REDDI (550): yayin TAMAMLANMAZ · PUBLISHED degil · providerMessageId yok · gercek send=1 · PUBLISHED audit +0',
          after.v.status !== 'PUBLISHED' && !after.v.providerMessageId && sendD === 1 && pubD === 0,
          `HTTP ${rPub.status} · durum=${after.v.status} · providerMessageId=${after.v.providerMessageId?'VAR(!)':'yok'} · gercek send +${sendD} · SMTP conn +${connA-connB} · PUBLISHED audit +${pubD}`);
      }
    }

    // ═══ FD-TMO: timeout/ECONNRESET (sink reset) — ikinci cagri YOK ═══
    const v3 = await bringToPublishReady(ctx, 'tmo');
    if (v3.error) { R.unmeasured('FD-TMO', 'timeout/belirsiz', v3.error); }
    else {
      await setMode('reset');
      const sB = sendCount(); const connB = connCount(); const pubB = await auditCount(prisma, st.tenantId, PUB);
      const rPub = await L.AH.httpJson('POST', v3.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 30000 });
      const after = await snap(prisma, v3.vid); const sA = sendCount(); const connA = connCount(); const pubA = await auditCount(prisma, st.tenantId, PUB);
      // ikinci cagri yoklugu: gercek send DELTA tam 1 (kor tekrar olsa +2 olurdu)
      if (rPub.indeterminate || after.error || sB === null || sA === null || pubB.error || pubA.error) { R.unmeasured('FD-TMO', 'timeout/belirsiz', rPub.indeterminateReason || after.error || 'sayac okunamadi'); }
      else {
        const sendD = sA - sB; const pubD = pubA.value - pubB.value;
        R.check('FD-TMO', 'ECONNRESET/timeout: yayin TAMAMLANMAZ · PUBLISHED degil · gercek send=1 (IKINCI CAGRI YOK, kor tekrar +2 DEGIL) · PUBLISHED audit +0',
          after.v.status !== 'PUBLISHED' && !after.v.providerMessageId && sendD === 1 && pubD === 0,
          `HTTP ${rPub.status} · durum=${after.v.status} · gercek send +${sendD} (tek cagri=${sendD===1}) · SMTP conn +${connA-connB} · PUBLISHED audit +${pubD}`);
      }
    }
  } catch (e) {
    console.error(`\nKOSUM DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1;
  } finally {
    if (sinkProc && sinkProc.exitCode === null) sinkProc.kill();
    if (setupDone && st) {
      try {
        await prisma.user.updateMany({ where: { tenantId: st.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
        const active = (await prisma.user.findMany({ where: { tenantId: st.tenantId, isActive: true }, select: { id: true } })).length;
        R.check('I12-V', 'test hesaplarinin erisimi SONLANDIRILDI', active === 0, `aktif kalan=${active}`);
      } catch (e) { R.add('I12-V', 'erisim sonlandirma', L.VERDICT.FAIL, `HATA: ${e && e.message}`); }
    }
    const s = R.summary('İ12 ACIK OLCUM KOLLARI');
    console.log(JSON.stringify({ record: 'I12-GAPS', runId, tenant: st ? st.slug : null, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, total: s.total, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict })) }, null, 1));
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
