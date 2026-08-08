#!/usr/bin/env node
'use strict';

/**
 * REPOSITORY-WIDE-MERGE-FLOW-REMEDIATION-R01 — PR-A remediation
 *
 * Installs the canonical PR-status taxonomy + adapter as an immutable,
 * hash-bound bundle and activates a thin launcher that consumes it.
 *
 * LAYOUT (all under ~/.claude/hooks/, or an injected hooksDir in tests):
 *   pr-status-bundles/<sourceCommit>/{pr-status-taxonomy.cjs, pr-status-hook-adapter.cjs, manifest.json}
 *     — write-once. A bundle that has been fully written and hash-verified
 *       is NEVER overwritten or deleted by any later run of this installer,
 *       including one that later fails to activate it. It is either the
 *       active bundle, a past-active bundle kept for `previousCommit`
 *       rollback, or inactive forensic evidence of an attempt.
 *   pr-status-active.json          — the live pointer (schemaVersion,
 *     protocolVersion, activeCommit, hashes, previousCommit)
 *   pr-status-legacy-backup.json   — write-once record of the pre-bundle
 *     hand-written hook file, captured only on the very first activation
 *   pr-status-backups/<ts>-*       — per-activation backups (byte-for-byte)
 *     of whatever active.json / launcher were live immediately before
 *   pr-status-install.lock/        — exclusive mutex (a directory: mkdir is
 *     atomic across every target platform this needs)
 *   pr-status-install.journal.json — transaction journal; see PHASES below
 *   open-pr-guard.cjs              — the installed launcher (thin; see
 *     pr-status-hook-launcher.cjs, its canonical source)
 *
 * All paths are derived from ONE `hooksDir` (default
 * `~/.claude/hooks`, injectable — see `makePaths` — so tests never touch the
 * real installation).
 *
 * TRUST BOUNDARY (unchanged from the original design)
 * -----------------------------------------------------------------------
 * `require()`-by-repository-path is unsafe: that path resolves through
 * whatever worktree is checked out, so a pull request could edit the
 * classifier that judges it. Every read below is `git show <sourceCommit>:
 * <path>` against ONE commit resolved ONCE per invocation
 * (`resolveSourceCommit`) — never a moving ref, never the working tree.
 *
 * CRASH SAFETY
 * -----------------------------------------------------------------------
 * PHASES, written to the journal in this order, is the only vocabulary a
 * crash-recovery pass reasons about:
 *   PREPARED         bundle written+verified+finalized; both existing live
 *                    files (active.json, launcher) backed up; staged
 *                    launcher built and the full test matrix has PASSED.
 *                    Nothing live has been touched yet.
 *   POINTER_SWITCHED active.json now names the new bundle. The launcher on
 *                    disk is still the PRIOR one (it does not read the
 *                    pointer), so this is a safe no-op from its point of
 *                    view — the switch is not observable until the launcher
 *                    itself changes.
 *   LAUNCHER_SWITCHED the launcher file has been replaced. This is the one
 *                    genuinely live moment: the installed hook now depends
 *                    on the bundle named by the (already-verified) pointer.
 *   VERIFIED         a real invocation of the installed launcher, against a
 *                    synthetic and (where requested) live payload, returned
 *                    a well-formed decision. Transaction complete.
 *
 * Every invocation — including `--verify` and `--dry-run` — first checks for
 * a leftover journal and recovers from it before doing anything else, so no
 * command ever reasons about a half-applied state. Recovery is driven
 * entirely by the journal's recorded phase and its captured backup hashes,
 * never by process liveness alone (a PID can outlive or fail to outlive the
 * check in ways that prove nothing) and never by an operator flag — there is
 * no `--force`.
 *
 * Usage:
 *   node install-pr-status-hook.cjs                       activate
 *   node install-pr-status-hook.cjs --verify               check only
 *   node install-pr-status-hook.cjs --dry-run              no writes
 *   node install-pr-status-hook.cjs --dry-run --candidate-ref <ref>
 *   node install-pr-status-hook.cjs --repair-from-canonical-main
 *
 * Exit codes: 0 ok / 1 drift, stale, verification or activation failure /
 * 2 usage or git error.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const REPOSITORY_IDENTITY = 'ulashuseyintelli-tech/HUKUK_YAZILIMI';
const CANONICAL_BRANCH = 'main';
const SCHEMA_VERSION = 1;
const PROTOCOL_VERSION = 1;

const TAXONOMY_SOURCE = 'project/scripts/pr-status-taxonomy.cjs';
const ADAPTER_SOURCE = 'project/scripts/pr-status-hook-adapter.cjs';
const LAUNCHER_SOURCE = 'project/scripts/pr-status-hook-launcher.cjs';

// Generous relative to a real install (seconds). Only ever used to decide
// whether a mutex with NO journal is a live racer (reject) or an abandoned
// pre-journal crash (safe to clear — by definition nothing live was touched
// before the journal's first write).
const MUTEX_STALE_MS = 15 * 60 * 1000;

const MODE = Object.freeze({
  LIVE: 'LIVE_CANONICAL_MAIN',
  REPAIR: 'REPAIR_FROM_CANONICAL_MAIN',
  CANDIDATE: 'CANDIDATE_DRY_RUN',
});

const DEFAULT_HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');

/** Every on-disk path this installer touches, derived from one hooksDir. */
function makePaths(hooksDir) {
  const dir = hooksDir || DEFAULT_HOOKS_DIR;
  return Object.freeze({
    hooksDir: dir,
    bundlesDir: path.join(dir, 'pr-status-bundles'),
    activeManifest: path.join(dir, 'pr-status-active.json'),
    legacyBackupRecord: path.join(dir, 'pr-status-legacy-backup.json'),
    backupsDir: path.join(dir, 'pr-status-backups'),
    installedLauncher: path.join(dir, 'open-pr-guard.cjs'),
    mutexDir: path.join(dir, 'pr-status-install.lock'),
    journalPath: path.join(dir, 'pr-status-install.journal.json'),
  });
}

class InstallError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: false, verify: false, repair: false, candidateRef: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--verify') args.verify = true;
    else if (a === '--repair-from-canonical-main') args.repair = true;
    else if (a === '--candidate-ref') { args.candidateRef = argv[i + 1]; i += 1; }
    else if (a.startsWith('--candidate-ref=')) args.candidateRef = a.slice('--candidate-ref='.length);
    else throw new InstallError('USAGE', `unknown argument: ${a}`);
  }
  if (args.candidateRef && !args.dryRun && !args.verify) {
    throw new InstallError('USAGE', '--candidate-ref is only valid with --dry-run or --verify; it can never install');
  }
  if (args.candidateRef && args.repair) {
    throw new InstallError('USAGE', '--repair-from-canonical-main installs from canonical main only; it takes no ref');
  }
  return args;
}

function git(cwd, gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function nowIso() { return new Date().toISOString(); }

function resolveSourceCommit(cwd) {
  const lsRemote = git(cwd, ['ls-remote', 'origin', `refs/heads/${CANONICAL_BRANCH}`]).trim();
  const remoteSha = (lsRemote.split(/\s+/)[0] || '').trim();
  if (!/^[0-9a-f]{40}$/.test(remoteSha)) {
    throw new InstallError('GIT_ERROR', `could not resolve remote refs/heads/${CANONICAL_BRANCH}`);
  }
  const trackedSha = git(cwd, ['rev-parse', `origin/${CANONICAL_BRANCH}`]).trim();
  if (remoteSha !== trackedSha) {
    throw Object.assign(
      new InstallError('STALE_CANONICAL_MAIN', `remote ${remoteSha.slice(0, 8)} != tracked ${trackedSha.slice(0, 8)} — run "git fetch origin ${CANONICAL_BRANCH}" and retry`),
      { stale: true },
    );
  }
  return remoteSha;
}

/** Read a path at an immutable, already-pinned commit. Never touches the working tree. */
function readAtCommit(cwd, commit, repoPath) {
  return git(cwd, ['show', `${commit}:${repoPath}`]);
}
function blobSha(cwd, commit, repoPath) {
  return git(cwd, ['rev-parse', `${commit}:${repoPath}`]).trim();
}

function readFileOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function readJsonOrNull(p) {
  const raw = readFileOrNull(p);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** temp-write -> read back -> hash-check -> atomic rename. */
function writeAtomic(target, content, expectedSha) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, 'utf8');
  if (expectedSha !== null) {
    const readBack = fs.readFileSync(tmp, 'utf8');
    if (sha256(readBack) !== expectedSha) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw new InstallError('WRITE_VERIFY_FAILED', `${path.basename(target)} hash mismatch after write`);
    }
  }
  fs.renameSync(tmp, target);
}

function restoreFileByteIdentical(backupPath, targetPath, expectedSha256) {
  const content = fs.readFileSync(backupPath, 'utf8');
  if (sha256(content) !== expectedSha256) {
    throw new InstallError('ROLLBACK_BACKUP_CORRUPT', `backup at ${backupPath} does not match its recorded hash — cannot safely restore`);
  }
  writeAtomic(targetPath, content, expectedSha256);
}

/** Byte-for-byte backup of a file that may or may not currently exist. */
function backupFileIfExists(paths, targetPath, label) {
  const content = readFileOrNull(targetPath);
  if (content === null) return null;
  const digest = sha256(content);
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  const backupPath = path.join(paths.backupsDir, `${Date.now()}-${process.pid}-${label}`);
  writeAtomic(backupPath, content, digest);
  return { path: backupPath, sha256: digest };
}

// --- journal -----------------------------------------------------------
function writeJournal(paths, state) {
  writeAtomic(paths.journalPath, JSON.stringify({ schemaVersion: SCHEMA_VERSION, pid: process.pid, updatedAt: nowIso(), ...state }, null, 2), null);
}
function readJournalOrNull(paths) { return readJsonOrNull(paths.journalPath); }
function deleteJournal(paths) { try { fs.unlinkSync(paths.journalPath); } catch { /* ignore */ } }

/**
 * Roll back using ONLY what the journal itself recorded — the same function
 * serves a live activation's own catch block and a future invocation's
 * crash-recovery pass, so the two paths cannot diverge.
 */
function rollbackUsingJournal(paths, journal) {
  if (!journal || journal.phase === 'PREPARED') return; // nothing live touched
  const backup = journal.backup || {};

  if (backup.activeJsonPath && backup.activeJsonSha256) {
    restoreFileByteIdentical(backup.activeJsonPath, paths.activeManifest, backup.activeJsonSha256);
  } else {
    try { fs.unlinkSync(paths.activeManifest); } catch { /* ignore */ }
  }

  if (journal.phase === 'LAUNCHER_SWITCHED') {
    if (backup.launcherPath && backup.launcherSha256) {
      restoreFileByteIdentical(backup.launcherPath, paths.installedLauncher, backup.launcherSha256);
    } else {
      try { fs.unlinkSync(paths.installedLauncher); } catch { /* ignore */ }
    }
  }
}

/**
 * Runs before ANY command does its own thing, live or read-only. A journal
 * left on disk means a previous invocation died mid-transaction; every
 * command must see the post-recovery truth.
 */
function recoverStaleJournalIfAny(paths) {
  const journal = readJournalOrNull(paths);
  if (journal) {
    if (journal.phase !== 'VERIFIED') rollbackUsingJournal(paths, journal);
    deleteJournal(paths);
    try { fs.rmdirSync(paths.mutexDir); } catch { /* ignore */ }
    return { recovered: true, phase: journal.phase };
  }
  if (fs.existsSync(paths.mutexDir)) {
    const ageMs = Date.now() - fs.statSync(paths.mutexDir).mtimeMs;
    if (ageMs >= MUTEX_STALE_MS) {
      // No journal ever got written before whatever held this mutex died —
      // by construction (journal is written before any live mutation) that
      // means nothing live was touched. Safe to clear.
      try { fs.rmdirSync(paths.mutexDir); } catch { /* ignore */ }
      return { recovered: true, phase: null };
    }
  }
  return { recovered: false };
}

function acquireMutex(paths) {
  try {
    fs.mkdirSync(paths.hooksDir, { recursive: true });
    fs.mkdirSync(paths.mutexDir);
  } catch (e) {
    if (e.code === 'EEXIST') {
      throw new InstallError('CONCURRENT_INSTALL_IN_PROGRESS', 'another installer holds the lock; retry later');
    }
    throw e;
  }
}
function releaseMutex(paths) { try { fs.rmdirSync(paths.mutexDir); } catch { /* ignore */ } }

// --- inspection (read-only; safe to call from --verify / --dry-run) -----
function inspect(args, cwd, paths) {
  let sourceCommit;
  let pinned = false;
  let mode;
  if (args.candidateRef) {
    sourceCommit = git(cwd, ['rev-parse', `${args.candidateRef}^{commit}`]).trim();
    mode = MODE.CANDIDATE;
  } else {
    sourceCommit = resolveSourceCommit(cwd);
    pinned = true;
    mode = args.repair ? MODE.REPAIR : MODE.LIVE;
  }

  const sources = {
    taxonomy: readAtCommit(cwd, sourceCommit, TAXONOMY_SOURCE),
    adapter: readAtCommit(cwd, sourceCommit, ADAPTER_SOURCE),
    launcher: readAtCommit(cwd, sourceCommit, LAUNCHER_SOURCE),
  };
  const expected = {
    taxonomy: sha256(sources.taxonomy),
    adapter: sha256(sources.adapter),
    launcher: sha256(sources.launcher),
  };
  const blobs = {
    taxonomy: blobSha(cwd, sourceCommit, TAXONOMY_SOURCE),
    adapter: blobSha(cwd, sourceCommit, ADAPTER_SOURCE),
    launcher: blobSha(cwd, sourceCommit, LAUNCHER_SOURCE),
  };

  const active = readJsonOrNull(paths.activeManifest);
  const bundleDir = path.join(paths.bundlesDir, sourceCommit);

  // Does the bundle for the commit we would activate NOW already exist,
  // fully written and hash-correct? Independent of whatever active.json
  // currently says — this only decides whether performActivation needs to
  // write a new bundle dir or can reuse one that is already there.
  const targetTaxonomy = readFileOrNull(path.join(bundleDir, 'pr-status-taxonomy.cjs'));
  const targetAdapter = readFileOrNull(path.join(bundleDir, 'pr-status-hook-adapter.cjs'));
  const bundleValid = targetTaxonomy !== null && targetAdapter !== null
    && sha256(targetTaxonomy) === expected.taxonomy && sha256(targetAdapter) === expected.adapter;

  // Self-consistency: does what's ACTUALLY on disk match what active.json
  // itself claims was installed? This is deliberately independent of
  // whether main has since moved on — a stale-but-intact install is
  // OUTDATED (safe to reactivate), a tampered/corrupted one (whatever its
  // commit) is LOCAL_DRIFT (refused without --repair-from-canonical-main).
  let status;
  if (!active) {
    status = 'NOT_INSTALLED';
  } else {
    const activeBundleDir = path.join(paths.bundlesDir, active.activeCommit || '');
    const activeTaxonomy = readFileOrNull(path.join(activeBundleDir, 'pr-status-taxonomy.cjs'));
    const activeAdapter = readFileOrNull(path.join(activeBundleDir, 'pr-status-hook-adapter.cjs'));
    const activeLauncher = readFileOrNull(paths.installedLauncher);
    const hasHashes = active.hashes && typeof active.hashes.taxonomy === 'string'
      && typeof active.hashes.adapter === 'string' && typeof active.hashes.launcher === 'string';
    const activeSelfConsistent = Boolean(
      hasHashes
      && activeTaxonomy !== null && sha256(activeTaxonomy) === active.hashes.taxonomy
      && activeAdapter !== null && sha256(activeAdapter) === active.hashes.adapter
      && activeLauncher !== null && sha256(activeLauncher) === active.hashes.launcher,
    );
    if (!activeSelfConsistent) status = 'LOCAL_DRIFT';
    else if (active.activeCommit === sourceCommit) status = 'UP_TO_DATE';
    else status = 'OUTDATED';
  }

  return {
    mode, sourceCommit, pinned, status, expected, sources, blobs, active,
    bundleDir, bundleValid,
  };
}

function report(r) {
  return [
    `repository     : ${REPOSITORY_IDENTITY}`,
    `mode           : ${r.mode}`,
    `sourceCommit   : ${r.sourceCommit}${r.pinned ? ' (remote == tracked)' : ' (UNTRUSTED CANDIDATE)'}`,
    `taxonomy       : ${TAXONOMY_SOURCE} blob=${r.blobs.taxonomy.slice(0, 12)} sha256=${r.expected.taxonomy.slice(0, 16)}`,
    `adapter        : ${ADAPTER_SOURCE} blob=${r.blobs.adapter.slice(0, 12)} sha256=${r.expected.adapter.slice(0, 16)}`,
    `launcher       : ${LAUNCHER_SOURCE} blob=${r.blobs.launcher.slice(0, 12)} sha256=${r.expected.launcher.slice(0, 16)}`,
    `status         : ${r.status}`,
  ].join('\n');
}

// --- test matrix ---------------------------------------------------------
/**
 * Runs the full local test suite against the STAGED artifacts before
 * anything live is touched. Any non-zero exit aborts activation.
 */
function runFullTestMatrixOrThrow(cwd, testEnv) {
  const testFiles = [
    'project/scripts/pr-status-taxonomy.test.cjs',
    'project/scripts/pr-status-hook-adapter.test.cjs',
    'project/scripts/pr-status-hook-launcher.test.cjs',
    'project/scripts/install-pr-status-hook.test.cjs',
  ];
  // Strip any NODE_TEST_* / NODE_CHANNEL_FD this process itself inherited
  // (e.g. install-pr-status-hook.test.cjs's own "REAL END-TO-END" cases run
  // this function from INSIDE `node --test`). Node's test runner marks a
  // child as a subtest reporting results over an IPC channel via exactly
  // these variables; without stripping them, a spawned `node --test <file>`
  // silently exits 0 regardless of its own tests' outcome instead of using
  // its own exit code — verified empirically, not just by inspection. Every
  // spawned run here must be an independent, authoritative top-level run.
  const cleanEnv = { ...process.env, ...testEnv };
  delete cleanEnv.NODE_TEST_CONTEXT;
  delete cleanEnv.NODE_TEST_WORKER_ID;
  delete cleanEnv.NODE_CHANNEL_FD;
  for (const f of testFiles) {
    const result = spawnSync(process.execPath, ['--test', f], {
      cwd, encoding: 'utf8', env: cleanEnv,
    });
    if (result.status !== 0) {
      throw new InstallError('PRE_ACTIVATION_TEST_FAILED', `${f} failed (exit ${result.status})\n${result.stdout}\n${result.stderr}`);
    }
  }
}

/** Actually invokes the installed launcher end-to-end with a synthetic payload. */
function runPostActivationSmoke(cwd, paths) {
  const payload = JSON.stringify({ session_id: 'install-smoke-test', last_assistant_message: '', cwd });
  // Same rationale as runFullTestMatrixOrThrow: run the launcher in an
  // environment that matches real production invocation, not whatever
  // test-runner internals this process itself happens to have inherited.
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;
  delete cleanEnv.NODE_TEST_WORKER_ID;
  delete cleanEnv.NODE_CHANNEL_FD;
  const result = spawnSync(process.execPath, [paths.installedLauncher], {
    input: payload, encoding: 'utf8', timeout: 20000, env: cleanEnv,
  });
  if (result.error) {
    throw new InstallError('POST_ACTIVATION_SMOKE_FAILED', `launcher did not run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new InstallError('POST_ACTIVATION_SMOKE_FAILED', `launcher exited ${result.status}: ${result.stderr}`);
  }
  // A well-formed decision is either empty stdout (allow, nothing to say) or
  // JSON with a decision field. Anything else means the wiring is broken.
  const out = (result.stdout || '').trim();
  if (out) {
    let parsed;
    try { parsed = JSON.parse(out); } catch {
      throw new InstallError('POST_ACTIVATION_SMOKE_FAILED', `launcher stdout is not valid JSON: ${out}`);
    }
    if (!['allow', 'block'].includes(parsed.decision)) {
      throw new InstallError('POST_ACTIVATION_SMOKE_FAILED', `launcher returned an unrecognised decision: ${out}`);
    }
  }
}

function looksLikeOurLauncher(content) {
  return typeof content === 'string' && content.includes('PROTOCOL_VERSION') && content.includes('pr-status-active.json');
}

// --- activation ------------------------------------------------------------
function performActivation(r, cwd, paths, opts) {
  const skipTests = Boolean(opts && opts.skipTests); // test-only escape hatch — see install-pr-status-hook.test.cjs
  let stagedLauncherPath = null;
  acquireMutex(paths);
  try {
    if (!r.bundleValid) {
      const tmpBundle = path.join(paths.bundlesDir, `.tmp-${process.pid}-${r.sourceCommit}`);
      fs.rmSync(tmpBundle, { recursive: true, force: true });
      fs.mkdirSync(tmpBundle, { recursive: true });
      writeAtomic(path.join(tmpBundle, 'pr-status-taxonomy.cjs'), r.sources.taxonomy, r.expected.taxonomy);
      writeAtomic(path.join(tmpBundle, 'pr-status-hook-adapter.cjs'), r.sources.adapter, r.expected.adapter);
      writeAtomic(path.join(tmpBundle, 'manifest.json'), `${JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        sourceCommit: r.sourceCommit,
        sources: {
          taxonomy: { path: TAXONOMY_SOURCE, blob: r.blobs.taxonomy, sha256: r.expected.taxonomy },
          adapter: { path: ADAPTER_SOURCE, blob: r.blobs.adapter, sha256: r.expected.adapter },
        },
        installedAt: nowIso(),
      }, null, 2)}\n`, null);
      // Finalize: rename the fully-written, fully-verified temp dir into its
      // permanent location. We only ever reach this branch when r.bundleValid
      // was FALSE for THIS specific commit's dir — i.e. it was either absent
      // or already provably corrupt — and the exclusive mutex held for the
      // whole of performActivation rules out a concurrent second installer
      // creating a valid one in the meantime. So clearing whatever is at
      // r.bundleDir (nothing, or known-bad) and replacing it is safe.
      // Immutability is enforced one level up, structurally: a bundle dir
      // that already hashes correctly makes bundleValid true, which means
      // this whole `if (!r.bundleValid)` block — the only code that ever
      // writes under bundlesDir/ — is not entered at all, for THAT commit,
      // ever again. Bundles for every OTHER commit (in particular
      // `previousCommit`, kept for rollback) are never referenced here and
      // so are never touched.
      fs.rmSync(r.bundleDir, { recursive: true, force: true });
      fs.renameSync(tmpBundle, r.bundleDir);
    }

    stagedLauncherPath = path.join(paths.hooksDir, `.staged-launcher-${process.pid}.cjs`);
    writeAtomic(stagedLauncherPath, r.sources.launcher, r.expected.launcher);

    if (!skipTests) runFullTestMatrixOrThrow(cwd, {});

    const activeBackup = backupFileIfExists(paths, paths.activeManifest, 'active.json');
    const launcherBackup = backupFileIfExists(paths, paths.installedLauncher, 'launcher.cjs');
    if (launcherBackup && !fs.existsSync(paths.legacyBackupRecord)) {
      const priorContent = fs.readFileSync(paths.installedLauncher, 'utf8');
      if (!looksLikeOurLauncher(priorContent)) {
        writeAtomic(paths.legacyBackupRecord, JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          originalPath: paths.installedLauncher,
          backupPath: launcherBackup.path,
          sha256: launcherBackup.sha256,
          backedUpAt: nowIso(),
        }, null, 2), null);
      }
    }

    const previousCommit = r.active ? r.active.activeCommit : null;
    // Fixed for the whole transaction once captured here — every journal
    // write below reuses this SAME object, so a crash-recovery pass reading
    // any of them back gets identical restore instructions regardless of
    // which phase it finds.
    const backupRecord = {
      activeJsonPath: activeBackup && activeBackup.path,
      activeJsonSha256: activeBackup && activeBackup.sha256,
      launcherPath: launcherBackup && launcherBackup.path,
      launcherSha256: launcherBackup && launcherBackup.sha256,
    };

    writeJournal(paths, {
      phase: 'PREPARED',
      targetCommit: r.sourceCommit,
      expectedHashes: r.expected,
      backup: backupRecord,
    });

    writeAtomic(paths.activeManifest, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      activeCommit: r.sourceCommit,
      activatedAt: nowIso(),
      hashes: { taxonomy: r.expected.taxonomy, adapter: r.expected.adapter, launcher: r.expected.launcher },
      previousCommit,
    }, null, 2), null);
    writeJournal(paths, {
      phase: 'POINTER_SWITCHED',
      targetCommit: r.sourceCommit,
      expectedHashes: r.expected,
      backup: backupRecord,
    });

    writeAtomic(paths.installedLauncher, r.sources.launcher, r.expected.launcher);
    writeJournal(paths, {
      phase: 'LAUNCHER_SWITCHED',
      targetCommit: r.sourceCommit,
      expectedHashes: r.expected,
      backup: backupRecord,
    });

    runPostActivationSmoke(cwd, paths);

    writeJournal(paths, {
      phase: 'VERIFIED',
      targetCommit: r.sourceCommit,
      expectedHashes: r.expected,
      backup: backupRecord,
    });
    deleteJournal(paths);

    return 0;
  } catch (e) {
    const journal = readJournalOrNull(paths);
    if (journal) rollbackUsingJournal(paths, journal);
    deleteJournal(paths);
    process.stderr.write(`ACTIVATION_FAILED, ROLLED BACK: ${(e && e.message) || e}\n`);
    return 1;
  } finally {
    if (stagedLauncherPath) { try { fs.unlinkSync(stagedLauncherPath); } catch { /* ignore */ } }
    releaseMutex(paths);
  }
}

function main(argv, cwd, hooksDir) {
  const paths = makePaths(hooksDir);
  const args = parseArgs(argv);
  recoverStaleJournalIfAny(paths);
  const r = inspect(args, cwd, paths);

  if (args.verify) {
    process.stdout.write(`${report(r)}\n`);
    return r.status === 'UP_TO_DATE' ? 0 : 1;
  }
  if (r.mode === MODE.CANDIDATE) {
    process.stdout.write(`${report(r)}\n\nCANDIDATE DRY RUN: validated, nothing written.\n`);
    return 0;
  }
  if (r.status === 'LOCAL_DRIFT' && r.mode !== MODE.REPAIR) {
    process.stderr.write(
      `${report(r)}\n\nREFUSING: installed snapshot differs from what this installer would write.\n`
      + 'Inspect it, then re-run with --repair-from-canonical-main to reinstall the verified\n'
      + 'canonical-main snapshot. There is no flag that installs from another source.\n',
    );
    return 1;
  }
  if (args.dryRun) {
    process.stdout.write(`${report(r)}\n\nDRY RUN: no files written.\n`);
    return 0;
  }
  if (r.status === 'UP_TO_DATE') {
    process.stdout.write(`${report(r)}\n\nALREADY UP TO DATE.\n`);
    return 0;
  }

  process.stdout.write(`${report(r)}\n`);
  return performActivation(r, cwd, paths);
}

module.exports = {
  REPOSITORY_IDENTITY,
  SCHEMA_VERSION,
  PROTOCOL_VERSION,
  TAXONOMY_SOURCE,
  ADAPTER_SOURCE,
  LAUNCHER_SOURCE,
  DEFAULT_HOOKS_DIR,
  MUTEX_STALE_MS,
  MODE,
  InstallError,
  makePaths,
  parseArgs,
  sha256,
  resolveSourceCommit,
  readAtCommit,
  inspect,
  report,
  writeAtomic,
  restoreFileByteIdentical,
  backupFileIfExists,
  writeJournal,
  readJournalOrNull,
  deleteJournal,
  rollbackUsingJournal,
  recoverStaleJournalIfAny,
  acquireMutex,
  releaseMutex,
  runFullTestMatrixOrThrow,
  runPostActivationSmoke,
  looksLikeOurLauncher,
  performActivation,
  main,
};

if (require.main === module) {
  try {
    // PR_STATUS_HOOKS_DIR_TEST_OVERRIDE exists ONLY so install-pr-status-hook.test.cjs
    // can exercise this real subprocess entry point (argv parsing + the
    // exit-code mapping below) without ever touching the real
    // ~/.claude/hooks/. It is not a documented flag, is not read by argv
    // parsing, and every real invocation leaves it unset, using
    // DEFAULT_HOOKS_DIR exactly as before.
    const hooksDirTestOverride = process.env.PR_STATUS_HOOKS_DIR_TEST_OVERRIDE || undefined;
    process.exit(main(process.argv.slice(2), process.cwd(), hooksDirTestOverride));
  } catch (error) {
    process.stderr.write(`${(error && error.message) || error}\n`);
    process.exit(error && error.stale ? 1 : 2);
  }
}
