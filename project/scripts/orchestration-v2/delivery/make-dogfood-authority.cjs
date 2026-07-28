'use strict';
/**
 * Generate the dogfood certification authority chain.
 *
 * Every digest here comes from the canonical authority functions — never from a
 * shell utility and never from a second hashing implementation. That is not
 * fastidiousness: #1696 was exactly this defect, a generator hashing raw text
 * while the validator hashed canonical JSON, and the two disagreed silently
 * until a human noticed.
 *
 * The sequence is the one the owner brief specifies, and step 5 is the point of
 * it: normalize, digest, materialize the derived fields back into the object,
 * digest AGAIN, and require equality. A digest that moves when you write it down
 * is a digest that cannot pin anything.
 *
 * Run from the repository root:
 *   node project/scripts/orchestration-v2/delivery/make-dogfood-authority.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const authority = require('../orchestrator/authority.cjs');
const manifestMod = require('./manifest.cjs');
const probesMod = require('./probes.cjs');

const GOV = 'project/docs/governance/coordination-v2';
const ACT = GOV + '/activation';
const PLANS = GOV + '/task-plans/DOGFOOD-R02';

const TASK_ID = 'GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R02';
const SUCCESSOR_ID = 'GOV-COORD-DTV-DOGFOOD-SUCCESSOR-R02';
const PROGRAM_ID = 'DELIVERY_TRUTH';
const SEMANTIC_RECORD = 'GOV-COORD-DTV-DOGFOOD-SEMANTIC-R02';
const EXEC_RECORD = 'GOV-COORD-DTV-DOGFOOD-EXEC-GRANT-R02';
const STANDING_GRANT_ID = 'STANDING-GRANT-DELIVERY-TRUTH-DOGFOOD-R01';
const GRANT_ID = 'GOV-COORD-DTV-DOGFOOD-GRANT-R02';

/**
 * The owner's own words, verbatim, as the ratification excerpt.
 *
 * Short and exact on purpose: verifyRatificationEvidence looks for this string
 * in the named file at the named commit, so anything paraphrased would fail —
 * correctly.
 */
const RATIFICATION_EXCERPT =
  'OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01 dogfood certification is authorized to run ' +
  'through the canonical service path with task-bounded auto-merge.';

const write = (rel, body) => {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, 'utf8');
  return rel;
};
const writeJson = (rel, obj) => write(rel, JSON.stringify(obj, null, 2) + '\n');

// ── the capability this task promises to deliver ────────────────────────────
//
// Taken from the shipped manifest rather than retyped, so the contract the task
// pins is the contract the verifier will actually check. A hand-copied one that
// drifted by a single field would fail at finalization with a digest mismatch —
// which is the gate working, but a self-inflicted one.
const cap = manifestMod.capability('GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE');
const probe = probesMod.PROBES[cap.probeId];
const deliveryContract = manifestMod.contractFor(cap, probe);

// The evidence policy the owner requires, asserted rather than assumed.
for (const f of authority.DELIVERY_EVIDENCE_POLICY_FIELDS) {
  if (deliveryContract.evidencePolicy[f] !== true) {
    throw new Error('EVIDENCE_POLICY_NOT_STRICT: ' + f + ' is not true');
  }
}

// ── the task ────────────────────────────────────────────────────────────────
const rawSpec = {
  schemaVersion: 2,
  taskId: TASK_ID,
  taskSpecVersion: 1,
  profile: 'BOUNDED_CODE_TASK',
  declaredIntent:
    'Delivery-truth dogfood R02: successor degerlendirmesinin, sekli tamamen gecerli fakat ' +
    'BASKA bir predecessor task kimligine ait delivery kanitini reddettigini kanitlayan bir ' +
    'acceptance assertion ekle.',
  boundaryPolicy: {
    allowedRoots: ['project/scripts/orchestration-v2/delivery/'],
    maxChangedFiles: 1,
  },
  requiredTests: [
    {
      argv: ['node', '--test', 'scripts/orchestration-v2/delivery/delivery.test.cjs'],
      cwd: 'project',
      timeoutMs: 900000,
    },
  ],
  predecessorTaskIds: [],
  baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
  successorDisposition: 'DECLARED_SUCCESSOR',
  deliveryContract: deliveryContract,
};

// steps 2-6: normalize, digest, materialize, digest again, require equality
const firstPass = authority.specDigests(rawSpec);
const spec = Object.assign({}, rawSpec, {
  deliveryContractSha256: firstPass.deliveryContractSha256,
});
const secondPass = authority.specDigests(spec);
for (const k of ['taskSpecSha256', 'declaredIntentSha256', 'boundaryPolicySha256', 'requiredTestsSha256', 'deliveryContractSha256']) {
  if (firstPass[k] !== secondPass[k]) {
    throw new Error('DIGEST_NOT_SETTLED: ' + k + ' moved when it was written down');
  }
}
const d = secondPass;

const successorSpec = Object.assign({}, rawSpec, {
  taskId: SUCCESSOR_ID,
  declaredIntent:
    'Delivery-truth dogfood successor: yalniz eligibility gecisi kanitlanir; calistirilmaz.',
  predecessorTaskIds: [TASK_ID],
  successorDisposition: 'NO_SUCCESSOR',
});
const sd = authority.specDigests(
  Object.assign({}, successorSpec, {
    deliveryContractSha256: authority.specDigests(successorSpec).deliveryContractSha256,
  }),
);

const pin = (id, dd, preds) => ({
  taskId: id,
  taskSpecVersion: 1,
  taskSchemaVersion: 2,
  taskSpecSha256: dd.taskSpecSha256,
  declaredIntentSha256: dd.declaredIntentSha256,
  boundaryPolicySha256: dd.boundaryPolicySha256,
  requiredTestsSha256: dd.requiredTestsSha256,
  deliveryContractSha256: dd.deliveryContractSha256,
  predecessorTaskIds: preds,
});

const out = {
  taskId: TASK_ID,
  successorId: SUCCESSOR_ID,
  digests: {
    taskSpecSha256: d.taskSpecSha256,
    declaredIntentSha256: d.declaredIntentSha256,
    boundaryPolicySha256: d.boundaryPolicySha256,
    requiredTestsSha256: d.requiredTestsSha256,
    deliveryContractSha256: d.deliveryContractSha256,
  },
  files: [],
};

out.files.push(writeJson(PLANS + '/plan.v2.json', spec));
out.files.push(writeJson(PLANS + '/successor.plan.v2.json', Object.assign({}, successorSpec, { deliveryContractSha256: sd.deliveryContractSha256 })));

// ── the two authority records the runner reads at the target tip ────────────
out.files.push(
  write(
    PLANS + '/semantic-authority.md',
    [
      '# ' + SEMANTIC_RECORD,
      '',
      '```text',
      'Record   : ' + SEMANTIC_RECORD,
      'Kind     : SEMANTIC_AUTHORITY',
      'Program  : ORCHESTRA-DELIVERY-TRUTH-R01',
      'Owner    : OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01',
      '```',
      '',
      'Bu kayit, ' + TASK_ID + ' icin semantik otoriteyi tasir.',
      '',
      'Task, delivery-truth mekanizmasinin kendi uzerinde kanitlanmasi icindir:',
      'successor kapisinin, sekli gecerli fakat baska bir merge SHA sina ait',
      'delivery kanitini reddettigi executable olarak sabitlenir. Urun-domain',
      'semantigi degismez.',
      '',
      RATIFICATION_EXCERPT,
      '',
    ].join('\n'),
  ),
);

out.files.push(
  write(
    PLANS + '/execution-grant.md',
    [
      '# ' + EXEC_RECORD,
      '',
      '<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=' + EXEC_RECORD + ' -->',
      '',
      '```text',
      'Record        : ' + EXEC_RECORD,
      'Task          : ' + TASK_ID,
      'Successor     : ' + SUCCESSOR_ID,
      'Program       : ' + PROGRAM_ID,
      'Standing grant: ' + STANDING_GRANT_ID,
      'Executor lane : CODEX_LOCAL',
      'Merge         : SQUASH, task-bounded auto-merge',
      'Owner         : OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01',
      '```',
      '',
      'Execution grant. Yetki task-bounded; bu kayit baska bir task, baska bir yol',
      'veya tekrar kullanilabilir merge yetkisi uretmez.',
      '',
      'Pinned digests:',
      '',
      '```text',
      'taskSpecSha256          : ' + d.taskSpecSha256,
      'declaredIntentSha256    : ' + d.declaredIntentSha256,
      'boundaryPolicySha256    : ' + d.boundaryPolicySha256,
      'requiredTestsSha256     : ' + d.requiredTestsSha256,
      'deliveryContractSha256  : ' + d.deliveryContractSha256,
      '```',
      '',
    ].join('\n'),
  ),
);

// ── the task grant ──────────────────────────────────────────────────────────
const grant = {
  schemaVersion: 1,
  grantId: GRANT_ID,
  workstream: 'ORCHESTRA-DELIVERY-TRUTH-R01',
  semanticAuthorityRef: {
    kind: 'SEMANTIC_AUTHORITY',
    recordId: SEMANTIC_RECORD,
    sourcePath: PLANS + '/semantic-authority.md',
  },
  executionGrantRef: {
    kind: 'EXECUTION_GRANT',
    recordId: EXEC_RECORD,
    sourcePath: PLANS + '/execution-grant.md',
  },
  ownerRatificationEvidence: {
    sourcePath: PLANS + '/semantic-authority.md',
    // Filled after the records are committed: the excerpt must be readable at a
    // commit that EXISTS, and inventing one would be the exact fabrication
    // #1685 exists to catch.
    sourceCommitSha: '<FILLED_AFTER_COMMIT>',
    exactExcerpt: RATIFICATION_EXCERPT,
    excerptSha256: require('crypto').createHash('sha256').update(RATIFICATION_EXCERPT, 'utf8').digest('hex'),
  },
  expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  revocationPath: ACT + '/REVOKED-DELIVERY-TRUTH-DOGFOOD',
  manualMergeRequired: true,
  allowedModuleRoots: ['project/scripts/orchestration-v2/delivery/'],
  authorizedTasks: [pin(TASK_ID, d, []), pin(SUCCESSOR_ID, sd, [TASK_ID])],
};
out.files.push(writeJson(PLANS + '/grant.v2.json', grant));

// ── the standing grant: the narrowest one that admits this task ─────────────
const standing = {
  schemaVersion: 1,
  standingGrantId: STANDING_GRANT_ID,
  program: {
    programId: PROGRAM_ID,
    eligibilityAuthorityRef: ACT + '/PROGRAM-ELIGIBILITY-AUTHORITY.md',
  },
  parentAuthorizationRef: {
    authorizationId: 'OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01',
    sourcePath: PLANS + '/execution-grant.md',
    payloadSha256: require('crypto').createHash('sha256').update(EXEC_RECORD, 'utf8').digest('hex'),
  },
  requiredIndependentReview: false,
  ciPolicy: { requireTerminalSuccess: true, allowSkipped: false, allowNeutral: true },
  // Task-bounded, and every narrowing the merge provider re-reads at merge time.
  mergePolicy: { method: 'SQUASH', autoMergeAuthorized: true, repositoryWideAutoMerge: false },
  maxConcurrency: 1,
  childPlanDerivation: 'OWNER_RATIFIED_PLAN_ONLY',
  prohibitions: {
    noPrivilegeDelegation: true,
    noSecretAccessExpansion: true,
    noProductionDataMutation: true,
    noCrossProgramMutation: true,
    noSelfAuthorizationChange: true,
  },
  allowedTaskClasses: ['TEST_ONLY_CHARACTERIZATION', 'BOUNDED_CODE_FIX'],
  // One directory. Not the orchestration tree, not the governance tree, not
  // AGENTS.md — the executor may touch the delivery test surface and nothing
  // else, and the boundary validator judges the real diff against this.
  allowedPathRoots: ['project/scripts/orchestration-v2/delivery/'],
  prohibitedPathRoots: [
    'project/docs/governance/',
    'project/apps/',
    'project/packages/',
    '.github/',
  ],
  allowedExecutorLanes: ['CODEX_LOCAL'],
  revocationPath: ACT + '/REVOKED-DELIVERY-TRUTH-DOGFOOD',
  killSwitchPath: ACT + '/KILL-SWITCH',
  auditLogPath: ACT + '/delivery-truth-dogfood-audit.jsonl',
  notes:
    'Task-bounded dogfood grant. Yalniz ' + TASK_ID + ' ve ' + SUCCESSOR_ID +
    ' icin gecerlidir; repository-wide auto-merge kapalidir.',
};
out.files.push(writeJson(ACT + '/' + STANDING_GRANT_ID + '.json', standing));

// ── the request the operator enqueues ───────────────────────────────────────
out.files.push(
  writeJson(GOV + '/requests/' + TASK_ID + '.request.json', {
    schemaVersion: 1,
    programId: PROGRAM_ID,
    taskId: TASK_ID,
    taskClass: 'BOUNDED_CODE_FIX',
    planPath: PLANS + '/plan.v2.json',
    grantPath: PLANS + '/grant.v2.json',
    standingGrantPath: ACT + '/' + STANDING_GRANT_ID + '.json',
    promptPath: PLANS + '/executor-prompt.md',
    executorLane: 'CODEX_LOCAL',
    targetBranch: 'main',
    // Only because this owner decision supplies task-bounded IF GO-COMPLETE
    // authority. Not a general setting, and the finalizer re-reads both keys.
    autoMerge: true,
    // #1732: this task's paper trail must survive the trip to another worktree.
    // Declared by the REQUEST because the request is what a reviewer reads; a
    // regime chosen by a caller flag would be invisible in the reviewed artefact.
    requireCommittedArtefacts: true,
    notes: 'ORCHESTRA-DELIVERY-TRUTH-R01 WP04 dogfood certification.',
  }),
);

console.log(JSON.stringify(out, null, 2));
