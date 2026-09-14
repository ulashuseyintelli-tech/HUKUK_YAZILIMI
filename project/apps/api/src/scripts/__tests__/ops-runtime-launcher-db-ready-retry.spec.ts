/**
 * OFFICE A3 — API baslaticisi DB-hazir yeniden denemesi (project/ops/runtime-launcher/start-api.ps1).
 *
 * Baslaticinin GERCEK fonksiyonlari (Invoke-HLApiMain -> lock -> DB kimligi -> Wait-HLDbReady -> cocuk)
 * pwsh ile dot-source edilerek izole gecici dizinde kosulur. Canli dosyalara, gorevlere, .env'e ve
 * veritabanina DOKUNULMAZ: db-readiness.js yerine senaryo dosyasini okuyan sahte yardimci, main.js
 * yerine yalniz spawn kaydi yazan sahte giris kullanilir. Get-NetTCPConnection (yalniz Windows) bos
 * donen bir fonksiyonla golgelenir; port kimligi bu testin konusu degildir.
 *
 * pwsh bulunamazsa test ATLANMAZ, DUSER (CI'da sessiz gecis olmasin).
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const LAUNCHER = path.resolve(__dirname, '../../../../../ops/runtime-launcher/start-api.ps1');
const SECRET = 'TopSecretTestOnly';
const TRANSIENT = '23|DB_ERROR_UNCLASSIFIED code=none';

const HELPER_JS = `'use strict';
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const lines = fs.readFileSync(path.join(dir, 'scenario.txt'), 'utf8').split('\\n').filter(Boolean);
const counter = path.join(dir, 'counter.txt');
const n = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
fs.writeFileSync(counter, String(n + 1));
fs.appendFileSync(path.join(dir, 'probes.log'), String(n + 1) + '\\n');
const line = lines[Math.min(n, lines.length - 1)];
const sep = line.indexOf('|');
process.stdout.write(line.slice(sep + 1) + '\\ndetail postgresql://acc_user:${SECRET}@localhost:5432/hukuk_db\\n');
process.stderr.write('stderr password=${SECRET}\\n');
process.exitCode = Number(line.slice(0, sep));
`;

const ENTRY_JS = `require('fs').appendFileSync(require('path').join(__dirname, 'spawns.log'), process.pid + '\\n');\n`;

const DRIVER_PS1 = `param(
  [Parameter(Mandatory)][string]$Launcher,
  [Parameter(Mandatory)][string]$Root,
  [Parameter(Mandatory)][string]$NodeExe,
  [int]$Attempts = 24,
  [int]$PollSec = 0,
  [int]$Max = -1,
  [int]$Window = -1,
  [switch]$LegacyConfig
)
$ErrorActionPreference = 'Stop'
function Get-NetTCPConnection { [CmdletBinding()] param([int]$LocalPort, [string]$State) }
. $Launcher
$cfg = Get-HLApiDefaultConfig
Write-Output ('HLTEST_DEFAULTS=' + $cfg['DbAttempts'] + ',' + $cfg['DbPollSec'] + ',' + $cfg['DbUnclassifiedRetryMax'] + ',' + $cfg['DbUnclassifiedWindowSec'])
$cfg.NodeExe = $NodeExe
$cfg.NodeSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $NodeExe).Hash
$cfg.ReleaseRoot = $Root
$cfg.WorkDir = $Root
$cfg.EntryJs = Join-Path $Root 'entry.js'
$cfg.EnvFile = Join-Path $Root 'api.env'
$cfg.HelperJs = Join-Path $Root 'helper.js'
$cfg.HelperSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $cfg.HelperJs).Hash
$cfg.LogDir = Join-Path $Root 'logs'
$cfg.LockPath = Join-Path $cfg.LogDir 'launch.lock'
$cfg.BindTimeoutSec = 30
$cfg.DbAttempts = $Attempts
$cfg.DbPollSec = $PollSec
if ($LegacyConfig) { $cfg.Remove('DbUnclassifiedRetryMax'); $cfg.Remove('DbUnclassifiedWindowSec') }
if ($Max -ge 0) { $cfg.DbUnclassifiedRetryMax = $Max }
if ($Window -ge 0) { $cfg.DbUnclassifiedWindowSec = $Window }
$code = Invoke-HLApiMain -Cfg $cfg
Write-Output ('HLTEST_EXIT=' + $code)
`;

interface RunOptions {
  attempts?: number;
  pollSec?: number;
  max?: number;
  window?: number;
  legacyConfig?: boolean;
}

interface RunResult {
  exit: number;
  defaults: string;
  probes: number;
  spawns: number;
  launcherLog: string;
}

const roots: string[] = [];

function pwshAvailable(): boolean {
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], {
    encoding: 'utf8',
  });
  return r.status === 0 && Number(String(r.stdout).trim()) >= 7;
}

function makeRoot(scenario: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a3-launcher-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'helper.js'), HELPER_JS);
  fs.writeFileSync(path.join(root, 'entry.js'), ENTRY_JS);
  fs.writeFileSync(path.join(root, 'driver.ps1'), DRIVER_PS1);
  fs.writeFileSync(path.join(root, 'scenario.txt'), scenario.join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'api.env'), `DATABASE_URL="postgresql://acc_user:${SECRET}@localhost:5432/hukuk_db"\n`);
  return root;
}

function driverArgs(root: string, o: RunOptions): string[] {
  const a = [
    '-NoProfile', '-NonInteractive', '-File', path.join(root, 'driver.ps1'),
    '-Launcher', LAUNCHER, '-Root', root, '-NodeExe', process.execPath,
    '-Attempts', String(o.attempts ?? 24), '-PollSec', String(o.pollSec ?? 0),
  ];
  if (o.max !== undefined) a.push('-Max', String(o.max));
  if (o.window !== undefined) a.push('-Window', String(o.window));
  if (o.legacyConfig) a.push('-LegacyConfig');
  return a;
}

function countLines(file: string): number {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0;
}

function collect(root: string, stdout: string, stderr: string, status: number | null): RunResult {
  const m = /HLTEST_EXIT=(\d+)/.exec(stdout);
  if (!m) {
    throw new Error(`driver HLTEST_EXIT basmadi (status=${status})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  const d = /HLTEST_DEFAULTS=([^\r\n]*)/.exec(stdout);
  const logFile = path.join(root, 'logs', 'launcher.log');
  return {
    exit: Number(m[1]),
    defaults: d ? d[1] : '',
    probes: countLines(path.join(root, 'probes.log')),
    spawns: countLines(path.join(root, 'spawns.log')),
    launcherLog: fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '',
  };
}

function runLauncher(scenario: string[], o: RunOptions = {}): RunResult {
  const root = makeRoot(scenario);
  const r = spawnSync('pwsh', driverArgs(root, o), { encoding: 'utf8', timeout: 90_000 });
  return collect(root, String(r.stdout), String(r.stderr), r.status);
}

function allLogText(root: string): string {
  const dir = path.join(root, 'logs');
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}

describe('OFFICE A3 — API baslaticisi DB-hazir sinirli yeniden denemesi', () => {
  jest.setTimeout(120_000);

  beforeAll(() => {
    expect(fs.existsSync(LAUNCHER)).toBe(true);
    expect(pwshAvailable()).toBe(true);
  });

  afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });

  it('canli varsayilanlar: 24 deneme x 5 sn butcesi korunur, kodsuz 23 siniri 12 deneme / 90 sn', () => {
    const r = runLauncher(['0|DB_READY']);
    expect(r.defaults).toBe('24,5,12,90');
    expect(r.exit).toBe(0);
    expect(r.probes).toBe(1);
    expect(r.spawns).toBe(1);
  });

  it('DB sonradan hazir olur: 20, 20, kodsuz 23, kodsuz 23, 0 -> tek cocuk baslar, cikis 0', () => {
    const r = runLauncher(['20|DB_UNAVAILABLE', '20|DB_UNAVAILABLE', TRANSIENT, TRANSIENT, '0|DB_READY']);
    expect(r.exit).toBe(0);
    expect(r.probes).toBe(5);
    expect(r.spawns).toBe(1);
    expect(r.launcherLog).toContain('bounded retry 1/12');
    expect(r.launcherLog).toContain('bounded retry 2/12');
    expect(r.launcherLog).toContain('db ready (application-credential SELECT 1)');
  });

  it('deneme siniri tukenir: kodsuz 23 surekli, Max=3 -> 4 probe sonra cikis 23, cocuk YOK', () => {
    const r = runLauncher([TRANSIENT], { max: 3, window: 600 });
    expect(r.exit).toBe(23);
    expect(r.probes).toBe(4);
    expect(r.spawns).toBe(0);
    expect(r.launcherLog).toContain('DB_NOT_READY(UNCLASSIFIED) exit 23');
  });

  it('sure siniri tukenir: kodsuz 23 surekli, Window=1 sn, PollSec=1 -> 2 probe sonra cikis 23', () => {
    const r = runLauncher([TRANSIENT], { max: 100, window: 1, pollSec: 1 });
    expect(r.exit).toBe(23);
    expect(r.probes).toBe(2);
    expect(r.spawns).toBe(0);
  });

  it('genel DbAttempts butcesi asilmaz: kodsuz 23 surekli, Attempts=5 -> 5 probe, cikis 23', () => {
    const r = runLauncher([TRANSIENT], { attempts: 5, max: 12, window: 600 });
    expect(r.exit).toBe(23);
    expect(r.probes).toBe(5);
    expect(r.spawns).toBe(0);
  });

  it('butce UNAVAILABLE ile biterse eski TIMEOUT korunur: kodsuz 23, 20, 20 / Attempts=3 -> cikis 10', () => {
    const r = runLauncher([TRANSIENT, '20|DB_UNAVAILABLE', '20|DB_UNAVAILABLE'], { attempts: 3 });
    expect(r.exit).toBe(10);
    expect(r.probes).toBe(3);
    expect(r.spawns).toBe(0);
  });

  it.each([
    ['kodlu 23 (P1003)', 23, '23|DB_ERROR_UNCLASSIFIED code=P1003'],
    ['kimlik dogrulama 21', 19, '21|DB_AUTH_FAILED'],
    ['kimlik uyusmazligi 22', 13, '22|DB_IDENTITY_MISMATCH host=db.example port=1 db=other'],
    ['env eksik 24', 14, '24|DB_ENV_MISSING'],
    ['url ayristirma 25', 14, '25|DB_URL_PARSE_FAILED'],
  ])('kalici hata tekrar dongusune girmez: %s -> tek probe, cikis %i, cocuk YOK', (_name, code, line) => {
    const r = runLauncher([line, '0|DB_READY']);
    expect(r.exit).toBe(code);
    expect(r.probes).toBe(1);
    expect(r.spawns).toBe(0);
  });

  it('gecici hata sonrasi kalici hata gelirse hemen durur: kodsuz 23, 21 -> 2 probe, cikis 19', () => {
    const r = runLauncher([TRANSIENT, '21|DB_AUTH_FAILED', '0|DB_READY']);
    expect(r.exit).toBe(19);
    expect(r.probes).toBe(2);
    expect(r.spawns).toBe(0);
  });

  it('geriye uyumluluk: yeni anahtarlar yoksa kodsuz 23 eskisi gibi hemen cikis 23', () => {
    const r = runLauncher([TRANSIENT, '0|DB_READY'], { legacyConfig: true });
    expect(r.exit).toBe(23);
    expect(r.probes).toBe(1);
    expect(r.spawns).toBe(0);
  });

  it('sirlar loglanmaz: token/stdout/stderr ve .env parolasi launcher ve cocuk loglarinda yok', () => {
    const root = makeRoot([
      `20|DB_UNAVAILABLE postgresql://acc_user:${SECRET}@localhost:5432/hukuk_db`,
      TRANSIENT,
      '0|DB_READY',
    ]);
    const r = spawnSync('pwsh', driverArgs(root, {}), { encoding: 'utf8', timeout: 90_000 });
    const res = collect(root, String(r.stdout), String(r.stderr), r.status);
    expect(res.exit).toBe(0);
    expect(res.spawns).toBe(1);
    const logs = allLogText(root);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain(SECRET);
    expect(String(r.stdout)).not.toContain(SECRET);
  });

  it('yeniden deneme sirasinda ikinci baslatici cocuk URETMEZ (LAUNCHER_BUSY) ve toplam tek cocuk olur', async () => {
    const root = makeRoot([TRANSIENT, TRANSIENT, TRANSIENT, TRANSIENT, '0|DB_READY']);
    const first = spawn('pwsh', driverArgs(root, { pollSec: 1 }), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out1 = '';
    let err1 = '';
    first.stdout.on('data', (b: Buffer) => { out1 += b.toString(); });
    first.stderr.on('data', (b: Buffer) => { err1 += b.toString(); });
    const done = new Promise<number | null>((resolve) => first.on('close', resolve));

    const probes = path.join(root, 'probes.log');
    const deadline = Date.now() + 60_000;
    while (countLines(probes) < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(countLines(probes)).toBeGreaterThanOrEqual(1);

    const second = spawnSync('pwsh', driverArgs(root, { pollSec: 1 }), { encoding: 'utf8', timeout: 90_000 });
    const secondExit = /HLTEST_EXIT=(\d+)/.exec(String(second.stdout));
    expect(secondExit && Number(secondExit[1])).toBe(0);
    expect(countLines(path.join(root, 'spawns.log'))).toBe(0);

    const status = await done;
    const r1 = collect(root, out1, err1, status);
    expect(r1.exit).toBe(0);
    expect(r1.spawns).toBe(1);
    expect(r1.probes).toBe(5);
    expect(r1.launcherLog).toContain('LAUNCHER_BUSY');
    expect((r1.launcherLog.match(/child spawned pid=/g) || []).length).toBe(1);
  });
});
