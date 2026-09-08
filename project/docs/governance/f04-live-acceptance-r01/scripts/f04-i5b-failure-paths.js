/*
 * F04 / İ5b — HATA YOLU PROVALARI (YALNIZ DISPOSABLE)
 *
 * Kapatilan kusur (paket §11 Kusur B): yurutucu erisimi yalniz `setupCode 0|4` iken kapatiyordu.
 * Commit SONRASI olusan her hata (EXPECTED throw → exit 1, spawnSync timeout/SIGKILL → 124)
 * "kurulum commit edilmedi" sayiliyor ve sentetik hesap ACIK kaliyordu.
 *
 * BU DUZENEK NE OLCER — her senaryoda ayni zincir:
 *   hata yolu → olusan alan (runId ile ARANIR) → erisim sonlandirma/kurtarma → DOGRULANAN sonuc
 *
 * SENARYOLAR
 *   H-1  commit ONCESI hata      → alan OLUSMAZ; kapatici "alan yok" der (OLCEREK), yazma 0
 *   H-2  commit SONRASI hata     → setup exit 1; YURUTUCU yine de kapatir
 *   H-3  commit SONRASI oldurme  → setup SIGKILL; YURUTUCU yine de kapatir
 *   H-3b finally HIC CALISMAZ    → setup DOGRUDAN oldurulur; erisim ACIK olcuulur,
 *                                  sonra `f04-09-close-access.js` ayni alani bulup KAPATIR
 *   H-4  tekrar guvenligi        → kapatici ikinci kez; kapali durum BOZULMAZ, exit 0
 *
 * ERISIM OLCUMU IKI KATMAN — biri digerinin yerine GECMEZ:
 *   (a) DB: `User.isActive` ve `tokenVersion` (bu kosumun kullanicisi icin ONCE/SONRA)
 *   (b) HTTP: ayni kimlik bilgisiyle oturum acma. 200→401 GECISI olculur. Tek basina bir 401
 *       "erisim kapandi" KANITI DEGILDIR (yanlis parola da 401 verir) — bu yuzden ONCE 200
 *       gorulmus olmasi SARTTIR. HTTP olculemezse ILGILI IDDIA "OLCULEMEDI" olur, PASS olmaz.
 *
 * ZORUNLU: F04_DATABASE_URL · F04_ENVIRONMENT=disposable
 * ISTEGE BAGLI: F04_API_BASE_URL (verilmezse HTTP katmani OLCULEMEDI olur)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const L = require('./f04-lib');

const HERE = __dirname;
const WORK = process.env.F04_I5B_WORK || process.cwd();
const API = (process.env.F04_API_BASE_URL || '').replace(/\/+$/, '');
// Parola BELLEKTE uretilir; ciktiya, durum dosyasina veya repoya YAZILMAZ.
const SECRET = `I5B-${crypto.randomBytes(18).toString('base64url')}!aB9`;

const R = [];
const add = (id, title, verdict, detail) => {
  R.push({ id, verdict, title, detail });
  const tag = verdict === 'PASS' ? 'OK  ' : verdict === 'FAIL' ? 'FAIL' : '????';
  console.log(`  ${tag} ${id.padEnd(5)} ${title}\n         ${detail}`);
};
const pass = (id, t, ok, d) => add(id, t, ok ? 'PASS' : 'FAIL', d);
const unmeasured = (id, t, d) => add(id, t, 'UNMEASURED', d);

function runScript(script, env, cwd) {
  const r = spawnSync(process.execPath, [path.join(HERE, script)], {
    env: { ...process.env, F04_LOGIN_PASSWORD: SECRET, ...env },
    encoding: 'utf8', stdio: 'pipe', timeout: 300000, cwd: cwd || WORK,
  });
  return {
    code: r.status === null ? 124 : r.status,
    signal: r.signal || null,
    out: (r.stdout || '') + (r.stderr || ''),
  };
}

/** HTTP oturum acma denemesi. Olculemezse {measured:false}. */
async function tryLogin(email, tenantSlug) {
  if (!API) return { measured: false, why: 'F04_API_BASE_URL verilmedi' };
  if (!email || !tenantSlug) return { measured: false, why: 'email/tenantSlug yok' };
  try {
    // `tenantSlug` bu ucta ZORUNLUDUR; eksik gonderilirse 4xx doner ve olcum
    // "erisim kapali" ile KARISIR. Bu yuzden alanin kendi slug'i verilir.
    const res = await L.httpJson('POST', `${API}/auth/login`, {
      body: { email, password: SECRET, tenantSlug },
    });
    if (res && res.indeterminate) return { measured: false, why: res.indeterminateReason || 'belirsiz' };
    return { measured: true, status: res.status };
  } catch (e) {
    return { measured: false, why: (e && e.message) || String(e) };
  }
}

const newRunId = () => crypto.randomBytes(4).toString('hex');
const stateFor = (runId) => path.join(WORK, `f04-state-${runId}.json`);

(async () => {
  if ((process.env.F04_ENVIRONMENT || '').toLowerCase() !== 'disposable') {
    throw new Error('F04_ENVIRONMENT=disposable ZORUNLU — bu duzenek yalniz disposable ortamda kosar');
  }
  const prisma = L.loadPrisma();
  const created = [];

  console.log('\nF04 / I5b — HATA YOLU PROVALARI (disposable)');
  console.log(`  API: ${API || 'YOK (HTTP katmani OLCULEMEDI olacak)'}`);
  console.log('  parola bellekte uretildi — BASILMAZ, DOSYAYA YAZILMAZ\n');

  try {
    // ══════════ H-1 · COMMIT ONCESI HATA → ALAN OLUSMAZ ══════════
    {
      const runId = newRunId();
      const setup = runScript('f04-01-setup.js', {
        F04_RUN_ID: runId, F04_STATE_FILE: stateFor(runId), F04_ABORT_AFTER: 'CaseClient',
      });
      const field = await L.findAcceptanceField(prisma, runId);
      const close = runScript('f04-09-close-access.js', { F04_RUN_ID: runId });
      let rec = null;
      try { rec = JSON.parse(close.out.slice(close.out.indexOf('{'))); } catch (e) { rec = null; }

      pass('H-1', 'commit ONCESI hata: alan OLUSMAZ; kapatici "alan yok" der (olcerek), yazma 0',
        setup.code !== 0 && field.exists === false
        && !!rec && rec.fieldExists === false && rec.writeOperations === 0 && close.code === 0,
        `setup exit=${setup.code} · tenant '${L.TENANT_PREFIX}${runId}' VAR MI=${field.exists}`
        + ` · kapatici exit=${close.code} fieldExists=${rec ? rec.fieldExists : 'OKUNAMADI'}`
        + ` yazma=${rec ? rec.writeOperations : '?'} · verdict=${rec ? rec.verdict : '-'}`);
    }

    // ══════════ H-2 · COMMIT SONRASI HATA → YURUTUCU YINE DE KAPATIR ══════════
    {
      const runId = newRunId(); created.push(runId);
      const run = runScript('f04-run.js', {
        F04_RUN_ID: runId, F04_STATE_FILE: stateFor(runId), F04_FAIL_AFTER_COMMIT: '1',
      });
      const setupExit = (run.out.match(/f04-01-setup\.js\s+exit=(\d+)/) || [])[1] || '?';
      const field = await L.findAcceptanceField(prisma, runId);
      const closedOk = field.exists && field.activeUsers === 0
        && field.users.length > 0 && field.users.every((u) => !u.isActive);

      pass('H-2', 'commit SONRASI hata (exit 1): alan OLUSTU ve YURUTUCU erisimi KAPATTI',
        field.exists === true && closedOk,
        `setup exit=${setupExit} (0/4 DEGIL) · alan VAR=${field.exists}`
        + ` · kullanici ${field.exists ? field.users.length : 0} · aktif=${field.exists ? field.activeUsers : '-'}`
        + ` · yurutucu ciktisinda kapanis=${/F04-ACCESS-CLOSE/.test(run.out) ? 'CAGRILDI' : 'CAGRILMADI'}`);
    }

    // ══════════ H-3 · COMMIT SONRASI OLDURME → YURUTUCU YINE DE KAPATIR ══════════
    {
      const runId = newRunId(); created.push(runId);
      const run = runScript('f04-run.js', {
        F04_RUN_ID: runId, F04_STATE_FILE: stateFor(runId), F04_KILL_AFTER_COMMIT: '1',
      });
      const setupExit = (run.out.match(/f04-01-setup\.js\s+exit=(\d+)/) || [])[1] || '?';
      const field = await L.findAcceptanceField(prisma, runId);
      const closedOk = field.exists && field.activeUsers === 0
        && field.users.length > 0 && field.users.every((u) => !u.isActive);
      const stateWritten = fs.existsSync(stateFor(runId));

      pass('H-3', 'commit SONRASI SIGKILL: durum dosyasi YOK ama YURUTUCU erisimi KAPATTI',
        field.exists === true && closedOk,
        `setup exit=${setupExit} · durum dosyasi yazildi mi=${stateWritten} (kapanisin ON KOSULU DEGIL)`
        + ` · alan VAR=${field.exists} · aktif kullanici=${field.exists ? field.activeUsers : '-'}`);
    }

    // ══════════ H-3b · finally HIC CALISMAZ → SONRAKI KURTARMA KAPATIR ══════════
    {
      const runId = newRunId(); created.push(runId);
      // Yurutucu DEVREDE DEGIL: setup DOGRUDAN cagrilir ve commit sonrasi oldurulur.
      // Boylece hicbir `finally` calismaz — gercek "zorla sonlandirma" hali.
      const setup = runScript('f04-01-setup.js', {
        F04_RUN_ID: runId, F04_STATE_FILE: stateFor(runId), F04_KILL_AFTER_COMMIT: '1',
      });
      const openField = await L.findAcceptanceField(prisma, runId);
      const email = openField.exists
        ? (await prisma.user.findFirst({ where: { tenantId: openField.tenantId }, select: { email: true } }) || {}).email
        : null;

      // (a) DB: erisim ACIK mi?  (b) HTTP: ayni kimlikle oturum aciliyor mu?
      const loginBefore = await tryLogin(email, openField.slug);
      const openInDb = openField.exists && openField.activeUsers > 0;

      // Windows'ta `process.kill(self,'SIGKILL')` TerminateProcess'e dusuruur ve sinyal
      // BILDIRILMEZ (exit 1, signal null). Bu yuzden iddia "sinyal SIGKILL" DEGIL, gozlenebilir
      // olgudur: surec commit'ten SONRA oldu, `finally` CALISMADI (durum dosyasi YAZILMADI) ve
      // erisim ACIK kaldi.
      const stateWrittenOpen = fs.existsSync(stateFor(runId));
      pass('H-3b1', 'finally CALISMADI (durum dosyasi YOK): alan COMMIT EDILMIS ve erisim ACIK',
        setup.code !== 0 && stateWrittenOpen === false && openInDb,
        `setup exit=${setup.code} signal=${setup.signal === null ? 'null (Windows sinyal bildirmez)' : setup.signal}`
        + ` · durum dosyasi yazildi mi=${stateWrittenOpen} (finally CALISMADI)`
        + ` · alan VAR=${openField.exists} · AKTIF kullanici=${openField.exists ? openField.activeUsers : '-'}`
        + ` · HTTP oturum acma=${loginBefore.measured ? loginBefore.status : `OLCULEMEDI (${loginBefore.why})`}`);

      // Sonraki kurtarma cagrisi AYNI alani bulup kapatabilmeli.
      const close = runScript('f04-09-close-access.js', { F04_RUN_ID: runId });
      let rec = null;
      try { rec = JSON.parse(close.out.slice(close.out.indexOf('{'))); } catch (e) { rec = null; }
      const after = await L.findAcceptanceField(prisma, runId);
      const loginAfter = await tryLogin(email, openField.slug);

      const dbClosed = after.exists && after.activeUsers === 0;
      const bumped = !!rec && rec.tokenVersionBumped > 0;
      const evidenceOk = !!rec && rec.evidencePreserved === true;

      pass('H-3b2', 'SONRAKI KURTARMA ayni alani runId ile buldu ve erisimi KAPATTI; kanit KORUNDU',
        close.code === 0 && dbClosed && bumped && evidenceOk,
        `kapatici exit=${close.code} · devre disi=${rec ? rec.usersDeactivated : '?'}`
        + ` · aktif ${openField.activeUsers}→${after.exists ? after.activeUsers : '-'}`
        + ` · tokenVersion artan=${rec ? rec.tokenVersionBumped : '?'}`
        + ` · kanit korundu=${rec ? rec.evidencePreserved : '?'}`
        + ` · sayimlar=${rec ? JSON.stringify(rec.financialAuditCounts) : '-'}`);

      // HTTP GECISI: 200→401. Tek bir 401 kanit degildir; ONCE 200 gorulmus olmalidir.
      if (!loginBefore.measured || !loginAfter.measured) {
        unmeasured('H-3b3', 'HTTP erisim gecisi 200→401',
          `oturum acma OLCULEMEDI (once: ${loginBefore.measured ? loginBefore.status : loginBefore.why}`
          + ` · sonra: ${loginAfter.measured ? loginAfter.status : loginAfter.why})`
          + ' — DB katmani (H-3b2) ayrica olculdu; HTTP iddiasi PASS SAYILMAZ');
      } else {
        // Basarili oturum acmanin GERCEK sozlesmesi 201'dir: `@Post('login')` uzerinde
        // `@HttpCode` yoktur, NestJS varsayilani 201 doner. Beklentiyi 200'e sabitlemek
        // urunu belgeye uydurmak olurdu; olcut kaynaktaki sozlesmeye baglanir.
        pass('H-3b3', 'HTTP: kapatmadan ONCE 201 (oturum acildi), SONRA 401 — GECIS olculdu',
          loginBefore.status === 201 && loginAfter.status === 401,
          `ayni kimlik bilgisi · once HTTP ${loginBefore.status} (erisim ACIK; @Post → 201)`
          + ` → sonra HTTP ${loginAfter.status} (erisim KAPALI)`
          + ' · tek basina bir 401 kanit DEGILDIR — once 201 gorulmus olmasi SARTTIR');
      }

      // ══════════ H-4 · TEKRAR GUVENLIGI ══════════
      const close2 = runScript('f04-09-close-access.js', { F04_RUN_ID: runId });
      let rec2 = null;
      try { rec2 = JSON.parse(close2.out.slice(close2.out.indexOf('{'))); } catch (e) { rec2 = null; }
      const after2 = await L.findAcceptanceField(prisma, runId);

      pass('H-4', 'kapatici TEKRARI GUVENLI: ikinci cagri yazmaz, kapali durumu BOZMAZ, exit 0',
        close2.code === 0 && !!rec2 && rec2.usersDeactivated === 0
        && rec2.alreadyClosed === true && rec2.accessClosed === true
        && after2.exists && after2.activeUsers === 0,
        `ikinci cagri exit=${close2.code} · devre disi=${rec2 ? rec2.usersDeactivated : '?'}`
        + ` · zatenKapali=${rec2 ? rec2.alreadyClosed : '?'}`
        + ` · aktif kullanici=${after2.exists ? after2.activeUsers : '-'}`
        + ` · kanit korundu=${rec2 ? rec2.evidencePreserved : '?'}`);
    }
  } finally {
    const p = R.filter((x) => x.verdict === 'PASS').length;
    const f = R.filter((x) => x.verdict === 'FAIL').length;
    const u = R.filter((x) => x.verdict === 'UNMEASURED').length;
    console.log(`\nI5b HATA YOLU PROVALARI: PASS ${p} · FAIL ${f} · OLCULEMEYEN ${u}  (toplam ${R.length})`);
    console.log(JSON.stringify({ record: 'F04-I5B-FAILURE-PATHS', pass: p, fail: f, unmeasured: u, results: R }, null, 1));
    await prisma.$disconnect().catch(() => {});
    process.exitCode = f > 0 ? 1 : (u > 0 ? 3 : 0);
  }
})().catch((e) => { console.error('\nPROVA HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
