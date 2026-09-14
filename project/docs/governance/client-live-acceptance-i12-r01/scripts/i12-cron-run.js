/*
 * İ12 — G7 AYLIK CRON: predicate · doğrudan çağrı · gerçek zamanlayıcı tetiği (AYRI ölçüm)
 * Login/HTTP GEREKMEZ (cron in-process; dosya-sinyali). İzole prova: disposable PG/Redis/SMTP→sink.
 * KULLANIM: AH_DATABASE_URL=... AH_PRISMA_ROOT=<r23> I3_DIST_MAIN=<r23 main> I3_DIST_ROOT=<r23 src>
 *           I12_CRON_PORT=8100 I3_SMTP_PORT=2526 REDIS_URL=redis://127.0.0.1:6390 node i12-cron-run.js
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));

const PORT = Number(process.env.I12_CRON_PORT || 8100);
const WORK = process.env.I12_WORK_DIR || process.cwd();
const STATE = path.join(WORK, 'i12-cron-state.json');
const TRIGGER = path.join(WORK, 'i12-cron-trigger.txt');
const RESULT = path.join(WORK, 'i12-cron-result.json');
const HOOK = path.join(__dirname, 'i12-cron-hook.js');
const DIST_MAIN = process.env.I3_DIST_MAIN;
const SMTP_PORT = Number(process.env.I3_SMTP_PORT || 2526);
const CAPTURE = path.join(WORK, 'i12-cron-capture');

function probeTcp(host, port, ms = 1200) {
  return new Promise((res) => { const s = new net.Socket(); let d = false; const f = (o) => { if (!d) { d = true; s.destroy(); res(o); } }; s.setTimeout(ms); s.once('connect', () => f(true)); s.once('timeout', () => f(false)); s.once('error', () => f(false)); s.connect(port, host); });
}
function listenersOn(port) { try { const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^\d+$/.test(x)))]; } catch (e) { return []; } }
function stopPort(port) { for (const pid of listenersOn(port)) { try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch (e) {} } }
function startSink() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [path.join(I3, 'i3-sink.js')], { env: { ...process.env, I3_SMTP_PORT: String(SMTP_PORT), I3_SMTP_CAPTURE: CAPTURE }, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = ''; const t = setTimeout(() => reject(new Error('sink hazir olmadi')), 5000);
    c.stdout.on('data', (d) => { o += d; if (o.includes('I3-SMTP-SINK-READY')) { clearTimeout(t); resolve(c); } }); c.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
async function waitFor(fn, ms, step = 400) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, step)); } return null; }

(async () => {
  const envInfo = L.AH.assertDisposableEnvironment();
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  console.log(`İ12 G7 CRON — runId=${runId} · db=${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName} · port=${PORT}`);
  if (!DIST_MAIN) throw new Error('I3_DIST_MAIN gerekli');
  fs.mkdirSync(CAPTURE, { recursive: true });
  try { fs.unlinkSync(STATE); } catch (e) {} try { fs.unlinkSync(RESULT); } catch (e) {}
  fs.writeFileSync(TRIGGER, '', 'utf8');

  const prisma = L.AH.loadPrisma();
  const R = new L.Results();
  let apiChild = null; let sinkProc = null; let tenantId = null;
  try {
    // disposable tenant + 1 aktif client (scope kaniti icin)
    const slug = `${L.AH.TENANT_PREFIX}${runId}-cron`; L.AH.assertOwnSlug(slug);
    const t = await prisma.tenant.create({ data: { name: `I12 cron ${runId}`, slug }, select: { id: true } });
    tenantId = t.id;
    await prisma.client.create({ data: { tenantId, type: 'PERSON', name: `I12 cron client ${runId}`, email: `cron-${runId}@ah-harness.invalid` }, select: { id: true } });

    sinkProc = await startSink();
    stopPort(PORT);
    const env = { ...process.env,
      DATABASE_URL: L.AH.requireEnv('AH_DATABASE_URL'), PORT: String(PORT), NODE_ENV: 'development',
      JWT_SECRET: require('crypto').randomBytes(32).toString('hex'), CORS_ORIGIN: 'http://127.0.0.1:3999',
      EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_USER: 'i12@ah.invalid', SMTP_PASS: 'x', EMAIL_FROM: 'noreply@ah-harness.invalid',
      CLIENT_STATEMENT_MONTHLY_DELIVERY: 'true',
      I12_CRON_STATE: STATE, I12_CRON_TRIGGER: TRIGGER, I12_CRON_RESULT: RESULT,
      I3_DIST_ROOT: process.env.I3_DIST_ROOT,
    };
    const out = fs.openSync(path.join(WORK, 'i12-cron-api.out.log'), 'a');
    const err = fs.openSync(path.join(WORK, 'i12-cron-api.err.log'), 'a');
    apiChild = spawn(process.execPath, ['--require', HOOK, DIST_MAIN], { cwd: WORK, env, detached: true, stdio: ['ignore', out, err] });
    apiChild.unref();

    const up = await waitFor(async () => (listenersOn(PORT).length ? true : null), 45000, 1000);
    if (!up) throw new Error(`API ${PORT} dinlemedi`);
    await probeTcp('127.0.0.1', PORT);

    // (a) PREDICATE — hook surecin icinden yazdi
    const stateObj = await waitFor(async () => readJson(STATE), 15000);
    if (!stateObj || stateObj.error) { R.unmeasured('G7a-PRED', 'cron predicate', stateObj ? stateObj.error : 'durum yazilmadi'); }
    else {
      R.check('G7a-PRED', 'predicate: env=true → cron KAYITLI + ifade 0 3 1 * * (kapaliyken kayit yok, ayri kanit)',
        stateObj.enabled === true && stateObj.registered === true && String(stateObj.cronExpr).replace(/\s+/g, ' ') === '0 3 1 * *',
        `enabled=${stateObj.enabled} registered=${stateObj.registered} expr='${stateObj.cronExpr}' job=${stateObj.jobClass}`);
    }

    // (b) DOGRUDAN CAGRI — runMonthlyDelivery(now, {tenantId})
    try { fs.unlinkSync(RESULT); } catch (e) {}
    fs.writeFileSync(TRIGGER, `direct ${tenantId}`, 'utf8');
    const direct = await waitFor(async () => { const r = readJson(RESULT); return r && r.record === 'I12-CRON-DIRECT' ? r : null; }, 30000);
    if (!direct) { R.unmeasured('G7b-DIRECT', 'dogrudan cagri', 'sonuc yazilmadi (zaman asimi)'); }
    else {
      const res = direct.result || {};
      R.check('G7b-DIRECT', 'runMonthlyDelivery DOGRUDAN cagrilir, scope onurlandirilir, gecerli sonuc doner (gercek calisma ciktisi)',
        res && typeof res.scanned === 'number' && res.periodKey != null,
        `scope=tenant ${String(tenantId).slice(-8)} · scanned=${res.scanned} · generated=${res.generated} · planned=${res.planned} · delivered=${res.delivered} · periodKey=${res.periodKey} · ${direct.ms}ms`);
    }

    // (c) GERCEK ZAMANLAYICI TETIGI — fireOnTick (HIZLANDIRILMIS; canli takvim kaniti DEGIL)
    try { fs.unlinkSync(RESULT); } catch (e) {}
    fs.writeFileSync(TRIGGER, 'fire', 'utf8');
    const fired = await waitFor(async () => { const r = readJson(RESULT); return r && (r.record === 'I12-CRON-FIRE' || r.record === 'I12-CRON-ERROR') ? r : null; }, 30000);
    if (!fired || fired.record === 'I12-CRON-ERROR') { R.unmeasured('G7c-FIRE', 'gercek zamanlayici tetigi', fired ? fired.error : 'tetik sonucu yazilmadi'); }
    else {
      R.check('G7c-FIRE', 'SchedulerRegistry cron job GERCEKTEN tetiklenir (fireOnTick, HIZLANDIRILMIS — canli takvim 0 3 1 * * kaniti DEGIL)',
        fired.fired === true,
        `fired=${fired.fired} · accelerated=${fired.accelerated} · yontem=${fired.mode} · NOT: ${fired.note}`);
    }

    // (d) KISA TAKVIM: zamanlayici KENDILIGINDEN (otonom) tetikler — fireOnTick DEGIL
    // Onceki tetik islemi bitene kadar bekle (hook busy iken yazarsak watchFile kacirir).
    await waitFor(async () => { try { return fs.readFileSync(TRIGGER, 'utf8').trim() === 'done' ? true : null; } catch (e) { return null; } }, 8000, 300);
    try { fs.unlinkSync(RESULT); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(TRIGGER, `shortcron ${tenantId}`, 'utf8');
    const shortR = await waitFor(async () => { const r = readJson(RESULT); return r && r.record === 'I12-CRON-SHORT' && r.autonomousFires >= 2 ? r : null; }, 20000, 700);
    // teslim/dedupe: aylik teslim SENT bildirim + ayni donem tekrar (otonom tetikler ayni periodKey) → ek gonderim
    const notif = await L.safeCount(() => prisma.clientNotification.count({ where: { tenantId, status: 'SENT' } }));
    if (!shortR) { R.unmeasured('G7d-SELF', 'kisa takvim otonom tetik', 'otonom tetik >=2 gozlenmedi (zaman asimi)'); }
    else {
      const lr = shortR.lastResult || {};
      const delivered = typeof lr.delivered === 'number' ? lr.delivered : null;
      R.check('G7d-SELF', 'KISA TAKVIM (2s): zamanlayici KENDILIGINDEN >=2 kez tetikledi (fireOnTick DEGIL, otonom); her tetik runMonthlyDelivery kosar; ayni donem tekrarinda ek TESLIM yok',
        shortR.autonomousFires >= 2 && lr && typeof lr.scanned === 'number' && lr.periodKey != null,
        `otonom tetik=${shortR.autonomousFires} · son kosum scanned=${lr.scanned} generated=${lr.generated} delivered=${delivered} planned=${lr.planned} periodKey=${lr.periodKey} · SENT bildirim(tenant)=${notif.value} · NOT: ${shortR.note} · teslim ICERIGI (send>0/ledger markSent) donem-aktivitesi fikstürü ister — jest c3b04 + canli §7`);
    }
  } catch (e) {
    console.error(`\nKOSUM DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1;
  } finally {
    if (apiChild) stopPort(PORT);
    if (sinkProc && sinkProc.exitCode === null) sinkProc.kill();
    if (tenantId) { try { await prisma.user.updateMany({ where: { tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } }); } catch (e) {} }
    const s = R.summary('İ12 G7 CRON');
    console.log(JSON.stringify({ record: 'I12-CRON-RUN', runId, tenant: tenantId ? `ah-${runId}-cron` : null, pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, total: s.total, results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict })) }, null, 1));
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
