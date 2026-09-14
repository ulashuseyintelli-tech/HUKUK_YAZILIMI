/*
 * İ12 — G5 izinli-alıcı (allowlist DIŞI sağlayıcı) · gönderim ENGELLENİR
 * MOCK-provider instance'a karşı: onaylı sağlayıcı DIŞI (mock) → yayin `assertProductionProvider`
 * ile REDDEDİLİR (403 PROVIDER_NOT_PRODUCTION); sağlayıcıya TEK BYTE gitmez (gerçek send=0).
 * Onay zinciri (POSTED→DRAFT→ofis→içerik) provider'dan bağımsız çalışır; kapı publish'te.
 * KULLANIM: MOCK API config'i I3_API_CONFIG ile; AH_DATABASE_URL/AH_API_BASE_URL/prisma/bcrypt env.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const CONFIG_FILE = process.env.I3_API_CONFIG;
const API_CFG = CONFIG_FILE ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null;
const SPY_FILE = API_CFG ? API_CFG.spyCounterFile : null;
function sendCount() { try { return JSON.parse(fs.readFileSync(SPY_FILE, 'utf8')).dispatcherSend; } catch (e) { return null; } }

async function bringToPublishReady(ctx, tag) {
  const { base, prisma, tokens, st } = ctx; const rid = `${st.runId}-${tag}`; const H = L.AH.httpJson;
  let chain;
  try {
    chain = await prisma.$transaction(async (tx) => {
      const collection = await tx.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: new Date(), idempotencyKey: `i12-col-${rid}`, status: 'CONFIRMED' }, select: { id: true } });
      const expense = await tx.expenseRequest.create({ data: { tenantId: st.tenantId, caseId: st.caseId, clientId: st.clientId, totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: st.actors.elev1.id }, select: { id: true } });
      const approval = await tx.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `i12-${rid}` }, select: { id: true } });
      const disposition = await tx.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: collection.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'DISTRIBUTION_APPROVED', totalAmount: '100.00', currency: 'TRY', approvalRequestId: approval.id, approvedById: st.actors.elev2.id, lines: { create: [ { type: 'CLIENT_PAYABLE', amount: '60.00', caseClientId: st.caseClientId }, { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '40.00', expenseRequestId: expense.id, caseClientId: st.caseClientId } ] } }, select: { id: true } });
      return { dispositionId: disposition.id };
    }, { timeout: 30000, maxWait: 10000 });
  } catch (e) { return { error: `zincir: ${e && e.message ? e.message.slice(0, 140) : e}` }; }
  const rPost = await H('POST', `${base}/collection-dispositions/${chain.dispositionId}/post`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  if (rPost.indeterminate || rPost.status >= 400) return { error: `post HTTP ${rPost.status ?? 'belirsiz'}` };
  const rCreate = await H('POST', `${base}/collection-dispositions/${chain.dispositionId}/financial-disclosure`, { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  const cd = (rCreate.body && (rCreate.body.data || rCreate.body)) || {}; const vid = cd.disclosureVersionId || null;
  if (!vid) return { error: `surum HTTP ${rCreate.status ?? 'belirsiz'}` };
  const url = (s) => `${base}/client-financial-disclosures/${vid}/${s}`;
  const aid = async (f) => { try { const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: vid }, select: { [f]: true } }); return v[f] || null; } catch (e) { return null; } };
  const rReqO = await H('POST', url('request-office-approval'), { token: tokens.elev1, body: {} });
  if (rReqO.indeterminate || rReqO.status >= 400) return { error: `ofis talep HTTP ${rReqO.status ?? 'belirsiz'}` };
  const rO = await H('POST', url('complete-office-approval'), { token: tokens.elev2, body: { approvalRequestId: await aid('officeApprovalRequestId') } });
  if (rO.indeterminate || rO.status >= 400) return { error: `ofis onay HTTP ${rO.status ?? 'belirsiz'}` };
  const rReqC = await H('POST', url('request-content-approval'), { token: tokens.elev1, body: { approvedRecipientEmail: `client-${st.runId}@ah-harness.invalid` } });
  if (rReqC.indeterminate || rReqC.status >= 400) return { error: `icerik talep HTTP ${rReqC.status ?? 'belirsiz'}` };
  const rC = await H('POST', url('complete-content-approval'), { token: tokens.elev3, body: { approvalRequestId: await aid('contentApprovalRequestId') } });
  if (rC.indeterminate || rC.status >= 400) return { error: `icerik onay HTTP ${rC.status ?? 'belirsiz'}` };
  return { vid, url };
}

(async () => {
  const envInfo = L.AH.assertDisposableEnvironment();
  const base = L.AH.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  const password = `I12!${require('crypto').randomBytes(18).toString('base64url')}7q`; process.env.AH_LOGIN_PASSWORD = password;
  const rb = L.readRuntimeWitness(API_CFG);
  console.log(`İ12 G5 allowlist — runId=${runId} · API=${base} · tanik provider=${rb.provider}`);
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const R = new L.Results(); let st = null; let setupDone = false;
  try {
    // ETKIN provider mock (allowlist DISI) olmali — tanik dogrular
    if (!rb.readable || rb.provider !== 'mock') throw new Error(`bu kol MOCK instance ister (tanik provider=${rb.provider}); allowlist-DISI dali icin --provider mock`);
    setupDone = true;
    const passwordHash = await bcrypt.hash(password, 10);
    st = await L.setupI3(prisma, bcrypt, runId, passwordHash); st.runId = runId;
    const bound = await L.AH.verifyApiBoundToSameDatabase(prisma, base, st.actors.elev1.email, password, st.slug);
    if (!bound.bound) { await prisma.tenant.delete({ where: { id: st.foreignTenantId } }).catch(() => {}); await prisma.tenant.delete({ where: { id: st.tenantId } }).catch(() => {}); st = null; throw new Error(`API disposable DB'ye bagli DEGIL: ${bound.reason}`); }
    const tokens = {};
    for (const a of ['elev1', 'elev2', 'elev3']) { const r = await L.AH.login(base, st.actors[a].email, password, st.slug); if (!r.ok) throw new Error(`${a} login HTTP ${r.status ?? 'belirsiz'}`); tokens[a] = r.token; }
    const v = await bringToPublishReady({ base, prisma, tokens, st }, 'allow');
    if (v.error) { R.unmeasured('G5-ALW', 'allowlist DISI reddi', v.error); }
    else {
      const sB = sendCount();
      const rPub = await L.AH.httpJson('POST', v.url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      const after = await prisma.clientFinancialDisclosureVersion.findUnique({ where: { id: v.vid }, select: { status: true, providerMessageId: true } }).catch(() => null);
      const sA = sendCount();
      const code = (rPub.body && (rPub.body.code || rPub.body.reasonCode || (rPub.body.message && (rPub.body.message.code||rPub.body.message.reasonCode)))) || '';
      if (rPub.indeterminate || !after || sB === null || sA === null) { R.unmeasured('G5-ALW', 'allowlist DISI reddi', rPub.indeterminateReason || 'sayac/durum okunamadi'); }
      else {
        const sendD = sA - sB; const notPub = after.status !== 'PUBLISHED'; const noPmid = !after.providerMessageId;
        R.check('G5-ALW', 'allowlist DISI (mock): 403 PROVIDER_NOT_PRODUCTION · yayin TAMAMLANMAZ · providerMessageId yok · gercek send=0 (tek byte gitmez)',
          rPub.status === 403 && String(code).includes('PROVIDER_NOT_PRODUCTION') && notPub && noPmid && sendD === 0,
          `HTTP ${rPub.status} · code=${code} · durum=${after.status} (PUBLISHED degil=${notPub}) · providerMessageId=${after.providerMessageId?'VAR(!)':'yok'} · gercek send +${sendD} (beklenen +0)`);
      }
    }
  } catch (e) { console.error(`\nKOSUM DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally {
    if (setupDone && st) { try { await prisma.user.updateMany({ where: { tenantId: st.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); const active = (await prisma.user.findMany({ where: { tenantId: st.tenantId, isActive: true }, select: { id: true } })).length; R.check('I12-V5', 'erisim sonlandirildi', active === 0, `aktif kalan=${active}`); } catch (e) { R.add('I12-V5', 'erisim sonlandirma', L.VERDICT.FAIL, `${e && e.message}`); } }
    const s = R.summary('İ12 G5 ALLOWLIST');
    console.log(JSON.stringify({ record: 'I12-ALLOWLIST', runId, tenant: st ? st.slug : null, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict })) }, null, 1));
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
