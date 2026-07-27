'use strict';
/**
 * The one way a probe is allowed to touch the outside world.
 *
 * A delivery probe exists to observe the system through the door a real caller
 * uses, which means spawning processes. That is also the single most dangerous
 * thing in this package, so every probe goes through this module and nothing
 * here takes a command string.
 *
 * The rules, and why each one is not optional:
 *
 *   argv arrays, shell: false     A probe builds commands from fixture paths.
 *                                 One `shell: true` and a temp directory with a
 *                                 space in it becomes a command injection.
 *   bounded timeout               A hanging probe is indistinguishable from a
 *                                 slow one, and CI would sit on it for the whole
 *                                 job timeout and then report nothing.
 *   process-tree kill             Node's own timeout kills the direct child.
 *                                 The orchestrator spawns git, which spawns more
 *                                 git; killing the parent leaves those running
 *                                 and holding locks on the fixture we are about
 *                                 to delete.
 *   bounded buffers               An executor that loops printing will otherwise
 *                                 take the verifier's memory with it.
 *   environment allowlist         The probe environment is BUILT, not inherited.
 *                                 An inherited GITHUB_TOKEN would let a sealed
 *                                 probe reach the network, which is the one
 *                                 thing sealed means it cannot do.
 *
 * The allowlist is the load-bearing one. Everything else here fails loudly; a
 * leaked credential fails silently and looks like success.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

/**
 * Environment variables a probe subprocess may see.
 *
 * Everything not on this list is withheld, including anything the parent shell
 * happened to export. Node needs a handful of these to start at all on Windows,
 * and git needs HOME to find nothing — which is the point: a git that cannot
 * find a global config cannot pick up a credential helper.
 */
const ENV_ALLOWLIST = [
  'PATH',
  'Path',
  'PATHEXT',
  'SYSTEMROOT',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'LANG',
  'LC_ALL',
  'NODE_OPTIONS',
];

/**
 * Names that must never reach a probe even if something adds them to the
 * allowlist by accident. Checked by substring, case-insensitively, because the
 * shapes that matter (GITHUB_TOKEN, GH_TOKEN, DATABASE_URL, SMTP_PASSWORD) are
 * not a closed set and a probe has no legitimate use for any of them.
 */
const ENV_FORBIDDEN_SUBSTRINGS = [
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSWD',
  'CREDENTIAL',
  'PRIVATE_KEY',
  'APIKEY',
  'API_KEY',
  'DATABASE_URL',
  'DB_URL',
  'CONNECTION_STRING',
  'SMTP',
  'AWS_',
  'AZURE_',
  'GH_',
  'GITHUB_',
  'NPM_',
  'PNPM_',
];

const MAX_BUFFER = 4 * 1024 * 1024;

class ExecError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'ExecError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * Build the environment a probe subprocess runs with.
 *
 * Constructed from nothing rather than filtered from process.env, so a variable
 * that is not named here cannot appear by any route. `extra` is for fixture
 * facts (a temp PATH, a temp HOME) and is subject to the same forbidden check —
 * a probe that tries to pass a token through the door marked "extra" is still a
 * probe passing a token.
 */
function buildEnv(extra) {
  const out = {};
  for (const k of ENV_ALLOWLIST) {
    if (process.env[k] !== undefined) out[k] = process.env[k];
  }
  for (const k of Object.keys(extra || {})) {
    const upper = k.toUpperCase();
    if (ENV_FORBIDDEN_SUBSTRINGS.some((f) => upper.indexOf(f) !== -1)) {
      throw new ExecError('PROBE_ENV_FORBIDDEN_NAME', k);
    }
    out[k] = extra[k];
  }
  // git must not be able to reach a credential helper, an askpass prompt or a
  // global config. A sealed probe that could authenticate is not sealed.
  out.GIT_TERMINAL_PROMPT = '0';
  out.GIT_ASKPASS = '';
  out.GIT_CONFIG_NOSYSTEM = '1';
  out.GIT_CONFIG_GLOBAL = os.platform() === 'win32' ? 'NUL' : '/dev/null';
  // Deterministic authorship for anything the fixture commits.
  out.GIT_AUTHOR_NAME = 'delivery-probe';
  out.GIT_AUTHOR_EMAIL = 'probe@example.invalid';
  out.GIT_COMMITTER_NAME = 'delivery-probe';
  out.GIT_COMMITTER_EMAIL = 'probe@example.invalid';
  return out;
}

/**
 * Which variables present in THIS process were withheld from the child.
 *
 * Reported into evidence. A probe that says "no credential reached the
 * subprocess" is making a claim; this is the observation behind it.
 */
function withheld() {
  return Object.keys(process.env).filter((k) => {
    const upper = k.toUpperCase();
    return ENV_FORBIDDEN_SUBSTRINGS.some((f) => upper.indexOf(f) !== -1);
  });
}

/** Kill a process and everything it spawned. */
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return 'ALREADY_EXITED';
  try {
    if (os.platform() === 'win32') {
      // Node cannot signal a process group on Windows; taskkill /T is the only
      // thing that reaches grandchildren, and git is always a grandchild here.
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return 'TASKKILL_TREE';
    }
    // Negative pid = the process group created by detached: true.
    process.kill(-child.pid, 'SIGKILL');
    return 'SIGKILL_GROUP';
  } catch (e) {
    try {
      child.kill('SIGKILL');
      return 'SIGKILL_DIRECT';
    } catch (e2) {
      return 'KILL_FAILED';
    }
  }
}

/**
 * Redact anything that looks like a credential out of captured output.
 *
 * Belt and braces: the allowlist should already make this unnecessary, and it
 * runs anyway, because evidence records are committed and read by people. A
 * redactor that never fires costs nothing; one that is missing the day it was
 * needed costs the whole point of the exercise.
 */
function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED_GH_TOKEN]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GH_PAT]')
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, (m) => (/^[0-9a-f]{40,64}$/.test(m) ? m : '[REDACTED_LONG_TOKEN]'))
    .replace(/(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi, '[REDACTED_DB_URL]')
    .replace(/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g, '[REDACTED_PRIVATE_KEY]');
}

/** Digest of exactly what was executed. Goes into evidence. */
function commandDigest(argv, cwd) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ argv: argv, cwdBase: path.basename(String(cwd || '')) }), 'utf8')
    .digest('hex');
}

/**
 * Run one command under every control above.
 *
 * Never throws on a non-zero exit — a probe's whole job is to observe exit
 * codes, so a failing command is DATA. It throws only when the harness itself
 * could not do its job (spawn failed), which is an infrastructure error and a
 * different verdict entirely.
 *
 * @param {object} o
 * @param {string[]} o.argv       [executable, ...args]. Never a string.
 * @param {string} o.cwd
 * @param {number} o.timeoutMs
 * @param {object} [o.env]        fixture-supplied extras, allowlist-checked
 * @param {string} [o.stdin]
 * @returns {Promise<{code, signal, stdout, stderr, timedOut, durationMs, killMethod, truncated}>}
 */
function run(o) {
  if (!Array.isArray(o.argv) || o.argv.length === 0) {
    return Promise.reject(new ExecError('PROBE_ARGV_REQUIRED', 'a probe command must be an argv array'));
  }
  for (const a of o.argv) {
    if (typeof a !== 'string') {
      return Promise.reject(new ExecError('PROBE_ARGV_NOT_STRINGS', JSON.stringify(o.argv).slice(0, 120)));
    }
  }
  const timeoutMs = Number.isInteger(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : 60000;
  const startedAtMs = Date.now();

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(o.argv[0], o.argv.slice(1), {
        cwd: o.cwd,
        env: buildEnv(o.env),
        // shell: false is the default and is restated because changing it would
        // be the single most damaging one-word edit anyone could make here.
        shell: false,
        // A process group on POSIX so the whole tree can be signalled. On
        // Windows detached would open a console window, and taskkill /T covers
        // the tree instead.
        detached: os.platform() !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      reject(new ExecError('PROBE_SPAWN_FAILED', o.argv[0] + ': ' + String(e && e.message)));
      return;
    }

    let out = '';
    let err = '';
    let truncated = false;
    let timedOut = false;
    let killMethod = null;

    const cap = (chunk, which) => {
      const s = String(chunk);
      if (which === 'out') {
        if (out.length + s.length > MAX_BUFFER) {
          out = (out + s).slice(0, MAX_BUFFER);
          truncated = true;
        } else out += s;
      } else if (err.length + s.length > MAX_BUFFER) {
        err = (err + s).slice(0, MAX_BUFFER);
        truncated = true;
      } else err += s;
    };

    child.stdout.on('data', (c) => cap(c, 'out'));
    child.stderr.on('data', (c) => cap(c, 'err'));

    const timer = setTimeout(() => {
      timedOut = true;
      killMethod = killTree(child);
    }, timeoutMs);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new ExecError('PROBE_SPAWN_FAILED', o.argv[0] + ': ' + String(e && e.message)));
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: code,
        signal: signal,
        stdout: sanitize(out),
        stderr: sanitize(err),
        timedOut,
        killMethod,
        truncated,
        durationMs: Date.now() - startedAtMs,
        commandDigest: commandDigest(o.argv, o.cwd),
      });
    });

    if (o.stdin !== undefined && o.stdin !== null) {
      child.stdin.end(String(o.stdin), 'utf8');
    } else {
      // An executor reading stdin must see EOF rather than block forever.
      child.stdin.end();
    }
  });
}

/**
 * Assert that a path stays inside a root, after resolving symlinks on both.
 *
 * A fixture builder that follows a stale junction into the canonical repository
 * and then deletes it is the worst thing this package could do, and this
 * repository has live junctions of exactly that shape. realpath first, compare
 * second: comparing the strings would be satisfied by any link pointing out.
 */
function assertContained(candidate, root) {
  const realRoot = fs.realpathSync(root);
  // The candidate may not exist yet (we are often about to create it), so walk
  // up to the nearest existing ancestor and resolve that.
  let probe = path.resolve(candidate);
  const parts = [];
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    parts.unshift(path.basename(probe));
    probe = parent;
  }
  const realBase = fs.realpathSync(probe);
  const resolved = path.resolve(realBase, ...parts);
  const rel = path.relative(realRoot, resolved);
  if (rel === '' || rel === '.') return resolved;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ExecError('PROBE_PATH_ESCAPES_FIXTURE', candidate + ' is outside ' + realRoot);
  }
  return resolved;
}

module.exports = {
  ENV_ALLOWLIST,
  ENV_FORBIDDEN_SUBSTRINGS,
  MAX_BUFFER,
  ExecError,
  buildEnv,
  withheld,
  killTree,
  sanitize,
  commandDigest,
  run,
  assertContained,
};
