/*
 * OFFICE C123 KABUL — YALNIZ PROVA ICIN IZOLE API BASLATICISI (canlida KULLANILMAZ)
 *
 *   node c-start-api.js [--port 8113]            # C123_DIST_ROOT'taki dist'i oturuma ozel disposable DB'ye bagli baslatir
 *   node c-start-api.js --stop [--port 8113]     # YALNIZ bu betigin baslattigi dist surecini durdurur
 *
 * IZOLASYON (fail-closed; AK paketindeki ak-start-api.js ile ayni desen):
 *   - C123_DATABASE_URL YALNIZ 127.0.0.1:5456/hukuk_office_c123_acc_test olabilir; 8080/3002 portlari REDDEDILIR.
 *   - Kabuk ortami DEVRALINMAZ: surece yalniz asagidaki anahtarlar verilir. JWT_SECRET bu kosum icin uretilir.
 *   - REDIS_URL / PUBLIC_INTAKE_REDIS_URL dinleyicisi OLMAYAN loopback porta yoneltilir (canli 6379 HEDEFLENMEZ).
 *   - EMAIL_PROVIDER=mock (disari gonderim yok).
 *   - FD: CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED=true (zincir icin gerekli; canlida acik).
 *         CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED VERILMEZ (yayin/gonderim ucu kapali; ayrica G-5).
 *     OFFICE_APPROVAL_EXECUTOR_ENABLED VERILMEZ (onaylanan talepler cron ile yurutulmez).
 *   - Dist dosyalarina YAZILMAZ; calisma dizini (C123_WORK_DIR) ayridir ve icinde `.env` OLAMAZ.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const ARGS = process.argv.slice(2);
const argOf = (n, d) => { const i = ARGS.indexOf(`--${n}`); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d; };
const has = (n) => ARGS.includes(`--${n}`);

const PORT = String(argOf('port', '8113'));
if (['8080', '3002', '5432', '5456', '6379'].includes(PORT) || Number(PORT) < 1025) throw new Error(`port ${PORT} yasak`);
const DEAD_REDIS = 'redis://127.0.0.1:6391';
const DIST_ROOT = process.env.C123_DIST_ROOT || '';
const DIST = DIST_ROOT ? path.join(DIST_ROOT, 'main.js') : '';

const WORK = (() => { const raw = process.env.C123_WORK_DIR || process.cwd(); try { return fs.realpathSync.native(raw); } catch (e) { return raw; } })();
if (/~\d/.test(WORK)) throw new Error(`calisma dizini 8.3 kisa ad iceriyor (${WORK}) — C123_WORK_DIR ile UZUN yol verin`);
const CONFIG = path.join(WORK, `c123-api-${PORT}.json`);

function ps(script) {
  const enc = Buffer.from(`$ProgressPreference='SilentlyContinue'; ${script}; exit 0`, 'utf16le').toString('base64');
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function listener(port) {
  const out = ps(`$c = Get-NetTCPConnection -State Listen -LocalPort ${Number(port)} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); [string]$c.OwningProcess + '|' + $p.CommandLine }`);
  if (!out) return null;
  const i = out.indexOf('|');
  return { pid: Number(out.slice(0, i)), cmd: out.slice(i + 1) };
}
function dbConnections(pid) {
  const out = ps(`@(Get-NetTCPConnection -OwningProcess ${Number(pid)} -State Established -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -in 5432,5456,6379 } | ForEach-Object { $_.RemotePort }) -join ','`);
  const ports = out ? out.split(',') : [];
  return { 5432: ports.filter((p) => p === '5432').length, 5456: ports.filter((p) => p === '5456').length, 6379: ports.filter((p) => p === '6379').length };
}

(async () => {
  if (has('stop')) {
    const l = listener(PORT);
    if (!l) { console.log(JSON.stringify({ record: 'C123-API-STOP', port: PORT, running: false })); return; }
    const own = DIST && l.cmd.replace(/\\/g, '/').includes(DIST.replace(/\\/g, '/'));
    if (!own) throw new Error(`port ${PORT} dinleyicisi bu betigin dist sureci DEGIL — durdurulmadi: ${l.cmd}`);
    execFileSync('taskkill.exe', ['/PID', String(l.pid), '/T', '/F'], { stdio: 'ignore' });
    try { fs.unlinkSync(CONFIG); } catch (e) { /* yoksa sorun degil */ }
    console.log(JSON.stringify({ record: 'C123-API-STOP', port: PORT, stoppedPid: l.pid }));
    return;
  }
  if (!DIST || !fs.existsSync(DIST)) throw new Error(`C123_DIST_ROOT/main.js bulunamadi (${DIST})`);
  const dbUrl = process.env.C123_DATABASE_URL || '';
  const u = new URL(dbUrl);
  if (!(['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === '5456' && u.pathname === '/hukuk_office_c123_acc_test')) {
    throw new Error('C123_DATABASE_URL yalniz 127.0.0.1:5456/hukuk_office_c123_acc_test olabilir (prova)');
  }
  if (listener(PORT)) throw new Error(`port ${PORT} zaten dinleniyor — once --stop`);
  if (fs.existsSync(path.join(WORK, '.env'))) throw new Error(`calisma dizininde .env var (${WORK})`);

  const keep = ['SystemRoot', 'windir', 'ComSpec', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS'];
  const env = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, {
    DATABASE_URL: dbUrl, PORT, NODE_ENV: 'development', JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    CORS_ORIGIN: 'http://127.0.0.1:3999', EMAIL_PROVIDER: 'mock', EMAIL_FROM: 'noreply@office-acceptance.invalid',
    REDIS_URL: DEAD_REDIS, PUBLIC_INTAKE_REDIS_URL: DEAD_REDIS,
    CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED: 'true',
  });
  const out = fs.openSync(path.join(WORK, `c123-api-${PORT}.out.log`), 'a');
  const err = fs.openSync(path.join(WORK, `c123-api-${PORT}.err.log`), 'a');
  const child = spawn(process.execPath, [DIST], { cwd: WORK, env, detached: true, stdio: ['ignore', out, err] });
  child.unref();

  let l = null;
  for (let i = 0; i < 90 && !l; i += 1) { await new Promise((r) => setTimeout(r, 1000)); l = listener(PORT); }
  if (!l) throw new Error(`API ${PORT} portunda dinlemeye BASLAMADI — ${path.join(WORK, `c123-api-${PORT}.err.log`)}`);
  if (!l.cmd.replace(/\\/g, '/').includes(DIST.replace(/\\/g, '/'))) throw new Error(`dinleyici beklenen dist DEGIL: ${l.cmd}`);
  await new Promise((r) => setTimeout(r, 3000));
  const conns = dbConnections(l.pid);
  const config = {
    record: 'C123-API-CONFIG', startedAt: new Date().toISOString(), pid: l.pid, port: PORT,
    apiBaseUrl: `http://127.0.0.1:${PORT}/api`, distMain: DIST, distMainIsNotBuildIdentity: true,
    db: `${u.hostname}:${u.port}${u.pathname}`, redis: DEAD_REDIS, emailProvider: 'mock',
    fdWriteEnabled: true, fdPublicationEnabled: false, officeApprovalExecutorEnabled: false, secretsInConfig: false,
    connections: conns, isolated: conns['5432'] === 0 && conns['6379'] === 0,
  };
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 1) + '\n', 'utf8');
  console.log(JSON.stringify(config, null, 1));
  if (!config.isolated) { console.error('IZOLASYON IHLALI: canli DB/Redis baglantisi goruldu — API durdurulmali'); process.exitCode = 3; }
})().catch((e) => { console.error('API BASLATMA HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
