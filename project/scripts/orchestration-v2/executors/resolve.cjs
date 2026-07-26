'use strict';
/**
 * GOV-COORD-V2 executor adapters — resolution layer.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md §7.1
 * Schema  : coordination-v2/schemas/executor.schema.json
 *
 * Resolution order, in this exact sequence:
 *
 *   1. explicit machine-local configured path
 *   2. current process PATH resolution
 *   3. known installation fallback
 *   4. identity/version verification
 *   5. headless smoke verification
 *
 * Step 3 is NOT decorative. A long-lived daemon started before an executor was
 * installed or upgraded inherits the older PATH and will never see the new
 * binary — an observed condition in this repository, recorded in
 * coordination-v2/environment-evidence.md §2.1. A resolution failure therefore
 * means "not resolvable from this process environment", never "not installed".
 *
 * No executable path or version is pinned in the contract. Whatever is
 * resolved is pinned per task attempt and written to the attempt manifest.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const LANES = ['CLAUDE_LOCAL', 'CODEX_LOCAL'];

/**
 * Extensions that cannot be spawned without a shell.
 *
 * Contract §7.2 forbids a shell, and since the CVE-2024-27980 fix Node refuses
 * to spawn .cmd/.bat with `shell: false` (EINVAL). PATH resolution on Windows
 * very often yields exactly these shims — Volta, npm, pnpm and yarn all install
 * them — so a shim hit must never be treated as a usable executable. Observed
 * on this machine: PATH resolution for both lanes returned only .CMD shims.
 */
const SHIM_EXTENSIONS = ['.CMD', '.BAT', '.PS1'];

/**
 * An npm-generated .cmd shim names the real JS entry point. Launching that
 * entry with the node binary honours §7.2 exactly, where executing the shim
 * cannot. Matches e.g.
 *   "%dp0%\node_modules\@openai\codex\bin\codex.js"
 */
const NPM_SHIM_ENTRY_RE = /(?:%dp0%|\$basedir)[\\/]((?:node_modules[\\/])[^"'\s]+?\.js)/i;

const LANE_SPEC = {
  CLAUDE_LOCAL: {
    binaryNames: ['claude'],
    versionArgs: ['--version'],
    // Version is recorded, never required to equal a pinned value.
    versionPattern: /(\d+\.\d+\.\d+)/,
    knownInstallations: (env) =>
      [
        env.USERPROFILE && path.join(env.USERPROFILE, '.local', 'bin', 'claude.exe'),
        env.USERPROFILE && path.join(env.USERPROFILE, '.local', 'bin', 'claude'),
        env.HOME && path.join(env.HOME, '.local', 'bin', 'claude'),
        env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'),
      ].filter(Boolean),
    smokeArgs: (sentinel) => ['-p', 'Reply with exactly this token and nothing else: ' + sentinel],
  },
  CODEX_LOCAL: {
    binaryNames: ['codex'],
    versionArgs: ['--version'],
    versionPattern: /(\d+\.\d+\.\d+)/,
    knownInstallations: (env) =>
      [
        env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Volta', 'bin', 'codex.exe'),
        env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Volta', 'bin', 'codex'),
        env.USERPROFILE && path.join(env.USERPROFILE, '.local', 'bin', 'codex.exe'),
        env.HOME && path.join(env.HOME, '.local', 'bin', 'codex'),
      ].filter(Boolean),
    smokeArgs: (sentinel) => ['exec', 'Reply with exactly this token and nothing else: ' + sentinel],
    /**
     * `codex exec` refuses to run unless its working directory is a trusted
     * directory — in practice a git repository — reporting "Not inside a
     * trusted directory and --skip-git-repo-check was not specified".
     *
     * Verified on this machine: the identical smoke fails from a plain temp
     * directory and passes from inside a git repository.
     *
     * The orchestrator satisfies this naturally because it resolves with the
     * isolated worktree as cwd. Resolving from anywhere else would otherwise
     * report a misleading UNAVAILABLE for an installed, working CLI, so the
     * condition is surfaced as its own reason code below.
     *
     * `--skip-git-repo-check` is deliberately NOT added: bypassing the CLI's
     * own safety check to make a smoke pass would trade a clear failure for a
     * silent one.
     */
    smokePreconditionPattern: /not inside a trusted directory|--skip-git-repo-check/i,
  },
};

class ResolveError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'ResolveError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new ResolveError(code, detail);
}

function isExecutableFile(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
  } catch (e) {
    return false;
  }
  if (process.platform === 'win32') return true;
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Resolve a bare command name against a PATH value. Implemented directly
 * rather than shelling out to `which`/`where`, so resolution never depends on
 * a shell being present or on shell quoting.
 */
/**
 * Extensions Windows can hand straight to CreateProcess.
 *
 * An extensionless file on Windows is typically a POSIX `sh` shim (npm writes
 * one next to its .cmd), which CreateProcess cannot run — observed as ENOENT.
 * Treating "file exists" as "spawnable" is therefore wrong on this platform;
 * only these extensions are directly spawnable, everything else is a shim to be
 * resolved through.
 */
const DIRECT_EXEC_EXTENSIONS = ['.EXE', '.COM'];

function isDirectlySpawnable(p) {
  if (!isExecutableFile(p)) return false;
  if (process.platform !== 'win32') return true;
  return DIRECT_EXEC_EXTENSIONS.indexOf(path.extname(p).toUpperCase()) !== -1;
}

function isShim(p) {
  if (!isExecutableFile(p)) return false;
  return !isDirectlySpawnable(p);
}

/**
 * Scan PATH for a command, separating directly-spawnable images from
 * shell-requiring shims. Direct hits win; shims are returned only so a
 * node-hosted entry point can be recovered from them.
 */
function scanPath(name, env) {
  const pathValue = env.PATH || env.Path || '';
  const direct = [];
  const shims = [];
  if (!pathValue) return { direct, shims };
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts =
    process.platform === 'win32'
      ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];
  // The extension-less name is always a candidate, but on POSIX `exts` is [''],
  // so `name + ext` already IS the bare name and the concat below would offer
  // the same path twice — resolving one file into two hits. Dedupe by absolute
  // candidate path: two identical PATH entries collapse, while the same command
  // found in two different directories is legitimately reported twice, because
  // resolution order is what the caller needs to see.
  const seen = new Set();
  for (const dir of pathValue.split(sep).filter(Boolean)) {
    const candidates = exts.map((e) => path.join(dir, name + e)).concat([path.join(dir, name)]);
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (!isExecutableFile(candidate)) continue;
      (isDirectlySpawnable(candidate) ? direct : shims).push(candidate);
    }
  }
  return { direct, shims };
}

/** Backwards-compatible helper: first directly-spawnable hit, or null. */
function resolveOnPath(name, env) {
  const { direct } = scanPath(name, env);
  return direct.length ? direct[0] : null;
}

/**
 * Recover the JS entry point named inside an npm shim so it can be launched
 * with the node binary instead of through a shell.
 */
function resolveNodeHostedEntry(shimPath) {
  let text;
  try {
    text = fs.readFileSync(shimPath, 'utf8');
  } catch (e) {
    return null;
  }
  const m = NPM_SHIM_ENTRY_RE.exec(text);
  if (!m) return null;
  const rel = m[1].replace(/\\/g, '/');
  const entry = path.resolve(path.dirname(shimPath), rel);
  return isExecutableFile(entry) || fs.existsSync(entry) ? entry : null;
}

function runCapture(file, args, opts) {
  const options = opts || {};
  const res = spawnSync(file, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeoutMs || 30000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    input: options.input,
  });
  return {
    status: res.status,
    signal: res.signal,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
    error: res.error ? String(res.error.message) : null,
    timedOut: res.error ? /ETIMEDOUT|timed out/i.test(String(res.error.message)) : false,
  };
}

/**
 * Steps 1-3: locate a candidate executable and report which step produced it.
 * Returns { resolvedAbsolutePath, resolutionSource } or null.
 */
function locate(opts) {
  const lane = opts.lane;
  const spec = LANE_SPEC[lane];
  const env = opts.env || process.env;

  const shimsSeen = [];

  if (opts.configuredPath) {
    if (isExecutableFile(opts.configuredPath)) {
      if (!isDirectlySpawnable(opts.configuredPath)) {
        // Honour the operator's choice by resolving through it, never by
        // handing a shell-requiring shim to the spawn layer.
        shimsSeen.push(opts.configuredPath);
      } else {
        return {
          resolvedAbsolutePath: path.resolve(opts.configuredPath),
          resolutionSource: 'EXPLICIT_CONFIGURED_PATH',
          launchPrefixArgv: [],
        };
      }
    } else if (opts.requireConfiguredPath) {
      fail('CONFIGURED_PATH_NOT_EXECUTABLE', String(opts.configuredPath));
    }
  }

  // Step 2 — PATH, direct images only.
  for (const name of spec.binaryNames) {
    const scan = scanPath(name, env);
    shimsSeen.push.apply(shimsSeen, scan.shims);
    if (scan.direct.length) {
      return {
        resolvedAbsolutePath: path.resolve(scan.direct[0]),
        resolutionSource: 'PATH_RESOLUTION',
        launchPrefixArgv: [],
      };
    }
  }

  // Step 3 — known installation fallback. Mandatory, not decorative: a daemon
  // whose PATH predates an install/upgrade reaches the binary only here.
  const known = (opts.knownInstallations || spec.knownInstallations(env)) || [];
  for (const candidate of known) {
    if (!isExecutableFile(candidate)) continue;
    if (!isDirectlySpawnable(candidate)) {
      shimsSeen.push(candidate);
      continue;
    }
    return {
      resolvedAbsolutePath: path.resolve(candidate),
      resolutionSource: 'KNOWN_INSTALLATION_FALLBACK',
      launchPrefixArgv: [],
    };
  }

  // Step 3b — no directly-spawnable image exists. If a shim names a JS entry
  // point, launch that with the node binary; this satisfies §7.2 where running
  // the shim itself cannot.
  for (const shim of shimsSeen) {
    const entry = resolveNodeHostedEntry(shim);
    if (entry) {
      return {
        resolvedAbsolutePath: process.execPath,
        resolutionSource: 'NODE_HOSTED_SHIM_RESOLUTION',
        launchPrefixArgv: [entry],
        hostedEntryScript: entry,
        viaShim: shim,
      };
    }
  }

  if (shimsSeen.length) {
    fail(
      'ONLY_SHELL_REQUIRING_SHIM_FOUND',
      shimsSeen.slice(0, 3).join(', ') + ' — a shell is forbidden by contract §7.2',
    );
  }
  return null;
}

/**
 * Full resolution including identity/version verification and, unless
 * explicitly skipped, headless smoke verification.
 *
 * Never throws for an unavailable executor — returns an UNAVAILABLE manifest
 * so the caller can record it and fail the task closed.
 */
function resolveExecutor(opts) {
  const lane = opts.lane;
  if (!LANES.includes(lane)) fail('LANE_INVALID', String(lane));
  const spec = LANE_SPEC[lane];
  const env = opts.env || process.env;

  const unavailable = (reason, extra) =>
    Object.assign(
      {
        schemaVersion: 1,
        executorLane: lane,
        state: 'UNAVAILABLE',
        resolutionSource: null,
        resolvedAbsolutePath: null,
        version: null,
        smokeExitCode: null,
        smokeResult: 'FAIL',
        unavailableReason: reason,
      },
      extra || {},
    );

  let located;
  try {
    located = locate(opts);
  } catch (err) {
    return unavailable(err.code || 'LOCATE_FAILED', { detail: err.detail || null });
  }
  if (!located) {
    // Not "not installed" — not resolvable from THIS process environment.
    return unavailable('NOT_RESOLVABLE_FROM_THIS_PROCESS_ENVIRONMENT');
  }

  // Step 4 — identity/version verification.
  // versionArgs/smokeArgs are overridable so the gate can be exercised against
  // a controllable executable; production callers use the lane defaults.
  const prefix = located.launchPrefixArgv || [];
  const versionArgs = opts.versionArgs || spec.versionArgs;
  const ver = runCapture(located.resolvedAbsolutePath, prefix.concat(versionArgs), {
    cwd: opts.cwd,
    env: env,
    timeoutMs: opts.versionTimeoutMs || 30000,
  });
  const verText = (ver.stdout + ' ' + ver.stderr).trim();
  const m = spec.versionPattern.exec(verText);
  if (ver.status !== 0 || !m) {
    return unavailable('VERSION_VERIFICATION_FAILED', {
      resolutionSource: located.resolutionSource,
      resolvedAbsolutePath: located.resolvedAbsolutePath,
      launchPrefixArgv: prefix.slice(),
      hostedEntryScript: located.hostedEntryScript || null,
      detail: (verText || ver.error || '').slice(0, 200),
    });
  }
  const version = verText;

  if (opts.minVersion) {
    const cmp = compareSemver(m[1], opts.minVersion);
    if (cmp < 0) {
      return unavailable('VERSION_BELOW_MINIMUM', {
        resolutionSource: located.resolutionSource,
        resolvedAbsolutePath: located.resolvedAbsolutePath,
        version: version,
        detail: m[1] + ' < ' + opts.minVersion,
      });
    }
  }

  const manifest = {
    schemaVersion: 1,
    executorLane: lane,
    state: 'AVAILABLE',
    resolutionSource: located.resolutionSource,
    resolvedAbsolutePath: located.resolvedAbsolutePath,
    launchPrefixArgv: prefix.slice(),
    hostedEntryScript: located.hostedEntryScript || null,
    viaShim: located.viaShim || null,
    version: version,
    smokeExitCode: null,
    smokeResult: 'FAIL',
  };

  if (opts.skipSmoke === true) {
    // Caller takes responsibility for the smoke gate; state stays UNAVAILABLE
    // because the contract requires step 5 before execution.
    return Object.assign({}, manifest, {
      state: 'UNAVAILABLE',
      unavailableReason: 'SMOKE_SKIPPED',
    });
  }

  // Step 5 — headless smoke verification.
  const sentinel = opts.sentinel || 'GOV_COORD_V2_SMOKE_OK';
  const smokeArgs = opts.smokeArgs || spec.smokeArgs(sentinel);
  const smoke = runCapture(manifest.resolvedAbsolutePath, prefix.concat(smokeArgs), {
    cwd: opts.cwd,
    env: env,
    timeoutMs: opts.smokeTimeoutMs || 180000,
  });
  manifest.smokeExitCode = smoke.status;
  const sawSentinel = smoke.stdout.indexOf(sentinel) !== -1;
  if (smoke.status === 0 && sawSentinel) {
    manifest.smokeResult = 'PASS';
    return manifest;
  }
  // Distinguish "the executor cannot run here" from "the executor is broken".
  // A precondition miss (e.g. a cwd the CLI does not trust) is an environmental
  // fact about where resolution ran, not evidence that the CLI is unusable —
  // conflating them would block tasks for a perfectly good installation.
  const smokeText = (smoke.stderr || '') + '\n' + (smoke.stdout || '');
  const preconditionUnmet =
    spec.smokePreconditionPattern && spec.smokePreconditionPattern.test(smokeText);
  return Object.assign({}, manifest, {
    state: 'UNAVAILABLE',
    smokeResult: 'FAIL',
    unavailableReason: smoke.timedOut
      ? 'SMOKE_TIMEOUT'
      : preconditionUnmet
        ? 'SMOKE_PRECONDITION_UNMET'
        : 'SMOKE_FAILED',
    smokePreconditionHint: preconditionUnmet
      ? 'This lane requires a trusted (git repository) working directory; resolve with the isolated worktree as cwd.'
      : null,
    detail: (smoke.stderr || smoke.stdout || smoke.error || '').slice(0, 200),
  });
}

function compareSemver(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

module.exports = {
  LANES,
  LANE_SPEC,
  ResolveError,
  isExecutableFile,
  isShim,
  isDirectlySpawnable,
  DIRECT_EXEC_EXTENSIONS,
  scanPath,
  resolveOnPath,
  resolveNodeHostedEntry,
  SHIM_EXTENSIONS,
  locate,
  resolveExecutor,
  compareSemver,
  runCapture,
  osTmp: os.tmpdir,
};
