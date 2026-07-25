'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const coordination = require('./governance-coordination.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REQUEST_TEMPLATE = path.join(
  PROJECT_ROOT,
  'docs',
  'governance',
  'coordination-requests',
  '_template',
  'request.md',
);
const RESULT_TEMPLATE = path.join(
  PROJECT_ROOT,
  'docs',
  'governance',
  'coordination-results',
  '_template',
  'result.md',
);
const REGISTER_PATH = path.join(
  PROJECT_ROOT,
  'docs',
  'governance',
  'governance-writer-coordination-register.md',
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof coordination.CoordinationError);
    assert.equal(error.code, code);
    return true;
  });
}

function validRequest() {
  return clone(coordination.makeSelfTestRequest().request);
}

function refingerprint(request) {
  request.requestFingerprint = coordination.computeRequestFingerprint(request);
  return request;
}

function requestMarkdown(request) {
  return [
    '# Fixture',
    '',
    '<!-- GOV_COORD_REQUEST_JSON_BEGIN -->',
    '```json',
    JSON.stringify(request, null, 2),
    '```',
    '<!-- GOV_COORD_REQUEST_JSON_END -->',
    '',
  ].join('\n');
}

function runFixtureGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`,
  );
  return result.stdout.trim();
}

function createAuthorityGitFixture(repoPath, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-authority-'));
  runFixtureGit(['init', '--quiet'], root);
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(['config', 'user.email', 'governance-coordination@example.invalid'], root);

  const filePath = path.join(root, ...repoPath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  runFixtureGit(['add', '--', repoPath], root);
  runFixtureGit(['commit', '--quiet', '-m', 'authority fixture'], root);

  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  const tree = runFixtureGit(['rev-parse', 'HEAD^{tree}'], root);
  const unrelated = runFixtureGit(['commit-tree', tree, '-m', 'unrelated evidence'], root);
  return { root, head, unrelated };
}

function authorityRef(kind, repoPath, recordId) {
  return {
    kind,
    path: repoPath,
    recordId,
    evidenceSha: '0'.repeat(40),
  };
}

function authorityLocatorRepairChanges() {
  return coordination.AUTHORITY_LOCATOR_REPAIR_I01.changedPaths.map((repoPath) => ({
    status: 'M',
    path: repoPath,
  }));
}

function classifyAuthorityLocatorRepair(changes, overrides = {}) {
  return coordination.classifyPrChangeSet(changes, {
    base: coordination.AUTHORITY_LOCATOR_REPAIR_I01.baseSha,
    headRef: coordination.AUTHORITY_LOCATOR_REPAIR_I01.headRef,
    ...overrides,
  });
}

function validResult(request = validRequest()) {
  return {
    schemaVersion: 1,
    resultId: `RESULT-${request.requestId}`,
    requestId: request.requestId,
    requestFingerprint: request.requestFingerprint,
    status: 'SUCCEEDED',
    executionPrNumber: 1600,
    executionMergeSha: coordination.EFFECTIVE_FROM_MAIN_SHA,
    effectiveMainSha: coordination.EFFECTIVE_FROM_MAIN_SHA,
    completedAt: '2026-07-24T00:00:00Z',
    validationEvidence: [
      {
        name: 'governance-coordination',
        status: 'PASS',
        evidenceSha: coordination.EFFECTIVE_FROM_MAIN_SHA,
      },
    ],
  };
}

test('request and result templates parse only their inert structured blocks', () => {
  const before = global.__govCoordTemplateExecuted;
  coordination.parseRequestFile(REQUEST_TEMPLATE, { template: true });
  coordination.parseResultFile(RESULT_TEMPLATE, { template: true });
  assert.equal(global.__govCoordTemplateExecuted, before);
});

test('valid request schema and request fingerprint pass', () => {
  const request = validRequest();
  assert.equal(coordination.validateRequestObject(request), request);
});

test('unknown request field is rejected', () => {
  const request = validRequest();
  request.shellCommand = 'echo should-not-run';
  expectCode(
    () => coordination.validateRequestObject(request),
    'UNKNOWN_OR_MISSING_FIELD',
  );
});

test('request fingerprint mismatch is rejected', () => {
  const request = validRequest();
  request.operation.newValue = 'MUTATED_AFTER_FINGERPRINT';
  expectCode(
    () => coordination.validateRequestObject(request),
    'REQUEST_FINGERPRINT_MISMATCH',
  );
});

test('path traversal is rejected', () => {
  const request = validRequest();
  request.operation.targetFile = '../outside.md';
  request.declaredTargetAllowlist = ['../outside.md'];
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'PATH_TRAVERSAL_FORBIDDEN',
  );
});

test('absolute path is rejected', () => {
  const request = validRequest();
  request.operation.targetFile = 'C:/outside.md';
  request.declaredTargetAllowlist = ['C:/outside.md'];
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'ABSOLUTE_PATH_FORBIDDEN',
  );
});

test('backslash path is rejected', () => {
  const request = validRequest();
  request.operation.targetFile = 'project\\docs\\governance\\file.md';
  request.declaredTargetAllowlist = ['project\\docs\\governance\\file.md'];
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'BACKSLASH_PATH_FORBIDDEN',
  );
});

test('unknown operation and reconciliation are rejected', () => {
  for (const operationType of ['UNKNOWN_OPERATION', 'RECONCILIATION']) {
    const request = validRequest();
    request.operation.type = operationType;
    refingerprint(request);
    expectCode(
      () => coordination.validateRequestObject(request),
      'OPERATION_NOT_ALLOWED',
    );
  }
});

test('free-form governance edit is rejected', () => {
  const request = validRequest();
  request.operation.changeClass = 'FREE_FORM';
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'FREE_FORM_EDIT_FORBIDDEN',
  );
});

test('semantic and execution authority cannot be the same record', () => {
  const request = validRequest();
  request.semanticAuthorityRef = clone(request.executionGrantRef);
  request.semanticAuthorityRef.kind = 'SEMANTIC_AUTHORITY';
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'AUTHORITY_REFERENCE_COLLISION',
  );
});

test('semantic authority must be a canonical governance path', () => {
  const request = validRequest();
  request.semanticAuthorityRef.path = 'README.md';
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'SEMANTIC_AUTHORITY_PATH_INVALID',
  );
});

test('authority marker resolves when recordId repeats in prose', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'GOV-TEST-SEMANTIC',
  );
  const marker = coordination.buildAuthorityMarker(ref);
  const fixture = createAuthorityGitFixture(
    ref.path,
    `${marker}\nGOV-TEST-SEMANTIC heading\nGOV-TEST-SEMANTIC prose\n`,
  );
  ref.evidenceSha = fixture.head;
  assert.doesNotThrow(() =>
    coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
  );
});

test('missing exact authority marker is rejected', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'GOV-TEST-MISSING',
  );
  const fixture = createAuthorityGitFixture(ref.path, 'GOV-TEST-MISSING prose only\n');
  ref.evidenceSha = fixture.head;
  expectCode(
    () => coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
    'AUTHORITY_RECORD_MARKER_MISSING',
  );
});

test('duplicate exact authority marker is rejected', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'GOV-TEST-DUPLICATE',
  );
  const marker = coordination.buildAuthorityMarker(ref);
  const fixture = createAuthorityGitFixture(ref.path, `${marker}\n${marker}\n`);
  ref.evidenceSha = fixture.head;
  expectCode(
    () => coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
    'AUTHORITY_RECORD_MARKER_DUPLICATE',
  );
});

test('authority marker with the wrong kind is rejected', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'GOV-TEST-WRONG-KIND',
  );
  const fixture = createAuthorityGitFixture(
    ref.path,
    '<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOV-TEST-WRONG-KIND -->\n',
  );
  ref.evidenceSha = fixture.head;
  expectCode(
    () => coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
    'AUTHORITY_RECORD_MARKER_MISSING',
  );
});

test('authority marker with the wrong recordId is rejected', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'GOV-TEST-EXPECTED',
  );
  const fixture = createAuthorityGitFixture(
    ref.path,
    '<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOV-TEST-OTHER -->\n',
  );
  ref.evidenceSha = fixture.head;
  expectCode(
    () => coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
    'AUTHORITY_RECORD_MARKER_MISSING',
  );
});

test('semantic row association accepts an exact recordId with an em dash title', () => {
  const recordId = 'GOV-TEST-ROW';
  const marker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${recordId} -->`;
  assert.equal(
    coordination.authorityMarkerLocatesSemanticRow(
      `${marker} **${recordId} — Canonical Title**`,
      marker,
      recordId,
    ),
    true,
  );
});

test('semantic row association accepts an exact recordId with a colon title', () => {
  const recordId = 'GOV-TEST-ROW';
  const marker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${recordId} -->`;
  assert.equal(
    coordination.authorityMarkerLocatesSemanticRow(
      `${marker} **${recordId}: Canonical Title**`,
      marker,
      recordId,
    ),
    true,
  );
});

test('semantic row association accepts an immediately closed bold recordId', () => {
  const recordId = 'GOV-TEST-ROW';
  const marker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${recordId} -->`;
  assert.equal(
    coordination.authorityMarkerLocatesSemanticRow(
      `${marker} **${recordId}**`,
      marker,
      recordId,
    ),
    true,
  );
});

test('semantic row association rejects a recordId prefix match', () => {
  const recordId = 'GOV-TEST-ROW';
  const marker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${recordId} -->`;
  assert.equal(
    coordination.authorityMarkerLocatesSemanticRow(
      `${marker} **${recordId}-EXTRA — Wrong Row**`,
      marker,
      recordId,
    ),
    false,
  );
});

test('semantic row association rejects a heading on another line', () => {
  const recordId = 'GOV-TEST-ROW';
  const marker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${recordId} -->`;
  assert.equal(
    coordination.authorityMarkerLocatesSemanticRow(
      `${marker}\n**${recordId} — Separate Heading**`,
      marker,
      recordId,
    ),
    false,
  );
});

test('semantic row association rejects the wrong heading recordId', () => {
  const recordId = 'GOV-TEST-ROW';
  const marker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${recordId} -->`;
  assert.equal(
    coordination.authorityMarkerLocatesSemanticRow(
      `${marker} **GOV-TEST-OTHER — Wrong Row**`,
      marker,
      recordId,
    ),
    false,
  );
});

test('execution grant marker ignores heading and Grant ID repetitions', () => {
  const ref = authorityRef(
    'EXECUTION_GRANT',
    'project/docs/governance/coordination-execution-grants/GOV-TEST-GRANT.md',
    'GOV-TEST-GRANT',
  );
  const marker = coordination.buildAuthorityMarker(ref);
  const fixture = createAuthorityGitFixture(
    ref.path,
    `# GOV-TEST-GRANT — Standing Execution Grant\n${marker}\nGrant ID: GOV-TEST-GRANT\n`,
  );
  ref.evidenceSha = fixture.head;
  assert.doesNotThrow(() =>
    coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
  );
});

test('semantic marker resolves a long decision row with repeated recordId', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'CLIENT-P2-U03-TRACK-B-D01-GOV',
  );
  const marker = coordination.buildAuthorityMarker(ref);
  const fixture = createAuthorityGitFixture(
    ref.path,
    `| 2026-07-24 | ${marker} **CLIENT-P2-U03-TRACK-B-D01-GOV** | owner CLIENT-P2-U03-TRACK-B-D01-GOV brief | detail CLIENT-P2-U03-TRACK-B-D01-GOV |\n`,
  );
  ref.evidenceSha = fixture.head;
  assert.doesNotThrow(() =>
    coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
  );
});

test('authority evidence must remain in validated ref ancestry', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'GOV-TEST-ANCESTRY',
  );
  const marker = coordination.buildAuthorityMarker(ref);
  const fixture = createAuthorityGitFixture(ref.path, `${marker}\n`);
  ref.evidenceSha = fixture.unrelated;
  expectCode(
    () => coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
    'AUTHORITY_EVIDENCE_NOT_IN_MAIN',
  );
});

test('raw recordId-only legacy authority content has no fallback', () => {
  const ref = authorityRef(
    'SEMANTIC_AUTHORITY',
    'project/docs/governance/decision-log.md',
    'GOV-TEST-LEGACY',
  );
  const fixture = createAuthorityGitFixture(
    ref.path,
    '# GOV-TEST-LEGACY\nrecordId: GOV-TEST-LEGACY\n',
  );
  ref.evidenceSha = fixture.head;
  expectCode(
    () => coordination.validateAuthorityRecordAtRef(fixture.head, ref, fixture.root),
    'AUTHORITY_RECORD_MARKER_MISSING',
  );
});

test('unsafe authority recordId characters are rejected fail-closed', () => {
  const request = validRequest();
  request.semanticAuthorityRef.recordId = 'GOV-TEST -->';
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'AUTHORITY_RECORD_ID_INVALID',
  );
});

test('owner WIP target is rejected', () => {
  const request = validRequest();
  request.operation.targetFile = 'project/docs/governance/decision-log.md';
  request.declaredTargetAllowlist = [request.operation.targetFile];
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'OWNER_WIP_TARGET_FORBIDDEN',
  );
});

test('production, schema, migration and runtime prefixes are rejected', () => {
  for (const target of [
    'project/apps/api/src/runtime.ts',
    'project/apps/api/prisma/schema.prisma',
    'project/apps/api/prisma/migrations/20260724_change/migration.sql',
    'project/packages/types/src/index.ts',
  ]) {
    const request = validRequest();
    request.operation.targetFile = target;
    request.declaredTargetAllowlist = [target];
    refingerprint(request);
    expectCode(
      () => coordination.validateRequestObject(request),
      'PRODUCTION_TARGET_FORBIDDEN',
    );
  }
});

test('protected-path escape is rejected', () => {
  const request = validRequest();
  request.operation.targetFile = 'README.md';
  request.declaredTargetAllowlist = ['README.md'];
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'PROTECTED_PATH_ESCAPE',
  );
});

test('control-plane target is rejected', () => {
  for (const target of [
    'project/docs/governance/governance-writer-coordination-contract.md',
    'project/docs/governance/coordination-requests/README.md',
    'project/docs/governance/coordination-results/README.md',
  ]) {
    const request = validRequest();
    request.operation.targetFile = target;
    request.declaredTargetAllowlist = [request.operation.targetFile];
    refingerprint(request);
    expectCode(
      () => coordination.validateRequestObject(request),
      'CONTROL_PLANE_TARGET_FORBIDDEN',
    );
  }
});

test('symlink fixture is fail-closed', () => {
  expectCode(
    () => coordination.assertNotSymlink(true, 'fixture-link'),
    'SYMLINK_TARGET_FORBIDDEN',
  );
});

test('valid exact mechanical execution produces exact expected bytes', () => {
  const { request, baseContent } = coordination.makeSelfTestRequest();
  const result = coordination.applyMechanicalOperation(baseContent, request.operation);
  assert.equal(result, 'record: GOV-SELF-TEST\nanchor: NEW\n');
});

test('expected-old-value mismatch is rejected', () => {
  const request = validRequest();
  request.operation.expectedOldValue = 'DOES_NOT_EXIST';
  request.operation.expectedResultSha256 = '0'.repeat(64);
  expectCode(
    () =>
      coordination.applyMechanicalOperation(
        'record: GOV-SELF-TEST\nanchor: OLD\n',
        request.operation,
      ),
    'EXPECTED_OLD_VALUE_MATCH_INVALID',
  );
});

test('expected resulting digest mismatch is rejected', () => {
  const request = validRequest();
  request.operation.expectedResultSha256 = '0'.repeat(64);
  expectCode(
    () =>
      coordination.applyMechanicalOperation(
        'record: GOV-SELF-TEST\nanchor: OLD\n',
        request.operation,
      ),
    'EXPECTED_RESULT_DIGEST_MISMATCH',
  );
});

test('multiple anchor match is rejected', () => {
  const request = validRequest();
  expectCode(
    () =>
      coordination.applyMechanicalOperation(
        'record: GOV-SELF-TEST\nanchor: OLD\nanchor: OLD\n',
        request.operation,
      ),
    'ANCHOR_MATCH_INVALID',
  );
});

test('modified immutable request is rejected by PR scope classifier', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet([
        {
          status: 'M',
          path: 'project/docs/governance/coordination-requests/GOV-REQ-20260724-X/request.md',
        },
      ]),
    'IMMUTABLE_REQUEST_MODIFIED',
  );
});

test('modified immutable result is rejected by PR scope classifier', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet([
        {
          status: 'M',
          path: 'project/docs/governance/coordination-results/GOV-REQ-20260724-X/result.md',
        },
      ]),
    'IMMUTABLE_RESULT_MODIFIED',
  );
});

test('valid request-only PR scope is classified exactly', () => {
  const result = coordination.classifyPrChangeSet([
    {
      status: 'A',
      path: 'project/docs/governance/coordination-requests/GOV-REQ-20260724-X/request.md',
    },
    { status: 'M', path: coordination.REGISTER_REPO_PATH },
  ]);
  assert.equal(result.mode, 'REQUEST_ONLY');
});

test('valid result-only PR scope is classified exactly', () => {
  const result = coordination.classifyPrChangeSet([
    {
      status: 'A',
      path: 'project/docs/governance/coordination-results/GOV-REQ-20260724-X/result.md',
    },
    { status: 'M', path: coordination.REGISTER_REPO_PATH },
  ]);
  assert.equal(result.mode, 'RESULT_ONLY');
});

test('valid mechanical execution scope is classified separately', () => {
  const result = coordination.classifyPrChangeSet([
    { status: 'M', path: 'project/docs/governance/GOVERNANCE-INDEX.md' },
  ]);
  assert.equal(result.mode, 'EXECUTION');
});

test('bootstrap PR requires the exact fifteen-file mode scope', () => {
  const changes = [
    ...coordination.BOOTSTRAP_MODIFY,
  ].map((file) => ({ status: 'M', path: file }));
  changes.push(
    ...[...coordination.BOOTSTRAP_ADD].map((file) => ({ status: 'A', path: file })),
  );
  assert.equal(changes.length, 15);
  assert.equal(coordination.classifyPrChangeSet(changes).mode, 'BOOTSTRAP');
});

test('authority locator repair requires exact base, head ref, and five paths', () => {
  const result = classifyAuthorityLocatorRepair(authorityLocatorRepairChanges());
  assert.equal(result.mode, 'AUTHORITY_LOCATOR_REPAIR_I01');
});

test('authority locator repair rejects the wrong base', () => {
  expectCode(
    () =>
      classifyAuthorityLocatorRepair(authorityLocatorRepairChanges(), {
        base: '0'.repeat(40),
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('authority locator repair rejects the wrong head ref', () => {
  expectCode(
    () =>
      classifyAuthorityLocatorRepair(authorityLocatorRepairChanges(), {
        headRef: 'codex/gov-coord-v1-authority-locator-repair-i02',
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('authority locator repair rejects one missing path', () => {
  expectCode(
    () => classifyAuthorityLocatorRepair(authorityLocatorRepairChanges().slice(1)),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('authority locator repair rejects one extra path', () => {
  const changes = authorityLocatorRepairChanges();
  changes.push({ status: 'M', path: 'project/docs/governance/GOVERNANCE-INDEX.md' });
  expectCode(
    () => classifyAuthorityLocatorRepair(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('authority locator repair rejects a similarly named branch', () => {
  expectCode(
    () =>
      classifyAuthorityLocatorRepair(authorityLocatorRepairChanges(), {
        headRef: `${coordination.AUTHORITY_LOCATOR_REPAIR_I01.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('authority locator repair rejects request or result instance additions', () => {
  for (const instancePath of [
    'project/docs/governance/coordination-requests/GOV-REQ-20260725-X/request.md',
    'project/docs/governance/coordination-results/GOV-REQ-20260725-X/result.md',
  ]) {
    const changes = authorityLocatorRepairChanges();
    changes.push({ status: 'A', path: instancePath });
    expectCode(
      () => classifyAuthorityLocatorRepair(changes),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('result schema validates observed evidence', () => {
  const result = validResult();
  assert.equal(coordination.validateResultObject(result), result);
});

test('SUCCEEDED result cannot contain non-PASS evidence', () => {
  const result = validResult();
  result.validationEvidence[0].status = 'FAIL';
  expectCode(
    () => coordination.validateResultObject(result),
    'RESULT_EVIDENCE_CONTRADICTION',
  );
});

test('generated register is deterministic and byte-stable', () => {
  const request = validRequest();
  const result = validResult(request);
  const instances = {
    requests: [{ file: 'request.md', value: request }],
    results: [{ file: 'result.md', value: result }],
  };
  const first = coordination.generateRegisterContent(instances);
  const second = coordination.generateRegisterContent(instances);
  assert.equal(first, second);
  assert.match(first, new RegExp(request.requestId));
  assert.match(first, /DERIVED \/ NON-AUTHORITATIVE/);
});

test('duplicate request fingerprint is rejected deterministically', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-'));
  const requestsRoot = path.join(tempRoot, 'requests');
  const resultsRoot = path.join(tempRoot, 'results');
  fs.mkdirSync(path.join(requestsRoot, 'one'), { recursive: true });
  fs.mkdirSync(path.join(requestsRoot, 'two'), { recursive: true });
  fs.mkdirSync(resultsRoot, { recursive: true });
  const markdown = requestMarkdown(validRequest());
  fs.writeFileSync(path.join(requestsRoot, 'one', 'request.md'), markdown);
  fs.writeFileSync(path.join(requestsRoot, 'two', 'request.md'), markdown);
  expectCode(
    () =>
      coordination.loadRepositoryInstances({
        requestsRoot,
        resultsRoot,
      }),
    'DUPLICATE_REQUEST_FINGERPRINT',
  );
});

test('bootstrap register is current and contains no real request', () => {
  assert.equal(coordination.verifyRegister(REGISTER_PATH), true);
  const content = fs.readFileSync(REGISTER_PATH, 'utf8');
  assert.match(content, /\| _none_ \| _none_ \|/);
});

test('CLI self-test core passes', () => {
  assert.equal(coordination.runSelfTest(), true);
});
