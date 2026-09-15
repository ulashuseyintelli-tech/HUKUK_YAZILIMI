/*
 * İ12 — G7 CRON TESLİM + KAPSAM İZOLASYONU PROVASI (R04 · güçlendirilmiş)
 * İzole DB'de İKİ tenant da TAM teslim-uygun kurulur (dönem aktivitesi + alıcı + şablon + Office SMTP):
 *   - hedef tenant (T)  → alıcı deliv-target-<runId>@ah-harness.invalid
 *   - yabancı tenant (F) → alıcı deliv-foreign-<runId>@ah-harness.invalid  (F de teslim almaya UYGUN)
 * Tetik: HEDEF-TENANT-SCOPED  runMonthlyDelivery(now, { tenantId: T })  — hook 'direct <T>' yolu.
 *   BOŞ-SCOPE (tüm tenant) KULLANILMAZ (owner kuralı: canlı kabulde all-tenant tetik yok).
 * Ölçüm (KESİN sayı, hedef-dışı etki = FAIL):
 *   1. tetik → T: sink=1 · ledger SENT=1 · bildirim SENT=1 ; F: sink=0 · ledger=0 · bildirim=0 ;
 *      TOPLAM sink deltası = 1 (yalnız T; herhangi hedef-dışı mesaj → FAIL).
 *   2. tetik (aynı dönem, tamamlanmış) → her yerde +0 (dedupe: ledger SENT→SKIP, bildirim dedupeKey).
 * Statement dispatch SMTP'yi ENV'den DEĞİL Office DB satırından (getFullSmtpSettings) okur → her iki
 * tenant için Office SMTP satırı sink'e yönlendirilir. Canlı DB/gönderim/deploy/scheduler YOK; sink loopback.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const { spawn, execSync } = require('child_process');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const PORT = Number(process.env.I12_CRON_PORT || 8100);
const WORK = process.env.I12_WORK_DIR || process.cwd();
const STATE = path.join(WORK, 'i12-cron-state.json'); const TRIGGER = path.join(WORK, 'i12-cron-trigger.txt'); const RESULT = path.join(WORK, 'i12-cron-result.json');
const HOOK = path.join(__dirname, 'i12-cron-hook.js'); const DIST_MAIN = process.env.I3_DIST_MAIN;
const SMTP_PORT = Number(process.env.I3_SMTP_PORT || 2529); const CAPTURE = path.join(WORK, 'i12-cron-capture');
function listenersOn(p) { try { const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${p}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^\d+$/.test(x)))]; } catch (e) { return []; } }
function stopPort(p) { for (const pid of listenersOn(p)) { try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch (e) {} } }
function startSink() { return new Promise((res, rej) => { const c = spawn(process.execPath, [path.join(I3, 'i3-sink.js')], { env: { ...process.env, I3_SMTP_PORT: String(SMTP_PORT), I3_SMTP_CAPTURE: CAPTURE }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; const t = setTimeout(() => rej(new Error('sink')), 5000); c.stdout.on('data', (d) => { o += d; if (o.includes('I3-SMTP-SINK-READY')) { clearTimeout(t); res(c); } }); c.on('error', (e) => { clearTimeout(t); rej(e); }); }); }
// Sink GLOBAL bir yakalama dizinidir. Toplam mesaj + alıcıya göre (recipient substring) ayrı sayılır.
const sinkTotal = () => { try { return fs.readdirSync(CAPTURE).filter((f) => f.startsWith('msg-')).length; } catch (e) { return 0; } };
const sinkTo = (needle) => { try { let n = 0; for (const f of fs.readdirSync(CAPTURE)) { if (!f.startsWith('msg-')) continue; let c = ''; try { c = fs.readFileSync(path.join(CAPTURE, f), 'utf8'); } catch (e) { continue; } if (new RegExp('^To:[^\\n]*' + needle, 'm').test(c)) n += 1; } return n; } catch (e) { return 0; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
async function waitFor(fn, ms, step = 400) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, step)); } return null; }

// Bir tenant'ı TAM teslim-uygun kılar: alıcı e-posta + caseClient ALACAKLI + önceki-ay POSTED
// disposition (CLIENT_PAYABLE) + STATEMENT_READY şablonu + Office SMTP → sink.
async function makeDeliverable(prisma, o) {
  const { tenantId, clientId, caseId, caseClientId, requesterUserId, approverUserId, email, prevMonth, runId, tag } = o;
  await prisma.client.update({ where: { id: clientId }, data: { email } });
  await prisma.caseClient.update({ where: { id: caseClientId }, data: { role: 'ALACAKLI' } });
  const col = await prisma.collection.create({ data: { tenantId, caseId, amount: '100.00', type: 'TAHSILAT', date: prevMonth, idempotencyKey: `i12d-col-${tag}-${runId}`, status: 'CONFIRMED' }, select: { id: true } });
  const appr = await prisma.officeApprovalRequest.create({ data: { tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'x', requesterUserId, approverUserId, status: 'APPROVED', decidedAt: prevMonth, savedIntent: {}, payloadHash: `i12d-${tag}-${runId}` }, select: { id: true } });
  await prisma.collectionDisposition.create({ data: { tenantId, caseId, collectionId: col.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId, status: 'POSTED', postedAt: prevMonth, totalAmount: '100.00', currency: 'TRY', approvalRequestId: appr.id, approvedById: approverUserId, lines: { create: [{ type: 'CLIENT_PAYABLE', amount: '100.00', caseClientId }] } }, select: { id: true } });
  await prisma.messageTemplate.create({ data: { tenantId, code: 'STATEMENT_READY', name: 'Ekstre Hazir', category: 'STATEMENT_READY', channel: 'EMAIL', subject: 'Aylik ekstreniz hazir', body: 'Sayin muvekkil, aylik ekstreniz hazir.', isActive: true } });
  const officeSmtp = { name: `İ12 İzole Büro ${tag}`, smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpUser: `i12d-${tag}@ah.invalid`, smtpPass: 'x', smtpSecure: false, smtpFromName: 'İ12 Harness', smtpFromEmail: 'noreply@ah-harness.invalid' };
  await prisma.office.upsert({ where: { tenantId }, update: officeSmtp, create: { tenantId, ...officeSmtp } });
}

// Hook 'direct <tenantId>' → runMonthlyDelivery(now,{tenantId}) TAMAMLANANA kadar (I12-CRON-DIRECT) bekler.
async function scopedTrigger(tenantId) {
  try { fs.unlinkSync(RESULT); } catch (e) {}
  fs.writeFileSync(TRIGGER, `direct ${tenantId}`, 'utf8');
  const r = await waitFor(async () => { const j = readJson(RESULT); return j && j.record === 'I12-CRON-DIRECT' ? j : null; }, 25000, 400);
  await new Promise((res) => setTimeout(res, 1200)); // sink dosya yazımı + ledger commit için pay
  return r;
}

(async () => {
  const envInfo = L.AH.assertDisposableEnvironment();
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  const password = `I12d!${require('crypto').randomBytes(16).toString('base64url')}`;
  const TGT = `deliv-target-${runId}`; const FRN = `deliv-foreign-${runId}`;
  console.log(`İ12 G7 CRON TESLİM + KAPSAM — runId=${runId} · db=${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName} · port=${PORT}`);
  if (!DIST_MAIN) throw new Error('I3_DIST_MAIN gerekli');
  fs.mkdirSync(CAPTURE, { recursive: true });
  // Sink msg/conn dosyaları süreç başına msg-0001'den numaralanır; PAYLAŞILAN dizinde önceki koşumu
  // EZER → toplam-sink deltası yanıltıcı olur. Taze sayım için koşum başında capture TEMİZLENİR.
  try { for (const f of fs.readdirSync(CAPTURE)) { if (/^(msg-|conn-)/.test(f)) fs.unlinkSync(path.join(CAPTURE, f)); } } catch (e) {}
  try { fs.unlinkSync(STATE); } catch (e) {} try { fs.unlinkSync(RESULT); } catch (e) {} fs.writeFileSync(TRIGGER, '', 'utf8');
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH); const R = new L.Results();
  const pwHash = await bcrypt.hash(password, 10);
  let apiChild = null; let sinkProc = null; let st = null;
  try {
    st = await L.setupI3(prisma, bcrypt, runId, pwHash); st.runId = runId;
    const now = new Date(); const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 10, 0, 0));

    // HEDEF tenant (setupI3'ten hazır case/caseClient/actors)
    await makeDeliverable(prisma, { tenantId: st.tenantId, clientId: st.clientId, caseId: st.caseId, caseClientId: st.caseClientId, requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, email: `${TGT}@ah-harness.invalid`, prevMonth, runId, tag: 'target' });

    // YABANCI tenant — TAM teslim-uygun (aktivite + alıcı + şablon + Office SMTP). setupI3 yalnız
    // foreignClient üretti; case/caseClient/onay kullanıcıları burada eklenir → F de teslim ALIR olurdu.
    const fUser1 = await prisma.user.create({ data: { tenantId: st.foreignTenantId, email: `frn1-${runId}@ah-harness.invalid`, name: 'FRN1', surname: 'I3', passwordHash: pwHash, role: 'USER' }, select: { id: true } });
    const fUser2 = await prisma.user.create({ data: { tenantId: st.foreignTenantId, email: `frn2-${runId}@ah-harness.invalid`, name: 'FRN2', surname: 'I3', passwordHash: pwHash, role: 'USER' }, select: { id: true } });
    const fCase = await prisma.case.create({ data: { tenantId: st.foreignTenantId, fileNumber: `I3F-${runId}`, type: 'GENERAL_EXECUTION' }, select: { id: true } });
    const fCaseClient = await prisma.caseClient.create({ data: { caseId: fCase.id, clientId: st.foreignClientId }, select: { id: true } });
    await makeDeliverable(prisma, { tenantId: st.foreignTenantId, clientId: st.foreignClientId, caseId: fCase.id, caseClientId: fCaseClient.id, requesterUserId: fUser1.id, approverUserId: fUser2.id, email: `${FRN}@ah-harness.invalid`, prevMonth, runId, tag: 'foreign' });
    console.log(`      fixture: HEDEF=${st.slug} (${TGT}) + YABANCI=${st.foreignSlug} (${FRN}) — İKİSİ de TAM teslim-uygun; postedAt=${prevMonth.toISOString().slice(0, 10)}`);

    sinkProc = await startSink(); stopPort(PORT);
    const redisUrl = process.env.I12_REDIS_URL || 'redis://127.0.0.1:6390';
    const env = { ...process.env, DATABASE_URL: L.AH.requireEnv('AH_DATABASE_URL'), REDIS_URL: redisUrl, REDIS_KEY_PREFIX: `i12d:${runId}:`, PORT: String(PORT), NODE_ENV: 'development', JWT_SECRET: require('crypto').randomBytes(32).toString('hex'), CORS_ORIGIN: 'http://127.0.0.1:3999', EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_USER: 'i12d@ah.invalid', SMTP_PASS: 'x', EMAIL_FROM: 'noreply@ah-harness.invalid', CLIENT_STATEMENT_MONTHLY_DELIVERY: 'true', I12_CRON_STATE: STATE, I12_CRON_TRIGGER: TRIGGER, I12_CRON_RESULT: RESULT, I3_DIST_ROOT: process.env.I3_DIST_ROOT };
    const out = fs.openSync(path.join(WORK, 'api.out.log'), 'a'); const err = fs.openSync(path.join(WORK, 'api.err.log'), 'a');
    apiChild = spawn(process.execPath, ['--require', HOOK, DIST_MAIN], { cwd: WORK, env, detached: true, stdio: ['ignore', out, err] }); apiChild.unref();
    if (!await waitFor(async () => (listenersOn(PORT).length ? true : null), 45000, 1000)) throw new Error('API dinlemedi');
    await waitFor(async () => readJson(STATE), 15000);

    const cnt = async (fn) => (await L.safeCount(fn)).value;
    const tLed = () => cnt(() => prisma.clientStatementDeliveryLedger.count({ where: { tenantId: st.tenantId, status: 'SENT' } }));
    const tNot = () => cnt(() => prisma.clientNotification.count({ where: { tenantId: st.tenantId, status: 'SENT' } }));
    const fLedAll = () => cnt(() => prisma.clientStatementDeliveryLedger.count({ where: { tenantId: st.foreignTenantId } }));
    const fNotAll = () => cnt(() => prisma.clientNotification.count({ where: { tenantId: st.foreignTenantId } }));

    const base = { tot: sinkTotal(), t: sinkTo(TGT), f: sinkTo(FRN), tLed: await tLed(), tNot: await tNot(), fLed: await fLedAll(), fNot: await fNotAll() };

    // 1. TETİK — HEDEF-SCOPED
    const r1 = await scopedTrigger(st.tenantId);
    const a1 = { tot: sinkTotal(), t: sinkTo(TGT), f: sinkTo(FRN), tLed: await tLed(), tNot: await tNot(), fLed: await fLedAll(), fNot: await fNotAll() };
    const d1 = { tot: a1.tot - base.tot, t: a1.t - base.t, f: a1.f - base.f, tLed: a1.tLed - base.tLed, tNot: a1.tNot - base.tNot, fLed: a1.fLed - base.fLed, fNot: a1.fNot - base.fNot };

    if (!r1) { R.unmeasured('G7-DELIV-SCOPE', 'scoped teslim', 'direct tetik tamamlanmadı'); }
    else {
      // KESİN: hedef sink 1 · ledger SENT 1 · bildirim SENT 1 ; yabancı 0/0/0 ; TOPLAM sink deltası 1 (hedef-dışı=FAIL)
      R.check('G7-DELIV-SCOPE', 'HEDEF-tenant-scoped runMonthlyDelivery: hedefe GERÇEK gönderim + ledger SENT(markSent) + bildirim SENT (KESİN 1); TAM teslim-uygun YABANCI tenant 0/0/0; TOPLAM sink deltası=hedef (hedef-dışı etki YOK)',
        d1.t === 1 && d1.tLed === 1 && d1.tNot === 1 && d1.f === 0 && d1.fLed === 0 && d1.fNot === 0 && d1.tot === 1,
        `HEDEF: sink+${d1.t} ledgerSENT+${d1.tLed} bildirimSENT+${d1.tNot} · YABANCI(tam-uygun): sink+${d1.f} ledger+${d1.fLed} bildirim+${d1.fNot} · TOPLAM sink+${d1.tot} (hedef=${d1.t}; fazlası hedef-dışı=FAIL) · delivered=${(r1.result||{}).delivered}`);
    }

    // 2. TETİK — aynı dönem, HEDEF-scoped, TAMAMLANMIŞ → her yerde +0
    const r2 = await scopedTrigger(st.tenantId);
    const a2 = { tot: sinkTotal(), t: sinkTo(TGT), f: sinkTo(FRN), tLed: await tLed(), tNot: await tNot(), fLed: await fLedAll(), fNot: await fNotAll() };
    const d2 = { tot: a2.tot - a1.tot, t: a2.t - a1.t, f: a2.f - a1.f, tLed: a2.tLed - a1.tLed, tNot: a2.tNot - a1.tNot, fLed: a2.fLed - a1.fLed, fNot: a2.fNot - a1.fNot };
    if (!r2) { R.unmeasured('G7-DEDUPE', 'ikinci scoped tetik', 'direct tetik tamamlanmadı'); }
    else {
      R.check('G7-DEDUPE', 'aynı dönem İKİNCİ (tamamlanmış) HEDEF-scoped tetik: EK gönderim 0 + mükerrer kayıt 0 (ledger SENT→SKIP already-sent, bildirim dedupeKey); yabancı yine 0',
        d2.t === 0 && d2.tLed === 0 && d2.tNot === 0 && d2.f === 0 && d2.fLed === 0 && d2.fNot === 0 && d2.tot === 0,
        `2. tetik deltalar → HEDEF: sink+${d2.t} ledgerSENT+${d2.tLed} bildirimSENT+${d2.tNot} · YABANCI: sink+${d2.f} ledger+${d2.fLed} · TOPLAM sink+${d2.tot} · delivered=${(r2.result||{}).delivered}`);
    }
  } catch (e) { console.error(`\nDURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally {
    if (apiChild) stopPort(PORT);
    if (sinkProc && sinkProc.exitCode === null) sinkProc.kill();
    if (st) { try { await prisma.user.updateMany({ where: { tenantId: st.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); } catch (e) {} try { await prisma.user.updateMany({ where: { tenantId: st.foreignTenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); } catch (e) {} }
    const s = R.summary('İ12 G7 CRON TESLİM + KAPSAM');
    console.log(JSON.stringify({ record: 'I12-CRON-DELIVERY', runId, tenant: st ? st.slug : null, foreign: st ? st.foreignSlug : null, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })) }, null, 1));
    const EVID = process.env.I12_EVID_FILE; if (EVID) { try { fs.writeFileSync(EVID, JSON.stringify({ record: 'I12-CRON-DELIVERY', runId, results: R.rows }, null, 1), 'utf8'); } catch (e) {} }
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
