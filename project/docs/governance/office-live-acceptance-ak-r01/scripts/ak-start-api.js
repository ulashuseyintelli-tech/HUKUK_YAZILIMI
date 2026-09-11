/*
 * OFFICE AK KABUL — YALNIZ PROVA ICIN IZOLE API BASLATICISI (canlida KULLANILMAZ)
 *
 *   node ak-start-api.js --dist r22|r21 [--port 8102]     # oturuma ozel disposable DB'ye bagli API
 *   node ak-start-api.js --stop [--port 8102]              # YALNIZ bu betigin baslattigi dist surecini durdurur
 *
 * IZOLASYON (fail-closed):
 *   - AK_DATABASE_URL YALNIZ 127.0.0.1:5441/hukuk_office_ak_acc_test olabilir; port 8080/3002 REDDEDILIR.
 *   - Kabuk ortami DEVRALINMAZ: surece yalniz asagidaki anahtarlar verilir (canli .env / kabuktaki
 *     DATABASE_URL vb. sizamaz). JWT_SECRET bu kosum icin uretilir, hicbir yere yazilmaz.
 *   - REDIS_URL / PUBLIC_INTAKE_REDIS_URL dinleyicisi OLMAYAN loopback porta yoneltilir: canli
 *     `hukuk-redis` (6379) HICBIR KOSULDA hedeflenmez (public-intake-rate-limit.store.ts:47-48 varsayilani).
 *   - EMAIL_PROVIDER=mock (disari gonderim yok). Calisma dizini UZUN yol (8.3 kisa ad urunde reddedilir)
 *     ve icinde `.env` OLAMAZ (tek kaynakli ortam).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const ARGS = process.argv.slice(2);
const argOf = (n, d) => { const i = ARGS.indexOf(`--${n}`); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d; };
const has = (n) => ARGS.includes(`--${n}`);

const DISTS = {
  r22: 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/dist/apps/api/src/main.js',
  r21: 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/dist/apps/api/src/main.js',
};
const PORT = String(argOf('port', '8102'));
if (['8080', '3002', '5432', '5441', '6379'].includes(PORT) || Number(PORT) < 1025) throw new Error(`port ${PORT} yasak`);
const DEAD_REDIS = 'redis://127.0.0.1:6390';

const WORK = (() => { const raw = process.env.AK_WORK_DIR || process.cwd(); try { return fs.realpathSync.native(raw); } catch (e) { return raw; } })();
if (/~\d/.test(WORK)) throw new Error(`calisma dizini 8.3 kisa ad iceriyor (${WORK}) — AK_WORK_DIR ile UZUN yol verin`);
const CONFIG = path.join(WORK, `ak-api-${PORT}.json`);

function ps(script) {
  // Ilerleme akisi KAPALI + stderr YAKALANIR: aksi halde alt PowerShell CLIXML ilerleme kayitlarini
  // ebeveynin stderr'ine yazar ve cagiran kabuk bunu hata sanar (prova 1'de olculdu).
  // `exit 0`: sonuc bulunamamasi (or. dinleyici yok) `$?`'i false birakir ve powershell 1 ile cikar;
  // bu MESRU bir "yok" sonucudur, hata degil. Gercek betik hatasi yine istisna uretir.
  const enc = Buffer.from(`$ProgressPreference='SilentlyContinue'; ${script}; exit 0`, 'utf16le').toString('base64');
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function listener(port) {
  const out = ps(`$c = Get-NetTCPConnection -State Listen -LocalPort ${Number(port)} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); [string]$c.OwningProcess + '|' + $p.CommandLine }`);
  if (!out) return null;
  const i = out.indexOf('|');
  return { pid: Number(out.slice(0, i)), cmd: out.slice(i + 1) };
}
function dbConnections(pid) {
  const out = ps(`@(Get-NetTCPConnection -OwningProcess ${Number(pid)} -State Established -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -in 5432,5441,6379 } | ForEach-Object { $_.RemotePort }) -join ','`);
  const ports = out ? out.split(',') : [];
  return { 5432: ports.filter((p) => p === '5432').length, 5441: ports.filter((p) => p === '5441').length, 6379: ports.filter((p) => p === '6379').length };
}

(async () => {
  if (has('stop')) {
    const l = listener(PORT);
    if (!l) { console.log(JSON.stringify({ record: 'AK-API-STOP', port: PORT, running: false })); return; }
    const own = Object.values(DISTS).some((d) => l.cmd.replace(/\\/g, '/').includes(d));
    if (!own) throw new Error(`port ${PORT} dinleyicisi bu betigin dist sureci DEGIL — durdurulmadi: ${l.cmd}`);
    execFileSync('taskkill.exe', ['/PID', String(l.pid), '/T', '/F'], { stdio: 'ignore' });
    try { fs.unlinkSync(CONFIG); } catch (e) { /* yoksa sorun degil */ }
    console.log(JSON.stringify({ record: 'AK-API-STOP', port: PORT, stoppedPid: l.pid }));
    return;
  }

  const distKey = argOf('dist', '');
  const DIST = DISTS[distKey];
  if (!DIST) throw new Error('--dist r22|r21 ZORUNLU');
  const dbUrl = process.env.AK_DATABASE_URL || '';
  const u = new URL(dbUrl);
  if (!(['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === '5441' && u.pathname === '/hukuk_office_ak_acc_test')) {
    throw new Error('AK_DATABASE_URL yalniz 127.0.0.1:5441/hukuk_office_ak_acc_test olabilir (prova)');
  }
  if (listener(PORT)) throw new Error(`port ${PORT} zaten dinleniyor — once --stop`);
  if (fs.existsSync(path.join(WORK, '.env'))) throw new Error(`calisma dizininde .env var (${WORK}) — tek kaynakli ortam icin kaldirin/baska dizin`);

  const keep = ['SystemRoot', 'windir', 'ComSpec', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS'];
  const env = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, {
    DATABASE_URL: dbUrl, PORT, NODE_ENV: 'development', JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    CORS_ORIGIN: 'http://127.0.0.1:3999', EMAIL_PROVIDER: 'mock', EMAIL_FROM: 'noreply@office-acceptance.invalid',
    REDIS_URL: DEAD_REDIS, PUBLIC_INTAKE_REDIS_URL: DEAD_REDIS,
  });
  const out = fs.openSync(path.join(WORK, `ak-api-${PORT}.out.log`), 'a');
  const err = fs.openSync(path.join(WORK, `ak-api-${PORT}.err.log`), 'a');
  const child = spawn(process.execPath, [DIST], { cwd: WORK, env, detached: true, stdio: ['ignore', out, err] });
  child.unref();

  let l = null;
  for (let i = 0; i < 60 && !l; i += 1) { await new Promise((r) => setTimeout(r, 1000)); l = listener(PORT); }
  if (!l) throw new Error(`API ${PORT} portunda dinlemeye BASLAMADI — ${path.join(WORK, `ak-api-${PORT}.err.log`)}`);
  if (!l.cmd.replace(/\\/g, '/').includes(DIST)) throw new Error(`dinleyici beklenen dist DEGIL: ${l.cmd}`);
  await new Promise((r) => setTimeout(r, 3000));
  const conns = dbConnections(l.pid);
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase();
  const distSha256 = sha(DIST);
  // main.js derlemeler arasinda AYNI cikabilir (r21 = r22 olculdu): kimlik DEGISEN dosyalarla kurulur.
  const modDir = path.join(path.dirname(DIST), 'modules');
  const lawyerSvc = path.join(modDir, 'lawyer', 'lawyer.service.js');
  const f01Guard = path.join(modDir, 'office-approval', 'office-f01-authorization.guard.js');
  const discriminators = {
    lawyerServiceSha256: sha(lawyerSvc), f01GuardSha256: sha(f01Guard),
    ak2DenyTextPresent: fs.readFileSync(lawyerSvc, 'utf8').includes('tarafından atanabilir'),
  };
  const config = {
    record: 'AK-API-CONFIG', startedAt: new Date().toISOString(), pid: l.pid, port: PORT,
    apiBaseUrl: `http://127.0.0.1:${PORT}/api`, dist: distKey, distMain: DIST, distMainSha256: distSha256,
    distMainIsNotBuildIdentity: true, discriminators,
    db: `${u.hostname}:${u.port}${u.pathname}`, redis: DEAD_REDIS, emailProvider: 'mock', secretsInConfig: false,
    connections: conns, isolated: conns['5432'] === 0 && conns['6379'] === 0,
  };
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 1) + '\n', 'utf8');
  console.log(JSON.stringify(config, null, 1));
  if (!config.isolated) { console.error('IZOLASYON IHLALI: canli DB/Redis baglantisi goruldu — API durdurulmali'); process.exitCode = 3; }
})().catch((e) => { console.error('API BASLATMA HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
