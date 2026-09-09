/*
 * CLIENT İ1b — TEK YÜRÜTÜCÜ
 *
 *   (a) SIR: parola bellekte üretilir, alt sürece yalnız ORTAM DEĞİŞKENİ olarak geçer; yazılmaz.
 *   (b) ERİŞİM SONLANDIRMA çıkış koduna BAĞLI DEĞİLDİR (İ5b): `finally`de alan, yazmadan önce
 *       üretilen runId ile ARANIR; bulunursa kapatılır, bulunmazsa bu ÖLÇÜLEREK raporlanır.
 *   (c) Süreç zorla sonlanırsa `finally` çalışmaz → `CL_RUN_ID=<runId> node cl-09-close-access.js`
 *       aynı alanı bulup kapatır (tekrarı güvenli).
 *
 * ZORUNLU: CL_ENVIRONMENT · CL_DATABASE_URL · (live: CL_OWNER_GO_REF) · CL_STATE_FILE
 * İSTEĞE BAĞLI: CL_RUN_ID · CL_KEEP_OPEN=1 (kapatmayı ATLAR — yalnız İ8 kabul koşumu için,
 *   owner GO'sunda açıkça yazılıysa; varsayılan KAPATIR)
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('./cl-lib');

const HERE = __dirname;
const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'cl-state.json');
const SECRET = process.env.CL_LOGIN_PASSWORD || `CL-${crypto.randomBytes(18).toString('base64url')}!aB9`;
const RUN_ID = (process.env.CL_RUN_ID || crypto.randomBytes(4).toString('hex')).toLowerCase();

const steps = [];
function run(script, extraEnv = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, script)], {
    env: { ...process.env, CL_STATE_FILE: STATE, CL_LOGIN_PASSWORD: SECRET, CL_RUN_ID: RUN_ID, ...extraEnv },
    encoding: 'utf8', stdio: 'inherit', timeout: 300000,
  });
  const code = r.status === null ? 124 : r.status;
  steps.push({ script, code });
  return code;
}

(async () => {
  let failure = null;
  let env = null;
  try {
    env = L.assertEnvironment(); // G-0 — alt süreçler de ayrıca kontrol eder
    console.log(`\n=== CLIENT I1b KOSUMU · runId=${RUN_ID} · ortam=${env.environment}`
      + (env.ownerGoRef ? ` · ownerGoRef=${env.ownerGoRef}` : '') + ' ===');
    console.log('    (parola bellekte uretildi; hicbir ciktiya BASILMAZ)\n');
    const setupCode = run('cl-01-setup.js');
    if (setupCode !== 0 && setupCode !== 4) failure = `kurulum basarisiz (exit ${setupCode})`;
  } catch (e) {
    failure = failure || (e && e.message) || String(e);
    console.error('\nKOSUM HATASI:', failure);
  } finally {
    if (process.env.CL_KEEP_OPEN === '1' && env && env.ownerGoRef) {
      console.log(`\n[KAPANIS] CL_KEEP_OPEN=1 — alan ACIK BIRAKILDI (owner GO ${env.ownerGoRef} kapsaminda). Kapatma: CL_RUN_ID=${RUN_ID} node cl-09-close-access.js`);
    } else if (env) {
      console.log(`\n[KAPANIS] alan runId=${RUN_ID} ile araniyor (cikis kodu DIKKATE ALINMAZ)`);
      const cv = run('cl-09-close-access.js');
      if (cv !== 0) {
        console.error('  !!! ERISIM KAPANISI EKSIK — cl-09 ciktisindaki verdict incelenmelidir.');
        console.error(`      Tekrar (guvenli): CL_RUN_ID=${RUN_ID} node cl-09-close-access.js`);
        failure = failure || `erisim kapanisi eksik (cl-09 exit ${cv})`;
      }
    } else {
      console.log('\n[KAPANIS] G-0 gecilmedi — hicbir yazma yapilmadi, kapatilacak alan YOK (olculmedi, cunku ortam belirsizdi).');
    }
    console.log(`\n=== OZET · runId=${RUN_ID} ===`);
    for (const s of steps) console.log(`    ${s.script.padEnd(24)} exit=${s.code}`);
    console.log(`    SONUC: ${failure ? `BASARISIZ — ${failure}` : 'BASARILI'}`);
    console.log('    Parola hicbir yere yazilmadi.');
    process.exitCode = failure ? 1 : 0;
  }
})();
