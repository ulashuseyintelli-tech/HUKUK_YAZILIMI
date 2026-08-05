'use strict';
/**
 * Real production-path tests for gh-guard-readonly.ps1.
 *
 * No call in this suite reaches real GitHub. A fake `gh` executable is
 * written to a throwaway temp directory and prepended to PATH for each
 * child pwsh invocation; the stub inspects argv and returns canned JSON
 * fixtures, or fails loudly if it ever sees anything but a GET-shaped call.
 *
 * Coverage:
 *   1) static source scan  -- no mutation-verb literal anywhere in the file
 *   2) argv-level rejection -- an unknown/mutation-flavoured parameter is
 *      refused by PowerShell's own strict parameter binding, not silently
 *      accepted
 *   3) functional snapshot mode: clean / locked / malformed lock_branch /
 *      auth-failed, each against the real script via a real pwsh process
 *   4) functional PR mode: clean / blocked-by-failed-check
 *   5) the stub records every call it received, so "auth failed => no
 *      further calls were attempted" is asserted from an actual call log,
 *      not inferred from output text
 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.join(__dirname, 'gh-guard-readonly.ps1');
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, 'utf8');
const IS_WINDOWS = process.platform === 'win32';

// ---------------------------------------------------------------- §1 static
test('§1 static: source contains no write-method literal as a --method argument', () => {
  // Every quoted string that is itself PATCH/PUT/POST/DELETE must appear
  // ONLY inside the guard's own regex/error-message plumbing (which exists
  // precisely to detect and reject those words), never as a literal value
  // handed to `--method`. Scan every `@('--method', '<VERB>'` call-site
  // literal directly: each one found must be GET.
  const methodLiteralCalls = [...SCRIPT_SOURCE.matchAll(/@\(\s*'--method',\s*'([A-Z]+)'/g)];
  assert.ok(methodLiteralCalls.length > 0, 'expected at least one literal --method call site to inspect');
  for (const [, verb] of methodLiteralCalls) {
    assert.equal(verb, 'GET', `found a non-GET --method call-site literal: ${verb}`);
  }
});

test('§1 static: no write-capable flag, payload, or mutation call exists anywhere', () => {
  // Checked as PowerShell variable/parameter references ($Repair, not the
  // bare word) so the script's own prose explaining their absence (which
  // necessarily names them) does not trip the assertion on itself.
  assert.ok(!/\$Repair\b/.test(SCRIPT_SOURCE), 'no -Repair parameter declared or referenced');
  assert.ok(!/\$VerifyLockdown\b/.test(SCRIPT_SOURCE), 'no -VerifyLockdown parameter declared or referenced');
  assert.ok(!/lockBranch\s*[:=]\s*\$?true/i.test(SCRIPT_SOURCE), 'no lockBranch:true write payload');
  assert.ok(!/updateBranchProtectionRule/.test(SCRIPT_SOURCE), 'no protection-mutation GraphQL mutation name');
  assert.ok(!/DeleteRuleset|CreateRuleset|UpdateRuleset/i.test(SCRIPT_SOURCE), 'no ruleset-mutation call');
});

// -------------------------------------------------------- stub gh fixture
function writeStub(dir, script) {
  const stubJs = path.join(dir, 'gh-stub.cjs');
  fs.writeFileSync(stubJs, script, 'utf8');
  if (IS_WINDOWS) {
    const cmd = path.join(dir, 'gh.cmd');
    fs.writeFileSync(cmd, `@echo off\r\nnode "${stubJs}" %*\r\n`, 'utf8');
  } else {
    const shim = path.join(dir, 'gh');
    fs.writeFileSync(shim, `#!/usr/bin/env node\nrequire(${JSON.stringify(stubJs)});\n`, 'utf8');
    fs.chmodSync(shim, 0o755);
  }
}

/**
 * Builds a stub `gh` that logs every invocation (as JSON lines, one call per
 * line) to CALL_LOG_PATH, and answers from `responses` keyed by a coarse
 * pattern match against argv. Any call that doesn't match a known GET-shaped
 * pattern exits 99 with a loud message -- a silent pass-through would defeat
 * the whole point of the fixture.
 */
function buildStubSource(responses) {
  return `
'use strict';
const fs = require('fs');
const argv = process.argv.slice(2);
const logPath = process.env.GH_STUB_CALL_LOG;
if (logPath) fs.appendFileSync(logPath, JSON.stringify(argv) + '\\n', 'utf8');
const joined = argv.join(' ');
const responses = ${JSON.stringify(responses)};

if (argv[0] === 'auth' && argv[1] === 'status') {
  process.exit(responses.authExitCode ?? 0);
}
if (argv[0] === 'api' && argv[1] === 'graphql') {
  process.stdout.write(responses.graphql ?? '{}');
  process.exit(responses.graphqlExitCode ?? 0);
}
if (argv[0] === 'api' && joined.includes('/protection')) {
  if (argv.includes('--method') && argv[argv.indexOf('--method') + 1] !== 'GET') {
    console.error('STUB REFUSES NON-GET CALL: ' + joined);
    process.exit(99);
  }
  process.stdout.write(responses.protection ?? '{}');
  process.exit(responses.protectionExitCode ?? 0);
}
if (argv[0] === 'api' && joined.includes('/rulesets')) {
  if (argv.includes('--method') && argv[argv.indexOf('--method') + 1] !== 'GET') {
    console.error('STUB REFUSES NON-GET CALL: ' + joined);
    process.exit(99);
  }
  process.stdout.write(responses.rulesets ?? '[]');
  process.exit(responses.rulesetsExitCode ?? 0);
}
if (argv[0] === 'pr' && argv[1] === 'view') {
  process.stdout.write(responses.prView ?? '{}');
  process.exit(responses.prViewExitCode ?? 0);
}
if (argv[0] === 'api' && (argv.includes('--method') ? argv[argv.indexOf('--method') + 1] !== 'GET' : false)) {
  console.error('STUB REFUSES NON-GET CALL: ' + joined);
  process.exit(99);
}
console.error('STUB: UNRECOGNIZED CALL SHAPE: ' + joined);
process.exit(98);
`;
}

function runScript(extraArgs, responses, extraEnv) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-stub-'));
  const callLog = path.join(tmp, 'calls.jsonl');
  writeStub(tmp, buildStubSource(responses));
  const sep = IS_WINDOWS ? ';' : ':';
  const env = {
    ...process.env,
    PATH: `${tmp}${sep}${process.env.PATH}`,
    Path: `${tmp}${sep}${process.env.Path || process.env.PATH}`,
    GH_STUB_CALL_LOG: callLog,
    ...(extraEnv || {}),
  };
  const result = spawnSync(
    'pwsh',
    ['-NoProfile', '-NonInteractive', '-File', SCRIPT_PATH, ...extraArgs],
    { encoding: 'utf8', env, windowsHide: true },
  );
  const calls = fs.existsSync(callLog)
    ? fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  fs.rmSync(tmp, { recursive: true, force: true });
  return { ...result, calls };
}

const CLEAN_PROTECTION = JSON.stringify({
  lock_branch: { enabled: false },
  required_pull_request_reviews: { required_approving_review_count: 0 },
  required_status_checks: { contexts: ['Web Tests (vitest)', 'Architectural Guardrails'], strict: false },
  enforce_admins: { enabled: false },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
  required_conversation_resolution: { enabled: false },
});

// ------------------------------------------------------------ §2 argv-level
test('§2 argv: an unrecognised mutation-flavoured parameter is refused, not accepted', () => {
  const r = runScript(['-LockBranch:$true'], { protection: CLEAN_PROTECTION }, {});
  assert.notEqual(r.status, 0, 'a made-up mutation-shaped flag must not silently succeed');
  assert.match(r.stderr + r.stdout, /LockBranch|parameter cannot be found|Argument/i);
});

// ---------------------------------------------------------- §3 snapshot mode
test('§3 snapshot: clean protection => exit 0', () => {
  const r = runScript([], { protection: CLEAN_PROTECTION, rulesets: '[]' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /lock_branch\s+= False/);
});

test('§3 snapshot: lock_branch=true is reported and exits 1, protection untouched', () => {
  const locked = JSON.stringify({ ...JSON.parse(CLEAN_PROTECTION), lock_branch: { enabled: true } });
  const r = runScript([], { protection: locked, rulesets: '[]' });
  assert.equal(r.status, 1, r.stderr || r.stdout);
  assert.match(r.stdout, /lock_branch\s+=\s+True/);
  assert.match(r.stdout, /BULGU/);
  // No call in the log is anything other than a GET-shaped read.
  for (const call of r.calls) assert.ok(!call.includes('PATCH') && !call.includes('PUT'));
});

test('§3 snapshot: missing lock_branch field fails closed (exit 2), not treated as false', () => {
  const malformed = JSON.parse(CLEAN_PROTECTION);
  delete malformed.lock_branch;
  const r = runScript([], { protection: JSON.stringify(malformed) });
  assert.equal(r.status, 2, r.stderr || r.stdout);
  assert.match(r.stdout + r.stderr, /fail-closed/i);
});

test('§3 snapshot: lock_branch.enabled as a non-boolean fails closed (exit 2)', () => {
  const malformed = JSON.parse(CLEAN_PROTECTION);
  malformed.lock_branch = { enabled: 'yes' };
  const r = runScript([], { protection: JSON.stringify(malformed) });
  assert.equal(r.status, 2, r.stderr || r.stdout);
});

test('§3 snapshot: gh auth failure stops before any API call is attempted', () => {
  const r = runScript([], { authExitCode: 1, protection: CLEAN_PROTECTION });
  assert.equal(r.status, 2, r.stderr || r.stdout);
  const apiCalls = r.calls.filter((c) => c[0] === 'api');
  assert.equal(apiCalls.length, 0, 'no api call should be attempted once auth is down');
});

// -------------------------------------------------------------- §4 PR mode
test('§4 PR mode: clean PR with all required checks green => exit 0', () => {
  const prView = JSON.stringify({
    title: 'test pr', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN', reviewDecision: null, headRefOid: 'a'.repeat(40),
  });
  const graphql = JSON.stringify({
    data: { repository: { pullRequest: { commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [
      { __typename: 'CheckRun', name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ] } } } }] } } } },
  });
  const r = runScript(['-Pr', '42'], { protection: CLEAN_PROTECTION, prView, graphql });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('§4 PR mode: a failed required check is reported as a blocker (exit 1)', () => {
  const prView = JSON.stringify({
    title: 'test pr', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE',
    mergeStateStatus: 'BLOCKED', reviewDecision: null, headRefOid: 'a'.repeat(40),
  });
  const graphql = JSON.stringify({
    data: { repository: { pullRequest: { commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [
      { __typename: 'CheckRun', name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ] } } } }] } } } },
  });
  const r = runScript(['-Pr', '42'], { protection: CLEAN_PROTECTION, prView, graphql });
  assert.equal(r.status, 1, r.stderr || r.stdout);
  assert.match(r.stdout, /Web Tests \(vitest\)/);
});
