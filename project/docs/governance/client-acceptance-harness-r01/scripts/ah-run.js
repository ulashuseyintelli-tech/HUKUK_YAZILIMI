/*
 * CLIENT KABUL ALTYAPISI (İ1a) — TEK YÜRÜTÜCÜ
 *
 * SORUMLULUKLARI
 *   1) Parolayı **bellekte** üretir ve alt süreçlere YALNIZ env ile geçirir. Çıktıya, durum
 *      dosyasına veya repoya YAZILMAZ (G-4).
 *   2) `runId`'yi adımlardan ÖNCE üretir. Kurulum herhangi bir noktada çökse bile koşum kimliği
 *      BİLİNİR; kurtarma ve erişim sonlandırma buna dayanır.
 *   3) Erişim sonlandırmayı `finally` içinde çalıştırır — **başarı ve hata yollarının ikisinde de**.
 *
 * F04 PAKETİNİN BİLİNEN KUSURU B(i) BURADA TEKRARLANMAZ
 *   `f04-run.js:82` hesap kapatmayı yalnız `0/4` çıkış kodlarına bağlar; kurulum COMMIT'ten SONRA
 *   herhangi bir nedenle exit 1 verdiğinde kapanış ATLANIR (fail-open). Bu yürütücü çıkış kodu
 *   beyaz listesi KULLANMAZ: kurulum adımı başlatıldıysa — kodu ne olursa olsun, hatta hiç
 *   dönmediyse bile — sonlandırma DENENIR. Gerekçe: yazma COMMIT edilmiş olabilir ve
 *   çıkış kodu bunu güvenilir biçimde bildirmez.
 *
 * KULLANIM
 *   AH_DATABASE_URL=... AH_API_BASE_URL=http://127.0.0.1:<port> node ah-run.js
 *   ... node ah-run.js --keep-access      # sonlandırmayı ATLA (yalnız hata ayıklama; UYARI basar)
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('./ah-lib');

const KEEP_ACCESS = process.argv.includes('--keep-access');

/** Parola yalnız bellekte üretilir; hiçbir yere yazılmaz. */
function generatePassword() {
  return `Ah!${crypto.randomBytes(18).toString('base64url')}9z`;
}

function runStep(file, env, extraArgs) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [path.join(__dirname, file), ...(extraArgs || [])], {
    cwd: process.cwd(), env, stdio: 'inherit',
  });
  return {
    file,
    // `status` null ise süreç sinyalle öldü — bu "başarılı değil" demektir, "bilinmiyor" değil.
    code: res.status === null ? null : res.status,
    signal: res.signal || null,
    elapsedMs: Date.now() - started,
    spawnError: res.error ? String(res.error.message) : null,
  };
}

(async () => {
  // G-0 yürütücü düzeyinde de çalışır: ortam belirsizse HİÇBİR adım başlatılmaz.
  const envInfo = L.assertDisposableEnvironment();

  const runId = (process.env.AH_RUN_ID || L.newRunId()).toLowerCase();
  const password = generatePassword(); // BELLEKTE
  const stateFile = process.env.AH_STATE_FILE || path.join(process.cwd(), `ah-state-${runId}.json`);
  const captureDir = process.env.AH_SMTP_CAPTURE || path.join(process.cwd(), `smtp-capture-${runId}`);

  const childEnv = {
    ...process.env,
    AH_RUN_ID: runId,
    AH_LOGIN_PASSWORD: password, // YALNIZ alt süreç ortamı
    AH_STATE_FILE: stateFile,
    AH_SMTP_CAPTURE: captureDir,
  };

  console.log('CLIENT KABUL ALTYAPISI (I1a) — KOSUM');
  console.log(`  runId      : ${runId}   (sir ICERMEZ)`);
  console.log(`  veritabani : ${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName}`);
  console.log(`  API        : ${envInfo.apiHost}:${envInfo.apiPort}`);
  console.log(`  durum      : ${stateFile}`);
  console.log('  parola     : bellekte uretildi — BASILMAZ, DOSYAYA YAZILMAZ');

  const steps = [];
  let setupAttempted = false;

  try {
    // ── Kurulum: bu satırdan sonra yazma COMMIT edilmiş OLABİLİR ──
    setupAttempted = true;
    steps.push(runStep('ah-01-setup.js', childEnv));
    if (steps[0].code !== 0) {
      throw new Error(`kurulum basarisiz (cikis ${steps[0].code}${steps[0].signal ? `/${steps[0].signal}` : ''})`);
    }
    steps.push(runStep('ah-02-roles.js', childEnv));
    steps.push(runStep('ah-03-mail.js', childEnv));
  } catch (e) {
    console.error(`\nKOSUM DURDU: ${e && e.message}`);
  } finally {
    // ── ERİŞİM SONLANDIRMA — çıkış kodundan BAĞIMSIZ (F04 kusuru B(i) tekrarlanmaz) ──
    if (!setupAttempted) {
      console.log('\n[V] kurulum hic baslatilmadi — sonlandirilacak hesap YOK');
    } else if (KEEP_ACCESS) {
      console.error('\n!!! --keep-access verildi: TEST HESAPLARI ACIK BIRAKILDI.');
      console.error(`    Sonlandirmak icin: AH_RUN_ID=${runId} node ah-04-revoke.js`);
    } else {
      // Hız sınırı penceresini boşalt: `login-rate-limit.guard.ts` IP başına 10 deneme/dakika
      // uygular (aşılırsa 5 dk blok). Ölçüm adımları ~5 login harcar, sonlandırma 6 login daha
      // ister. Pencere boşaltılmazsa V-2 429 alır; 429 KANIT SAYILMAZ (sonlandırma V-1+V-3 ile
      // yine doğrulanır, ama kanıt zayıflar). Varsayılan 61 sn = pencere (60 sn) + pay.
      const pause = Number(process.env.AH_PRE_REVOKE_PAUSE_MS ?? 61000);
      if (pause > 0) {
        console.log(`\n[V] hiz siniri penceresi bosaltiliyor (${(pause / 1000).toFixed(0)} sn)`
          + ' — V-2 kaniti 429 ile bozulmasin');
        await new Promise((r) => setTimeout(r, pause));
      }
      console.log('\n[V] erisim sonlandirma (cikis kodundan BAGIMSIZ olarak calisir)');
      steps.push(runStep('ah-04-revoke.js', childEnv));
    }
  }

  const revoke = steps.find((s) => s.file === 'ah-04-revoke.js');
  const measured = steps.filter((s) => s.file !== 'ah-04-revoke.js');
  const allMeasuredOk = measured.length === 3 && measured.every((s) => s.code === 0);
  const revokeOk = KEEP_ACCESS ? null : !!revoke && revoke.code === 0;

  console.log('\n' + '='.repeat(72));
  console.log('KOSUM OZETI');
  for (const s of steps) {
    console.log(`  ${String(s.code).padStart(4)}  ${s.file.padEnd(18)} ${(s.elapsedMs / 1000).toFixed(1)} sn`
      + (s.signal ? `  SINYAL=${s.signal}` : '') + (s.spawnError ? `  HATA=${s.spawnError}` : ''));
  }
  console.log(`  olcum adimlari : ${allMeasuredOk ? 'PASS' : 'FAIL'}`);
  console.log(`  erisim kapandi : ${revokeOk === null ? 'ATLANDI (--keep-access)' : revokeOk ? 'DOGRULANDI' : 'DOGRULANAMADI'}`);
  if (revokeOk === false) {
    console.error('  !!! Erisim sonlandirma DOGRULANAMADI — hesaplar acik KALMIS OLABILIR.');
    console.error(`      Elle: AH_RUN_ID=${runId} node ah-04-revoke.js`);
  }
  console.log(JSON.stringify({
    record: 'AH-RUN', runId,
    database: `${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName}`,
    steps: steps.map((s) => ({ file: s.file, code: s.code, signal: s.signal })),
    measurementsPassed: allMeasuredOk,
    accessRevocationVerified: revokeOk,
    secretsPrinted: false,
  }, null, 1));

  // Ölçüm VEYA sonlandırma başarısızsa koşum başarısızdır.
  process.exitCode = (allMeasuredOk && revokeOk !== false) ? 0 : 2;
})().catch((e) => {
  console.error('\nYURUTUCU HATASI:', e && e.message ? e.message : e);
  if (e && e.gate === 'G-0') console.error('  → ORTAM KAPISI: hicbir adim baslatilmadi, yazma YOK.');
  process.exitCode = 1;
});
