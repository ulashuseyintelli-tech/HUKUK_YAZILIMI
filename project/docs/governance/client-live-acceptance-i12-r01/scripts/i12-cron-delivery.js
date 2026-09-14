/*
 * İ12 — G7 CRON TESLİM PROVASI · gerçek gönderim + teslim defteri (markSent) + aynı-dönem repeat-zero
 * İzole DB'de DOĞRU döneme (onceki ay) ait sentetik aktivite (POSTED CollectionDisposition + CLIENT_PAYABLE)
 * → statement line uretilir → aylik teslim GERCEKTEN gonderir. Kisa-takvim OTONOM tetik (2s cron):
 *   - ilk tetik: gercek SMTP gonderim (sink msg) + teslim defteri SENT (markSent) + bildirim
 *   - ayni donemde sonraki (otonom) tetikler: EK gonderim 0, mukerrer kayit 0 (ledger dedupe)
 * Cron kapsami: yabanci tenant (aktivitesiz) SKIPPED → yalniz hedef client teslim (scope prova).
 * Login/HTTP gerekmez (cron in-process; dosya-sinyali). Canli DB/gonderim/deploy YOK; sink loopback.
 */
'use strict';
const fs = require('fs'); const net = require('net'); const path = require('path'); const { spawn, execSync } = require('child_process');
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
// Sink GLOBAL bir yakalama dizinidir; ayni disposable DB'de birikmis DIGER (onceki kosum) tenant'lar
// da bos-scope taramada teslim alabilir. Bu kosumun GONDERIM sayimini YALNIZ bu run'in alicisina
// (client-<runId>@...) kapsamla — mukerrer-gonderim iddiasi ancak bu alicidaki >1 mesajla dogar.
const sinkMsgs = () => { try { return fs.readdirSync(CAPTURE).filter((f) => f.startsWith('msg-')).length; } catch (e) { return 0; } };
const sinkMsgsForRun = (rid) => { try { let n = 0; for (const f of fs.readdirSync(CAPTURE)) { if (!f.startsWith('msg-')) continue; let c = ''; try { c = fs.readFileSync(path.join(CAPTURE, f), 'utf8'); } catch (e) { continue; } if (/^To:.*client-/m.test(c) && c.includes(rid)) n += 1; } return n; } catch (e) { return 0; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
async function waitFor(fn, ms, step = 500) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, step)); } return null; }

(async () => {
  const envInfo = L.AH.assertDisposableEnvironment();
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  const password = `I12d!${require('crypto').randomBytes(16).toString('base64url')}`;
  console.log(`İ12 G7 CRON TESLİM — runId=${runId} · db=${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName} · port=${PORT}`);
  if (!DIST_MAIN) throw new Error('I3_DIST_MAIN gerekli');
  fs.mkdirSync(CAPTURE, { recursive: true }); try { fs.unlinkSync(STATE); } catch (e) {} try { fs.unlinkSync(RESULT); } catch (e) {} fs.writeFileSync(TRIGGER, '', 'utf8');
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH); const R = new L.Results();
  let apiChild = null; let sinkProc = null; let st = null;
  try {
    st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(password, 10)); st.runId = runId;
    // caseClient rolu ELIGIBLE (ALACAKLI) yapilir; client'a EMAIL zaten var (setupI3 email .invalid)
    await prisma.caseClient.update({ where: { id: st.caseClientId }, data: { role: 'ALACAKLI' } });
    // DOGRU DONEM (onceki ay) POSTED disposition + CLIENT_PAYABLE → statement line
    const now = new Date(); const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 10, 0, 0));
    const col = await prisma.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: prevMonth, idempotencyKey: `i12d-col-${runId}`, status: 'CONFIRMED' }, select: { id: true } });
    const appr = await prisma.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'x', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: prevMonth, savedIntent: {}, payloadHash: `i12d-${runId}` }, select: { id: true } });
    await prisma.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: col.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'POSTED', postedAt: prevMonth, totalAmount: '100.00', currency: 'TRY', approvalRequestId: appr.id, approvedById: st.actors.elev2.id, lines: { create: [{ type: 'CLIENT_PAYABLE', amount: '100.00', caseClientId: st.caseClientId }] } }, select: { id: true } });
    // Aylik teslim STATEMENT_READY MessageTemplate ister (per-tenant, isActive) — disposable DB'de seed
    await prisma.messageTemplate.create({ data: { tenantId: st.tenantId, code: 'STATEMENT_READY', name: 'Ekstre Hazir', category: 'STATEMENT_READY', channel: 'EMAIL', subject: 'Aylik ekstreniz hazir', body: 'Sayin muvekkil, aylik ekstreniz hazir.', isActive: true } });
    // GONDERIM SMTP AYARI: statement dispatch (client-notification.sendEmail) SMTP'yi ENV'den DEGIL,
    // Office satirindan (getFullSmtpSettings) okur. Izole tenant icin sink'e (127.0.0.1:SMTP_PORT) yonlendir.
    // smtpPass duz-metin: decryptCredential prefix 'enc:v1:' yoksa aynen doner (legacy geriye-uyum) — sifre gerektirmeyen sink kabul eder.
    const officeSmtp = { name: 'İ12 İzole Büro', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpUser: 'i12d@ah.invalid', smtpPass: 'x', smtpSecure: false, smtpFromName: 'İ12 Harness', smtpFromEmail: 'noreply@ah-harness.invalid' };
    await prisma.office.upsert({ where: { tenantId: st.tenantId }, update: officeSmtp, create: { tenantId: st.tenantId, ...officeSmtp } });
    console.log(`      fixture: tenant=${st.slug} client=${st.clientId.slice(-8)} POSTED disposition postedAt=${prevMonth.toISOString().slice(0, 10)} + STATEMENT_READY sablonu (yabanci tenant ${st.foreignSlug} aktivitesiz)`);

    sinkProc = await startSink(); stopPort(PORT);
    // IZOLASYON: API'yi CANLI Redis (6379) DEGIL, izole 6390'a bagla + run'a ozel key prefix.
    const redisUrl = process.env.I12_REDIS_URL || 'redis://127.0.0.1:6390';
    const env = { ...process.env, DATABASE_URL: L.AH.requireEnv('AH_DATABASE_URL'), REDIS_URL: redisUrl, REDIS_KEY_PREFIX: `i12d:${runId}:`, PORT: String(PORT), NODE_ENV: 'development', JWT_SECRET: require('crypto').randomBytes(32).toString('hex'), CORS_ORIGIN: 'http://127.0.0.1:3999', EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_USER: 'i12d@ah.invalid', SMTP_PASS: 'x', EMAIL_FROM: 'noreply@ah-harness.invalid', CLIENT_STATEMENT_MONTHLY_DELIVERY: 'true', I12_CRON_STATE: STATE, I12_CRON_TRIGGER: TRIGGER, I12_CRON_RESULT: RESULT, I3_DIST_ROOT: process.env.I3_DIST_ROOT };
    const out = fs.openSync(path.join(WORK, 'api.out.log'), 'a'); const err = fs.openSync(path.join(WORK, 'api.err.log'), 'a');
    apiChild = spawn(process.execPath, ['--require', HOOK, DIST_MAIN], { cwd: WORK, env, detached: true, stdio: ['ignore', out, err] }); apiChild.unref();
    if (!await waitFor(async () => (listenersOn(PORT).length ? true : null), 45000, 1000)) throw new Error('API dinlemedi');
    await waitFor(async () => readJson(STATE), 15000);

    const ledgerSent = async () => (await L.safeCount(() => prisma.clientStatementDeliveryLedger.count({ where: { tenantId: st.tenantId, status: 'SENT' } }))).value;
    const notifSent = async () => (await L.safeCount(() => prisma.clientNotification.count({ where: { tenantId: st.tenantId, status: 'SENT' } }))).value;
    const foreignLedger = async () => (await L.safeCount(() => prisma.clientStatementDeliveryLedger.count({ where: { tenantId: st.foreignTenantId } }))).value;

    const msg0 = sinkMsgsForRun(runId); const led0 = await ledgerSent(); const nt0 = await notifSent();
    // KISA TAKVIM OTONOM tetik (2s cron, ~4-5 otonom fire / 9 sn) — ayni donem tekrar dahil
    fs.writeFileSync(TRIGGER, 'shortcron', 'utf8');
    const sc = await waitFor(async () => { const r = readJson(RESULT); return r && r.record === 'I12-CRON-SHORT' && r.autonomousFires >= 2 ? r : null; }, 22000, 700);
    await new Promise((r) => setTimeout(r, 1500));
    const msg1 = sinkMsgsForRun(runId); const led1 = await ledgerSent(); const nt1 = await notifSent(); const fL = await foreignLedger();

    if (!sc) { R.unmeasured('G7-DELIV', 'cron teslim', 'otonom tetik >=2 gozlenmedi'); }
    else {
      const fires = sc.autonomousFires; const sendD = msg1 - msg0; const ledD = led1 - led0; const ntD = nt1 - nt0;
      // ILK tetik teslim + AYNI donem sonraki OTONOM tetiklerde EK gonderim/mukerrer kayit 0:
      // fires>=2 iken send/ledger delta TAM 1 olmali (dedupe), scope: yabanci tenant ledger 0.
      R.check('G7-DELIV', 'kisa-takvim OTONOM tetik: ilk tetikte GERCEK gonderim + teslim defteri SENT (markSent) + bildirim; ayni donem sonraki otonom tetiklerde EK gonderim 0 / mukerrer kayit 0; scope: yalniz hedef tenant',
        fires >= 2 && sendD === 1 && ledD === 1 && ntD >= 1 && fL === 0,
        `otonom tetik=${fires} · SMTP gonderim(sink msg) +${sendD} (ilk tetik 1, sonraki otonom tetikler +0) · teslim defteri SENT +${ledD} · bildirim SENT +${ntD} · YABANCI tenant ledger=${fL} (scope: 0) · son kosum delivered=${(sc.lastResult||{}).delivered}`);
    }
  } catch (e) { console.error(`\nDURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally {
    if (apiChild) stopPort(PORT);
    if (sinkProc && sinkProc.exitCode === null) sinkProc.kill();
    if (st) { try { await prisma.user.updateMany({ where: { tenantId: st.tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); } catch (e) {} }
    const s = R.summary('İ12 G7 CRON TESLİM');
    console.log(JSON.stringify({ record: 'I12-CRON-DELIVERY', runId, tenant: st ? st.slug : null, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })) }, null, 1));
    const EVID = process.env.I12_EVID_FILE; if (EVID) { try { fs.writeFileSync(EVID, JSON.stringify({ record: 'I12-CRON-DELIVERY', runId, results: R.rows }, null, 1), 'utf8'); } catch (e) {} }
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
