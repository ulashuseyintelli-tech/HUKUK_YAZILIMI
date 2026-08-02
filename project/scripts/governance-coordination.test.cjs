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

function validExecutionModelState(overrides = {}) {
  const base = {
    taskId: 'TASK-01',
    executionMode: 'GO-COMPLETE',
    status: 'CLOSED',
    semanticDecision: { status: 'RATIFIED', tupleSha256: 'a'.repeat(64) },
    eligibility: { eligible: true, dispatchCandidate: true },
    executionGrant: { present: true, taskId: 'TASK-01', reusable: false },
    mergeAuthority: { present: true, taskId: 'TASK-01', reusable: false },
    checkpoint: { type: 'MECHANICAL', ownerRequired: false },
    stage: {
      name: 'STAGE_1',
      successorTaskId: 'TASK-02',
      successorDeterministic: true,
      separateGrantRequired: false,
      separateGrantPresent: false,
    },
    writer: { competing: false, uniqueWip: false, unknown: false },
    scope: { changed: false, productionActivation: false, migration: false, irreversible: false },
    priority: { class: 'P0', programLocked: true },
  };
  return Object.assign(base, overrides, {
    semanticDecision: Object.assign(base.semanticDecision, overrides.semanticDecision),
    eligibility: Object.assign(base.eligibility, overrides.eligibility),
    executionGrant: Object.assign(base.executionGrant, overrides.executionGrant),
    mergeAuthority: Object.assign(base.mergeAuthority, overrides.mergeAuthority),
    checkpoint: Object.assign(base.checkpoint, overrides.checkpoint),
    stage: Object.assign(base.stage, overrides.stage),
    writer: Object.assign(base.writer, overrides.writer),
    scope: Object.assign(base.scope, overrides.scope),
    priority: Object.assign(base.priority, overrides.priority),
  });
}

function attributedOwnerWipSource(sourceId, exactPaths, options = {}) {
  const entries = [...exactPaths]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path: exactPath, activeProtection }) => ({
      exactPath,
      blobSha256: 'a'.repeat(64),
      workingTreeState: options.workingTreeState || 'TEST_FIXTURE',
      ownership: options.ownership || 'TEST_OWNER_WIP',
      semanticPurpose: options.semanticPurpose || 'test fixture',
      disposition:
        options.disposition ||
        (activeProtection ? 'ACTIVE_UNSHIPPED_OWNER_INTENT' : 'ARCHIVED'),
      activeProtection,
    }));
  return {
    sourceId,
    sourceType: options.sourceType || 'TEST_SOURCE',
    sourceLocation: options.sourceLocation || `C:/test/${sourceId}`,
    baseSha: options.baseSha || 'b'.repeat(40),
    owner: 'OWNER',
    semanticPurpose: options.semanticPurpose || 'test fixture',
    disposition: options.disposition || 'TEST_DISPOSITION',
    activeProtection: entries.some((entry) => entry.activeProtection),
    archiveReference: 'test-archive#sha256=' + 'c'.repeat(64),
    exactPaths: entries,
  };
}

test('execution model: unchanged semantic tuple is not re-ratified', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState());
  assert.equal(result.semanticCheckpoint, 'CLEAR');
  assert.ok(result.codes.includes('SEMANTIC_DECISION_ALREADY_RATIFIED'));
});

test('execution model: exact grant dispatches an eligible deterministic successor', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState());
  assert.equal(result.eligibility, 'ELIGIBLE');
  assert.equal(result.dispatch, 'DISPATCHABLE');
  assert.ok(result.codes.includes('MECHANICAL_SUCCESSOR_ELIGIBLE'));
  assert.ok(result.codes.includes('EXECUTION_GRANT_PRESENT'));
});

test('execution model: exact merge authority authorizes merge only with continuation', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState());
  assert.equal(result.mutation, 'ALLOWED');
  assert.equal(result.merge, 'AUTHORIZED');
  assert.ok(result.codes.includes('MERGE_AUTHORITY_PRESENT'));
});

test('execution model: Stage 1 completion makes a deterministic Stage 2 candidate eligible', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    stage: {
      name: 'STAGE_1',
      successorTaskId: 'STAGE-2-TASK',
      successorDeterministic: true,
      separateGrantRequired: false,
      separateGrantPresent: false,
    },
  }));
  assert.ok(result.codes.includes('MECHANICAL_SUCCESSOR_ELIGIBLE'));
  assert.equal(result.dispatch, 'DISPATCHABLE');
});

test('execution model: Stage 2 with its own grant remains dispatchable', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    taskId: 'STAGE-2-TASK',
    executionGrant: { present: true, taskId: 'STAGE-2-TASK', reusable: false },
    mergeAuthority: { present: true, taskId: 'STAGE-2-TASK', reusable: false },
    stage: {
      name: 'STAGE_2',
      successorTaskId: 'IMPLEMENTATION-TASK',
      successorDeterministic: true,
      separateGrantRequired: true,
      separateGrantPresent: true,
    },
  }));
  assert.equal(result.dispatch, 'DISPATCHABLE');
  assert.ok(!result.codes.includes('STAGE2_SEPARATE_GRANT_REQUIRED'));
});

test('execution model: GO-COMPLETE continues within exact scope', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    checkpoint: { type: 'MECHANICAL', ownerRequired: false },
  }));
  assert.ok(result.codes.includes('GO_COMPLETE_CONTINUATION_ALLOWED'));
  assert.equal(result.mutation, 'ALLOWED');
});

test('execution model: mechanical checkpoint does not add an owner checkpoint', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState());
  assert.deepEqual(result.ownerRequired, []);
});

test('execution model: P0 ordering preserves an active program lock', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    priority: { class: 'P0', programLocked: true },
  }));
  assert.equal(result.ordering, 'PROGRAM_LOCK_PRESERVED');
});

test('execution model: same-file writer gate is clear when no competing writer exists', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    writer: { competing: false, uniqueWip: false, unknown: false },
  }));
  assert.equal(result.mutation, 'ALLOWED');
});

test('execution model: product and runtime stages remain mechanical when scope is exact', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    priority: { class: 'RUNTIME', programLocked: false },
  }));
  assert.equal(result.ownerRequired.length, 0);
  assert.equal(result.mutation, 'ALLOWED');
});

test('execution model: eligible state is distinct from mutation authority', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    executionGrant: { present: false, taskId: null, reusable: false },
  }));
  assert.equal(result.eligibility, 'ELIGIBLE');
  assert.equal(result.dispatch, 'CANDIDATE_ONLY');
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: deterministic successor carries no new semantic checkpoint', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    stage: {
      name: 'CERTIFICATION',
      successorTaskId: 'NEXT-TASK',
      successorDeterministic: true,
      separateGrantRequired: false,
      separateGrantPresent: false,
    },
  }));
  assert.equal(result.semanticCheckpoint, 'CLEAR');
  assert.ok(result.codes.includes('MECHANICAL_SUCCESSOR_ELIGIBLE'));
});

test('execution model: exact semantic, execution and merge references stay separate in the state', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState());
  assert.ok(result.codes.includes('SEMANTIC_DECISION_ALREADY_RATIFIED'));
  assert.ok(result.codes.includes('EXECUTION_GRANT_PRESENT'));
  assert.ok(result.codes.includes('MERGE_AUTHORITY_PRESENT'));
});

test('execution model: exact scope can complete without production activation', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    priority: { class: 'PRODUCT', programLocked: false },
  }));
  assert.equal(result.mutation, 'ALLOWED');
  assert.equal(result.ownerRequired.length, 0);
});

test('execution model: clean successor is a dispatch candidate only when requested', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    eligibility: { eligible: true, dispatchCandidate: false },
  }));
  assert.equal(result.eligibility, 'ELIGIBLE');
  assert.equal(result.dispatch, 'CANDIDATE_ONLY');
});

test('execution model: missing execution grant blocks global auto-dispatch', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    executionGrant: { present: false, taskId: null, reusable: false },
  }));
  assert.ok(result.codes.includes('EXECUTION_GRANT_MISSING'));
  assert.equal(result.dispatch, 'CANDIDATE_ONLY');
});

test('execution model: wrong-task execution grant is rejected', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    executionGrant: { present: true, taskId: 'OTHER-TASK', reusable: false },
  }));
  assert.ok(result.codes.includes('EXECUTION_GRANT_WRONG_TASK'));
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: reusable execution grant is rejected', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    executionGrant: { present: true, taskId: 'TASK-01', reusable: true },
  }));
  assert.ok(result.codes.includes('EXECUTION_GRANT_REUSED'));
  assert.equal(result.dispatch, 'CANDIDATE_ONLY');
});

test('execution model: Stage 2 cannot use Stage 1 authority', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    stage: {
      name: 'STAGE_2',
      successorTaskId: 'IMPLEMENTATION-TASK',
      successorDeterministic: true,
      separateGrantRequired: true,
      separateGrantPresent: false,
    },
  }));
  assert.ok(result.codes.includes('STAGE2_SEPARATE_GRANT_REQUIRED'));
  assert.equal(result.dispatch, 'CANDIDATE_ONLY');
});

test('execution model: GO-ANALYZE never mutates', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    executionMode: 'GO-ANALYZE',
  }));
  assert.ok(result.codes.includes('GO_ANALYZE_MUTATION_FORBIDDEN'));
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: changed semantic tuple reopens owner checkpoint', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    semanticDecision: { status: 'CHANGED', tupleSha256: 'b'.repeat(64) },
  }));
  assert.equal(result.semanticCheckpoint, 'OWNER_REQUIRED');
  assert.ok(result.ownerRequired.includes('SEMANTIC_DECISION_REQUIRED'));
});

test('execution model: missing semantic decision is fail-closed', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    semanticDecision: { status: 'MISSING', tupleSha256: 'c'.repeat(64) },
  }));
  assert.equal(result.semanticCheckpoint, 'OWNER_REQUIRED');
  assert.ok(result.ownerRequired.includes('SEMANTIC_DECISION_REQUIRED'));
});

test('execution model: missing merge authority blocks merge', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    mergeAuthority: { present: false, taskId: null, reusable: false },
  }));
  assert.ok(result.codes.includes('MERGE_AUTHORITY_MISSING'));
  assert.equal(result.merge, 'AUTHORITY_REQUIRED');
});

test('execution model: path scope change reopens owner checkpoint', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    scope: { changed: true, productionActivation: false, migration: false, irreversible: false },
  }));
  assert.ok(result.ownerRequired.includes('SCOPE_OR_IRREVERSIBLE_CHANGE'));
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: production activation is not a mechanical grant', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    scope: { changed: false, productionActivation: true, migration: false, irreversible: false },
  }));
  assert.ok(result.ownerRequired.includes('SCOPE_OR_IRREVERSIBLE_CHANGE'));
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: migration is not a mechanical grant', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    scope: { changed: false, productionActivation: false, migration: true, irreversible: false },
  }));
  assert.ok(result.ownerRequired.includes('SCOPE_OR_IRREVERSIBLE_CHANGE'));
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: same-file competing writer blocks mutation', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    writer: { competing: true, uniqueWip: false, unknown: false },
  }));
  assert.ok(result.ownerRequired.includes('WRITER_OR_WIP_CONFLICT'));
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: unique WIP blocks cleanup or continuation', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    writer: { competing: false, uniqueWip: true, unknown: false },
  }));
  assert.ok(result.ownerRequired.includes('WRITER_OR_WIP_CONFLICT'));
  assert.equal(result.dispatch, 'CANDIDATE_ONLY');
});

test('execution model: unknown writer ownership fails closed', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    writer: { competing: false, uniqueWip: false, unknown: true },
  }));
  assert.ok(result.ownerRequired.includes('WRITER_OR_WIP_CONFLICT'));
  assert.equal(result.mutation, 'FORBIDDEN');
});

test('execution model: nondeterministic successor is not dispatchable', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    stage: {
      name: 'STAGE_1',
      successorTaskId: 'UNKNOWN-NEXT',
      successorDeterministic: false,
      separateGrantRequired: false,
      separateGrantPresent: false,
    },
  }));
  assert.equal(result.dispatch, 'CANDIDATE_ONLY');
  assert.ok(!result.codes.includes('MECHANICAL_SUCCESSOR_ELIGIBLE'));
});

test('execution model: reusable merge authority is rejected', () => {
  const result = coordination.validateExecutionModelState(validExecutionModelState({
    mergeAuthority: { present: true, taskId: 'TASK-01', reusable: true },
  }));
  assert.ok(result.codes.includes('MERGE_AUTHORITY_MISSING'));
  assert.equal(result.merge, 'AUTHORITY_REQUIRED');
});

test('execution model: malformed state is rejected before classification', () => {
  assert.throws(
    () => coordination.validateExecutionModelState(
      Object.assign(validExecutionModelState(), { unexpected: true }),
    ),
    (error) => error && error.code === 'UNKNOWN_OR_MISSING_FIELD',
  );
});

function attributedOwnerWipPolicy(sources) {
  const activePaths = [
    ...new Set(
      sources.flatMap((source) =>
        source.exactPaths
          .filter((entry) => entry.activeProtection)
          .map((entry) => entry.exactPath),
      ),
    ),
  ].sort();
  return {
    canonicalSemanticGovernance: [
      'project/docs/governance/**',
      'project/docs/adr/**',
    ],
    coordinationControlPlane: [],
    deniedTargetPrefixes: [],
    grandfatheredOwnerWipExactPaths: activePaths,
    grandfatheredOwnerWipSources: sources,
    grandfatheredOwnerWipPrefixes: [],
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof coordination.CoordinationError);
    assert.equal(error.code, code);
    return true;
  });
}

function expectFixtureCodeUnchanged(fixture, fn, code) {
  const beforeTree = runFixtureGit(['rev-parse', 'HEAD^{tree}'], fixture.root);
  const beforeStatus = runFixtureGit(['status', '--porcelain'], fixture.root);
  expectCode(fn, code);
  assert.equal(runFixtureGit(['rev-parse', 'HEAD^{tree}'], fixture.root), beforeTree);
  assert.equal(runFixtureGit(['status', '--porcelain'], fixture.root), beforeStatus);
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

function runFixtureGit(args, cwd, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
    input: options.input,
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

function rootSaRecordScopingRepairChanges() {
  return coordination.GOVERNANCE_COORDINATION_ROOT_SA_RECORD_SCOPING_REPAIR_R01.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function classifyRootSaRecordScopingRepair(changes, overrides = {}) {
  const repair =
    coordination.GOVERNANCE_COORDINATION_ROOT_SA_RECORD_SCOPING_REPAIR_R01;
  return coordination.classifyPrChangeSet(changes, {
    base: repair.baseSha,
    headRef: repair.headRef,
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

function rcvColBindingChanges() {
  return coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function rcvColTargetChanges() {
  return coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function hcr08BindingChanges() {
  return coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function hcr08TargetChanges() {
  return coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapM01BindingChanges() {
  return coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapM01TargetChanges() {
  return coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapStructuredEmissionBindingChanges() {
  return coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapStructuredEmissionTargetChanges() {
  return coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapSerializerBypassHardeningBindingChanges() {
  return coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapSerializerBypassHardeningTargetChanges() {
  return coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapFinalCiEligibilityBindingChanges() {
  return coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapFinalCiEligibilityTargetChanges() {
  return coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapFinalCiEligibilityCloseoutBindingChanges() {
  return coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01.closeoutBindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapFinalCiEligibilityCloseoutChanges() {
  return coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01.closeoutPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapSerializerBypassHardeningCloseoutBindingChanges() {
  return coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01.closeoutBindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapSerializerBypassHardeningCloseoutChanges() {
  return coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01.closeoutPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapStructuredEmissionCloseoutBindingChanges() {
  return coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01.closeoutBindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapStructuredEmissionCloseoutChanges() {
  return coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01.closeoutPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapM01CloseoutBindingChanges() {
  return coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01.closeoutBindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function uyapM01CloseoutChanges() {
  return coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01.closeoutPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function pb01BindingChanges() {
  return coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function pb01TargetChanges() {
  return coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01AuthorityBindingChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01AuthorityTargetChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function tr01AuthorityBindingChanges() {
  return coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function tr01AuthorityTargetChanges() {
  return coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01Tr01OwnershipAuthorityBindingChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01Tr01OwnershipAuthorityTargetChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01Tr01OwnershipReconciliationBindingChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01Tr01OwnershipReconciliationTargetChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function rootAuthorityStage1Changes() {
  return coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function rootAuthorityStage2Changes() {
  return coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function rootStage2ValidatorReconciliationChanges() {
  return coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function rootAuthorityContractContent(
  binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01,
) {
  const content = [
    '# Root authority binding fixture',
    binding.protocolModeId,
    binding.programId,
    binding.targetTaskId,
    binding.workspaceModule,
    binding.ownerName,
    binding.ownerRole,
    binding.issuedAt,
    binding.bindingPr.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    ...binding.bindingPr.changedPaths.map(
      ({ status, path: repoPath }) => `${status} ${repoPath}`,
    ),
    binding.targetPr.taskId,
    binding.targetPr.mode,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(
      ({ status, path: repoPath }) => `${status} ${repoPath}`,
    ),
    binding.targetPr.semanticAuthority.kind,
    binding.targetPr.semanticAuthority.path,
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.kind,
    binding.targetPr.executionGrant.path,
    binding.targetPr.executionGrant.recordId,
    binding.stage2PredecessorLiteral ||
      'stage2Predecessor : OWNER_GRANT_2_REQUIRED',
    binding.stage2BaseLiteral || 'stage2Base : OWNER_GRANT_2_REQUIRED',
    binding.bindingPr.exactBaseOnly
      ? 'publicationBasePolicy : OWNER_PINNED_EXACT_ONLY'
      : 'publicationBasePolicy : OWNER_PINNED_START_OR_UNCHANGED_DESCENDANT',
    'globalAuthority : PROHIBITED',
    'reusableAuthority : PROHIBITED',
    'auditAsAuthority : PROHIBITED',
    binding.stage2StatusLiteral ||
      'STAGE 2 STATUS: NOT AUTHORIZED / OWNER RATIFICATION REQUIRED',
  ];
  if (binding.expiresAt) content.push(binding.expiresAt);
  if (binding.design) content.push(binding.design.id, binding.design.mergeSha);
  if (binding.historicalPredecessor) {
    content.push(
      binding.historicalPredecessor.taskId,
      binding.historicalPredecessor.mergeSha,
      binding.historicalPredecessor.disposition,
    );
  }
  if (binding.authorityPolicy) {
    content.push(
      binding.authorityPolicy.masterTaskId,
      binding.authorityPolicy.policy,
      binding.authorityPolicy.legacyDecisionPackV1Status,
      binding.authorityPolicy.decisionPackV2Status,
      binding.authorityPolicy.contentRatificationStatus,
      binding.legalDomainOfficer.name,
      binding.legalDomainOfficer.role,
      binding.legalDomainOfficer.ratifierCode,
      binding.finalRatifier.name,
      binding.finalRatifier.role,
      binding.finalRatifier.ratifierCode,
      binding.productionSigner.identity,
      binding.productionSigner.role,
      binding.productionSigner.signatureStatus,
    );
  }
  if (binding.decisionPack) {
    content.push(
      binding.decisionPack.id,
      binding.decisionPack.version,
      binding.decisionPack.sha256,
      binding.legalDomainOfficer.name,
      binding.legalDomainOfficer.role,
      binding.legalDomainOfficer.ratifierCode,
      binding.legalDomainOfficer.disposition,
      binding.finalRatifier.name,
      binding.finalRatifier.role,
      binding.finalRatifier.ratifierCode,
      binding.finalRatifier.disposition,
      binding.ratificationEffectiveAtUtc,
      binding.model.id,
      ...binding.model.subtypes,
    );
  }
  content.push('');
  return content.join('\n');
}

function createRootAuthorityStage2GitFixture(t, options = {}) {
  const binding =
    options.binding ||
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const target = binding.targetPr;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-root-auth-'));
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

  for (const { path: repoPath } of binding.bindingPr.changedPaths) {
    const filePath = path.join(root, ...repoPath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      repoPath === binding.contractPath
        ? options.missingPredecessor
          ? rootAuthorityContractContent(binding).replace(
              binding.bindingPr.taskId,
              'MISSING-STAGE1',
            )
          : rootAuthorityContractContent(binding)
        : `${repoPath}\n`,
      'utf8',
    );
  }
  const decisionPath = path.join(
    root,
    ...target.semanticAuthority.path.split('/'),
  );
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.writeFileSync(
    decisionPath,
    options.consumedAtBase
      ? `# Decision Log\n${target.semanticAuthority.recordId}\n`
      : '# Decision Log\n',
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical Stage 1 binding'], root);
  const predecessor = runFixtureGit(['rev-parse', 'HEAD'], root);

  if (options.freshMain || options.driftPath) {
    const driftPath = options.driftPath || 'unrelated.md';
    const filePath = path.join(root, ...driftPath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, 'fresh main advance\n', 'utf8');
    runFixtureGit(['add', '--all'], root);
    runFixtureGit(['commit', '--quiet', '-m', 'advance Stage 2 base'], root);
  }
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const semanticRecordId =
    options.semanticRecordId || target.semanticAuthority.recordId;
  const executionRecordId =
    options.executionRecordId || target.executionGrant.recordId;
  const ownerName = options.ownerName || binding.ownerName;
  const ownerRole = options.ownerRole || binding.ownerRole;
  const programId = options.programId || binding.programId;
  const targetTaskId = options.targetTaskId || binding.targetTaskId;
  const semanticMarker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${semanticRecordId} -->`;
  let semanticRecordLines = [
    'recordType : SEMANTIC_AUTHORITY',
    `recordId : ${semanticRecordId}`,
    `programId : ${programId}`,
    `taskId : ${targetTaskId}`,
    `ownerName : ${ownerName}`,
    `ownerRole : ${ownerRole}`,
    'decision : RATIFIED',
    `issuedAt : ${binding.issuedAt}`,
    'status : ACTIVE_AFTER_APPROVED_MERGE',
    'exactTaskBinding : REQUIRED',
    'exactPrBinding : REQUIRED',
    'exactHeadBinding : REQUIRED',
    'exactScopeBinding : REQUIRED',
    'requiredChecksBinding : REQUIRED',
    'singleUseConsumption : REQUIRED',
    'staleReuse : PROHIBITED',
    'manualFallback : EMERGENCY_ONLY',
    'productionActivation : NOT_AUTHORIZED',
    'standingAuthority : PROHIBITED',
    ...(binding.decisionPack
      ? [
          `decisionPackId : ${binding.decisionPack.id}`,
          `decisionPackVersion : ${binding.decisionPack.version}`,
          `decisionPackSha256 : ${binding.decisionPack.sha256}`,
          `ldoName : ${binding.legalDomainOfficer.name}`,
          `ldoRole : ${binding.legalDomainOfficer.role}`,
          `ldoRatifierCode : ${binding.legalDomainOfficer.ratifierCode}`,
          `ldoDisposition : ${binding.legalDomainOfficer.disposition}`,
          `finalRatifierName : ${binding.finalRatifier.name}`,
          `finalRatifierRole : ${binding.finalRatifier.role}`,
          `finalRatifierCode : ${binding.finalRatifier.ratifierCode}`,
          `finalRatifierDisposition : ${binding.finalRatifier.disposition}`,
          `ratificationEffectiveAtUtc : ${binding.ratificationEffectiveAtUtc}`,
          `ratifiedModel : ${binding.model.id}`,
          `ratifiedSubtypeCount : ${binding.model.subtypes.length}`,
          ...binding.model.subtypes.map(
            (subtype) => `ratifiedSubtype : ${subtype}`,
          ),
          'runtime : DORMANT',
          'registryRelease : NOT_MATERIALIZED',
          'resolver : NOT_STARTED',
        ]
      : []),
    ...(binding.authorityPolicy
      ? [
          `masterTaskId : ${binding.authorityPolicy.masterTaskId}`,
          `authorityPolicy : ${binding.authorityPolicy.policy}`,
          `legacyDecisionPackV1Status : ${binding.authorityPolicy.legacyDecisionPackV1Status}`,
          `decisionPackV2Status : ${binding.authorityPolicy.decisionPackV2Status}`,
          `contentRatificationStatus : ${binding.authorityPolicy.contentRatificationStatus}`,
          `ldoName : ${binding.legalDomainOfficer.name}`,
          `ldoRole : ${binding.legalDomainOfficer.role}`,
          `ldoRatifierCode : ${binding.legalDomainOfficer.ratifierCode}`,
          `finalRatifierName : ${binding.finalRatifier.name}`,
          `finalRatifierRole : ${binding.finalRatifier.role}`,
          `finalRatifierCode : ${binding.finalRatifier.ratifierCode}`,
          `productionSignerIdentity : ${binding.productionSigner.identity}`,
          `productionSignerRole : ${binding.productionSigner.role}`,
          `productionSignatureStatus : ${binding.productionSigner.signatureStatus}`,
          'runtime : DORMANT',
          'registryRelease : NOT_MATERIALIZED',
        ]
      : []),
  ];
  const targetFieldPrefix = options.missingSemanticField
    ? `${options.missingSemanticField} :`
    : null;
  if (targetFieldPrefix) {
    semanticRecordLines = semanticRecordLines.filter(
      (line) => !line.startsWith(targetFieldPrefix),
    );
  }
  if (options.wrongSemanticField) {
    const { field, value } = options.wrongSemanticField;
    semanticRecordLines = semanticRecordLines.map((line) =>
      line.startsWith(`${field} :`) ? `${field} : ${value}` : line,
    );
  }
  if (options.duplicateSemanticField) {
    const duplicate = semanticRecordLines.find((line) =>
      line.startsWith(`${options.duplicateSemanticField} :`),
    );
    if (duplicate) semanticRecordLines.push(duplicate);
  }
  const existingSemanticRecord = options.existingSemanticRecord
    ? [
        '```text',
        'recordType : SEMANTIC_AUTHORITY',
        'recordId : EXISTING-ROOT-SA01',
        'programId : EXISTING-ROOT-PROGRAM',
        'taskId : EXISTING-ROOT-TASK',
        `ownerName : ${binding.ownerName}`,
        `ownerRole : ${binding.ownerRole}`,
        'decision : RATIFIED',
        `issuedAt : ${binding.issuedAt}`,
        'status : ACTIVE_AFTER_APPROVED_MERGE',
        'exactTaskBinding : REQUIRED',
        'exactPrBinding : REQUIRED',
        'exactHeadBinding : REQUIRED',
        'exactScopeBinding : REQUIRED',
        'requiredChecksBinding : REQUIRED',
        'singleUseConsumption : REQUIRED',
        'staleReuse : PROHIBITED',
        'manualFallback : EMERGENCY_ONLY',
        'productionActivation : NOT_AUTHORIZED',
        'standingAuthority : PROHIBITED',
        '```',
        '| 2026-07-28 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=EXISTING-ROOT-SA01 --> **EXISTING-ROOT-SA01 — existing root authority** |',
      ]
    : [];
  fs.appendFileSync(
    decisionPath,
    [
      ...existingSemanticRecord,
      options.missingSemanticMarker
        ? ''
        : `| 2026-07-29 | ${semanticMarker} **${semanticRecordId} — root authority** |`,
      options.duplicateSemanticMarker ? semanticMarker : '',
      '```text',
      ...semanticRecordLines,
      '```',
      '',
    ].join('\n'),
    'utf8',
  );

  const grantPath = path.join(root, ...target.executionGrant.path.split('/'));
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  const executionMarker = `<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=${executionRecordId} -->`;
  fs.writeFileSync(
    grantPath,
    [
      '# Execution Grant',
      executionMarker,
      options.duplicateExecutionMarker ? executionMarker : '',
      'recordType : EXECUTION_GRANT',
      `recordId : ${executionRecordId}`,
      `programId : ${programId}`,
      `taskId : ${targetTaskId}`,
      `ownerName : ${ownerName}`,
      `ownerRole : ${ownerRole}`,
      'executionMode : GO-COMPLETE',
      `workspaceModule : ${binding.workspaceModule}`,
      `issuedAt : ${binding.issuedAt}`,
      'status : ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK',
      `stage1PredecessorSha : ${options.stage1PredecessorSha || predecessor}`,
      `stage2BaseSha : ${options.stage2BaseSha || base}`,
      'productionActivation : NOT_AUTHORIZED',
      'ciBypass : PROHIBITED',
      'ledgerBypass : PROHIBITED',
      'standingAuthority : PROHIBITED',
      'reusableAuthority : PROHIBITED',
      `semanticAuthorityRef.kind : ${target.semanticAuthority.kind}`,
      `semanticAuthorityRef.path : ${target.semanticAuthority.path}`,
      `semanticAuthorityRef.recordId : ${
        options.semanticBindingRecordId || target.semanticAuthority.recordId
      }`,
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'prospective Stage 2 materialization'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, predecessor, base, head };
}

const ROOT_STAGE2_RECONCILIATION_BASE_SHA =
  '989dac5b18ee895a1e621586c84adb3cabeb4c02';
const ROOT_STAGE2_RECONCILIATION_SOURCE_SHA =
  '0f78a5ea49b0c3be91172de4939ae8bd95a25f17';
const ROOT_STAGE2_RECONCILIATION_SOURCE_PATH =
  'project/docs/governance/governance-closeout-live-ledger-gap-r01-stage1-drift-reconciliation/reconciliation-result.json';
const ROOT_STAGE2_RECONCILIATION_RECORD_PATH =
  'project/docs/governance/governance-closeout-live-ledger-gap-r01-stage1-drift-reconciliation/stage2-base-reconciliation-authority.json';
let rootStage2ReconciliationSeed;

function getRootStage2ReconciliationSeed() {
  if (rootStage2ReconciliationSeed) return rootStage2ReconciliationSeed;
  rootStage2ReconciliationSeed = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gov-coord-root-reconcile-seed-'),
  );
  runFixtureGit(['init', '--quiet', '--bare'], rootStage2ReconciliationSeed);
  runFixtureGit(
    [
      'fetch',
      '--quiet',
      '--no-tags',
      REPO_ROOT,
      `${ROOT_STAGE2_RECONCILIATION_BASE_SHA}:refs/heads/main`,
    ],
    rootStage2ReconciliationSeed,
  );
  process.once('exit', () =>
    fs.rmSync(rootStage2ReconciliationSeed, { recursive: true, force: true }),
  );
  return rootStage2ReconciliationSeed;
}

function createRootStage2ReconciliationFixture(t, options = {}) {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-root-reconcile-'));
  const root = path.join(parent, 'repo');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  runFixtureGit(
    ['clone', '--quiet', '--shared', '--no-checkout', getRootStage2ReconciliationSeed(), root],
    parent,
  );
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(
    ['config', 'user.email', 'governance-coordination@example.invalid'],
    root,
  );
  runFixtureGit(['config', 'core.autocrlf', 'false'], root);
  runFixtureGit(['read-tree', ROOT_STAGE2_RECONCILIATION_BASE_SHA], root);

  const protectedBlobShas = Object.fromEntries(
    binding.bindingPr.changedPaths.map(({ path: repoPath }) => [
      repoPath,
      runFixtureGit(
        ['rev-parse', `${ROOT_STAGE2_RECONCILIATION_BASE_SHA}:${repoPath}`],
        root,
      ),
    ]),
  );
  const sourceBlobSha = runFixtureGit(
    ['rev-parse', `${ROOT_STAGE2_RECONCILIATION_SOURCE_SHA}:${ROOT_STAGE2_RECONCILIATION_SOURCE_PATH}`],
    root,
  );
  const record = {
    schemaVersion: 1,
    recordType: 'ROOT_BOOTSTRAP_STAGE2_BASE_RECONCILIATION',
    recordId: 'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE2-BASE-RECONCILIATION-R01',
    documentRole: 'CANONICAL_TASK_BOUND_RECONCILIATION_AUTHORITY',
    materializationTaskId:
      'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE2-VALIDATOR-BASE-BINDING-RECONCILIATION-R01',
    programId: binding.programId,
    targetTaskId: binding.targetTaskId,
    bootstrapModeId: binding.protocolModeId,
    stage1MergeSha: '790d2a956dad05e39c8fde71cc3e19e1f2425cf3',
    driftClassification: 'EXTENDED_BACKWARD_COMPATIBLY',
    securityInvariants: 'PRESERVED',
    targetProgramTaskBinding: 'PASS',
    stage2Binding: {
      status: 'PASS',
      taskId: binding.targetPr.taskId,
      headRef: binding.targetPr.headRef,
      changedPaths: binding.targetPr.changedPaths.map(({ status, path: repoPath }) => ({
        status,
        path: repoPath,
      })),
    },
    contractCodeTestConsistency: 'PASS',
    authorityRecordConflict: 'NONE',
    resolverAmbiguity: 'NONE',
    writerGateRequirement: 'PASS_AT_CURRENT_EXECUTION_PREFLIGHT',
    readiness: 'ELIGIBLE_IF_CURRENT_EXECUTION_PREFLIGHT_PASSES',
    sourceReconciliation: {
      pullRequest: 1915,
      mergeSha: ROOT_STAGE2_RECONCILIATION_SOURCE_SHA,
      path: ROOT_STAGE2_RECONCILIATION_SOURCE_PATH,
      blobSha: sourceBlobSha,
    },
    protectedBlobShas,
    allowedDriftClassifications: [
      'PRESERVED_EXACTLY',
      'PRESERVED_SEMANTICALLY_EQUIVALENT',
      'EXTENDED_BACKWARD_COMPATIBLY',
      'SUPERSEDED_BY_CANONICAL_SUCCESSOR',
    ],
  };
  Object.assign(record, options.recordOverrides || {});
  const writeIndexJson = (repoPath, value) => {
    const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
    const blob = runFixtureGit(['hash-object', '-w', '--stdin'], root, { input: content });
    runFixtureGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${repoPath}`], root);
  };
  if (!options.omitRecord) {
    writeIndexJson(
      ROOT_STAGE2_RECONCILIATION_RECORD_PATH,
      options.rawRecord || record,
    );
  }
  if (options.duplicateRecord) {
    writeIndexJson(
      'project/docs/governance/duplicate-stage2-base-reconciliation.json',
      record,
    );
  }
  if (options.conflictingRecord) {
    writeIndexJson(
      'project/docs/governance/conflicting-stage2-base-reconciliation.json',
      { ...record, recordId: `${record.recordId}-CONFLICT` },
    );
  }
  const tree = runFixtureGit(['write-tree'], root);
  let base = options.omitRecord
    ? ROOT_STAGE2_RECONCILIATION_BASE_SHA
    : runFixtureGit(
        [
          'commit-tree',
          tree,
          '-p',
          ROOT_STAGE2_RECONCILIATION_BASE_SHA,
          '-m',
          'materialize Stage 2 reconciliation',
        ],
        root,
      );

  if (options.stalePath) {
    runFixtureGit(['read-tree', base], root);
    const staleContent = `${runFixtureGit(['show', `${base}:${options.stalePath}`], root)}\npost-reconciliation drift\n`;
    const staleBlob = runFixtureGit(['hash-object', '-w', '--stdin'], root, {
      input: staleContent,
    });
    runFixtureGit(
      ['update-index', '--cacheinfo', `100644,${staleBlob},${options.stalePath}`],
      root,
    );
    const staleTree = runFixtureGit(['write-tree'], root);
    base = runFixtureGit(
      ['commit-tree', staleTree, '-p', base, '-m', 'drift after reconciliation'],
      root,
    );
  }
  if (options.nonAncestor) {
    const orphanTree = runFixtureGit(['rev-parse', `${base}^{tree}`], root);
    base = runFixtureGit(
      ['commit-tree', orphanTree, '-m', 'non-ancestor reconciliation snapshot'],
      root,
    );
  }
  return { root, base, record };
}

function expectRootStage2ReconciliationCode(
  t,
  fixtureOptions,
  code,
  validationOptions = {},
) {
  const fixture = createRootStage2ReconciliationFixture(t, fixtureOptions);
  expectCode(
    () =>
      validationOptions.recordOnly
        ? coordination.validateRootStage2ReconciliationRecord({
            base: fixture.base,
            cwd: fixture.root,
          })
        : coordination.validateRootStage2BaseReadiness({
            base: fixture.base,
            cwd: fixture.root,
            writerGate: validationOptions.writerGate ?? 'PASS',
          }),
    code,
  );
}

function pb01ClosureBindingChanges() {
  return coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function pb01ClosureTargetChanges() {
  return coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01ClosureBindingChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function kc01ClosureTargetChanges() {
  return coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function rcvColLargeAuthorityReadRepairChanges() {
  return coordination.RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function classifyRcvColLargeAuthorityReadRepair(changes, overrides = {}) {
  const repair = coordination.RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01;
  return coordination.classifyPrChangeSet(changes, {
    base: repair.baseSha,
    headRef: repair.headRef,
    ...overrides,
  });
}

function ownerWipPathOwnershipChanges() {
  return coordination.OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function classifyOwnerWipPathOwnership(changes, overrides = {}) {
  const binding = coordination.OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01;
  return coordination.classifyPrChangeSet(changes, {
    base: binding.baseSha,
    headRef: binding.headRef,
    ...overrides,
  });
}

function rcvColLargeAuthorityReadRepairContractContent() {
  const repair = coordination.RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01;
  return [
    '# Contract fixture',
    repair.taskId,
    repair.mode,
    repair.baseSha,
    repair.headRef,
    ...repair.changedPaths.map(({ path: repoPath }) => repoPath),
    '',
  ].join('\n');
}

function createLargeGitBlobFixture(t, exactBytes = 1_100_000) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-large-git-blob-'));
  const root = path.join(parent, 'repo');
  const repoPath = 'project/docs/governance/large-authority.md';
  const sentinel = '\nLARGE_AUTHORITY_FINAL_SENTINEL\n';
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  fs.mkdirSync(root);
  runFixtureGit(['init', '--quiet'], root);
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(
    ['config', 'user.email', 'governance-coordination@example.invalid'],
    root,
  );
  const basePath = path.join(root, 'base.txt');
  fs.writeFileSync(basePath, 'base\n', 'utf8');
  runFixtureGit(['add', '--', 'base.txt'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'large authority base'], root);
  const filePath = path.join(root, ...repoPath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  assert.ok(exactBytes >= Buffer.byteLength(sentinel, 'utf8'));
  const content = `${'A'.repeat(
    exactBytes - Buffer.byteLength(sentinel, 'utf8'),
  )}${sentinel}`;
  assert.equal(Buffer.byteLength(content, 'utf8'), exactBytes);
  fs.writeFileSync(filePath, content, 'utf8');
  runFixtureGit(['add', '--', repoPath], root);
  runFixtureGit(['commit', '--quiet', '-m', 'large authority fixture'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, repoPath, content, sentinel, head };
}

function rcvColBindingContractContent(
  binding = coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
) {
  return [
    '# Contract fixture',
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    ...binding.bindingPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.taskId,
    binding.targetPr.mode,
    ...(binding.targetPr.pullRequestNumber === undefined
      ? []
      : [String(binding.targetPr.pullRequestNumber)]),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
    ...(binding.programId ? [binding.programId] : []),
    ...(binding.grantScopeLiteral ? [binding.grantScopeLiteral] : []),
    ...(binding.secondUseLiteral ? [binding.secondUseLiteral] : []),
    ...(binding.ownerRatificationEvidence
      ? [
          binding.ownerRatificationEvidence.exactExcerpt,
          binding.ownerRatificationEvidence.excerptSha256,
        ]
      : []),
    ...(binding.targetPr.implementation
      ? Object.values(binding.targetPr.implementation).filter(
          (value) => typeof value === 'string' || typeof value === 'number',
        )
      : []),
    ...(binding.closeoutBindingPr
      ? [
          binding.closeoutBindingPr.taskId,
          binding.closeoutBindingPr.mode,
          binding.closeoutBindingPr.baseSha,
          binding.closeoutBindingPr.headRef,
          ...binding.closeoutBindingPr.changedPaths.map(
            ({ path: repoPath }) => repoPath,
          ),
        ]
      : []),
    ...(binding.closeoutPr
      ? [
          binding.closeoutPr.taskId,
          binding.closeoutPr.mode,
          binding.closeoutPr.originalBaseSha,
          binding.closeoutPr.headRef,
          ...binding.closeoutPr.changedPaths.map(({ path: repoPath }) => repoPath),
          binding.closeoutPr.semanticAuthority.recordId,
          binding.closeoutPr.executionGrant.recordId,
          String(binding.closeoutPr.implementation.pullRequestNumber),
          binding.closeoutPr.implementation.squashSha,
        ]
      : []),
    '',
  ].join('\n');
}

function createRcvColTargetGitFixture(t, options = {}) {
  const binding =
    options.binding ||
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-rcv-col-'));
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

  const contractPath = path.join(root, ...binding.contractPath.split('/'));
  const decisionPath = path.join(root, ...target.semanticAuthority.path.split('/'));
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.writeFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  const decisionHeader = '# Decision Log\n';
  const decisionBaseBytes = options.largeDecisionLogBytes || 0;
  const decisionBase = decisionBaseBytes
    ? `${decisionHeader}${'P'.repeat(
        decisionBaseBytes - Buffer.byteLength(decisionHeader, 'utf8'),
      )}\n`
    : decisionHeader;
  fs.writeFileSync(decisionPath, decisionBase, 'utf8');
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical RCV-COL binding'], root);

  if (options.freshMain) {
    const unrelated = path.join(root, 'unrelated.md');
    fs.writeFileSync(unrelated, 'fresh main advance\n', 'utf8');
    runFixtureGit(['add', '--all'], root);
    runFixtureGit(['commit', '--quiet', '-m', 'advance canonical main'], root);
  }
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const semanticRecordId =
    options.semanticRecordId || target.semanticAuthority.recordId;
  const executionRecordId =
    options.executionRecordId || target.executionGrant.recordId;
  const semanticBindingRecordId =
    options.semanticBindingRecordId || target.semanticAuthority.recordId;
  const semanticMarker = `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${semanticRecordId} -->`;
  const executionMarker = `<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=${executionRecordId} -->`;
  fs.appendFileSync(
    decisionPath,
    `| 2026-07-28 | ${semanticMarker} **${semanticRecordId} — fixture** |\n${
      options.duplicateSemanticMarker ? `${semanticMarker}\n` : ''
    }${
      binding.ownerRatificationEvidence
        ? `${binding.ownerRatificationEvidence.exactExcerpt}\n${binding.ownerRatificationEvidence.excerptSha256}\n${binding.programId}\n${target.originalBaseSha}\n`
        : ''
    }`,
    'utf8',
  );

  const grantPath = path.join(root, ...target.executionGrant.path.split('/'));
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(
    grantPath,
    [
      '# Grant fixture',
      executionMarker,
      options.duplicateExecutionMarker ? executionMarker : '',
      '',
      '```text',
      `semanticAuthorityRef.kind     : ${target.semanticAuthority.kind}`,
      `semanticAuthorityRef.path     : ${target.semanticAuthority.path}`,
      `semanticAuthorityRef.recordId : ${semanticBindingRecordId}`,
      '```',
      ...(binding.ownerRatificationEvidence
        ? [
            binding.ownerRatificationEvidence.exactExcerpt,
            binding.ownerRatificationEvidence.excerptSha256,
            binding.programId,
            target.taskId.replace('-AUTHORITY-MATERIALIZATION-R01', ''),
            target.originalBaseSha,
            'GO-COMPLETE',
            binding.grantScopeLiteral || 'UYAP-M01 ONLY',
            binding.secondUseLiteral || 'SECOND USE: FAIL-CLOSED',
          ]
        : []),
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'target RCV-COL bootstrap'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createUyapM01CloseoutGitFixture(t, options = {}) {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-uyap-m01-closeout-'));
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

  const contractPath = path.join(root, ...binding.contractPath.split('/'));
  const decisionPath = path.join(root, ...target.semanticAuthority.path.split('/'));
  const grantPath = path.join(root, ...target.executionGrant.path.split('/'));
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  fs.writeFileSync(
    decisionPath,
    `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${target.semanticAuthority.recordId} -->\n`,
    'utf8',
  );
  fs.writeFileSync(
    grantPath,
    [
      '# UYAP-M01 grant fixture',
      `<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=${target.executionGrant.recordId} -->`,
      '```text',
      `semanticAuthorityRef.kind     : ${target.semanticAuthority.kind}`,
      `semanticAuthorityRef.path     : ${target.semanticAuthority.path}`,
      `semanticAuthorityRef.recordId : ${target.semanticAuthority.recordId}`,
      '```',
      'SECOND USE: FAIL-CLOSED',
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical UYAP-M01 grant'], root);
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const terminalReceipt = [
    'TASK STATUS           : CLOSED',
    'CHANGE STATUS         : MERGED',
    'DELIVERY STATUS       : PASS',
    'EXECUTION GRANT       : CONSUMED / CLOSED',
    `IMPLEMENTATION PR     : #${target.implementation.pullRequestNumber}`,
    `IMPLEMENTATION SHA    : ${target.implementation.squashSha}`,
    'RESOLVER BINDING      : CANONICAL / CONSUMER-ONLY',
    'DEFAULT-OFF           : PASS',
    'PRODUCTION CALL-SITE  : NONE',
    'PRODUCTION REACHABILITY: 0',
    'REQUIRED CI           : 4/4 PASS',
    'SECOND USE        : FAIL-CLOSED',
    'WAITING FOR OWNER : NO FOR M01 — TASK COMPLETE',
  ];
  if (options.omitLiteral) {
    terminalReceipt.splice(terminalReceipt.indexOf(options.omitLiteral), 1);
  }
  fs.appendFileSync(grantPath, `${terminalReceipt.join('\n')}\n`, 'utf8');
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'close UYAP-M01 grant'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createUyapStructuredEmissionCloseoutGitFixture(t, options = {}) {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gov-coord-uyap-structured-closeout-'),
  );
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

  const contractPath = path.join(root, ...binding.contractPath.split('/'));
  const decisionPath = path.join(root, ...target.semanticAuthority.path.split('/'));
  const grantPath = path.join(root, ...target.executionGrant.path.split('/'));
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  fs.writeFileSync(
    decisionPath,
    `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${target.semanticAuthority.recordId} -->\n`,
    'utf8',
  );
  fs.writeFileSync(
    grantPath,
    [
      '# UYAP structured-emission grant fixture',
      `<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=${target.executionGrant.recordId} -->`,
      '```text',
      `semanticAuthorityRef.kind     : ${target.semanticAuthority.kind}`,
      `semanticAuthorityRef.path     : ${target.semanticAuthority.path}`,
      `semanticAuthorityRef.recordId : ${target.semanticAuthority.recordId}`,
      '```',
      'SECOND USE: FAIL-CLOSED',
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical UYAP structured grant'], root);
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const terminalReceipt = [
    'TASK STATUS            : CLOSED',
    'CHANGE STATUS          : MERGED',
    'DELIVERY STATUS        : PASS',
    'SEMANTIC AUTHORITY     : CANONICAL',
    'EXECUTION GRANT        : CONSUMED / CLOSED',
    `IMPLEMENTATION PR      : #${target.implementation.pullRequestNumber}`,
    `IMPLEMENTATION SHA     : ${target.implementation.squashSha}`,
    'M01 QUALIFICATION      : REQUIRED / VERIFIED',
    'LEGAL-BASIS OWNER      : RECEIVABLE ONLY',
    'STRUCTURED EMISSION    : CANONICAL TECHNICAL IMPLEMENTATION',
    'FALLBACK               : NONE',
    'FAIZ                   : REJECTED IN THIS SLICE',
    'DEFAULT-OFF            : PROVEN',
    'PRODUCTION CALL-SITE   : NONE',
    'PRODUCTION REACHABILITY: 0',
    'STRICT DTD             : NOT CLAIMED',
    'REQUIRED CI            : PASS',
    'SECOND USE: FAIL-CLOSED',
    'WAITING FOR OWNER : NO FOR THIS TASK — TASK COMPLETE',
  ];
  if (options.omitLiteral) {
    terminalReceipt.splice(terminalReceipt.indexOf(options.omitLiteral), 1);
  }
  fs.appendFileSync(grantPath, `${terminalReceipt.join('\n')}\n`, 'utf8');
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'close UYAP structured grant'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createUyapSerializerBypassHardeningCloseoutGitFixture(t, options = {}) {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gov-coord-uyap-serializer-bypass-closeout-'),
  );
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

  const contractPath = path.join(root, ...binding.contractPath.split('/'));
  const decisionPath = path.join(root, ...target.semanticAuthority.path.split('/'));
  const grantPath = path.join(root, ...target.executionGrant.path.split('/'));
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  fs.writeFileSync(
    decisionPath,
    `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${target.semanticAuthority.recordId} -->\n`,
    'utf8',
  );
  fs.writeFileSync(
    grantPath,
    [
      '# UYAP serializer-bypass hardening grant fixture',
      `<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=${target.executionGrant.recordId} -->`,
      '```text',
      `semanticAuthorityRef.kind     : ${target.semanticAuthority.kind}`,
      `semanticAuthorityRef.path     : ${target.semanticAuthority.path}`,
      `semanticAuthorityRef.recordId : ${target.semanticAuthority.recordId}`,
      '```',
      'SECOND USE: FAIL-CLOSED',
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical UYAP serializer-bypass grant'], root);
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const terminalReceipt = [
    'TASK STATUS               : CLOSED',
    'CHANGE STATUS             : MERGED',
    'DELIVERY STATUS           : PASS',
    'SEMANTIC AUTHORITY        : CANONICAL',
    'EXECUTION GRANT           : CONSUMED / CLOSED',
    `IMPLEMENTATION PR         : #${target.implementation.pullRequestNumber}`,
    `IMPLEMENTATION SHA        : ${target.implementation.squashSha}`,
    'RESOLUTION PROVENANCE     : CANONICAL RESOLVER CAPABILITY ENFORCED',
    'CALLER-CREATED RESOLVED   : FAIL-CLOSED',
    'STRUCTURAL COPY           : FAIL-CLOSED',
    'REJECTED XML / BYTE       : 0 / 0',
    'OFFICIAL MAPPINGS         : UNCHANGED',
    'M01 / RECEIVABLE AUTHORITY: UNCHANGED',
    'DEFAULT-OFF               : PROVEN',
    'PRODUCTION ACTIVATION     : NONE',
    'SCHEMA / MIGRATION        : NONE',
    'STRICT DTD                : NOT CLAIMED',
    'REQUIRED CI               : PASS',
    'SECOND USE: FAIL-CLOSED',
    'WAITING FOR OWNER : NO FOR THIS TASK — TASK COMPLETE',
  ];
  if (options.omitLiteral) {
    terminalReceipt.splice(terminalReceipt.indexOf(options.omitLiteral), 1);
  }
  fs.appendFileSync(grantPath, `${terminalReceipt.join('\n')}\n`, 'utf8');
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'close UYAP serializer-bypass grant'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createUyapFinalCiEligibilityCloseoutGitFixture(t, options = {}) {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gov-coord-uyap-final-ci-closeout-'),
  );
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

  const contractPath = path.join(root, ...binding.contractPath.split('/'));
  const decisionPath = path.join(root, ...target.semanticAuthority.path.split('/'));
  const grantPath = path.join(root, ...target.executionGrant.path.split('/'));
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  fs.writeFileSync(
    decisionPath,
    `<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=${target.semanticAuthority.recordId} -->\n`,
    'utf8',
  );
  fs.writeFileSync(
    grantPath,
    [
      '# UYAP final-CI eligibility grant fixture',
      `<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=${target.executionGrant.recordId} -->`,
      '```text',
      `semanticAuthorityRef.kind     : ${target.semanticAuthority.kind}`,
      `semanticAuthorityRef.path     : ${target.semanticAuthority.path}`,
      `semanticAuthorityRef.recordId : ${target.semanticAuthority.recordId}`,
      '```',
      'SECOND USE: FAIL-CLOSED',
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical UYAP final-CI grant'], root);
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const terminalReceipt = [
    'TASK STATUS               : CLOSED / CANONICAL / PASS',
    'CHANGE STATUS             : IMPLEMENTED / MERGED / CANONICAL',
    'DELIVERY STATUS           : PASS — TECHNICAL CI QUALIFICATION ONLY',
    'SEMANTIC AUTHORITY        : CANONICAL',
    'EXECUTION GRANT           : CONSUMED / CLOSED',
    `IMPLEMENTATION PR         : #${target.implementation.pullRequestNumber}`,
    `IMPLEMENTATION SHA        : ${target.implementation.squashSha}`,
    'FINAL CI MANIFEST         : 82 SUITES / 1397 TESTS PASS',
    'DEFAULT-OFF               : VERIFIED',
    'PRODUCTION REACHABILITY   : 0 / VERIFIED',
    'RESOLVER CAPABILITY       : FAIL-CLOSED / VERIFIED',
    'SERIALIZER BYPASS         : FAIL-CLOSED / VERIFIED',
    'STRICT DTD                : NOT CLAIMED / D1 BLOCKED',
    'PRODUCTION ACTIVATION     : NONE',
    'CANARY / TRANSPORT / CUTOVER: NONE',
    'SCHEMA / MIGRATION / LIVE DB: NONE',
    'REQUIRED CI               : 9/9 PASS',
    'SECOND USE: FAIL-CLOSED',
    'WAITING FOR OWNER : NO — TERMINAL',
  ];
  if (options.omitLiteral) {
    terminalReceipt.splice(terminalReceipt.indexOf(options.omitLiteral), 1);
  }
  fs.appendFileSync(grantPath, `${terminalReceipt.join('\n')}\n`, 'utf8');
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'close UYAP final-CI grant'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function officeAuthorityBindingChanges() {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  return binding.bindingPr.changedPaths.map(({ status, path: repoPath }) => ({
    status,
    path: repoPath,
  }));
}

function officeAuthorityTargetChanges() {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  return binding.targetPr.changedPaths.map(({ status, path: repoPath }) => ({
    status,
    path: repoPath,
  }));
}

function officeF01Stage1BindingChanges() {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  return binding.changedPaths.map(({ status, path: repoPath }) => ({
    status,
    path: repoPath,
  }));
}

function officeF01Stage2Changes() {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  return binding.stage2.changedPaths.map(({ status, path: repoPath }) => ({
    status,
    path: repoPath,
  }));
}

function officeSemanticRecord(binding, overrides = {}) {
  const target = binding.targetPr;
  const values = {
    recordType: target.semanticAuthority.kind,
    recordId: target.semanticAuthority.recordId,
    programId: binding.programId,
    taskId: binding.targetTaskId,
    ownerName: binding.ownerName,
    ownerRole: binding.ownerRole,
    decision: 'RATIFIED',
    issuedAt: binding.issuedAt,
    status: 'ACTIVE_AFTER_APPROVED_MERGE',
    exactTaskBinding: 'REQUIRED',
    exactPrBinding: 'REQUIRED',
    exactHeadBinding: 'REQUIRED',
    exactScopeBinding: 'REQUIRED',
    requiredChecksBinding: 'REQUIRED',
    singleUseConsumption: 'REQUIRED',
    staleReuse: 'PROHIBITED',
    wrongTaskReuse: 'PROHIBITED',
    manualFallback: 'EMERGENCY_ONLY',
    productionActivation: 'NOT_AUTHORIZED',
    standingAuthority: 'PROHIBITED',
    reusableAuthority: 'PROHIBITED',
    globalAuthority: 'PROHIBITED',
    ...overrides,
  };
  return ['```text', ...Object.entries(values).map(([key, value]) => `${key} : ${value}`), '```'].join('\n');
}

function officeExecutionRecord(binding, overrides = {}) {
  const target = binding.targetPr;
  const values = {
    recordType: target.executionGrant.kind,
    recordId: target.executionGrant.recordId,
    programId: binding.programId,
    taskId: binding.targetTaskId,
    ownerName: binding.ownerName,
    ownerRole: binding.ownerRole,
    ownerAuthorityRef: binding.ownerAuthorityRef,
    executionMode: 'GO-COMPLETE',
    workspaceModule: binding.workspaceModule,
    workspaceScope: binding.workspaceScope,
    issuedAt: binding.issuedAt,
    status: 'ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK',
    materializationBaseSha: binding.bindingPr.baseSha,
    productionActivation: 'NOT_AUTHORIZED',
    ciBypass: 'PROHIBITED',
    ledgerBypass: 'PROHIBITED',
    standingAuthority: 'PROHIBITED',
    reusableAuthority: 'PROHIBITED',
    'semanticAuthorityRef.kind': target.semanticAuthority.kind,
    'semanticAuthorityRef.path': target.semanticAuthority.path,
    'semanticAuthorityRef.recordId': target.semanticAuthority.recordId,
    ...overrides,
  };
  return ['```text', ...Object.entries(values).map(([key, value]) => `${key} : ${value}`), '```'].join('\n');
}

function createOfficeAuthorityTargetGitFixture(t, options = {}) {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const target = binding.targetPr;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-office-authority-'));
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

  const contractPath = fixturePath(root, binding.contractPath);
  const canonicalContract = fs.readFileSync(
    fixturePath(REPO_ROOT, binding.contractPath),
    'utf8',
  );
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.writeFileSync(contractPath, canonicalContract, 'utf8');
  const decisionPath = fixturePath(root, target.semanticAuthority.path);
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.writeFileSync(decisionPath, '# Decision Log\n', 'utf8');

  if (options.baseAlreadyContainsAuthority) {
    const marker = coordination.buildAuthorityMarker(target.semanticAuthority);
    fs.appendFileSync(
      decisionPath,
      `${officeSemanticRecord(binding)}\n| 2026-07-30 | ${marker} **${target.semanticAuthority.recordId} — fixture** |\n`,
      'utf8',
    );
  }
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical OFFICE binding'], root);
  if (options.freshMain) {
    fs.writeFileSync(path.join(root, 'unrelated.md'), 'fresh main advance\n', 'utf8');
    runFixtureGit(['add', '--all'], root);
    runFixtureGit(['commit', '--quiet', '-m', 'advance canonical main'], root);
  }
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const semanticRef = {
    ...target.semanticAuthority,
    ...(options.semanticMarkerRef || {}),
  };
  const semanticMarker = coordination.buildAuthorityMarker(semanticRef);
  const semanticOverrides = { ...(options.semanticOverrides || {}) };
  if (options.omitSemanticField) delete semanticOverrides[options.omitSemanticField];
  let semanticRecord = officeSemanticRecord(binding, semanticOverrides);
  if (options.omitSemanticField) {
    semanticRecord = semanticRecord
      .split('\n')
      .filter((line) => !line.startsWith(`${options.omitSemanticField} :`))
      .join('\n');
  }
  if (!options.baseAlreadyContainsAuthority) {
    fs.appendFileSync(
      decisionPath,
      [
        '',
        semanticRecord,
        options.duplicateSemanticRecord ? semanticRecord : '',
        `| 2026-07-30 | ${semanticMarker} **${semanticRef.recordId} — fixture** |`,
        options.duplicateSemanticMarker ? semanticMarker : '',
        options.additionalDecisionAuthority || '',
        '',
      ].join('\n'),
      'utf8',
    );
  } else {
    fs.appendFileSync(decisionPath, '\nsecond materialization attempt\n', 'utf8');
  }

  const grantPath = fixturePath(root, target.executionGrant.path);
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  const executionRef = {
    ...target.executionGrant,
    ...(options.executionMarkerRef || {}),
  };
  const executionMarker = coordination.buildAuthorityMarker(executionRef);
  const executionOverrides = {
    materializationBaseSha: base,
    ...(options.executionOverrides || {}),
  };
  let executionRecord = officeExecutionRecord(binding, executionOverrides);
  if (options.omitExecutionField) {
    executionRecord = executionRecord
      .split('\n')
      .filter((line) => !line.startsWith(`${options.omitExecutionField} :`))
      .join('\n');
  }
  fs.writeFileSync(
    grantPath,
    [
      '# OFFICE grant fixture',
      executionMarker,
      options.duplicateExecutionMarker ? executionMarker : '',
      '',
      executionRecord,
      options.duplicateExecutionRecord ? executionRecord : '',
      options.additionalExecutionRecord || '',
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'OFFICE authority materialization'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createPb01ClosureTargetGitFixture(t, options = {}) {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-pb01-closure-'));
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
    ['fetch', '--quiet', '--no-tags', REPO_ROOT, target.implementation.squashSha],
    root,
  );
  runFixtureGit(
    ['checkout', '--quiet', '-b', 'pb01-closure-base', target.implementation.squashSha],
    root,
  );

  const contractPath = fixturePath(root, binding.contractPath);
  fs.appendFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  const semanticRecordId =
    options.semanticRecordId || target.semanticAuthority.recordId;
  const executionRecordId =
    options.executionRecordId || target.executionGrant.recordId;
  const semanticBindingRecordId =
    options.semanticBindingRecordId || target.semanticAuthority.recordId;
  const semanticMarker =
    '<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=' +
    semanticRecordId +
    ' -->';
  const decisionPath = fixturePath(root, target.semanticAuthority.path);
  fs.appendFileSync(
    decisionPath,
    '\n| 2026-07-28 | ' +
      semanticMarker +
      ' **' +
      semanticRecordId +
      ' — fixture** |\n' +
      (options.duplicateSemanticMarker ? semanticMarker + '\n' : ''),
    'utf8',
  );
  const executionMarker =
    '<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=' +
    executionRecordId +
    ' -->';
  const grantPath = fixturePath(root, target.executionGrant.path);
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(
    grantPath,
    [
      '# PB01 closure grant',
      executionMarker,
      options.duplicateExecutionMarker ? executionMarker : '',
      '',
      '```text',
      'semanticAuthorityRef.kind     : ' + target.semanticAuthority.kind,
      'semanticAuthorityRef.path     : ' + target.semanticAuthority.path,
      'semanticAuthorityRef.recordId : ' + semanticBindingRecordId,
      '```',
      '',
      ...target.changedPaths.map(({ path: repoPath }) => '- `' + repoPath + '`'),
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical PB01 closure binding'], root);

  if (options.freshMain) {
    writeFixtureRepoFile(root, 'unrelated.md', 'fresh main advance\n');
    runFixtureGit(['add', '--all'], root);
    runFixtureGit(['commit', '--quiet', '-m', 'advance canonical main'], root);
  }
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const closureContent = {
    'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md': [
      'RCV-CLAIM-FORM-P02-S08-D02-PB01 : CLOSED / CANONICAL / PASS',
      target.implementation.squashSha,
      target.implementation.contractId,
      'Next eligible task          : ' + target.implementation.nextTaskId,
      'Claim Formation PB01 gate   : CONSUMED / COMPLETE',
    ].join('\n'),
    'project/docs/governance/canonicalization-register.md': [
      'RCV-CLAIM-FORM-P02-S08-D02-PB01 — exact Legal Basis projection binding formal closure',
      target.implementation.squashSha,
      target.implementation.contractId,
      target.implementation.nextTaskId + ' — OWNER GO REQUIRED / NOT STARTED',
    ].join('\n'),
    'project/docs/governance/product-backlog.md': [
      'RCV-CLAIM-FORM-P02-S08-D02-PB01 — Exact Legal Basis Projection Binding Contract',
      target.implementation.squashSha,
      target.implementation.contractId,
      target.implementation.nextTaskId,
    ].join('\n'),
    'project/docs/governance/GOVERNANCE-INDEX.md': [
      'project/docs/rcv-claim-legal-basis-projection-binding-v1.md',
      target.implementation.squashSha.slice(0, 8),
      target.implementation.contractId,
      'next D02-KC01 owner-gated',
    ].join('\n'),
  };
  if (options.omitNextTask) {
    closureContent['project/docs/governance/product-backlog.md'] =
      'PB01 closure without next-task authority\n';
  }
  for (const [repoPath, content] of Object.entries(closureContent)) {
    writeFixtureRepoFile(root, repoPath, content + '\n');
  }
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'target PB01 formal closure'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createKc01ClosureTargetGitFixture(t, options = {}) {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-kc01-closure-'));
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
    ['fetch', '--quiet', '--no-tags', REPO_ROOT, target.implementation.squashSha],
    root,
  );
  runFixtureGit(
    ['checkout', '--quiet', '-b', 'kc01-closure-base', target.implementation.squashSha],
    root,
  );

  const contractPath = fixturePath(root, binding.contractPath);
  fs.appendFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  const semanticRecordId =
    options.semanticRecordId || target.semanticAuthority.recordId;
  const executionRecordId =
    options.executionRecordId || target.executionGrant.recordId;
  const semanticBindingRecordId =
    options.semanticBindingRecordId || target.semanticAuthority.recordId;
  const semanticMarker =
    '<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=' +
    semanticRecordId +
    ' -->';
  const decisionPath = fixturePath(root, target.semanticAuthority.path);
  fs.appendFileSync(
    decisionPath,
    '\n| 2026-07-29 | ' +
      semanticMarker +
      ' **' +
      semanticRecordId +
      ' — fixture** |\n' +
      (options.duplicateSemanticMarker ? semanticMarker + '\n' : ''),
    'utf8',
  );
  const executionMarker =
    '<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=' +
    executionRecordId +
    ' -->';
  const grantPath = fixturePath(root, target.executionGrant.path);
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(
    grantPath,
    [
      '# KC01 closure grant',
      executionMarker,
      options.duplicateExecutionMarker ? executionMarker : '',
      '',
      '```text',
      'semanticAuthorityRef.kind     : ' + target.semanticAuthority.kind,
      'semanticAuthorityRef.path     : ' + target.semanticAuthority.path,
      'semanticAuthorityRef.recordId : ' + semanticBindingRecordId,
      '```',
      '',
      ...target.changedPaths.map(({ path: repoPath }) => '- `' + repoPath + '`'),
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical KC01 closure binding'], root);

  if (options.freshMain) {
    writeFixtureRepoFile(root, 'unrelated.md', 'fresh main advance\n');
    runFixtureGit(['add', '--all'], root);
    runFixtureGit(['commit', '--quiet', '-m', 'advance canonical main'], root);
  }
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const closureContent = {
    'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md': [
      'RCV-CLAIM-FORM-P02-S08-D02-KC01 : CLOSED / CANONICAL / PASS',
      target.implementation.squashSha,
      target.implementation.publicManifestChecksum,
      'Next eligible task          : ' + target.implementation.nextTaskId,
      'KC01 trust-root onboarding  : PENDING / NOT ACTIVE',
    ].join('\n'),
    'project/docs/governance/canonicalization-register.md': [
      'RCV-CLAIM-FORM-P02-S08-D02-KC01 — AWS KMS legal signer key ceremony formal closure',
      target.implementation.squashSha,
      target.implementation.publicManifestChecksum,
      target.implementation.nextTaskId + ' — OWNER GO REQUIRED / NOT STARTED',
    ].join('\n'),
    'project/docs/governance/product-backlog.md': [
      'RCV-CLAIM-FORM-P02-S08-D02-KC01 — AWS KMS Legal Signer Key Ceremony',
      target.implementation.squashSha,
      target.implementation.publicManifestChecksum,
      target.implementation.nextTaskId,
    ].join('\n'),
    'project/docs/governance/GOVERNANCE-INDEX.md': [
      'project/docs/rcv-claim-legal-signer-*',
      target.implementation.squashSha.slice(0, 8),
      'trust root PENDING_ONBOARDING',
      'next D02-TR01 owner-gated',
    ].join('\n'),
  };
  if (options.omitNextTask) {
    closureContent['project/docs/governance/product-backlog.md'] =
      'KC01 closure without next-task authority\n';
  }
  for (const [repoPath, content] of Object.entries(closureContent)) {
    writeFixtureRepoFile(root, repoPath, content + '\n');
  }
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'target KC01 formal closure'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
}

function createKc01Tr01OwnershipReconciliationTargetGitFixture(t, options = {}) {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-kc01-tr01-owner-'));
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
    ['fetch', '--quiet', '--no-tags', REPO_ROOT, target.implementation.sequenceAuthoritySha],
    root,
  );
  runFixtureGit(
    [
      'checkout',
      '--quiet',
      '-b',
      'kc01-tr01-ownership-base',
      target.implementation.sequenceAuthoritySha,
    ],
    root,
  );

  const contractPath = fixturePath(root, binding.contractPath);
  fs.appendFileSync(contractPath, rcvColBindingContractContent(binding), 'utf8');
  const semanticRecordId =
    options.semanticRecordId || target.semanticAuthority.recordId;
  const executionRecordId =
    options.executionRecordId || target.executionGrant.recordId;
  const semanticBindingRecordId =
    options.semanticBindingRecordId || target.semanticAuthority.recordId;
  const semanticMarker =
    '<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=' +
    semanticRecordId +
    ' -->';
  const decisionPath = fixturePath(root, target.semanticAuthority.path);
  fs.appendFileSync(
    decisionPath,
    '\n| 2026-07-30 | ' +
      semanticMarker +
      ' **' +
      semanticRecordId +
      ' — fixture** |\n',
    'utf8',
  );
  const executionMarker =
    '<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=' +
    executionRecordId +
    ' -->';
  const grantPath = fixturePath(root, target.executionGrant.path);
  fs.mkdirSync(path.dirname(grantPath), { recursive: true });
  fs.writeFileSync(
    grantPath,
    [
      '# KC01/TR01 ownership reconciliation grant',
      executionMarker,
      '',
      '```text',
      'semanticAuthorityRef.kind     : ' + target.semanticAuthority.kind,
      'semanticAuthorityRef.path     : ' + target.semanticAuthority.path,
      'semanticAuthorityRef.recordId : ' + semanticBindingRecordId,
      '```',
      '',
      ...target.changedPaths.map(({ path: repoPath }) => '- `' + repoPath + '`'),
      '',
    ].join('\n'),
    'utf8',
  );
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'canonical ownership reconciliation binding'], root);

  if (options.freshMain) {
    writeFixtureRepoFile(root, 'unrelated.md', 'fresh main advance\n');
    runFixtureGit(['add', '--all'], root);
    runFixtureGit(['commit', '--quiet', '-m', 'advance canonical main'], root);
  }
  const base = runFixtureGit(['rev-parse', 'HEAD'], root);

  const shared = [
    target.taskId,
    target.implementation.kc01SquashSha,
    target.implementation.tr01SquashSha,
    target.implementation.nextTaskId,
    'CROSS_MODULE / SHARED_CONTROL_PLANE',
    'OFFICE',
    'RECEIVABLE',
  ];
  const closureContent = {
    'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md': [
      ...shared,
      target.implementation.sequenceAuthoritySha,
      'RUNTIME                            DORMANT',
      'SIGNING AUTHORITY                  NOT ACTIVE',
      'D02-LB01                           NOT CURRENT NEXT / NOT ELIGIBLE',
    ].join('\n'),
    'project/docs/governance/canonicalization-register.md': [
      ...shared,
      'verification `ACTIVE`, runtime `DORMANT`, signing `NOT ACTIVE`',
      '`RCV-CLAIM-FORM-P02-S08-D02-LB01` `NOT CURRENT NEXT / NOT ELIGIBLE`',
    ].join('\n'),
    'project/docs/governance/product-backlog.md': [
      ...shared,
      target.implementation.sequenceAuthoritySha,
      'SIGNING                            NOT ACTIVE',
      'D02-LB01                           NOT CURRENT NEXT / NOT ELIGIBLE',
    ].join('\n'),
    'project/docs/governance/GOVERNANCE-INDEX.md': [
      'project/docs/rcv-claim-legal-signer-*',
      'project/docs/rcv-claim-legal-public-key-trust-root-*',
      target.implementation.kc01SquashSha.slice(0, 8),
      target.implementation.tr01SquashSha.slice(0, 8),
      'CROSS_MODULE / SHARED_CONTROL_PLANE',
      'OFFICE',
      'RECEIVABLE',
    ].join('\n'),
  };
  if (options.omitNextTask) {
    closureContent['project/docs/governance/product-backlog.md'] =
      'ownership reconciliation without next task\n';
  }
  for (const [repoPath, content] of Object.entries(closureContent)) {
    writeFixtureRepoFile(root, repoPath, content + '\n');
  }
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'target ownership reconciliation'], root);
  const head = runFixtureGit(['rev-parse', 'HEAD'], root);
  return { root, base, head };
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
  request.operation.targetFile = 'project/docs/governance/maintenance-register.md';
  request.declaredTargetAllowlist = [request.operation.targetFile];
  refingerprint(request);
  expectCode(
    () => coordination.validateRequestObject(request),
    'OWNER_WIP_TARGET_FORBIDDEN',
  );
});

test('one inactive and one active source on the same path remains forbidden', () => {
  const target = 'project/docs/governance/COLLECTION-GOVERNANCE.md';
  const policy = attributedOwnerWipPolicy([
    attributedOwnerWipSource('G-WIP-01', [
      { path: target, activeProtection: false },
    ]),
    attributedOwnerWipSource('ACTIVE-WIP-01', [
      { path: target, activeProtection: true },
    ]),
  ]);
  assert.deepEqual(coordination.deriveActiveOwnerWipExactPaths(policy), [target]);
  expectCode(
    () =>
      coordination.validateTargetPolicy(
        target,
        'EXACT_LITERAL_REPLACEMENT',
        policy,
      ),
    'OWNER_WIP_TARGET_FORBIDDEN',
  );
});

test('all inactive sources release the path deterministically', () => {
  const target = 'project/docs/governance/COLLECTION-RISK-REGISTER.md';
  const policy = attributedOwnerWipPolicy([
    attributedOwnerWipSource('SNAP-01', [
      { path: target, activeProtection: false },
    ]),
    attributedOwnerWipSource('SNAP-02', [
      { path: target, activeProtection: false },
    ]),
  ]);
  assert.deepEqual(coordination.deriveActiveOwnerWipExactPaths(policy), []);
  assert.equal(
    coordination.validateTargetPolicy(target, 'EXACT_LITERAL_REPLACEMENT', policy),
    target,
  );
});

test('absent G-WIP ownership does not release unrelated active owner WIP', () => {
  const staleTarget = 'project/docs/governance/COLLECTION-GOVERNANCE.md';
  const activeTarget = 'project/docs/governance/maintenance-register.md';
  const policy = attributedOwnerWipPolicy([
    attributedOwnerWipSource('G-WIP-01', [
      { path: staleTarget, activeProtection: false },
    ]),
    attributedOwnerWipSource('BR-WIP-02', [
      { path: activeTarget, activeProtection: true },
    ]),
  ]);
  assert.equal(
    coordination.validateTargetPolicy(
      staleTarget,
      'EXACT_LITERAL_REPLACEMENT',
      policy,
    ),
    staleTarget,
  );
  expectCode(
    () =>
      coordination.validateTargetPolicy(
        activeTarget,
        'EXACT_LITERAL_REPLACEMENT',
        policy,
      ),
    'OWNER_WIP_TARGET_FORBIDDEN',
  );
});

test('active branch and locked unknown exact paths remain forbidden', () => {
  const branchTarget = 'project/docs/governance/architecture-index.md';
  const lockedTarget = 'project/docs/governance/product-backlog.md';
  const policy = attributedOwnerWipPolicy([
    attributedOwnerWipSource(
      'BR-WIP-01',
      [{ path: branchTarget, activeProtection: true }],
      { sourceType: 'GIT_BRANCH_WORKTREE' },
    ),
    attributedOwnerWipSource(
      'LOCKED-WIP-01',
      [{ path: lockedTarget, activeProtection: true }],
      { sourceType: 'LOCKED_INITIALIZING_GIT_WORKTREE' },
    ),
  ]);
  for (const target of [branchTarget, lockedTarget]) {
    expectCode(
      () =>
        coordination.validateTargetPolicy(
          target,
          'EXACT_LITERAL_REPLACEMENT',
          policy,
        ),
      'OWNER_WIP_TARGET_FORBIDDEN',
    );
  }
});

test('source attribution must match the deterministic flat active set', () => {
  const target = 'project/docs/governance/maintenance-register.md';
  const policy = attributedOwnerWipPolicy([
    attributedOwnerWipSource('BR-WIP-02', [
      { path: target, activeProtection: true },
    ]),
  ]);
  policy.grandfatheredOwnerWipExactPaths = [];
  expectCode(
    () => coordination.deriveActiveOwnerWipExactPaths(policy),
    'OWNER_WIP_SOURCE_REGISTRY_INVALID',
  );
});

test('canonical source registry releases all six Task 04 targets only', () => {
  const policy = JSON.parse(
    fs.readFileSync(
      path.join(
        PROJECT_ROOT,
        'docs',
        'governance',
        'governance-writer-coordination-protected-paths.json',
      ),
      'utf8',
    ),
  );
  const task04Targets = [
    'project/docs/governance/COLLECTION-RISK-REGISTER.md',
    'project/docs/governance/COLLECTION-GOVERNANCE.md',
    'project/docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md',
    'project/docs/governance/architecture-index.md',
    'project/docs/governance/master-triage-register.md',
    'project/docs/governance/product-backlog.md',
  ];
  for (const target of task04Targets) {
    assert.equal(
      coordination.validateTargetPolicy(target, 'EXACT_LITERAL_REPLACEMENT', policy),
      target,
    );
  }
  for (const target of policy.grandfatheredOwnerWipExactPaths) {
    expectCode(
      () =>
        coordination.validateTargetPolicy(
          target,
          'EXACT_LITERAL_REPLACEMENT',
          policy,
        ),
      'OWNER_WIP_TARGET_FORBIDDEN',
    );
  }
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

test('root SA record-scoping repair requires the exact base branch and M/M/M scope', () => {
  const repair =
    coordination.GOVERNANCE_COORDINATION_ROOT_SA_RECORD_SCOPING_REPAIR_R01;
  assert.deepEqual(
    classifyRootSaRecordScopingRepair(rootSaRecordScopingRepairChanges()),
    { mode: repair.mode, taskId: repair.taskId },
  );
});

test('root SA record-scoping repair rejects base branch scope and status drift', () => {
  const repair =
    coordination.GOVERNANCE_COORDINATION_ROOT_SA_RECORD_SCOPING_REPAIR_R01;
  const changes = rootSaRecordScopingRepairChanges();
  const driftCases = [
    { changes, overrides: { base: '0'.repeat(40) } },
    { changes, overrides: { headRef: `${repair.headRef}-copy` } },
    { changes: changes.slice(1), overrides: {} },
    {
      changes: changes.map((change, index) =>
        index === 0 ? { ...change, status: 'A' } : change,
      ),
      overrides: {},
    },
    {
      changes: [
        ...changes,
        { status: 'M', path: 'project/docs/governance/decision-log.md' },
      ],
      overrides: {},
    },
  ];
  for (const fixture of driftCases) {
    expectCode(
      () => classifyRootSaRecordScopingRepair(fixture.changes, fixture.overrides),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
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

test('Orkestra execution-model reconciliation accepts its exact four-file scope', () => {
  const binding = coordination.ORCHESTRA_EXECUTION_MODEL_REVISION_R01;
  const result = coordination.classifyPrChangeSet(binding.changedPaths, {
    base: binding.baseSha,
    headRef: binding.headRef,
  });
  assert.equal(result.mode, binding.mode);
  assert.equal(result.taskId, binding.taskId);
});

test('Orkestra execution-model reconciliation rejects base, branch and scope drift', () => {
  const binding = coordination.ORCHESTRA_EXECUTION_MODEL_REVISION_R01;
  for (const context of [
    { base: '0000000000000000000000000000000000000000', headRef: binding.headRef },
    { base: binding.baseSha, headRef: 'codex/ordinary-governance-change' },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(binding.changedPaths, context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        binding.changedPaths.slice(0, -1),
        { base: binding.baseSha, headRef: binding.headRef },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
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

test('gitShow returns a complete canonical blob larger than the Node default buffer', (t) => {
  const fixture = createLargeGitBlobFixture(t);
  const actual = coordination.gitShow(fixture.head, fixture.repoPath, fixture.root);
  assert.equal(Buffer.byteLength(fixture.content, 'utf8'), 1_100_000);
  assert.equal(actual.length, fixture.content.length);
  assert.equal(actual, fixture.content);
  assert.equal(actual.endsWith(fixture.sentinel), true);
});

test('runGit fails closed without exposing partial output when capture exceeds its override', (t) => {
  const fixture = createLargeGitBlobFixture(t);
  assert.throws(
    () =>
      coordination.runGit(
        ['show', `${fixture.head}:${fixture.repoPath}`],
        fixture.root,
        { maxBufferBytes: 1024, allowFailure: true },
      ),
    (error) => {
      assert.ok(error instanceof coordination.CoordinationError);
      assert.equal(error.code, 'GIT_OUTPUT_LIMIT_EXCEEDED');
      assert.match(error.message, /bounded limit 1024 bytes/);
      assert.match(error.message, /stdoutBytes=/);
      assert.match(error.message, /stderrCharacters=/);
      assert.doesNotMatch(error.message, /LARGE_AUTHORITY_FINAL_SENTINEL/);
      assert.ok(error.message.length < 1024);
      return true;
    },
  );
});

test('runGit rejects invalid bounded capture limits', () => {
  for (const maxBufferBytes of [
    0,
    -1,
    1.5,
    coordination.GIT_CANONICAL_TEXT_BLOB_PROCESS_MAX_BUFFER_BYTES + 1,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    expectCode(
      () => coordination.runGit(['status'], REPO_ROOT, { maxBufferBytes }),
      'GIT_CAPTURE_LIMIT_INVALID',
    );
  }
});

test('large-authority constants preserve the ratified bounded hierarchy', () => {
  assert.equal(coordination.GIT_DEFAULT_PROCESS_MAX_BUFFER_BYTES, 2 * 1024 * 1024);
  assert.equal(coordination.GIT_CANONICAL_TEXT_BLOB_LIMIT_BYTES, 8 * 1024 * 1024);
  assert.equal(
    coordination.GIT_CANONICAL_TEXT_BLOB_PROCESS_MAX_BUFFER_BYTES,
    16 * 1024 * 1024,
  );
  assert.equal(coordination.GIT_DIAGNOSTIC_EXCERPT_MAX_CHARS, 4096);
});

test('canonical blob size parsing and logical limit fail closed at exact boundaries', () => {
  const limit = coordination.GIT_CANONICAL_TEXT_BLOB_LIMIT_BYTES;
  assert.equal(coordination.parseGitBlobSize(String(limit)), limit);
  assert.doesNotThrow(() => coordination.assertCanonicalGitBlobSize(limit, 'HEAD:file'));
  expectCode(
    () => coordination.assertCanonicalGitBlobSize(limit + 1, 'HEAD:file'),
    'GIT_BLOB_SIZE_LIMIT_EXCEEDED',
  );
  for (const value of ['', '-1', '1.5', '1e3', 'not-a-size']) {
    expectCode(
      () => coordination.parseGitBlobSize(value),
      'GIT_BLOB_SIZE_INVALID',
    );
  }
});

test('gitShow rejects an oversized canonical blob before reading its content', (t) => {
  const fixture = createLargeGitBlobFixture(
    t,
    coordination.GIT_CANONICAL_TEXT_BLOB_LIMIT_BYTES + 1,
  );
  assert.throws(
    () => coordination.gitShow(fixture.head, fixture.repoPath, fixture.root),
    (error) => {
      assert.ok(error instanceof coordination.CoordinationError);
      assert.equal(error.code, 'GIT_BLOB_SIZE_LIMIT_EXCEEDED');
      assert.match(error.message, /8388609 bytes/);
      assert.doesNotMatch(error.message, /LARGE_AUTHORITY_FINAL_SENTINEL/);
      return true;
    },
  );
});

test('bounded Git diagnostics never exceed the ratified character limit', () => {
  const source = `prefix-${'X'.repeat(10_000)}-secret-tail`;
  const diagnostic = coordination.boundedGitDiagnostic(source);
  assert.equal(diagnostic.length, coordination.GIT_DIAGNOSTIC_EXCERPT_MAX_CHARS);
  assert.match(diagnostic, /\.\.\.\[diagnostic truncated\]$/);
  assert.doesNotMatch(diagnostic, /secret-tail/);
});

test('runGit preserves normal git failure and allowFailure behavior', (t) => {
  const fixture = createLargeGitBlobFixture(t, 128);
  expectCode(
    () => coordination.runGit(['show', 'missing-ref:missing-path'], fixture.root),
    'GIT_VALIDATION_FAILED',
  );
  const parent = coordination.runGit(
    ['rev-parse', `${fixture.head}^`],
    fixture.root,
  ).stdout.trim();
  const result = coordination.runGit(
    ['merge-base', '--is-ancestor', fixture.head, parent],
    fixture.root,
    { allowFailure: true },
  );
  assert.equal(result.status, 1);
  assert.equal(result.error, undefined);
});

test('large-authority read repair requires exact self-binding and contract content', () => {
  const repair = coordination.RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01;
  const changes = rcvColLargeAuthorityReadRepairChanges();
  const classification = classifyRcvColLargeAuthorityReadRepair(changes);
  assert.equal(classification.mode, repair.mode);
  assert.equal(classification.taskId, repair.taskId);

  const fixture = createAuthorityGitFixture(
    repair.contractPath,
    rcvColLargeAuthorityReadRepairContractContent(),
  );
  const validated = coordination.validateRcvColLargeAuthorityReadRepairScope({
    base: repair.baseSha,
    head: fixture.head,
    headRef: repair.headRef,
    changes,
    taskId: repair.taskId,
    cwd: fixture.root,
  });
  assert.equal(validated.mode, repair.mode);
  assert.equal(validated.taskId, repair.taskId);
});

test('large-authority read repair classifier rejects near matches and protected companions', () => {
  const repair = coordination.RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01;
  const exact = rcvColLargeAuthorityReadRepairChanges();
  const cases = [
    { changes: exact, overrides: { base: '0'.repeat(40) } },
    { changes: exact, overrides: { headRef: `${repair.headRef}-copy` } },
    { changes: exact.slice(1) },
    {
      changes: [
        ...exact,
        { status: 'M', path: 'project/docs/governance/decision-log.md' },
      ],
    },
    {
      changes: exact.map((change, index) =>
        index === 0 ? { ...change, status: 'A' } : change,
      ),
    },
    {
      changes: exact.map((change, index) =>
        index === 0 ? { ...change, status: 'D' } : change,
      ),
    },
    {
      changes: exact.map((change, index) =>
        index === 0
          ? { ...change, status: 'R100', oldPath: 'project/scripts/old.cjs' }
          : change,
      ),
    },
    {
      changes: [
        ...exact,
        {
          status: 'A',
          path: 'project/docs/governance/coordination-requests/OTHER/request.md',
        },
      ],
    },
    {
      changes: [
        ...exact,
        {
          status: 'A',
          path: 'project/docs/governance/coordination-results/OTHER/result.md',
        },
      ],
    },
    {
      changes: [
        ...exact,
        { status: 'M', path: coordination.REGISTER_REPO_PATH },
      ],
    },
  ];
  for (const entry of cases) {
    expectCode(
      () =>
        classifyRcvColLargeAuthorityReadRepair(
          entry.changes,
          entry.overrides || {},
        ),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('owner-WIP source attribution requires the exact five-file self-binding', () => {
  const binding = coordination.OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01;
  const classification = classifyOwnerWipPathOwnership(
    ownerWipPathOwnershipChanges(),
  );
  assert.equal(classification.mode, binding.mode);
  assert.equal(classification.taskId, binding.taskId);
});

test('owner-WIP source attribution rejects branch base and scope drift', () => {
  const binding = coordination.OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01;
  const exact = ownerWipPathOwnershipChanges();
  for (const entry of [
    { changes: exact, overrides: { base: '0'.repeat(40) } },
    { changes: exact, overrides: { headRef: `${binding.headRef}-copy` } },
    { changes: exact.slice(1) },
    {
      changes: [
        ...exact,
        { status: 'M', path: 'project/docs/governance/decision-log.md' },
      ],
    },
  ]) {
    expectCode(
      () => classifyOwnerWipPathOwnership(entry.changes, entry.overrides || {}),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('RCV-COL binding PR requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(rcvColBindingChanges(), {
    base: binding.bindingPr.baseSha,
    headRef: binding.bindingPr.headRef,
  });
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(),
  );
  const result = coordination.validateRcvColFullRemediationBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: rcvColBindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('RCV-COL binding PR rejects wrong branch base and extra path', () => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { base: binding.bindingPr.baseSha, headRef: `${binding.bindingPr.headRef}-copy` },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(rcvColBindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const changes = rcvColBindingChanges();
  changes.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(changes, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('RCV-COL target recognizes only exact branch and M/A change set', () => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(rcvColTargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  expectCode(
    () =>
      coordination.classifyPrChangeSet(rcvColTargetChanges(), {
        base: binding.targetPr.originalBaseSha,
        headRef: `${binding.targetPr.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = rcvColTargetChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/product-backlog.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('RCV-COL target rejects decision and grant status drift', () => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const status of ['A', 'D', 'R100']) {
    const changes = rcvColTargetChanges();
    changes[0] = {
      status,
      path: changes[0].path,
      ...(status.startsWith('R') ? { oldPath: 'project/docs/governance/old.md' } : {}),
    };
    expectCode(
      () =>
        coordination.classifyPrChangeSet(changes, {
          base: binding.targetPr.originalBaseSha,
          headRef: binding.targetPr.headRef,
        }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  for (const status of ['M', 'D', 'R100']) {
    const changes = rcvColTargetChanges();
    changes[1] = {
      status,
      path: changes[1].path,
      ...(status.startsWith('R') ? { oldPath: 'project/docs/governance/old-grant.md' } : {}),
    };
    expectCode(
      () =>
        coordination.classifyPrChangeSet(changes, {
          base: binding.targetPr.originalBaseSha,
          headRef: binding.targetPr.headRef,
        }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('RCV-COL target validates exact markers binding and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createRcvColTargetGitFixture(t, { freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('RCV-COL public validator fully reads a production-sized authority blob', (t) => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    freshMain: true,
    largeDecisionLogBytes: 1_100_000,
  });
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: binding.targetPr.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);
});

test('RCV-COL target rejects wrong or duplicate authority markers', (t) => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    { semanticRecordId: 'RCV-COL-WRONG-SEMANTIC-R01', code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH' },
    { executionRecordId: 'RCV-COL-WRONG-GRANT-R01', code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH' },
    { duplicateSemanticMarker: true, code: 'AUTHORITY_RECORD_AMBIGUOUS' },
    { duplicateExecutionMarker: true, code: 'AUTHORITY_RECORD_AMBIGUOUS' },
  ]) {
    const fixture = createRcvColTargetGitFixture(t, options);
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      options.code,
    );
  }
});

test('RCV-COL target rejects a grant bound to another semantic authority', (t) => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    semanticBindingRecordId: 'ANOTHER-SEMANTIC-AUTHORITY-R01',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.targetPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('RCV-COL binding cannot be reused as generic bootstrap or with control-plane companions', () => {
  const binding =
    coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const unrelated = rcvColTargetChanges();
  expectCode(
    () =>
      coordination.classifyPrChangeSet(unrelated, {
        base: binding.targetPr.originalBaseSha,
        headRef: 'codex/rcv-col-full-remediation-bootstrap-r02',
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  for (const companion of [
    'project/docs/governance/coordination-requests/GOV-REQ-20260728-OTHER/request.md',
    'project/docs/governance/coordination-results/GOV-REQ-20260728-OTHER/result.md',
    coordination.REGISTER_REPO_PATH,
  ]) {
    const changes = rcvColTargetChanges();
    changes.push({ status: companion.includes('/request') || companion.includes('/result') ? 'A' : 'M', path: companion });
    expectCode(
      () =>
        coordination.classifyPrChangeSet(changes, {
          base: binding.targetPr.originalBaseSha,
          headRef: binding.targetPr.headRef,
        }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('HCR-08 binding PR requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(hcr08BindingChanges(), {
    base: binding.bindingPr.baseSha,
    headRef: binding.bindingPr.headRef,
  });
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validateHcr08AuthorityBootstrapBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: hcr08BindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('HCR-08 binding rejects wrong base branch and expanded control-plane scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { base: binding.bindingPr.baseSha, headRef: `${binding.bindingPr.headRef}-copy` },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(hcr08BindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = hcr08BindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('HCR-08 target recognizes only its exact branch and M/A change set', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(hcr08TargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  expectCode(
    () =>
      coordination.classifyPrChangeSet(hcr08TargetChanges(), {
        base: binding.targetPr.originalBaseSha,
        headRef: `${binding.targetPr.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = hcr08TargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('HCR-08 target validates exact authority markers binding and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('HCR-08 target rejects wrong markers semantic binding and reusable companions', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    {
      semanticRecordId: 'RCV-CLAIM-FORM-HCR-08-WRONG',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      executionRecordId: 'RCV-CLAIM-FORM-HCR-08-WRONG-GRANT',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      semanticBindingRecordId: 'ANOTHER-HCR-08-AUTHORITY',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
  ]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, ...options });
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      options.code,
    );
  }

  const expanded = hcr08TargetChanges();
  expanded.push({
    status: 'A',
    path:
      'project/docs/governance/coordination-requests/GOV-REQ-20260728-HCR08/request.md',
  });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP-M01 binding requires exact base branch scope and owner evidence', () => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    uyapM01BindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validateUyapM01AuthorityBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: uyapM01BindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('UYAP-M01 binding rejects wrong base branch and expanded scope', () => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    {
      base: binding.bindingPr.baseSha,
      headRef: `${binding.bindingPr.headRef}-copy`,
    },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(uyapM01BindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = uyapM01BindingChanges();
  expanded.push({
    status: 'M',
    path: 'project/docs/governance/decision-log.md',
  });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP-M01 target accepts only exact branch and distinct M/A authority tuple', () => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(uyapM01TargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  const expanded = uyapM01TargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP-M01 target validates exact owner evidence and semantic binding', (t) => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, { binding, freshMain: true });
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: binding.targetPr.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);
});

test('UYAP-M01 target rejects a grant bound to another semantic authority', (t) => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    binding,
    semanticBindingRecordId: 'UYAP-M01-WRONG-SA01',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.targetPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('UYAP structured-emission binding requires exact base branch scope and owner evidence', () => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    uyapStructuredEmissionBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result =
    coordination.validateUyapStructuredEmissionAuthorityBindingScope({
      base: binding.bindingPr.baseSha,
      head: fixture.head,
      headRef: binding.bindingPr.headRef,
      changes: uyapStructuredEmissionBindingChanges(),
      taskId: binding.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('UYAP structured-emission binding rejects wrong base branch and expanded scope', () => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    {
      base: binding.bindingPr.baseSha,
      headRef: `${binding.bindingPr.headRef}-copy`,
    },
  ]) {
    expectCode(
      () =>
        coordination.classifyPrChangeSet(
          uyapStructuredEmissionBindingChanges(),
          context,
        ),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = uyapStructuredEmissionBindingChanges();
  expanded.push({
    status: 'M',
    path: 'project/docs/governance/decision-log.md',
  });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP structured-emission target accepts only exact branch and distinct M/A authority tuple', () => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(
    uyapStructuredEmissionTargetChanges(),
    {
      base: binding.targetPr.originalBaseSha,
      headRef: binding.targetPr.headRef,
    },
  );
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  const expanded = uyapStructuredEmissionTargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP structured-emission target validates exact owner evidence and semantic binding', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    binding,
    freshMain: true,
  });
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: binding.targetPr.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);
});

test('UYAP structured-emission target rejects a grant bound to another semantic authority', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    binding,
    semanticBindingRecordId:
      'UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-WRONG-SA01',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.targetPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('UYAP serializer-bypass hardening binding requires exact base branch scope and owner evidence', () => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  assert.equal(
    coordination.sha256(binding.ownerRatificationEvidence.exactExcerpt),
    binding.ownerRatificationEvidence.excerptSha256,
  );

  const classification = coordination.classifyPrChangeSet(
    uyapSerializerBypassHardeningBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result =
    coordination.validateUyapSerializerBypassHardeningAuthorityBindingScope({
      base: binding.bindingPr.baseSha,
      head: fixture.head,
      headRef: binding.bindingPr.headRef,
      changes: uyapSerializerBypassHardeningBindingChanges(),
      taskId: binding.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('UYAP serializer-bypass hardening binding rejects wrong base and expanded scope', () => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        uyapSerializerBypassHardeningBindingChanges(),
        {
          base: '0'.repeat(40),
          headRef: binding.bindingPr.headRef,
        },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );

  const expanded = uyapSerializerBypassHardeningBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP serializer-bypass hardening target accepts only exact branch and M/A authority tuple', () => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(
    uyapSerializerBypassHardeningTargetChanges(),
    {
      base: binding.targetPr.originalBaseSha,
      headRef: binding.targetPr.headRef,
    },
  );
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  const expanded = uyapSerializerBypassHardeningTargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP serializer-bypass hardening target validates exact owner evidence and semantic binding', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    binding,
    freshMain: true,
  });
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: binding.targetPr.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);
});

test('UYAP final-CI eligibility binding requires exact base branch scope and owner evidence', () => {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  assert.equal(
    coordination.sha256(binding.ownerRatificationEvidence.exactExcerpt),
    binding.ownerRatificationEvidence.excerptSha256,
  );

  const classification = coordination.classifyPrChangeSet(
    uyapFinalCiEligibilityBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validateUyapFinalCiEligibilityAuthorityBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: uyapFinalCiEligibilityBindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('UYAP final-CI eligibility binding rejects wrong base and expanded scope', () => {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  expectCode(
    () =>
      coordination.classifyPrChangeSet(uyapFinalCiEligibilityBindingChanges(), {
        base: '0'.repeat(40),
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );

  const expanded = uyapFinalCiEligibilityBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP final-CI eligibility target accepts only exact branch and M/A authority tuple', () => {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(
    uyapFinalCiEligibilityTargetChanges(),
    {
      base: binding.targetPr.originalBaseSha,
      headRef: binding.targetPr.headRef,
    },
  );
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  const expanded = uyapFinalCiEligibilityTargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP final-CI eligibility target validates exact owner evidence and semantic binding', (t) => {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    binding,
    freshMain: true,
  });
  const result =
    coordination.validateUyapFinalCiEligibilityAuthorityMaterializationScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      changes: uyapFinalCiEligibilityTargetChanges(),
      taskId: binding.targetPr.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, binding.targetPr.mode);
});

test('UYAP final-CI eligibility closeout binding requires exact base branch and M/M/M scope', () => {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  const closeoutBinding = binding.closeoutBindingPr;
  const classification = coordination.classifyPrChangeSet(
    uyapFinalCiEligibilityCloseoutBindingChanges(),
    {
      base: closeoutBinding.baseSha,
      headRef: closeoutBinding.headRef,
    },
  );
  assert.equal(classification.mode, closeoutBinding.mode);
  assert.equal(classification.taskId, closeoutBinding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result =
    coordination.validateUyapFinalCiEligibilityTerminalCloseoutBindingScope({
      base: closeoutBinding.baseSha,
      head: fixture.head,
      headRef: closeoutBinding.headRef,
      changes: uyapFinalCiEligibilityCloseoutBindingChanges(),
      taskId: closeoutBinding.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, closeoutBinding.mode);

  const expanded = uyapFinalCiEligibilityCloseoutBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: closeoutBinding.baseSha,
        headRef: closeoutBinding.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP final-CI eligibility closeout accepts only the exact terminal receipt', (t) => {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const fixture = createUyapFinalCiEligibilityCloseoutGitFixture(t);
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: target.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, target.mode);
  assert.equal(result.taskId, target.taskId);

  const expanded = uyapFinalCiEligibilityCloseoutChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: fixture.base,
        headRef: target.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP final-CI eligibility closeout rejects an incomplete receipt', (t) => {
  const binding =
    coordination.UYAP_FINAL_CI_ELIGIBILITY_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createUyapFinalCiEligibilityCloseoutGitFixture(t, {
    omitLiteral: 'PRODUCTION REACHABILITY   : 0 / VERIFIED',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.closeoutPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('UYAP serializer-bypass hardening target rejects another semantic authority', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createRcvColTargetGitFixture(t, {
    binding,
    semanticBindingRecordId:
      'UYAP-OFFICIAL-SERIALIZER-BYPASS-HARDENING-I01-WRONG-SA01',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.targetPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('UYAP serializer-bypass hardening closeout binding requires exact base branch and M/M/M scope', () => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  const closeoutBinding = binding.closeoutBindingPr;
  const classification = coordination.classifyPrChangeSet(
    uyapSerializerBypassHardeningCloseoutBindingChanges(),
    {
      base: closeoutBinding.baseSha,
      headRef: closeoutBinding.headRef,
    },
  );
  assert.equal(classification.mode, closeoutBinding.mode);
  assert.equal(classification.taskId, closeoutBinding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result =
    coordination.validateUyapSerializerBypassHardeningTerminalCloseoutBindingScope({
      base: closeoutBinding.baseSha,
      head: fixture.head,
      headRef: closeoutBinding.headRef,
      changes: uyapSerializerBypassHardeningCloseoutBindingChanges(),
      taskId: closeoutBinding.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, closeoutBinding.mode);

  const expanded = uyapSerializerBypassHardeningCloseoutBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: closeoutBinding.baseSha,
        headRef: closeoutBinding.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP serializer-bypass hardening closeout accepts only the exact terminal receipt', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const fixture = createUyapSerializerBypassHardeningCloseoutGitFixture(t);
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: target.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, target.mode);
  assert.equal(result.taskId, target.taskId);

  const expanded = uyapSerializerBypassHardeningCloseoutChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: fixture.base,
        headRef: target.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP serializer-bypass hardening closeout rejects an incomplete receipt', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_SERIALIZER_BYPASS_HARDENING_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createUyapSerializerBypassHardeningCloseoutGitFixture(t, {
    omitLiteral: 'CALLER-CREATED RESOLVED   : FAIL-CLOSED',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.closeoutPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('UYAP structured-emission closeout binding requires exact base branch and M/M/M scope', () => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const closeoutBinding = binding.closeoutBindingPr;
  const classification = coordination.classifyPrChangeSet(
    uyapStructuredEmissionCloseoutBindingChanges(),
    {
      base: closeoutBinding.baseSha,
      headRef: closeoutBinding.headRef,
    },
  );
  assert.equal(classification.mode, closeoutBinding.mode);
  assert.equal(classification.taskId, closeoutBinding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result =
    coordination.validateUyapStructuredEmissionTerminalCloseoutBindingScope({
      base: closeoutBinding.baseSha,
      head: fixture.head,
      headRef: closeoutBinding.headRef,
      changes: uyapStructuredEmissionCloseoutBindingChanges(),
      taskId: closeoutBinding.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, closeoutBinding.mode);

  const expanded = uyapStructuredEmissionCloseoutBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: closeoutBinding.baseSha,
        headRef: closeoutBinding.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP structured-emission closeout accepts only the exact terminal receipt', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const fixture = createUyapStructuredEmissionCloseoutGitFixture(t);
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: target.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, target.mode);
  assert.equal(result.taskId, target.taskId);

  const expanded = uyapStructuredEmissionCloseoutChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: fixture.base,
        headRef: target.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP structured-emission closeout rejects an incomplete terminal receipt', (t) => {
  const binding =
    coordination.UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_I01_CONTROL_PLANE_BINDING_R01;
  const fixture = createUyapStructuredEmissionCloseoutGitFixture(t, {
    omitLiteral: 'M01 QUALIFICATION      : REQUIRED / VERIFIED',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.closeoutPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('UYAP-M01 closeout binding requires exact base branch and M/M/M scope', () => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const closeoutBinding = binding.closeoutBindingPr;
  const classification = coordination.classifyPrChangeSet(
    uyapM01CloseoutBindingChanges(),
    {
      base: closeoutBinding.baseSha,
      headRef: closeoutBinding.headRef,
    },
  );
  assert.equal(classification.mode, closeoutBinding.mode);
  assert.equal(classification.taskId, closeoutBinding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validateUyapM01TerminalCloseoutBindingScope({
    base: closeoutBinding.baseSha,
    head: fixture.head,
    headRef: closeoutBinding.headRef,
    changes: uyapM01CloseoutBindingChanges(),
    taskId: closeoutBinding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, closeoutBinding.mode);

  const expanded = uyapM01CloseoutBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: closeoutBinding.baseSha,
        headRef: closeoutBinding.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP-M01 closeout accepts only the exact terminal receipt', (t) => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const target = binding.closeoutPr;
  const fixture = createUyapM01CloseoutGitFixture(t);
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: target.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.mode, target.mode);
  assert.equal(result.taskId, target.taskId);

  const expanded = uyapM01CloseoutChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: fixture.base,
        headRef: target.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('UYAP-M01 closeout rejects an incomplete terminal receipt', (t) => {
  const binding =
    coordination.UYAP_M01_LEGAL_BASIS_RESOLVER_BINDING_AUTHORITY_CONTROL_PLANE_BINDING_R01;
  const fixture = createUyapM01CloseoutGitFixture(t, {
    omitLiteral: 'PRODUCTION REACHABILITY: 0',
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.closeoutPr.headRef,
        cwd: fixture.root,
      }),
    'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
  );
});

test('PB01 binding PR requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(pb01BindingChanges(), {
    base: binding.bindingPr.baseSha,
    headRef: binding.bindingPr.headRef,
  });
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validatePb01AuthorityBootstrapBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: pb01BindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('PB01 binding rejects wrong base branch and expanded control-plane scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { base: binding.bindingPr.baseSha, headRef: `${binding.bindingPr.headRef}-copy` },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(pb01BindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = pb01BindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('PB01 target recognizes only its exact branch and M/A change set', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(pb01TargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  expectCode(
    () =>
      coordination.classifyPrChangeSet(pb01TargetChanges(), {
        base: binding.targetPr.originalBaseSha,
        headRef: `${binding.targetPr.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = pb01TargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('PB01 target validates exact authority markers binding and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('PB01 target rejects wrong authority markers and semantic binding', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    {
      semanticRecordId: 'RCV-CLAIM-FORM-P02-S08-D02-PB01-WRONG',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      executionRecordId: 'RCV-CLAIM-FORM-P02-S08-D02-PB01-WRONG-GRANT',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      semanticBindingRecordId: 'ANOTHER-PB01-AUTHORITY',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
  ]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, ...options });
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      options.code,
    );
  }
});

test('KC01 authority binding requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    kc01AuthorityBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validateKc01AuthorityBootstrapBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: kc01AuthorityBindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('KC01 authority binding rejects wrong base branch and expanded scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { base: binding.bindingPr.baseSha, headRef: `${binding.bindingPr.headRef}-copy` },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(kc01AuthorityBindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = kc01AuthorityBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('KC01 authority target recognizes only exact branch and M/A change set', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(kc01AuthorityTargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  expectCode(
    () =>
      coordination.classifyPrChangeSet(kc01AuthorityTargetChanges(), {
        base: binding.targetPr.originalBaseSha,
        headRef: `${binding.targetPr.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = kc01AuthorityTargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('KC01 authority target validates exact markers and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('KC01 authority target rejects wrong markers and semantic binding', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    {
      semanticRecordId: 'RCV-CLAIM-FORM-P02-S08-D02-KC01-WRONG',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      executionRecordId: 'RCV-CLAIM-FORM-P02-S08-D02-KC01-WRONG-GRANT',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      semanticBindingRecordId: 'ANOTHER-KC01-AUTHORITY',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
  ]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, ...options });
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      options.code,
    );
  }
});

test('TR01 authority binding requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    tr01AuthorityBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validateTr01AuthorityBootstrapBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: tr01AuthorityBindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('TR01 authority binding rejects wrong base branch and expanded scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { base: binding.bindingPr.baseSha, headRef: `${binding.bindingPr.headRef}-copy` },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(tr01AuthorityBindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = tr01AuthorityBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('TR01 authority target recognizes only exact branch and M/A change set', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(tr01AuthorityTargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  expectCode(
    () =>
      coordination.classifyPrChangeSet(tr01AuthorityTargetChanges(), {
        base: binding.targetPr.originalBaseSha,
        headRef: `${binding.targetPr.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = tr01AuthorityTargetChanges();
  expanded.push({ status: 'M', path: coordination.REGISTER_REPO_PATH });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('TR01 authority target validates exact markers and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('TR01 authority target rejects wrong markers and semantic binding', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    {
      semanticRecordId: 'RCV-CLAIM-FORM-P02-S08-D02-TR01-WRONG',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      executionRecordId: 'RCV-CLAIM-FORM-P02-S08-D02-TR01-WRONG-GRANT',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
    {
      semanticBindingRecordId: 'ANOTHER-TR01-AUTHORITY',
      code: 'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    },
  ]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, ...options });
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      options.code,
    );
  }
});

test('KC01/TR01 ownership authority binding requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    kc01Tr01OwnershipAuthorityBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result =
    coordination.validateKc01Tr01OwnershipAuthorityBootstrapBindingScope({
      base: binding.bindingPr.baseSha,
      head: fixture.head,
      headRef: binding.bindingPr.headRef,
      changes: kc01Tr01OwnershipAuthorityBindingChanges(),
      taskId: binding.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('KC01/TR01 ownership authority binding rejects wrong branch and expanded scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        kc01Tr01OwnershipAuthorityBindingChanges(),
        {
          base: binding.bindingPr.baseSha,
          headRef: `${binding.bindingPr.headRef}-copy`,
        },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = kc01Tr01OwnershipAuthorityBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('KC01/TR01 ownership authority target validates exact markers and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createRcvColTargetGitFixture(t, { binding, freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('KC01/TR01 ownership reconciliation binding requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    kc01Tr01OwnershipReconciliationBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result =
    coordination.validateKc01Tr01OwnershipReconciliationBindingScope({
      base: binding.bindingPr.baseSha,
      head: fixture.head,
      headRef: binding.bindingPr.headRef,
      changes: kc01Tr01OwnershipReconciliationBindingChanges(),
      taskId: binding.taskId,
      cwd: fixture.root,
    });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('KC01/TR01 ownership reconciliation binding rejects wrong branch and expanded scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        kc01Tr01OwnershipReconciliationBindingChanges(),
        {
          base: binding.bindingPr.baseSha,
          headRef: `${binding.bindingPr.headRef}-copy`,
        },
      ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = kc01Tr01OwnershipReconciliationBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('KC01/TR01 ownership reconciliation target validates exact markers and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createKc01Tr01OwnershipReconciliationTargetGitFixture(t, {
      freshMain,
    });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('KC01/TR01 ownership reconciliation target rejects incomplete authority or content', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    { semanticRecordId: 'RCV-CLAIM-FORM-KC01-TR01-WRONG' },
    { executionRecordId: 'RCV-CLAIM-FORM-KC01-TR01-WRONG-GRANT' },
    { semanticBindingRecordId: 'ANOTHER-KC01-TR01-AUTHORITY' },
    { omitNextTask: true },
  ]) {
    const fixture = createKc01Tr01OwnershipReconciliationTargetGitFixture(t, options);
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    );
  }
});

test('PB01 formal-closure binding requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    pb01ClosureBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validatePb01FormalClosureBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: pb01ClosureBindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('PB01 formal-closure binding rejects wrong base and expanded scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { base: binding.bindingPr.baseSha, headRef: binding.bindingPr.headRef + '-copy' },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(pb01ClosureBindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = pb01ClosureBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('PB01 formal-closure target recognizes only exact branch and four-file scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(pb01ClosureTargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  expectCode(
    () =>
      coordination.classifyPrChangeSet(pb01ClosureTargetChanges(), {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef + '-copy',
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = pb01ClosureTargetChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('PB01 formal-closure target validates canonical base authority and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createPb01ClosureTargetGitFixture(t, { freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('PB01 formal-closure target rejects wrong base authority and incomplete content', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    { semanticRecordId: 'RCV-CLAIM-FORM-PB01-WRONG' },
    { executionRecordId: 'RCV-CLAIM-FORM-PB01-WRONG-GRANT' },
    { semanticBindingRecordId: 'ANOTHER-PB01-AUTHORITY' },
    { omitNextTask: true },
  ]) {
    const fixture = createPb01ClosureTargetGitFixture(t, options);
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    );
  }
});

test('KC01 formal-closure binding requires exact base branch scope and contract content', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const classification = coordination.classifyPrChangeSet(
    kc01ClosureBindingChanges(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.equal(classification.mode, binding.bindingPr.mode);
  assert.equal(classification.taskId, binding.taskId);

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rcvColBindingContractContent(binding),
  );
  const result = coordination.validateKc01FormalClosureBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: kc01ClosureBindingChanges(),
    taskId: binding.taskId,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('KC01 formal-closure binding rejects wrong base and expanded scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  for (const context of [
    { base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { base: binding.bindingPr.baseSha, headRef: binding.bindingPr.headRef + '-copy' },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(kc01ClosureBindingChanges(), context),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
  const expanded = kc01ClosureBindingChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('KC01 formal-closure target recognizes only exact branch and four-file scope', () => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const result = coordination.classifyPrChangeSet(kc01ClosureTargetChanges(), {
    base: binding.targetPr.originalBaseSha,
    headRef: binding.targetPr.headRef,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  expectCode(
    () =>
      coordination.classifyPrChangeSet(kc01ClosureTargetChanges(), {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef + '-copy',
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
  const expanded = kc01ClosureTargetChanges();
  expanded.push({ status: 'M', path: 'project/docs/governance/decision-log.md' });
  expectCode(
    () =>
      coordination.classifyPrChangeSet(expanded, {
        base: binding.targetPr.originalBaseSha,
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('KC01 formal-closure target validates canonical base authority and fresh-main ancestry', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  for (const freshMain of [false, true]) {
    const fixture = createKc01ClosureTargetGitFixture(t, { freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('KC01 formal-closure target rejects wrong base authority and incomplete content', (t) => {
  const binding =
    coordination.RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  for (const options of [
    { semanticRecordId: 'RCV-CLAIM-FORM-KC01-WRONG' },
    { executionRecordId: 'RCV-CLAIM-FORM-KC01-WRONG-GRANT' },
    { semanticBindingRecordId: 'ANOTHER-KC01-AUTHORITY' },
    { omitNextTask: true },
  ]) {
    const fixture = createKc01ClosureTargetGitFixture(t, options);
    expectCode(
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    );
  }
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

test('GH-08 separation requires exact base, head ref, and the declared modified path set', () => {
  const binding = coordination.GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  const result = coordination.classifyPrChangeSet(changes, {
    base: binding.baseSha,
    headRef: binding.headRef,
  });
  assert.equal(result.mode, binding.mode);
  assert.equal(result.taskId, binding.taskId);
});

test('GH-08 separation rejects the wrong base', () => {
  const binding = coordination.GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, { base: '0'.repeat(40), headRef: binding.headRef }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-08 separation rejects the wrong head ref', () => {
  const binding = coordination.GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, { base: binding.baseSha, headRef: 'codex/gh08-gate-jest-separation-r02' }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-08 separation rejects a missing path', () => {
  const binding = coordination.GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01;
  const changes = binding.changedPaths.slice(1).map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, { base: binding.baseSha, headRef: binding.headRef }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-08 separation rejects an added path (hasExactModifiedPathSet is M-only)', () => {
  const binding = coordination.GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01;
  const changes = binding.changedPaths.map((repoPath, index) => ({
    status: index === 0 ? 'A' : 'M',
    path: repoPath,
  }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, { base: binding.baseSha, headRef: binding.headRef }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-08 separation pins ci.yml by blob sha and leaves earlier records untouched', () => {
  const gh08 = coordination.GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01;
  const gh03 = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  const cutover = coordination.GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01;
  assert.equal(gh08.targetPath, '.github/workflows/ci.yml');
  assert.match(gh08.expectedTargetBlobSha, /^[0-9a-f]{40}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(gh08, 'canonicalMergeSha'), false);
  // A new binding never rewrites an older one.
  assert.equal(gh03.expectedTargetBlobSha, '2d75a88c5ef9bc466c609029985ffa700982cbe1');
  assert.notEqual(gh08.expectedTargetBlobSha, gh03.expectedTargetBlobSha);
  assert.notEqual(gh08.expectedTargetBlobSha, cutover.expectedTargetBlobSha);
});

test('GH-05/GH-06 cutover requires exact base, head ref, and five modified paths', () => {
  const binding = coordination.GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  const result = coordination.classifyPrChangeSet(changes, {
    base: binding.baseSha,
    headRef: binding.headRef,
  });
  assert.equal(result.mode, binding.mode);
  assert.equal(result.taskId, binding.taskId);
});

test('GH-05/GH-06 cutover rejects the wrong base', () => {
  const binding = coordination.GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, {
      base: '0'.repeat(40),
      headRef: binding.headRef,
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-05/GH-06 cutover rejects the wrong head ref', () => {
  const binding = coordination.GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01;
  const changes = binding.changedPaths.map((repoPath) => ({ status: 'M', path: repoPath }));
  expectCode(
    () => coordination.classifyPrChangeSet(changes, {
      base: binding.baseSha,
      headRef: 'codex/gh05-gh06-ci-cutover-r02',
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('GH-05/GH-06 cutover rejects a missing path', () => {
  const binding = coordination.GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01;
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

test('GH-05/GH-06 cutover pins ci.yml by blob sha and leaves GH-03 untouched', () => {
  const cutover = coordination.GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01;
  const gh03 = coordination.GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  assert.equal(cutover.targetPath, '.github/workflows/ci.yml');
  assert.match(cutover.expectedTargetBlobSha, /^[0-9a-f]{40}$/);
  assert.equal(
    Object.prototype.hasOwnProperty.call(cutover, 'canonicalMergeSha'),
    false,
  );
  // The predecessor record must keep its own pin: a new binding never rewrites an old one.
  assert.equal(gh03.expectedTargetBlobSha, '2d75a88c5ef9bc466c609029985ffa700982cbe1');
  assert.notEqual(cutover.expectedTargetBlobSha, gh03.expectedTargetBlobSha);
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

test('root-authority Stage 1 accepts only the revised pinned base and exact binding', () => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const classification = coordination.classifyPrChangeSet(
    rootAuthorityStage1Changes(),
    {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  );
  assert.deepEqual(classification, {
    mode: binding.bindingPr.mode,
    taskId: binding.bindingPr.taskId,
  });
  assert.deepEqual(
    coordination.classifyPrChangeSet(rootAuthorityStage1Changes(), {
      base: 'f307990c3f6552e16df57626e6ceb2fd4ca4b433',
      headRef: binding.bindingPr.headRef,
      cwd: REPO_ROOT,
    }),
    classification,
  );

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rootAuthorityContractContent(),
  );
  const result = coordination.validateRootAuthorityBootstrapBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: rootAuthorityStage1Changes(),
    taskId: binding.bindingPr.taskId,
    mode: binding.bindingPr.mode,
    cwd: fixture.root,
  });
  assert.deepEqual(result, classification);
});

test('root-authority Stage 1 rejects the superseded and any other base', () => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  for (const base of [
    '8738bfcde7d962dda7729fc92ff1dfb929881f33',
    '9c0781fd5aaea3939af75d1189c6134c366f9f0a',
    'd'.repeat(40),
  ]) {
    expectCode(
      () =>
        coordination.classifyPrChangeSet(rootAuthorityStage1Changes(), {
          base,
          headRef: binding.bindingPr.headRef,
        }),
      'ROOT_BOOTSTRAP_STAGE1_BASE_MISMATCH',
    );
  }
});

test('root-authority Stage 1 rejects branch, every path omission, status drift and expansion', () => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  expectCode(
    () =>
      coordination.classifyPrChangeSet(rootAuthorityStage1Changes(), {
        base: binding.bindingPr.baseSha,
        headRef: `${binding.bindingPr.headRef}-copy`,
      }),
    'ROOT_BOOTSTRAP_STAGE1_BRANCH_MISMATCH',
  );

  const valid = rootAuthorityStage1Changes();
  for (let index = 0; index < valid.length; index += 1) {
    expectCode(
      () =>
        coordination.classifyPrChangeSet(
          valid.filter((_, candidate) => candidate !== index),
          {
            base: binding.bindingPr.baseSha,
            headRef: binding.bindingPr.headRef,
          },
        ),
      'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
    );
    const wrongStatus = rootAuthorityStage1Changes();
    wrongStatus[index] = { ...wrongStatus[index], status: 'A' };
    expectCode(
      () =>
        coordination.classifyPrChangeSet(wrongStatus, {
          base: binding.bindingPr.baseSha,
          headRef: binding.bindingPr.headRef,
        }),
      'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
    );
  }
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [
          ...valid,
          { status: 'M', path: 'project/docs/governance/decision-log.md' },
        ],
        {
          base: binding.bindingPr.baseSha,
          headRef: binding.bindingPr.headRef,
        },
      ),
    'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
  );
});

test('root-authority Stage 1 rejects wrong identities and inactive or duplicate mode state', () => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rootAuthorityContractContent(),
  );
  const valid = {
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: rootAuthorityStage1Changes(),
    taskId: binding.bindingPr.taskId,
    mode: binding.bindingPr.mode,
    cwd: fixture.root,
  };
  for (const [override, code] of [
    [{ protocolModeId: 'WRONG_MODE' }, 'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH'],
    [{ programId: 'WRONG_PROGRAM' }, 'ROOT_BOOTSTRAP_TARGET_MISMATCH'],
    [{ targetTaskId: 'WRONG_TARGET' }, 'ROOT_BOOTSTRAP_TARGET_MISMATCH'],
    [{ taskId: 'WRONG_STAGE1_TASK' }, 'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH'],
    [{ mode: 'WRONG_STAGE1_MODE' }, 'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH'],
    [{ activeModeCount: 2 }, 'ROOT_BOOTSTRAP_DUPLICATE_ACTIVE_MODE'],
    [{ bootstrapState: 'CONSUMED' }, 'ROOT_BOOTSTRAP_MODE_CONSUMED'],
    [{ bootstrapState: 'REVOKED' }, 'ROOT_BOOTSTRAP_GRANT_INACTIVE'],
    [{ bootstrapState: 'EXPIRED' }, 'ROOT_BOOTSTRAP_GRANT_INACTIVE'],
  ]) {
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validateRootAuthorityBootstrapBindingScope({
          ...valid,
          ...override,
        }),
      code,
    );
  }
});

test('root-authority Stage 1 contract rejects global reusable or audit authority drift', () => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  for (const forbiddenControl of [
    'globalAuthority : PROHIBITED',
    'reusableAuthority : PROHIBITED',
    'auditAsAuthority : PROHIBITED',
  ]) {
    const fixture = createAuthorityGitFixture(
      binding.contractPath,
      rootAuthorityContractContent().replace(forbiddenControl, ''),
    );
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validateRootAuthorityBootstrapBindingScope({
          base: binding.bindingPr.baseSha,
          head: fixture.head,
          headRef: binding.bindingPr.headRef,
          changes: rootAuthorityStage1Changes(),
          taskId: binding.bindingPr.taskId,
          mode: binding.bindingPr.mode,
          cwd: fixture.root,
        }),
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    );
  }
});

test('root-authority Stage 2 prospective tuple is exact and authority references are distinct', () => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const classification = coordination.classifyPrChangeSet(
    rootAuthorityStage2Changes(),
    { headRef: binding.targetPr.headRef },
  );
  assert.deepEqual(classification, {
    mode: binding.targetPr.mode,
    taskId: binding.targetPr.taskId,
  });
  coordination.validateRootAuthorityReferencePair(
    binding.targetPr.semanticAuthority,
    binding.targetPr.executionGrant,
  );
  assert.notEqual(
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  );

  expectCode(
    () =>
      coordination.classifyPrChangeSet(rootAuthorityStage2Changes(), {
        headRef: `${binding.targetPr.headRef}-copy`,
      }),
    'ROOT_BOOTSTRAP_STAGE2_BRANCH_MISMATCH',
  );
  for (let index = 0; index < rootAuthorityStage2Changes().length; index += 1) {
    const wrongStatus = rootAuthorityStage2Changes();
    wrongStatus[index] = {
      ...wrongStatus[index],
      status: wrongStatus[index].status === 'M' ? 'A' : 'M',
    };
    expectCode(
      () =>
        coordination.classifyPrChangeSet(wrongStatus, {
          headRef: binding.targetPr.headRef,
        }),
      'ROOT_BOOTSTRAP_STAGE2_SCOPE_MISMATCH',
    );
  }

  expectCode(
    () =>
      coordination.validateRootAuthorityReferencePair(
        binding.targetPr.semanticAuthority,
        {
          ...binding.targetPr.executionGrant,
          recordId: binding.targetPr.semanticAuthority.recordId,
        },
      ),
    'AUTHORITY_REFERENCE_COLLISION',
  );
  expectCode(
    () =>
      coordination.validateRootAuthorityReferencePair(
        {
          ...binding.targetPr.semanticAuthority,
          path: 'project/docs/governance/root-authority-bootstrap-design-r01/decision-log.md',
        },
        binding.targetPr.executionGrant,
      ),
    'ROOT_BOOTSTRAP_AUTHORITY_PATH_INVALID',
  );
});

test('root-authority Stage 2 accepts valid canonical task-bound reconciliation', (t) => {
  const fixture = createRootStage2ReconciliationFixture(t);
  const result = coordination.validateRootStage2BaseReadiness({
    base: fixture.base,
    cwd: fixture.root,
    writerGate: 'PASS',
  });
  assert.equal(result.status, 'ROOT_BOOTSTRAP_STAGE2_BASE_RECONCILED');
  assert.equal(
    result.recordId,
    'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE2-BASE-RECONCILIATION-R01',
  );
});

test('root-authority Stage 2 validator reconciliation PR is exact-base branch and scope bound', () => {
  const reconciliation =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01;
  assert.deepEqual(
    coordination.classifyPrChangeSet(rootStage2ValidatorReconciliationChanges(), {
      base: reconciliation.baseSha,
      headRef: reconciliation.headRef,
    }),
    { mode: reconciliation.mode, taskId: reconciliation.taskId },
  );
  expectCode(
    () =>
      coordination.classifyPrChangeSet(rootStage2ValidatorReconciliationChanges(), {
        base: reconciliation.baseSha,
        headRef: `${reconciliation.headRef}-copy`,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('root-authority Stage 2 exact blob equality remains the primary pass path', (t) => {
  const fixture = createRootAuthorityStage2GitFixture(t);
  const result = coordination.validateRootStage2BaseReadiness({
    base: fixture.base,
    cwd: fixture.root,
    writerGate: 'PASS',
  });
  assert.equal(result.status, 'ROOT_BOOTSTRAP_STAGE2_BASE_EXACT');
});

test('root-authority Stage 2 rejects blob drift without reconciliation', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { omitRecord: true },
    'ROOT_BOOTSTRAP_STAGE2_BASE_INVALIDATED',
  );
});

test('root-authority Stage 2 rejects wrong target task reconciliation', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { targetTaskId: 'ANOTHER-TASK' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 rejects wrong bootstrap mode reconciliation', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { bootstrapModeId: 'ANOTHER-MODE' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 rejects wrong Stage 1 merge SHA reconciliation', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { stage1MergeSha: 'a'.repeat(40) } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 rejects non-ancestor reconciliation provenance', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { nonAncestor: true },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_PROVENANCE_INVALID',
    { recordOnly: true },
  );
});

test('root-authority Stage 2 rejects weakened security reconciliation', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { securityInvariants: 'WEAKENED' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_SECURITY_REJECTED',
  );
});

test('root-authority Stage 2 rejects contract code test inconsistency', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { contractCodeTestConsistency: 'FAIL' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 rejects failed Stage 2 binding reconciliation', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { stage2Binding: { status: 'FAIL' } } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_SECURITY_REJECTED',
  );
});

test('root-authority Stage 2 rejects failed current writer gate', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    {},
    'ROOT_BOOTSTRAP_STAGE2_COMPETING_WRITER',
    { writerGate: 'FAIL' },
  );
});

test('root-authority Stage 2 rejects authority-record conflict', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { authorityRecordConflict: 'FOUND' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 rejects resolver ambiguity', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { resolverAmbiguity: 'FOUND' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 rejects stale post-reconciliation protected blobs', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { stalePath: 'project/scripts/governance-coordination.cjs' },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_STALE',
  );
});

test('root-authority Stage 2 rejects duplicate reconciliation records', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { duplicateRecord: true },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_CONFLICT',
  );
});

test('root-authority Stage 2 rejects conflicting reconciliation records', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { conflictingRecord: true },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_CONFLICT',
  );
});

test('root-authority Stage 2 rejects cross-task reconciliation reuse', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { materializationTaskId: 'ANOTHER-RECONCILIATION-TASK' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority existing bootstrap mode classification remains unchanged', () => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  assert.deepEqual(
    coordination.classifyPrChangeSet(rootAuthorityStage1Changes(), {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    }),
    { mode: binding.bindingPr.mode, taskId: binding.bindingPr.taskId },
  );
  assert.deepEqual(
    coordination.classifyPrChangeSet(rootAuthorityStage2Changes(), {
      headRef: binding.targetPr.headRef,
    }),
    { mode: binding.targetPr.mode, taskId: binding.targetPr.taskId },
  );
});

test('root-authority existing exact-byte validator result is deterministic', (t) => {
  const fixture = createRootAuthorityStage2GitFixture(t);
  const options = { base: fixture.base, cwd: fixture.root, writerGate: 'PASS' };
  assert.deepEqual(
    coordination.validateRootStage2BaseReadiness(options),
    coordination.validateRootStage2BaseReadiness(options),
  );
});

test('root-authority reconciled validator result is deterministic', (t) => {
  const fixture = createRootStage2ReconciliationFixture(t);
  const options = { base: fixture.base, cwd: fixture.root, writerGate: 'PASS' };
  assert.deepEqual(
    coordination.validateRootStage2BaseReadiness(options),
    coordination.validateRootStage2BaseReadiness(options),
  );
});

test('root-authority Stage 2 rejects corrupt reconciliation JSON', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { rawRecord: '{' },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_INVALID',
  );
});

test('root-authority Stage 2 rejects wrong program reconciliation', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { programId: 'ANOTHER-PROGRAM' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 rejects disallowed drift classification', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { driftClassification: 'CONTRACT_DRIFT_REQUIRES_REBINDING' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_SECURITY_REJECTED',
  );
});

test('root-authority Stage 2 rejects Markdown-only reconciliation authority', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { rawRecord: '# reconciliation\nstatus: PASS\n' },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_INVALID',
  );
});

test('root-authority Stage 2 rejects chat text as reconciliation authority', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { rawRecord: 'owner said this is reconciled' },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_INVALID',
  );
});

test('root-authority Stage 2 rejects audit-only reconciliation record', (t) => {
  expectRootStage2ReconciliationCode(
    t,
    { recordOverrides: { documentRole: 'RECONCILIATION_EVIDENCE_NON_AUTHORITY' } },
    'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
  );
});

test('root-authority Stage 2 prospective validator resolves canonical predecessor and exact records', (t) => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  for (const freshMain of [false, true]) {
    const fixture = createRootAuthorityStage2GitFixture(t, { freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.deepEqual(result, {
      mode: binding.targetPr.mode,
      taskId: binding.targetPr.taskId,
    });
  }
});

test('root-authority Stage 2 accepts two valid SA records with shared common fields', (t) => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createRootAuthorityStage2GitFixture(t, {
    existingSemanticRecord: true,
  });
  assert.deepEqual(
    coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    }),
    { mode: binding.targetPr.mode, taskId: binding.targetPr.taskId },
  );
});

test('root-authority Stage 2 exact marker selects only its target SA record block', (t) => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createRootAuthorityStage2GitFixture(t, {
    existingSemanticRecord: true,
  });
  const result = coordination.validatePrScope({
    base: fixture.base,
    head: fixture.head,
    headRef: binding.targetPr.headRef,
    cwd: fixture.root,
  });
  assert.equal(result.taskId, binding.targetPr.taskId);
});

test('root-authority Stage 2 rejects duplicate or missing fields inside the target SA block', (t) => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  for (const [fixtureOptions, code] of [
    [
      { duplicateSemanticField: 'ownerName' },
      'ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH',
    ],
    [
      { missingSemanticField: 'ownerName' },
      'ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH',
    ],
    [
      { existingSemanticRecord: true, missingSemanticField: 'ownerName' },
      'ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH',
    ],
  ]) {
    const fixture = createRootAuthorityStage2GitFixture(t, fixtureOptions);
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      code,
    );
  }
});

test('root-authority Stage 2 rejects missing duplicate or wrong target SA markers and values', (t) => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  for (const fixtureOptions of [
    { missingSemanticMarker: true },
    { duplicateSemanticMarker: true },
    { wrongSemanticField: { field: 'decision', value: 'REJECTED' } },
  ]) {
    const fixture = createRootAuthorityStage2GitFixture(t, fixtureOptions);
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      'ROOT_BOOTSTRAP_SA_RECORD_INVALID',
    );
  }
});

test('root-authority Stage 2 rejects wrong task mode record identity owner target and binding', (t) => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const contentCases = [
    [{ semanticRecordId: 'WRONG-SA' }, 'ROOT_BOOTSTRAP_SA_RECORD_INVALID'],
    [{ executionRecordId: 'WRONG-EG' }, 'ROOT_BOOTSTRAP_EG_RECORD_INVALID'],
    [{ duplicateSemanticMarker: true }, 'ROOT_BOOTSTRAP_SA_RECORD_INVALID'],
    [{ duplicateExecutionMarker: true }, 'ROOT_BOOTSTRAP_EG_RECORD_INVALID'],
    [{ ownerName: 'Wrong Owner' }, 'ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH'],
    [{ ownerRole: 'Wrong Role' }, 'ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH'],
    [{ programId: 'WRONG-PROGRAM' }, 'ROOT_BOOTSTRAP_TARGET_MISMATCH'],
    [{ targetTaskId: 'WRONG-TARGET' }, 'ROOT_BOOTSTRAP_TARGET_MISMATCH'],
    [
      { semanticBindingRecordId: 'ANOTHER-SA' },
      'ROOT_BOOTSTRAP_EG_RECORD_INVALID',
    ],
  ];
  for (const [fixtureOptions, code] of contentCases) {
    const fixture = createRootAuthorityStage2GitFixture(t, fixtureOptions);
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      code,
    );
  }

  const fixture = createRootAuthorityStage2GitFixture(t);
  for (const override of [{ taskId: 'WRONG-TASK' }, { mode: 'WRONG-MODE' }]) {
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validateRootAuthorityBootstrapMaterializationScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          changes: rootAuthorityStage2Changes(),
          taskId: binding.targetPr.taskId,
          mode: binding.targetPr.mode,
          cwd: fixture.root,
          ...override,
        }),
      'ROOT_BOOTSTRAP_TARGET_MISMATCH',
    );
  }
});

test('root-authority Stage 2 rejects missing or changed predecessor, wrong base pin and consumed reuse', (t) => {
  const binding =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  for (const [fixtureOptions, code] of [
    [{ missingPredecessor: true }, 'ROOT_BOOTSTRAP_PREDECESSOR_MISSING'],
    [
      { driftPath: 'project/scripts/governance-coordination.cjs' },
      'ROOT_BOOTSTRAP_STAGE2_BASE_INVALIDATED',
    ],
    [{ stage1PredecessorSha: 'a'.repeat(40) }, 'ROOT_BOOTSTRAP_PREDECESSOR_MISMATCH'],
    [{ stage2BaseSha: 'b'.repeat(40) }, 'ROOT_BOOTSTRAP_STAGE2_BASE_INVALIDATED'],
    [{ consumedAtBase: true }, 'ROOT_BOOTSTRAP_MODE_CONSUMED'],
  ]) {
    const fixture = createRootAuthorityStage2GitFixture(t, fixtureOptions);
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      code,
    );
  }
});

test('root-authority classifier is deterministic and existing bootstrap modes remain unchanged', () => {
  const root =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const first = coordination.classifyPrChangeSet(rootAuthorityStage1Changes(), {
    base: root.bindingPr.baseSha,
    headRef: root.bindingPr.headRef,
  });
  const second = coordination.classifyPrChangeSet(rootAuthorityStage1Changes(), {
    base: root.bindingPr.baseSha,
    headRef: root.bindingPr.headRef,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(
    coordination.classifyPrChangeSet(
      [{ status: 'M', path: 'project/apps/api/src/app.module.ts' }],
      {
        base: root.bindingPr.baseSha,
        headRef: 'codex/unrelated-production-change',
      },
    ),
    { mode: 'NON_COORDINATION_PR' },
  );

  for (const [binding, changes] of [
    [
      coordination.RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
      rcvColBindingChanges(),
    ],
    [
      coordination.RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
      hcr08BindingChanges(),
    ],
    [
      coordination.RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
      pb01BindingChanges(),
    ],
    [
      coordination.RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
      kc01AuthorityBindingChanges(),
    ],
    [
      coordination.RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
      tr01AuthorityBindingChanges(),
    ],
    [
      coordination.RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
      kc01Tr01OwnershipAuthorityBindingChanges(),
    ],
  ]) {
    assert.deepEqual(
      coordination.classifyPrChangeSet(changes, {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
      }),
      { mode: binding.bindingPr.mode, taskId: binding.taskId },
    );
  }
});

function legalBasisContentBootstrapBinding() {
  return coordination.RECEIVABLE_LEGAL_BASIS_CONTENT_RATIFICATION_ROOT_AUTHORITY_BOOTSTRAP_R01;
}

function legalBasisContentStage1Changes() {
  return legalBasisContentBootstrapBinding().bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

function legalBasisContentStage2Changes() {
  return legalBasisContentBootstrapBinding().targetPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

test('Legal Basis content-ratification Stage 1 accepts only its exact active tuple', () => {
  const binding = legalBasisContentBootstrapBinding();
  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rootAuthorityContractContent(binding),
  );
  const options = {
    binding,
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: legalBasisContentStage1Changes(),
    taskId: binding.bindingPr.taskId,
    mode: binding.bindingPr.mode,
    protocolModeId: binding.protocolModeId,
    programId: binding.programId,
    targetTaskId: binding.targetTaskId,
    nowUtc: '2026-07-30T17:59:59Z',
    cwd: fixture.root,
  };
  const expected = {
    mode: binding.bindingPr.mode,
    taskId: binding.bindingPr.taskId,
  };
  assert.deepEqual(
    coordination.classifyPrChangeSet(legalBasisContentStage1Changes(), {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    }),
    expected,
  );
  assert.deepEqual(
    coordination.validateRootAuthorityBootstrapBindingScope(options),
    expected,
  );
});

test('Legal Basis content-ratification Stage 1 fails closed on tuple scope and state drift', () => {
  const binding = legalBasisContentBootstrapBinding();
  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rootAuthorityContractContent(binding),
  );
  const valid = {
    binding,
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: legalBasisContentStage1Changes(),
    taskId: binding.bindingPr.taskId,
    mode: binding.bindingPr.mode,
    nowUtc: '2026-07-30T17:59:59Z',
    cwd: fixture.root,
  };
  for (const [override, code] of [
    [{ base: 'a'.repeat(40) }, 'ROOT_BOOTSTRAP_STAGE1_BASE_MISMATCH'],
    [
      { headRef: `${binding.bindingPr.headRef}-copy` },
      'ROOT_BOOTSTRAP_STAGE1_BRANCH_MISMATCH',
    ],
    [{ taskId: 'WRONG-TASK' }, 'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH'],
    [{ mode: 'WRONG-MODE' }, 'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH'],
    [{ programId: 'WRONG-PROGRAM' }, 'ROOT_BOOTSTRAP_TARGET_MISMATCH'],
    [{ targetTaskId: 'WRONG-TARGET' }, 'ROOT_BOOTSTRAP_TARGET_MISMATCH'],
    [{ activeModeCount: 2 }, 'ROOT_BOOTSTRAP_DUPLICATE_ACTIVE_MODE'],
    [{ bootstrapState: 'CONSUMED' }, 'ROOT_BOOTSTRAP_MODE_CONSUMED'],
    [{ nowUtc: binding.expiresAt }, 'ROOT_BOOTSTRAP_GRANT_INACTIVE'],
  ]) {
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validateRootAuthorityBootstrapBindingScope({
          ...valid,
          ...override,
        }),
      code,
    );
  }

  const validChanges = legalBasisContentStage1Changes();
  for (let index = 0; index < validChanges.length; index += 1) {
    const omitted = validChanges.filter((_, candidate) => candidate !== index);
    expectCode(
      () =>
        coordination.classifyPrChangeSet(omitted, {
          base: binding.bindingPr.baseSha,
          headRef: binding.bindingPr.headRef,
        }),
      'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
    );
    const wrongStatus = legalBasisContentStage1Changes();
    wrongStatus[index] = { ...wrongStatus[index], status: 'A' };
    expectCode(
      () =>
        coordination.classifyPrChangeSet(wrongStatus, {
          base: binding.bindingPr.baseSha,
          headRef: binding.bindingPr.headRef,
        }),
      'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
    );
  }
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [
          ...validChanges,
          { status: 'M', path: 'project/docs/governance/decision-log.md' },
        ],
        {
          base: binding.bindingPr.baseSha,
          headRef: binding.bindingPr.headRef,
        },
      ),
    'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
  );
});

test('Legal Basis content-ratification binding rejects any authority literal drift', () => {
  const binding = legalBasisContentBootstrapBinding();
  for (const literal of [
    binding.expiresAt,
    binding.design.mergeSha,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
    binding.decisionPack.sha256,
    binding.legalDomainOfficer.ratifierCode,
    binding.finalRatifier.ratifierCode,
    binding.ratificationEffectiveAtUtc,
    binding.model.id,
    ...binding.model.subtypes,
    'publicationBasePolicy : OWNER_PINNED_EXACT_ONLY',
    'globalAuthority : PROHIBITED',
    'reusableAuthority : PROHIBITED',
    'auditAsAuthority : PROHIBITED',
  ]) {
    const fixture = createAuthorityGitFixture(
      binding.contractPath,
      rootAuthorityContractContent(binding).replace(literal, 'DRIFTED'),
    );
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validateRootAuthorityBootstrapBindingScope({
          binding,
          base: binding.bindingPr.baseSha,
          head: fixture.head,
          headRef: binding.bindingPr.headRef,
          changes: legalBasisContentStage1Changes(),
          taskId: binding.bindingPr.taskId,
          mode: binding.bindingPr.mode,
          nowUtc: '2026-07-30T17:59:59Z',
          cwd: fixture.root,
        }),
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
    );
  }
});

test('Legal Basis content-ratification Stage 2 tuple is pinned but remains predecessor-gated', (t) => {
  const binding = legalBasisContentBootstrapBinding();
  assert.deepEqual(
    coordination.classifyPrChangeSet(legalBasisContentStage2Changes(), {
      headRef: binding.targetPr.headRef,
    }),
    { mode: binding.targetPr.mode, taskId: binding.targetPr.taskId },
  );
  coordination.validateRootAuthorityReferencePair(
    binding.targetPr.semanticAuthority,
    binding.targetPr.executionGrant,
    binding.targetPr,
  );
  assert.notEqual(
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  );

  expectCode(
    () =>
      coordination.classifyPrChangeSet(legalBasisContentStage2Changes(), {
        headRef: `${binding.targetPr.headRef}-copy`,
      }),
    'ROOT_BOOTSTRAP_STAGE2_BRANCH_MISMATCH',
  );
  const validChanges = legalBasisContentStage2Changes();
  for (let index = 0; index < validChanges.length; index += 1) {
    expectCode(
      () =>
        coordination.classifyPrChangeSet(
          validChanges.filter((_, candidate) => candidate !== index),
          { headRef: binding.targetPr.headRef },
        ),
      'ROOT_BOOTSTRAP_STAGE2_SCOPE_MISMATCH',
    );
    const wrongStatus = legalBasisContentStage2Changes();
    wrongStatus[index] = {
      ...wrongStatus[index],
      status: wrongStatus[index].status === 'M' ? 'A' : 'M',
    };
    expectCode(
      () =>
        coordination.classifyPrChangeSet(wrongStatus, {
          headRef: binding.targetPr.headRef,
        }),
      'ROOT_BOOTSTRAP_STAGE2_SCOPE_MISMATCH',
    );
  }
  expectCode(
    () =>
      coordination.classifyPrChangeSet(
        [
          ...validChanges,
          {
            status: 'M',
            path: 'project/docs/governance/canonicalization-register.md',
          },
        ],
        { headRef: binding.targetPr.headRef },
      ),
    'ROOT_BOOTSTRAP_STAGE2_SCOPE_MISMATCH',
  );
  expectCode(
    () =>
      coordination.validateRootAuthorityReferencePair(
        binding.targetPr.semanticAuthority,
        {
          ...binding.targetPr.executionGrant,
          path: binding.targetPr.semanticAuthority.path,
          recordId: binding.targetPr.semanticAuthority.recordId,
        },
        binding.targetPr,
      ),
    'AUTHORITY_REFERENCE_COLLISION',
  );
  expectCode(
    () =>
      coordination.validateRootAuthorityReferencePair(
        {
          ...binding.targetPr.semanticAuthority,
          recordId: 'WRONG-SA',
        },
        binding.targetPr.executionGrant,
        binding.targetPr,
      ),
    'ROOT_BOOTSTRAP_AUTHORITY_PATH_INVALID',
  );
  expectCode(
    () =>
      coordination.validateRootAuthorityReferencePair(
        binding.targetPr.semanticAuthority,
        {
          ...binding.targetPr.executionGrant,
          recordId: 'WRONG-EG',
        },
        binding.targetPr,
      ),
    'ROOT_BOOTSTRAP_AUTHORITY_PATH_INVALID',
  );

  const fixture = createRootAuthorityStage2GitFixture(t, {
    binding,
    missingPredecessor: true,
  });
  expectFixtureCodeUnchanged(
    fixture,
    () =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.targetPr.headRef,
        cwd: fixture.root,
      }),
    'ROOT_BOOTSTRAP_PREDECESSOR_MISSING',
  );
});

function legalBasisContentFreshRebinding() {
  return coordination.RECEIVABLE_LEGAL_BASIS_CONTENT_RATIFICATION_FRESH_REBINDING_R02;
}

function legalBasisContentFreshRebindingChanges() {
  return legalBasisContentFreshRebinding().bindingPr.changedPaths.map(
    ({ status, path: repoPath }) => ({ status, path: repoPath }),
  );
}

test('Legal Basis content-ratification fresh Stage 1 R02 binds the captured exact base and preserves the historical predecessor', () => {
  const binding = legalBasisContentFreshRebinding();
  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rootAuthorityContractContent(binding),
  );
  const expected = {
    mode: binding.bindingPr.mode,
    taskId: binding.bindingPr.taskId,
  };
  assert.deepEqual(
    coordination.classifyPrChangeSet(legalBasisContentFreshRebindingChanges(), {
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    }),
    expected,
  );
  assert.deepEqual(
    coordination.validateRootAuthorityBootstrapBindingScope({
      binding,
      base: binding.bindingPr.baseSha,
      head: fixture.head,
      headRef: binding.bindingPr.headRef,
      changes: legalBasisContentFreshRebindingChanges(),
      taskId: binding.bindingPr.taskId,
      mode: binding.bindingPr.mode,
      cwd: fixture.root,
    }),
    expected,
  );
  assert.equal(
    runFixtureGit(
      [
        'merge-base',
        '--is-ancestor',
        binding.historicalPredecessor.mergeSha,
        binding.bindingPr.baseSha,
      ],
      REPO_ROOT,
    ),
    '',
  );
});

test('Legal Basis content-ratification fresh Stage 1 R02 rejects stale base wrong branch wrong task and scope drift', () => {
  const binding = legalBasisContentFreshRebinding();
  const changes = legalBasisContentFreshRebindingChanges();
  for (const [options, code] of [
    [
      { base: '0'.repeat(40), headRef: binding.bindingPr.headRef, changes },
      'ROOT_BOOTSTRAP_STAGE1_BASE_MISMATCH',
    ],
    [
      {
        base: binding.bindingPr.baseSha,
        headRef: `${binding.bindingPr.headRef}-copy`,
        changes,
      },
      'ROOT_BOOTSTRAP_STAGE1_BRANCH_MISMATCH',
    ],
    [
      {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
        changes: changes.slice(1),
      },
      'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
    ],
    [
      {
        base: binding.bindingPr.baseSha,
        headRef: binding.bindingPr.headRef,
        changes: [...changes, { status: 'M', path: 'project/docs/governance/decision-log.md' }],
      },
      'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
    ],
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(options.changes, options),
      code,
    );
  }

  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    rootAuthorityContractContent(binding),
  );
  expectFixtureCodeUnchanged(
    fixture,
    () =>
      coordination.validateRootAuthorityBootstrapBindingScope({
        binding,
        base: binding.bindingPr.baseSha,
        head: fixture.head,
        headRef: binding.bindingPr.headRef,
        changes,
        taskId: 'WRONG-TASK',
        mode: binding.bindingPr.mode,
        cwd: fixture.root,
      }),
    'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH',
  );
});

test('Legal Basis content-ratification Stage 2 validates against fresh R02 and rejects malformed or repeated materialization', (t) => {
  const binding = legalBasisContentFreshRebinding();
  const valid = createRootAuthorityStage2GitFixture(t, { binding });
  const result = coordination.validatePrScope({
    base: valid.base,
    head: valid.head,
    headRef: binding.targetPr.headRef,
    cwd: valid.root,
  });
  assert.equal(result.mode, binding.targetPr.mode);
  assert.equal(result.taskId, binding.targetPr.taskId);

  for (const [fixtureOptions, code] of [
    [{ binding, semanticRecordId: 'WRONG-SA' }, 'ROOT_BOOTSTRAP_SA_RECORD_INVALID'],
    [{ binding, executionRecordId: 'WRONG-EG' }, 'ROOT_BOOTSTRAP_EG_RECORD_INVALID'],
    [{ binding, stage2BaseSha: '0'.repeat(40) }, 'ROOT_BOOTSTRAP_STAGE2_BASE_INVALIDATED'],
    [{ binding, consumedAtBase: true }, 'ROOT_BOOTSTRAP_MODE_CONSUMED'],
  ]) {
    const fixture = createRootAuthorityStage2GitFixture(t, fixtureOptions);
    expectFixtureCodeUnchanged(
      fixture,
      () =>
        coordination.validatePrScope({
          base: fixture.base,
          head: fixture.head,
          headRef: binding.targetPr.headRef,
          cwd: fixture.root,
        }),
      code,
    );
  }
});

test('OFFICE authority binding classifier accepts only the exact Stage 1 tuple', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const result = coordination.classifyPrChangeSet(officeAuthorityBindingChanges(), {
    base: binding.bindingPr.baseSha,
    headRef: binding.bindingPr.headRef,
  });
  assert.deepEqual(result, {
    mode: binding.bindingPr.mode,
    taskId: binding.bindingPr.taskId,
  });
});

test('OFFICE authority binding validator requires exact contract content', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    fs.readFileSync(fixturePath(REPO_ROOT, binding.contractPath), 'utf8'),
  );
  const result = coordination.validateOfficeAuthorityBootstrapBindingScope({
    base: binding.bindingPr.baseSha,
    head: fixture.head,
    headRef: binding.bindingPr.headRef,
    changes: officeAuthorityBindingChanges(),
    taskId: binding.bindingPr.taskId,
    mode: binding.bindingPr.mode,
    cwd: fixture.root,
  });
  assert.equal(result.mode, binding.bindingPr.mode);
});

test('OFFICE authority binding rejects wrong base branch omission status and expansion', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const exact = officeAuthorityBindingChanges();
  const cases = [
    { changes: exact, base: '0'.repeat(40), headRef: binding.bindingPr.headRef },
    { changes: exact, base: binding.bindingPr.baseSha, headRef: `${binding.bindingPr.headRef}-copy` },
    { changes: exact.slice(1), base: binding.bindingPr.baseSha, headRef: binding.bindingPr.headRef },
    {
      changes: exact.map((change, index) =>
        index === 0 ? { ...change, status: 'A' } : change,
      ),
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
    {
      changes: [...exact, { status: 'M', path: 'project/docs/governance/decision-log.md' }],
      base: binding.bindingPr.baseSha,
      headRef: binding.bindingPr.headRef,
    },
  ];
  for (const entry of cases) {
    expectCode(
      () => coordination.classifyPrChangeSet(entry.changes, entry),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('OFFICE authority binding accepts only unchanged protected-path descendants', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-coord-office-binding-base-'));
  const root = path.join(parent, 'repo');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  fs.mkdirSync(root);
  runFixtureGit(['init', '--quiet'], root);
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(
    ['config', 'user.email', 'governance-coordination@example.invalid'],
    root,
  );
  runFixtureGit(['fetch', '--quiet', '--no-tags', REPO_ROOT, binding.bindingPr.baseSha], root);
  runFixtureGit(['checkout', '--quiet', '-b', 'office-base', binding.bindingPr.baseSha], root);
  fs.writeFileSync(path.join(root, 'unrelated.md'), 'unrelated main advance\n', 'utf8');
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'unrelated main advance'], root);
  const unchangedDescendant = runFixtureGit(['rev-parse', 'HEAD'], root);
  const accepted = coordination.classifyPrChangeSet(officeAuthorityBindingChanges(), {
    base: unchangedDescendant,
    headRef: binding.bindingPr.headRef,
    cwd: root,
  });
  assert.equal(accepted.mode, binding.bindingPr.mode);

  const contractPath = fixturePath(root, binding.contractPath);
  fs.appendFileSync(contractPath, '\nprotected drift\n', 'utf8');
  runFixtureGit(['add', '--all'], root);
  runFixtureGit(['commit', '--quiet', '-m', 'protected binding drift'], root);
  const driftedDescendant = runFixtureGit(['rev-parse', 'HEAD'], root);
  expectCode(
    () => coordination.classifyPrChangeSet(officeAuthorityBindingChanges(), {
      base: driftedDescendant,
      headRef: binding.bindingPr.headRef,
      cwd: root,
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('OFFICE authority R02 exact classifier is deterministic', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const first = coordination.classifyPrChangeSet(officeAuthorityTargetChanges(), {
    base: '1'.repeat(40),
    headRef: binding.targetPr.headRef,
  });
  const second = coordination.classifyPrChangeSet(officeAuthorityTargetChanges(), {
    base: '2'.repeat(40),
    headRef: binding.targetPr.headRef,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    mode: binding.targetPr.mode,
    taskId: binding.targetPr.taskId,
  });
});

test('OFFICE bootstrap rejects a decision-log-only change', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  expectCode(
    () =>
      coordination.classifyPrChangeSet(officeAuthorityTargetChanges().slice(0, 1), {
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('OFFICE bootstrap rejects an execution-grant-only change', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  expectCode(
    () =>
      coordination.classifyPrChangeSet(officeAuthorityTargetChanges().slice(1), {
        headRef: binding.targetPr.headRef,
      }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('OFFICE bootstrap rejects a wrong execution-grant filename', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const changes = officeAuthorityTargetChanges();
  changes[1] = { status: 'A', path: 'project/docs/governance/coordination-execution-grants/OFFICE-WRONG-EG01.md' };
  expectCode(
    () => coordination.classifyPrChangeSet(changes, { headRef: binding.targetPr.headRef }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('OFFICE bootstrap rejects decision-log and grant status drift', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  for (const [index, status] of [[0, 'A'], [1, 'M']]) {
    const changes = officeAuthorityTargetChanges();
    changes[index] = { ...changes[index], status };
    expectCode(
      () => coordination.classifyPrChangeSet(changes, { headRef: binding.targetPr.headRef }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('OFFICE bootstrap rejects any third governance product schema or migration path', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  for (const repoPath of [
    'project/docs/governance/product-backlog.md',
    'project/apps/api/src/modules/office/office.service.ts',
    'project/apps/api/prisma/schema.prisma',
    'project/apps/api/prisma/migrations/20260730_wrong/migration.sql',
  ]) {
    const changes = [...officeAuthorityTargetChanges(), { status: 'M', path: repoPath }];
    expectCode(
      () => coordination.classifyPrChangeSet(changes, { headRef: binding.targetPr.headRef }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('OFFICE authority R02 exact fixture binds the actual canonical base', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  for (const freshMain of [false, true]) {
    const fixture = createOfficeAuthorityTargetGitFixture(t, { freshMain });
    const result = coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    });
    assert.equal(result.mode, binding.targetPr.mode);
    assert.equal(result.taskId, binding.targetPr.taskId);
  }
});

test('OFFICE authority R02 rejects a stale materialization base SHA', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    executionOverrides: { materializationBaseSha: '0'.repeat(40) },
  });
  expectCode(
    () =>
      coordination.validatePrScope({
        ...fixture,
        headRef: binding.targetPr.headRef,
        cwd: fixture.root,
      }),
    'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
  );
});

test('OFFICE bootstrap rejects a wrong SA marker or record ID', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    semanticMarkerRef: { recordId: 'OFFICE-SPRING-CLEANING-WRONG-SA01' },
    semanticOverrides: { recordId: 'OFFICE-SPRING-CLEANING-WRONG-SA01' },
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_AUTHORITY_CONFLICT',
  );
});

test('OFFICE bootstrap rejects a wrong EG marker or record ID', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    executionMarkerRef: { recordId: 'OFFICE-SPRING-CLEANING-WRONG-EG01' },
    executionOverrides: { recordId: 'OFFICE-SPRING-CLEANING-WRONG-EG01' },
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
  );
});

test('OFFICE bootstrap rejects wrong program and cross-program reuse', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    semanticOverrides: { programId: 'OTHER-PROGRAM-R01' },
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_SA_RECORD_INVALID',
  );
});

test('OFFICE bootstrap rejects wrong task and cross-task reuse', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    executionOverrides: { taskId: 'OFFICE-SPRING-CLEANING-OTHER-TASK-R01' },
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
  );
});

test('OFFICE bootstrap rejects wrong owner identity', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    executionOverrides: { ownerName: 'Another Owner' },
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
  );
});

test('OFFICE bootstrap rejects execution modes other than GO-COMPLETE', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    executionOverrides: { executionMode: 'GO-IMPLEMENT' },
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
  );
});

test('OFFICE bootstrap rejects SA and EG locator collision', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const execution = binding.targetPr.executionGrant;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    executionOverrides: {
      'semanticAuthorityRef.kind': execution.kind,
      'semanticAuthorityRef.path': execution.path,
      'semanticAuthorityRef.recordId': execution.recordId,
    },
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
  );
});

test('OFFICE bootstrap rejects duplicate SA marker and structured record', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  for (const options of [{ duplicateSemanticMarker: true }, { duplicateSemanticRecord: true }]) {
    const fixture = createOfficeAuthorityTargetGitFixture(t, options);
    expectCode(
      () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
      options.duplicateSemanticMarker
        ? 'OFFICE_BOOTSTRAP_AUTHORITY_CONFLICT'
        : 'OFFICE_BOOTSTRAP_SA_RECORD_INVALID',
    );
  }
});

test('OFFICE bootstrap rejects duplicate EG marker and structured record', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  for (const options of [{ duplicateExecutionMarker: true }, { duplicateExecutionRecord: true }]) {
    const fixture = createOfficeAuthorityTargetGitFixture(t, options);
    expectCode(
      () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
      'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
    );
  }
});

test('OFFICE bootstrap rejects another decision-log authority record', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const other = {
    kind: 'SEMANTIC_AUTHORITY',
    recordId: 'UNRELATED-AUTHORITY-R01',
  };
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    additionalDecisionAuthority:
      `${coordination.buildAuthorityMarker(other)}\n` +
      '```text\nrecordType : SEMANTIC_AUTHORITY\nrecordId : UNRELATED-AUTHORITY-R01\nprogramId : OTHER\ntaskId : OTHER\n```',
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'OFFICE_BOOTSTRAP_AUTHORITY_CONFLICT',
  );
});

test('OFFICE bootstrap rejects conflicting SA and EG records', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const conflictingSa = officeSemanticRecord(binding, {
    recordId: 'OFFICE-SPRING-CLEANING-RECONCILIATION-R01-SA02',
  });
  const conflictingEg = officeExecutionRecord(binding, {
    recordId: 'OFFICE-SPRING-CLEANING-RECONCILIATION-R01-EG02',
  });
  for (const options of [
    { additionalDecisionAuthority: conflictingSa },
    { additionalExecutionRecord: conflictingEg },
  ]) {
    const fixture = createOfficeAuthorityTargetGitFixture(t, options);
    expectCode(
      () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
      options.additionalDecisionAuthority
        ? 'OFFICE_BOOTSTRAP_AUTHORITY_CONFLICT'
        : 'OFFICE_BOOTSTRAP_AUTHORITY_CONFLICT',
    );
  }
});

test('OFFICE bootstrap rejects partial SA and EG records', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  for (const options of [
    { omitSemanticField: 'requiredChecksBinding' },
    { omitExecutionField: 'ledgerBypass' },
  ]) {
    const fixture = createOfficeAuthorityTargetGitFixture(t, options);
    expectCode(
      () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
      options.omitSemanticField
        ? 'OFFICE_BOOTSTRAP_SA_RECORD_INVALID'
        : 'OFFICE_BOOTSTRAP_EG_RECORD_INVALID',
    );
  }
});

test('OFFICE bootstrap second materialization is consumed and rejected', (t) => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  const fixture = createOfficeAuthorityTargetGitFixture(t, {
    baseAlreadyContainsAuthority: true,
  });
  expectCode(
    () => coordination.validatePrScope({ ...fixture, headRef: binding.targetPr.headRef, cwd: fixture.root }),
    'ROOT_BOOTSTRAP_MODE_CONSUMED',
  );
});

test('OFFICE bootstrap rejects an arbitrary PR that mimics the two paths', () => {
  const binding =
    coordination.OFFICE_SPRING_CLEANING_RECONCILIATION_R01_AUTHORITY_BOOTSTRAP_R01;
  expectCode(
    () => coordination.classifyPrChangeSet(officeAuthorityTargetChanges(), {
      headRef: `${binding.targetPr.headRef}-mimic`,
    }),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('existing root-authority bootstrap classification remains unchanged', () => {
  const existing =
    coordination.GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const result = coordination.classifyPrChangeSet(
    existing.bindingPr.changedPaths.map(({ status, path: repoPath }) => ({ status, path: repoPath })),
    { base: existing.bindingPr.baseSha, headRef: existing.bindingPr.headRef },
  );
  assert.equal(result.mode, existing.bindingPr.mode);
  assert.equal(result.taskId, existing.bindingPr.taskId);
});

test('ordinary execution-grant control-plane diff remains fail-closed', () => {
  expectCode(
    () => coordination.classifyPrChangeSet(
      [{
        status: 'A',
        path:
          'project/docs/governance/coordination-execution-grants/UNRELATED-EG01.md',
      }],
      { headRef: 'codex/ordinary-governance-change' },
    ),
    'CONTROL_PLANE_SCOPE_FORBIDDEN',
  );
});

test('OFFICE F01 Stage 1 classifier accepts the exact fresh-base M/M/M tuple', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  assert.deepEqual(
    coordination.classifyPrChangeSet(officeF01Stage1BindingChanges(), {
      base: binding.baseSha,
      headRef: binding.headRef,
    }),
    { mode: binding.mode, taskId: binding.taskId },
  );
});

test('OFFICE F01 Stage 1 validator requires the exact contract binding', (t) => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    fs.readFileSync(fixturePath(REPO_ROOT, binding.contractPath), 'utf8'),
  );
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const result = coordination.validateOfficeF01Stage1BindingScope({
    base: binding.baseSha,
    head: fixture.head,
    headRef: binding.headRef,
    changes: officeF01Stage1BindingChanges(),
    taskId: binding.taskId,
    mode: binding.mode,
    cwd: fixture.root,
  });
  assert.deepEqual(result, { mode: binding.mode, taskId: binding.taskId });
});

test('OFFICE F01 Stage 2 exact tuple is eligible but never dispatchable', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  const result = coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
  });
  assert.deepEqual(result, {
    mode: binding.stage2.mode,
    taskId: binding.stage2.taskId,
    eligibility: 'ELIGIBLE / EXECUTION AUTHORITY MISSING',
    dispatchable: 'NO',
    mutation: 'FORBIDDEN',
  });
});

test('OFFICE F01 Stage 2 validator reconciliation has an exact task-bound repair tuple', () => {
  const repair = coordination.OFFICE_F01_STAGE2_VALIDATOR_RECONCILIATION_R01;
  const classified = coordination.classifyPrChangeSet(repair.changedPaths, {
    base: repair.baseSha,
    headRef: repair.headRef,
  });
  assert.deepEqual(classified, { mode: repair.mode, taskId: repair.taskId });
  assert.equal(repair.targetHeadRef, 'codex/office-sc-f01-authority-materialization-r01');
  assert.equal(repair.followupHeadRef, 'codex/office-f01-validator-mapping-followup-r01');
  assert.deepEqual(
    coordination.classifyPrChangeSet(repair.changedPaths, {
      base: repair.baseSha,
      headRef: repair.followupHeadRef,
    }),
    { mode: repair.mode, taskId: repair.taskId },
  );
  assert.equal(
    coordination.sha256(repair.ownerRatificationEvidence.exactExcerpt),
    repair.ownerRatificationEvidence.excerptSha256,
  );
});

test('OFFICE F01 Stage 2 validator reconciliation rejects wrong base, branch and fifth path', () => {
  const repair = coordination.OFFICE_F01_STAGE2_VALIDATOR_RECONCILIATION_R01;
  const exact = repair.changedPaths;
  for (const candidate of [
    { base: '0'.repeat(40), headRef: repair.headRef, changes: exact },
    { base: repair.baseSha, headRef: `${repair.headRef}-copy`, changes: exact },
    {
      base: repair.baseSha,
      headRef: repair.headRef,
      changes: [...exact, { status: 'M', path: 'project/docs/governance/decision-log.md' }],
    },
  ]) {
    assert.throws(
      () => coordination.classifyPrChangeSet(candidate.changes, candidate),
      (error) => error.code === 'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('OFFICE F01 Stage 2 exact M/A/A/A status tuple passes', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  assert.equal(binding.stage2.statusTuple, 'M / A / A / A');
  assert.equal(binding.stage2.pathCount, 4);
  coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
  });
});

test('OFFICE F01 Stage 2 exact semantic authority ID passes', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
    semanticAuthorityId: binding.stage2.semanticAuthorityId,
  });
});

test('OFFICE F01 Stage 2 exact execution grant ID passes', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
    executionGrantId: binding.stage2.executionGrantId,
  });
});

test('OFFICE F01 Stage 2 semantic and execution locators remain distinct', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  assert.notEqual(binding.stage2.semanticAuthorityPath, binding.stage2.executionGrantPath);
  coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
    semanticAuthorityPath: binding.stage2.semanticAuthorityPath,
    executionGrantPath: binding.stage2.executionGrantPath,
  });
});

test('OFFICE F01 Stage 2 exact target task and successor task pass', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  const result = coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
    taskId: binding.targetSuccessorTaskId,
  });
  assert.equal(result.taskId, binding.targetSuccessorTaskId);
});

test('OFFICE F01 Stage 2 retains GO-COMPLETE Stage 1-only mode as a non-reusable predecessor fact', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  assert.equal(binding.executionMode, 'GO-COMPLETE — STAGE 1 ONLY');
  coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
    executionMode: binding.executionMode,
  });
});

test('OFFICE F01 Stage 2 retains the ratified 8/8 owner decision count', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  assert.equal(binding.ownerDecisions, '8/8 RATIFIED');
  coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
    ownerDecisions: binding.ownerDecisions,
  });
});

test('OFFICE F01 Stage 2 classification is deterministic on repeated replay', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  const first = coordination.classifyPrChangeSet(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
  });
  const second = coordination.classifyPrChangeSet(officeF01Stage2Changes(), {
    headRef: binding.stage2.headRef,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first, { mode: binding.stage2.mode, taskId: binding.stage2.taskId });
});

test('OFFICE F01 Stage 1 rejects wrong base, branch, omission, status and expansion', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  const exact = officeF01Stage1BindingChanges();
  for (const entry of [
    { base: '0'.repeat(40), headRef: binding.headRef, changes: exact },
    { base: binding.baseSha, headRef: `${binding.headRef}-copy`, changes: exact },
    { base: binding.baseSha, headRef: binding.headRef, changes: exact.slice(1) },
    {
      base: binding.baseSha,
      headRef: binding.headRef,
      changes: exact.map((change, index) => (index === 0 ? { ...change, status: 'A' } : change)),
    },
    {
      base: binding.baseSha,
      headRef: binding.headRef,
      changes: [...exact, { status: 'M', path: 'AGENTS.md' }],
    },
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(entry.changes, entry),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('OFFICE F01 Stage 2 rejects missing files, wrong statuses and a fifth file', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  const exact = officeF01Stage2Changes();
  for (let index = 0; index < exact.length; index += 1) {
    expectCode(
      () => coordination.validateOfficeF01Stage2Tuple(exact.filter((_, candidate) => candidate !== index), {
        headRef: binding.stage2.headRef,
      }),
      'OFFICE_F01_STAGE2_SCOPE_MISMATCH',
    );
    const wrongStatus = exact.map((change) => ({ ...change }));
    wrongStatus[index].status = wrongStatus[index].status === 'M' ? 'A' : 'M';
    expectCode(
      () => coordination.validateOfficeF01Stage2Tuple(wrongStatus, { headRef: binding.stage2.headRef }),
      'OFFICE_F01_STAGE2_SCOPE_MISMATCH',
    );
  }
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(
      [...exact, { status: 'M', path: 'project/docs/governance/AGENTS.md' }],
      { headRef: binding.stage2.headRef },
    ),
    'OFFICE_F01_STAGE2_SCOPE_MISMATCH',
  );
});

test('OFFICE F01 Stage 2 rejects wrong IDs, program, task, owner, mode and decision count', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  const cases = [
    [{ semanticAuthorityId: 'WRONG-SA' }, 'OFFICE_F01_STAGE2_SA_ID_MISMATCH'],
    [{ executionGrantId: 'WRONG-EG' }, 'OFFICE_F01_STAGE2_EG_ID_MISMATCH'],
    [{ programId: 'OTHER-PROGRAM' }, 'OFFICE_F01_STAGE2_PROGRAM_MISMATCH'],
    [{ taskId: 'OTHER-TASK' }, 'OFFICE_F01_STAGE2_TASK_MISMATCH'],
    [{ ownerName: 'Another Owner' }, 'OFFICE_F01_STAGE2_OWNER_MISMATCH'],
    [{ executionMode: 'GO-IMPLEMENT' }, 'OFFICE_F01_STAGE2_EXECUTION_MODE_MISMATCH'],
    [{ ownerDecisions: '7/8 RATIFIED' }, 'OFFICE_F01_STAGE2_DECISION_COUNT_MISMATCH'],
    [{ bootstrapId: 'ANOTHER-BOOTSTRAP' }, 'OFFICE_F01_BOOTSTRAP_ID_MISMATCH'],
  ];
  for (const [context, code] of cases) {
    expectCode(
      () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
        headRef: binding.stage2.headRef,
        ...context,
      }),
      code,
    );
  }
});

test('OFFICE F01 Stage 2 rejects duplicate and conflicting authority state', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  for (const [context, code] of [
    [{ duplicateSemanticAuthority: true }, 'OFFICE_F01_DUPLICATE_SA_FORBIDDEN'],
    [{ duplicateExecutionGrant: true }, 'OFFICE_F01_DUPLICATE_EG_FORBIDDEN'],
    [{ existingAuthority: true }, 'OFFICE_F01_EXISTING_AUTHORITY_CONFLICT'],
  ]) {
    expectCode(
      () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
        headRef: binding.stage2.headRef,
        ...context,
      }),
      code,
    );
  }
});

test('OFFICE F01 Stage 2 rejects cross-task and Stage 1 grant reuse', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
      headRef: binding.stage2.headRef,
      stage1GrantTaskId: 'OTHER-TASK',
    }),
    'OFFICE_F01_STAGE2_EXECUTION_AUTHORITY_MISMATCH',
  );
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
      headRef: binding.stage2.headRef,
      stage1GrantTaskId: binding.taskId,
    }),
    'OFFICE_F01_STAGE2_GRANT_REUSE_FORBIDDEN',
  );
});

test('OFFICE F01 Stage 2 rejects wrong branch, locator paths and locator collision', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
      headRef: `${binding.stage2.headRef}-copy`,
    }),
    'OFFICE_F01_STAGE2_BRANCH_MISMATCH',
  );
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
      headRef: binding.stage2.headRef,
      semanticAuthorityPath: 'project/docs/governance/other.md',
    }),
    'OFFICE_F01_STAGE2_SA_PATH_INVALID',
  );
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
      headRef: binding.stage2.headRef,
      executionGrantPath: 'project/docs/governance/other-grant.md',
    }),
    'OFFICE_F01_STAGE2_EG_PATH_INVALID',
  );
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
      headRef: binding.stage2.headRef,
      semanticAuthorityPath: binding.stage2.semanticAuthorityPath,
      executionGrantPath: binding.stage2.semanticAuthorityPath,
    }),
    'OFFICE_F01_STAGE2_AUTHORITY_LOCATOR_COLLISION',
  );
});

test('OFFICE F01 Stage 2 rejects product, schema, migration and implementation expansion', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  for (const repoPath of [
    'project/apps/api/src/modules/office/office.service.ts',
    'project/apps/api/prisma/schema.prisma',
    'project/apps/api/prisma/migrations/20260731_wrong/migration.sql',
    'project/apps/web/src/app/office/page.tsx',
  ]) {
    expectCode(
      () => coordination.validateOfficeF01Stage2Tuple(
        [...officeF01Stage2Changes(), { status: 'M', path: repoPath }],
        { headRef: binding.stage2.headRef },
      ),
      'OFFICE_F01_STAGE2_SCOPE_MISMATCH',
    );
  }
});

test('ordinary governance diff and another task bootstrap remain fail-closed', () => {
  const binding =
    coordination.OFFICE_SC_F01_AUTHORIZATION_AND_SENSITIVE_PROJECTION_AUTHORITY_BOOTSTRAP_STAGE1_BINDING_R01;
  assert.deepEqual(
    coordination.classifyPrChangeSet(
      [{ status: 'M', path: 'project/docs/governance/decision-log.md' }],
      { headRef: 'codex/ordinary-governance-change' },
    ),
    { mode: 'NON_COORDINATION_PR' },
  );
  expectCode(
    () => coordination.validateOfficeF01Stage2Tuple(officeF01Stage2Changes(), {
      headRef: binding.stage2.headRef,
      bootstrapId: 'OTHER-BOOTSTRAP-R01',
    }),
    'OFFICE_F01_BOOTSTRAP_ID_MISMATCH',
  );
});

function createNafakaTerminalBindingFixture(t) {
  const binding =
    coordination.RECEIVABLE_NAFAKA_TERMINAL_STATE_RECONCILIATION_R01_CONTROL_PLANE_BINDING_R01;
  const fixture = createAuthorityGitFixture(
    binding.contractPath,
    fs.readFileSync(fixturePath(REPO_ROOT, binding.contractPath), 'utf8'),
  );
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  return { ...fixture, binding };
}

function nafakaTerminalAuthorityMarker(authority) {
  return `<!-- GOV-COORD-AUTHORITY kind=${authority.kind} recordId=${authority.recordId} -->`;
}

function createNafakaTerminalReconciliationFixture(t, options = {}) {
  const binding =
    coordination.RECEIVABLE_NAFAKA_TERMINAL_STATE_RECONCILIATION_R01_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nafaka-terminal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runFixtureGit(['init', '--quiet'], root);
  runFixtureGit(['config', 'user.name', 'Governance Coordination Test'], root);
  runFixtureGit(
    ['config', 'user.email', 'governance-coordination@example.invalid'],
    root,
  );
  runFixtureGit(['config', 'core.autocrlf', 'false'], root);

  writeFixtureRepoFile(
    root,
    binding.contractPath,
    fs.readFileSync(fixturePath(REPO_ROOT, binding.contractPath), 'utf8'),
  );
  for (const { path: repoPath } of target.changedPaths.filter(
    ({ path: repoPath }) => repoPath !== target.executionGrant.path,
  )) {
    writeFixtureRepoFile(root, repoPath, `# ${repoPath}\n`);
  }

  if (options.preConsumed) {
    writeFixtureRepoFile(
      root,
      target.semanticAuthority.path,
      `# Decision log\n${nafakaTerminalAuthorityMarker(target.semanticAuthority)} **${target.semanticAuthority.recordId} — fixture**\n`,
    );
    writeFixtureRepoFile(
      root,
      target.executionGrant.path,
      `${nafakaTerminalAuthorityMarker(target.executionGrant)}\nsemanticAuthorityRef : ${target.semanticAuthority.recordId}\n`,
    );
  }
  const base = commitFixture(root, 'Nafaka terminal base');

  const stateBlock = [
    ...target.requiredStateLiterals,
    binding.ownerRatificationEvidence.exactExcerpt,
    binding.ownerRatificationEvidence.excerptSha256,
    binding.programId,
    binding.knownGoodFloor,
    `capturedBaseSha : ${base}`,
  ].join('\n');
  const semanticAuthority = options.semanticAuthority || target.semanticAuthority;
  const executionGrant = options.executionGrant || target.executionGrant;
  const semanticMarker = nafakaTerminalAuthorityMarker(semanticAuthority);
  const semanticRow = `${semanticMarker} **${semanticAuthority.recordId} — fixture**`;

  for (const { path: repoPath } of target.changedPaths.filter(
    ({ path: repoPath }) => repoPath !== target.executionGrant.path,
  )) {
    const prefix =
      repoPath === target.semanticAuthority.path && !options.missingSemantic
        ? `${semanticRow}\n`
        : '';
    writeFixtureRepoFile(root, repoPath, `# ${repoPath}\n${prefix}${stateBlock}\n`);
  }

  if (!options.missingGrant) {
    writeFixtureRepoFile(
      root,
      target.executionGrant.path,
      [
        nafakaTerminalAuthorityMarker(executionGrant),
        `semanticAuthorityRef.kind : ${semanticAuthority.kind}`,
        `semanticAuthorityRef.path : ${semanticAuthority.path}`,
        `semanticAuthorityRef.recordId : ${semanticAuthority.recordId}`,
        stateBlock,
        binding.targetTaskId,
        'GO-COMPLETE',
        binding.grantScopeLiteral,
        binding.secondUseLiteral,
        '',
      ].join('\n'),
    );
  }
  const head = commitFixture(root, 'Nafaka terminal reconciliation');
  return { root, base, head, binding };
}

test('Nafaka terminal control-plane binding accepts only exact tuple and scope', (t) => {
  const fixture = createNafakaTerminalBindingFixture(t);
  const { binding } = fixture;
  assert.deepEqual(
    coordination.validateNafakaTerminalStateControlPlaneBindingScope({
      base: binding.bindingPr.baseSha,
      head: fixture.head,
      headRef: binding.bindingPr.headRef,
      taskId: binding.taskId,
      changes: binding.bindingPr.changedPaths,
      cwd: fixture.root,
    }),
    { mode: binding.bindingPr.mode, taskId: binding.taskId },
  );
  for (const override of [
    { taskId: `${binding.taskId}-COPY` },
    { headRef: `${binding.bindingPr.headRef}-copy` },
    { base: '0'.repeat(40) },
    {
      changes: [
        ...binding.bindingPr.changedPaths,
        { status: 'M', path: 'project/apps/api/src/runtime.ts' },
      ],
    },
  ]) {
    expectCode(
      () => coordination.validateNafakaTerminalStateControlPlaneBindingScope({
        base: binding.bindingPr.baseSha,
        head: fixture.head,
        headRef: binding.bindingPr.headRef,
        taskId: binding.taskId,
        changes: binding.bindingPr.changedPaths,
        cwd: fixture.root,
        ...override,
      }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('Nafaka terminal reconciliation exact SA/EG tuple and docs scope pass', (t) => {
  const fixture = createNafakaTerminalReconciliationFixture(t);
  const { binding } = fixture;
  assert.deepEqual(
    coordination.validatePrScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      cwd: fixture.root,
    }),
    { mode: binding.targetPr.mode, taskId: binding.targetTaskId },
  );
});

test('Nafaka terminal reconciliation rejects wrong or missing SA/EG', (t) => {
  const binding =
    coordination.RECEIVABLE_NAFAKA_TERMINAL_STATE_RECONCILIATION_R01_CONTROL_PLANE_BINDING_R01;
  const fixtures = [
    createNafakaTerminalReconciliationFixture(t, {
      semanticAuthority: { ...binding.targetPr.semanticAuthority, recordId: 'WRONG-SA' },
    }),
    createNafakaTerminalReconciliationFixture(t, {
      executionGrant: { ...binding.targetPr.executionGrant, recordId: 'WRONG-EG' },
    }),
    createNafakaTerminalReconciliationFixture(t, { missingSemantic: true }),
    createNafakaTerminalReconciliationFixture(t, { missingGrant: true }),
  ];
  for (const fixture of fixtures) {
    assert.throws(() =>
      coordination.validatePrScope({
        base: fixture.base,
        head: fixture.head,
        headRef: binding.targetPr.headRef,
        cwd: fixture.root,
      }),
    );
  }
});

test('Nafaka terminal reconciliation denies reused EG and all non-docs expansion', (t) => {
  const fixture = createNafakaTerminalReconciliationFixture(t, { preConsumed: true });
  const { binding } = fixture;
  expectCode(
    () => coordination.validateNafakaTerminalStateReconciliationScope({
      base: fixture.base,
      head: fixture.head,
      headRef: binding.targetPr.headRef,
      taskId: binding.targetTaskId,
      changes: binding.targetPr.changedPaths,
      cwd: fixture.root,
    }),
    'NAFAKA_TERMINAL_EXECUTION_GRANT_REUSED',
  );

  for (const repoPath of [
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
    'project/apps/api/src/runtime.ts',
    'project/docs/governance/kms-production-signature.md',
    'project/apps/api/src/modules/uyap/uyap.service.ts',
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(
        [...binding.targetPr.changedPaths, { status: 'M', path: repoPath }],
        { headRef: binding.targetPr.headRef },
      ),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});

test('Nafaka terminal reconciliation rejects wildcard and prefix-like branches', () => {
  const binding =
    coordination.RECEIVABLE_NAFAKA_TERMINAL_STATE_RECONCILIATION_R01_CONTROL_PLANE_BINDING_R01;
  for (const headRef of [
    `${binding.targetPr.headRef}-copy`,
    `${binding.targetPr.headRef}/*`,
    binding.targetPr.headRef.slice(0, -1),
  ]) {
    expectCode(
      () => coordination.classifyPrChangeSet(binding.targetPr.changedPaths, { headRef }),
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
    );
  }
});
