#!/usr/bin/env node
'use strict';

// =============================================================================
// GOVERNANCE SUITE RUNNER — P0-R1
//
// Amaç: governance full suite kosusunu (varsayilan:
// `node --test scripts/governance-coordination.test.cjs`) kalici artefakt,
// single-flight kilidi ve recovery ile sarmalamak. Suite'in test icerigine,
// assertion'larina, fail-closed davranisina ve CI merge kapisina DOKUNMAZ;
// dogrudan `node --test ...` cagrisi geriye uyumlu calismaya devam eder.
//
// Owner karari (P0-R1) geregi bu sarmalayici sunlari birlikte saglar:
//  - Immutable RUN_ID + iki ayri fingerprint (SUITE / EXECUTION)
//  - Makine-geneli bounded concurrency (LOCAL_FULL_GOVERNANCE_SUITE_CONCURRENCY=1)
//  - Ayni fingerprint'e attach; farkli fingerprint'e RESOURCE_BUSY
//  - Launcher olumu != STALE: LOST_CONTROLLER / ORPHAN_RUNNING siniflandirmasi
//  - Append-only timestamp'li log, heartbeat, atomic run.json, exact exit code
//  - Partial TAP ile final result'in karistirilmamasi
//  - PID+CreationDate ownership kaydi; kontrollu, yalniz-sahipli tree cleanup
//  - STALE_INPUT / WORKTREE_CHANGED_DURING_RUN / TEARDOWN_HANG ayrimi;
//    "testler bitti ama process agaci kapanmadi" hicbir kosulda PASS degildir.
//
// Artefaktlar git tarafindan izlenmeyen makine-geneli koordinasyon alanina
// yazilir; ayni repository'nin farkli clone/worktree'leri ayni alani gorur.
// Secret/token degeri artefaktlara yazilmaz (env degerleri kaydedilmez).
// =============================================================================

const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const WRAPPER_NAME = 'run-suite.cjs@P0-R1';

// Kosu sonuc durumlari (owner P0-R1.6 listesi).
const STATUS = Object.freeze({
  RUNNING: 'RUNNING',
  ATTACHED: 'ATTACHED',
  QUEUED: 'QUEUED',
  PASS: 'PASS',
  FAIL: 'FAIL',
  STALE_INPUT: 'STALE_INPUT',
  WORKTREE_CHANGED_DURING_RUN: 'WORKTREE_CHANGED_DURING_RUN',
  TEARDOWN_HANG: 'TEARDOWN_HANG',
  LOST_CONTROLLER: 'LOST_CONTROLLER',
  ORPHAN_RUNNING: 'ORPHAN_RUNNING',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  RESOURCE_BUSY: 'RESOURCE_BUSY',
  ABORTED_BY_OWNER: 'ABORTED_BY_OWNER',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

const TERMINAL_STATUSES = new Set([
  STATUS.PASS,
  STATUS.FAIL,
  STATUS.STALE_INPUT,
  STATUS.WORKTREE_CHANGED_DURING_RUN,
  STATUS.TEARDOWN_HANG,
  STATUS.ABORTED_BY_OWNER,
  STATUS.INTERNAL_ERROR,
]);

// Sarmalayici-duzeyi exit kodlari. PASS/FAIL child exit kodunun AYNEN
// gecirilmesidir; asagidakiler yalniz sarmalayicinin kendi durumlaridir.
const EXIT = Object.freeze({
  USAGE: 64,
  INTERNAL_ERROR: 70,
  RESOURCE_BUSY: 75,
  ORPHAN_RUNNING: 76,
  TEARDOWN_HANG: 77,
  STALE_INPUT: 78,
  WORKTREE_CHANGED_DURING_RUN: 79,
  ABORTED_BY_OWNER: 130,
});

const DEFAULT_TARGET = 'scripts/governance-coordination.test.cjs';
const GUARD_SOURCE = 'scripts/governance-coordination.cjs';
const POLICY_SOURCE =
  'docs/governance/governance-writer-coordination-protected-paths.json';

const HEARTBEAT_MS = envInt('GOV_SUITE_HEARTBEAT_MS', 10_000);
const TEARDOWN_GRACE_MS = envInt('GOV_SUITE_TEARDOWN_GRACE_MS', 120_000);
const ATTACH_POLL_MS = envInt('GOV_SUITE_ATTACH_POLL_MS', 500);
const HEARTBEAT_STALE_MS = envInt('GOV_SUITE_HEARTBEAT_STALE_MS', 60_000);

// `project/` koku: scripts/governance -> scripts -> project
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// Anahtar sirasi deterministik JSON (fingerprint hash'leri icin).
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',')}}`;
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  }
  return result;
}

function gitOut(args, options = {}) {
  const result = runGit(args, options);
  if (result.status !== 0) {
    if (options.allowFailure) return null;
    throw new Error(
      `git ${args.join(' ')} exited ${result.status}: ${String(result.stderr).slice(0, 400)}`,
    );
  }
  return String(result.stdout);
}

// ---------------------------------------------------------------------------
// Makine-geneli koordinasyon alani
//
// Ayni repository'nin farkli clone/worktree'leri ayni alani gormeli
// (owner P0-R1.2). Repository kimligi once origin URL'den, remote yoksa
// git common dir'den turetilir. Alan git tarafindan izlenmez (P0-R1.7).
// ---------------------------------------------------------------------------

function repositoryIdentity() {
  const origin = gitOut(['config', '--get', 'remote.origin.url'], {
    allowFailure: true,
  });
  if (origin && origin.trim()) {
    return `origin:${origin.trim().toLowerCase()}`;
  }
  const commonDir = gitOut(['rev-parse', '--git-common-dir']).trim();
  return `local:${path.resolve(PROJECT_ROOT, commonDir).toLowerCase()}`;
}

function stateRoot() {
  if (process.env.GOV_SUITE_STATE_ROOT) {
    return process.env.GOV_SUITE_STATE_ROOT;
  }
  if (process.platform === 'win32') {
    const base =
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'hukuk-governance-suite');
  }
  return path.join(os.homedir(), '.local', 'state', 'hukuk-governance-suite');
}

function repoStateDir(repoId) {
  return path.join(stateRoot(), repoId.slice(0, 24));
}

function lockDirPath(repoDir) {
  return path.join(repoDir, 'machine.lock');
}

function runsDir(repoDir) {
  return path.join(repoDir, 'runs');
}

// ---------------------------------------------------------------------------
// Atomic yazim (tmp + rename; repo'daki merge-authority-ledger deseni)
// ---------------------------------------------------------------------------

function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PID + CreationDate dogrulamasi (PID reuse korumasi, owner P0-R1.3 / kapi 9)
// ---------------------------------------------------------------------------

function processCreationTime(pid) {
  try {
    if (process.platform === 'win32') {
      for (const shell of ['powershell.exe', 'pwsh']) {
        const result = spawnSync(
          shell,
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc()`,
          ],
          { encoding: 'utf8', stdio: 'pipe', windowsHide: true, timeout: 15_000 },
        );
        if (result.status === 0 && result.stdout.trim()) {
          return result.stdout.trim();
        }
        if (result.status !== 0 && !result.error) {
          // Shell calisti ama process bulunamadi -> pid olu.
          return null;
        }
      }
      return null;
    }
    const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15_000,
    });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
    return null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

// Kayitli (pid, createdAt) ikilisinin dogrulamasi iki modda calisir:
//
// strict (kill karari): pid canli VE creation time EXACT eslesiyor olmali —
//   kimligi kanitlanamayan process ASLA oldurulmez.
// lenient (refusal/siniflandirma karari): pid canli ise ve creation time
//   MISMATCH kanitlanmadiysa canli sayilir. processCreationTime'in
//   "belirlenemedi" (null) donmesi olum kaniti DEGILDIR (PowerShell yoklugu/
//   timeout/erisim reddi); guvenli yon "canli varsay, yeni kosu baslatma"dir.
function ownershipRecordAlive(record, mode = 'strict') {
  if (!record || !Number.isInteger(record.pid)) return false;
  if (!pidAlive(record.pid)) return false;
  const current = processCreationTime(record.pid);
  if (mode === 'lenient') {
    if (current === null || record.createdAt == null) return true;
    return current === record.createdAt;
  }
  if (current === null) return false;
  return current === record.createdAt;
}

// ---------------------------------------------------------------------------
// Fingerprint'ler (owner P0-R1.1)
// ---------------------------------------------------------------------------

function worktreeDiffSha() {
  // Dirty delta: status (untracked adlar dahil) + tracked icerik diff'i.
  // Sinir: untracked dosya ICERIGI hash'e girmez; status satiri girer.
  const status = gitOut(['status', '--porcelain=v1', '-z']);
  const diff = gitOut(['diff', 'HEAD', '--no-color']);
  return sha256(status + '\u0000' + diff);
}

// Hedef mutlak path olabilir (test fixture'lari icin); kanonik akista
// repo-goreli DEFAULT_TARGET kullanilir.
function targetAbsPath(target) {
  return path.isAbsolute(target) ? target : path.join(PROJECT_ROOT, target);
}

function suiteSourceFiles(targetRel) {
  const files = [targetRel];
  if (targetRel === DEFAULT_TARGET) files.push(GUARD_SOURCE);
  files.push(POLICY_SOURCE);
  return [...new Set(files)].filter((rel) => fs.existsSync(targetAbsPath(rel)));
}

function suiteSourceSha(targetRel) {
  const parts = suiteSourceFiles(targetRel)
    .sort()
    .map((rel) => {
      const content = fs.readFileSync(targetAbsPath(rel));
      return rel + '\u0000' + sha256(content);
    });
  return sha256(parts.join(''));
}

function computeSuiteFingerprint(targetRel) {
  const headSha = gitOut(['rev-parse', 'HEAD']).trim();
  const mergeBase = gitOut(['merge-base', 'HEAD', 'origin/main'], {
    allowFailure: true,
  });
  const gitVersion = gitOut(['--version']).trim();
  return {
    repositoryIdentity: repositoryIdentity(),
    baseSha: mergeBase ? mergeBase.trim() : headSha,
    headSha,
    worktreeDiffSha256: worktreeDiffSha(),
    suiteSourceSha256: suiteSourceSha(targetRel),
    suiteSourceFiles: suiteSourceFiles(targetRel),
    runtime: { node: process.version, git: gitVersion },
    normalizedCommand: `node --test ${targetRel}`,
  };
}

function suiteFingerprintKey(fingerprint) {
  return sha256(stableStringify(fingerprint));
}

function computeExecutionFingerprint(options) {
  return {
    agentType: process.env.GOV_SUITE_AGENT || 'DIRECT',
    wrapper: WRAPPER_NAME,
    wrapperChain: {
      launcherPid: process.pid,
      parentPid: process.ppid,
      shellHint: process.env.ComSpec || process.env.SHELL || 'unknown',
    },
    transportCommand: options.transportCommand,
    reporterConfig: options.reporterConfig,
    sessionId:
      process.env.GOV_SUITE_SESSION_ID ||
      `anon-${process.pid}-${Date.now().toString(36)}`,
    environment: { platform: process.platform, arch: process.arch },
  };
}

// ---------------------------------------------------------------------------
// TAP degerlendirmesi (P0-R1.5 / P0-R1.6)
//
// Beklenen test sayisi runner icine gomulmez; suite source SHA'sina bagli
// baseline manifest'inden gelir. Manifest'te bu SHA icin kayit yoksa yalniz
// TAP ic tutarliligi zorunludur ve durum run.json'a acikca yazilir.
// ---------------------------------------------------------------------------

function baselinePath() {
  return (
    process.env.GOV_SUITE_BASELINE || path.join(__dirname, 'run-suite.baseline.json')
  );
}

function baselineForSuite(suiteSha) {
  const manifest = readJsonSafe(baselinePath());
  if (!manifest || !Array.isArray(manifest.baselines)) return null;
  return (
    manifest.baselines.find((b) => b.suiteSourceSha256 === suiteSha) || null
  );
}

function parseTapSummary(tapText) {
  const summary = {
    planComplete: false,
    planCount: null,
    tests: null,
    pass: null,
    fail: null,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    totalsConsistent: false,
  };
  // Test stdout'u TAP akisina HAM satir olarak sizabilir (node reporter'i
  // test:stdout'u escape etmez); bu yuzden ILK degil SON eslesme alinir —
  // gercek plan ve ozet satirlari kosunun sonunda gelir.
  const lastMatch = (re) => {
    let match = null;
    for (const m of tapText.matchAll(re)) match = m;
    return match;
  };
  const plan = lastMatch(/^1\.\.(\d+)$/gm);
  if (plan) {
    summary.planComplete = true;
    summary.planCount = Number.parseInt(plan[1], 10);
  }
  const grab = (label) => {
    const m = lastMatch(new RegExp(`^# ${label} (\\d+)$`, 'gm'));
    return m ? Number.parseInt(m[1], 10) : null;
  };
  summary.tests = grab('tests');
  summary.pass = grab('pass');
  summary.fail = grab('fail');
  summary.cancelled = grab('cancelled') ?? 0;
  summary.skipped = grab('skipped') ?? 0;
  summary.todo = grab('todo') ?? 0;
  if (
    summary.tests !== null &&
    summary.pass !== null &&
    summary.fail !== null
  ) {
    summary.totalsConsistent =
      summary.tests ===
      summary.pass +
        summary.fail +
        summary.cancelled +
        summary.skipped +
        summary.todo;
  }
  return summary;
}

// Final sonuc siniflandirmasi. PASS kosullarinin TAMAMI owner P0-R1.6'dadir;
// herhangi biri saglanmazsa PASS yazilamaz.
function classifyResult(input) {
  const { exitCode, tapSummary, baseline, fingerprintDrift } = input;
  if (fingerprintDrift === 'SUITE_OR_HEAD_CHANGED') {
    return { status: STATUS.STALE_INPUT, exit: EXIT.STALE_INPUT };
  }
  if (fingerprintDrift === 'WORKTREE_CHANGED') {
    return {
      status: STATUS.WORKTREE_CHANGED_DURING_RUN,
      exit: EXIT.WORKTREE_CHANGED_DURING_RUN,
    };
  }
  if (exitCode !== 0) {
    return { status: STATUS.FAIL, exit: exitCode };
  }
  if (!tapSummary.planComplete || !tapSummary.totalsConsistent) {
    // Exit 0 ama TAP plani eksik/tutarsiz: sessiz-yesil tehlikesi; PASS degil.
    return {
      status: STATUS.INTERNAL_ERROR,
      exit: EXIT.INTERNAL_ERROR,
      reason: 'TAP_PLAN_INCOMPLETE_OR_INCONSISTENT',
    };
  }
  if (tapSummary.tests === 0 || tapSummary.planCount === 0) {
    // Bos plan (1..0) PASS olamaz: test toplamanin sessizce sifira dusmesi
    // felaket sinifi bir kapsam kaybidir (P0-R1: test sayisi sessizce azalamaz).
    return {
      status: STATUS.INTERNAL_ERROR,
      exit: EXIT.INTERNAL_ERROR,
      reason: 'EMPTY_TEST_PLAN',
    };
  }
  if (tapSummary.tests < tapSummary.planCount) {
    // '# tests' subtest'leri de sayar (>= plan olabilir); planin ALTINDA
    // kalmasi eksik yurutme demektir ve PASS olamaz.
    return {
      status: STATUS.INTERNAL_ERROR,
      exit: EXIT.INTERNAL_ERROR,
      reason: `TAP_PLAN_COUNT_MISMATCH plan=${tapSummary.planCount} tests=${tapSummary.tests}`,
    };
  }
  if (tapSummary.fail > 0 || tapSummary.cancelled > 0) {
    return { status: STATUS.FAIL, exit: 1, reason: 'TAP_FAILURES_WITH_EXIT_0' };
  }
  if (baseline && baseline.expectedTests !== tapSummary.tests) {
    return {
      status: STATUS.INTERNAL_ERROR,
      exit: EXIT.INTERNAL_ERROR,
      reason: `TEST_COUNT_BASELINE_MISMATCH expected=${baseline.expectedTests} actual=${tapSummary.tests}`,
    };
  }
  return { status: STATUS.PASS, exit: 0 };
}

// ---------------------------------------------------------------------------
// Kosu artefaktlari
// ---------------------------------------------------------------------------

function newRunId(fingerprintKey) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  return `${stamp}-${process.pid}-${fingerprintKey.slice(0, 12)}`;
}

function appendLog(logPath, source, text) {
  const stamp = nowIso();
  const lines = String(text)
    .split(/\r?\n/)
    .filter((line, idx, arr) => !(line === '' && idx === arr.length - 1));
  const payload = lines.map((line) => `[${stamp}] ${source} ${line}\n`).join('');
  if (payload) fs.appendFileSync(logPath, payload, 'utf8');
}

function listRuns(repoDir) {
  const dir = runsDir(repoDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => {
      const runJson = readJsonSafe(path.join(dir, name, 'run.json'));
      return runJson ? { runId: name, runDir: path.join(dir, name), run: runJson } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.runId < b.runId ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Machine lock (single-flight + bounded concurrency, owner P0-R1.2/R1.3)
// ---------------------------------------------------------------------------

function readLockOwner(repoDir) {
  return readJsonSafe(path.join(lockDirPath(repoDir), 'owner.json'));
}

// Edinim penceresi grace'i: owner.json'suz bir lockDir bu yastan genc ise
// "edinim suruyor" sayilir, STALE ilan edilmez (adversarial review bulgusu:
// mkdir ile owner.json arasindaki mesru pencere olu kilitten ayirt edilmeli).
const ACQUIRE_GRACE_MS = envInt('GOV_SUITE_ACQUIRE_GRACE_MS', 10_000);

// Kilit sahibinin ve sahipli kosunun canliligini siniflandirir.
// Donen sinif: FREE | ACQUIRING | OWNER_ALIVE | ORPHAN_RUNNING | STALE_DEAD
function classifyLock(repoDir) {
  const lockDir = lockDirPath(repoDir);
  if (!fs.existsSync(lockDir)) return { kind: 'FREE' };
  const owner = readLockOwner(repoDir);
  if (!owner) {
    // owner.json yok: ya edinim halen suruyor ya da yarim kalmis olu edinim.
    // Taze lockDir'e dokunulmaz; yalniz grace'i asmis olani STALE say.
    let ageMs = null;
    try {
      ageMs = Date.now() - fs.statSync(lockDir).mtimeMs;
    } catch {
      return { kind: 'FREE' }; // yaris: lockDir az once kayboldu
    }
    if (ageMs < ACQUIRE_GRACE_MS) {
      return { kind: 'ACQUIRING', owner: null, liveOwned: [] };
    }
    return { kind: 'STALE_DEAD', owner: null, liveOwned: [] };
  }
  // Refusal yonunde LENIENT dogrulama: creation-time BELIRLENEMEDI ise process
  // olu sayilmaz (yanlis STALE/RECOVERY yerine guvenli taraf: koruma surer).
  const launcherAlive = ownershipRecordAlive(
    { pid: owner.pid, createdAt: owner.pidCreatedAt },
    'lenient',
  );
  const run = owner.runDir ? readJsonSafe(path.join(owner.runDir, 'run.json')) : null;
  const ownedRecords = [];
  if (run && run.ownership) {
    for (const key of ['launcher', 'runner']) {
      if (run.ownership[key]) ownedRecords.push({ role: key, ...run.ownership[key] });
    }
  }
  const liveOwned = ownedRecords.filter((rec) => ownershipRecordAlive(rec, 'lenient'));
  if (launcherAlive) return { kind: 'OWNER_ALIVE', owner, run, liveOwned };
  if (liveOwned.length > 0) {
    // Launcher olu ama sahipli runner/child yasiyor: LOST_CONTROLLER.
    // Yeni kosu YASAK; kilit SERBEST BIRAKILMAZ (owner P0-R1.3).
    return { kind: 'ORPHAN_RUNNING', owner, run, liveOwned };
  }
  const heartbeat = owner.runDir
    ? readJsonSafe(path.join(owner.runDir, 'heartbeat.json'))
    : null;
  const heartbeatFresh =
    heartbeat && Date.now() - Date.parse(heartbeat.ts) < HEARTBEAT_STALE_MS;
  if (heartbeatFresh) {
    // Tum kayitli sahipler olu gorunuyor ama heartbeat taze: gecis ani
    // olabilir; guvenli taraf = henuz STALE sayma.
    return { kind: 'ORPHAN_RUNNING', owner, run, liveOwned };
  }
  return { kind: 'STALE_DEAD', owner, run, liveOwned };
}

// Atomik edinim: owner.json ONCE staging dizinine yazilir, sonra dizin tek
// rename ile machine.lock adina tasinir — lockDir gorunur oldugu anda
// owner.json garantili olarak icindedir (owner.json'suz pencere yok).
// Basari: true. Kilit dolu/yarris kaybi: false (cagiran yeniden siniflandirir).
function acquireLock(repoDir, ownerRecord) {
  const lockDir = lockDirPath(repoDir);
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  const staging = `${lockDir}.acquiring-${process.pid}-${Date.now()}`;
  fs.mkdirSync(staging);
  fs.writeFileSync(
    path.join(staging, 'owner.json'),
    `${JSON.stringify(ownerRecord, null, 2)}\n`,
    'utf8',
  );
  try {
    fs.renameSync(staging, lockDir);
  } catch {
    fs.rmSync(staging, { recursive: true, force: true });
    return false;
  }
  // Self-verify: rename yarisi kaybedilmis olabilir; kilit gercekten bizim mi?
  const winner = readLockOwner(repoDir);
  if (!winner || winner.runId !== ownerRecord.runId) return false;
  return true;
}

function releaseLock(repoDir, runId) {
  const lockDir = lockDirPath(repoDir);
  const owner = readLockOwner(repoDir);
  // Yalniz KENDI kilidimiz oldugu POZITIF olarak dogrulanirsa birakilir;
  // owner.json okunamiyorsa dokunulmaz (recover ele alir).
  if (!owner || owner.runId !== runId) return;
  try {
    fs.rmSync(path.join(lockDir, 'owner.json'), { force: true });
    fs.rmdirSync(lockDir);
  } catch {
    /* kilit birakma hatasi olumcul degil; recover temizler */
  }
}

// Olu-stale kilidi adli iz birakarak kenara alir (silmez). Rename ONCESI
// kimlik yeniden dogrulanir: siniflandirilan owner ile diskteki owner ayni
// degilse (kilit bu arada el degistirdiyse) DOKUNULMAZ. Basari: hedef path;
// yaris kaybi/degisim: null (cagiran yeniden siniflandirir).
function sidelineStaleLock(repoDir, classifiedOwner) {
  const lockDir = lockDirPath(repoDir);
  const currentOwner = readLockOwner(repoDir);
  const sameIdentity =
    (currentOwner === null && classifiedOwner === null) ||
    (currentOwner !== null &&
      classifiedOwner !== null &&
      currentOwner.runId === classifiedOwner.runId &&
      currentOwner.pid === classifiedOwner.pid);
  if (!sameIdentity) return null;
  const target = `${lockDir}.stale-${Date.now()}`;
  try {
    fs.renameSync(lockDir, target);
  } catch {
    return null; // yaris: baska racer once davrandi
  }
  return target;
}

// ---------------------------------------------------------------------------
// Kontrollu process-tree cleanup — YALNIZ ownership kayitli agac icin.
// ---------------------------------------------------------------------------

function killOwnedTree(record, logPath) {
  if (!ownershipRecordAlive(record)) return false;
  if (logPath) appendLog(logPath, 'WRAP', `killing owned tree pid=${record.pid}`);
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(record.pid), '/T', '/F'], {
      stdio: 'pipe',
      windowsHide: true,
      timeout: 30_000,
    });
  } else {
    try {
      process.kill(record.pid, 'SIGKILL');
    } catch {
      /* zaten olmus olabilir */
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// attach — mevcut kosuya salt-okunur baglan, log'u akit, terminal durumda cik.
// ---------------------------------------------------------------------------

async function attachToRun(runDir, options = {}) {
  const runJsonPath = path.join(runDir, 'run.json');
  const logPath = path.join(runDir, 'output.log');
  const heartbeatPath = path.join(runDir, 'heartbeat.json');
  let offset = 0;
  process.stdout.write(`STATUS: ${STATUS.ATTACHED} runDir=${runDir}\n`);
  for (;;) {
    if (fs.existsSync(logPath)) {
      const size = fs.statSync(logPath).size;
      if (size > offset) {
        const fd = fs.openSync(logPath, 'r');
        try {
          const buf = Buffer.alloc(size - offset);
          fs.readSync(fd, buf, 0, buf.length, offset);
          process.stdout.write(buf.toString('utf8'));
          offset = size;
        } finally {
          fs.closeSync(fd);
        }
      }
    }
    const run = readJsonSafe(runJsonPath);
    if (run && TERMINAL_STATUSES.has(run.status)) {
      process.stdout.write(
        `ATTACH_RESULT status=${run.status} exitCode=${run.exitCode}\n`,
      );
      return typeof run.exitCode === 'number' ? run.exitCode : EXIT.INTERNAL_ERROR;
    }
    if (run && !options.noLivenessCheck) {
      // Canlilik once ucuz sinyalle: heartbeat tazeyse kosu ilerliyordur;
      // process sorgusu (PowerShell spawn) gerekmez. Yalniz heartbeat bayatsa
      // sahiplik pid'lerine (lenient) bakilir; onlar da oluyse run.json BIR KEZ
      // DAHA okunur (finalize yarisina karsi) ve hala terminal degilse
      // RECOVERY_REQUIRED ilan edilir.
      const heartbeat = readJsonSafe(heartbeatPath);
      const heartbeatFresh =
        heartbeat && Date.now() - Date.parse(heartbeat.ts) < HEARTBEAT_STALE_MS;
      if (!heartbeatFresh && run.ownership) {
        const liveOwned = ['launcher', 'runner']
          .map((k) => run.ownership[k])
          .filter((rec) => rec && ownershipRecordAlive(rec, 'lenient'));
        if (liveOwned.length === 0) {
          const recheck = readJsonSafe(runJsonPath);
          if (recheck && TERMINAL_STATUSES.has(recheck.status)) {
            process.stdout.write(
              `ATTACH_RESULT status=${recheck.status} exitCode=${recheck.exitCode}\n`,
            );
            return typeof recheck.exitCode === 'number'
              ? recheck.exitCode
              : EXIT.INTERNAL_ERROR;
          }
          process.stdout.write(
            `ATTACH_RESULT status=${STATUS.RECOVERY_REQUIRED} (owned tree dead, no terminal result)\n`,
          );
          return EXIT.INTERNAL_ERROR;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, ATTACH_POLL_MS));
  }
}

// ---------------------------------------------------------------------------
// run — ana akis
// ---------------------------------------------------------------------------

async function commandRun(argv) {
  const targetRel = process.env.GOV_SUITE_TARGET || DEFAULT_TARGET;
  const targetAbs = targetAbsPath(targetRel);
  if (!fs.existsSync(targetAbs)) {
    process.stderr.write(`TARGET_NOT_FOUND: ${targetRel}\n`);
    return EXIT.USAGE;
  }
  const benchmarkMode = argv.includes('--benchmark-mode');
  const benchmarkRunId = argValue(argv, '--benchmark-run-id');
  if (benchmarkMode && !benchmarkRunId) {
    process.stderr.write(
      'BENCHMARK_MODE requires --benchmark-run-id (owner-authorized plan id)\n',
    );
    return EXIT.USAGE;
  }

  const suiteFp = computeSuiteFingerprint(targetRel);
  const fpKey = suiteFingerprintKey(suiteFp);
  const repoDir = repoStateDir(sha256(suiteFp.repositoryIdentity));
  fs.mkdirSync(runsDir(repoDir), { recursive: true });

  // --- Single-flight / bounded concurrency ---
  if (!benchmarkMode) {
    let acquiringWaits = 0;
    for (;;) {
      const lock = classifyLock(repoDir);
      if (lock.kind === 'FREE') break;
      if (lock.kind === 'ACQUIRING') {
        // Baska bir launcher edinimin ortasinda: kisa bekle, sinirli yeniden
        // dene; pencere kapanmazsa acik RESOURCE_BUSY don.
        acquiringWaits += 1;
        if (acquiringWaits > 20) {
          process.stderr.write(
            `STATUS: ${STATUS.RESOURCE_BUSY} — lock acquisition by another launcher did not settle.\n`,
          );
          return EXIT.RESOURCE_BUSY;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      if (lock.kind === 'OWNER_ALIVE') {
        if (lock.owner.fingerprintKey === fpKey) {
          // Ayni fingerprint: yeni kosu YOK, mevcut kosuya attach (P0-R1.2).
          return attachToRun(lock.owner.runDir);
        }
        process.stderr.write(
          `STATUS: ${STATUS.RESOURCE_BUSY} — machine slot held by runId=${lock.owner.runId} (different fingerprint). ` +
            'LOCAL_FULL_GOVERNANCE_SUITE_CONCURRENCY=1; use attach/status, or owner-authorized --benchmark-mode.\n',
        );
        return EXIT.RESOURCE_BUSY;
      }
      if (lock.kind === 'ORPHAN_RUNNING') {
        // Launcher olu, sahipli agac canli: LOST_CONTROLLER / ORPHAN_RUNNING.
        // Yeni full suite BASLATILMAZ; kilit birakilmaz (P0-R1.3).
        process.stderr.write(
          `STATUS: ${STATUS.ORPHAN_RUNNING} — controller dead but owned run tree alive ` +
            `(runId=${lock.owner ? lock.owner.runId : 'unknown'}; live pids=${lock.liveOwned.map((r) => r.pid).join(',')}). ` +
            'Attach with: run-suite.cjs attach; or inspect with: run-suite.cjs recover.\n',
        );
        return EXIT.ORPHAN_RUNNING;
      }
      // STALE_DEAD: tum sahipler olu + heartbeat bayat -> adli iz birakarak
      // kenara al, ilgili kosuyu RECOVERY_REQUIRED isaretle, yeniden dene.
      // sidelineStaleLock kimligi yeniden dogrular; yaris kaybinda null doner
      // ve dongu yeniden siniflandirir (canli kilit ASLA kenara alinmaz).
      const sidelined = sidelineStaleLock(repoDir, lock.owner);
      if (sidelined === null) continue;
      if (lock.owner && lock.owner.runDir) {
        const staleRunPath = path.join(lock.owner.runDir, 'run.json');
        const staleRun = readJsonSafe(staleRunPath);
        if (staleRun && !TERMINAL_STATUSES.has(staleRun.status)) {
          staleRun.status = STATUS.RECOVERY_REQUIRED;
          staleRun.recovery = { sidelinedLock: sidelined, at: nowIso() };
          writeJsonAtomic(staleRunPath, staleRun);
        }
      }
    }
  }

  const runId = newRunId(fpKey);
  const runDir = path.join(runsDir(repoDir), runId);
  fs.mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, 'output.log');
  const partialTapPath = path.join(runDir, 'result.partial.tap');
  const finalTapPath = path.join(runDir, 'result.tap');
  const selfCreatedAt = processCreationTime(process.pid);

  const reporterConfig = [
    'spec->stdout',
    `tap->${path.basename(partialTapPath)}`,
  ];
  const childArgs = [
    '--test',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=tap',
    `--test-reporter-destination=${partialTapPath}`,
    targetAbs,
  ];
  const execFp = computeExecutionFingerprint({
    transportCommand: `${process.execPath} ${childArgs.join(' ')}`,
    reporterConfig,
  });

  // Onceki ayni-fingerprint PASS bilgisi (bilgilendirme; otomatik reuse YOK).
  const prior = listRuns(repoDir).find(
    (r) => r.run.suiteFingerprintKey === fpKey && r.run.status === STATUS.PASS,
  );

  const run = {
    schemaVersion: SCHEMA_VERSION,
    wrapper: WRAPPER_NAME,
    runId,
    status: STATUS.RUNNING,
    startedAt: nowIso(),
    endedAt: null,
    exitCode: null,
    suiteFingerprint: suiteFp,
    suiteFingerprintKey: fpKey,
    executionFingerprint: execFp,
    benchmark: benchmarkMode ? { mode: true, benchmarkRunId } : { mode: false },
    ownership: {
      launcher: { pid: process.pid, createdAt: selfCreatedAt },
      runner: null,
    },
    tapSummary: null,
    testCountBaseline: null,
    reusableResultHint: prior ? prior.runId : null,
    reason: null,
  };
  writeJsonAtomic(path.join(runDir, 'run.json'), run);

  if (!benchmarkMode) {
    const acquired = acquireLock(repoDir, {
      runId,
      runDir,
      pid: process.pid,
      pidCreatedAt: selfCreatedAt,
      fingerprintKey: fpKey,
      startedAt: run.startedAt,
      benchmarkMode: false,
    });
    if (!acquired) {
      // Yaris: kilidi baska launcher kapti -> bastan degerlendir.
      fs.rmSync(runDir, { recursive: true, force: true });
      return commandRun(argv);
    }
  }

  appendLog(logPath, 'WRAP', `run start runId=${runId} fpKey=${fpKey.slice(0, 12)}`);
  appendLog(logPath, 'WRAP', `command: node ${childArgs.join(' ')}`);
  if (prior) {
    appendLog(
      logPath,
      'WRAP',
      `REUSABLE_RESULT_HINT: identical fingerprint already PASS at runId=${prior.runId} (no automatic reuse)`,
    );
  }

  // NODE_TEST_CONTEXT / NODE_CHANNEL_FD miras kalirsa spawn edilen node --test
  // fail'de bile sessizce exit 0 doner (repo'da ampirik belgeli:
  // install-pr-status-hook.cjs). Kirp.
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.NODE_CHANNEL_FD;

  const child = spawn(process.execPath, childArgs, {
    cwd: PROJECT_ROOT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  run.ownership.runner = {
    pid: child.pid,
    createdAt: processCreationTime(child.pid),
  };
  writeJsonAtomic(path.join(runDir, 'run.json'), run);

  // Child stdout/stderr AKTIF tuketilir (pipe deadlock yapisal olarak yok) ve
  // hem terminale hem append-only log'a yazilir.
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    appendLog(logPath, 'OUT', chunk.toString('utf8'));
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    appendLog(logPath, 'ERR', chunk.toString('utf8'));
  });

  let tapCompleteAt = null;
  let teardownKilled = false;
  const writeHeartbeat = () => {
    writeJsonAtomic(path.join(runDir, 'heartbeat.json'), {
      ts: nowIso(),
      runId,
      logBytes: fs.existsSync(logPath) ? fs.statSync(logPath).size : 0,
    });
  };
  // Ilk kalp atisi hemen yazilir: cok kisa kosularda bile artefakt seti tamdir
  // ve attach/recover tarafi tazelik gorur.
  try {
    writeHeartbeat();
  } catch {
    /* heartbeat hatasi kosuyu oldurmez */
  }
  const heartbeat = setInterval(() => {
    try {
      writeHeartbeat();
      // Runner creation-time'i spawn aninda belirlenememis olabilir
      // (PowerShell soguk baslangici/timeout); bir sonraki tikte yeniden dene —
      // kimlik kaydi kill/strict dogrulama icin gereklidir.
      if (
        run.ownership.runner &&
        run.ownership.runner.createdAt == null &&
        !finalized
      ) {
        const retried = processCreationTime(child.pid);
        if (retried !== null) {
          run.ownership.runner.createdAt = retried;
          writeJsonAtomic(path.join(runDir, 'run.json'), run);
        }
      }
      // Teardown izleme: TAP plani tamamlandi ama child hala canli ise sure
      // isletilir; grace asilirsa yalniz SAHIPLI agac oldurulur ve kosu
      // TEARDOWN_HANG olur — PASS'e donusemez (P0-R1.6 madde 12).
      if (tapCompleteAt === null && fs.existsSync(partialTapPath)) {
        const text = fs.readFileSync(partialTapPath, 'utf8');
        if (/^1\.\.\d+$/m.test(text) && /^# pass \d+$/m.test(text)) {
          tapCompleteAt = Date.now();
          appendLog(logPath, 'WRAP', 'tap plan complete; waiting for process teardown');
        }
      } else if (
        tapCompleteAt !== null &&
        !teardownKilled &&
        Date.now() - tapCompleteAt > TEARDOWN_GRACE_MS
      ) {
        teardownKilled = true;
        appendLog(logPath, 'WRAP', 'TEARDOWN_HANG: grace exceeded, killing owned tree');
        killOwnedTree(run.ownership.runner, logPath);
      }
    } catch {
      /* heartbeat hatasi kosuyu oldurmez */
    }
  }, Math.min(HEARTBEAT_MS, 1000));

  let finalized = false;
  const finalize = (status, exitCode, reason) => {
    if (finalized) return;
    finalized = true;
    clearInterval(heartbeat);
    run.status = status;
    run.exitCode = exitCode;
    run.endedAt = nowIso();
    run.reason = reason || run.reason;
    writeJsonAtomic(path.join(runDir, 'run.json'), run);
    // Kilit yalniz sahipli child'in gercekten OLDUGU dogrulanirsa birakilir
    // (P0-R1.3: child yasarken lock serbest birakilmaz — abort/teardown
    // yollarinda kill denemesi basarisiz olduysa kilit recover'a kalir).
    const runnerStillAlive =
      run.ownership.runner && pidAlive(run.ownership.runner.pid);
    if (!benchmarkMode) {
      if (runnerStillAlive) {
        appendLog(
          logPath,
          'WRAP',
          `lock retained: owned runner pid=${run.ownership.runner.pid} still alive (recover will handle)`,
        );
      } else {
        releaseLock(repoDir, runId);
      }
    }
    appendLog(logPath, 'WRAP', `final status=${status} exitCode=${exitCode}`);
  };

  const abort = () => {
    appendLog(logPath, 'WRAP', 'ABORTED_BY_OWNER signal received');
    killOwnedTree(run.ownership.runner, logPath);
    finalize(STATUS.ABORTED_BY_OWNER, EXIT.ABORTED_BY_OWNER, 'signal');
    process.exit(EXIT.ABORTED_BY_OWNER);
  };
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  // 'exit' degil 'close' beklenir: 'close' tum stdio stream'lerinin
  // kapandigini garanti eder — son cikti parcalari log'a yazilmadan
  // TAP degerlendirmesine gecilmez (adversarial review bulgusu).
  const childExit = await new Promise((resolve) => {
    let exitCode = null;
    let exitSignal = null;
    child.once('exit', (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });
    child.once('close', () => resolve({ code: exitCode, signal: exitSignal }));
    child.once('error', () => resolve({ code: null, signal: 'SPAWN_ERROR' }));
  });

  // Bitis fingerprint kiyasi: once suite/head drift, sonra dirty drift.
  let fingerprintDrift = null;
  try {
    const endHead = gitOut(['rev-parse', 'HEAD']).trim();
    const endSuiteSha = suiteSourceSha(targetRel);
    if (endHead !== suiteFp.headSha || endSuiteSha !== suiteFp.suiteSourceSha256) {
      fingerprintDrift = 'SUITE_OR_HEAD_CHANGED';
    } else if (worktreeDiffSha() !== suiteFp.worktreeDiffSha256) {
      fingerprintDrift = 'WORKTREE_CHANGED';
    }
  } catch (error) {
    finalize(STATUS.INTERNAL_ERROR, EXIT.INTERNAL_ERROR, `end-fingerprint: ${error.message}`);
    return EXIT.INTERNAL_ERROR;
  }

  if (teardownKilled) {
    finalize(STATUS.TEARDOWN_HANG, EXIT.TEARDOWN_HANG, 'tap complete but process tree did not exit');
    return EXIT.TEARDOWN_HANG;
  }
  if (childExit.code === null) {
    finalize(
      STATUS.INTERNAL_ERROR,
      EXIT.INTERNAL_ERROR,
      `child terminated by signal=${childExit.signal}`,
    );
    return EXIT.INTERNAL_ERROR;
  }

  const tapText = fs.existsSync(partialTapPath)
    ? fs.readFileSync(partialTapPath, 'utf8')
    : '';
  const tapSummary = parseTapSummary(tapText);
  run.tapSummary = tapSummary;
  const baseline = baselineForSuite(suiteFp.suiteSourceSha256);
  run.testCountBaseline = baseline
    ? { source: 'run-suite.baseline.json', expectedTests: baseline.expectedTests }
    : { source: 'NONE_FOR_SUITE_SHA', expectedTests: null };

  const verdict = classifyResult({
    exitCode: childExit.code,
    tapSummary,
    baseline,
    fingerprintDrift,
  });

  // Partial TAP yalniz basariyla degerlendirilen kosuda final adina tasinir;
  // diger her durumda partial adiyla kalir (P0-R1.7: partial != final).
  if (tapSummary.planComplete && fs.existsSync(partialTapPath)) {
    fs.renameSync(partialTapPath, finalTapPath);
  }

  finalize(verdict.status, verdict.exit, verdict.reason || null);
  return verdict.exit;
}

// ---------------------------------------------------------------------------
// status / attach / reuse-check / recover komutlari
// ---------------------------------------------------------------------------

function commandStatus() {
  const targetRel = process.env.GOV_SUITE_TARGET || DEFAULT_TARGET;
  const repoDir = repoStateDir(sha256(repositoryIdentity()));
  const lock = classifyLock(repoDir);
  const runs = listRuns(repoDir).slice(0, 10);
  const view = {
    repoStateDir: repoDir,
    target: targetRel,
    lock: {
      kind: lock.kind,
      owner: lock.owner || null,
      livePids: (lock.liveOwned || []).map((r) => r.pid),
    },
    recentRuns: runs.map((r) => ({
      runId: r.runId,
      status: r.run.status,
      exitCode: r.run.exitCode,
      startedAt: r.run.startedAt,
      endedAt: r.run.endedAt,
      suiteFingerprintKey: (r.run.suiteFingerprintKey || '').slice(0, 12),
      tests: r.run.tapSummary ? r.run.tapSummary.tests : null,
    })),
  };
  process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
  return 0;
}

async function commandAttach(argv) {
  const repoDir = repoStateDir(sha256(repositoryIdentity()));
  const runId = argValue(argv, '--run-id');
  if (runId) {
    const runDir = path.join(runsDir(repoDir), runId);
    if (!fs.existsSync(path.join(runDir, 'run.json'))) {
      process.stderr.write(`RUN_NOT_FOUND: ${runId}\n`);
      return EXIT.USAGE;
    }
    return attachToRun(runDir);
  }
  const lock = classifyLock(repoDir);
  if (lock.kind === 'FREE' || !lock.owner) {
    process.stderr.write('NO_ACTIVE_RUN\n');
    return EXIT.USAGE;
  }
  return attachToRun(lock.owner.runDir);
}

function commandReuseCheck() {
  const targetRel = process.env.GOV_SUITE_TARGET || DEFAULT_TARGET;
  const suiteFp = computeSuiteFingerprint(targetRel);
  const fpKey = suiteFingerprintKey(suiteFp);
  const repoDir = repoStateDir(sha256(suiteFp.repositoryIdentity));
  const runs = listRuns(repoDir).filter((r) => TERMINAL_STATUSES.has(r.run.status));
  const decisionOf = () => {
    const exact = runs.find((r) => r.run.suiteFingerprintKey === fpKey);
    if (!exact) {
      const sameSuiteDifferentRest = runs.find(
        (r) =>
          r.run.suiteFingerprint &&
          r.run.suiteFingerprint.suiteSourceSha256 !== suiteFp.suiteSourceSha256,
      );
      return {
        decision: 'REUSE_REJECTED',
        reason: sameSuiteDifferentRest
          ? 'SUITE_SOURCE_CHANGED'
          : 'NO_MATCHING_FINGERPRINT',
      };
    }
    if (exact.run.status !== STATUS.PASS) {
      return {
        decision: 'REUSE_REJECTED',
        reason: `LAST_RESULT_${exact.run.status}`,
        runId: exact.runId,
      };
    }
    const baseline = baselineForSuite(suiteFp.suiteSourceSha256);
    if (
      baseline &&
      exact.run.tapSummary &&
      exact.run.tapSummary.tests !== baseline.expectedTests
    ) {
      return {
        decision: 'REUSE_REJECTED',
        reason: 'TEST_COUNT_BASELINE_MISMATCH',
        runId: exact.runId,
      };
    }
    return { decision: 'REUSABLE', runId: exact.runId, status: exact.run.status };
  };
  const out = {
    suiteFingerprintKey: fpKey,
    ...decisionOf(),
    note: 'CI ayri authoritative gate olarak korunur; local reuse yalniz local provenance icindir.',
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.decision === 'REUSABLE' ? 0 : 1;
}

function commandRecover(argv) {
  const apply = argv.includes('--apply');
  const repoDir = repoStateDir(sha256(repositoryIdentity()));
  const lock = classifyLock(repoDir);
  const report = { lock: lock.kind, actions: [] };
  if (lock.kind === 'ORPHAN_RUNNING') {
    report.classification = `${STATUS.LOST_CONTROLLER}/${STATUS.ORPHAN_RUNNING}`;
    report.livePids = lock.liveOwned.map((r) => ({ role: r.role, pid: r.pid }));
    report.advice =
      'Canli sahipli agac oldurulmez; attach ile izleyin. Cleanup yalniz agac tamamen kapaninca.';
  }
  if (lock.kind === 'STALE_DEAD') {
    report.classification = STATUS.RECOVERY_REQUIRED;
    if (apply) {
      const sidelined = sidelineStaleLock(repoDir, lock.owner);
      report.actions.push({ sidelinedLock: sidelined });
      if (sidelined !== null && lock.owner && lock.owner.runDir) {
        const runPath = path.join(lock.owner.runDir, 'run.json');
        const staleRun = readJsonSafe(runPath);
        if (staleRun && !TERMINAL_STATUSES.has(staleRun.status)) {
          staleRun.status = STATUS.INTERNAL_ERROR;
          staleRun.reason = 'RECOVERED_DEAD_RUN_WITHOUT_RESULT';
          staleRun.endedAt = nowIso();
          staleRun.exitCode = EXIT.INTERNAL_ERROR;
          writeJsonAtomic(runPath, staleRun);
          report.actions.push({ finalizedRun: lock.owner.runId });
        }
      }
    } else {
      report.advice = 'Uygulamak icin --apply gecin (yalniz tamamen olu kosular finalize edilir).';
    }
  }
  // Terminal olmayan, kilitsiz kalmis kosular da raporlanir (bilgi amacli).
  report.nonTerminalRuns = listRuns(repoDir)
    .filter((r) => !TERMINAL_STATUSES.has(r.run.status))
    .map((r) => ({ runId: r.runId, status: r.run.status }));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return null;
  return argv[idx + 1];
}

function usage() {
  process.stdout.write(
    [
      'Kullanim: node scripts/governance/run-suite.cjs <komut> [secenekler]',
      '',
      'Komutlar:',
      '  run [--benchmark-mode --benchmark-run-id <id>]  Full suite kosusu (kanonik giris)',
      '  status                                          Kilit + son kosular',
      '  attach [--run-id <id>]                          Aktif/gecmis kosuya baglan',
      '  reuse-check                                     Mevcut fingerprint icin sonuc reuse karari',
      '  recover [--apply]                               Stale kilit/kosu siniflandirma ve onarim',
      '',
      'Ortam degiskenleri: GOV_SUITE_STATE_ROOT, GOV_SUITE_TARGET, GOV_SUITE_AGENT,',
      '  GOV_SUITE_SESSION_ID, GOV_SUITE_BASELINE, GOV_SUITE_HEARTBEAT_MS,',
      '  GOV_SUITE_TEARDOWN_GRACE_MS, GOV_SUITE_HEARTBEAT_STALE_MS',
      '',
    ].join('\n'),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  try {
    switch (command) {
      case 'run':
        process.exitCode = await commandRun(argv.slice(1));
        return;
      case 'status':
        process.exitCode = commandStatus();
        return;
      case 'attach':
        process.exitCode = await commandAttach(argv.slice(1));
        return;
      case 'reuse-check':
        process.exitCode = commandReuseCheck();
        return;
      case 'recover':
        process.exitCode = commandRecover(argv.slice(1));
        return;
      default:
        usage();
        process.exitCode = command ? EXIT.USAGE : 0;
    }
  } catch (error) {
    process.stderr.write(`INTERNAL_ERROR: ${error && error.message}\n`);
    process.exitCode = EXIT.INTERNAL_ERROR;
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    STATUS,
    EXIT,
    TERMINAL_STATUSES,
    stableStringify,
    parseTapSummary,
    classifyResult,
    computeSuiteFingerprint,
    suiteFingerprintKey,
    computeExecutionFingerprint,
    baselineForSuite,
    ownershipRecordAlive,
    processCreationTime,
    classifyLock,
    killOwnedTree,
    // Testler icin: aktif env'e gore repo-scoped state dizini.
    currentRepoStateDir: () => repoStateDir(sha256(repositoryIdentity())),
    PROJECT_ROOT,
    DEFAULT_TARGET,
  };
}
