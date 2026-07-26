'use strict';
/**
 * GOV-COORD-V2 executor adapters — process layer.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md §7.2-§7.6
 *
 * Enforced here, all fail-closed:
 *   - No shell. `shell: false`, arguments as separate argv elements, so no
 *     interpolation surface exists.
 *   - The parent environment is never inherited wholesale; the child
 *     environment is constructed from an explicit allowlist.
 *   - The task prompt never travels through an environment variable.
 *   - stdout and stderr are captured separately, each byte-capped.
 *   - A structured result is not "success" until it validates.
 *   - Cancellation is graceful first, then the ENTIRE process tree is killed.
 *     Timeout, owner cancellation and lease-epoch loss share one primitive.
 *   - A surviving child after termination is a validation failure.
 */

const { spawn, spawnSync } = require('child_process');

/** Contract §7.3 minimum OS allowlist. */
const OS_ENV_ALLOWLIST = [
  'SystemRoot',
  'ComSpec',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOME',
  'PATH',
  'PATHEXT',
  'LOCALAPPDATA',
  'APPDATA',
];

/**
 * Variables the Windows process-creation path adds to every child regardless
 * of the explicit `env` we pass. Measured empirically on this platform: a child
 * spawned with `env: { PATH }` still observed all ten of these.
 *
 * This qualifies contract §7.3 honestly. The allowlist governs what the
 * orchestrator *passes*; it cannot suppress a platform floor. These are all
 * platform-derived identity/path values, so a secret we deliberately withheld
 * cannot ride in on one — but any key that is neither allowlisted nor listed
 * here IS a real leak, which `auditChildEnv` treats as a failure.
 */
const RUNTIME_INJECTED_ENV = [
  'HOMEDRIVE',
  'HOMEPATH',
  'LOGONSERVER',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'USERDOMAIN',
  'USERNAME',
  'USERPROFILE',
  'WINDIR',
];

const TERMINATION_REASONS = [
  'NORMAL_EXIT',
  'TIMEOUT',
  'OWNER_CANCELLATION',
  'LEASE_EPOCH_LOSS',
];

const DEFAULTS = {
  timeoutMs: 15 * 60 * 1000,
  gracePeriodMs: 5000,
  maxStdoutBytes: 4 * 1024 * 1024,
  maxStderrBytes: 1 * 1024 * 1024,
  leaseCheckIntervalMs: 5000,
};

class SpawnError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'SpawnError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new SpawnError(code, detail);
}

/**
 * Build the child environment deterministically.
 *
 * PATH is composed from the daemon's own PATH plus explicitly configured
 * directories rather than taken blindly, so a child cannot pick up whatever
 * happens to be ahead on an inherited PATH.
 */
function buildChildEnv(opts) {
  const parent = opts.parentEnv || process.env;
  const extraAllow = opts.credentialAllowlist || [];
  const allow = OS_ENV_ALLOWLIST.concat(extraAllow);
  const env = {};
  for (const key of allow) {
    if (Object.prototype.hasOwnProperty.call(parent, key) && parent[key] !== undefined) {
      env[key] = parent[key];
    }
  }
  const sep = process.platform === 'win32' ? ';' : ':';
  const configuredDirs = opts.configuredPathDirs || [];
  const basePath = env.PATH || parent.PATH || parent.Path || '';
  const merged = configuredDirs.concat(basePath ? basePath.split(sep) : []).filter(Boolean);
  const seen = new Set();
  env.PATH = merged.filter((d) => (seen.has(d) ? false : (seen.add(d), true))).join(sep);
  for (const [k, v] of Object.entries(opts.additionalEnv || {})) {
    if (allow.indexOf(k) === -1) fail('ENV_KEY_NOT_ALLOWLISTED', k);
    env[k] = v;
  }
  return env;
}

/**
 * Canonicalize a path for evidence and comparison. Deliberately local rather
 * than imported from the safety kernel: T2 and T3 are disjoint workstreams and
 * T3 must stand alone. Windows APIs can hand back 8.3 short names
 * (`C:/Users/ULASTE~1/...`) while the child reports the long form.
 */
function canonicalDir(p) {
  const toSlash = (v) => String(v).split('\\').join('/').replace(/\/+$/, '');
  const n = toSlash(p);
  try {
    return toSlash(require('fs').realpathSync.native(n));
  } catch (e) {
    return n;
  }
}

/**
 * Report any child environment key that is neither allowlisted nor a known
 * platform injection. A non-empty result is a genuine leak.
 */
function auditChildEnv(childEnvKeys, credentialAllowlist) {
  const allowed = new Set(
    OS_ENV_ALLOWLIST.concat(credentialAllowlist || []).concat(RUNTIME_INJECTED_ENV),
  );
  return childEnvKeys.filter((k) => !allowed.has(k));
}

function collectLimited(cap) {
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  return {
    push(buf) {
      if (truncated) return;
      bytes += buf.length;
      if (bytes > cap) {
        const keep = Math.max(0, cap - (bytes - buf.length));
        if (keep > 0) chunks.push(buf.slice(0, keep));
        truncated = true;
        return;
      }
      chunks.push(buf);
    },
    get text() {
      return Buffer.concat(chunks).toString('utf8');
    },
    get truncated() {
      return truncated;
    },
    get bytes() {
      return bytes;
    },
  };
}

/**
 * Enumerate every descendant of a pid, deepest first.
 *
 * A process-group signal is not sufficient on POSIX: a grandchild spawned with
 * `detached` becomes its own group leader and escapes `kill(-pid)` entirely.
 * Linux CI proved this — the tree-kill gate observed a surviving grandchild
 * while the same test passed on Windows, where `taskkill /T` walks the real
 * parent-child tree. The actual tree is therefore walked here, not assumed.
 *
 * `ps -A -o pid=,ppid=` is POSIX-specified, so this covers Linux and macOS
 * without reading /proc directly.
 */
function descendantPids(rootPid) {
  const r = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
  const children = new Map();
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  const out = [];
  const visit = (p, depth) => {
    if (depth > 32) return; // defensive: never follow a cycle
    for (const c of children.get(p) || []) {
      visit(c, depth + 1);
      out.push(c); // post-order, so descendants precede their parent
    }
  };
  visit(rootPid, 0);
  return out;
}

/**
 * Kill an entire process tree. Never leaves orphans behind silently.
 *
 * Windows delegates to `taskkill /T`, which already walks the tree. POSIX
 * signals enumerated descendants first, then the process group, then the pid
 * itself, so a detached grandchild cannot survive by leaving its parent's group.
 */
function killProcessTree(pid, force) {
  if (!pid) return { attempted: false, ok: false };
  const sig = force ? 'SIGKILL' : 'SIGTERM';

  if (process.platform === 'win32') {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.push('/F');
    const r = spawnSync('taskkill', args, { encoding: 'utf8', windowsHide: true });
    return { attempted: true, ok: r.status === 0, detail: String(r.stderr || r.stdout || '').trim() };
  }

  const signalled = [];
  const failed = [];
  for (const child of descendantPids(pid)) {
    try {
      process.kill(child, sig);
      signalled.push(child);
    } catch (e) {
      // ESRCH just means it exited between listing and signalling.
      if (!e || e.code !== 'ESRCH') failed.push(child + ':' + (e && e.code));
    }
  }

  let groupOk = false;
  try {
    process.kill(-pid, sig);
    groupOk = true;
  } catch (e) {
    /* not a group leader; the direct signal below covers it */
  }
  let directOk = false;
  try {
    process.kill(pid, sig);
    directOk = true;
  } catch (e) {
    if (e && e.code === 'ESRCH') directOk = true;
  }

  return {
    attempted: true,
    ok: (groupOk || directOk) && failed.length === 0,
    descendantsSignalled: signalled,
    detail: failed.length ? 'could not signal ' + failed.join(', ') : null,
  };
}

function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

/**
 * Run an executor as a child process under the full §7 contract.
 *
 * `leaseCheck` is invoked on an interval; if it throws, the run is cancelled
 * with reason LEASE_EPOCH_LOSS through the same primitive as a timeout, and
 * the result is marked unpublishable.
 *
 * Resolves (never rejects) with a run manifest.
 */
function runExecutor(opts) {
  const resolved = opts.resolved;
  if (!resolved || resolved.state !== 'AVAILABLE') {
    fail('EXECUTOR_UNAVAILABLE', resolved ? resolved.unavailableReason || resolved.state : 'missing');
  }
  if (!Array.isArray(opts.argv) || opts.argv.length === 0) fail('ARGV_REQUIRED', 'empty');
  for (const a of opts.argv) {
    if (typeof a !== 'string') fail('ARGV_NOT_STRING', String(a));
  }
  if (!opts.workingDirectory) fail('WORKING_DIRECTORY_REQUIRED', 'missing');
  const workingDirectory = canonicalDir(opts.workingDirectory);

  const limits = Object.assign({}, DEFAULTS, opts.limits || {});
  const promptTransport = opts.promptTransport || 'SINGLE_ARGUMENT';
  if (['SINGLE_ARGUMENT', 'STDIN_PAYLOAD'].indexOf(promptTransport) === -1) {
    fail('PROMPT_TRANSPORT_INVALID', promptTransport);
  }

  const env = buildChildEnv({
    parentEnv: opts.parentEnv,
    credentialAllowlist: opts.credentialAllowlist,
    configuredPathDirs: opts.configuredPathDirs,
    additionalEnv: opts.additionalEnv,
  });
  // The prompt must never be reachable through the environment.
  for (const [k, v] of Object.entries(env)) {
    if (opts.prompt && typeof v === 'string' && v.indexOf(opts.prompt) !== -1) {
      fail('PROMPT_LEAKED_INTO_ENV', k);
    }
  }

  return new Promise((resolve) => {
    const started = Date.now();
    // A node-hosted executor (npm shim with no directly-spawnable image) runs
    // as `node <entryScript> ...args`, so the prefix must lead the argv.
    const effectiveArgv = (resolved.launchPrefixArgv || []).concat(opts.argv);
    const child = spawn(resolved.resolvedAbsolutePath, effectiveArgv, {
      cwd: workingDirectory,
      env: env,
      shell: false, // contract §7.2 — no shell, no interpolation surface
      windowsHide: true,
      detached: process.platform !== 'win32', // own process group for tree kill
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const out = collectLimited(limits.maxStdoutBytes);
    const err = collectLimited(limits.maxStderrBytes);
    let settled = false;
    let terminationReason = null;
    let graceTimer = null;
    let hardTimer = null;
    let leaseTimer = null;
    let leaseLossDetail = null;
    const kills = [];

    const cancel = (reason, detail) => {
      if (settled || terminationReason) return;
      terminationReason = reason;
      if (detail) leaseLossDetail = detail;
      kills.push(Object.assign({ phase: 'graceful' }, killProcessTree(child.pid, false)));
      graceTimer = setTimeout(() => {
        kills.push(Object.assign({ phase: 'forced' }, killProcessTree(child.pid, true)));
      }, limits.gracePeriodMs);
    };

    if (limits.timeoutMs > 0) {
      hardTimer = setTimeout(() => cancel('TIMEOUT'), limits.timeoutMs);
    }
    if (typeof opts.leaseCheck === 'function') {
      leaseTimer = setInterval(() => {
        try {
          opts.leaseCheck();
        } catch (e) {
          // Contract §7.6: lease loss freezes mutation and terminates the tree.
          cancel('LEASE_EPOCH_LOSS', (e && e.code) || String(e && e.message));
        }
      }, limits.leaseCheckIntervalMs);
    }
    if (opts.cancellationSignal && typeof opts.cancellationSignal.addEventListener === 'function') {
      opts.cancellationSignal.addEventListener('abort', () => cancel('OWNER_CANCELLATION'));
    }

    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));

    if (promptTransport === 'STDIN_PAYLOAD' && opts.prompt != null) {
      child.stdin.write(String(opts.prompt));
    }
    child.stdin.end();

    const finish = (exitCode, signal, spawnErr) => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      if (leaseTimer) clearInterval(leaseTimer);

      const orphanProcessDetected = processAlive(child.pid);
      if (orphanProcessDetected) {
        kills.push(Object.assign({ phase: 'final-sweep' }, killProcessTree(child.pid, true)));
      }

      const reason = terminationReason || 'NORMAL_EXIT';
      const cancelled = reason !== 'NORMAL_EXIT';

      let structuredResult = null;
      let structuredValid = false;
      let structuredError = null;
      if (opts.structuredResult) {
        try {
          structuredResult = JSON.parse(extractJson(out.text, opts.structuredResult.marker));
          structuredValid =
            typeof opts.structuredResult.validate === 'function'
              ? opts.structuredResult.validate(structuredResult) === true
              : true;
          if (!structuredValid) structuredError = 'STRUCTURED_RESULT_INVALID';
        } catch (e) {
          structuredError = 'STRUCTURED_RESULT_UNPARSEABLE';
        }
      }

      // Success requires a clean exit, no cancellation, no orphan, and — when
      // a structured result is expected — a validated one (contract §7.4).
      const exitSuccess =
        !cancelled && exitCode === 0 && !spawnErr && !orphanProcessDetected &&
        (!opts.structuredResult || structuredValid);

      resolve({
        schemaVersion: 1,
        executorLane: resolved.executorLane,
        resolvedAbsolutePath: resolved.resolvedAbsolutePath,
        version: resolved.version,
        workingDirectory: workingDirectory,
        environmentAllowlist: Object.keys(env).sort(),
        spawnPolicy: {
          useShellExecute: false,
          argv: opts.argv.slice(),
          effectiveArgv: effectiveArgv.slice(),
          launchPrefixArgv: (resolved.launchPrefixArgv || []).slice(),
          promptTransport,
        },
        limits: limits,
        exitCode: exitCode,
        signal: signal || null,
        durationMs: Date.now() - started,
        stdout: out.text,
        stderr: err.text,
        stdoutTruncated: out.truncated,
        stderrTruncated: err.truncated,
        termination: {
          reason: reason,
          gracefulAttempted: kills.some((k) => k.phase === 'graceful'),
          processTreeTerminated: kills.some((k) => k.phase === 'forced' || k.phase === 'graceful'),
          orphanProcessDetected: orphanProcessDetected,
          kills: kills,
          leaseLossDetail: leaseLossDetail,
        },
        structuredResult: structuredResult,
        structuredResultValid: structuredValid,
        structuredResultError: structuredError,
        spawnError: spawnErr ? String(spawnErr.message) : null,
        executorExitSuccess: exitSuccess,
        publishable: !cancelled && !orphanProcessDetected,
      });
    };

    child.on('error', (e) => finish(null, null, e));
    child.on('close', (code, signal) => finish(code, signal, null));
  });
}

/**
 * Pull a JSON document out of executor stdout. When a marker is given, only
 * the marked line is considered — free-form prose around it is ignored rather
 * than guessed at.
 */
function extractJson(text, marker) {
  if (marker) {
    for (const line of String(text).split(/\r?\n/)) {
      const i = line.indexOf(marker);
      if (i !== -1) return line.slice(i + marker.length).trim();
    }
    throw new Error('marker not found');
  }
  const t = String(text).trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last <= first) throw new Error('no JSON object found');
  return t.slice(first, last + 1);
}

module.exports = {
  OS_ENV_ALLOWLIST,
  RUNTIME_INJECTED_ENV,
  canonicalDir,
  auditChildEnv,
  TERMINATION_REASONS,
  DEFAULTS,
  SpawnError,
  buildChildEnv,
  descendantPids,
  killProcessTree,
  processAlive,
  extractJson,
  runExecutor,
};
