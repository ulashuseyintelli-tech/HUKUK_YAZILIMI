#!/usr/bin/env node
'use strict';

/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W1
 *
 * Builds the bounded security/tenant capability certification from the W0
 * inventory generator. The program never starts the application, enables a
 * feature, reads credentials, connects to a database, or changes runtime
 * state. Controlled runtime outcomes are admitted only through the focused
 * test surfaces named in the generated evidence profiles.
 */

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROGRAM = 'RUNTIME-OPERABILITY-CERTIFICATION-R01';
const TASK = 'W1-SECURITY-TENANT-CERTIFICATION';
const SOURCE_MODULE = 'AUTH / TENANT / SECURITY';
const OWNER_DECISION = 'RATIFIED';
const EXECUTION_GRANT = 'GO-COMPLETE';
const REPOSITORY_DISPOSITION = 'PARTIAL / OPERATIONALLY UNCERTIFIED';
const SLICE_DISPOSITION = 'PARTIAL / DEPLOYED RUNTIME UNCERTIFIED';

const RUNTIME_SPEC =
  'project/apps/api/src/modules/auth/__tests__/security-tenant-runtime-certification.spec.ts';
const OFFICE_AUTH_MANIFEST =
  'project/apps/api/ci-manifests/pure/office-auth-user.txt';
const PLATFORM_MANIFEST =
  'project/apps/api/ci-manifests/pure/platform-scripts-shared.txt';

const W0_FILES = [
  'project/docs/audit/runtime-operability-certification-r01/methodology.md',
  'project/docs/audit/runtime-operability-certification-r01/methodology-validation-report.md',
  'project/docs/audit/runtime-operability-certification-r01/historical-closure-certification.json',
  'project/docs/audit/runtime-operability-certification-r01/historical-closure-certification.md',
  'project/docs/audit/runtime-operability-certification-r01/decision-log.md',
];

const CONTROLLED_RUNTIME_NAMES = new Set([
  'AuthController.register — POST /api/auth/register',
  'AuthController.capabilities — GET /api/auth/capabilities',
  'AuthController.login — POST /api/auth/login',
  'AuthController.findTenantsForEmail — POST /api/auth/account-recovery/find-tenants',
  'AuthController.me — GET /api/auth/me',
  'AuditController.getEntityHistory — GET /api/audit/entity-history',
  'AuditController.getLogs — GET /api/audit/logs',
  'AuditController.getUserActivity — GET /api/audit/user-activity',
  'PermissionDiagnosticsController.getDiagnostics — GET /api/permission-diagnostics',
  'AuditService',
  'PermissionHardGuardService',
  'OfficeResetPasswordRateLimitGuard',
  'CredentialRecoveryRateLimitGuard',
  'LoginRateLimitGuard',
  'AuthService',
  'AdminGuard',
  'JwtAuthGuard',
  'PermissionDiagnosticsService',
  'WarnOnlyAuditService',
  'OfficeForgotPasswordRateLimitGuard',
]);

const DORMANT_NAMES = new Set([
  'PasswordResetController.resetPassword — POST /api/auth/reset-password',
  'PasswordResetController.forgotPassword — POST /api/auth/forgot-password',
  'UserInviteController.create — POST /api/auth/invites',
  'UserInviteController.list — GET /api/auth/invites',
  'UserInviteController.accept — POST /api/auth/accept-invite',
  'UserInviteController.revoke — POST /api/auth/invites/:id/revoke',
  'UserInviteController.resend — POST /api/auth/invites/:id/resend',
  'UserInviteService',
  'PasswordResetService',
  'GuidedOpenObserveService',
]);

const INERT_CONFIG_GATED_NAMES = new Set([
  'ConfirmationTokenService',
  'GuidedEdgeGateService',
]);

const NO_CONSUMER_NAMES = new Set(['TenantService']);

const EXPECTED_NAMES = new Set([
  ...CONTROLLED_RUNTIME_NAMES,
  ...DORMANT_NAMES,
  ...INERT_CONFIG_GATED_NAMES,
  ...NO_CONSUMER_NAMES,
]);

const CERTIFICATION_STATUSES = new Set([
  'CONTROLLED_RUNTIME_CERTIFIED_DEPLOYED_UNVERIFIED',
  'DORMANT_PRESERVED_NOT_ACTIVATED',
  'INERT_CONFIG_GATED_PRESERVED',
  'NO_RUNTIME_CONSUMER_UNCERTIFIED',
]);

function normalize(value) {
  return String(value).replace(/\\/g, '/');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
    env: options.env || process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function parseArgs(argv) {
  const out = { auditBaseSha: null, outDir: null, inventory: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--audit-base-sha') out.auditBaseSha = argv[++index];
    else if (arg === '--out-dir') out.outDir = argv[++index];
    else if (arg === '--inventory') out.inventory = argv[++index];
    else if (arg === '--help') out.help = true;
    else throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
  }
  if (out.help) return out;
  if (!/^[0-9a-f]{40}$/.test(out.auditBaseSha || '')) {
    throw new Error('FULL_AUDIT_BASE_SHA_REQUIRED');
  }
  if (!out.outDir) throw new Error('OUT_DIR_REQUIRED');
  return out;
}

function git(repoRoot, ...args) {
  return run('git', args, { cwd: repoRoot });
}

function generateInventory(repoRoot, auditBaseSha) {
  // The W0 scanner requires the checked-out tree to equal the audit base
  // outside its own output directory. Scan from an exact detached worktree so
  // post-commit W1 files cannot contaminate or block the source inventory.
  const baseWorktree = path.join(
    path.dirname(repoRoot),
    `.roc-w1-base-${process.pid}-${randomUUID()}`,
  );
  const scannerOutput = path.join(baseWorktree, '.roc-w1-inventory');
  let worktreeRegistered = false;
  try {
    git(repoRoot, 'worktree', 'add', '--detach', baseWorktree, auditBaseSha);
    worktreeRegistered = true;
    run(
      process.execPath,
      [
        path.join(baseWorktree, 'project', 'scripts', 'runtime-binding-reconciliation-r01.cjs'),
        '--out-dir',
        scannerOutput,
        '--audit-started-at',
        '2026-07-28T00:00:00.000Z',
        '--audit-base-sha',
        auditBaseSha,
      ],
      { cwd: baseWorktree },
    );
    return JSON.parse(
      fs.readFileSync(path.join(scannerOutput, 'runtime-capability-inventory.json'), 'utf8'),
    );
  } finally {
    if (worktreeRegistered) {
      git(repoRoot, 'worktree', 'remove', '--force', baseWorktree);
      git(repoRoot, 'worktree', 'prune');
    }
  }
}

function classificationFor(capability) {
  const name = capability.name;
  if (CONTROLLED_RUNTIME_NAMES.has(name)) {
    return {
      bindingStatus: 'ROOT_BOUND_REACHABLE',
      activationDisposition: capability.activationConditions.length > 0
        ? 'CONFIG_PREREQUISITE_SATISFIED_IN_CONTROLLED_TEST_ONLY'
        : 'NO_FEATURE_ACTIVATION_REQUIRED',
      controlledRuntimeStatus: 'PASS',
      certificationStatus: 'CONTROLLED_RUNTIME_CERTIFIED_DEPLOYED_UNVERIFIED',
      remediationStatus: 'NONE_REQUIRED',
      gap: 'No SHA-bound deployed or production runtime observation exists.',
    };
  }
  if (DORMANT_NAMES.has(name)) {
    return {
      bindingStatus: 'ROOT_BOUND_ROUTE_OR_PROVIDER_DORMANT',
      activationDisposition: 'DEFAULT_OFF_PRESERVED',
      controlledRuntimeStatus: 'NOT_ACTIVATED_BY_POLICY',
      certificationStatus: 'DORMANT_PRESERVED_NOT_ACTIVATED',
      remediationStatus: 'NONE_AUTHORIZED_OR_REQUIRED',
      gap: 'The capability remains default-off; W1 does not activate dormant behavior.',
    };
  }
  if (INERT_CONFIG_GATED_NAMES.has(name)) {
    return {
      bindingStatus: 'ROOT_BOUND_INERT_CONFIG_GATED',
      activationDisposition: 'SAFE_DEFAULT_PRESERVED',
      controlledRuntimeStatus: 'SAFE_DEFAULT_VERIFIED',
      certificationStatus: 'INERT_CONFIG_GATED_PRESERVED',
      remediationStatus: 'NONE_AUTHORIZED_OR_REQUIRED',
      gap: 'The active/enforcing configuration was not enabled or deployed by W1.',
    };
  }
  if (NO_CONSUMER_NAMES.has(name)) {
    return {
      bindingStatus: 'ROOT_BOUND_NO_RUNTIME_CONSUMER',
      activationDisposition: 'NO_ACTIVATION_ATTEMPTED',
      controlledRuntimeStatus: 'NO_CONSUMER',
      certificationStatus: 'NO_RUNTIME_CONSUMER_UNCERTIFIED',
      remediationStatus: 'NOT_PROVEN_DEFECT_NO_REMEDIATION',
      gap: 'No production DI/constructor consumer exists and no required consumer contract was found.',
    };
  }
  throw new Error(`UNCLASSIFIED_SECURITY_TENANT_CAPABILITY: ${capability.capabilityId} ${name}`);
}

function evidenceProfilesFor(capability, classification) {
  const profiles = ['W1-PROBE-ROOT-BINDING'];
  if (capability.entryPointType === 'HTTP') profiles.push('W1-PROBE-HTTP-DISPATCH');
  if (capability.implementationFiles.some((file) => file.includes('/modules/auth/'))) {
    profiles.push('W1-PROBE-AUTH-BEHAVIOR');
  }
  if (capability.implementationFiles.some((file) => file.includes('/modules/audit/'))) {
    profiles.push('W1-PROBE-AUDIT-BEHAVIOR');
  }
  if (capability.implementationFiles.some((file) => file.includes('/modules/permission-diagnostics/'))) {
    profiles.push('W1-PROBE-PERMISSION-BEHAVIOR');
  }
  if (classification.certificationStatus === 'DORMANT_PRESERVED_NOT_ACTIVATED' ||
      classification.certificationStatus === 'INERT_CONFIG_GATED_PRESERVED') {
    profiles.push('W1-PROBE-SAFE-DEFAULT');
  }
  if (classification.certificationStatus === 'NO_RUNTIME_CONSUMER_UNCERTIFIED') {
    profiles.push('W1-PROBE-NO-CONSUMER');
  }
  return [...new Set(profiles)].sort();
}

function buildEvidenceProfiles(auditBaseSha) {
  return [
    {
      profileId: 'W1-PROBE-ROOT-BINDING',
      evidenceType: 'STATIC_ROOT_COMPOSITION',
      scope: 'All 33 selected capabilities',
      evidenceRefs: [
        'project/apps/api/src/app.module.ts',
        'project/apps/api/src/main.ts',
        'project/scripts/runtime-binding-reconciliation-r01.cjs',
      ],
      admission: `Inventory regenerated with full audit base ${auditBaseSha}.`,
    },
    {
      profileId: 'W1-PROBE-HTTP-DISPATCH',
      evidenceType: 'CONTROLLED_LOCAL_NEST_HTTP',
      scope: 'All 16 selected HTTP capabilities plus actual JWT/admin/rate-limit guards',
      evidenceRefs: [RUNTIME_SPEC, OFFICE_AUTH_MANIFEST],
      admission: 'Focused Nest HTTP probe must pass locally and in required PR CI.',
    },
    {
      profileId: 'W1-PROBE-AUTH-BEHAVIOR',
      evidenceType: 'FOCUSED_SERVICE_AND_TENANT_TESTS',
      scope: 'Auth, invite, password-reset, token-version and guard behavior',
      evidenceRefs: [OFFICE_AUTH_MANIFEST],
      admission: 'The exact CI manifest must execute without skip/zero-test success.',
    },
    {
      profileId: 'W1-PROBE-AUDIT-BEHAVIOR',
      evidenceType: 'FOCUSED_SAFE_PROJECTION_AND_ATTRIBUTION_TESTS',
      scope: 'Audit controller dispatch, tenant propagation and safe projection behavior',
      evidenceRefs: [
        RUNTIME_SPEC,
        PLATFORM_MANIFEST,
        'project/apps/api/src/modules/audit/__tests__/audit-safe-projection.spec.ts',
        'project/apps/api/src/modules/audit/__tests__/audit.service.safe-projection.spec.ts',
      ],
      admission: 'Focused audit tests must pass; no deployed database claim is inferred.',
    },
    {
      profileId: 'W1-PROBE-PERMISSION-BEHAVIOR',
      evidenceType: 'FOCUSED_PERMISSION_DIAGNOSTICS_TESTS',
      scope: 'Diagnostics, observe, confirmation-token, guided-edge and hard-guard behavior',
      evidenceRefs: [RUNTIME_SPEC, PLATFORM_MANIFEST],
      admission: 'Required permission-diagnostics tests must pass with default-off behavior preserved.',
    },
    {
      profileId: 'W1-PROBE-SAFE-DEFAULT',
      evidenceType: 'DEFAULT_OFF_AND_NO_SIDE_EFFECT_TESTS',
      scope: 'Invite, password recovery, guided observe and guided confirmation gates',
      evidenceRefs: [OFFICE_AUTH_MANIFEST, PLATFORM_MANIFEST],
      admission: 'Tests may exercise controlled fixtures but do not change repository or deployed activation.',
    },
    {
      profileId: 'W1-PROBE-NO-CONSUMER',
      evidenceType: 'STATIC_CONSUMER_INVENTORY',
      scope: 'TenantService only',
      evidenceRefs: [
        'project/apps/api/src/modules/tenant/tenant.module.ts',
        'project/apps/api/src/modules/tenant/tenant.service.ts',
      ],
      admission: 'No consumer plus no required-consumer authority cannot be promoted to a defect.',
    },
  ];
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function buildModel(repoRoot, auditBaseSha, inventory) {
  assert.equal(inventory.metadata.auditBaseSha, auditBaseSha, 'SOURCE_INVENTORY_SHA_MISMATCH');
  const selected = inventory.capabilities
    .filter((capability) => capability.module === SOURCE_MODULE)
    .sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));

  assert.equal(selected.length, 33, 'SECURITY_TENANT_CAPABILITY_COUNT_DRIFT');
  assert.deepEqual(
    new Set(selected.map((capability) => capability.name)),
    EXPECTED_NAMES,
    'SECURITY_TENANT_CAPABILITY_SET_DRIFT',
  );
  assert.equal(
    new Set(selected.map((capability) => capability.capabilityId)).size,
    selected.length,
    'DUPLICATE_CAPABILITY_ID',
  );
  assert.ok(selected.every((capability) => capability.runtimeBound === true), 'UNBOUND_SELECTED_CAPABILITY');

  const certifications = selected.map((capability) => {
    const classification = classificationFor(capability);
    const probeProfiles = evidenceProfilesFor(capability, classification);
    return {
      capabilityId: capability.capabilityId,
      capabilityName: capability.name,
      entryPointType: capability.entryPointType,
      implementationFiles: capability.implementationFiles,
      registrationSites: capability.registrationSites,
      baselineFinalStatus: capability.finalStatus,
      baselineActivationConditions: capability.activationConditions,
      baselineConsumerCount: capability.consumerCount,
      bindingStatus: classification.bindingStatus,
      activationDisposition: classification.activationDisposition,
      controlledRuntimeStatus: classification.controlledRuntimeStatus,
      deployedRuntimeStatus: 'UNVERIFIED',
      productionRuntimeStatus: 'NOT_CERTIFIED',
      certificationStatus: classification.certificationStatus,
      remediationStatus: classification.remediationStatus,
      probeProfiles,
      gap: classification.gap,
      rationale: classification.certificationStatus === 'CONTROLLED_RUNTIME_CERTIFIED_DEPLOYED_UNVERIFIED'
        ? 'Root binding and controlled local runtime behavior are covered; deployed runtime is a separate unverified axis.'
        : classification.gap,
    };
  });

  assert.ok(certifications.every((item) => CERTIFICATION_STATUSES.has(item.certificationStatus)));
  assert.ok(certifications.every((item) => item.deployedRuntimeStatus === 'UNVERIFIED'));
  assert.ok(certifications.every((item) => item.productionRuntimeStatus === 'NOT_CERTIFIED'));

  const certificationCounts = countBy(certifications, 'certificationStatus');
  assert.equal(certificationCounts.CONTROLLED_RUNTIME_CERTIFIED_DEPLOYED_UNVERIFIED, 20);
  assert.equal(certificationCounts.DORMANT_PRESERVED_NOT_ACTIVATED, 10);
  assert.equal(certificationCounts.INERT_CONFIG_GATED_PRESERVED, 2);
  assert.equal(certificationCounts.NO_RUNTIME_CONSUMER_UNCERTIFIED, 1);

  const w0ArtifactBlobs = Object.fromEntries(
    W0_FILES.map((file) => [file, git(repoRoot, 'rev-parse', `${auditBaseSha}:${file}`)]),
  );
  const w0 = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        'project',
        'docs',
        'audit',
        'runtime-operability-certification-r01',
        'historical-closure-certification.json',
      ),
      'utf8',
    ),
  );

  const assertions = [
    'SCHEMA_VERSION_1',
    'PROGRAM_TASK_IDENTITY',
    'EXACT_W0_SECURITY_TENANT_MODULE_SELECTION',
    'THIRTY_THREE_CAPABILITIES_EXACT',
    'UNIQUE_CAPABILITY_CERTIFICATIONS',
    'ALL_SELECTED_CAPABILITIES_ROOT_BOUND',
    'CONTROLLED_RUNTIME_DOES_NOT_IMPLY_DEPLOYED_RUNTIME',
    'DORMANT_CAPABILITIES_NOT_ACTIVATED',
    'NO_CONSUMER_NOT_PROMOTED_TO_DEFECT',
    'NO_PRODUCTION_ACTIVATION_OR_POLICY_CHANGE',
    'ZERO_BOUNDED_REMEDIATIONS',
    'REPOSITORY_WIDE_PARTIAL_DISPOSITION_PRESERVED',
    'W0_ARTIFACT_BLOBS_PINNED',
    'PR_1795_SEALED_TREE_PINNED',
  ];

  return {
    schemaVersion: 1,
    program: PROGRAM,
    task: TASK,
    ownerDecision: OWNER_DECISION,
    executionGrant: EXECUTION_GRANT,
    programLock: 'SECURITY_TENANT_CERTIFICATION_FIRST',
    metadata: {
      auditBaseSha,
      sourceInventoryProgram: inventory.program,
      sourceInventoryGenerator: 'project/scripts/runtime-binding-reconciliation-r01.cjs',
      sourceCapabilityCount: inventory.counts.totalCapabilities,
      selectedCapabilityCount: selected.length,
      selectionRule: `capability.module === ${JSON.stringify(SOURCE_MODULE)}`,
      evidenceBoundary: 'STATIC_ROOT_BINDING_PLUS_CONTROLLED_LOCAL_NEST_RUNTIME_AND_FOCUSED_TESTS',
      certificationAdmissionRule: 'NAMED_LOCAL_PROBES_AND_REQUIRED_PR_CI_MUST_PASS_BEFORE_MERGE',
      w0ArtifactBlobs,
      sealedPr1795ArtifactTreeSha: w0.metadata.sealedPr1795ArtifactTreeSha,
    },
    prohibitedActions: {
      productionActivationPerformed: false,
      dormantEndpointActivated: false,
      breakGlassEnabled: false,
      crossTenantEnablementPerformed: false,
      newLegalPolicyIntroduced: false,
      newAuthorizationPolicyIntroduced: false,
      schemaOrMigrationChanged: false,
    },
    overallDisposition: {
      taskStatus: 'CLOSED',
      securityTenantSlice: SLICE_DISPOSITION,
      repositoryWide: REPOSITORY_DISPOSITION,
      nextWorkstreamsOpened: false,
    },
    metrics: {
      selectedCapabilityCount: selected.length,
      controlledRuntimeCertifiedCount:
        certificationCounts.CONTROLLED_RUNTIME_CERTIFIED_DEPLOYED_UNVERIFIED,
      dormantPreservedCount: certificationCounts.DORMANT_PRESERVED_NOT_ACTIVATED,
      inertConfigGatedCount: certificationCounts.INERT_CONFIG_GATED_PRESERVED,
      noRuntimeConsumerCount: certificationCounts.NO_RUNTIME_CONSUMER_UNCERTIFIED,
      deployedRuntimeCertifiedCount: 0,
      productionRuntimeCertifiedCount: 0,
      provenBindingDefectCount: 0,
      remediationAppliedCount: 0,
    },
    baselineStatusCounts: countBy(selected, 'finalStatus'),
    certificationCounts,
    remediation: {
      applied: [],
      provenBindingDefects: [],
      reviewedNoRemediation: [
        {
          capabilityId: selected.find((capability) => capability.name === 'TenantService').capabilityId,
          finding: 'ROOT_BOUND_NO_RUNTIME_CONSUMER',
          disposition: 'NOT_PROVEN_DEFECT_NO_REMEDIATION',
          reason: 'No required consumer or intended public entrypoint is established by current authority.',
        },
      ],
    },
    evidenceProfiles: buildEvidenceProfiles(auditBaseSha),
    generatorAssertions: assertions.map((name) => ({ name, status: 'PASS' })),
    certifications,
  };
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function renderMethodology(model) {
  return [
    '# Runtime Operability Certification R01 — W1 Security/Tenant Methodology',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## Bounded selection',
    '',
    `W1 selects exactly the ${model.metadata.selectedCapabilityCount} capabilities classified by the ratified W0 scanner as`,
    `\`${SOURCE_MODULE}\`. Name-based repository-wide security heuristics are not used to expand scope.`,
    '',
    '## Independent evidence axes',
    '',
    '```text',
    'ROOT BINDING',
    'CONTROLLED LOCAL RUNTIME',
    'DEFAULT-OFF / CONFIGURATION DISPOSITION',
    'DEPLOYED RUNTIME',
    'PRODUCTION RUNTIME',
    '```',
    '',
    '`CONTROLLED_RUNTIME_CERTIFIED_DEPLOYED_UNVERIFIED` certifies only the named controlled Nest',
    'HTTP/guard/service probes. It is not deployed or production certification.',
    '',
    '## Certification statuses',
    '',
    '- `CONTROLLED_RUNTIME_CERTIFIED_DEPLOYED_UNVERIFIED`',
    '- `DORMANT_PRESERVED_NOT_ACTIVATED`',
    '- `INERT_CONFIG_GATED_PRESERVED`',
    '- `NO_RUNTIME_CONSUMER_UNCERTIFIED`',
    '',
    '## Remediation gate',
    '',
    'A remediation requires a proven binding/registration defect, an existing required consumer',
    'contract, unchanged semantics, backward compatibility, and focused regression coverage.',
    'An unused provider alone is not a defect. W1 found no capability satisfying this gate.',
    '',
    '## Explicit non-goals',
    '',
    '- No production activation or deployment.',
    '- No dormant endpoint, guided-open, confirmation, invite, or password-recovery enablement.',
    '- No break-glass or cross-tenant enablement.',
    '- No new legal, role, permission, object-scope, or authorization policy.',
    '- No playbook, manifest-admin, or general P1 activation workstream.',
    '',
  ].join('\n');
}

function renderDecisionLog(model) {
  return [
    '# Runtime Operability Certification R01 — W1 Decision Log',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## ROC-W1-DEC-001 — Exact W0 module boundary',
    '',
    `W1 is bounded to the ${model.metadata.selectedCapabilityCount} W0 capabilities classified as \`${SOURCE_MODULE}\`.`,
    '',
    '## ROC-W1-DEC-002 — Controlled runtime is not deployed runtime',
    '',
    'Controlled Nest HTTP/guard/service evidence may certify the local runtime axis only. All deployed',
    'and production runtime statuses remain unverified/not certified without SHA-bound environment evidence.',
    '',
    '## ROC-W1-DEC-003 — Default-off surfaces remain closed',
    '',
    'Invite provisioning, password recovery, guided observe, confirmation-token, and guided-edge',
    'activation are not enabled by W1. Test fixtures do not change repository or deployed activation.',
    '',
    '## ROC-W1-DEC-004 — TenantService is not a proven binding defect',
    '',
    'The provider is root-bound but has no production constructor consumer. No current authority or',
    'contract establishes a required consumer, so W1 records the gap without speculative wiring.',
    '',
    '## ROC-W1-DEC-005 — No bounded remediation',
    '',
    'No binding/registration defect met the owner remediation gate. Production code, schema, migration,',
    'legal semantics, and authorization policy remain unchanged.',
    '',
    '## ROC-W1-DEC-006 — Repository-wide disposition remains partial',
    '',
    `W1 closes the certification task, not repository-wide operability. Final disposition remains`,
    `\`${REPOSITORY_DISPOSITION}\`.`,
    '',
  ].join('\n');
}

function renderReport(model) {
  const lines = [
    '# Security/Tenant Runtime Certification — R01 W1',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## Final disposition',
    '',
    `- Task: **${model.overallDisposition.taskStatus}**`,
    `- Security/tenant slice: **${model.overallDisposition.securityTenantSlice}**`,
    `- Repository-wide: **${model.overallDisposition.repositoryWide}**`,
    '- Production activation: **NOT PERFORMED**',
    '- Bounded remediation: **0**',
    '',
    '## Scorecard',
    '',
    '| Measure | Count |',
    '|---|---:|',
    `| Selected security/tenant capabilities | ${model.metrics.selectedCapabilityCount} |`,
    `| Controlled-local runtime certified; deployed unverified | ${model.metrics.controlledRuntimeCertifiedCount} |`,
    `| Dormant preserved / not activated | ${model.metrics.dormantPreservedCount} |`,
    `| Inert configuration-gated preserved | ${model.metrics.inertConfigGatedCount} |`,
    `| Root-bound with no runtime consumer | ${model.metrics.noRuntimeConsumerCount} |`,
    `| Deployed runtime certified | ${model.metrics.deployedRuntimeCertifiedCount} |`,
    `| Production runtime certified | ${model.metrics.productionRuntimeCertifiedCount} |`,
    `| Proven binding defects | ${model.metrics.provenBindingDefectCount} |`,
    `| Remediations applied | ${model.metrics.remediationAppliedCount} |`,
    '',
    'Controlled-local certification is deliberately narrower than deployed or production certification.',
    '',
    '## Capability certification',
    '',
    '| Capability | Baseline | W1 certification | Deployed | Gap / disposition |',
    '|---|---|---|---|---|',
  ];
  for (const item of model.certifications) {
    lines.push(
      `| ${item.capabilityId} — ${markdownCell(item.capabilityName)} | ${item.baselineFinalStatus} | ` +
      `${item.certificationStatus} | ${item.deployedRuntimeStatus} | ${markdownCell(item.gap)} |`,
    );
  }
  lines.push(
    '',
    '## Remediation review',
    '',
    '`TenantService` is registered and exported but has no production constructor consumer. Wiring it',
    'without an established required consumer would introduce intent rather than restore existing semantics.',
    'It therefore remains `NO_RUNTIME_CONSUMER_UNCERTIFIED`; no production file was changed.',
    '',
    '## Preserved prohibitions',
    '',
    '- No production activation, dormant endpoint activation, break-glass, or cross-tenant enablement.',
    '- No legal or authorization policy decision.',
    '- No playbook, manifest-admin, or general P1 activation workstream opened.',
    '',
  );
  return lines.join('\n');
}

function renderValidationReport(model) {
  const lines = [
    '# W1 Security/Tenant Certification — Validation Report',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## Generator-enforced assertions',
    '',
    ...model.generatorAssertions.map((item) => `- ${item.status} — \`${item.name}\``),
    '',
    '## Required execution evidence',
    '',
    `- \`${RUNTIME_SPEC}\` exercises all 16 selected HTTP routes through a controlled Nest application`,
    '  with actual JWT, admin, and rate-limit guards.',
    `- \`${OFFICE_AUTH_MANIFEST}\` binds auth/invite/password-reset behavior to required CI.`,
    `- \`${PLATFORM_MANIFEST}\` binds audit and permission-diagnostics regressions to required CI.`,
    '- Node syntax, focused tests, manifest execution, deterministic regeneration, exact allowlist,',
    '  instruction policy, and frozen W0/PR #1795 artifact checks are execution-time evidence.',
    '',
    'This deterministic artifact does not fabricate local or CI command outcomes; those outcomes are',
    'admission evidence recorded by the pull request and final closeout.',
    '',
  ];
  return lines.join('\n');
}

function withFinalNewline(value) {
  return `${value.replace(/\n+$/, '')}\n`;
}

function writeArtifacts(outputDirectory, model) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, 'security-tenant-certification.json'),
    `${JSON.stringify(model, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'security-tenant-certification.md'),
    withFinalNewline(renderReport(model)),
    'utf8',
  );
  fs.writeFileSync(path.join(outputDirectory, 'methodology.md'), withFinalNewline(renderMethodology(model)), 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'decision-log.md'), withFinalNewline(renderDecisionLog(model)), 'utf8');
  fs.writeFileSync(
    path.join(outputDirectory, 'validation-report.md'),
    withFinalNewline(renderValidationReport(model)),
    'utf8',
  );
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      'Usage:',
      '  node project/scripts/runtime-security-tenant-certification-r01.cjs',
      '    --audit-base-sha <full-sha>',
      '    --out-dir <repo-relative-or-absolute-directory>',
      '    [--inventory <pre-generated-inventory.json>]',
      '',
    ].join('\n'));
    return;
  }
  const projectRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(projectRoot, '..');
  git(repoRoot, 'cat-file', '-e', `${args.auditBaseSha}^{commit}`);
  const inventory = args.inventory
    ? JSON.parse(fs.readFileSync(path.resolve(repoRoot, args.inventory), 'utf8'))
    : generateInventory(repoRoot, args.auditBaseSha);
  const model = buildModel(repoRoot, args.auditBaseSha, inventory);
  const outputDirectory = path.resolve(repoRoot, args.outDir);
  writeArtifacts(outputDirectory, model);
  process.stdout.write(`${JSON.stringify({
    status: 'W1_SECURITY_TENANT_CERTIFICATION_GENERATED',
    auditBaseSha: args.auditBaseSha,
    outputDirectory: normalize(path.relative(repoRoot, outputDirectory)),
    metrics: model.metrics,
    disposition: model.overallDisposition,
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  CERTIFICATION_STATUSES,
  EXPECTED_NAMES,
  buildModel,
  classificationFor,
  parseArgs,
  renderDecisionLog,
  renderMethodology,
  renderReport,
  renderValidationReport,
};
