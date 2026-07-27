'use strict';
/**
 * GOV-COORD-V2 runtime — how to spawn an external command safely.
 *
 * `shell: true` is not a Windows compatibility switch; it is a decision to hand
 * the argument vector to cmd.exe, which re-splits it on whitespace. Node warns
 * about this (DEP0190) because arguments are concatenated rather than escaped.
 *
 * A live preflight caught the consequence: the ciProvider queried branch
 * protection with `--jq '.contexts // []'` under shell:true, cmd.exe split that
 * one argument into three, gh answered "accepts 1 arg(s), received 3", and the
 * adapter reported an EMPTY platform-required set. Not a crash — a silent
 * under-requirement, in the exact place §5.1 exists to prevent one. The unit
 * tests missed it because they inject a fake gh runner, so the real spawn path
 * was never exercised.
 *
 * The correct predicate is not the platform but the resolved file: a .cmd or
 * .bat shim genuinely cannot be spawned with shell:false on Windows
 * (CVE-2024-27980 makes Node refuse it with EINVAL), while a .exe can and must
 * be. resolve.cjs already models exactly this distinction, so it is reused
 * rather than re-derived.
 */

const resolve = require('../executors/resolve.cjs');

/**
 * Decide whether a command must go through a shell.
 *
 * @param {string} command bare command name, as passed to spawnSync
 * @param {object} [env]   environment used for PATH resolution
 * @returns {{shell: boolean, resolvedPath: (string|null), reason: string}}
 */
function spawnModeFor(command, env) {
  if (process.platform !== 'win32') {
    return { shell: false, resolvedPath: null, reason: 'POSIX_NEVER_NEEDS_SHELL' };
  }
  const scan = resolve.scanPath(command, env || process.env);
  if (scan.direct.length) {
    return { shell: false, resolvedPath: scan.direct[0], reason: 'DIRECTLY_SPAWNABLE' };
  }
  if (scan.shims.length) {
    // A .cmd/.bat shim cannot be spawned directly on Windows. Going through the
    // shell is the only option, so callers must keep every argument free of
    // whitespace and shell metacharacters — see quotingIsSafe below.
    return { shell: true, resolvedPath: scan.shims[0], reason: 'SHIM_REQUIRES_SHELL' };
  }
  // Unresolvable here. Let spawnSync fail with its own ENOENT rather than
  // guessing that a shell would find it.
  return { shell: false, resolvedPath: null, reason: 'UNRESOLVED' };
}

/**
 * Whether an argument vector survives cmd.exe's re-splitting unchanged. Only
 * relevant when spawnModeFor returned shell:true; a false result means the call
 * would be silently corrupted and must fail closed instead.
 */
function quotingIsSafe(argv) {
  return (argv || []).every((a) => typeof a === 'string' && !/[\s"'&|<>^%()]/.test(a));
}

/**
 * Spawn helper that picks the mode and refuses a corrupting combination.
 *
 * @param {function} spawnSync  injected for tests
 */
function safeSpawn(spawnSync, command, args, options) {
  const mode = spawnModeFor(command, (options && options.env) || process.env);
  if (mode.shell && !quotingIsSafe(args)) {
    return {
      status: null,
      stdout: '',
      stderr:
        'SPAWN_UNSAFE_UNDER_SHELL: ' +
        command +
        ' resolves to a shim (' +
        (mode.resolvedPath || '?') +
        ') and an argument contains whitespace or a shell metacharacter, ' +
        'which cmd.exe would re-split. Refusing rather than sending a corrupted argv.',
      error: Object.assign(new Error('SPAWN_UNSAFE_UNDER_SHELL'), { code: 'SPAWN_UNSAFE_UNDER_SHELL' }),
      spawnMode: mode,
    };
  }
  const r = spawnSync(command, args, Object.assign({}, options, { shell: mode.shell }));
  r.spawnMode = mode;
  return r;
}

module.exports = { spawnModeFor, quotingIsSafe, safeSpawn };
