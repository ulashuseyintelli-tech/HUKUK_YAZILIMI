/*
 * OFFICE A-07 — BAYRAK YONETIMI + SERVIS RESTART + TOPARLANMA DOGRULAMASI
 * (kosum plani §3.1 acma · §3.2 geri alma · §3.4 her restart'in kendi dogrulamasi)
 *
 * OLCULEN CANLI MEKANIZMA (tahmin DEGIL — sureç zinciri okunarak bulundu):
 *   Scheduled Task `HukukPlatform-API`
 *     -> C:\Ops\hukuk\bin\hukuk-task-host.exe api      (gozetici; orphan-watchdog HL_HOST_PID)
 *       -> pwsh -NoProfile -NonInteractive -File C:\Ops\hukuk\bin\start-api.ps1
 *         -> node <RELEASE>\project\apps\api\dist\apps\api\src\main.js
 *   `start-api.ps1` TEK-ORNEK KILIDI + nonce kullanir. Bu yuzden restart **node'u
 *   oldurerek DEGIL**, zamanlanmis gorev uzerinden yapilir: kilit/nonce/watchdog'u o yonetir.
 *   Web AYRI gorevdir (`HukukPlatform-Web`) ve BU AKISTAN ETKILENMEZ.
 *
 * BAYRAK: `OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED`, API'nin EnvFile'inda.
 *   EnvFile yolu `start-api.ps1` icindeki `EnvFile = ...` satirindan OKUNUR (sabit
 *   kodlanmaz) — surum degisince yol kendiliginden dogru kalir.
 *   Acma  = dosyanin SONUNA tek satir eklenir. Kapatma = O SATIR KALDIRILIR (yokluk zaten
 *   fail-safe kapalidir). BASKA HICBIR ANAHTARA DOKUNULMAZ ve bu bayt duzeyinde dogrulanir.
 *
 * TOPARLANMA (§3.4) UC KOSUL BIRLIKTE saglanmadikca restart BASARILI SAYILMAZ:
 *   (i) eski dinleyici GERCEKTEN oldu ve PID DEGISTI
 *   (ii) API istek isliyor  — "surec ayakta" YETMEZ: bos govdeye POST /auth/login -> 400
 *   (iii) bayragin durumu UCTAN teyit edildi (kapaliyken 403 CONTROLLED_EXECUTION_DISABLED)
 */
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
const L = require('./ow-lib');

const FLAG_KEY = 'OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED';
const TASK_NAME = process.env.OW_API_TASK_NAME || 'HukukPlatform-API';
const LAUNCHER = process.env.OW_API_LAUNCHER || 'C:\\Ops\\hukuk\\bin\\start-api.ps1';

function ps(script) {
  const r = spawnSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', timeout: 180000 });
  if (r.error) throw new Error(`powershell calistirilamadi: ${r.error.message}`);
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/** EnvFile yolunu baslatici betiginden OKU (sabit kodlama YOK). */
function resolveEnvFile() {
  if (process.env.OW_API_ENV_FILE) return process.env.OW_API_ENV_FILE;
  const src = fs.readFileSync(LAUNCHER, 'utf8');
  const m = src.match(/EnvFile\s*=\s*'([^']+)'/) || src.match(/EnvFile\s*=\s*"([^"]+)"/);
  if (!m) throw new L.ObservationError(`EnvFile yolu ${LAUNCHER} icinde bulunamadi — OLCULEMEDI`);
  return m[1];
}

/** API'yi calistiran node PID'i (yalniz bu surum agacindan). */
function apiPid() {
  const r = ps("(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | "
    + "Where-Object { $_.CommandLine -like '*apps*api*dist*main.js*' } | "
    + 'Select-Object -First 1 -ExpandProperty ProcessId)');
  const n = Number(r.out);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Bayragin DOSYADAKI durumu. Donen deger: true | false (yokluk = false = KAPALI). */
function readFlagFile() {
  const p = resolveEnvFile();
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const hit = lines.filter((l) => l.trim().startsWith(`${FLAG_KEY}=`));
  if (hit.length === 0) return { enabled: false, present: false, path: p };
  const v = hit[hit.length - 1].split('=').slice(1).join('=').trim().toLowerCase();
  return { enabled: v === 'true', present: true, path: p, occurrences: hit.length };
}

/**
 * Bayragi yaz/kaldir. **BASKA ANAHTAR DEGISMEZ** — bu iddia bayt duzeyinde DOGRULANIR:
 * degisiklikten sonra, bayrak satiri disindaki butun satirlarin dizisi ONCEKIYLE AYNI olmali.
 */
function setFlagFile(enabled) {
  const p = resolveEnvFile();
  const before = fs.readFileSync(p, 'utf8');
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const lines = before.split(/\r?\n/);
  const others = lines.filter((l) => !l.trim().startsWith(`${FLAG_KEY}=`));
  let next = others.slice();
  if (enabled) {
    while (next.length && next[next.length - 1].trim() === '') next.pop();
    next.push(`${FLAG_KEY}=true`, '');
  }
  const after = next.join(eol);
  fs.writeFileSync(p, after, 'utf8');

  const reread = fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .filter((l) => !l.trim().startsWith(`${FLAG_KEY}=`))
    .filter((l) => l.trim() !== '');
  const baseline = others.filter((l) => l.trim() !== '');
  if (reread.length !== baseline.length || reread.some((l, i) => l !== baseline[i])) {
    throw new Error('BAYRAK YAZIMI IHLAL: bayrak disindaki satirlar degisti — geri alin');
  }
  return { path: p, enabled, otherLines: baseline.length };
}

/**
 * BASLATMA ZINCIRI ILERLIYOR MU — `hukuk-task-host` -> `pwsh` -> `node`.
 * Butunluk kapanisi (994 dosya / 286.5 MB) sirasinda host AYAKTA ama pwsh HENUZ YOK;
 * bu "askida" degil "calisiyor" demektir. Kor ikinci restart'i onlemek icin olculur.
 */
function launcherProgress() {
  const r = ps(
    "$h=@(Get-CimInstance Win32_Process -Filter \"Name='hukuk-task-host.exe'\" | "
    + "Where-Object { $_.CommandLine -like '* api*' }).Count; "
    + "$p=@(Get-CimInstance Win32_Process -Filter \"Name='pwsh.exe'\" | "
    + "Where-Object { $_.CommandLine -like '*start-api.ps1*' }).Count; "
    + "$n=@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | "
    + "Where-Object { $_.CommandLine -like '*apps*api*dist*main.js*' }).Count; "
    + '"host=$h pwsh=$p node=$n"',
  );
  return (r.out || 'OLCULEMEDI').trim();
}

/** Bos govdeye login: 400 = "istek isliyor". "Port dinliyor" bunun YERINE GECMEZ. */
async function apiAnswering(base) {
  const r = await L.httpJson('POST', `${base}/auth/login`, { body: {}, timeoutMs: 5000 });
  return r.status === 400;
}

/** Bayragin UCTAN durumu. token ZORUNLU (kapi sirasi: JWT -> F01 -> bayrak). */
async function probeFlagEndpoint(base, token) {
  const r = await L.httpJson('POST', `${base}/office-approvals/OW-FLAG-PROBE/execute`,
    { token, timeoutMs: 15000 });
  const msg = JSON.stringify(r.body || {});
  if (r.status === 403 && msg.includes('OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED')) {
    return { verdict: 'KAPALI', status: r.status };
  }
  // Bayrak ACIK ise ayni istek bayragi GECER ve sonraki kapilara (ADMIN/F01/talep) takilir.
  // 404 "talep bulunamadi" => bayrak+yetki+kapsam GECILDI demektir.
  if (r.status === 404) return { verdict: 'ACIK', status: r.status };
  if (r.status === 403) return { verdict: 'BELIRSIZ_403', status: r.status, body: r.body };
  return { verdict: 'BELIRSIZ', status: r.status, body: r.body };
}

/** Baslatici zinciri SAYISAL: host (task-host api) · pwsh (start-api.ps1) · node (api main.js). */
function launcherChain() {
  const m = /host=(\d+) pwsh=(\d+) node=(\d+)/.exec(launcherProgress());
  if (!m) return null;
  return { host: Number(m[1]), pwsh: Number(m[2]), node: Number(m[3]) };
}

/**
 * Calisan BASLATICININ (pwsh start-api.ps1) baslangic ani — Unix ms (UTC). Yoksa null.
 * EnvFile'i okuyan surec BUDUR (node degil): "guncel dosyayi okudu mu" sorusu buna gore
 * cevaplanir. Dogrudan Unix ms uretilir — ToString('u') saat-dilimi tuzagi YOK.
 */
function launcherStartMs() {
  const r = ps(
    "$p = Get-CimInstance Win32_Process -Filter \"Name='pwsh.exe'\" | "
    + "Where-Object { $_.CommandLine -like '*start-api.ps1*' } | "
    + 'Sort-Object CreationDate -Descending | Select-Object -First 1; '
    + 'if ($p) { ([DateTimeOffset]($p.CreationDate.ToUniversalTime())).ToUnixTimeMilliseconds() }',
  );
  const n = Number(r.out);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Portu dinleyen surecin PID'i (yoksa null). */
function listenerPid(port = 8080) {
  const r = ps(`(Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue `
    + '| Select-Object -First 1 -ExpandProperty OwningProcess)');
  const n = Number(r.out);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * DB'YE DOKUNAN sinama. Bos govdeye 400 DB'yi GORMEZ (ValidationPipe once calisir —
 * 2026-09-10'da DB kapaliyken de 400 donuyordu). Olmayan kullaniciyla login DB sorgusu yapar:
 *   401 = DB ULASILDI · 500 = DB YOK · 429 = rate-limit (KANIT DEGIL)
 */
async function dbReachable(base, tenantSlug) {
  const r = await L.httpJson('POST', `${base}/auth/login`, {
    body: { email: 'ow-db-probe@invalid.local', password: 'x', tenantSlug: tenantSlug || 'off-acc-f851d975' },
    timeoutMs: 20000,
  });
  return { ok: r.status === 401, status: r.status, measurable: r.status === 401 || r.status === 500 };
}

/**
 * KAPANIS KARARI — SAF FONKSIYON (canli yan etkisi YOK; test edilebilir).
 *
 * Soru: bayrak dosyada KAPALI yazildiktan sonra, calisan/baslayan API bu GUNCEL dosyayi mi
 * okudu? Belirleyici olcu, EnvFile'i okuyan BASLATICININ (pwsh) baslangic anidir:
 *   - baslatici, dosyanin SON yaziminden SONRA basladiysa  -> guncel dosyayi okudu.
 *   - ONCE basladiysa -> eski dosyayi (bayrak ACIK olabilir) okumus olabilir.
 *
 * 2026-09-10 DERSI: "cevap yok" = "askida" DEGILDIR. host butunluk kapanisindayken (pwsh
 * henuz yok) baslatma CALISIYORDUR; durdurmak onu OLDURUR. Bu durumda gelecek baslatici
 * zorunlu olarak simdiden sonra baslayacagi icin guncel dosyayi okuyacaktir -> BEKLE.
 *
 * Donus: { action: 'DONE_LOADED_CURRENT' | 'WAIT' | 'RESTART' | 'START', reason }
 */
function decideCloseAction({ flagFileMtimeMs, chain, launcherStartMs: ls, answering }) {
  const known = ls !== null && ls !== undefined;
  const fresh = known && ls > flagFileMtimeMs;
  const anyChain = !!chain && (chain.host > 0 || chain.pwsh > 0 || chain.node > 0);
  if (answering) {
    if (fresh) return { action: 'DONE_LOADED_CURRENT', reason: 'calisan baslatici dosyanin SON yaziminden SONRA basladi -> guncel (KAPALI) dosyayi okudu' };
    return {
      action: 'RESTART',
      reason: known ? 'calisan baslatici dosyanin son yaziminden ONCE basladi -> eski dosyayi okumus olabilir'
        : 'baslatici baslangici OLCULEMEDI -> guncel dosyayi okudugu KANITLANAMAZ',
    };
  }
  if (anyChain) {
    if (chain.pwsh > 0 && !fresh) {
      return { action: 'RESTART', reason: 'baslatma suruyor ama baslatici yazimdan ONCE basladi -> bu baslatma ESKI dosyayla; atilmasi gerekir' };
    }
    return {
      action: 'WAIT',
      reason: chain.pwsh > 0 ? 'baslatma DEVAM EDIYOR ve guncel dosyayi okudu — DURDURULMAZ'
        : 'host butunluk kapanisinda (pwsh henuz yok) — gelecek baslatici guncel dosyayi okuyacak; DURDURULMAZ',
    };
  }
  return { action: 'START', reason: 'zincir BOS ve API cevap vermiyor — baslatilmali' };
}

/** Gercek G/C. Testler bunlarin HERHANGI birini sahtesiyle degistirebilir (io parametresi). */
function defaultIo(base) {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => L.log(m),
    readFlag: () => readFlagFile(),
    setFlag: (v) => setFlagFile(v),
    flagMtimeMs: () => fs.statSync(resolveEnvFile()).mtimeMs,
    chain: () => launcherChain(),
    progress: () => launcherProgress(),
    launcherStartMs: () => launcherStartMs(),
    apiPid: () => apiPid(),
    answering: () => apiAnswering(base),
    probeFlag: (token) => probeFlagEndpoint(base, token),
    stopTask: () => {
      const s = ps(`Stop-ScheduledTask -TaskName '${TASK_NAME}'`);
      if (s.code !== 0) throw new Error(`gorev durdurulamadi: ${s.err || s.out}`);
    },
    startTask: () => {
      const s = ps(`Start-ScheduledTask -TaskName '${TASK_NAME}'`);
      if (s.code !== 0) throw new Error(`gorev baslatilamadi: ${s.err || s.out}`);
    },
  };
}

/**
 * KAPANIS: bayragi KAPAT + API'yi guncel dosyayla ayaga getir — basarisizlikta DA calisir.
 *
 * 1) Bayrak dosyada KAPALI yazilir (HER DURUMDA ILK IS).
 * 2) `decideCloseAction` her turda OLCUME gore karar verir:
 *      WAIT  -> baslatma suruyor; DURDURULMAZ (2026-09-10 kor ikinci stop'u tekrarlanmaz)
 *      RESTART -> calisan/baslayan surec ESKI dosyayi okumus olabilir; TEK stop+start
 *      START -> zincir bos; baslat
 *      DONE  -> guncel dosyayi okuyan surec cevap veriyor
 * 3) Sayaclar AYRI tutulur: restart GIRISIMI · baslatma VERILDI · baslatma GOZLENDI · TOPARLANDI.
 *
 * Donus: ledger (asla firlatmaz; hata `ledger.error`e yazilir — cagiran kapanisi YARIDA birakmaz).
 */
async function closeFlagAndRecover(base, { label = 'KAPANIS', budgetMs, maxRestarts = 1, io } = {}) {
  const x = { ...defaultIo(base), ...(io || {}) };
  const ledger = {
    label, flagWasOn: false, flagFileOff: false,
    restartAttempts: 0, startsIssued: 0, startsObserved: 0,
    recovered: false, waits: 0, decisions: [], error: null, elapsedMs: 0,
  };
  const t0 = x.now();
  try {
    const before = x.readFlag();
    ledger.flagWasOn = !!before.enabled;
    if (before.enabled) x.setFlag(false);
    ledger.flagFileOff = x.readFlag().enabled === false;
    if (!ledger.flagFileOff) { ledger.error = 'bayrak dosyada KAPATILAMADI'; return ledger; }

    const mtime = x.flagMtimeMs();
    let lastLauncher = x.launcherStartMs();
    const budget = budgetMs || Number(process.env.OW_API_READY_BUDGET_MS || 300000);
    const deadline = t0 + budget;

    for (;;) {
      const ls = x.launcherStartMs();
      if (ls !== null && ls !== undefined && ls !== lastLauncher) { ledger.startsObserved += 1; lastLauncher = ls; }
      const d = decideCloseAction({ flagFileMtimeMs: mtime, chain: x.chain(), launcherStartMs: ls, answering: await x.answering() });
      if (ledger.decisions[ledger.decisions.length - 1] !== d.action) {
        ledger.decisions.push(d.action);
        x.log(`      [${label}] karar=${d.action} · ${d.reason}`);
      }
      if (d.action === 'DONE_LOADED_CURRENT') { ledger.recovered = true; break; }

      if (d.action === 'RESTART') {
        if (ledger.restartAttempts >= maxRestarts) {
          ledger.error = `restart limiti (${maxRestarts}) doldu — baslatici hala eski dosyayi okumus gorunuyor`;
          break;
        }
        ledger.restartAttempts += 1;
        await x.stopTask();
        const killDeadline = x.now() + 60000;
        while (x.apiPid() !== null) {
          if (x.now() > killDeadline) { ledger.error = 'eski dinleyici 60 s icinde olmedi'; break; }
          await x.sleep(500);
        }
        if (ledger.error) break;
        await x.startTask();
        ledger.startsIssued += 1;
        continue;
      }

      if (d.action === 'START') {
        if (ledger.startsIssued > maxRestarts) { ledger.error = 'baslatma limiti doldu — zincir bos kaliyor'; break; }
        await x.startTask();
        ledger.startsIssued += 1;
        await x.sleep(2000); // zincirin belirmesine zaman tani; hemen ikinci START verme
        continue;
      }

      // WAIT — baslatma SURUYOR: DURDURULMAZ.
      if (x.now() > deadline) {
        ledger.error = `butce (${Math.round(budget / 1000)} s) doldu — baslatma DEVAM EDIYOR olabilir; `
          + 'KAPANIS ONU DURDURMADI. C:/Ops/hukuk/logs/api/host-api.log son satirina bakin.';
        break;
      }
      ledger.waits += 1;
      await x.sleep(1000);
    }
  } catch (e) {
    ledger.error = ledger.error || `kapanis G/C hatasi: ${e && e.message}`;
  } finally {
    ledger.elapsedMs = x.now() - t0;
  }
  return ledger;
}

/**
 * RESTART + §3.4 DOGRULAMASI (ACMA yolu). TEK stop + TEK start — ASLA ikinci kez durdurmaz.
 * Basarisizlikta firlatilan hatanin `.ledger` alani sayaclari tasir (girisim ≠ baslatma ≠ toparlanma).
 */
async function restartApiAndVerify(base, { expectFlag, token, label, io, readyBudgetMs } = {}) {
  const x = { ...defaultIo(base), ...(io || {}) };
  const ledger = {
    label, restartAttempts: 0, startIssued: 0, startObserved: false, recovered: false,
    oldPid: null, newPid: null, readyMs: null, flagVerdict: 'OLCULEMEDI',
  };
  const fail = (msg) => { const e = new Error(`[${label}] ${msg}`); e.ledger = ledger; return e; };

  ledger.oldPid = x.apiPid();
  const oldLauncher = x.launcherStartMs();
  x.log(`      [${label}] eski API PID = ${ledger.oldPid === null ? 'OLCULEMEDI' : ledger.oldPid}`);
  const t0 = x.now();

  ledger.restartAttempts = 1;
  try { await x.stopTask(); } catch (e) { throw fail(e.message); }

  const killDeadline = x.now() + 60000;
  for (;;) {
    const p = x.apiPid();
    if (p === null) break;
    if (x.now() > killDeadline) throw fail(`eski dinleyici 60 s icinde olmedi (PID ${p})`);
    await x.sleep(500);
  }
  x.log(`      [${label}] eski dinleyici oldu (+${x.now() - t0} ms)`);

  try { await x.startTask(); } catch (e) { throw fail(e.message); }
  ledger.startIssued = 1;

  // ⚠ 2026-09-10: butce 60 s idi; butunluk kapanisi 50 698 ms surdu (toplam ~61 s) ->
  // yanlis "BASARISIZ" + kor ikinci stop. Butce 300 s ve ilerleme OLCULUR.
  const budget = readyBudgetMs || Number(process.env.OW_API_READY_BUDGET_MS || 300000);
  const deadline = x.now() + budget;
  let ready = false;
  let lastProgress = '';
  for (;;) {
    const ls = x.launcherStartMs();
    if (ls !== null && ls !== undefined && ls !== oldLauncher) ledger.startObserved = true;
    if (await x.answering()) { ready = true; break; }
    const prog = x.progress();
    if (prog !== lastProgress) {
      lastProgress = prog;
      x.log(`      [${label}] bekleniyor (+${Math.round((x.now() - t0) / 1000)} s) · zincir: ${prog}`);
    }
    if (x.now() > deadline) break;
    await x.sleep(1000);
  }
  ledger.readyMs = x.now() - t0;
  if (!ready) {
    // TEKRAR DURDURULMAZ. Karar kapanis yoluna birakilir; o da OLCUME gore bekler/yeniden baslatir.
    throw fail(`API ${Math.round(budget / 1000)} s icinde istek islemedi — zincir: ${x.progress()}. `
      + 'Baslatma DEVAM EDIYOR olabilir; bu fonksiyon IKINCI KEZ DURDURMAZ.');
  }

  ledger.newPid = x.apiPid();
  if (ledger.newPid === null) throw fail('yeni API PID OLCULEMEDI');
  if (ledger.oldPid !== null && ledger.newPid === ledger.oldPid) throw fail(`PID DEGISMEDI (${ledger.newPid})`);

  if (token) {
    const pr = await x.probeFlag(token);
    ledger.flagVerdict = pr.verdict;
    if (expectFlag && pr.verdict !== expectFlag) {
      throw fail(`bayrak uctan '${pr.verdict}' olculdu, '${expectFlag}' bekleniyordu`);
    }
  }
  ledger.recovered = true;
  x.log(`      [${label}] TOPARLANDI · PID ${ledger.oldPid} -> ${ledger.newPid} · hazir ${ledger.readyMs} ms · bayrak(uc) ${ledger.flagVerdict}`);
  return { oldPid: ledger.oldPid, newPid: ledger.newPid, readyMs: ledger.readyMs, flagVerdict: ledger.flagVerdict, ledger };
}

module.exports = {
  FLAG_KEY, TASK_NAME, resolveEnvFile, apiPid, launcherProgress, launcherChain, launcherStartMs,
  listenerPid, dbReachable, readFlagFile, setFlagFile, apiAnswering, probeFlagEndpoint,
  decideCloseAction, defaultIo, closeFlagAndRecover, restartApiAndVerify,
};
