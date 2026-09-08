/*
 * OFFICE YAZMA KABUL — TEK YURUTUCU (ONERILEN CALISTIRMA YOLU)
 *
 * NEDEN TEK YURUTUCU:
 *   (a) SIR: sentetik hesaplarin parolalari BURADA BELLEKTE uretilir ve alt sureclere yalniz
 *       ORTAM DEGISKENI olarak gecirilir. Hicbir yere yazilmaz, hicbir ciktiya BASILMAZ.
 *       (Adimlar tek tek elle kosulursa parola kaybolur — bu KUSUR DEGIL, G-4'un sonucudur.)
 *   (b) ERISIM SONLANDIRMA: `finally` blogunda calisir — kurulum veya kabul adimlari
 *       BASARISIZ OLSA BILE sentetik hesaplarin erisimi kapatilir.
 *
 * F04'UN KANITLANMIS KUSURU BURADA TEKRARLANMAZ:
 *   f04-run.js kapatmayi `setupCode === 0 || setupCode === 4` BEYAZ LISTESINE bagliyordu;
 *   kurulum COMMIT edildikten SONRA olusan herhangi bir hata (SIGKILL/timeout -> 124, ama
 *   ayni zamanda COMMIT SONRASI exit 1) "kurulum commit edilmedi" sayilip hesabi ACIK
 *   birakiyordu (fail-open). BURADA CIKIS KODU BEYAZ LISTESI YOKTUR: kapatma karari
 *   YALNIZ "tenant GERCEKTEN var mi" olcumune dayanir.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('./ow-lib');

const HERE = __dirname;
const STATE = process.env.OW_STATE_FILE || path.join(process.cwd(), 'ow-state.json');
const RUN_ID = (process.env.OW_RUN_ID || L.newRunId()).toLowerCase();

// Parolalar BELLEKTE uretilir; log'a, dosyaya veya rapora ASLA yazilmaz.
const ADMIN_PW = process.env.OW_LOGIN_PASSWORD || `OW-${crypto.randomBytes(18).toString('base64url')}!aB9`;
const STAFF_PW = process.env.OW_STAFF_PASSWORD || `OW-${crypto.randomBytes(18).toString('base64url')}!cD7`;

const steps = [];
function run(script, extraEnv = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, script)], {
    env: {
      ...process.env,
      OW_STATE_FILE: STATE,
      OW_RUN_ID: RUN_ID,
      OW_LOGIN_PASSWORD: ADMIN_PW, // yalniz alt surecin ortaminda
      OW_STAFF_PASSWORD: STAFF_PW,
      ...extraEnv,
    },
    encoding: 'utf8', stdio: 'inherit', timeout: 600000,
  });
  const code = r.status === null ? 124 : r.status;
  steps.push({ script, code });
  return code;
}

/**
 * Kapatilacak bir sey VAR MI? Cikis koduna DEGIL, veritabanindaki gercege bakar.
 * Tenant varsa kapanis DENENIR — kurulum hangi kodla cikmis olursa olsun.
 */
async function tenantExists() {
  const prisma = L.loadPrisma();
  try {
    const t = await prisma.tenant.findFirst({
      where: { slug: `${L.TENANT_PREFIX}${RUN_ID}` }, select: { id: true },
    });
    return !!t;
  } catch (e) {
    // Olcum yapilamadi → "yok" SAYILMAZ; kapanis yine DENENIR (fail-closed).
    console.error(`  [KAPANIS] tenant varligi OLCULEMEDI (${e && e.message}) — kapanis YINE denenecek`);
    return true;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

// Kabul adimlari: dosya YOKSA atlanir ve raporda ATLANDI olarak gorunur.
const ACCEPTANCE_STEPS = [
  'ow-03-settings.js',
  'ow-04-writes.js',
  'ow-05-staff-read.js',
  'ow-06-reporting.js',
  'ow-07-approval.js',
  'ow-90-negative.js',
];

(async () => {
  let failure = null;
  const skipped = [];

  try {
    console.log(`\n=== OFFICE YAZMA KABUL PROVASI · runId=${RUN_ID} ===`);
    console.log('    (parolalar bellekte uretildi; hicbir ciktiya BASILMAZ)\n');

    const setupCode = run('ow-01-setup.js');
    if (setupCode !== 0) {
      // Kurulum atomiktir; ama COMMIT SONRASI hata da bu dala duser.
      // Kapatma karari asagida DB olcumuyle verilir — burada beyaz liste YOK.
      failure = `kurulum basarisiz (exit ${setupCode})`;
      throw new Error(failure);
    }

    // ── OTURUM BIR KEZ ACILIR ──
    // OLCULEN KISIT: `LoginRateLimitGuard` tekrarli girisleri 429 ile reddeder. Her adim
    // kendi login'ini yaparsa tam kosum limiti asar ve adimlar OLCULEMEDEN duser (provada
    // gercekten oldu: A-03/A-04 "login basarisiz HTTP 429"). Token'lar alt sureclere ORTAM
    // DEGISKENI ile gecer — parolayla ayni muamele; durum dosyasina YAZILMAZ (G-4).
    let tokenEnv = {};
    try {
      const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
      const st = L.loadState();
      // Parolalar bu surecte BELLEKTE uretildi; `resolveTokens` onlari `process.env`'den okur.
      // Ilk surumde bu atama YOKTU: merkezi login "OW_LOGIN_PASSWORD tanimli degil" ile
      // dusuyor ve her adim yine kendi login'ini yapiyordu — yani rate-limit onlemi ATIL
      // kaliyordu (kosum ciktisinda gorundu ve boyle yakalandi).
      process.env.OW_LOGIN_PASSWORD = ADMIN_PW;
      process.env.OW_STAFF_PASSWORD = STAFF_PW;
      const t = await L.resolveTokens(base, st);
      tokenEnv = { OW_ADMIN_TOKEN: t.admin, OW_STAFF_TOKEN: t.staff };
      console.log('\n[OTURUM] admin + personel token BIR KEZ alindi (429 rate-limit kacinmasi)');
    } catch (e) {
      // Oturum acilamadiysa adimlar kendi login'lerini deneyecek; sessizce PASS'e donmez.
      console.error(`\n[OTURUM] merkezi login YAPILAMADI (${e && e.message}) — adimlar kendi login'ini deneyecek`);
    }

    for (const s of ACCEPTANCE_STEPS) {
      if (!fs.existsSync(path.join(HERE, s))) { skipped.push(s); continue; }
      const c = run(s, tokenEnv);
      if (c !== 0) failure = failure || `${s} basarisiz (exit ${c})`;
    }
  } catch (e) {
    failure = failure || (e && e.message) || String(e);
    console.error('\nKOSUM HATASI:', failure);
  } finally {
    // ── ERISIM SONLANDIRMA — CIKIS KODUNA DEGIL, GERCEGE BAKAR ──
    const exists = await tenantExists();
    if (exists) {
      console.log('\n[KAPANIS] sentetik hesaplarin erisimi sonlandiriliyor (kanit KORUNUR)');
      if (!fs.existsSync(STATE)) {
        console.log('  durum dosyasi yok — runId ile kurtarma deneniyor');
        if (fs.existsSync(path.join(HERE, 'ow-00-recover.js'))) run('ow-00-recover.js');
      }
      if (fs.existsSync(STATE)) {
        const rv = run('ow-99-teardown.js', { OW_TEARDOWN_MODE: process.env.OW_TEARDOWN_MODE || 'revoke-access' });
        if (rv !== 0) {
          console.error('  !!! KAPANIS DOGRULANAMADI — teardown ciktisindaki verdict incelenmelidir.');
          failure = failure || `kapanis dogrulanamadi (exit ${rv})`;
        }
      } else {
        console.error('  !!! DURUM KURTARILAMADI — hesaplar kapatilamadi.');
        console.error(`      Elle kapatma: OW_RUN_ID=${RUN_ID} node ow-00-recover.js && node ow-99-teardown.js`);
        failure = failure || 'durum kurtarilamadi, hesaplar KAPATILAMADI';
      }
    } else {
      console.log('\n[KAPANIS] sentetik tenant YOK (kurulum commit edilmedi) — kapatilacak hesap yok.');
    }

    console.log(`\n=== PROVA OZETI · runId=${RUN_ID} ===`);
    for (const s of steps) console.log(`    ${s.script.padEnd(24)} exit=${s.code}`);
    if (skipped.length) console.log(`    ATLANDI (dosya yok): ${skipped.join(', ')}`);
    console.log(`    PROVA SONUC: ${failure ? `FAIL — ${failure}` : 'PASS'}`);
    console.log('    Parolalar hicbir yere yazilmadi.');
    process.exitCode = failure ? 1 : 0;
  }
})();
