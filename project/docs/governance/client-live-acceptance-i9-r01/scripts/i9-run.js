/*
 * CLIENT İ9 — TEK YÜRÜTÜCÜ
 *
 * GERÇEK YÜRÜTME SIRASI:
 *   1) i9-01-setup      → 8 satır COMMIT (Tenant · User×3 · Lawyer(PARTNER) · Client×3)
 *   2) i9-02-identity    → 14 gözlem: P-0e/u/x · N-1…N-4 (#2552'nin DÖRT yolu ayrı) ·
 *                          L-1 (lifecycle ret sözleşmesi + BULGU) · P-1 (A-7 pozitif) ·
 *                          A-8a/A-8b · A0-1/2/3 (anonim yazma uçları)
 *   3) finally           → cl-09 (İ1b paketinden, KOPYA DEĞİL): isActive=false + tokenVersion++
 *   4) DOĞRULAMA         → aynı kimlikle login **401**
 *   5) TEKRAR            → cl-09 ikinci çağrı: alreadyClosed=true, exit 0
 *
 * KURALLAR:
 *   · Kapatma çıkış kodundan ve ölçüm sonucundan BAĞIMSIZ olarak HER KOŞULDA denenir (İ5b).
 *   · Kapanış doğrulanamazsa BAŞARILI verilmez.
 *   · Parola yalnız bellekte; alt sürece yalnız ortam değişkeni olarak geçer; yazılmaz.
 *   · Login bütçesi: 2 (aktörler) + 1 (doğrulama) = 3 < 10/dk (LoginRateLimitGuard).
 *     429 gelirse ilgili iddia ÖLÇÜLEMEDİ olur — 429 kanıt SAYILMAZ.
 *   · MUTATION_AUTHORITY İ8'de canlıda ölçüldü; burada TEKRARLANMAZ.
 *
 * ZORUNLU: CL_ENVIRONMENT · CL_DATABASE_URL · CL_API_BASE_URL · CL_STATE_FILE
 *          (live: CL_OWNER_GO_REF)
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');

const HERE = __dirname;
const CL09 = path.join(HERE, '../../client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js');
const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i9-state.json');
const SECRET = process.env.CL_LOGIN_PASSWORD || `I9-${crypto.randomBytes(18).toString('base64url')}!aB9`;
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
  // Makbuz ayrıştırma: alt betiklerin JSON'u çıktının SONUNDADIR (İ1b/İ8'de doğrulanmış desen).
  try { const i = out.indexOf('{'); if (i >= 0) record = JSON.parse(out.slice(i)); } catch (e) { record = null; }
  steps.push({ file: path.basename(file), code });
  return { code, record, out };
}

(async () => {
  let failure = null; let env = null; let setupOk = false; let measureRecord = null;
  const V = { loginAfter: null, repeatAlreadyClosed: null, why: null };
  try {
    env = L.assertEnvironment(); // G-0
    console.log(`\n=== CLIENT I9 KOSUMU · runId=${RUN_ID} · ortam=${env.environment}`
      + (env.ownerGoRef ? ` · ownerGoRef=${env.ownerGoRef}` : '') + ' ===');
    console.log('    (parola bellekte uretildi; hicbir ciktiya BASILMAZ)\n');

    const setup = run(path.join(HERE, 'i9-01-setup.js'));
    if (setup.code !== 0 && setup.code !== 4) failure = `kurulum basarisiz (exit ${setup.code})`;
    else setupOk = true;

    if (setupOk) {
      const m = run(path.join(HERE, 'i9-02-identity.js'));
      measureRecord = m.record;
      if (m.code === 1) failure = failure || 'kimlik olcumlerinde FAIL var';
      else if (m.code === 3) failure = failure || 'kimlik olcumlerinde OLCULEMEYEN var';
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
        try { const st = JSON.parse(require('fs').readFileSync(STATE, 'utf8')); email = st.actors.elevated.email; slug = st.slug; }
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
    console.log(`\n=== OZET · runId=${RUN_ID} ===`);
    for (const s of steps) console.log(`    ${s.file.padEnd(26)} exit=${s.code}`);
    if (measureRecord) {
      console.log(`    olcumler: PASS ${measureRecord.pass} · FAIL ${measureRecord.fail} · OLCULEMEYEN ${measureRecord.unmeasured}`);
      console.log(`    bulgular: ${(measureRecord.findings || []).length}`);
    }
    console.log(`    kapanis: ${closeRecord ? closeRecord.verdict : 'KAYIT YOK'}`);
    console.log(`    dogrulama: login=${V.loginAfter} · tekrar=${V.repeatAlreadyClosed}${V.why ? ' · ' + V.why : ''}`);
    console.log(`    SONUC: ${failure ? `BASARISIZ — ${failure}` : 'BASARILI'}`);
    console.log('    Parola ve token hicbir yere yazilmadi.');
    console.log(JSON.stringify({
      record: 'CL-I9-RUN', runId: RUN_ID, environment: env ? env.environment : null,
      ownerGoRef: env ? env.ownerGoRef : null, setupOk, closureOk, verification: V,
      measurements: measureRecord
        ? { pass: measureRecord.pass, fail: measureRecord.fail, unmeasured: measureRecord.unmeasured,
            findings: (measureRecord.findings || []).length }
        : null,
      closeVerdict: closeRecord ? closeRecord.verdict : null,
      result: failure ? 'FAIL' : 'PASS', failure,
    }, null, 1));
    process.exitCode = failure ? 1 : 0;
  }
})();
