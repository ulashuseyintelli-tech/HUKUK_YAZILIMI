'use strict';
/**
 * What a probe actually executed, as a canonical fact.
 *
 * `commandDigest` was null in every schema-v1 evidence record, and a null field
 * is not a small gap here: the whole claim of a delivery record is "this
 * capability was proved by running THIS, through the public door". Without the
 * command in the digest, an evidence record says a probe passed without saying
 * what it ran — so a probe quietly rewritten to invoke something easier
 * produces evidence indistinguishable from the original.
 *
 * The digest covers the invocation's MEANING, not its circumstances:
 *
 *   in    probeId, mode, ordered commands, argv, repo-relative cwd,
 *         timeoutMs, execution policy
 *   out   absolute temp paths, PIDs, timestamps, fixture names, environment
 *         values, stdout
 *
 * That split is what makes the digest comparable at all. Every sealed probe runs
 * in a fresh mkdtemp directory, so including the real cwd would give a different
 * digest on every run and the field would prove nothing. What must be stable is
 * "it ran orch-service finalize --entry <id> in the fixture root with a 180s
 * bound"; what must not leak in is which mkdtemp directory that happened to be.
 */

const path = require('path');

const authority = require('../orchestrator/authority.cjs');

/** Placeholders that stand in for values which legitimately vary per run. */
const FIXTURE_ROOT = '<fixture-root>';
const VARIABLE = '<variable>';

/**
 * Execution policy — the controls the runner applied, as data.
 *
 * In the digest because they change what the run PROVES. A probe that stopped
 * building its environment from an allowlist, or started going through a shell,
 * is making a weaker claim with the same argv, and the digest has to notice.
 */
const DEFAULT_EXECUTION_POLICY = {
  shell: false,
  envAllowlisted: true,
  processTreeKill: true,
  networkExpected: false,
};

class CommandError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'CommandError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new CommandError(code, detail);
}

/**
 * Normalize one argv entry.
 *
 * Absolute paths are the interesting case. `process.execPath` is
 * C:\Program Files\nodejs\node.exe on one machine and /usr/bin/node on another,
 * and a fixture root is a fresh temp directory every time — so an argv kept
 * verbatim could never match across machines or across runs. Each is replaced
 * by what it MEANS: the node binary, a path inside the fixture, a path inside
 * the repository.
 *
 * Backslashes become forward slashes for the same reason: the same command is
 * the same command on both platforms, and §3.16 requires the digests to agree.
 */
function normalizeArg(arg, ctx) {
  if (typeof arg !== 'string') fail('COMMAND_ARGV_INVALID', 'argv entries must be strings');
  let s = arg.split('\\').join('/');

  if (arg === process.execPath || s === process.execPath.split('\\').join('/')) return '<node>';

  const rel = (root, label) => {
    if (!root) return null;
    const r = String(root).split('\\').join('/');
    if (s === r) return label;
    if (s.indexOf(r + '/') === 0) return label + '/' + s.slice(r.length + 1);
    return null;
  };

  const inRepo = rel(ctx && ctx.repoRoot, '<repo>');
  if (inRepo) return inRepo;
  const inFixture = rel(ctx && ctx.fixtureRoot, FIXTURE_ROOT);
  if (inFixture) return inFixture;

  // Any remaining absolute path is machine-specific and must not enter the
  // digest. Reported as variable rather than dropped: the ARITY of the command
  // still matters, so the argument keeps its place.
  if (/^([a-zA-Z]:\/|\/)/.test(s)) return VARIABLE;

  // Opaque per-run identifiers (queue entry ids, attempt ids) vary legitimately.
  if (/^[0-9a-f]{24,64}$/.test(s)) return VARIABLE;

  return s;
}

/**
 * Canonical form of one command.
 *
 * @param {object} cmd
 * @param {string[]} cmd.argv        ordered, never a shell string
 * @param {string} [cmd.cwd]         absolute; normalized to a repo/fixture-relative label
 * @param {number} cmd.timeoutMs
 * @param {object} [cmd.executionPolicy]
 * @param {object} [ctx]             {repoRoot, fixtureRoot}
 */
function normalizeCommand(cmd, ctx) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) fail('COMMAND_DEFINITION_INVALID', 'not an object');
  if (typeof cmd.argv === 'string') {
    // The single most dangerous shape in this package. A shell string is not a
    // command definition; it is an invitation to re-split on whitespace.
    fail('COMMAND_ARGV_INVALID', 'a shell command string is not an argv array');
  }
  if (!Array.isArray(cmd.argv) || cmd.argv.length === 0) {
    fail('COMMAND_ARGV_INVALID', 'argv must be a non-empty array');
  }
  if (!Number.isInteger(cmd.timeoutMs) || cmd.timeoutMs < 1000 || cmd.timeoutMs > 900000) {
    fail('COMMAND_TIMEOUT_INVALID', String(cmd.timeoutMs));
  }
  if (cmd.cwd !== undefined && typeof cmd.cwd !== 'string') fail('COMMAND_CWD_INVALID', String(cmd.cwd));

  const policy = Object.assign({}, DEFAULT_EXECUTION_POLICY, cmd.executionPolicy || {});
  for (const k of Object.keys(policy)) {
    if (typeof policy[k] !== 'boolean') fail('COMMAND_DEFINITION_INVALID', 'executionPolicy.' + k + ' must be boolean');
  }
  if (policy.shell !== false) {
    // Not merely discouraged. spawn-mode refuses a corrupting argv under a
    // shell for exactly this reason, and a probe claiming otherwise is not the
    // probe this package will vouch for.
    fail('COMMAND_DEFINITION_INVALID', 'a delivery probe may not execute through a shell');
  }

  return {
    argv: cmd.argv.map((a) => normalizeArg(a, ctx)),
    cwd: cmd.cwd === undefined ? FIXTURE_ROOT : normalizeArg(cmd.cwd, ctx),
    timeoutMs: cmd.timeoutMs,
    executionPolicy: policy,
  };
}

/**
 * Canonical form of a probe's whole invocation.
 *
 * The command LIST is ordered and the order is in the digest: a probe that
 * checks the refusals before the success is making a different, stronger claim
 * than one that runs them the other way round, and evidence should be able to
 * tell them apart.
 */
function normalizeCommandDefinition(def, ctx) {
  if (!def || typeof def !== 'object') fail('COMMAND_DEFINITION_INVALID', 'not an object');
  if (typeof def.probeId !== 'string' || !def.probeId) fail('COMMAND_DEFINITION_INVALID', 'probeId');
  if (typeof def.mode !== 'string' || !def.mode) fail('COMMAND_DEFINITION_INVALID', 'mode');
  if (!Array.isArray(def.commands) || def.commands.length === 0) {
    fail('COMMAND_DEFINITION_INVALID', 'commands must be a non-empty ordered array');
  }
  return {
    schemaVersion: 1,
    probeId: def.probeId,
    mode: def.mode,
    commands: def.commands.map((c) => normalizeCommand(c, ctx)),
  };
}

/** SHA-256 over the canonical invocation, through authority's canonicalizer. */
function commandDigest(def, ctx) {
  return authority.digest(normalizeCommandDefinition(def, ctx));
}

/**
 * Collects the commands a probe runs, so the digest describes what HAPPENED
 * rather than what the manifest says should happen.
 *
 * A recorder rather than a declaration: a probe that took an early return after
 * two of its seven commands produced different evidence, and the digest should
 * say so instead of claiming the full sequence ran.
 */
function createRecorder(probeId, mode, ctx) {
  const commands = [];
  return {
    /** Record one invocation and return the argv unchanged, for chaining. */
    record(argv, cwd, timeoutMs, executionPolicy) {
      commands.push({ argv: argv.slice(), cwd, timeoutMs, executionPolicy });
      return argv;
    },
    get count() {
      return commands.length;
    },
    definition() {
      return normalizeCommandDefinition({ probeId, mode, commands }, ctx);
    },
    digest() {
      // A probe that ran nothing has no invocation to digest, and returning a
      // digest of an empty list would make "it ran" and "it did not" agree.
      if (!commands.length) return null;
      return commandDigest({ probeId, mode, commands }, ctx);
    },
  };
}

module.exports = {
  FIXTURE_ROOT,
  VARIABLE,
  DEFAULT_EXECUTION_POLICY,
  CommandError,
  normalizeArg,
  normalizeCommand,
  normalizeCommandDefinition,
  commandDigest,
  createRecorder,
};
