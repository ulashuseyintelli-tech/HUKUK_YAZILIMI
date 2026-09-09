/*
 * A-07 OWNER PAKETI — 00 ON OLCUM (SALT OKUMA, TEK BASINA CALISIR)
 *
 * Hicbir yazma yapmaz. Herhangi bir olcut dusberse **exit 1** ve kosum BASLAMAZ.
 * Owner GO'su (kanonik plan §8.15.6): "KAPATMA VE TOPARLANMA YOLU HAZIR OLMADAN BAYRAGI ACMA."
 * Bu betik tam olarak bunu kanitlar — varsaymaz:
 *   - EnvFile'a YAZMA IZNI var mi  (fs.openSync(path,'r+') — icerik ve mtime DEGISMEZ)
 *   - Scheduled Task sorgulanabiliyor mu
 *   - kapanis/kurtarma betigi DISKTE var mi ve sozdizimi gecerli mi
 *   - CRON bayragi KAPALI mi (acikta kalmasi kapsam disi risktir)
 *   - DB ERISILEBILIR mi (2026-09-10'da canli PG kapaliydi; bu olcut o gunun dersidir)
 *   - fixture TUKETILMEMIS mi + §2.1.1'in BES ON KOSULU
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const SCRIPTS = path.resolve(HERE, '..', 'scripts');
const L = require(path.join(SCRIPTS, 'ow-lib'));
const SVC = require(path.join(SCRIPTS, 'ow-service'));
const DEPS = require('./a07-deps');

const SLUG = process.env.A07_TENANT_SLUG || 'off-acc-f851d975';
const CRON_FLAG = 'OFFICE_APPROVAL_EXECUTOR_ENABLED';

(async () => {
  const R = L.makeRecorder('A-07 ON OLCUM');
  // Bagimliliklar SABIT GOMULU DEGIL — adaylar sirayla denenir ve KULLANILAN yol yazdirilir.
  const deps = DEPS.resolveAll({ needBcrypt: true });
  console.log(`      @prisma/client : ${deps.prismaRoot}`);
  console.log(`      bcrypt         : ${deps.bcryptRoot}`);
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
  L.assertRunEnvironment();          // G-0: live + OW_CONFIRM_LIVE jetonu
  L.assertOwnSlug(SLUG);             // G-1

  // ── 1) KAPATMA/TOPARLANMA YOLU HAZIR MI (bayrak ACILMADAN ONCE) ──
  L.step('PF-1', 'kapatma ve toparlanma yolu KANITLANIYOR (varsayilmiyor)');
  let envFile = null;
  try { envFile = SVC.resolveEnvFile(); } catch (e) { /* asagida FAIL */ }
  R.ok('PF-1.envfile', 'EnvFile yolu baslaticidan COZULDU', !!envFile, envFile || 'COZULEMEDI');

  let writable = false; let writeErr = '';
  if (envFile) {
    try { const fd = fs.openSync(envFile, 'r+'); fs.closeSync(fd); writable = true; }
    catch (e) { writeErr = (e && e.code) || String(e); }
  }
  R.ok('PF-1.write', 'EnvFile YAZILABILIR (yukseltilmis terminal sart) — icerik/mtime DEGISMEDI',
    writable, writable ? 'r+ acildi ve kapatildi' : `YAZILAMAZ (${writeErr}) — YUKSELTILMIS TERMINAL GEREKLI`);

  const q = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-ScheduledTask -TaskName '${SVC.TASK_NAME}').State`], { encoding: 'utf8', timeout: 60000 });
  const taskState = (q.stdout || '').trim();
  R.ok('PF-1.task', `Scheduled Task '${SVC.TASK_NAME}' sorgulanabiliyor ve Running`,
    taskState === 'Running', `State=${taskState || 'SORGULANAMADI'}`);

  const closeScript = path.join(HERE, 'a07-99-close.js');
  const closeExists = fs.existsSync(closeScript);
  const syn = closeExists
    ? spawnSync(process.execPath, ['--check', closeScript], { encoding: 'utf8', timeout: 60000 })
    : null;
  R.ok('PF-1.recovery', 'kapanis/kurtarma betigi DISKTE ve sozdizimi GECERLI',
    closeExists && syn && syn.status === 0,
    closeExists ? `a07-99-close.js · node --check exit=${syn && syn.status}` : 'a07-99-close.js YOK');

  // ── 2) BAYRAK DURUMU (dosya duzeyi) ──
  L.step('PF-2', 'bayrak durumu — kabul bayragi KAPALI, CRON bayragi KAPALI');
  const flag = envFile ? SVC.readFlagFile() : { enabled: true, present: true };
  R.ok('PF-2.acc', `kabul bayragi ${SVC.FLAG_KEY} KAPALI (satir yok veya false)`,
    flag.enabled === false, `enabled=${flag.enabled} · satir var mi=${flag.present}`);

  let cronPresent = null;
  if (envFile) {
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    const hit = lines.filter((l) => l.trim().startsWith(`${CRON_FLAG}=`));
    cronPresent = hit.length > 0
      ? hit[hit.length - 1].split('=').slice(1).join('=').trim().toLowerCase() === 'true'
      : false;
  }
  R.ok('PF-2.cron', `CRON bayragi ${CRON_FLAG} KAPALI kalacak (capraz-tenant tarama YOK)`,
    cronPresent === false, `cron acik mi=${cronPresent}`);

  // ── 3) CANLI KIMLIK ──
  L.step('PF-3', 'canli surum kimligi');
  const pid = SVC.apiPid();
  R.ok('PF-3.pid', 'API sureci OLCULEBILIYOR', pid !== null, `API PID=${pid}`);
  const rel = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8', timeout: 60000 });
  const cl = (rel.stdout || '').trim();
  R.ok('PF-3.release', 'API RELEASE21 agacindan calisiyor',
    cl.includes('HY_W4_RELEASE21'), cl.includes('HY_W4_RELEASE21') ? 'HY_W4_RELEASE21' : `BEKLENMEYEN: ${cl.slice(0, 120)}`);

  // ── 4) API GERCEKTEN CALISIYOR MU — DB'YE DOKUNARAK ──
  // 2026-09-10 DERSI: bos govdeye 400 donmesi "saglikli" DEMEK DEGILDIR; ValidationPipe
  // DB'den ONCE calisir. DB kapaliyken de 400 alinir. Bu yuzden DB'ye DOKUNAN sinama sart.
  L.step('PF-4', 'API + DB gercekten ayakta mi (DB e DOKUNAN sinama)');
  const shallow = await L.httpJson('POST', `${base}/auth/login`, { body: {}, timeoutMs: 10000 });
  R.ok('PF-4.http', 'API istek isliyor (bos govde -> 400)', shallow.status === 400, `HTTP ${shallow.status}`);
  const deep = await L.httpJson('POST', `${base}/auth/login`, {
    body: { email: 'a07-preflight-probe@invalid.local', password: 'x', tenantSlug: SLUG },
    timeoutMs: 20000,
  });
  R.ok('PF-4.db', 'DB ERISILEBILIR (olmayan kullanici -> 401; 500 = DB YOK)',
    deep.status === 401, `HTTP ${deep.status}${deep.status === 500 ? ' — VERITABANI ERISILEMEZ, KOSUM BASLAMAZ' : ''}`);

  // ── 5) FIXTURE + BES ON KOSUL ──
  // DB ERISILEMEZSE: bu olcutler "yok" SAYILMAZ, **OLCULEMEDI** olarak kaydedilir ve
  // owner duzgun bir HUKUM gorur (stack trace DEGIL). Olculemeyen sonuc PASS DEGILDIR.
  if (deep.status !== 401) {
    L.step('PF-5', 'fixture + bes on kosul ATLANDI — DB erisilemez');
    for (const [id, desc] of [
      ['PF-5.tenant', 'sentetik tenant MEVCUT'],
      ['PF-5.K5', 'K5: caseStatus intent hedefinden FARKLI'],
      ['PF-5.K6', 'K6: executionStatus NOT_RUN — fixture TUKETILMEMIS'],
      ['PF-5.approver', 'approverUserId DOLU'],
      ['PF-5.shape', 'savedIntent SEKIL-GECERLI'],
      ['PF-5.scope', 'kapsam CHANGE_STATUS/LegalCase + APPROVED'],
      ['PF-5.attempt', 'attempt (retryCount) = 0'],
      ['PF-5.nobind', 'yurutme izi bagi YOK'],
      ['PF-6.admin', 'sentetik ADMIN VAR'],
      ['PF-6.closed', 'ADMIN su an KAPALI'],
      ['PF-6.lifecycle', 'tenant lifecycle LOGIN EDILEBILIR'],
      ['PF-6.office', 'tenant ofisi SUNUCUDA cozulebilir'],
      ['PF-6.f01', 'ADMIN in Lawyer/ofis bagi VAR'],
    ]) R.unmeasured(id, desc, 'veritabani ERISILEMEZ (PF-4.db)');
    const s0 = R.summary();
    console.error('\n!!! ON OLCUM DUSTU — BAYRAK ACILMAZ, KOSUM BASLAMAZ.');
    console.error('    KOK NEDEN: canli PostgreSQL erisilemez (API DB e dokunan istekte 500 doner).');
    console.error('    Bu bir A-07 kusuru DEGILDIR; once veritabani ayaga kaldirilmalidir.');
    process.exitCode = 1;
    return s0;
  }

  L.step('PF-5', 'fixture tuketilmemis mi + §2.1.1 bes on kosul');
  const prisma = L.loadPrisma();
  try {
    const sema = await DEPS.assertPrismaKnowsDeltaA(prisma);
    R.ok('PF-5.sema', 'Prisma client DELTA-A alanlarini TANIYOR (yoksa kanit sessizce bos doner)',
      sema.ok, sema.detail);
    const t = await prisma.tenant.findFirst({ where: { slug: SLUG }, select: { id: true, lifecycle: true } });
    R.ok('PF-5.tenant', 'sentetik tenant MEVCUT', !!t, `id=${t && t.id} lifecycle=${t && t.lifecycle}`);
    if (!t) throw new Error('tenant yok');
    const T = { tenantId: t.id };

    const req = await prisma.officeApprovalRequest.findFirst({ where: T });
    const kase = req ? await prisma.case.findFirst({ where: { id: req.targetRef, tenantId: t.id }, select: { caseStatus: true } }) : null;
    const intent = req && req.savedIntent;

    R.ok('PF-5.K5', 'K5: caseStatus intent hedefinden FARKLI (sessiz STALE yolu kapali)',
      !!kase && !!intent && kase.caseStatus !== intent.status,
      `caseStatus=${kase && kase.caseStatus} · intent=${intent && intent.status}`);
    R.ok('PF-5.K6', 'K6: executionStatus NOT_RUN — fixture TUKETILMEMIS',
      !!req && req.executionStatus === 'NOT_RUN', `executionStatus=${req && req.executionStatus} · executedAt=${req && req.executedAt}`);
    R.ok('PF-5.approver', 'approverUserId DOLU (409 approver kapisi kapali)',
      !!req && !!req.approverUserId, req && req.approverUserId ? 'DOLU' : 'BOS');
    R.ok('PF-5.shape', 'savedIntent SEKIL-GECERLI (sessiz FAILED yolu kapali)',
      !!intent && typeof intent === 'object' && typeof intent.status === 'string', `status tipi=${intent ? typeof intent.status : 'YOK'}`);
    R.ok('PF-5.scope', 'kapsam CHANGE_STATUS/LegalCase + APPROVED',
      !!req && req.actionCode === 'CHANGE_STATUS' && req.targetType === 'LegalCase' && req.status === 'APPROVED',
      `${req && req.actionCode}/${req && req.targetType} · ${req && req.status}`);
    R.ok('PF-5.attempt', 'attempt (retryCount) = 0 — kanit bagi bu degere gore aranacak',
      !!req && req.retryCount === 0, `retryCount=${req && req.retryCount}`);
    const bound = await prisma.caseStatusHistory.count({ where: { approvalRequestId: req ? req.id : 'x' } });
    R.ok('PF-5.nobind', 'yurutme izi bagi YOK (hic yurutulmemis)', bound === 0, `bag=${bound}`);

    // ── 6) ACILACAK ERISIM — EN DAR KAPSAM ──
    L.step('PF-6', 'acilacak erisim kapsami (A-07 icin YALNIZ ADMIN gerekir)');
    const users = await prisma.user.findMany({ where: T, select: { id: true, email: true, role: true, isActive: true } });
    const admin = users.find((u) => u.role === 'ADMIN');
    R.ok('PF-6.admin', 'sentetik ADMIN VAR', !!admin, `${admin && admin.email}`);
    R.ok('PF-6.closed', 'ADMIN su an KAPALI (acilacak) — beklenen durum',
      !!admin && admin.isActive === false, `isActive=${admin && admin.isActive}`);
    R.ok('PF-6.lifecycle', 'tenant lifecycle LOGIN EDILEBILIR (aksi halde login 401 doner)',
      !!t && String(t.lifecycle) === 'ACTIVE', `lifecycle=${t && t.lifecycle}`);
    const office = await prisma.office.findUnique({ where: { tenantId: t.id }, select: { id: true } });
    R.ok('PF-6.office', 'tenant ofisi SUNUCUDA cozulebilir (yoksa fail-closed RED)', !!office, `office=${office && office.id}`);
    const lawyer = admin ? await prisma.lawyer.findFirst({ where: { userId: admin.id, tenantId: t.id }, select: { id: true, officeId: true } }) : null;
    R.ok('PF-6.f01', 'ADMIN in Lawyer/ofis bagi VAR (F01 kapisi gecilebilir)',
      !!lawyer && !!office && lawyer.officeId === office.id, `lawyer=${lawyer && lawyer.id}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  const sum = R.summary();
  if (sum.fail > 0) {
    console.error('\n!!! ON OLCUM DUSTU — BAYRAK ACILMAZ, KOSUM BASLAMAZ.');
  }
  process.exitCode = sum.fail === 0 ? 0 : 1;
})().catch((e) => {
  console.error('\nON OLCUM HATASI:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
