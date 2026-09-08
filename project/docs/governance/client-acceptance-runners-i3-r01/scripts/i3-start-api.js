/*
 * İ3 — YEREL PROVA API BAŞLATICISI (YAPILANDIRMANIN TEK KAYNAĞI)
 *
 * NEDEN: API'yi bir komutla, ön kontrolü başka bir `I3_API_*` beyanıyla beslemek İKİ AYRI
 * KAYNAK demektir; ikisi sessizce ayrışabilir ve "etkin ayar" iddiası dayanaksız kalır.
 * Bu betik API'yi başlatır **ve** kullandığı etkin yapılandırmayı bir dosyaya yazar;
 * `i3-run.js` yalnız o dosyayı okur, ayrı beyan KABUL ETMEZ.
 *
 * Yazılan yapılandırma sırların DEĞERİNİ içermez (yalnız varlık bilgisi).
 *
 * KULLANIM
 *   node i3-start-api.js --provider smtp   # onaylı sağlayıcı senaryosu
 *   node i3-start-api.js --provider mock   # allowlist DIŞI senaryo
 *   node i3-start-api.js --provider mock --bypass-allowlist   # NEGATİF PROVA
 *   node i3-start-api.js --stop
 */
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const ARGS = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = ARGS.indexOf(`--${name}`);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : dflt;
};
const hasFlag = (name) => ARGS.includes(`--${name}`);

// 8.3 KISA AD TUZAGI: urun `assertNoReparse` korumasi kisa ad (ULASTE~1) ile uzun adi
// "yol yeniden yonlendiriliyor" sayip REDDEDER. Calisma dizini UZUN ad olmali.
const WORK_RAW = process.env.I3_WORK_DIR || process.cwd();
const WORK = (() => {
  try { return fs.realpathSync.native(WORK_RAW); } catch (e) { return WORK_RAW; }
})();
if (/~\d/.test(WORK)) {
  throw new Error(`calisma dizini 8.3 KISA AD iceriyor (${WORK}) — urun assertNoReparse `
    + 'bunu reddeder; UZUN yol verin (I3_WORK_DIR)');
}
const CONFIG_FILE = process.env.I3_API_CONFIG || path.join(WORK, 'i3-api-config.json');
const SPY_FILE = path.join(WORK, 'i3-spy-counters.json');
const CAPTURE = process.env.I3_SMTP_CAPTURE || path.join(WORK, 'i3-smtp-capture');

const API_PORT = Number(process.env.I3_API_PORT || 8099);
const SMTP_PORT = Number(process.env.I3_SMTP_PORT || 2526);
const DIST_MAIN = process.env.I3_DIST_MAIN
  || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/dist/apps/api/src/main.js';
const DB_URL = process.env.AH_DATABASE_URL;

function listenersOn(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop())
      .filter((x) => /^\d+$/.test(x)))];
  } catch (e) { return []; }
}

function stopApi() {
  const pids = listenersOn(API_PORT);
  for (const pid of pids) {
    try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch (e) { /* zaten olmus */ }
  }
  try { fs.unlinkSync(CONFIG_FILE); } catch (e) { /* yoksa sorun degil */ }
  return pids;
}

function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = new net.Socket(); let done = false;
    const fin = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok); } };
    s.setTimeout(timeoutMs);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));
    s.once('error', () => fin(false));
    s.connect(port, host);
  });
}

(async () => {
  if (hasFlag('stop')) {
    const pids = stopApi();
    console.log(JSON.stringify({ record: 'I3-API-STOPPED', killed: pids }, null, 1));
    return;
  }

  if (!DB_URL) throw new Error('AH_DATABASE_URL tanimli degil — fail-closed durur');
  const provider = (argOf('provider', '') || '').toLowerCase();
  if (!['smtp', 'mock'].includes(provider)) {
    throw new Error(`--provider smtp|mock ZORUNLU (verilen: '${provider || 'yok'}')`);
  }
  const bypass = hasFlag('bypass-allowlist');

  stopApi();
  await new Promise((r) => setTimeout(r, 2500));
  fs.mkdirSync(CAPTURE, { recursive: true });
  try { fs.unlinkSync(SPY_FILE); } catch (e) { /* yoksa sorun degil */ }

  // Bu koşum için üretilen sırlar; canlı yapılandırmadan HİÇBİR değer kopyalanmaz.
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const instanceToken = crypto.randomBytes(8).toString('hex');

  // ETKİN TAŞIMA AYARI — API sürecine verilen değerlerin TA KENDİSİ.
  const smtpHost = '127.0.0.1';
  const env = {
    ...process.env,
    JWT_SECRET: jwtSecret,
    DATABASE_URL: DB_URL,
    PORT: String(API_PORT),
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://127.0.0.1:3999',
    EMAIL_PROVIDER: provider,
    SMTP_HOST: smtpHost,
    SMTP_PORT: String(SMTP_PORT),
    SMTP_USER: 'i3-sink@ah-harness.invalid',
    SMTP_PASS: 'i3-no-auth',
    EMAIL_FROM: 'noreply@ah-harness.invalid',
    CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED: 'true',
    CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED: 'true',
    I3_SPY_FILE: SPY_FILE,
    I3_SMTP_CAPTURE: CAPTURE,
    ...(bypass ? { I3_SPY_BYPASS_ALLOWLIST: '1' } : {}),
  };

  const out = fs.openSync(path.join(WORK, 'i3-api.out.log'), 'a');
  const err = fs.openSync(path.join(WORK, 'i3-api.err.log'), 'a');
  const child = spawn(process.execPath,
    ['--require', path.join(__dirname, 'i3-spy.js'), DIST_MAIN],
    { cwd: WORK, env, detached: true, stdio: ['ignore', out, err] });
  child.unref();

  // Dinleyici gelene kadar bekle (en çok ~40 sn).
  let pid = null;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const pids = listenersOn(API_PORT);
    if (pids.length) { pid = pids[0]; break; }
  }
  if (!pid) throw new Error(`API ${API_PORT} portunda dinlemeye BASLAMADI`);

  const apiUp = await probeTcp('127.0.0.1', API_PORT);
  const config = {
    record: 'I3-API-CONFIG',
    startedAt: new Date().toISOString(),
    instanceToken,               // bu ornegin kimligi
    pid: Number(pid),
    apiBaseUrl: `http://127.0.0.1:${API_PORT}/api`,
    apiPort: API_PORT,
    // ETKIN tasima ayari — API surecine VERILEN degerler (varsayilanla tamamlanmaz)
    emailProvider: provider,
    smtpHost,
    smtpPort: SMTP_PORT,
    sinkCaptureDir: CAPTURE,
    spyCounterFile: SPY_FILE,
    allowlistBypassed: bypass,
    secretsInConfig: false,      // sirlarin DEGERI burada YOK
    distMain: DIST_MAIN,
    apiReachable: apiUp,
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 1), 'utf8');
  console.log(JSON.stringify({ ...config, note: 'yapilandirma TEK KAYNAK: ' + CONFIG_FILE }, null, 1));
})().catch((e) => {
  console.error('API BASLATMA HATASI:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
