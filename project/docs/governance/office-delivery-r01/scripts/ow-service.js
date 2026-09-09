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

/**
 * RESTART + §3.4 DOGRULAMASI. Uc kosul birlikte saglanmazsa HATA firlatir (kosum durur).
 * `expectFlag`: 'ACIK' | 'KAPALI' — uctan beklenen durum.
 */
async function restartApiAndVerify(base, { expectFlag, token, label }) {
  const oldPid = apiPid();
  L.log(`      [${label}] eski API PID = ${oldPid === null ? 'OLCULEMEDI' : oldPid}`);
  const t0 = Date.now();

  const stop = ps(`Stop-ScheduledTask -TaskName '${TASK_NAME}'`);
  if (stop.code !== 0) throw new Error(`[${label}] gorev durdurulamadi: ${stop.err || stop.out}`);

  // Eski dinleyicinin GERCEKTEN oldugunu bekle (azami 60 s) — "durdurdum" YETMEZ.
  const killDeadline = Date.now() + 60000;
  for (;;) {
    const p = apiPid();
    if (p === null) break;
    if (Date.now() > killDeadline) throw new Error(`[${label}] eski dinleyici 60 s icinde olmedi (PID ${p})`);
    await new Promise((r) => setTimeout(r, 500));
  }
  L.log(`      [${label}] eski dinleyici oldu (+${Date.now() - t0} ms)`);

  const start = ps(`Start-ScheduledTask -TaskName '${TASK_NAME}'`);
  if (start.code !== 0) throw new Error(`[${label}] gorev baslatilamadi: ${start.err || start.out}`);

  // (ii) istek isliyor mu
  //
  // ⚠ 2026-09-10 OLAYI — BU BUTCE 60 s IDI VE YANLIS "TOPARLANMA BASARISIZ" URETTI.
  // Olculen gercek: `hukuk-task-host` pwsh'i spawn etmeden ONCE **994 dosya / 286.5 MB**
  // uzerinde tam butunluk kapanisi (FULL CLOSURE) yapar. host-api.log'dan:
  //     2026-09-08 23:15  ms=400      2026-09-09 18:15  ms=418
  //     2026-09-09 14:37  ms=2590     2026-09-09 18:30  ms=394
  //     2026-09-10 01:56  ms=**50698**   <- soguk dosya onbellegi; toplam ~61 s
  // Yani API BASLIYORDU; 60 s butcesi sadece ERKEN bitti. Sonuc: yanlis basarisizlik,
  // ardindan KOR bir ikinci stop/start — ki o da devam eden baslatmayi OLDURDU.
  // DERS: butce en yavas MESRU baslangictan buyuk olmali VE bekleme "ilerleme var mi"
  // olcumuyle desteklenmeli.
  const readyBudgetMs = Number(process.env.OW_API_READY_BUDGET_MS || 300000); // 5 dk
  const readyDeadline = Date.now() + readyBudgetMs;
  let ready = false;
  let lastProgress = '';
  for (;;) {
    if (await apiAnswering(base)) { ready = true; break; }
    // ILERLEME KANITI: baslatici zinciri ayakta mi? (host -> pwsh -> node)
    const prog = launcherProgress();
    if (prog !== lastProgress) {
      lastProgress = prog;
      L.log(`      [${label}] bekleniyor (+${Math.round((Date.now() - t0) / 1000)} s) · zincir: ${prog}`);
    }
    if (Date.now() > readyDeadline) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const readyMs = Date.now() - t0;
  if (!ready) {
    // KOR TEKRAR YASAK: baslatma DEVAM EDIYOR olabilir. Ikinci bir stop/start onu OLDURUR.
    throw new Error(
      `[${label}] API ${Math.round(readyBudgetMs / 1000)} s icinde istek islemedi — `
      + `zincir durumu: ${launcherProgress()}. `
      + 'UYARI: baslatma DEVAM EDIYOR olabilir (butunluk kapanisi ~51 s surebilir). '
      + 'IKINCI BIR stop/start KOSMAYIN; once C:/Ops/hukuk/logs/api/host-api.log son satirina bakin.',
    );
  }

  // (i) PID DEGISTI mi
  const newPid = apiPid();
  if (newPid === null) throw new Error(`[${label}] yeni API PID OLCULEMEDI`);
  if (oldPid !== null && newPid === oldPid) {
    throw new Error(`[${label}] PID DEGISMEDI (${newPid}) — eski surec yasiyor olabilir`);
  }

  // (iii) bayrak UCTAN teyit
  let flagVerdict = 'OLCULEMEDI';
  if (token) {
    const pr = await probeFlagEndpoint(base, token);
    flagVerdict = pr.verdict;
    if (expectFlag && flagVerdict !== expectFlag) {
      throw new Error(`[${label}] bayrak uctan '${flagVerdict}' olctuk, '${expectFlag}' bekleniyordu`);
    }
  }

  L.log(`      [${label}] TOPARLANDI · PID ${oldPid} -> ${newPid} · hazir ${readyMs} ms · bayrak(uc) ${flagVerdict}`);
  return { oldPid, newPid, readyMs, flagVerdict };
}

module.exports = {
  FLAG_KEY, TASK_NAME, resolveEnvFile, apiPid, launcherProgress,
  readFlagFile, setFlagFile, apiAnswering, probeFlagEndpoint, restartApiAndVerify,
};
