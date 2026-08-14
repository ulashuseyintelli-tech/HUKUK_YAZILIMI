'use strict';

// =============================================================================
// run-suite.cjs P0-R1 test kapilari
//
// Owner P0-R1 karari §4'teki 20 zorunlu kapinin tamami fake/short suite ile
// burada dogrulanir; gercek 7-40 dakikalik governance full suite bu dosyada
// HICBIR ZAMAN kosulmaz. Her test kendi izole state-root'unu (temp) kullanir;
// makine-geneli gercek koordinasyon alanina dokunulmaz.
// =============================================================================

const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mod = require('./run-suite.cjs');
const WRAPPER = path.join(__dirname, 'run-suite.cjs');

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

function mkTemp(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows'ta gecikmeli handle birakimi olabilir; birikinti zararsiz */
    }
  });
  return dir;
}

function writeFake(dir, name, content) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

const FAKE_PASS = [
  "const test = require('node:test');",
  "const assert = require('node:assert');",
  "test('gate pass a', () => assert.ok(true));",
  "test('gate pass b', () => assert.equal(1, 1));",
  '',
].join('\n');

const FAKE_FAIL = [
  "const test = require('node:test');",
  "const assert = require('node:assert');",
  "test('gate fail a', () => assert.ok(true));",
  "test('gate fail b', () => assert.equal(1, 2));",
  '',
].join('\n');

function fakeSlow(ms) {
  return [
    "const test = require('node:test');",
    `test('gate slow', async () => { await new Promise((r) => setTimeout(r, ${ms})); });`,
    '',
  ].join('\n');
}

function baseEnv(stateRoot, target, extra = {}) {
  const env = {
    ...process.env,
    GOV_SUITE_STATE_ROOT: stateRoot,
    GOV_SUITE_TARGET: target,
    GOV_SUITE_HEARTBEAT_MS: '200',
    GOV_SUITE_ATTACH_POLL_MS: '150',
    GOV_SUITE_HEARTBEAT_STALE_MS: '2000',
    GOV_SUITE_SESSION_ID: 'p0r1-gate-test',
    GOV_SUITE_AGENT: 'DIRECT',
    ...extra,
  };
  // Ic ice node --test sessiz-exit-0 tehlikesine karsi (repo'da belgeli).
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_CHANNEL_FD;
  return env;
}

function runWrapper(args, env, timeoutMs = 120_000) {
  return spawnSync(process.execPath, [WRAPPER, ...args], {
    encoding: 'utf8',
    env,
    cwd: mod.PROJECT_ROOT,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function repoDirFor(stateRoot) {
  const prev = process.env.GOV_SUITE_STATE_ROOT;
  process.env.GOV_SUITE_STATE_ROOT = stateRoot;
  try {
    return mod.currentRepoStateDir();
  } finally {
    if (prev === undefined) delete process.env.GOV_SUITE_STATE_ROOT;
    else process.env.GOV_SUITE_STATE_ROOT = prev;
  }
}

function findRunRecords(stateRoot) {
  const records = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'run.json') {
        const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
        records.push({ runDir: path.dirname(full), run: parsed });
      }
    }
  };
  if (fs.existsSync(stateRoot)) walk(stateRoot);
  return records.sort((a, b) => (a.run.startedAt < b.run.startedAt ? 1 : -1));
}

function spawnDecoy(t, ms = 60_000) {
  const child = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${ms});`], {
    stdio: 'ignore',
    windowsHide: true,
  });
  t.after(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* zaten olmus olabilir */
    }
  });
  return child;
}

function deadPid() {
  const result = spawnSync(process.execPath, ['-e', ''], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return result.pid;
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timeout: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const COMPLETE_TAP = [
  'TAP version 13',
  'ok 1 - a',
  'ok 2 - b',
  '1..2',
  '# tests 2',
  '# suites 0',
  '# pass 2',
  '# fail 0',
  '# cancelled 0',
  '# skipped 0',
  '# todo 0',
  '# duration_ms 12.3',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// KAPI 1 — PASS ve exit-code passthrough (+ artefakt seti)
// KAPI 3 — Atomic final result
// ---------------------------------------------------------------------------

test('K01+K03: PASS passthrough, final artefaktlar ve atomic yazim', (t) => {
  const state = mkTemp(t, 'govsuite-k01-');
  const fake = writeFake(mkTemp(t, 'govsuite-k01f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const result = runWrapper(['run'], baseEnv(state, fake));
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const records = findRunRecords(state);
  assert.equal(records.length, 1);
  const { runDir, run } = records[0];
  assert.equal(run.status, mod.STATUS.PASS);
  assert.equal(run.exitCode, 0);
  assert.equal(run.tapSummary.tests, 2);
  assert.equal(run.tapSummary.fail, 0);
  assert.ok(run.tapSummary.planComplete);
  assert.ok(fs.existsSync(path.join(runDir, 'result.tap')), 'final result.tap olmali');
  assert.ok(
    !fs.existsSync(path.join(runDir, 'result.partial.tap')),
    'partial tap final ile karismamali',
  );
  assert.ok(fs.existsSync(path.join(runDir, 'output.log')));
  assert.ok(fs.existsSync(path.join(runDir, 'heartbeat.json')));
  // Atomic: gecici dosya artigi kalmamali; run.json gecerli JSON (yukarida parse edildi).
  const leftovers = fs.readdirSync(runDir).filter((n) => n.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
  // Log append-only ve timestamp'li satirlar icermeli.
  const log = fs.readFileSync(path.join(runDir, 'output.log'), 'utf8');
  assert.match(log, /^\[\d{4}-\d{2}-\d{2}T[^\]]+\] WRAP run start/m);
  // Kilit birakilmis olmali.
  assert.ok(!fs.existsSync(path.join(repoDirFor(state), 'machine.lock')));
});

// ---------------------------------------------------------------------------
// KAPI 2 — FAIL ve non-zero passthrough
// ---------------------------------------------------------------------------

test('K02: FAIL non-zero passthrough', (t) => {
  const state = mkTemp(t, 'govsuite-k02-');
  const fake = writeFake(mkTemp(t, 'govsuite-k02f-'), 'fake-fail.test.cjs', FAKE_FAIL);
  const result = runWrapper(['run'], baseEnv(state, fake));
  assert.equal(result.status, 1, 'child non-zero exit AYNEN gecmeli');
  const { run, runDir } = findRunRecords(state)[0];
  assert.equal(run.status, mod.STATUS.FAIL);
  assert.equal(run.exitCode, 1);
  assert.equal(run.tapSummary.fail, 1);
  // FAIL kosusunda da TAP plani tamam ise final adina tasinir (analiz icin).
  assert.ok(fs.existsSync(path.join(runDir, 'result.tap')));
});

// ---------------------------------------------------------------------------
// KAPI 4 — Partial result PASS sayilamaz (siniflandirma birimleri)
// ---------------------------------------------------------------------------

test('K04: eksik/tutarsiz TAP hicbir kosulda PASS degildir', () => {
  const complete = mod.parseTapSummary(COMPLETE_TAP);
  assert.ok(complete.planComplete && complete.totalsConsistent);

  const partial = mod.parseTapSummary('TAP version 13\nok 1 - a\n');
  assert.ok(!partial.planComplete);
  const verdictPartial = mod.classifyResult({
    exitCode: 0,
    tapSummary: partial,
    baseline: null,
    fingerprintDrift: null,
  });
  assert.equal(verdictPartial.status, mod.STATUS.INTERNAL_ERROR);
  assert.notEqual(verdictPartial.exit, 0);

  // exit 0 + TAP'ta fail: sessiz-yesil reddi.
  const greenLie = mod.parseTapSummary(
    COMPLETE_TAP.replace('# pass 2', '# pass 1').replace('# fail 0', '# fail 1'),
  );
  const verdictGreenLie = mod.classifyResult({
    exitCode: 0,
    tapSummary: greenLie,
    baseline: null,
    fingerprintDrift: null,
  });
  assert.equal(verdictGreenLie.status, mod.STATUS.FAIL);

  // Drift siniflandirmalari.
  assert.equal(
    mod.classifyResult({
      exitCode: 0,
      tapSummary: complete,
      baseline: null,
      fingerprintDrift: 'SUITE_OR_HEAD_CHANGED',
    }).status,
    mod.STATUS.STALE_INPUT,
  );
  assert.equal(
    mod.classifyResult({
      exitCode: 0,
      tapSummary: complete,
      baseline: null,
      fingerprintDrift: 'WORKTREE_CHANGED',
    }).status,
    mod.STATUS.WORKTREE_CHANGED_DURING_RUN,
  );
});

// ---------------------------------------------------------------------------
// KAPI 5 — Ayni fingerprint ile ikinci launcher attach olur
// KAPI 7 — (negatif taraf K06'da) benchmark-mode eszamanliligi
// ---------------------------------------------------------------------------

test('K05: ayni fingerprint ikinci launcher yeni kosu ACMAZ, attach olur', async (t) => {
  const state = mkTemp(t, 'govsuite-k05-');
  const fake = writeFake(mkTemp(t, 'govsuite-k05f-'), 'fake-slow.test.cjs', fakeSlow(9000));
  const env = baseEnv(state, fake);
  const first = spawn(process.execPath, [WRAPPER, 'run'], {
    env,
    cwd: mod.PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const firstDone = new Promise((resolve) =>
    first.once('exit', (code) => resolve(code)),
  );
  t.after(() => {
    try {
      first.kill('SIGKILL');
    } catch {
      /* bitmis olabilir */
    }
  });
  const lockDir = path.join(repoDirFor(state), 'machine.lock');
  await waitFor(() => fs.existsSync(path.join(lockDir, 'owner.json')), 30_000, 'lock');
  const second = runWrapper(['run'], env, 120_000);
  assert.match(second.stdout, /STATUS: ATTACHED/);
  assert.match(second.stdout, /ATTACH_RESULT status=PASS exitCode=0/);
  assert.equal(second.status, 0, 'attach, kosunun exit kodunu iletmeli');
  assert.equal(await firstDone, 0);
  // Tek kosu olusmus olmali (ikinci kosu ACILMADI).
  assert.equal(findRunRecords(state).length, 1);
});

// ---------------------------------------------------------------------------
// KAPI 6 — Farkli fingerprint RESOURCE_BUSY/QUEUED olur
// KAPI 7 — BENCHMARK_MODE olmadan eszamanli full suite yasak; mode ile serbest
// ---------------------------------------------------------------------------

test('K06+K07: farkli fingerprint BUSY; yalniz benchmark-mode eszamanli kosabilir', async (t) => {
  const state = mkTemp(t, 'govsuite-k06-');
  const fakeDir = mkTemp(t, 'govsuite-k06f-');
  const slow = writeFake(fakeDir, 'fake-slow.test.cjs', fakeSlow(12_000));
  const other = writeFake(fakeDir, 'fake-other.test.cjs', FAKE_PASS);
  const envSlow = baseEnv(state, slow);
  const first = spawn(process.execPath, [WRAPPER, 'run'], {
    env: envSlow,
    cwd: mod.PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  t.after(() => {
    try {
      first.kill('SIGKILL');
    } catch {
      /* bitmis olabilir */
    }
  });
  const lockDir = path.join(repoDirFor(state), 'machine.lock');
  await waitFor(() => fs.existsSync(path.join(lockDir, 'owner.json')), 30_000, 'lock');

  // Farkli fingerprint (farkli hedef dosya) -> RESOURCE_BUSY, kosu acilmaz.
  const busy = runWrapper(['run'], baseEnv(state, other), 60_000);
  assert.equal(busy.status, mod.EXIT.RESOURCE_BUSY);
  assert.match(busy.stderr, /RESOURCE_BUSY/);
  assert.match(busy.stderr, /LOCAL_FULL_GOVERNANCE_SUITE_CONCURRENCY=1/);

  // BENCHMARK_MODE run-id olmadan reddedilir.
  const noId = runWrapper(['run', '--benchmark-mode'], baseEnv(state, other), 60_000);
  assert.equal(noId.status, mod.EXIT.USAGE);

  // Owner-authorized benchmark-mode ile eszamanli kosu serbesttir.
  const bench = runWrapper(
    ['run', '--benchmark-mode', '--benchmark-run-id', 'B-TEST-01'],
    baseEnv(state, other),
    120_000,
  );
  assert.equal(bench.status, 0, `stderr: ${bench.stderr}`);
  const benchRun = findRunRecords(state).find((r) => r.run.benchmark.mode === true);
  assert.ok(benchRun);
  assert.equal(benchRun.run.benchmark.benchmarkRunId, 'B-TEST-01');
  first.kill('SIGKILL');
});

// ---------------------------------------------------------------------------
// KAPI 8 — Launcher olu + sahipli child canli => ORPHAN_RUNNING, yeni kosu yok
// ---------------------------------------------------------------------------

test('K08: LOST_CONTROLLER/ORPHAN_RUNNING yeni full suite baslatmaz', async (t) => {
  const state = mkTemp(t, 'govsuite-k08-');
  const fake = writeFake(mkTemp(t, 'govsuite-k08f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const repoDir = repoDirFor(state);
  const decoy = spawnDecoy(t);
  await waitFor(() => mod.processCreationTime(decoy.pid) !== null, 15_000, 'decoy');
  const decoyCreated = mod.processCreationTime(decoy.pid);

  // Fixture: olu launcher'li kilit + canli sahipli runner kaydi.
  const runDir = path.join(repoDir, 'runs', 'fixture-orphan');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'run.json'),
    JSON.stringify({
      runId: 'fixture-orphan',
      status: mod.STATUS.RUNNING,
      ownership: {
        launcher: { pid: deadPid(), createdAt: 'gone' },
        runner: { pid: decoy.pid, createdAt: decoyCreated },
      },
    }),
  );
  const lockDir = path.join(repoDir, 'machine.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({
      runId: 'fixture-orphan',
      runDir,
      pid: deadPid(),
      pidCreatedAt: 'gone',
      fingerprintKey: 'fixture',
    }),
  );

  const result = runWrapper(['run'], baseEnv(state, fake), 60_000);
  assert.equal(result.status, mod.EXIT.ORPHAN_RUNNING);
  assert.match(result.stderr, /ORPHAN_RUNNING/);
  assert.match(result.stderr, new RegExp(String(decoy.pid)));
  // Kilit SERBEST BIRAKILMAMIS olmali (canli agac kapanmadan birakilmaz).
  assert.ok(fs.existsSync(path.join(lockDir, 'owner.json')));
});

// ---------------------------------------------------------------------------
// KAPI 9 — PID reuse korumasi: pid canli ama CreationDate uyusmuyor => sahip degil
// ---------------------------------------------------------------------------

test('K09: canli pid + yanlis CreationDate sahiplik SAYILMAZ (stale reclaim)', (t) => {
  const state = mkTemp(t, 'govsuite-k09-');
  const fake = writeFake(mkTemp(t, 'govsuite-k09f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const repoDir = repoDirFor(state);
  const lockDir = path.join(repoDir, 'machine.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  // KENDI canli pid'imiz ama uydurma creation time: PID-reuse senaryosu.
  fs.writeFileSync(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({
      runId: 'fixture-reuse',
      runDir: null,
      pid: process.pid,
      pidCreatedAt: 'BOGUS-CREATION-TIME',
      fingerprintKey: 'fixture',
    }),
  );
  const result = runWrapper(['run'], baseEnv(state, fake), 120_000);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  // Bayat kilit adli iz olarak kenara alinmis olmali (silinmemis).
  const sidelined = fs
    .readdirSync(repoDir)
    .filter((n) => n.startsWith('machine.lock.stale-'));
  assert.equal(sidelined.length, 1);
});

// ---------------------------------------------------------------------------
// KAPI 10 — Heartbeat bayat ama child canli: STALE DEGIL, orphan siniflamasi
// KAPI 11 — Child olu + heartbeat bayat: RECOVERY_REQUIRED (+ --apply onarimi)
// ---------------------------------------------------------------------------

test('K10: heartbeat bayat + sahipli child canli => LOST_CONTROLLER/ORPHAN_RUNNING', async (t) => {
  const state = mkTemp(t, 'govsuite-k10-');
  const repoDir = repoDirFor(state);
  const decoy = spawnDecoy(t);
  await waitFor(() => mod.processCreationTime(decoy.pid) !== null, 15_000, 'decoy');
  const runDir = path.join(repoDir, 'runs', 'fixture-k10');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'run.json'),
    JSON.stringify({
      runId: 'fixture-k10',
      status: mod.STATUS.RUNNING,
      ownership: {
        launcher: { pid: deadPid(), createdAt: 'gone' },
        runner: { pid: decoy.pid, createdAt: mod.processCreationTime(decoy.pid) },
      },
    }),
  );
  fs.writeFileSync(
    path.join(runDir, 'heartbeat.json'),
    JSON.stringify({ ts: new Date(Date.now() - 3_600_000).toISOString() }),
  );
  const lockDir = path.join(repoDir, 'machine.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({
      runId: 'fixture-k10',
      runDir,
      pid: deadPid(),
      pidCreatedAt: 'gone',
      fingerprintKey: 'fixture',
    }),
  );
  const env = baseEnv(state, path.join(os.tmpdir(), 'yok.cjs'));
  const result = runWrapper(['recover'], env, 60_000);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.lock, 'ORPHAN_RUNNING');
  assert.match(report.classification, /LOST_CONTROLLER/);
  assert.ok(report.livePids.some((p) => p.pid === decoy.pid));
});

test('K11: tum sahipler olu + heartbeat bayat => RECOVERY_REQUIRED; --apply onarir', (t) => {
  const state = mkTemp(t, 'govsuite-k11-');
  const repoDir = repoDirFor(state);
  const runDir = path.join(repoDir, 'runs', 'fixture-k11');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'run.json'),
    JSON.stringify({
      runId: 'fixture-k11',
      status: mod.STATUS.RUNNING,
      ownership: {
        launcher: { pid: deadPid(), createdAt: 'gone' },
        runner: { pid: deadPid(), createdAt: 'gone' },
      },
    }),
  );
  fs.writeFileSync(
    path.join(runDir, 'heartbeat.json'),
    JSON.stringify({ ts: new Date(Date.now() - 3_600_000).toISOString() }),
  );
  const lockDir = path.join(repoDir, 'machine.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({
      runId: 'fixture-k11',
      runDir,
      pid: deadPid(),
      pidCreatedAt: 'gone',
      fingerprintKey: 'fixture',
    }),
  );
  const env = baseEnv(state, path.join(os.tmpdir(), 'yok.cjs'));
  const dryRun = runWrapper(['recover'], env, 60_000);
  assert.equal(JSON.parse(dryRun.stdout).classification, mod.STATUS.RECOVERY_REQUIRED);
  assert.ok(fs.existsSync(lockDir), 'dry-run kilide dokunmamali');

  const applied = runWrapper(['recover', '--apply'], env, 60_000);
  const report = JSON.parse(applied.stdout);
  assert.ok(report.actions.some((a) => a.sidelinedLock));
  assert.ok(report.actions.some((a) => a.finalizedRun === 'fixture-k11'));
  assert.ok(!fs.existsSync(lockDir), 'apply sonrasi kilit kenara alinmis olmali');
  const finalRun = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8'));
  assert.equal(finalRun.status, mod.STATUS.INTERNAL_ERROR);
  assert.equal(finalRun.reason, 'RECOVERED_DEAD_RUN_WITHOUT_RESULT');
});

// ---------------------------------------------------------------------------
// KAPI 12 — Kosu sirasinda worktree degisirse sonuc STALE sinifina duser
// ---------------------------------------------------------------------------

test('K12: kosu sirasinda worktree degisimi => WORKTREE_CHANGED_DURING_RUN', (t) => {
  const state = mkTemp(t, 'govsuite-k12-');
  const probeRel = `scripts/governance/.tmp-k12-probe-${process.pid}`;
  const probeAbs = path.join(mod.PROJECT_ROOT, probeRel);
  t.after(() => {
    try {
      fs.rmSync(probeAbs, { force: true });
    } catch {
      /* yoksa sorun yok */
    }
  });
  const fake = writeFake(
    mkTemp(t, 'govsuite-k12f-'),
    'fake-dirty.test.cjs',
    [
      "const test = require('node:test');",
      "const fs = require('node:fs');",
      `test('dirty probe', () => { fs.writeFileSync(${JSON.stringify(probeAbs)}, 'x'); });`,
      '',
    ].join('\n'),
  );
  const result = runWrapper(['run'], baseEnv(state, fake));
  assert.equal(result.status, mod.EXIT.WORKTREE_CHANGED_DURING_RUN);
  const { run } = findRunRecords(state)[0];
  assert.equal(run.status, mod.STATUS.WORKTREE_CHANGED_DURING_RUN);
});

// ---------------------------------------------------------------------------
// KAPI 13 — Kontrollu cleanup yalniz ownership kayitli process'lere dokunur
// KAPI 14 — Baska process'lere dokunulmaz; status salt-okunurdur
// ---------------------------------------------------------------------------

test('K13: killOwnedTree yalniz dogrulanmis sahiplik kaydini oldurur', async (t) => {
  const wrongOwned = spawnDecoy(t);
  const rightOwned = spawnDecoy(t);
  await waitFor(() => mod.processCreationTime(rightOwned.pid) !== null, 15_000, 'decoy');

  // Yanlis CreationDate: sahiplik dogrulanamaz -> OLDURULMEZ.
  const refused = mod.killOwnedTree({ pid: wrongOwned.pid, createdAt: 'WRONG' }, null);
  assert.equal(refused, false);
  assert.equal(mod.processCreationTime(wrongOwned.pid) !== null, true, 'yanlis kayitli process yasamali');

  // Dogru kayit: oldurulur.
  const killed = mod.killOwnedTree(
    { pid: rightOwned.pid, createdAt: mod.processCreationTime(rightOwned.pid) },
    null,
  );
  assert.equal(killed, true);
  await waitFor(() => mod.processCreationTime(rightOwned.pid) === null, 15_000, 'kill');
});

test('K14: status salt-okunur; ilgisiz process\'lere dokunulmaz', async (t) => {
  const state = mkTemp(t, 'govsuite-k14-');
  const fake = writeFake(mkTemp(t, 'govsuite-k14f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const bystander = spawnDecoy(t);
  const env = baseEnv(state, fake);
  assert.equal(runWrapper(['run'], env).status, 0);
  const snapshotBefore = JSON.stringify(findRunRecords(state).map((r) => r.run));
  const status = runWrapper(['status'], env, 60_000);
  assert.equal(status.status, 0);
  const view = JSON.parse(status.stdout);
  assert.equal(view.lock.kind, 'FREE');
  assert.equal(view.recentRuns.length, 1);
  assert.equal(view.recentRuns[0].status, mod.STATUS.PASS);
  // status hicbir kosu kaydini degistirmemis olmali; ilgisiz process yasiyor.
  assert.equal(JSON.stringify(findRunRecords(state).map((r) => r.run)), snapshotBefore);
  assert.ok(mod.processCreationTime(bystander.pid) !== null);
});

// ---------------------------------------------------------------------------
// KAPI 15 — Hucre kapanmasi sonrasi status/attach/recover ile sonuc kurtarma
// ---------------------------------------------------------------------------

test('K15: tamamlanmis kosu yeni oturumdan status/attach ile okunur', (t) => {
  const state = mkTemp(t, 'govsuite-k15-');
  const fake = writeFake(mkTemp(t, 'govsuite-k15f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const env = baseEnv(state, fake);
  assert.equal(runWrapper(['run'], env).status, 0);
  // "Hucre kapandi": yeni surec yalniz state uzerinden sonucu bulur.
  const { run } = findRunRecords(state)[0];
  const attach = runWrapper(['attach', '--run-id', run.runId], env, 60_000);
  assert.equal(attach.status, 0, 'attach kayitli exit kodunu iletmeli');
  assert.match(attach.stdout, /ATTACH_RESULT status=PASS exitCode=0/);
  const recover = runWrapper(['recover'], env, 60_000);
  assert.equal(JSON.parse(recover.stdout).lock, 'FREE');
});

// ---------------------------------------------------------------------------
// KAPI 16 — Farkli suite SHA ile eski sonucun reuse reddi
// KAPI 17 — Test sayisi degismis suite'de eski baseline reuse reddi
// ---------------------------------------------------------------------------

test('K16: suite source degisince reuse reddedilir', (t) => {
  const state = mkTemp(t, 'govsuite-k16-');
  const fakeDir = mkTemp(t, 'govsuite-k16f-');
  const fakeA = writeFake(fakeDir, 'fake-a.test.cjs', FAKE_PASS);
  const fakeB = writeFake(fakeDir, 'fake-b.test.cjs', `${FAKE_PASS}// degisik suite\n`);
  assert.equal(runWrapper(['run'], baseEnv(state, fakeA)).status, 0);

  const same = runWrapper(['reuse-check'], baseEnv(state, fakeA), 60_000);
  assert.equal(same.status, 0);
  assert.equal(JSON.parse(same.stdout).decision, 'REUSABLE');

  const changed = runWrapper(['reuse-check'], baseEnv(state, fakeB), 60_000);
  assert.equal(changed.status, 1);
  const verdict = JSON.parse(changed.stdout);
  assert.equal(verdict.decision, 'REUSE_REJECTED');
  assert.equal(verdict.reason, 'SUITE_SOURCE_CHANGED');
});

test('K17: test-sayisi baseline uyusmazligi hem kosuda hem reuse\'ta reddedilir', (t) => {
  const state = mkTemp(t, 'govsuite-k17-');
  const fakeDir = mkTemp(t, 'govsuite-k17f-');
  const fake = writeFake(fakeDir, 'fake-pass.test.cjs', FAKE_PASS);
  const fp = mod.computeSuiteFingerprint(fake);
  const baselineFile = path.join(fakeDir, 'baseline.json');
  fs.writeFileSync(
    baselineFile,
    JSON.stringify({
      baselines: [
        { suiteSourceSha256: fp.suiteSourceSha256, expectedTests: 99, note: 'k17' },
      ],
    }),
  );
  // Kosu: exit 0 + fail 0 olsa bile baseline uyusmazsa PASS yazilamaz.
  const env = baseEnv(state, fake, { GOV_SUITE_BASELINE: baselineFile });
  const result = runWrapper(['run'], env);
  assert.equal(result.status, mod.EXIT.INTERNAL_ERROR);
  const { run } = findRunRecords(state)[0];
  assert.equal(run.status, mod.STATUS.INTERNAL_ERROR);
  assert.match(run.reason, /TEST_COUNT_BASELINE_MISMATCH/);

  // Reuse: baseline'siz PASS uretilmis eski sonuc, sonradan baseline gelince reddedilir.
  const state2 = mkTemp(t, 'govsuite-k17b-');
  assert.equal(runWrapper(['run'], baseEnv(state2, fake)).status, 0);
  const reuse = runWrapper(
    ['reuse-check'],
    baseEnv(state2, fake, { GOV_SUITE_BASELINE: baselineFile }),
    60_000,
  );
  assert.equal(reuse.status, 1);
  assert.equal(JSON.parse(reuse.stdout).reason, 'TEST_COUNT_BASELINE_MISMATCH');
});

// ---------------------------------------------------------------------------
// KAPI 18 — Codex/Claude execution fingerprint farki kaydedilir
// ---------------------------------------------------------------------------

test('K18: ayni suite fingerprint, farkli execution fingerprint kaydi', (t) => {
  const state = mkTemp(t, 'govsuite-k18-');
  const fake = writeFake(mkTemp(t, 'govsuite-k18f-'), 'fake-pass.test.cjs', FAKE_PASS);
  assert.equal(
    runWrapper(['run'], baseEnv(state, fake, { GOV_SUITE_AGENT: 'CODEX' })).status,
    0,
  );
  assert.equal(
    runWrapper(['run'], baseEnv(state, fake, { GOV_SUITE_AGENT: 'CLAUDE' })).status,
    0,
  );
  const records = findRunRecords(state);
  assert.equal(records.length, 2);
  const agents = records.map((r) => r.run.executionFingerprint.agentType).sort();
  assert.deepEqual(agents, ['CLAUDE', 'CODEX']);
  assert.equal(
    records[0].run.suiteFingerprintKey,
    records[1].run.suiteFingerprintKey,
    'suite fingerprint ajan turunden bagimsiz olmali',
  );
});

// ---------------------------------------------------------------------------
// KAPI 19 — Artefaktlarda secret-pattern taramasi
// ---------------------------------------------------------------------------

test('K19: log/result/run artefaktlari secret deseni icermez', (t) => {
  const state = mkTemp(t, 'govsuite-k19-');
  const fake = writeFake(mkTemp(t, 'govsuite-k19f-'), 'fake-pass.test.cjs', FAKE_PASS);
  // Ortamda sahte secret varken bile artefaktlara sizmamali.
  const env = baseEnv(state, fake, {
    FAKE_TEST_TOKEN: 'ghp_0123456789abcdefghijklmnopqrstuvwxyzAB',
  });
  assert.equal(runWrapper(['run'], env).status, 0);
  const secretPattern =
    /(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|password\s*=)/;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const text = fs.readFileSync(full, 'utf8');
        assert.ok(
          !secretPattern.test(text),
          `secret deseni bulundu: ${full}`,
        );
      }
    }
  };
  walk(state);
});

// ---------------------------------------------------------------------------
// KAPI 20 — Wrapper olmadan dogrudan komut geriye uyumlu calisir
// ---------------------------------------------------------------------------

test('K20: dogrudan node --test cagrisi wrapper olmadan calisir', (t) => {
  const fake = writeFake(mkTemp(t, 'govsuite-k20f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_CHANNEL_FD;
  const direct = spawnSync(process.execPath, ['--test', fake], {
    encoding: 'utf8',
    env,
    cwd: mod.PROJECT_ROOT,
    timeout: 60_000,
    windowsHide: true,
  });
  assert.equal(direct.status, 0, `stderr: ${direct.stderr}`);
});

// ---------------------------------------------------------------------------
// Adversarial review kapilari (P0-R1 duzeltmeleri)
// ---------------------------------------------------------------------------

test('K21: taze owner.json\'suz kilit STALE SAYILMAZ; bounded bekleme sonrasi RESOURCE_BUSY', (t) => {
  const state = mkTemp(t, 'govsuite-k21-');
  const fake = writeFake(mkTemp(t, 'govsuite-k21f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const repoDir = repoDirFor(state);
  const lockDir = path.join(repoDir, 'machine.lock');
  fs.mkdirSync(lockDir, { recursive: true }); // owner.json YOK = edinim penceresi
  const result = runWrapper(
    ['run'],
    baseEnv(state, fake, { GOV_SUITE_ACQUIRE_GRACE_MS: '60000' }),
    120_000,
  );
  assert.equal(result.status, mod.EXIT.RESOURCE_BUSY);
  // Taze edinim penceresi kenara ALINMAMIS olmali (canli edinim korunur).
  assert.ok(fs.existsSync(lockDir), 'taze lockDir sideline edilmemeli');
  const sidelined = fs
    .readdirSync(repoDir)
    .filter((n) => n.startsWith('machine.lock.stale-'));
  assert.deepEqual(sidelined, []);
});

test('K22: grace\'i asmis owner.json\'suz kilit STALE sayilir ve kosu ilerler', (t) => {
  const state = mkTemp(t, 'govsuite-k22-');
  const fake = writeFake(mkTemp(t, 'govsuite-k22f-'), 'fake-pass.test.cjs', FAKE_PASS);
  const repoDir = repoDirFor(state);
  const lockDir = path.join(repoDir, 'machine.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  const old = new Date(Date.now() - 120_000);
  fs.utimesSync(lockDir, old, old); // mtime'i grace'in gerisine cek
  const result = runWrapper(['run'], baseEnv(state, fake), 120_000);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const sidelined = fs
    .readdirSync(repoDir)
    .filter((n) => n.startsWith('machine.lock.stale-'));
  assert.equal(sidelined.length, 1, 'yasli bos kilit adli izle kenara alinmali');
});

test('K23: TAP parse son-eslesme kurali + bos plan reddi', () => {
  // Test stdout'una sizmis sahte ozet satirlari ILK eslesme olarak gelir;
  // parse SON eslesmeyi (gercek ozet) almali.
  const injected = [
    'TAP version 13',
    '# tests 999',
    '1..999',
    'ok 1 - a',
    'ok 2 - b',
    '1..2',
    '# tests 2',
    '# suites 0',
    '# pass 2',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
    '',
  ].join('\n');
  const summary = mod.parseTapSummary(injected);
  assert.equal(summary.planCount, 2);
  assert.equal(summary.tests, 2);
  assert.ok(summary.totalsConsistent);

  // Bos plan (1..0) hicbir kosulda PASS olamaz.
  const empty = mod.parseTapSummary(
    'TAP version 13\n1..0\n# tests 0\n# suites 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
  );
  const verdict = mod.classifyResult({
    exitCode: 0,
    tapSummary: empty,
    baseline: null,
    fingerprintDrift: null,
  });
  assert.equal(verdict.status, mod.STATUS.INTERNAL_ERROR);
  assert.equal(verdict.reason, 'EMPTY_TEST_PLAN');
});

// ---------------------------------------------------------------------------
// Ek kapilar: CLI kullanim sozlesmesi
// ---------------------------------------------------------------------------

test('EK: bilinmeyen komut USAGE exit kodu doner', () => {
  const result = runWrapper(['no-such-command'], baseEnv(os.tmpdir(), 'x'), 30_000);
  assert.equal(result.status, mod.EXIT.USAGE);
});
