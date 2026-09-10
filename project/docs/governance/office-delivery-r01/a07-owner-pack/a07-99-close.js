/*
 * A-07 OWNER PAKETI — 99 KAPANIS / KURTARMA (tek basina da calisir, a07-run icinden de)
 *
 * Owner GO'su: "KAPANIS (basarisizlikta DA, finally/recovery yolunda): bayragi kapat ·
 * API'yi yeniden baslat · sentetik erisimi revoke et · UCUNU DE DOGRULA."
 *
 * 2026-09-10'DA DUZELTILEN KUSURLAR (kaynakta bulundu):
 *   C) Bayrak acikken KORLEMESINE Stop veriliyordu — suren baslatmanin HANGI dosyayi okudugu
 *      sorulmuyordu. Artik karar `SVC.closeFlagAndRecover` / `decideCloseAction` ile OLCUME
 *      dayali: suren ve guncel dosyayi okuyan baslatma DURDURULMAZ (BEKLE); yalniz ESKI dosyayi
 *      okumus olabilecek surec TEK kez yeniden baslatilir.
 *   D) Erisim iptali "uydurma parolayla login -> 401" ile kanitlaniyordu. KANIT DEGILDI:
 *      login kapisi bcrypt'i isActive'ten ONCE kontrol eder, yanlis parola her durumda 401'dir.
 *      Artik: DB (isActive=false) + GERCEK parolayla login -> "devre disi" 401 + ESKI token -> 401.
 *   E) Elle kurtarma talimati `Restart-ScheduledTask` oneriyordu — BU MAKINEDE YOK
 *      (ne pwsh 7 ne 5.1; `Get-Command -Module ScheduledTasks` yalniz Start-/Stop-).
 *
 * Bagimsiz kosumda (token/parola yok) uc kaniti ve giris kaniti OLCULEMEDI yazilir —
 * 401 bunlarin YERINE KONMAZ. Kurtarma cekirdegi (bayrak dosyasi · guncel dosyayi okuyan surec ·
 * DB'de iptal · zincir · 8080 · DB sinamasi) yine de olculur.
 *
 * --dry-run : hicbir sey DEGISTIRMEZ; yapilabilirligi ve SU AN kosulsa verilecek KARARI olcer.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
const SCRIPTS = path.resolve(HERE, '..', 'scripts');
const L = require(path.join(SCRIPTS, 'ow-lib'));
const SVC = require(path.join(SCRIPTS, 'ow-service'));
const DEPS = require('./a07-deps');

const SLUG_DEFAULT = 'off-acc-f851d975';
/** Bagimsiz kurtarma kosumunun basari cekirdegi (token/parola gerektirmeyenler). */
const CORE = ['CL-FLAG-FILE', 'CL-FLAG-LOADED', 'CL-ACCESS-DB', 'CL-SVC-CHAIN', 'CL-SVC-LISTENER', 'CL-SVC-DB'];

const MANUAL = [
  '    ELLE MUDAHALE (bu betik tekrar denenebilir — idempotenttir):',
  `    1) ${SVC.FLAG_KEY} satirini EnvFile'dan kaldirin.`,
  '    2) C:/Ops/hukuk/logs/api/host-api.log son satirina bakin: "begin mode=api" var ama',
  '       "child resumed" yoksa baslatma SURUYORDUR (butunluk kapanisi ~51 s surebilir) — DURDURMAYIN.',
  '    3) Yalniz zincir bos ya da eski surec yasiyorsa:',
  '       Stop-ScheduledTask -TaskName HukukPlatform-API ; Start-ScheduledTask -TaskName HukukPlatform-API',
  '       (NOT: `Restart-ScheduledTask` bu makinede YOKTUR.)',
];

/**
 * @param {object} o
 * @param {boolean} [o.dry]      hicbir sey degistirme
 * @param {string}  [o.token]    acik ADMIN token — bayragin UCTAN 403 kaniti; ERISIM IPTALINDEN ONCE kullanilir
 * @param {string}  [o.password] taze ADMIN parolasi — iptalden sonra "devre disi" 401 kaniti
 * @param {string}  [o.slug]
 * @param {object}  [o.rec]      disaridan recorder (a07-run); yoksa kendi recorder'i
 * @returns {Promise<{ledger:object|null, recorder:object}>}  ASLA firlatmaz.
 */
async function runClose({ dry = false, token = null, password = null, slug = process.env.A07_TENANT_SLUG || SLUG_DEFAULT, rec = null } = {}) {
  const R = rec || L.makeRecorder(dry ? 'A-07 KAPANIS (KURU KOSUM)' : 'A-07 KAPANIS');
  let ledger = null;
  let base;
  try {
    DEPS.resolveAll();
    base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
    L.assertRunEnvironment();
    L.assertOwnSlug(slug);
  } catch (e) {
    R.ok('CL-SETUP', 'kapanis ortami kuruldu (G-0/G-1 + bagimliliklar)', false, e.message);
    return { ledger, recorder: R };
  }

  // ───────────────────────────── KURU KOSUM ─────────────────────────────
  if (dry) {
    L.step('CL-DRY', 'kapanis yolu yapilabilir mi + SU AN kosulsa KARAR ne olurdu (degisiklik YOK)');
    try {
      const envFile = SVC.resolveEnvFile();
      let writable = false; let err = '';
      try { const fd = fs.openSync(envFile, 'r+'); fs.closeSync(fd); writable = true; } catch (e) { err = (e && e.code) || String(e); }
      R.ok('CL-DRY-WRITE', 'EnvFile YAZILABILIR (bayrak kapatilabilir) — icerik/mtime DEGISMEDI',
        writable, writable ? 'r+ acildi/kapatildi' : `YAZILAMAZ (${err}) — YUKSELTILMIS TERMINAL GEREKLI`);

      const chain = SVC.launcherChain();
      R.ok('CL-DRY-CHAIN', 'baslatici zinciri OLCULEBILIYOR', !!chain, JSON.stringify(chain));

      const obs = {
        flagFileMtimeMs: fs.statSync(envFile).mtimeMs,
        chain,
        launcherStartMs: SVC.launcherStartMs(),
        answering: await SVC.apiAnswering(base),
      };
      const d = SVC.decideCloseAction(obs);
      R.ok('CL-DRY-DECISION', 'kapanis su an kosulsa KARAR olculebildi (yan etkisiz)', !!d.action, `${d.action} · ${d.reason}`);

      const db = await SVC.dbReachable(base, slug);
      R.ok('CL-DRY-DB', 'DB ERISILEBILIR (erisim iptali yapilabilir)', db.ok, `HTTP ${db.status}`);
    } catch (e) {
      R.ok('CL-DRY', 'kuru kosum olcumu', false, e.message);
    }
    return { ledger, recorder: R };
  }

  // ─────────────── 1) BAYRAK KAPAT + GUNCEL DOSYAYLA TOPARLA (olcume dayali) ───────────────
  L.step('CL-1', 'bayrak KAPATILIYOR + guncel dosyayla toparlanma (karar OLCUME dayali; suren baslatma DURDURULMAZ)');
  ledger = await SVC.closeFlagAndRecover(base, { label: 'KAPANIS' }); // firlatmaz
  R.ok('CL-FLAG-FILE', 'kapanis: bayrak dosyada KAPALI', ledger.flagFileOff,
    `bayrak onceden acik miydi=${ledger.flagWasOn} · simdi dosyada KAPALI=${ledger.flagFileOff}`);
  R.ok('CL-FLAG-LOADED', 'kapanis: calisan baslatici GUNCEL (KAPALI) dosyayi okudu', ledger.recovered,
    ledger.recovered ? `kararlar=${ledger.decisions.join('>')}` : `TOPARLANMADI — ${ledger.error}`);

  // ─────────────── 2) BAYRAK UCTAN — erisim IPTALINDEN ONCE (token hala gecerli) ───────────────
  try {
    if (token && ledger.recovered) {
      const pr = await SVC.probeFlagEndpoint(base, token);
      R.ok('CL-FLAG-ENDPOINT', 'kapanis: bayrak uctan KAPALI (403 DISABLED)', pr.verdict === 'KAPALI', `${pr.verdict} (HTTP ${pr.status})`);
    } else {
      R.unmeasured('CL-FLAG-ENDPOINT', 'kapanis: bayrak uctan KAPALI (403 DISABLED)',
        token ? 'servis toparlanmadi — uc olculemez' : 'gecerli ADMIN token YOK (bagimsiz kosum) — 401 bunun YERINE KONMAZ');
    }
  } catch (e) {
    R.ok('CL-FLAG-ENDPOINT', 'kapanis: bayrak uctan KAPALI (403 DISABLED)', false, e.message);
  }

  // ─────────────── 3) ERISIM IPTALI — HER DURUMDA ───────────────
  let adminEmail = null;
  let prisma = null;
  try {
    prisma = L.loadPrisma();
    const t = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (!t) {
      R.ok('CL-ACCESS-DB', 'kapanis: sentetik erisim DB de IPTAL', false, `tenant ${slug} YOK`);
    } else {
      await L.assertOwnTenant(prisma, t.id); // G-2
      const T = { tenantId: t.id };
      const users = await prisma.user.findMany({ where: T, select: { id: true, email: true, role: true, isActive: true } });
      adminEmail = (users.find((u) => u.role === 'ADMIN') || {}).email || null;
      const active = users.filter((u) => u.isActive);
      if (active.length) L.step('CL-3', `sentetik erisim IPTAL ediliyor (${active.length} satir; kanit satirlarina DOKUNULMAZ)`);
      for (const u of active) {
        await prisma.user.update({ where: { id: u.id }, data: { isActive: false, tokenVersion: { increment: 1 } } });
      }
      const after = await prisma.user.findMany({ where: T, select: { isActive: true, tokenVersion: true } });
      const stillActive = after.filter((u) => u.isActive).length;
      R.ok('CL-ACCESS-DB', 'kapanis: sentetik erisim DB de IPTAL', stillActive === 0,
        `simdi iptal edilen=${active.length} · toplam=${after.length} · hala aktif=${stillActive}`);

      const inv = {
        audit: await prisma.auditLog.count({ where: T }),
        approval: await prisma.officeApprovalRequest.count({ where: T }),
      };
      R.ok('CL-PRESERVE', 'kanit satirlari KORUNDU (audit / onay silinmedi)', inv.approval >= 1, JSON.stringify(inv));
    }
  } catch (e) {
    R.ok('CL-ACCESS-DB', 'kapanis: sentetik erisim DB de IPTAL', false, `iptal hatasi: ${e && e.message}`);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }

  // ─────────────── 4) IPTALIN UCTAN KANITI ───────────────
  try {
    if (password && adminEmail) {
      const r = await L.httpJson('POST', `${base}/auth/login`, { body: { email: adminEmail, password, tenantSlug: slug }, timeoutMs: 20000 });
      const msg = String((r.body && r.body.message) || '');
      const deactivated = r.status === 401 && /devre d/i.test(msg);
      R.ok('CL-ACCESS-LOGIN', 'kapanis: GERCEK parolayla login "devre disi" 401', deactivated,
        `HTTP ${r.status} · "${msg.slice(0, 60)}"${r.status === 401 && !deactivated ? ' — 401 ama BASKA sebep; iptal KANITI DEGIL' : ''}`);
    } else {
      R.unmeasured('CL-ACCESS-LOGIN', 'kapanis: GERCEK parolayla login "devre disi" 401',
        'gercek parola YOK (bagimsiz kosum) — uydurma parolali 401 iptal KANITI DEGILDIR (bcrypt isActive ten ONCE duser)');
    }
  } catch (e) {
    R.ok('CL-ACCESS-LOGIN', 'kapanis: GERCEK parolayla login "devre disi" 401', false, e.message);
  }
  try {
    if (token) {
      // OW-FLAG-PROBE var olmayan talep kimligidir: token gecerli kalsa bile GERCEK fixture YURUTULMEZ.
      const r = await L.httpJson('POST', `${base}/office-approvals/OW-FLAG-PROBE/execute`, { token, timeoutMs: 15000 });
      R.ok('CL-ACCESS-TOKEN', 'kapanis: eski token REDDEDILIYOR (401)', r.status === 401,
        `HTTP ${r.status} (iptalden ONCE ayni token 403 aliyordu)`);
    } else {
      R.unmeasured('CL-ACCESS-TOKEN', 'kapanis: eski token REDDEDILIYOR (401)', 'eski token YOK (bagimsiz kosum)');
    }
  } catch (e) {
    R.ok('CL-ACCESS-TOKEN', 'kapanis: eski token REDDEDILIYOR (401)', false, e.message);
  }

  // ─────────────── 5) SERVIS TOPARLANDI — surec kimligi + 8080 + DB'ye ulasan sinama ───────────────
  L.step('CL-5', 'servis toparlanmasi: surec zinciri + 8080 dinleyicisi + DB ye ulasan sinama');
  try {
    const chain = SVC.launcherChain();
    R.ok('CL-SVC-CHAIN', 'kapanis: baslatici zinciri ayakta (host + pwsh + node)',
      !!chain && chain.host >= 1 && chain.pwsh >= 1 && chain.node >= 1, JSON.stringify(chain));
    const apiNow = SVC.apiPid();
    const lp = SVC.listenerPid(8080);
    R.ok('CL-SVC-LISTENER', 'kapanis: 8080 API node surecince dinleniyor',
      lp !== null && lp === apiNow, `8080 dinleyici pid=${lp} · api node pid=${apiNow}`);
    const db = await SVC.dbReachable(base, slug);
    R.ok('CL-SVC-DB', 'kapanis: DB ye ulasan sinama 401', db.ok,
      `HTTP ${db.status}${db.status === 500 ? ' — DB YOK' : ''}${db.status === 429 ? ' — rate-limit; KANIT DEGIL' : ''}`);
  } catch (e) {
    R.ok('CL-SVC-CHAIN', 'kapanis: servis olcumu', false, e.message);
  }

  return { ledger, recorder: R };
}

function printLedger(ledger) {
  if (!ledger) { console.log('    RESTART SAYACLARI: kapanis toparlanmasi KOSULMADI'); return; }
  console.log('    RESTART SAYACLARI (girisim ≠ baslatma ≠ toparlanma):');
  console.log(`      restart girisimi (stop+start) : ${ledger.restartAttempts}`);
  console.log(`      baslatma verildi             : ${ledger.startsIssued}`);
  console.log(`      yeni baslatici GOZLENDI      : ${ledger.startsObserved}`);
  console.log(`      guncel dosyayla TOPARLANDI   : ${ledger.recovered ? 'EVET' : 'HAYIR'}`);
  console.log(`      kararlar                     : ${ledger.decisions.join(' > ') || '-'} · bekleme turu=${ledger.waits} · ${ledger.elapsedMs} ms`);
  if (ledger.error) console.log(`      HATA                         : ${ledger.error}`);
}

module.exports = { runClose, printLedger, CORE };

if (require.main === module) {
  const dry = process.argv.includes('--dry-run');
  runClose({ dry }).then(({ ledger, recorder }) => {
    const sum = recorder.summary();
    if (dry) {
      console.log(`\nKURU KOSUM — hicbir sey degistirilmedi. Kapanis yolu ${sum.fail === 0 ? 'HAZIR.' : 'HAZIR DEGIL!'}`);
      process.exitCode = sum.fail === 0 ? 0 : 1;
      return;
    }
    printLedger(ledger);
    const coreOk = CORE.every((id) => recorder.results.some((r) => r.id === id && r.ok));
    const hardFail = recorder.results.some((r) => !r.ok && !r.unmeasured);
    if (!coreOk || hardFail) {
      console.error('\n!!! KAPANIS/KURTARMA DOGRULANAMADI.');
      for (const l of MANUAL) console.error(l);
      process.exitCode = 1;
    } else {
      console.log('\nKAPANIS CEKIRDEGI DOGRULANDI (bayrak KAPALI + guncel dosyayla toparlandi · erisim IPTAL · servis+DB ayakta).');
      console.log('UC/GIRIS kanitlari bagimsiz kosumda OLCULEMEDI olarak kalir — token/parola a07-run icinde vardir.');
      process.exitCode = 0;
    }
  }).catch((e) => {
    console.error('\nKAPANIS HATASI:', e && e.stack ? e.stack : e);
    for (const l of MANUAL) console.error(l);
    process.exitCode = 1;
  });
}
