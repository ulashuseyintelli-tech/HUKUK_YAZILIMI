/*
 * CLIENT İ11 — TEK YÜRÜTÜCÜ (H5 intake kabulü)
 *
 * GERÇEK YÜRÜTME SIRASI:
 *   1) i11-01-setup     → 15 satır COMMIT (Tenant · User×3 · Lawyer · Client · Case · CaseLawyer ·
 *                          Debtor · CaseDebtor · IntakeLink · Submission · Field×2 · PermissionGrant)
 *   2) i11-02-intake    → P-0r/e/p/x · R-3 · R-1 · R-2 · R-2b · A-0i · (A-5/A-6 yalnız onaylıysa)
 *   3) finally          → cl-09 (İ1b paketinden, KOPYA DEĞİL): isActive=false + tokenVersion++
 *                          ve Case ACTIVE→CLOSED (cron maruziyeti)
 *   4) DOĞRULAMA        → aynı kimlikle login **401**
 *   5) TEKRAR           → cl-09 ikinci çağrı: alreadyClosed=true, exit 0
 *   6) İZOLASYON        → İ9 paketinin i9-03-isolation.js'i (KOPYA DEĞİL)
 *
 * KURALLAR:
 *   · Kapatma çıkış kodundan ve ölçüm sonucundan BAĞIMSIZ olarak HER KOŞULDA denenir.
 *   · Kapanış doğrulanamazsa BAŞARILI verilmez. İzolasyon farkı/ölçülemezliği BAŞARILI yapmaz.
 *   · Yetkisiz deneme dur kuralı i11-02'dedir.
 *   · GÖNDERİM (A-5/A-6) yalnız `CL_I11_SEND_APPROVED` = owner GO ref'i ile açılır; açılmazsa iki
 *     ölçüt KAPSAM DIŞI kaydedilir ve koşum sonucu `scope: KISMI` olur — İ11 bu hâlde KAPANMAZ.
 *   · Parola yalnız bellekte; alt sürece yalnız ortam değişkeni olarak geçer; yazılmaz.
 *   · Login bütçesi: 3 (aktörler) + 1 (doğrulama) = 4 < 10/dk (IP başına). 429 → ilgili iddia
 *     ÖLÇÜLEMEDİ (429 kanıt SAYILMAZ).
 *
 * ZORUNLU: CL_ENVIRONMENT · CL_DATABASE_URL · CL_API_BASE_URL · CL_STATE_FILE · CL_PRISMA_ROOT ·
 *          CL_BCRYPT_PATH   (live: CL_OWNER_GO_REF · oturuma özel disposable DB: CL_SESSION_DB)
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
const INTAKE = require('./i11-02-intake'); // yalnız yan etkisiz kapı fonksiyonları

const HERE = __dirname;
const CL09 = path.join(HERE, '../../client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js');
const ISO = path.join(HERE, '../../client-live-acceptance-i9-r01/scripts/i9-03-isolation.js');
const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i11-state.json');
const SECRET = process.env.CL_LOGIN_PASSWORD || `I11-${crypto.randomBytes(18).toString('base64url')}!aB9`;
const RUN_ID = (process.env.CL_RUN_ID || crypto.randomBytes(4).toString('hex')).toLowerCase();
const API = (process.env.CL_API_BASE_URL || '').replace(/\/+$/, '');

const steps = [];
function run(file, extraEnv = {}) {
  const r = spawnSync(process.execPath, [file], {
    env: { ...process.env, CL_STATE_FILE: STATE, CL_LOGIN_PASSWORD: SECRET, CL_RUN_ID: RUN_ID, ...extraEnv },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, cwd: path.dirname(STATE),
  });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const code = r.status === null ? 124 : r.status;
  let record = null;
  try { const i = out.indexOf('{'); if (i >= 0) record = JSON.parse(out.slice(i)); } catch (e) { record = null; }
  steps.push({ file: path.basename(file), code });
  return { code, record, out };
}

(async () => {
  let failure = null; let env = null; let setupOk = false; let measureRecord = null; let withSend = false;
  const V = { loginAfter: null, repeatAlreadyClosed: null, why: null };
  try {
    for (const k of ['CL_PRISMA_ROOT', 'CL_BCRYPT_PATH']) {
      if (!process.env[k]) throw new Error(`${k} ZORUNLU — varsayilana SESSIZCE dusulmez; hicbir yazma yapilmadi`);
    }
    INTAKE.assertI11GoRef();     // canlıda YALNIZ İ11 GO ref'i — G-0'dan ÖNCE
    withSend = INTAKE.sendApproved(); // gönderim kapsamı ref ile eşleşmezse burada durur
    console.log(`[ON KONTROL] GO ref kapisi gecildi · gonderim kapsami=${withSend ? 'ONAYLI (A-5/A-6 olculecek)' : 'YOK (A-5/A-6 KAPSAM DISI)'}`);
    env = L.assertEnvironment(); // G-0
    console.log(`\n=== CLIENT I11 KOSUMU · runId=${RUN_ID} · ortam=${env.environment}`
      + (env.sessionDb ? ' (oturuma ozel DB)' : '')
      + (env.ownerGoRef ? ` · ownerGoRef=${env.ownerGoRef}` : '') + ' ===');
    console.log('    (parola ve intake ham token bellekte uretildi; hicbir ciktiya BASILMAZ)\n');

    const setup = run(path.join(HERE, 'i11-01-setup.js'));
    if (setup.code !== 0 && setup.code !== 4) failure = `kurulum basarisiz (exit ${setup.code})`;
    else setupOk = true;

    if (setupOk) {
      const m = run(path.join(HERE, 'i11-02-intake.js'));
      measureRecord = m.record;
      if (m.code === 1) failure = failure || 'intake olcumlerinde FAIL var';
      else if (m.code === 3) failure = failure || 'intake olcumlerinde OLCULEMEYEN var';
      else if (m.code !== 0) failure = failure || `intake olcumu beklenmeyen cikis (exit ${m.code})`;
    }
  } catch (e) {
    failure = failure || (e && e.message) || String(e);
    console.error('\nKOSUM HATASI:', failure);
  } finally {
    let closeRecord = null; let repeatRecord = null;
    if (env) {
      console.log(`\n[KAPANIS] alan runId=${RUN_ID} ile araniyor (cikis kodu ve olcum sonucu DIKKATE ALINMAZ)`);
      const cv = run(CL09); closeRecord = cv.record;
      if (cv.code !== 0) {
        console.error('  !!! ERISIM KAPANISI EKSIK — cl-09 ciktisindaki verdict incelenmelidir.');
        console.error(`      Tekrar (guvenli): CL_RUN_ID=${RUN_ID} node ${CL09}`);
        failure = failure || `erisim kapanisi eksik (cl-09 exit ${cv.code})`;
      }
      if (setupOk && closeRecord && closeRecord.fieldExists && API) {
        let email = null; let slug = null;
        try { const st = JSON.parse(require('fs').readFileSync(STATE, 'utf8')); email = st.actors.reviewer.email; slug = st.slug; }
        catch (e) { V.why = 'durum dosyasi okunamadi'; }
        if (email && slug) {
          const lg = await L.login(API, email, SECRET, slug);
          V.loginAfter = lg.indeterminate ? `BELIRSIZ(${lg.reason})` : lg.status;
          if (lg.status === 429) V.why = 'HTTP 429 hiz siniri — 429 KANIT SAYILMAZ';
          console.log(`[DOGRULAMA] kapatma sonrasi login=${V.loginAfter} (beklenen 401)`);
          const rv = run(CL09); repeatRecord = rv.record;
          V.repeatAlreadyClosed = !!(repeatRecord && repeatRecord.alreadyClosed === true
            && repeatRecord.usersDeactivated === 0 && rv.code === 0);
          console.log(`[TEKRAR] cl-09 ikinci cagri: alreadyClosed=${repeatRecord && repeatRecord.alreadyClosed}`
            + ` usersDeactivated=${repeatRecord && repeatRecord.usersDeactivated} exit=${rv.code}`);
        }
      } else if (setupOk && !API) V.why = 'CL_API_BASE_URL verilmedi';
    } else {
      console.log('\n[KAPANIS] G-0 gecilmedi — hicbir yazma yapilmadi, kapatilacak alan YOK.');
    }

    const closureOk = !!(closeRecord && closeRecord.fieldExists && closeRecord.accessClosed && closeRecord.evidencePreserved);
    const verifyOk = V.loginAfter === 401 && V.repeatAlreadyClosed === true;
    if (setupOk && !closureOk) failure = failure || 'kapanis DOGRULANAMADI (accessClosed/evidencePreserved)';
    if (setupOk && closureOk && !verifyOk) {
      failure = failure || (V.why ? `kapanis dogrulamasi OLCULEMEDI (${V.why})`
        : `kapanis dogrulamasi beklentiyi karsilamadi (login=${V.loginAfter} · tekrar=${V.repeatAlreadyClosed})`);
    }

    let isolationRecord = null;
    if (env && setupOk) {
      console.log('\n[IZOLASYON] kurulumdaki komsu tenant ozeti kapanista yeniden olculuyor (i9-03)');
      const iso = run(ISO); isolationRecord = iso.record;
      if (iso.code === 5) failure = failure || 'izolasyon FARKI: kurulum ve kapanis komsu tenant ozeti ESIT DEGIL';
      else if (iso.code !== 0) failure = failure || `izolasyon OLCULEMEDI (i9-03 exit ${iso.code})`;
    }

    const stop = measureRecord ? (measureRecord.unauthorizedStop || null) : null;
    const calls = measureRecord ? (measureRecord.unauthorizedCalls || []) : [];
    const scope = withSend ? 'TAM (A-5 · A-6 · review→promote)' : 'KISMI (yalniz review→promote + A-0i; A-5/A-6 KAPSAM DISI)';
    console.log(`\n=== OZET · runId=${RUN_ID} ===`);
    for (const s of steps) console.log(`    ${s.file.padEnd(26)} exit=${s.code}`);
    if (measureRecord) {
      console.log(`    olcumler: PASS ${measureRecord.pass} · FAIL ${measureRecord.fail} · OLCULEMEYEN ${measureRecord.unmeasured}`
        + ` · KAPSAM DISI ${measureRecord.outOfScope}`);
      console.log(`    yetkisiz denemeler: cagrilan=${calls.join(',') || '-'}${stop ? ` · DURDU: ${stop}` : ' · dur kurali tetiklenmedi'}`);
    }
    console.log(`    kapsam: ${scope}`);
    console.log(`    kapanis: ${closeRecord ? closeRecord.verdict : 'KAYIT YOK'}`);
    console.log(`    dogrulama: login=${V.loginAfter} · tekrar=${V.repeatAlreadyClosed}${V.why ? ' · ' + V.why : ''}`);
    console.log(`    izolasyon: ${isolationRecord ? isolationRecord.verdict : (setupOk ? 'KAYIT YOK' : 'kurulum yok - uygulanmaz')}`);
    console.log(`    SONUC: ${failure ? `BASARISIZ — ${failure}` : `BASARILI (kapsam: ${withSend ? 'TAM' : 'KISMI'})`}`);
    console.log('    Parola, token ve intake ham token hicbir yere yazilmadi.');
    console.log(JSON.stringify({
      record: 'CL-I11-RUN', runId: RUN_ID, environment: env ? env.environment : null,
      sessionDb: env ? !!env.sessionDb : null, ownerGoRef: env ? env.ownerGoRef : null,
      sendScopeApproved: withSend, scope,
      setupOk, closureOk, verification: V,
      measurements: measureRecord
        ? { pass: measureRecord.pass, fail: measureRecord.fail, unmeasured: measureRecord.unmeasured, outOfScope: measureRecord.outOfScope }
        : null,
      unauthorizedCalls: calls, unauthorizedStop: stop,
      findings: measureRecord ? (measureRecord.findings || []) : [],
      closeVerdict: closeRecord ? closeRecord.verdict : null,
      isolation: isolationRecord
        ? { verdict: isolationRecord.verdict, equal: isolationRecord.equal === true, delta: isolationRecord.delta || null }
        : null,
      result: failure ? 'FAIL' : 'PASS', failure,
    }, null, 1));
    process.exitCode = failure ? 1 : 0;
  }
})();
