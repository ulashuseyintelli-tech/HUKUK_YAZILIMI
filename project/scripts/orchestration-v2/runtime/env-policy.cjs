'use strict';
/**
 * GOV-COORD-V2 runtime — environment policy for the executor child process.
 *
 * spawn.cjs builds the child environment from OS_ENV_ALLOWLIST plus whatever
 * credentialAllowlist adds, and refuses any key outside that union. The policy
 * therefore decides exactly which secrets an orchestrated executor can see.
 *
 * The default is the smallest set that lets a bounded code task actually work:
 * the executor needs to talk to GitHub to read its own PR, and pnpm needs its
 * store location. Everything else — database URLs, SMTP credentials, provider
 * keys, cloud tokens — stays out. A task that genuinely needs one of those is
 * not a bounded code task under this contract.
 *
 * Nothing here reads a secret's value. The policy is a list of NAMES; spawn.cjs
 * copies values from the parent process, and this module never logs them.
 */

/**
 * Names an orchestrated executor may inherit, beyond spawn.cjs's OS baseline.
 *
 * GH_TOKEN / GITHUB_TOKEN: the executor opens no PR itself — that is the
 * orchestrator's prProvider — but it does need read access to check its own
 * branch state. Kept because withholding it makes gh fail in ways that look
 * like task failures.
 *
 * PNPM_HOME / COREPACK_HOME: without these pnpm re-resolves its store per run,
 * which turns a 20-second install into minutes and can trip the timeout.
 */
const DEFAULT_CREDENTIAL_ALLOWLIST = ['GH_TOKEN', 'GITHUB_TOKEN', 'PNPM_HOME', 'COREPACK_HOME'];

/**
 * Names that must NEVER be forwarded, even if a caller adds them. This is a
 * denylist over the allowlist: an operator who widens the allowlist by accident
 * still cannot hand a database or mail credential to an orchestrated executor.
 */
const NEVER_FORWARD = [
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'DIRECT_URL',
  'SHADOW_DATABASE_URL',
  'SMTP_PASSWORD',
  'SMTP_USER',
  'JWT_SECRET',
  'NEXTAUTH_SECRET',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'MINIO_ROOT_PASSWORD',
];

class EnvPolicyError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * Resolve the credential allowlist for a run, failing closed if the caller
 * tries to widen it into forbidden territory.
 *
 * @param {string[]} [extra] additional names the run configuration asked for
 * @returns {string[]} sorted, de-duplicated allowlist
 */
function resolveCredentialAllowlist(extra) {
  const requested = (extra || []).map(String);
  const forbidden = requested.filter((k) => NEVER_FORWARD.indexOf(k) !== -1);
  if (forbidden.length) throw new EnvPolicyError('CREDENTIAL_FORBIDDEN', forbidden.join(','));
  const set = new Set(DEFAULT_CREDENTIAL_ALLOWLIST.concat(requested));
  return Array.from(set).sort();
}

/**
 * Report any denied name present in the parent environment, so a run can record
 * that it deliberately withheld them rather than that they happened to be
 * absent. Returns names only — never values.
 */
function withheldFromParent(parentEnv) {
  const parent = parentEnv || process.env;
  return NEVER_FORWARD.filter((k) => Object.prototype.hasOwnProperty.call(parent, k)).sort();
}

module.exports = {
  DEFAULT_CREDENTIAL_ALLOWLIST,
  NEVER_FORWARD,
  EnvPolicyError,
  resolveCredentialAllowlist,
  withheldFromParent,
};
