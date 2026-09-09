/*
 * CLIENT İ1b — TEK YÜRÜTÜCÜ
 *
 *   (a) SIR: parola bellekte üretilir, alt sürece yalnız ORTAM DEĞİŞKENİ olarak geçer; yazılmaz.
 *   (b) ERİŞİM SONLANDIRMA çıkış koduna BAĞLI DEĞİLDİR (İ5b): `finally`de alan, yazmadan önce
 *       üretilen runId ile ARANIR; bulunursa kapatılır, bulunmazsa bu ÖLÇÜLEREK raporlanır.
 *   (c) Süreç zorla sonlanırsa `finally` çalışmaz → `CL_RUN_ID=<runId> node cl-09-close-access.js`
 *       aynı alanı bulup kapatır (tekrarı güvenli).
 *
 * GERÇEK YÜRÜTME SIRASI (kaynak: auth.service.ts login :121-126 · validateUser :170-186):
 *   1) cl-01-setup  → 6 satır COMMIT
 *   2) DOĞRULAMA-A  → aktif hesapla login → **201** + GET /auth/me → **200**  (alan çalışıyor)
 *   3) finally      → cl-09: User.isActive=false + tokenVersion++ ; Case.status=CLOSED
 *   4) DOĞRULAMA-B  → aynı kimlikle login → **401** ; eski JWT ile /auth/me → **401**
 *   5) TEKRAR       → cl-09 ikinci çağrı → alreadyClosed=true, exit 0 (tekrarı güvenli)
 * Doğrulama ölçülemezse (API yok/belirsiz) KAPATMA YİNE DENENİR; sonuç "ÖLÇÜLEMEDİ" olur ve
 * BAŞARILI verilmez. Parola yalnız bellekte; login in-process, hiçbir çıktıya yazılmaz.
 *
 * ZORUNLU: CL_ENVIRONMENT · CL_DATABASE_URL · (live: CL_OWNER_GO_REF) · CL_STATE_FILE
 *          CL_API_BASE_URL (loopback; doğrulama için — yoksa 2/4/5 ÖLÇÜLEMEDİ, kapatma yine yapılır)
 * İSTEĞE BAĞLI: CL_RUN_ID · CL_KEEP_OPEN=1 (kapatmayı ATLAR — yalnız İ8 kabul koşumu için,
 *   owner GO'sunda açıkça yazılıysa; varsayılan KAPATIR)
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('./cl-lib');

const fs = require('fs');
const HERE = __dirname;
const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'cl-state.json');
const API = (process.env.CL_API_BASE_URL || '').replace(/\/+$/, '');
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const SECRET = process.env.CL_LOGIN_PASSWORD || `CL-${crypto.randomBytes(18).toString('base64url')}!aB9`;
const RUN_ID = (process.env.CL_RUN_ID || crypto.randomBytes(4).toString('hex')).toLowerCase();

const steps = [];
function run(script, extraEnv = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, script)], {
    env: { ...process.env, CL_STATE_FILE: STATE, CL_LOGIN_PASSWORD: SECRET, CL_RUN_ID: RUN_ID, ...extraEnv },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const code = r.status === null ? 124 : r.status;
  let record = null;
  try { const i = out.indexOf('{'); if (i >= 0) record = JSON.parse(out.slice(i)); } catch (e) { record = null; }
  steps.push({ script, code });
  return { code, record };
}
function apiUsable() {
  if (!API) return { ok: false, why: 'CL_API_BASE_URL verilmedi' };
  try { const u = new URL(API); if (!LOOPBACK.has(u.hostname)) return { ok: false, why: `API host '${u.hostname}' loopback DEGIL` }; }
  catch (e) { return { ok: false, why: 'CL_API_BASE_URL cozumlenemedi' }; }
  return { ok: true };
}

(async () => {
  let failure = null;
  let env = null;
  let setupOk = false;
  // Dogrulama olcumleri — hicbiri parola/token ICERMEZ (token bellekte 'jwt' degiskeninde kalir).
  const V = { measured: false, why: null, loginBefore: null, meBefore: null, loginAfter: null, meAfter: null, repeatAlreadyClosed: null };
  let jwt = null; let email = null; let slug = null;
  try {
    env = L.assertEnvironment(); // G-0 — alt süreçler de ayrıca kontrol eder
    console.log(`\n=== CLIENT I1b KOSUMU · runId=${RUN_ID} · ortam=${env.environment}`
      + (env.ownerGoRef ? ` · ownerGoRef=${env.ownerGoRef}` : '') + ' ===');
    console.log('    (parola bellekte uretildi; hicbir ciktiya BASILMAZ)\n');
    const setup = run('cl-01-setup.js');
    if (setup.code !== 0 && setup.code !== 4) failure = `kurulum basarisiz (exit ${setup.code})`;
    else setupOk = true;

    // ── DOĞRULAMA-A: aktif hesapla login 201 + /auth/me 200 ──
    if (setupOk) {
      try { const st = JSON.parse(fs.readFileSync(STATE, 'utf8')); email = st.userEmail; slug = st.slug; } catch (e) { /* exit 4 halinde dosya yok */ }
      const a = apiUsable();
      if (!a.ok || !email || !slug) { V.why = !a.ok ? a.why : 'durum dosyasi okunamadi (kimlik yok)'; }
      else {
        const lg = await L.login(API, email, SECRET, slug);
        V.loginBefore = lg.indeterminate ? `BELIRSIZ(${lg.reason})` : lg.status;
        jwt = lg.token;
        const m = jwt ? await L.me(API, jwt) : { status: null, indeterminate: true, reason: 'token yok' };
        V.meBefore = m.indeterminate ? `BELIRSIZ(${m.reason})` : m.status;
        V.measured = !lg.indeterminate && !m.indeterminate;
        console.log(`[DOGRULAMA-A] login=${V.loginBefore} (beklenen 201) · /auth/me=${V.meBefore} (beklenen 200)`);
      }
    }
  } catch (e) {
    failure = failure || (e && e.message) || String(e);
    console.error('\nKOSUM HATASI:', failure);
  } finally {
    let closeRecord = null; let repeatRecord = null;
    if (process.env.CL_KEEP_OPEN === '1' && env && env.ownerGoRef) {
      console.log(`\n[KAPANIS] CL_KEEP_OPEN=1 — alan ACIK BIRAKILDI (owner GO ${env.ownerGoRef} kapsaminda). Kapatma: CL_RUN_ID=${RUN_ID} node cl-09-close-access.js`);
    } else if (env) {
      // Kapatma, dogrulama basarisiz/olculemez olsa da HER KOSULDA denenir.
      console.log(`\n[KAPANIS] alan runId=${RUN_ID} ile araniyor (cikis kodu ve dogrulama sonucu DIKKATE ALINMAZ)`);
      const cv = run('cl-09-close-access.js'); closeRecord = cv.record;
      if (cv.code !== 0) {
        console.error('  !!! ERISIM KAPANISI EKSIK — cl-09 ciktisindaki verdict incelenmelidir.');
        console.error(`      Tekrar (guvenli): CL_RUN_ID=${RUN_ID} node cl-09-close-access.js`);
        failure = failure || `erisim kapanisi eksik (cl-09 exit ${cv.code})`;
      }
      // ── DOĞRULAMA-B: ayni kimlikle login 401 + eski JWT ile /auth/me 401 ──
      if (setupOk && closeRecord && closeRecord.fieldExists && apiUsable().ok && email && slug) {
        const lg2 = await L.login(API, email, SECRET, slug);
        V.loginAfter = lg2.indeterminate ? `BELIRSIZ(${lg2.reason})` : lg2.status;
        const m2 = jwt ? await L.me(API, jwt) : { status: null, indeterminate: true, reason: 'onceki token yok' };
        V.meAfter = m2.indeterminate ? `BELIRSIZ(${m2.reason})` : m2.status;
        console.log(`[DOGRULAMA-B] login=${V.loginAfter} (beklenen 401) · eski JWT /auth/me=${V.meAfter} (beklenen 401)`);
        // ── TEKRAR: kapaticinin ikinci cagrisi guvenli mi ──
        const rv = run('cl-09-close-access.js'); repeatRecord = rv.record;
        V.repeatAlreadyClosed = !!(repeatRecord && repeatRecord.alreadyClosed === true && repeatRecord.usersDeactivated === 0 && rv.code === 0);
        console.log(`[TEKRAR] cl-09 ikinci cagri: alreadyClosed=${repeatRecord && repeatRecord.alreadyClosed} usersDeactivated=${repeatRecord && repeatRecord.usersDeactivated} exit=${rv.code}`);
      }
    } else {
      console.log('\n[KAPANIS] G-0 gecilmedi — hicbir yazma yapilmadi, kapatilacak alan YOK (olculmedi, cunku ortam belirsizdi).');
    }
    jwt = null; // bellekten dus

    // ── SONUC: kapanis dogrulanmadan ve dogrulama olculmeden BASARILI VERILMEZ ──
    const closureOk = !!(closeRecord && closeRecord.fieldExists && closeRecord.accessClosed && closeRecord.evidencePreserved && closeRecord.caseCronExposureClosed);
    const verifyOk = V.loginBefore === 201 && V.meBefore === 200 && V.loginAfter === 401 && V.meAfter === 401 && V.repeatAlreadyClosed === true;
    if (setupOk && !closureOk) failure = failure || 'kapanis DOGRULANAMADI (accessClosed/evidencePreserved/caseCronExposureClosed)';
    if (setupOk && closureOk && !verifyOk) failure = failure || (V.why ? `dogrulama OLCULEMEDI (${V.why})` : `dogrulama beklentiyi karsilamadi (A: ${V.loginBefore}/${V.meBefore} · B: ${V.loginAfter}/${V.meAfter} · tekrar: ${V.repeatAlreadyClosed})`);
    console.log(`\n=== OZET · runId=${RUN_ID} ===`);
    for (const s of steps) console.log(`    ${s.script.padEnd(24)} exit=${s.code}`);
    console.log(`    kapanis: ${closeRecord ? closeRecord.verdict : 'KAYIT YOK'}`);
    console.log(`    dogrulama: A login=${V.loginBefore} me=${V.meBefore} · B login=${V.loginAfter} me=${V.meAfter} · tekrar=${V.repeatAlreadyClosed}${V.why ? ' · ' + V.why : ''}`);
    console.log(`    SONUC: ${failure ? `BASARISIZ — ${failure}` : 'BASARILI'}`);
    console.log('    Parola ve token hicbir yere yazilmadi.');
    console.log(JSON.stringify({ record: 'CL-I1B-RUN', runId: RUN_ID, environment: env ? env.environment : null, ownerGoRef: env ? env.ownerGoRef : null,
      setupOk, closureOk, verification: V, closeVerdict: closeRecord ? closeRecord.verdict : null, result: failure ? 'FAIL' : 'PASS', failure }, null, 1));
    process.exitCode = failure ? 1 : 0;
  }
})();
