/*
 * F04 CANLI KABUL — TEK YURUTUCU (ONERILEN CALISTIRMA YOLU)
 *
 * Neden tek yurutucu:
 *   (a) **SIR:** sentetik hesabin parolasi burada BELLEKTE uretilir ve alt sureclere yalniz
 *       ORTAM DEGISKENI olarak gecirilir. Hicbir yere yazilmaz, hicbir ciktiya BASILMAZ.
 *   (b) **ERISIM SONLANDIRMA:** `finally` blogunda calisir — kurulum, A2 veya dogrulama
 *       BASARISIZ OLSA BILE sentetik hesabin erisimi kapatilir.
 *   (c) **KURTARMA:** kurulum COMMIT edilip durum dosyasi yazilamazsa (setup exit 4),
 *       `runId` uzerinden durum kurtarilir ve akis devam eder; hesap yine kapatilir.
 *
 * KAPSAM: yalniz "posting kilit beklemesi ve finansal sonuc". `purge` ve `reverse`
 * CALISTIRILMAZ (canli kapsam disi). Urun kodu, yayin ve diger tenant'lar KAPSAM DISI.
 *
 * ZORUNLU: F04_DATABASE_URL · F04_API_BASE_URL · F04_STATE_FILE
 * ISTEGE BAGLI: F04_LOCK_BUDGET_MS (varsayilan 3500, tavan 4000) · F04_RUN_ID
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('./f04-lib');

const HERE = __dirname;
const STATE = process.env.F04_STATE_FILE || path.join(process.cwd(), 'f04-state.json');

// Parola BELLEKTE uretilir; log'a, dosyaya veya rapora ASLA yazilmaz.
const SECRET = process.env.F04_LOGIN_PASSWORD
  || `F04-${crypto.randomBytes(18).toString('base64url')}!aB9`;
const RUN_ID = (process.env.F04_RUN_ID || crypto.randomBytes(4).toString('hex')).toLowerCase();

const steps = [];
function run(script, extraEnv = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, script)], {
    env: {
      ...process.env,
      F04_STATE_FILE: STATE,
      F04_LOGIN_PASSWORD: SECRET, // yalniz alt surecin ortaminda
      ...extraEnv,
    },
    encoding: 'utf8', stdio: 'inherit', timeout: 300000,
  });
  const code = r.status === null ? 124 : r.status;
  steps.push({ script, code });
  return code;
}

(async () => {
  let setupCode = null;
  let failure = null;

  try {
    console.log(`\n=== F04 KABUL KOSUMU · runId=${RUN_ID} ===`);
    console.log('    (parola bellekte uretildi; hicbir ciktiya BASILMAZ)\n');

    // ── 1) KURULUM ──
    setupCode = run('f04-01-setup.js', { F04_RUN_ID: RUN_ID });
    if (setupCode === 4) {
      // COMMIT edildi ama durum dosyasi yazilamadi → runId ile kurtar.
      console.log('\n[KURTARMA] kurulum commit edildi, durum dosyasi yazilamadi — runId ile kurtariliyor');
      const rc = run('f04-00-recover-state.js', { F04_RUN_ID: RUN_ID });
      if (rc !== 0) throw new Error('durum kurtarilamadi — hesap kapatma yine de DENENECEK');
    } else if (setupCode !== 0) {
      throw new Error(`kurulum basarisiz (exit ${setupCode}) — atomik oldugu icin kayit KALMAZ`);
    }

    // ── 2) A2 ──
    const a2 = run('f04-02-a2-race.js');
    if (a2 !== 0) failure = failure || `A2 basarisiz (exit ${a2})`;

    // ── 3) BAGIMSIZ DOGRULAMA ──
    const vf = run('f04-03-verify.js');
    if (vf !== 0) failure = failure || `dogrulama basarisiz (exit ${vf})`;
  } catch (e) {
    failure = failure || (e && e.message) || String(e);
    console.error('\nKOSUM HATASI:', failure);
  } finally {
    // ── 4) ERISIM SONLANDIRMA — BASARISIZLIKTA DA CALISIR ──
    // Kurulum hic commit edilmediyse kapatilacak hesap da yoktur.
    const stateExists = fs.existsSync(STATE);
    if (setupCode === 0 || setupCode === 4) {
      if (!stateExists) {
        console.log('\n[KAPANIS] durum dosyasi yok — runId ile son bir kurtarma deneniyor');
        run('f04-00-recover-state.js', { F04_RUN_ID: RUN_ID });
      }
      if (fs.existsSync(STATE)) {
        console.log('\n[KAPANIS] sentetik hesabin erisimi sonlandiriliyor (finansal/audit kanit KORUNUR)');
        const rv = run('f04-04-teardown.js', { F04_TEARDOWN_MODE: 'revoke-access' });
        if (rv !== 0) {
          console.error('  !!! ERISIM KAPANISI EKSIK — teardown ciktisindaki verdict incelenmelidir.');
          failure = failure || `erisim kapanisi eksik (exit ${rv})`;
        }
      } else {
        console.error('  !!! DURUM KURTARILAMADI — hesap kapatilamadi.');
        console.error(`      Elle kapatma: F04_RUN_ID=${RUN_ID} node f04-00-recover-state.js`);
        console.error('                    F04_TEARDOWN_MODE=revoke-access node f04-04-teardown.js');
        failure = failure || 'durum kurtarilamadi, hesap KAPATILAMADI';
      }
    } else {
      console.log('\n[KAPANIS] kurulum commit edilmedi — kapatilacak hesap YOK.');
    }

    console.log(`\n=== KOSUM OZETI · runId=${RUN_ID} ===`);
    for (const s of steps) console.log(`    ${s.script.padEnd(28)} exit=${s.code}`);
    console.log(`    SONUC: ${failure ? `BASARISIZ — ${failure}` : 'BASARILI'}`);
    console.log('    Parola hicbir yere yazilmadi.');
    process.exitCode = failure ? 1 : 0;
  }
})();
