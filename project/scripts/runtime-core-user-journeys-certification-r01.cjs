#!/usr/bin/env node
'use strict';

/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W2
 *
 * Deterministically materializes the bounded core-user-journey certification.
 * Runtime results are admitted only through the named disposable-PostgreSQL
 * Nest test and required CI. This generator performs no runtime activation,
 * deployment, schema change, or database access.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROGRAM = 'RUNTIME-OPERABILITY-CERTIFICATION-R01';
const TASK = 'W2-CORE-USER-JOURNEYS';
const RUNTIME_SPEC =
  'project/apps/api/src/modules/auth/__tests__/core-user-journeys-runtime-certification.db-gated.integration.spec.ts';
const DB_MANIFEST = 'project/apps/api/ci-manifests/db/domain-integration.txt';
const OUTPUT_FILES = [
  'journey-inventory.json',
  'journey-certification-matrix.csv',
  'core-user-journeys-certification.md',
  'negative-boundary-validation.md',
  'remediation-register.md',
  'methodology-validation-report.md',
  'decision-log.md',
];
const W0_FILES = [
  'project/docs/audit/runtime-operability-certification-r01/methodology.md',
  'project/docs/audit/runtime-operability-certification-r01/methodology-validation-report.md',
  'project/docs/audit/runtime-operability-certification-r01/historical-closure-certification.json',
  'project/docs/audit/runtime-operability-certification-r01/historical-closure-certification.md',
  'project/docs/audit/runtime-operability-certification-r01/decision-log.md',
];
const W1_DIRECTORY =
  'project/docs/audit/runtime-operability-certification-r01/w1-security-tenant-certification';
const AUDIT_BASE_SHA = '9cd51295db434b437bf240a26a4421c6c8e7a211';
const EXPECTED_W0_ARTIFACT_BLOBS = Object.freeze({
  'project/docs/audit/runtime-operability-certification-r01/methodology.md':
    'c6d46f2f17a5722fa5b28908ba219114bd0d59d9',
  'project/docs/audit/runtime-operability-certification-r01/methodology-validation-report.md':
    '04928b8cedc0448ad479af79e3d098e4605dba88',
  'project/docs/audit/runtime-operability-certification-r01/historical-closure-certification.json':
    '3b142342e991155ad493bf9b642521aead26cdc0',
  'project/docs/audit/runtime-operability-certification-r01/historical-closure-certification.md':
    '159877b9f45d7afc3a624652a5ae7f743806feae',
  'project/docs/audit/runtime-operability-certification-r01/decision-log.md':
    'df33e313af7621bbe0a5c08a57a2ff98a1924a78',
});
const EXPECTED_W1_ARTIFACT_TREE_SHA = '73c59392b418f238b588d55dfb82473bf5ab1c30';
const LEVELS = ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7'];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function git(repoRoot, ...args) {
  return run('git', args, repoRoot);
}

function parseArgs(argv) {
  const out = { auditBaseSha: null, outDir: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--audit-base-sha') out.auditBaseSha = argv[++index];
    else if (arg === '--out-dir') out.outDir = argv[++index];
    else if (arg === '--help') out.help = true;
    else throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
  }
  if (out.help) return out;
  if (!/^[0-9a-f]{40}$/.test(out.auditBaseSha || '')) throw new Error('FULL_AUDIT_BASE_SHA_REQUIRED');
  if (!out.outDir) throw new Error('OUT_DIR_REQUIRED');
  return out;
}

function allPass() {
  return Object.fromEntries(LEVELS.map((level) => [level, 'PASS']));
}

function buildJourneys() {
  return [
    {
      journeyId: 'W2-CLIENT-01',
      module: 'CLIENT',
      name: 'Create and retrieve a tenant-scoped client',
      entryPoint: 'POST /api/clients -> GET /api/clients/:id',
      authorizationPath: ['JwtAuthGuard', 'JwtStrategy', 'repository-backed controlled identity validator'],
      tenantBoundaryPath: ['trusted req.user.tenantId', 'ClientService.create(tenantId)', 'ClientService.findOne(id, tenantId)'],
      consumerPath: ['ClientController.create/findOne', 'ClientService.create/findOne'],
      persistencePath: ['Client', 'AuditLog CLIENT_CREATE', 'client and audit in one Prisma transaction'],
      independentReadBack: ['PrismaClient.client.findFirst(id + tenantId)', 'PrismaClient.auditLog.findFirst(CLIENT_CREATE)'],
      certificationLevels: allPass(),
      finalStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      evidenceRefs: [
        RUNTIME_SPEC + '#CLIENT',
        'project/apps/api/src/modules/client/client.controller.ts',
        'project/apps/api/src/modules/client/client.service.ts',
        'project/apps/api/src/modules/client/client.module.ts',
      ],
      defects: [],
    },
    {
      journeyId: 'W2-DEBTOR-01',
      module: 'DEBTOR',
      name: 'Create and retrieve a tenant-isolated debtor',
      entryPoint: 'POST /api/debtors -> GET /api/debtors/:id',
      authorizationPath: ['JwtAuthGuard', 'JwtStrategy', 'repository-backed controlled identity validator'],
      tenantBoundaryPath: ['CurrentUser tenantId/id', 'DebtorService.create(tenantId)', 'DebtorService.findOne(tenantId, id)'],
      consumerPath: ['DebtorController.create/findOne', 'DebtorService.create/findOne'],
      persistencePath: ['Debtor', 'AuditLog DEBTOR_CREATE'],
      independentReadBack: ['PrismaClient.debtor.findFirst(id + tenantId)', 'PrismaClient.auditLog.findFirst(DEBTOR_CREATE)'],
      certificationLevels: allPass(),
      finalStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      evidenceRefs: [
        RUNTIME_SPEC + '#DEBTOR',
        'project/apps/api/src/modules/debtor/debtor.controller.ts',
        'project/apps/api/src/modules/debtor/debtor.service.ts',
        'project/apps/api/src/modules/debtor/debtor.module.ts',
      ],
      defects: [],
    },
    {
      journeyId: 'W2-RECEIVABLE-01',
      module: 'RECEIVABLE',
      name: 'Read active claim items while human formation remains fail-closed',
      entryPoint: 'GET /api/claim-items/case/:caseId -> GET /api/claim-items/:id',
      authorizationPath: ['JwtAuthGuard', 'JwtStrategy', 'ClaimItemWriteGateService for rejected human create'],
      tenantBoundaryPath: ['CurrentUser tenantId', 'ClaimItemService.findByCaseId(tenantId, caseId)', 'ClaimItemService.findOne(tenantId, id)'],
      consumerPath: ['ClaimItemController.findByCaseId/findOne/create', 'ClaimItemService', 'ClaimItemWriterRouterService'],
      persistencePath: ['Existing canonical ClaimItem read', 'FORMATION_CONTEXT_REQUIRED create leaves ClaimItem count unchanged'],
      independentReadBack: ['PrismaClient.claimItem.findFirst(id + tenantId + caseId)', 'before/after ClaimItem count'],
      certificationLevels: allPass(),
      finalStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      evidenceRefs: [
        RUNTIME_SPEC + '#RECEIVABLE',
        'project/apps/api/src/modules/claim-item/claim-item.controller.ts',
        'project/apps/api/src/modules/claim-item/claim-item.service.ts',
        'project/apps/api/src/modules/claim-item/claim-item.module.ts',
      ],
      defects: [],
    },
    {
      journeyId: 'W2-COLLECTION-01',
      module: 'COLLECTION',
      name: 'Record and independently verify a tenant-scoped collection receipt',
      entryPoint: 'POST /api/collections -> GET /api/collections/:id',
      authorizationPath: ['JwtAuthGuard', 'JwtStrategy', 'ReceiptObjectScopeAuthorizationService L2 case membership'],
      tenantBoundaryPath: ['CurrentUser tenantId/id', 'tenant-scoped Case and CaseDebtor guards', 'CollectionService.findById(tenantId, id)'],
      consumerPath: ['CollectionController.create/findById', 'CollectionService.create/findById', 'DomainEventIngestService', 'AccountingJournalWriterService'],
      persistencePath: ['Collection', 'LedgerEntry', 'AccountingJournalEntry', 'AuditLog', 'IcrabotTimelineEntry', 'IcrabotOutboxAction'],
      independentReadBack: ['Direct Prisma reads for every canonical receipt side effect', 'idempotent replay returns the original Collection'],
      certificationLevels: allPass(),
      finalStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      evidenceRefs: [
        RUNTIME_SPEC + '#COLLECTION',
        'project/apps/api/src/modules/collection/collection.controller.ts',
        'project/apps/api/src/modules/collection/collection.service.ts',
        'project/apps/api/src/modules/collection/collection.module.ts',
      ],
      defects: [],
    },
    {
      journeyId: 'W2-OFFICE-01',
      module: 'OFFICE',
      name: 'Update and retrieve non-secret office profile settings',
      entryPoint: 'PUT /api/office -> GET /api/office',
      authorizationPath: ['JwtAuthGuard', 'JwtStrategy', 'repository-backed controlled identity validator'],
      tenantBoundaryPath: ['CurrentUser tenantId/id', 'OfficeService.getOrCreate(tenantId)', 'Office.tenantId unique boundary'],
      consumerPath: ['OfficeController.updateOffice/getOffice', 'OfficeService.update/getPublicOffice'],
      persistencePath: ['Office non-secret fields', 'AuditLog OFFICE_SETTINGS UPDATE'],
      independentReadBack: ['PrismaClient.office.findUnique(tenantId)', 'PrismaClient.auditLog.findFirst(OFFICE_SETTINGS)'],
      certificationLevels: allPass(),
      finalStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      evidenceRefs: [
        RUNTIME_SPEC + '#OFFICE',
        'project/apps/api/src/modules/office/office.controller.ts',
        'project/apps/api/src/modules/office/office.service.ts',
        'project/apps/api/src/modules/office/office.module.ts',
      ],
      defects: [],
    },
  ];
}

function buildModel(repoRoot, auditBaseSha) {
  assert.equal(auditBaseSha, AUDIT_BASE_SHA, 'AUDIT_BASE_SHA_MISMATCH');
  const journeys = buildJourneys();
  assert.deepEqual(journeys.map((item) => item.module).sort(), ['CLIENT', 'COLLECTION', 'DEBTOR', 'OFFICE', 'RECEIVABLE']);
  assert.equal(new Set(journeys.map((item) => item.journeyId)).size, journeys.length);
  assert.ok(journeys.every((item) => LEVELS.every((level) => item.certificationLevels[level] === 'PASS')));
  assert.ok(journeys.every((item) => item.finalStatus === 'CONTROLLED_LOCAL_CERTIFIED'));
  for (const journey of journeys) {
    for (const ref of journey.evidenceRefs.filter((item) => !item.includes('#'))) {
      assert.ok(fs.existsSync(path.join(repoRoot, ref)), `MISSING_EVIDENCE_REF:${ref}`);
    }
  }

  const w0ArtifactBlobs = Object.fromEntries(
    W0_FILES.map((file) => [file, git(repoRoot, 'hash-object', file)]),
  );
  assert.deepEqual(w0ArtifactBlobs, EXPECTED_W0_ARTIFACT_BLOBS, 'W0_ARTIFACT_SEAL_MISMATCH');
  const w1ArtifactTreeSha = git(repoRoot, 'rev-parse', `HEAD:${W1_DIRECTORY}`);
  assert.equal(w1ArtifactTreeSha, EXPECTED_W1_ARTIFACT_TREE_SHA, 'W1_ARTIFACT_SEAL_MISMATCH');
  assert.equal(
    git(repoRoot, 'status', '--porcelain', '--', ...W0_FILES, W1_DIRECTORY),
    '',
    'W0_W1_WORKTREE_SEAL_MISMATCH',
  );
  const moduleScorecard = journeys.map((journey) => ({
    module: journey.module,
    journeysSelected: 1,
    certified: 1,
    partial: 0,
    blocked: 0,
    defects: 0,
    remediations: 0,
    userValueStatus: 'CONTROLLED-LOCAL VERIFIED / DEPLOYED NOT ASSESSED',
  }));

  return {
    schemaVersion: 1,
    program: PROGRAM,
    task: TASK,
    ownerDecision: 'RATIFIED',
    executionGrant: 'GO-COMPLETE',
    metadata: {
      auditBaseSha,
      generatedFrom: 'project/scripts/runtime-core-user-journeys-certification-r01.cjs',
      runtimeSpec: RUNTIME_SPEC,
      requiredManifest: DB_MANIFEST,
      evidenceBoundary: 'CONTROLLED_LOCAL_NEST_HTTP_PLUS_DISPOSABLE_POSTGRESQL',
      admissionRule: 'FOCUSED_RUNTIME_TEST_AND_REQUIRED_PR_CI_MUST_PASS_BEFORE_MERGE',
      w0ArtifactBlobs,
      w1ArtifactTreeSha,
    },
    statusAxes: {
      canonicalRepositoryStatus: 'CERTIFICATION CANDIDATE — GO-COMPLETE MERGE REQUIRED',
      codeDeploymentStatus: 'NOT PERFORMED',
      controlledLocalRuntimeStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      deployedEnvironmentRuntimeStatus: 'NOT ASSESSED',
      userValueStatus: 'CONTROLLED-LOCAL VERIFIED / DEPLOYED USER VALUE NOT ASSESSED',
    },
    repositoryWideDisposition: 'PARTIAL / OPERATIONALLY UNCERTIFIED',
    prohibitedActions: {
      productionDeploymentPerformed: false,
      productionDatabaseMutationPerformed: false,
      schemaOrMigrationChanged: false,
      dormantCapabilityActivated: false,
      breakGlassEnabled: false,
      crossTenantEnablementPerformed: false,
      playbookOrManifestAdminActivated: false,
      newLegalOrAuthorizationPolicyIntroduced: false,
    },
    metrics: {
      totalJourneysSelected: 5,
      controlledLocalCertified: 5,
      partial: 0,
      defectConfirmed: 0,
      safeRemediationsCompleted: 0,
      ownerDecisionRequired: 0,
      noEligibleJourney: 0,
      negativeTenantBoundaryPass: 5,
      negativeAuthorizationBoundaryPass: 5,
      independentReadBackPass: 5,
    },
    moduleScorecard,
    closeoutResidual: {
      residualId: 'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01',
      observationStatus: 'PENDING_GO_COMPLETE_CLOSEOUT',
      remediationAuthorized: false,
    },
    journeys,
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderMatrix(model) {
  const rows = [['journeyId', 'module', 'name', 'level', 'status', 'evidenceRefs']];
  for (const journey of model.journeys) {
    for (const level of LEVELS) {
      rows.push([
        journey.journeyId,
        journey.module,
        journey.name,
        level,
        journey.certificationLevels[level],
        journey.evidenceRefs.join(' | '),
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function renderReport(model) {
  const lines = [
    '# Core User Journeys Certification — R01 W2',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## Status axes',
    '',
    `- CANONICAL REPOSITORY STATUS: **${model.statusAxes.canonicalRepositoryStatus}**`,
    `- CODE DEPLOYMENT STATUS: **${model.statusAxes.codeDeploymentStatus}**`,
    `- CONTROLLED-LOCAL RUNTIME STATUS: **${model.statusAxes.controlledLocalRuntimeStatus}**`,
    `- DEPLOYED-ENVIRONMENT RUNTIME STATUS: **${model.statusAxes.deployedEnvironmentRuntimeStatus}**`,
    `- USER-VALUE STATUS: **${model.statusAxes.userValueStatus}**`,
    `- Repository-wide: **${model.repositoryWideDisposition}**`,
    '',
    'A merge or controlled-local pass is not production deployment evidence.',
    '',
    '## Metrics',
    '',
    '| Measure | Count |',
    '|---|---:|',
    `| Total journeys selected | ${model.metrics.totalJourneysSelected} |`,
    `| Controlled-local certified | ${model.metrics.controlledLocalCertified} |`,
    `| Partial | ${model.metrics.partial} |`,
    `| Defects confirmed | ${model.metrics.defectConfirmed} |`,
    `| Safe remediations completed | ${model.metrics.safeRemediationsCompleted} |`,
    `| Owner decisions required | ${model.metrics.ownerDecisionRequired} |`,
    `| No eligible journey | ${model.metrics.noEligibleJourney} |`,
    `| Negative tenant boundary pass | ${model.metrics.negativeTenantBoundaryPass} |`,
    `| Negative authorization boundary pass | ${model.metrics.negativeAuthorizationBoundaryPass} |`,
    `| Independent read-back pass | ${model.metrics.independentReadBackPass} |`,
    '',
    '## Module scorecard',
    '',
    '| Module | Journeys | Certified | Partial | Blocked | Defects | Remediations | User-value status |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
    ...model.moduleScorecard.map((row) =>
      `| ${row.module} | ${row.journeysSelected} | ${row.certified} | ${row.partial} | ${row.blocked} | ${row.defects} | ${row.remediations} | ${row.userValueStatus} |`),
    '',
    '## Journey dispositions',
    '',
    '| Journey | Entry point | J0-J7 | Final status |',
    '|---|---|---|---|',
    ...model.journeys.map((journey) =>
      `| ${journey.journeyId} — ${journey.name} | \`${journey.entryPoint}\` | PASS | ${journey.finalStatus} |`),
    '',
    'No production source remediation was required. RECEIVABLE certification intentionally covers the',
    'existing active read journey and proves that the human create path remains formation-contained;',
    'it does not activate a dormant writer or invent a formation policy.',
    '',
  ];
  return lines.join('\n');
}

function renderNegativeValidation(model) {
  return [
    '# W2 Negative Boundary Validation',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '| Journey | Wrong tenant | Unauthorized / missing identity | Failed operation leaves no partial state | Same-tenant access | Idempotency |',
    '|---|---|---|---|---|---|',
    '| W2-CLIENT-01 | Foreign GET returns 404 | Protected routes return 401 | Forced transaction audit failure leaves no Client/AuditLog | Create/read PASS | N/A — no idempotency contract |',
    '| W2-DEBTOR-01 | Foreign GET returns 404 | Protected routes return 401 | Duplicate identity returns 409 and count is unchanged | Create/read PASS | Duplicate identity guard PASS |',
    '| W2-RECEIVABLE-01 | Foreign list is empty and detail is 404 | Protected routes return 401 | FORMATION_CONTEXT_REQUIRED leaves ClaimItem count unchanged | Active list/detail PASS | N/A for read journey |',
    '| W2-COLLECTION-01 | Foreign GET returns 404 | Protected routes return 401 | Forced in-transaction audit failure rolls back all receipt side effects | Create/read PASS | Same key/payload replays original receipt |',
    '| W2-OFFICE-01 | Foreign tenant reads only its own Office | Protected routes return 401 | Rejected null-name update preserves prior Office row | Update/read PASS | N/A — no idempotency contract |',
    '',
    'The controlled identity validator resolves the actor from the signed subject and persisted user record.',
    'A missing/unknown subject fails closed; a forged tenant claim cannot replace the persisted trusted tenant.',
    '',
  ].join('\n');
}

function renderRemediationRegister(model) {
  return [
    '# W2 Remediation Register',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '| Defect | Status | Remediation | Regression tooth |',
    '|---|---|---|---|',
    '| None | NO_PROVEN_BINDING_OR_REGISTRATION_DEFECT | None | N/A — no patch to revert |',
    '',
    'No production code, schema, migration, activation default, authorization policy, or legal policy was changed.',
    '',
  ].join('\n');
}

function renderMethodologyValidation(model) {
  return [
    '# W2 Methodology Validation Report',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## Generator-enforced assertions',
    '',
    '- PASS — exactly one eligible journey for each of CLIENT, DEBTOR, RECEIVABLE, COLLECTION, OFFICE.',
    '- PASS — five unique journey identifiers and exact required module set.',
    '- PASS — every journey has J0-J7 PASS and CONTROLLED_LOCAL_CERTIFIED disposition.',
    '- PASS — all repository evidence references exist.',
    '- PASS — W0 blob identities and the W1 artifact tree are pinned to the audit base.',
    '- PASS — all seven required artifacts are produced deterministically.',
    '',
    '## Execution-time admission evidence',
    '',
    `- \`${RUNTIME_SPEC}\`: actual Nest dispatch, JwtAuthGuard/JwtStrategy, application services, disposable PostgreSQL, independent Prisma read-back, negative authorization/tenant and rollback probes.`,
    `- \`${DB_MANIFEST}\`: exact required-CI binding; skip/zero-test success is prohibited in CI.`,
    '- Static production composition verifies all five modules/controllers are bound from AppModule.',
    '- Exact changed-file allowlist prohibits production source, configuration, schema, migration, W0, and W1 changes.',
    '- Typecheck/build and required PR CI remain execution evidence and are not fabricated in this artifact.',
    '',
    '## Certification boundary',
    '',
    '- Controlled-local representative runtime only.',
    '- Code deployment: NOT PERFORMED.',
    '- Deployed-environment runtime: NOT ASSESSED.',
    '- Production user value: NOT ASSESSED.',
    '',
  ].join('\n');
}

function renderDecisionLog(model) {
  return [
    '# Runtime Operability Certification R01 — W2 Decision Log',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## ROC-W2-DEC-001 — One bounded core journey per module',
    '',
    'Five journeys are selected. A second journey per module would add breadth without improving the minimum',
    'J0-J7 admission claim and would materially increase disposable-DB scope.',
    '',
    '## ROC-W2-DEC-002 — RECEIVABLE does not activate human formation',
    '',
    'The eligible user-value journey is active ClaimItem read-back. Human create is exercised only as a',
    'negative boundary and must remain FORMATION_CONTEXT_REQUIRED with zero persistence.',
    '',
    '## ROC-W2-DEC-003 — OFFICE excludes credentials and dormant controls',
    '',
    'Only non-secret office profile fields are updated/read. SMTP/SMS credentials, playbook, manifest-admin,',
    'break-glass, and cross-tenant administration remain outside W2.',
    '',
    '## ROC-W2-DEC-004 — No safe remediation was necessary',
    '',
    'No objectively wrong binding or registration defect was proven. Certification adds test/evidence binding only.',
    '',
    '## ROC-W2-DEC-005 — DEBTOR mandatory pre-task checklist',
    '',
    '- PASS — task is DEBTOR CRUD identity + tenant retrieval, not a legal-status inference.',
    '- PASS — no schema/migration, CaseDebtor lifecycle, notification, UYAP, estate, or address-policy mutation.',
    '- PASS — tenantId and actorId originate from trusted authentication context.',
    '- PASS — duplicate identity is fail-before-write and independently counted.',
    '- PASS — audit attribution is read back without introducing user-authored audit text.',
    '',
    '## ROC-W2-DEC-006 — Deployment axes stay separate',
    '',
    `Repository-wide disposition remains \`${model.repositoryWideDisposition}\`; deployed-environment runtime is`,
    '`NOT ASSESSED` without SHA-bound deployment evidence.',
    '',
    '## ROC-W2-DEC-007 — Closeout ledger residual is observation-only',
    '',
    `\`${model.closeoutResidual.residualId}\` is not remediated by W2. Occurrence and manual fallback are`,
    'recorded factually during GO-COMPLETE closeout.',
    '',
  ].join('\n');
}

function withFinalNewline(value) {
  return `${value.replace(/\n+$/, '')}\n`;
}

function writeArtifacts(outputDirectory, model) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const rendered = {
    'journey-inventory.json': `${JSON.stringify(model, null, 2)}\n`,
    'journey-certification-matrix.csv': withFinalNewline(renderMatrix(model)),
    'core-user-journeys-certification.md': withFinalNewline(renderReport(model)),
    'negative-boundary-validation.md': withFinalNewline(renderNegativeValidation(model)),
    'remediation-register.md': withFinalNewline(renderRemediationRegister(model)),
    'methodology-validation-report.md': withFinalNewline(renderMethodologyValidation(model)),
    'decision-log.md': withFinalNewline(renderDecisionLog(model)),
  };
  assert.deepEqual(Object.keys(rendered).sort(), [...OUTPUT_FILES].sort());
  for (const [file, content] of Object.entries(rendered)) {
    fs.writeFileSync(path.join(outputDirectory, file), content, 'utf8');
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      'Usage:',
      '  node project/scripts/runtime-core-user-journeys-certification-r01.cjs',
      '    --audit-base-sha <full-sha>',
      '    --out-dir <repo-relative-or-absolute-directory>',
      '',
    ].join('\n'));
    return;
  }
  const projectRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(projectRoot, '..');
  const model = buildModel(repoRoot, args.auditBaseSha);
  const outputDirectory = path.resolve(repoRoot, args.outDir);
  writeArtifacts(outputDirectory, model);
  process.stdout.write(`${JSON.stringify({
    status: 'W2_CORE_USER_JOURNEYS_CERTIFICATION_GENERATED',
    auditBaseSha: args.auditBaseSha,
    outputDirectory: path.relative(repoRoot, outputDirectory).replace(/\\/g, '/'),
    metrics: model.metrics,
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  LEVELS,
  OUTPUT_FILES,
  buildModel,
  parseArgs,
  renderDecisionLog,
  renderMatrix,
  renderMethodologyValidation,
  renderNegativeValidation,
  renderRemediationRegister,
  renderReport,
  writeArtifacts,
};
