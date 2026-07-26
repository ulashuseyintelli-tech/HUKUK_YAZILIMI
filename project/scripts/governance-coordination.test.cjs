'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const coordination = require('./governance-coordination.cjs');

const PROJECT_ROOT = process.env.GOV_COORD_TEST_PROJECT_ROOT
  ? path.resolve(process.env.GOV_COORD_TEST_PROJECT_ROOT)
  : path.resolve(__dirname, '..');
const REQUESTS_ROOT = path.join(
  PROJECT_ROOT,
  'docs',
  'governance',
  'coordination-requests',
);
const RESULTS_ROOT = path.join(
  PROJECT_ROOT,
  'docs',
  'governance',
  'coordination-results',
);
const REQUEST_TEMPLATE = path.join(
  REQUESTS_ROOT,
  '_template',
  'request.md',
);
const RESULT_TEMPLATE = path.join(
  RESULTS_ROOT,
  '_template',
  'result.md',
);
const REGISTER_PATH = path.join(
  PROJECT_ROOT,
  'docs',
  'governance',
  'governance-writer-coordination-register.md',
);
const REPO_ROOT = path.resolve(PROJECT_ROOT, '..');
const PILOT_REQUEST_ID = 'GOV-REQ-20260725-PILOT-001';
const PILOT_REQUEST_BASE = 'f1fa3a2e17653727a2f1098ecb0afbcdc6488a15';
const PILOT_EXECUTION_BASE = 'c714769b10a60152b14c61b7fd75e76386fedfb9';
const PILOT_EXECUTION_BRANCH =
  'codex/gov-exec/GOV-REQ-20260725-PILOT-001';
const PILOT_REQUEST_BRANCH =
  'codex/gov-coord-v1-pilot-001-request-only-r03';
const PILOT_RESULT_BRANCH =
  'codex/gov-result/GOV-REQ-20260725-PILOT-001';
const PILOT_REQUEST_PATH =
  'project/docs/governance/coordination-requests/GOV-REQ-20260725-PILOT-001/request.md';
const PILOT_RESULT_PATH =
  'project/docs/governance/coordination-results/GOV-REQ-20260725-PILOT-001/result.md';
const PILOT_TARGET_PATH =
  'project/docs/governance/OFFICE-MASTER-SYNTHESIS.md';

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

function createRegisterFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-register-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const requestsRoot = path.join(root, 'requests');
  const resultsRoot = path.join(root, 'results');
  const requestTemplateRoot = path.join(requestsRoot, '_template');
  const resultTemplateRoot = path.join(resultsRoot, '_template');
  const registerPath = path.join(root, 'register.md');

  fs.mkdirSync(requestTemplateRoot, { recursive: true });
  fs.mkdirSync(resultTemplateRoot, { recursive: true });
  fs.copyFileSync(REQUEST_TEMPLATE, path.join(requestTemplateRoot, 'request.md'));
  fs.copyFileSync(RESULT_TEMPLATE, path.join(resultTemplateRoot, 'result.md'));
  fs.writeFileSync(path.join(requestsRoot, 'README.md'), '# Requests\n', 'utf8');
  fs.writeFileSync(path.join(resultsRoot, 'README.md'), '# Results\n', 'utf8');

  return { requestsRoot, resultsRoot, registerPath };
}

function writeFixtureRequest(fixture, request, directory = request.requestId) {
  const requestRoot = path.join(fixture.requestsRoot, directory);
  fs.mkdirSync(requestRoot, { recursive: true });
  fs.writeFileSync(path.join(requestRoot, 'request.md'), requestMarkdown(request), 'utf8');
}

function loadFixtureInstances(fixture) {
  return coordination.loadRepositoryInstances({
    requestsRoot: fixture.requestsRoot,
    resultsRoot: fixture.resultsRoot,
  });
}

function materializeFixtureRegister(fixture) {
  const instances = loadFixtureInstances(fixture);
  const content = coordination.generateRegisterContent(instances);
  fs.writeFileSync(fixture.registerPath, content, 'utf8');
  return { instances, content };
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

function registerTestFixtureRepairChanges() {
  return coordination.REGISTER_TEST_FIXTURE_REPAIR_I01.changedPaths.map(
    (repoPath) => ({
      status: 'M',
      path: repoPath,
    }),
  );
}

function classifyRegisterTestFixtureRepair(changes, overrides = {}) {
  return coordination.classifyPrChangeSet(changes, {
    base: coordination.REGISTER_TEST_FIXTURE_REPAIR_I01.baseSha,
    headRef: coordination.REGISTER_TEST_FIXTURE_REPAIR_I01.headRef,
    ...overrides,
  });
}

function executionBaseAncestryRepairChanges() {
  return coordination.EXECUTION_BASE_ANCESTRY_REPAIR_I01.changedPaths.map(
    (repoPath) => ({
      status: 'M',
      path: repoPath,
    }),
  );
}

function classifyExecutionBaseAncestryRepair(changes, overrides = {}) {
  return coordination.classifyPrChangeSet(changes, {
    base: coordination.EXECUTION_BASE_ANCESTRY_REPAIR_I01.baseSha,
    headRef: coordination.EXECUTION_BASE_ANCESTRY_REPAIR_I01.headRef,
    ...overrides,
  });
}

function noncoordPrClassifierRepairChanges() {
  return coordination.NONCOORD_PR_CLASSIFIER_REPAIR_R01.changedPaths.map(
    (repoPath) => ({
      status: 'M',
      path: repoPath,
    }),
  );
}

function classifyNoncoordPrClassifierRepair(changes, overrides = {}) {
  return coordination.classifyPrChangeSet(changes, {
    base: coordination.NONCOORD_PR_CLASSIFIER_REPAIR_R01.baseSha,
    headRef: coordination.NONCOORD_PR_CLASSIFIER_REPAIR_R01.headRef,
    ...overrides,
  });
}

function analyzeFirstConditionalExecutionR02Changes() {
  return coordination.ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function classifyAnalyzeFirstConditionalExecutionR02(changes, overrides = {}) {
  return coordination.classifyPrChangeSet(changes, {
    base: coordination.ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.baseSha,
    headRef: coordination.ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.headRef,
    ...overrides,
  });
}

function gh02BindingChanges() {
  return coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    (repoPath) => ({ status: 'M', path: repoPath }),
  );
}

function classifyGh02Binding(changes, overrides = {}) {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  return coordination.classifyPrChangeSet(changes, {
    base: binding.bindingPr.baseSha,
    headRef: binding.bindingPr.headRef,
    ...overrides,
  });
}

function gh02WorkflowChanges() {
  return coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01.workflowPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function classifyGh02Workflow(changes, overrides = {}) {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  return coordination.classifyPrChangeSet(changes, {
    base: binding.workflowPr.originalBaseSha,
    headRef: binding.workflowPr.headRef,
    ...overrides,
  });
}

function createGh02SyncedGitFixture(t) {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-gh02-'));
  const root = path.join(parent, 'repo');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  fs.mkdirSync(root);
  runFixtureGit(['init', '--quiet'], root);
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(
    ['config', 'user.email', 'governance-coordination@example.invalid'],
    root,
  );
  runFixtureGit(['config', 'core.autocrlf', 'false'], root);
  runFixtureGit(
    ['fetch', '--quiet', '--no-tags', REPO_ROOT, binding.workflowPr.canonicalMergeSha],
    root,
  );

  runFixtureGit(
    ['checkout', '--quiet', '-b', 'workflow-head', binding.workflowPr.originalBaseSha],
    root,
  );
  runFixtureGit(
    ['checkout', binding.workflowPr.canonicalMergeSha, '--', binding.workflowPr.targetPath],
    root,
  );
  runFixtureGit(['add', '--', binding.workflowPr.targetPath], root);
  runFixtureGit(['commit', '--quiet', '-m', 'recreate canonical GH-02 workflow content'], root);

  runFixtureGit(
    ['checkout', '--quiet', '-b', 'binding-base', binding.workflowPr.originalBaseSha],
    root,
  );
  const contractPath = path.join(
    root,
    'project',
    'docs',
    'governance',
    'governance-writer-coordination-contract.md',
  );
  fs.appendFileSync(
    contractPath,
    `\n${binding.taskId}\n${binding.workflowPr.mode}\n`,
    'utf8',
  );
  runFixtureGit(
    ['add', '--', 'project/docs/governance/governance-writer-coordination-contract.md'],
    root,
  );
  runFixtureGit(['commit', '--quiet', '-m', 'canonical GH-02 binding'], root);
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  runFixtureGit(['checkout', '--quiet', 'workflow-head'], root);
  runFixtureGit(['merge', '--quiet', '--no-ff', base, '-m', 'sync binding base'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createDetachedGitFixture(t, startRef) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-execution-base-'));
  const root = path.join(parent, 'repo');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  fs.mkdirSync(root);
  runFixtureGit(['init', '--quiet'], root);
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(
    ['config', 'user.email', 'governance-coordination@example.invalid'],
    root,
  );
  runFixtureGit(['config', 'core.autocrlf', 'false'], root);
  runFixtureGit(['fetch', '--quiet', '--no-tags', REPO_ROOT, 'HEAD'], root);
  runFixtureGit(['checkout', '--quiet', '--detach', startRef], root);
  return root;
}

function createPilotGitFixture(t) {
  return createDetachedGitFixture(t, PILOT_EXECUTION_BASE);
}

function fixturePath(root, repoPath) {
  return path.join(root, ...repoPath.split('/'));
}

function writeFixtureRepoFile(root, repoPath, content) {
  const filePath = fixturePath(root, repoPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createOrdinaryPrCliFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-noncoord-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runFixtureGit(['init', '--quiet'], root);
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(
    ['config', 'user.email', 'governance-coordination@example.invalid'],
    root,
  );
  runFixtureGit(['config', 'core.autocrlf', 'false'], root);

  const scriptPath = 'project/scripts/governance-coordination.cjs';
  const policyPath =
    'project/docs/governance/governance-writer-coordination-protected-paths.json';
  writeFixtureRepoFile(
    root,
    scriptPath,
    fs.readFileSync(path.join(__dirname, 'governance-coordination.cjs'), 'utf8'),
  );
  writeFixtureRepoFile(
    root,
    policyPath,
    fs.readFileSync(fixturePath(REPO_ROOT, policyPath), 'utf8'),
  );
  const base = commitFixture(root, 'classifier fixture base');
  writeFixtureRepoFile(root, 'project/apps/api/src/ordinary.ts', 'export const ordinary = true;\n');
  const head = commitFixture(root, 'ordinary PR fixture');
  return { root, scriptPath, base, head };
}

function createSelfContainedPilotExecutionFixture(t) {
  const root = createDetachedGitFixture(t, coordination.EFFECTIVE_FROM_MAIN_SHA);
  const requestBase = runFixtureGit(['rev-parse', 'HEAD'], root);
  runFixtureGit(['rm', '-r', '--quiet', '--ignore-unmatch', '.'], root);

  const semanticRecordId = 'CLIENT-P2-U03-TRACK-B-D01-GOV';
  const executionRecordId = 'GOV-COORD-V1-CODEX-LOCAL';
  const semanticPath = 'project/docs/governance/decision-log.md';
  const executionPath =
    'project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md';
  const recordIdentity =
    'CLIENT PHASE 2 — TRACK B FINANCIAL DISCLOSURE ARCHITECTURE (CLIENT-P2-U03-TRACK-B-D01) — OWNER RATIFIED, GOVERNANCE-ONLY (2026-07-24)';
  const anchor = `**${recordIdentity}:**`;
  const expectedOldValue =
    'Detay: `decision-log.md` CLIENT-P2-U03-TRACK-B-D01-GOV kaydı.';
  const newValue =
    'Detay: `decision-log.md` CLIENT-P2-U03-TRACK-B-D01-GOV kaydı; fixture evidence.';
  const targetContent = `${anchor}\n${expectedOldValue}\n`;
  const expectedContent = targetContent.replace(expectedOldValue, newValue);
  const operation = {
    type: 'EXACT_REFERENCE_REWRITE',
    changeClass: 'LEVEL_2_MECHANICAL',
    targetFile: PILOT_TARGET_PATH,
    recordIdentity,
    anchor,
    expectedOldValue,
    newValue,
    evidenceSha: requestBase,
    expectedResultSha256: coordination.sha256(expectedContent),
  };
  const request = {
    schemaVersion: 1,
    requestId: PILOT_REQUEST_ID,
    requestFingerprint: '',
    requestedBy: 'OWNER',
    createdAt: '2026-07-25T00:00:00Z',
    baseMainSha: requestBase,
    semanticAuthorityRef: {
      kind: 'SEMANTIC_AUTHORITY',
      path: semanticPath,
      recordId: semanticRecordId,
      evidenceSha: requestBase,
    },
    executionGrantRef: {
      kind: 'EXECUTION_GRANT',
      path: executionPath,
      recordId: executionRecordId,
      evidenceSha: requestBase,
    },
    operation,
    declaredTargetAllowlist: [PILOT_TARGET_PATH],
  };
  refingerprint(request);
  coordination.validateRequestObject(request);

  writeFixtureRepoFile(
    root,
    semanticPath,
    `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${semanticRecordId} --> **${semanticRecordId} — Fixture authority**\n`,
  );
  writeFixtureRepoFile(
    root,
    executionPath,
    `<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=${executionRecordId} -->\n`,
  );
  writeFixtureRepoFile(root, PILOT_TARGET_PATH, targetContent);
  writeFixtureRepoFile(root, PILOT_REQUEST_PATH, requestMarkdown(request));
  writeFixtureRepoFile(
    root,
    'project/docs/governance/coordination-requests/_template/request.md',
    '# Request template fixture\n',
  );
  writeFixtureRepoFile(
    root,
    'project/docs/governance/coordination-results/_template/result.md',
    '# Result template fixture\n',
  );
  writeFixtureRepoFile(
    root,
    coordination.REGISTER_REPO_PATH,
    coordination.generateRegisterContent({
      requests: [{ file: PILOT_REQUEST_PATH, value: request }],
      results: [],
    }),
  );

  const executionBase = commitFixture(root, 'request-only fixture');
  const executionHead = createFixtureExecutionHead(root);
  return {
    root,
    request,
    requestBase,
    executionBase,
    executionHead,
  };
}

function commitFixture(root, message) {
  runFixtureGit(['add', '-A'], root);
  runFixtureGit(['commit', '--quiet', '-m', message], root);
  return runFixtureGit(['rev-parse', 'HEAD'], root);
}

function mutateFixtureRequest(root, mutator, refingerprintAfter = false) {
  const requestFile = fixturePath(root, PILOT_REQUEST_PATH);
  const request = coordination.parseRequestFile(requestFile);
  mutator(request);
  if (refingerprintAfter) refingerprint(request);
  fs.writeFileSync(requestFile, requestMarkdown(request), 'utf8');
  return request;
}

function createFixtureExecutionHead(root, extraMutation = null) {
  const request = coordination.parseRequestFile(
    fixturePath(root, PILOT_REQUEST_PATH),
  );
  const targetPath = fixturePath(root, request.operation.targetFile);
  const targetContent = fs.readFileSync(targetPath, 'utf8');
  fs.writeFileSync(
    targetPath,
    coordination.applyMechanicalOperation(targetContent, request.operation),
    'utf8',
  );
  if (extraMutation) extraMutation(root);
  return commitFixture(root, 'execution fixture');
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
  ], { headRef: PILOT_REQUEST_BRANCH });
  assert.equal(result.mode, 'REQUEST_ONLY');
});

test('valid result-only PR scope is classified exactly', () => {
  const result = coordination.classifyPrChangeSet([
    {
      status: 'A',
      path: 'project/docs/governance/coordination-results/GOV-REQ-20260724-X/result.md',
    },
    { status: 'M', path: coordination.REGISTER_REPO_PATH },
  ], { headRef: 'codex/gov-result/GOV-REQ-20260724-X' });
  assert.equal(result.mode, 'RESULT_ONLY');
});

test('valid mechanical execution scope is classified separately', () => {
  const result = coordination.classifyPrChangeSet([
    { status: 'M', path: 'project/docs/governance/GOVERNANCE-INDEX.md' },
  ], { headRef: PILOT_EXECUTION_BRANCH });
  assert.equal(result.mode, 'EXECUTION');
});

test('ordinary production modification is non-coordination', () => {
  const result = coordination.classifyPrChangeSet(
    [{ status: 'M', path: 'project/apps/api/src/ordinary.ts' }],
    { headRef: 'codex/ordinary-production-change' },
  );
  assert.equal(result.mode, 'NON_COORDINATION_PR');
});

test('ordinary new production and test files are non-coordination', () => {
  const result = coordination.classifyPrChangeSet(
    [
      { status: 'A', path: 'project/apps/api/src/new-production.ts' },
      { status: 'A', path: 'project/apps/api/src/new-production.spec.ts' },
    ],
    { headRef: 'codex/ordinary-new-files' },
  );
  assert.equal(result.mode, 'NON_COORDINATION_PR');
});

test('multiple ordinary production docs and test files are non-coordination', () => {
  const result = coordination.classifyPrChangeSet(
    [
      { status: 'M', path: 'project/apps/api/src/ordinary.ts' },
      { status: 'A', path: 'project/apps/api/src/ordinary.test.ts' },
      { status: 'M', path: 'project/docs/ordinary.md' },
    ],
    { headRef: 'codex/ordinary-mixed-files' },
  );
  assert.equal(result.mode, 'NON_COORDINATION_PR');
});

test('PR 1598 exact four-file diff is non-coordination', () => {
  const result = coordination.classifyPrChangeSet(
    [
      {
        status: 'A',
        path: 'project/apps/api/src/modules/icrabot/v28-engine/__tests__/v28-surface-containment.spec.ts',
      },
      {
        status: 'A',
        path: 'project/apps/api/src/modules/icrabot/v28-engine/guards/v28-surface.guard.ts',
      },
      {
        status: 'M',
        path: 'project/apps/api/src/modules/icrabot/v28-engine/outbox.constants.ts',
      },
      {
        status: 'M',
        path: 'project/apps/api/src/modules/icrabot/v28-engine/v28-engine.controller.ts',
      },
    ],
    { headRef: 'codex/v28-xten-sec-p0-01b-containment-r01' },
  );
  assert.equal(result.mode, 'NON_COORDINATION_PR');
});

test('ordinary filenames containing coordination words do not create false positives', () => {
  const result = coordination.classifyPrChangeSet(
    [
      { status: 'A', path: 'project/apps/api/src/request-handler.ts' },
      { status: 'M', path: 'project/apps/api/src/result-execution.service.ts' },
    ],
    { headRef: 'codex/request-result-execution-feature' },
  );
  assert.equal(result.mode, 'NON_COORDINATION_PR');
});

test('malformed execution branch is rejected fail-closed', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [{ status: 'M', path: PILOT_TARGET_PATH }],
        { headRef: 'codex/gov-exec/not-a-request-id' },
      ),
    'EXECUTION_BRANCH_INVALID',
  );
});

test('malformed result branch is rejected fail-closed', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [{ status: 'M', path: 'project/docs/ordinary.md' }],
        { headRef: 'codex/gov-result/not-a-request-id' },
      ),
    'RESULT_BRANCH_INVALID',
  );
});

test('request coordination path on an ordinary branch is rejected fail-closed', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [
          { status: 'A', path: PILOT_REQUEST_PATH },
          { status: 'M', path: coordination.REGISTER_REPO_PATH },
        ],
        { headRef: 'codex/ordinary-docs-change' },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('result coordination path on an ordinary branch is rejected fail-closed', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [
          { status: 'A', path: PILOT_RESULT_PATH },
          { status: 'M', path: coordination.REGISTER_REPO_PATH },
        ],
        { headRef: 'codex/ordinary-docs-change' },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('mixed request and result coordination classes are rejected fail-closed', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [
          { status: 'A', path: PILOT_REQUEST_PATH },
          { status: 'A', path: PILOT_RESULT_PATH },
          { status: 'M', path: coordination.REGISTER_REPO_PATH },
        ],
        { headRef: PILOT_REQUEST_BRANCH },
      ),
    'COORDINATION_CLASS_AMBIGUOUS',
  );
});

test('non-coordination CLI exits zero with deterministic marker', (t) => {
  const fixture = createOrdinaryPrCliFixture(t);
  const result = spawnSync(
    process.execPath,
    [
      fixture.scriptPath,
      'validate-pr-scope',
      '--base',
      fixture.base,
      '--head',
      fixture.head,
      '--head-ref',
      'codex/ordinary-production-change',
    ],
    {
      cwd: fixture.root,
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'GOV_COORD_NON_COORDINATION_PR');
});

test('non-coordination classifier repair requires exact base head ref and paths', () => {
  const result = classifyNoncoordPrClassifierRepair(
    noncoordPrClassifierRepairChanges(),
  );
  assert.equal(result.mode, 'NONCOORD_PR_CLASSIFIER_REPAIR_R01');
});

test('non-coordination classifier repair rejects a scope mismatch', () => {
  expectCode(
    () =>
      classifyNoncoordPrClassifierRepair([
        ...noncoordPrClassifierRepairChanges(),
        { status: 'M', path: 'project/docs/ordinary.md' },
      ]),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('analyze-first R02 requires exact base branch and A/M change set', () => {
  const result = classifyAnalyzeFirstConditionalExecutionR02(
    analyzeFirstConditionalExecutionR02Changes(),
  );
  assert.equal(result.mode, 'ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02');
});

test('analyze-first R02 rejects the wrong base', () => {
  expectCode(
    () =>
      classifyAnalyzeFirstConditionalExecutionR02(
        analyzeFirstConditionalExecutionR02Changes(),
        { base: '0'.repeat(40) },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('analyze-first R02 rejects the wrong or similar branch', () => {
  for (const headRef of [
    'codex/dx-006-analyze-first-conditional-execution-r01',
    `${coordination.ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.headRef}-copy`,
    'codex/dx-006-analyze-first-conditional-execution-*',
  ]) {
    expectCode(
      () =>
        classifyAnalyzeFirstConditionalExecutionR02(
          analyzeFirstConditionalExecutionR02Changes(),
          { headRef },
        ),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('analyze-first R02 rejects a missing or extra path', () => {
  expectCode(
    () =>
      classifyAnalyzeFirstConditionalExecutionR02(
        analyzeFirstConditionalExecutionR02Changes().slice(1),
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );

  const changes = analyzeFirstConditionalExecutionR02Changes();
  changes.push({
    status: 'M',
    path: 'project/docs/governance/GOVERNANCE-INDEX.md',
  });
  expectCode(
    () => classifyAnalyzeFirstConditionalExecutionR02(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('analyze-first R02 rejects an A/M status mismatch', () => {
  const changes = analyzeFirstConditionalExecutionR02Changes();
  const grant = changes.find((change) => change.status === 'A');
  grant.status = 'M';
  expectCode(
    () => classifyAnalyzeFirstConditionalExecutionR02(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('analyze-first R02 rejects an arbitrary control-plane path', () => {
  const changes = analyzeFirstConditionalExecutionR02Changes().filter(
    (change) => change.path !== 'AGENTS.md',
  );
  changes.push({
    status: 'M',
    path: 'project/docs/governance/governance-writer-coordination-protected-paths.json',
  });
  expectCode(
    () => classifyAnalyzeFirstConditionalExecutionR02(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('analyze-first R02 authority markers are exact unique and distinct', () => {
  const { semanticAuthority, executionGrant } =
    coordination.ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02;
  assert.notEqual(semanticAuthority.recordId, executionGrant.recordId);

  for (const authority of [semanticAuthority, executionGrant]) {
    const marker = coordination.buildAuthorityMarker(authority);
    const content = fs.readFileSync(
      path.join(REPO_ROOT, ...authority.path.split('/')),
      'utf8',
    );
    assert.equal(coordination.countOccurrences(content, marker), 1);
    const markerLine = content.split(/\r?\n/).find((line) => line.includes(marker));
    assert.ok(markerLine);
    assert.equal(
      coordination.authorityMarkerLocatesSemanticRow(
        markerLine,
        marker,
        authority.recordId,
      ),
      true,
    );
  }
});

test('active execution policy docs align on analyze-first continuation', () => {
  const policyPaths = [
    'AGENTS.md',
    'CLAUDE.md',
    '.claude/CLAUDE.md',
    'project/docs/governance/process-rules.md',
    'project/PROJECT_MEMORY_PACK/03_OPERATING_MODEL.md',
    'project/docs/governance/governance-writer-coordination-contract.md',
    'project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md',
  ];
  const policyText = policyPaths
    .map((repoPath) =>
      fs.readFileSync(path.join(REPO_ROOT, ...repoPath.split('/')), 'utf8'),
    )
    .join('\n');

  assert.doesNotMatch(policyText, /GO-ANALYZE sonunda .*kullanici karari beklenir/i);
  assert.doesNotMatch(policyText, /GO-IMPLEMENT sonunda .*kullanici karari beklenir/i);
  assert.doesNotMatch(policyText, /Onay almadan kodlamaya gecme/i);
  assert.doesNotMatch(policyText, /MERGE_READY\s*→\s*OWNER MERGE/);
  assert.doesNotMatch(policyText, /owner manuel merge/i);

  assert.match(policyText, /GO-COMPLETE — ANALYZE-FIRST CONDITIONAL EXECUTION/);
  assert.match(policyText, /IF IMPLEMENT/);
  assert.match(policyText, /IF GO-COMPLETE/);
  assert.match(policyText, /STANDING \/ UNATTENDED AUTO-MERGE/);
});

test('explicit GO-ANALYZE remains read-only after policy alignment', () => {
  const agents = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  const processRules = fs.readFileSync(
    path.join(REPO_ROOT, 'project', 'docs', 'governance', 'process-rules.md'),
    'utf8',
  );
  assert.match(agents, /`GO-ANALYZE`: Explicit salt-okunur analizdir/);
  assert.match(processRules, /Explicit read-only moddur/);
  assert.match(processRules, /dosya değişikliği, commit, PR veya merge yoktur/i);
});

test('GH-02 authority binding requires exact base branch and three-file scope', () => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const result = classifyGh02Binding(gh02BindingChanges());
  assert.equal(result.mode, binding.bindingPr.mode);
  assert.equal(result.taskId, binding.taskId);
});

test('GH-02 authority binding rejects base drift and scope expansion', () => {
  expectCode(
    () => classifyGh02Binding(gh02BindingChanges(), { base: '0'.repeat(40) }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const changes = gh02BindingChanges();
  changes.push({ status: 'M', path: '.github/workflows/ci.yml' });
  expectCode(
    () => classifyGh02Binding(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-02 workflow recognizes only the exact task branch and ci.yml change', () => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const result = classifyGh02Workflow(gh02WorkflowChanges());
  assert.equal(result.mode, binding.workflowPr.mode);
  assert.equal(result.taskId, binding.taskId);
});

test('GH-02 workflow rejects a second production file', () => {
  const changes = gh02WorkflowChanges();
  changes.push({ status: 'M', path: 'project/apps/api/src/main.ts' });
  expectCode(
    () => classifyGh02Workflow(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-02 workflow rejects wrong, similar, and wildcard-like branches', () => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  for (const headRef of [
    'codex/github-platform-gh03-workflow-hardening-r01',
    `${binding.workflowPr.headRef}-copy`,
    'codex/github-platform-gh02-*',
  ]) {
    expectCode(
      () => classifyGh02Workflow(gh02WorkflowChanges(), { headRef }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('GH-02 workflow rejects a wrong task identity', () => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  expectCode(
    () =>
      coordination.validateGithubPlatformGh02WorkflowScope({
        base: binding.workflowPr.originalBaseSha,
        head: binding.workflowPr.canonicalMergeSha,
        headRef: binding.workflowPr.headRef,
        changes: gh02WorkflowChanges(),
        taskId: 'GITHUB-PLATFORM-BASELINE-GH03',
        cwd: REPO_ROOT,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-02 workflow rejects another workflow file', () => {
  const changes = [
    { status: 'M', path: '.github/workflows/gov-coord-v2-tests.yml' },
  ];
  expectCode(
    () => classifyGh02Workflow(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-02 workflow rejects classifier or control-plane scope expansion', () => {
  for (const extraPath of [
    'project/scripts/governance-coordination.cjs',
    'project/docs/governance/governance-writer-coordination-contract.md',
  ]) {
    const changes = gh02WorkflowChanges();
    changes.push({ status: 'M', path: extraPath });
    expectCode(
      () => classifyGh02Workflow(changes),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('GH-02 exact context fails deterministically when canonical merge is unavailable', (t) => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-gh02-missing-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  runFixtureGit(['init', '--quiet'], parent);
  expectCode(
    () =>
      coordination.validateGithubPlatformGh02WorkflowScope({
        base: binding.workflowPr.originalBaseSha,
        head: binding.workflowPr.canonicalMergeSha,
        headRef: binding.workflowPr.headRef,
        changes: gh02WorkflowChanges(),
        taskId: binding.taskId,
        cwd: parent,
      }),
    'CONTROL_PLANE_BINDING_OBJECT_UNAVAILABLE',
  );
});

test('GH-02 canonical squash merge and target blob validate Git-backed', () => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const result = coordination.validateGithubPlatformGh02WorkflowScope({
    base: binding.workflowPr.originalBaseSha,
    head: binding.workflowPr.canonicalMergeSha,
    headRef: binding.workflowPr.headRef,
    changes: gh02WorkflowChanges(),
    taskId: binding.taskId,
    cwd: REPO_ROOT,
  });
  assert.equal(result.mode, binding.workflowPr.mode);
  assert.equal(result.taskId, binding.taskId);
});

test('GH-02 accepts a canonical binding base only after non-rewriting branch sync', (t) => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const fixture = createGh02SyncedGitFixture(t);
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: binding.workflowPr.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.workflowPr.mode);
});

test('GH-02 rejects workflow content outside the authorized patch semantics', (t) => {
  const binding = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const fixture = createGh02SyncedGitFixture(t);
  const targetPath = path.join(
    fixture.root,
    ...binding.workflowPr.targetPath.split('/'),
  );
  fs.appendFileSync(targetPath, '\n# unauthorized GH-02 semantic drift\n', 'utf8');
  runFixtureGit(['add', '--', binding.workflowPr.targetPath], fixture.root);
  runFixtureGit(['commit', '--quiet', '-m', 'unauthorized workflow mutation'], fixture.root);
  const driftedHead = runFixtureGit(['rev-parse', 'HEAD'], fixture.root);
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: driftedHead,
        headRef: binding.workflowPr.headRef,
        cwd: fixture.root,
      }),
    'GH02_WORKFLOW_CONTENT_DRIFT',
  );
});

test('normal production classification does not inspect historical GH-02 objects', () => {
  const result = coordination.classifyPrChangeSet(
    [{ status: 'M', path: 'project/apps/api/src/example.ts' }],
    { base: 'a'.repeat(40), headRef: 'feature/ordinary-production' },
  );
  assert.equal(result.mode, 'NON_COORDINATION_PR');
});

test('GH-02 recovery requires exact base branch and three-file scope', () => {
  const recovery = coordination.GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02;
  const changes = recovery.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  const result = coordination.classifyPrChangeSet(changes, {
    base: recovery.baseSha,
    headRef: recovery.headRef,
  });
  assert.equal(result.mode, recovery.mode);
  expectCode(
    () => coordination.classifyPrChangeSet(changes.slice(1), {
      base: recovery.baseSha,
      headRef: recovery.headRef,
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-03 binding requires exact base, head ref, and four modified paths', () => {
  const binding = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  const result = coordination.classifyPrChangeSet(changes, {
    base: binding.baseSha,
    headRef: binding.headRef,
  });
  assert.equal(result.mode, binding.mode);
  assert.equal(result.taskId, binding.taskId);
});

test('GH-03 binding rejects the wrong base', () => {
  const binding = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, {
      base: '0'.repeat(40),
      headRef: binding.headRef,
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-03 binding rejects the wrong head ref', () => {
  const binding = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, {
      base: binding.baseSha,
      headRef: 'codex/gh03-control-plane-binding-r02',
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-03 binding rejects a missing path', () => {
  const binding = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  const changes = binding.changedPaths
    .slice(1)
    .map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, {
      base: binding.baseSha,
      headRef: binding.headRef,
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-03 binding rejects an added path in place of a modified one', () => {
  const binding = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  const changes = binding.changedPaths.map((repoPath, index) => ({
    status: index === 0 ? 'A' : 'M',
    path: repoPath,
  }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, {
      base: binding.baseSha,
      headRef: binding.headRef,
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-03 binding pins ci.yml by blob sha, never by commit sha', () => {
  const binding = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  assert.equal(binding.targetPath, '.github/workflows/ci.yml');
  assert.match(binding.expectedTargetBlobSha, /^[0-9a-f]{40}$/);
  // GH-02 regression guard: a commit-sha pin can be deleted, a blob pin cannot.
  assert.equal(
    Object.prototype.hasOwnProperty.call(binding, 'canonicalMergeSha'),
    false,
  );
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

test('register test fixture repair requires exact base, head ref, and three paths', () => {
  const result = classifyRegisterTestFixtureRepair(registerTestFixtureRepairChanges());
  assert.equal(result.mode, 'REGISTER_TEST_FIXTURE_REPAIR_I01');
});

test('register test fixture repair rejects the wrong base', () => {
  expectCode(
    () =>
      classifyRegisterTestFixtureRepair(registerTestFixtureRepairChanges(), {
        base: '0'.repeat(40),
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('register test fixture repair rejects the wrong head ref', () => {
  expectCode(
    () =>
      classifyRegisterTestFixtureRepair(registerTestFixtureRepairChanges(), {
        headRef: 'codex/gov-coord-v1-register-test-fixture-repair-i02',
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('register test fixture repair rejects one missing path', () => {
  expectCode(
    () =>
      classifyRegisterTestFixtureRepair(registerTestFixtureRepairChanges().slice(1)),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('register test fixture repair rejects one extra path', () => {
  const changes = registerTestFixtureRepairChanges();
  changes.push({ status: 'M', path: 'project/docs/governance/GOVERNANCE-INDEX.md' });
  expectCode(
    () => classifyRegisterTestFixtureRepair(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('register test fixture repair rejects a similarly named branch', () => {
  expectCode(
    () =>
      classifyRegisterTestFixtureRepair(registerTestFixtureRepairChanges(), {
        headRef: `${coordination.REGISTER_TEST_FIXTURE_REPAIR_I01.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('execution base ancestry repair requires exact base, head ref, and two paths', () => {
  const result = classifyExecutionBaseAncestryRepair(
    executionBaseAncestryRepairChanges(),
  );
  assert.equal(result.mode, 'EXECUTION_BASE_ANCESTRY_REPAIR_I01');
});

test('execution base ancestry repair rejects the wrong base', () => {
  expectCode(
    () =>
      classifyExecutionBaseAncestryRepair(
        executionBaseAncestryRepairChanges(),
        { base: '0'.repeat(40) },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('execution base ancestry repair rejects the wrong head ref', () => {
  expectCode(
    () =>
      classifyExecutionBaseAncestryRepair(
        executionBaseAncestryRepairChanges(),
        {
          headRef:
            'codex/gov-coord-v1-execution-base-ancestry-repair-i01-copy',
        },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('execution base ancestry repair rejects one missing path', () => {
  expectCode(
    () =>
      classifyExecutionBaseAncestryRepair(
        executionBaseAncestryRepairChanges().slice(1),
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('execution base ancestry repair rejects one extra path', () => {
  const changes = executionBaseAncestryRepairChanges();
  changes.push({
    status: 'M',
    path: 'project/docs/governance/governance-writer-coordination-contract.md',
  });
  expectCode(
    () => classifyExecutionBaseAncestryRepair(changes),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('request base equal to execution base satisfies ancestry', () => {
  assert.equal(
    coordination.assertRequestBaseAncestor(
      PILOT_EXECUTION_BASE,
      PILOT_EXECUTION_BASE,
      REPO_ROOT,
    ),
    true,
  );
});

test('request base ancestor of execution base satisfies ancestry', () => {
  assert.equal(
    coordination.assertRequestBaseAncestor(
      PILOT_REQUEST_BASE,
      PILOT_EXECUTION_BASE,
      REPO_ROOT,
    ),
    true,
  );
});

test('request base descendant of execution base is rejected', () => {
  expectCode(
    () =>
      coordination.assertRequestBaseAncestor(
        PILOT_EXECUTION_BASE,
        PILOT_REQUEST_BASE,
        REPO_ROOT,
      ),
    'REQUEST_BASE_NOT_ANCESTOR',
  );
});

test('unrelated request base is rejected', (t) => {
  const root = createPilotGitFixture(t);
  const tree = runFixtureGit(
    ['rev-parse', `${PILOT_EXECUTION_BASE}^{tree}`],
    root,
  );
  const unrelated = runFixtureGit(
    ['commit-tree', tree, '-m', 'unrelated request base'],
    root,
  );
  expectCode(
    () =>
      coordination.assertRequestBaseAncestor(
        unrelated,
        PILOT_EXECUTION_BASE,
        root,
      ),
    'REQUEST_BASE_NOT_ANCESTOR',
  );
});

test('unknown request base SHA is rejected fail-closed', () => {
  expectCode(
    () =>
      coordination.assertRequestBaseAncestor(
        '0'.repeat(40),
        PILOT_EXECUTION_BASE,
        REPO_ROOT,
      ),
    'REQUEST_BASE_NOT_ANCESTOR',
  );
});

test('real pilot execution chain validates against canonical PR base', (t) => {
  const fixture = createSelfContainedPilotExecutionFixture(t);
  const result = coordination.validatePrScope({
    base: fixture.executionBase,
    head: fixture.executionHead,
    headRef: PILOT_EXECUTION_BRANCH,
    cwd: fixture.root,
  });
  assert.equal(result.mode, 'EXECUTION');
});

test('real pilot execution rejects a non-canonical branch', (t) => {
  const fixture = createSelfContainedPilotExecutionFixture(t);
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.executionBase,
        head: fixture.executionHead,
        headRef: 'codex/gov-coord-v1-pilot-001-execution-r01',
        cwd: fixture.root,
      }),
    'EXECUTION_BRANCH_INVALID',
  );
});

test('canonical request resolves only from PR base and remains PENDING', (t) => {
  const fixture = createSelfContainedPilotExecutionFixture(t);
  fs.writeFileSync(
    fixturePath(fixture.root, PILOT_REQUEST_PATH),
    '# Working-tree request must not be used\n',
    'utf8',
  );
  const request = coordination.validateCanonicalRequestAtExecutionBase(
    PILOT_REQUEST_ID,
    fixture.executionBase,
    fixture.executionHead,
    fixture.root,
  );
  assert.equal(request.requestId, PILOT_REQUEST_ID);
  assert.equal(request.baseMainSha, fixture.requestBase);
  assert.equal(request.requestFingerprint, fixture.request.requestFingerprint);
  assert.match(
    runFixtureGit(
      ['show', `${fixture.executionBase}:${coordination.REGISTER_REPO_PATH}`],
      fixture.root,
    ),
    /\| PENDING \| _none_ \|/,
  );
  assert.equal(
    runFixtureGit(
      ['ls-tree', fixture.executionBase, '--', PILOT_RESULT_PATH],
      fixture.root,
    ),
    '',
  );
});

test('missing canonical request at PR base is rejected', (t) => {
  const root = createPilotGitFixture(t);
  fs.rmSync(fixturePath(root, PILOT_REQUEST_PATH));
  const base = commitFixture(root, 'remove canonical request');
  expectCode(
    () =>
      coordination.validateCanonicalRequestAtExecutionBase(
        PILOT_REQUEST_ID,
        base,
        base,
        root,
      ),
    'CANONICAL_REQUEST_MISSING_AT_PR_BASE',
  );
});

test('canonical request path with a different requestId is rejected', (t) => {
  const root = createPilotGitFixture(t);
  mutateFixtureRequest(
    root,
    (request) => {
      request.requestId = 'GOV-REQ-20260725-PILOT-OTHER';
    },
    true,
  );
  const base = commitFixture(root, 'change canonical request id');
  expectCode(
    () =>
      coordination.validateCanonicalRequestAtExecutionBase(
        PILOT_REQUEST_ID,
        base,
        base,
        root,
      ),
    'CANONICAL_REQUEST_MISMATCH',
  );
});

test('canonical request with a mismatched fingerprint is rejected', (t) => {
  const root = createPilotGitFixture(t);
  mutateFixtureRequest(root, (request) => {
    request.createdAt = '2026-07-25T12:00:00Z';
  });
  const base = commitFixture(root, 'corrupt canonical request fingerprint');
  expectCode(
    () =>
      coordination.validateCanonicalRequestAtExecutionBase(
        PILOT_REQUEST_ID,
        base,
        base,
        root,
      ),
    'REQUEST_FINGERPRINT_MISMATCH',
  );
});

test('request mutation between execution base and head is rejected', (t) => {
  const root = createPilotGitFixture(t);
  fs.appendFileSync(
    fixturePath(root, PILOT_REQUEST_PATH),
    '\nmutated outside structured payload\n',
    'utf8',
  );
  const head = commitFixture(root, 'mutate request at execution head');
  expectCode(
    () =>
      coordination.validateCanonicalRequestAtExecutionBase(
        PILOT_REQUEST_ID,
        PILOT_EXECUTION_BASE,
        head,
        root,
      ),
    'CANONICAL_REQUEST_MISMATCH',
  );
});

test('existing result at execution base is rejected', (t) => {
  const root = createPilotGitFixture(t);
  const resultPath = fixturePath(root, PILOT_RESULT_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, '# Existing result\n', 'utf8');
  const base = commitFixture(root, 'add existing result');
  expectCode(
    () =>
      coordination.validateCanonicalRequestAtExecutionBase(
        PILOT_REQUEST_ID,
        base,
        base,
        root,
      ),
    'RESULT_ALREADY_EXISTS',
  );
});

test('non-PENDING canonical register state is rejected', (t) => {
  const root = createPilotGitFixture(t);
  const registerPath = fixturePath(root, coordination.REGISTER_REPO_PATH);
  const register = fs.readFileSync(registerPath, 'utf8');
  fs.writeFileSync(
    registerPath,
    register.replace('| PENDING | _none_ |', '| FAILED | _none_ |'),
    'utf8',
  );
  const base = commitFixture(root, 'change request status');
  expectCode(
    () =>
      coordination.validateCanonicalRequestAtExecutionBase(
        PILOT_REQUEST_ID,
        base,
        base,
        root,
      ),
    'REQUEST_NOT_PENDING',
  );
});

test('execution diff containing request.md is rejected', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet([
        { status: 'M', path: PILOT_TARGET_PATH },
        { status: 'M', path: PILOT_REQUEST_PATH },
      ]),
    'IMMUTABLE_REQUEST_MODIFIED',
  );
});

test('execution diff containing generated register is rejected', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet([
        { status: 'M', path: PILOT_TARGET_PATH },
        { status: 'M', path: coordination.REGISTER_REPO_PATH },
      ]),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('execution diff containing a result instance is rejected', () => {
  expectCode(
    () =>
      coordination.classifyPrChangeSet([
        { status: 'M', path: PILOT_TARGET_PATH },
        { status: 'A', path: PILOT_RESULT_PATH },
      ]),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('execution diff outside the declared target allowlist is rejected', (t) => {
  const root = createPilotGitFixture(t);
  const head = createFixtureExecutionHead(root, (fixtureRoot) => {
    fs.appendFileSync(
      fixturePath(
        fixtureRoot,
        'project/docs/governance/GOVERNANCE-INDEX.md',
      ),
      '\nextra execution target\n',
      'utf8',
    );
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: PILOT_EXECUTION_BASE,
        head,
        headRef: PILOT_EXECUTION_BRANCH,
        cwd: root,
      }),
    'EXECUTION_TARGET_SCOPE_INVALID',
  );
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

test('empty isolated fixture generates and verifies the empty register row', (t) => {
  const fixture = createRegisterFixture(t);
  const { instances, content } = materializeFixtureRegister(fixture);
  assert.match(content, /^\| _none_ \| _none_ \|/m);
  assert.equal(coordination.verifyRegister(fixture.registerPath, instances), true);
});

test('one-request isolated fixture generates exact pending request identity', (t) => {
  const fixture = createRegisterFixture(t);
  const request = validRequest();
  writeFixtureRequest(fixture, request);
  const { instances, content } = materializeFixtureRegister(fixture);

  assert.match(content, new RegExp(`\\| ${request.requestId} \\|`));
  assert.match(content, new RegExp(`\\| ${request.requestFingerprint} \\|`));
  assert.match(content, new RegExp(`\\| ${request.baseMainSha} \\|`));
  assert.match(content, /\| PENDING \| _none_ \|/);
  assert.doesNotMatch(content, /^\| _none_ \| _none_ \|/m);
  assert.equal(coordination.verifyRegister(fixture.registerPath, instances), true);
});

test('stale isolated fixture register fails closed', (t) => {
  const fixture = createRegisterFixture(t);
  const { instances } = materializeFixtureRegister(fixture);
  fs.appendFileSync(fixture.registerPath, 'stale\n', 'utf8');
  expectCode(
    () => coordination.verifyRegister(fixture.registerPath, instances),
    'GENERATED_REGISTER_STALE',
  );
});

test('malformed isolated request fails before register generation', (t) => {
  const fixture = createRegisterFixture(t);
  const request = validRequest();
  delete request.requestId;
  writeFixtureRequest(fixture, request, 'malformed');
  expectCode(() => loadFixtureInstances(fixture), 'UNKNOWN_OR_MISSING_FIELD');
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

test('current repository register matches deterministic generated output', () => {
  const instances = coordination.loadRepositoryInstances({
    requestsRoot: REQUESTS_ROOT,
    resultsRoot: RESULTS_ROOT,
  });
  const expected = coordination.generateRegisterContent(instances);
  const actual = fs.readFileSync(REGISTER_PATH, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(actual, expected);
  assert.equal(coordination.verifyRegister(REGISTER_PATH, instances), true);
});

test('CLI self-test core passes', () => {
  assert.equal(coordination.runSelfTest(), true);
});
