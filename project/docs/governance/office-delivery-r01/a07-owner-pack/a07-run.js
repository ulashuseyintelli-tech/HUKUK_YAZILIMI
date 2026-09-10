/*
 * A-07 OWNER PAKETI — TEK YURUTUCU (owner'in yukseltilmis terminalinde calisir)
 *
 * SIRA (kanonik plan §8.15.6):
 *   00 ON OLCUM (salt-okuma; DUSERSE BAYRAK ACILMAZ)
 *   -> kapanis yolunun KURU KOSUMU (yan etkisiz) — "kapatma yolu hazir olmadan acma"
 *   -> 01 ERISIM AC   (EN DAR: yalniz ADMIN satiri · isActive=true + TAZE parola)
 *   -> 02 BAYRAK AC   (yalniz OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED) + API restart + toparlanma
 *   -> 03 A-07 KOSUMU (execute + kanit + hedefli reconcile)
 *   -> 99 KAPANIS     (`finally`, IN-PROCESS: bayrak kapat + guncel dosyayla toparla +
 *                      bayrak UCTAN 403 + erisim iptal + iptalin UCTAN kaniti + servis/DB)
 *
 * 2026-09-10'DA DUZELTILEN RAPORLAMA KUSURLARI:
 *   A) Ozet yalniz KOSULAN olcutleri sayiyordu -> akis A07-04'te dustugunde "3/3 PASS · FAIL 0".
 *      Artik zorunlu kume a07-verdict.js'de ONCEDEN ilan edilir; kosulmayan her zorunlu olcut
 *      NOT_EXECUTED sayilir ve hukum PASS OLAMAZ.
 *   B) "RESTART SAYISI: restarts.length + 1" — kapanis restart'i VARSAYILIYOR, acma restart'i
 *      yalniz BASARILIYSA sayiliyordu. Artik iki ayri defter: girisim · baslatma verildi ·
 *      yeni baslatici gozlendi · toparlandi — acma ve kapanis ICIN AYRI AYRI, olculerek.
 *   Kapanis artik ALT SUREC degil IN-PROCESS: token ve taze parola kapanisa gecer, boylece
 *   bayragin UCTAN 403 kaniti ve erisim iptalinin AYIRT EDICI kaniti alinabilir.
 *
 * NEDEN TAZE PAROLA GEREKIYOR (olculdu, auth.service.ts login kapisi):
 *   passwordHash NULL DEGIL + bcrypt.compare + tenant lifecycle + isActive.
 *   Ilk kosumun parolasi G-4 geregi BELLEKTE uretilmisti -> KURTARILAMAZ.
 *   Parola BU SURECTE uretilir, yalniz bellekte tutulur, HICBIR CIKTIYA/DOSYAYA yazilmaz.
 *
 * KAPSAM: A-07 yalniz ADMIN aktorune ihtiyac duyar. Personel satirina DOKUNULMAZ. Acilan satir: 1.
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const SCRIPTS = path.resolve(HERE, '..', 'scripts');
const L = require(path.join(SCRIPTS, 'ow-lib'));
const SVC = require(path.join(SCRIPTS, 'ow-service'));
const DEPS = require('./a07-deps');
const CLOSE = require('./a07-99-close');
const V = require('./a07-verdict');

const SLUG = process.env.A07_TENANT_SLUG || 'off-acc-f851d975';
// Sabit gomulu yol YOK: kanonik kokte bu paketler BULUNMAYABILIR (2026-09-10'da olculdu).
const DEPS_RESOLVED = DEPS.resolveAll({ needBcrypt: true });
const BCRYPT = DEPS_RESOLVED.bcryptRoot;

// Parola BELLEKTE uretilir; log'a, dosyaya, rapora ASLA yazilmaz.
const PW = `A07-${crypto.randomBytes(18).toString('base64url')}!zQ4`;

function runStep(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...args], {
    env: { ...process.env }, encoding: 'utf8', stdio: 'inherit', timeout: 900000,
  });
  return r.status === null ? 124 : r.status;
}

function fmtOpen(l) {
  if (!l) return 'KOSULMADI (akis bu adima ulasmadi)';
  return `girisim=${l.restartAttempts} · baslatma verildi=${l.startIssued} · `
    + `yeni baslatici gozlendi=${l.startObserved ? 'EVET' : 'HAYIR'} · toparlandi=${l.recovered ? 'EVET' : 'HAYIR'}`
    + (l.readyMs !== null && l.readyMs !== undefined ? ` · ${l.readyMs} ms` : '');
}
function fmtClose(l) {
  if (!l) return 'KOSULMADI';
  return `girisim=${l.restartAttempts} · baslatma verildi=${l.startsIssued} · yeni baslatici gozlendi=${l.startsObserved} · `
    + `toparlandi=${l.recovered ? 'EVET' : 'HAYIR'} · kararlar=${l.decisions.join('>') || '-'}`
    + (l.error ? ` · HATA: ${l.error}` : '');
}

(async () => {
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
  L.assertRunEnvironment();
  L.assertOwnSlug(SLUG);

  const R = L.makeRecorder('A-07 KABUL');
  let failure = null;
  let accessOpened = false;
  let token = null;
  let openLedger = null;
  let closeLedger = null;

  console.log(`\n=== OFFICE A-07 KONTROLLU YURUTME KABULU · tenant=${SLUG} ===`);
  console.log(`    @prisma/client : ${DEPS_RESOLVED.prismaRoot}`);
  console.log(`    bcrypt         : ${DEPS_RESOLVED.bcryptRoot}`);
  console.log('    (parola bellekte uretildi; hicbir ciktiya BASILMAZ)\n');

  try {
    // ── 00 ON OLCUM ──
    const pf = runStep('a07-00-preflight.js');
    if (pf !== 0) throw new Error(`ON OLCUM DUSTU (exit ${pf}) — bayrak ACILMADI, hicbir sey degismedi`);

    // ── KAPANIS YOLU KURU KOSUM (yan etkisiz) — "kapatma yolu hazir olmadan acma" ──
    const dry = await CLOSE.runClose({ dry: true, slug: SLUG });
    const dsum = dry.recorder.summary();
    if (dsum.fail > 0) throw new Error(`KAPANIS YOLU HAZIR DEGIL (${dsum.fail} kuru-kosum olcutu dustu) — bayrak ACILMAZ`);

    const prisma = L.loadPrisma();
    let requestId = null; let caseId = null; let targetStatus = null; let attempt = null;
    try {
      const t = await prisma.tenant.findFirst({ where: { slug: SLUG }, select: { id: true } });
      if (!t) throw new Error(`tenant ${SLUG} YOK`);
      await L.assertOwnTenant(prisma, t.id);
      const T = { tenantId: t.id };

      const req = await prisma.officeApprovalRequest.findFirst({ where: T });
      if (!req) throw new Error('A-07 talebi YOK');
      requestId = req.id; caseId = req.targetRef; attempt = req.retryCount;
      targetStatus = req.savedIntent && req.savedIntent.status;

      const admin = await prisma.user.findFirst({ where: { ...T, role: 'ADMIN' }, select: { id: true, email: true } });
      if (!admin) throw new Error('sentetik ADMIN YOK');

      // ── 01 ERISIM AC — TEK SATIR ──
      L.step('A07-01', 'sentetik ADMIN erisimi ACILIYOR (TEK satir · isActive + TAZE parola)');
      const bcrypt = require(BCRYPT);
      const hash = await bcrypt.hash(PW, 10);
      await prisma.user.update({ where: { id: admin.id }, data: { isActive: true, passwordHash: hash } });
      accessOpened = true;
      const chk = await prisma.user.findUnique({ where: { id: admin.id }, select: { isActive: true } });
      R.ok('A07-01', 'ADMIN erisimi acildi (yalniz kabul suresince)', !!chk && chk.isActive === true,
        `isActive=${chk && chk.isActive} · acilan satir=1 (personel satirina DOKUNULMADI)`);

      // ── OTURUM: token BIR KEZ alinir (rate-limit) ──
      token = await L.login(base, admin.email, PW, SLUG);
      R.ok('A07-02', 'sentetik ADMIN oturumu acildi (token bellekte, HICBIR YERE yazilmaz)', !!token, 'token alindi');

      // ── ACMADAN ONCE: bayrak UCTAN KAPALI mi ──
      const beforeProbe = await SVC.probeFlagEndpoint(base, token);
      R.ok('A07-03', 'bayrak acma ONCESI uctan KAPALI (403 DISABLED)',
        beforeProbe.verdict === 'KAPALI', `${beforeProbe.verdict} (HTTP ${beforeProbe.status})`);
      if (beforeProbe.verdict !== 'KAPALI') throw new Error(`acma oncesi bayrak KAPALI degil (${beforeProbe.verdict})`);

      // ── 02 BAYRAK AC + RESTART + TOPARLANMA ──
      L.step('A07-04', 'bayrak ACILIYOR (yalniz kabul bayragi) + API restart (TEK stop + TEK start)');
      SVC.setFlagFile(true);
      try {
        const r1 = await SVC.restartApiAndVerify(base, { expectFlag: 'ACIK', token, label: 'BAYRAK-AC' });
        openLedger = r1.ledger;
        R.ok('A07-04', 'bayrak ACIK + servis TOPARLANDI (acma restart)', true,
          `PID ${r1.oldPid} -> ${r1.newPid} · hazir ${r1.readyMs} ms · uc=${r1.flagVerdict}`);
      } catch (e) {
        openLedger = e.ledger || null;
        R.ok('A07-04', 'bayrak ACIK + servis TOPARLANDI (acma restart)', false, e.message);
        throw e; // kapanis `finally`de; o da OLCUME gore bekler/yeniden baslatir
      }

      // ── 03 YURUTME — TEK KEZ ──
      L.step('A07-05', 'kontrollu uctan execute — TEK KEZ (K6 fixture i TUKETIR)');
      const ex = await L.httpJson('POST', `${base}/office-approvals/${requestId}/execute`, { token, timeoutMs: 120000 });
      L.log(`      HTTP ${ex.status === null ? 'BELIRSIZ' : ex.status}${ex.indeterminate ? ` (${ex.indeterminateReason})` : ''}`);
      if (ex.status === 409) L.log('      !!! 409 — "zaten yapildi" VARSAYILMAZ; iz DOGRUDAN aranir');
      if (ex.indeterminate) L.log('      !!! BELIRSIZ — istek TEKRAR GONDERILMEZ; kalici durum salt-okuma uzlastirilir');

      // ── KANIT ──
      L.step('A07-06', 'yurutme izi dogrulaniyor');
      const post = await prisma.officeApprovalRequest.findFirst({
        where: { id: requestId, tenantId: t.id }, select: { executionStatus: true, executedAt: true },
      });
      R.ok('A07-E1', 'executionStatus SUCCEEDED', !!post && post.executionStatus === 'SUCCEEDED',
        `executionStatus=${post && post.executionStatus} · executedAt=${post && post.executedAt}`);

      const audits = await prisma.auditLog.findMany({
        where: { tenantId: t.id, action: { in: ['OFFICE_APPROVAL_EXECUTION_STARTED', 'OFFICE_APPROVAL_EXECUTION_SUCCEEDED'] } },
        select: { action: true },
      });
      const acts = new Set(audits.map((a) => a.action));
      R.ok('A07-E2', 'AuditLog STARTED izi', acts.has('OFFICE_APPROVAL_EXECUTION_STARTED'), [...acts].join(',') || 'YOK');
      R.ok('A07-E3', 'AuditLog SUCCEEDED izi', acts.has('OFFICE_APPROVAL_EXECUTION_SUCCEEDED'), `audit=${audits.length}`);

      const hist = await prisma.caseStatusHistory.findFirst({
        where: { approvalRequestId: requestId, approvalAttempt: attempt },
        select: { id: true, fromStatus: true, toStatus: true, approvalAttempt: true },
      });
      R.ok('A07-E4', 'CaseStatusHistory KESIN BAG (approvalRequestId + approvalAttempt)', !!hist,
        hist ? `history=${hist.id} · ${hist.fromStatus}->${hist.toStatus} · attempt=${hist.approvalAttempt}`
          : `bag YOK (request=${requestId} attempt=${attempt}) — OLCULEMEZLIK`);

      const kase2 = await prisma.case.findFirst({ where: { id: caseId, tenantId: t.id }, select: { caseStatus: true } });
      R.ok('A07-E5', 'Case.caseStatus hedefe esit', !!kase2 && kase2.caseStatus === targetStatus,
        `caseStatus=${kase2 && kase2.caseStatus} (hedef ${targetStatus})`);
      const dec = await prisma.decisionLog.count({ where: { caseId } });
      R.ok('A07-E6', 'DecisionLog satiri yazildi', dec > 0, `decisionLog(case)=${dec}`);

      // ── HEDEFLI RECONCILE ──
      L.step('A07-07', 'hedefli reconcile — kesin bag; YENIDEN UYGULAMA YOK');
      const b = await prisma.caseStatusHistory.count({ where: { approvalRequestId: requestId } });
      const rc = await L.httpJson('POST', `${base}/office-approvals/${requestId}/reconcile`, { token, timeoutMs: 60000 });
      const a = await prisma.caseStatusHistory.count({ where: { approvalRequestId: requestId } });
      const body = JSON.stringify(rc.body || {});
      R.ok('A07-R1', 'reconcile islemi YENIDEN UYGULAMADI (history sabit)', b === a, `history ${b} -> ${a}`);
      R.ok('A07-R2', 'reconcile terminal durumu dogru degerlendirdi (409 RUNNING-only VEYA SUCCEEDED verdict)',
        rc.status === 409 || body.includes('SUCCEEDED'), `HTTP ${rc.status} · ${body.slice(0, 150)}`);
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  } catch (e) {
    failure = failure || (e && e.message) || String(e);
    console.error('\nKOSUM HATASI:', failure);
  } finally {
    // ── 99 KAPANIS — HER HALUKARDA, IN-PROCESS ──
    console.log('\n[KAPANIS] bayrak kapatma + guncel dosyayla toparlanma + erisim iptali + UC kanit (basarisizlikta DA)');
    try {
      const cl = await CLOSE.runClose({ dry: false, slug: SLUG, token, password: accessOpened ? PW : null, rec: R });
      closeLedger = cl.ledger;
    } catch (e) {
      failure = failure || `KAPANIS CALISTIRILAMADI: ${e && e.message}`;
    }

    // ── HUKUM: zorunlu kumenin TAMAMI ──
    const v = V.finalize(R.results, { failure });
    const ne = R.results.filter((r) => r.notExecuted);
    if (ne.length) {
      console.log('\n  --- KOSULMAYAN ZORUNLU OLCUTLER (NOT_EXECUTED — PASS SAYILMAZ) ---');
      for (const r of ne) console.log(`  ????  ${r.id.padEnd(16)} ${r.desc}\n             ${r.observed}`);
    }
    console.log(`\nA-07 KABUL: ${v.pass}/${v.total} PASS · FAIL ${v.fail} · OLCULEMEDI/NOT_EXECUTED ${v.unmeasured}`);

    console.log(`\n=== A-07 OZETI · tenant=${SLUG} ===`);
    console.log('    RESTART SAYACLARI (girisim ≠ baslatma ≠ toparlanma; OLCULDU, varsayilmadi):');
    console.log(`      ACMA    : ${fmtOpen(openLedger)}`);
    console.log(`      KAPANIS : ${fmtClose(closeLedger)}`);
    const attempts = (openLedger ? openLedger.restartAttempts : 0) + (closeLedger ? closeLedger.restartAttempts : 0);
    const observed = (openLedger && openLedger.startObserved ? 1 : 0) + (closeLedger ? closeLedger.startsObserved : 0);
    const recovered = (openLedger && openLedger.recovered ? 1 : 0) + (closeLedger && closeLedger.recovered ? 1 : 0);
    console.log(`      TOPLAM  : restart girisimi=${attempts} · gozlenen yeni baslatici=${observed} · dogrulanmis toparlanma=${recovered}`);
    console.log(`    ERISIM ACILDI MI: ${accessOpened ? 'EVET (1 satir) — kapanista IPTAL denendi (bkz. CL-ACCESS-*)' : 'HAYIR'}`);
    console.log(`    A-07 SONUC: ${v.verdict}${v.verdict === 'PASS' ? '' : ` — ${v.reasons.join(' · ')}`}`);
    console.log('    Parola ve token hicbir yere yazilmadi.');
    process.exitCode = v.verdict === 'PASS' ? 0 : 1;
  }
})().catch((e) => {
  console.error('\nA-07 CALISTIRICI HATASI:', e && e.stack ? e.stack : e);
  console.error('KAPANISI ELLE KOSUN: node a07-99-close.js');
  process.exitCode = 1;
});
