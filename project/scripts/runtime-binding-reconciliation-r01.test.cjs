#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const {
  classifyClosureCapabilityMapping,
  closureCertificationStatus,
  applyDispositionRegistry,
  dispositionFingerprint,
  extractRuntimeClassDeclarations,
  extractRuntimeDecorators,
  isReliableClosureClaim,
  loadDispositionRegistry,
  legacyHistoricalStatusForTitle,
  parseHistoricalClosureClaim,
  validateDispositionRegistryShape,
} = require('./runtime-binding-reconciliation-r01.cjs');

const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..');
const auditDirectory = path.join(
  projectRoot,
  'docs',
  'audit',
  'runtime-binding-reconciliation-r01',
);
const inventoryPath = path.join(auditDirectory, 'runtime-capability-inventory.json');
const matrixPath = path.join(auditDirectory, 'runtime-binding-matrix.csv');
const successorDirectory = path.join(
  projectRoot,
  'docs',
  'audit',
  'runtime-operability-certification-r01',
);
const successorPath = path.join(
  successorDirectory,
  'historical-closure-certification.json',
);

function readInventory() {
  return JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
}

function git(...args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('inventory is pinned to a complete repository history snapshot', () => {
  const inventory = readInventory();
  const expectedCommitCount = Number(
    git('rev-list', '--count', inventory.metadata.auditBaseSha),
  );

  assert.equal(inventory.counts.totalHistoricalWorkItems, expectedCommitCount);
  assert.equal(inventory.historicalWorkItems.length, expectedCommitCount);
  assert.equal(
    new Set(inventory.historicalWorkItems.map((item) => item.historicalWorkId)).size,
    expectedCommitCount,
  );
});

test('capability arithmetic and CSV rows remain internally consistent', () => {
  const inventory = readInventory();
  const statusTotal = Object.values(
    inventory.capabilities.reduce((counts, capability) => {
      counts[capability.finalStatus] = (counts[capability.finalStatus] || 0) + 1;
      return counts;
    }, {}),
  ).reduce((sum, count) => sum + count, 0);
  const matrixLines = fs.readFileSync(matrixPath, 'utf8').trimEnd().split(/\r?\n/);

  assert.equal(statusTotal, inventory.counts.totalCapabilities);
  assert.equal(inventory.capabilities.length, inventory.counts.totalCapabilities);
  assert.equal(matrixLines.length, inventory.counts.totalCapabilities + 1);
  assert.equal(inventory.counts.codePresent, inventory.counts.totalCapabilities);
  assert.ok(inventory.counts.runtimeBound >= inventory.counts.active);
  assert.ok(inventory.counts.active >= inventory.counts.reachable);
  assert.ok(inventory.counts.reachable >= inventory.counts.operable);
});

test('known production wiring and deliberate non-production surfaces are distinguished', () => {
  const inventory = readInventory();
  const capabilityByName = (name) =>
    inventory.capabilities.find((capability) => capability.name === name);

  for (const middleware of ['RequestIdMiddleware', 'HttpMetricsMiddleware']) {
    const capability = capabilityByName(middleware);
    assert.equal(capability.runtimeBound, true);
    assert.equal(capability.reachable, true);
    assert.match(capability.actualEntryPoints.join(' '), /MiddlewareConsumer/);
  }

  assert.equal(capabilityByName('ClockService').reachable, true);
  assert.equal(
    capabilityByName('TestRoutesController.force503 — GET /api/__test__/force-503')
      .finalStatus,
    'INTENTIONALLY_DORMANT',
  );

  const chaosRoutes = inventory.capabilities.filter((capability) =>
    capability.name.startsWith('ChaosController.'));
  assert.equal(chaosRoutes.length, 4);
  assert.ok(chaosRoutes.every((capability) =>
    capability.finalStatus === 'INTENTIONALLY_DORMANT'));
});

test('high-impact unbound surfaces remain explicit and are not promoted to P0 by name', () => {
  const inventory = readInventory();
  const manifestRoutes = inventory.capabilities.filter((capability) =>
    capability.name.startsWith('ManifestAdminController.'));

  assert.equal(manifestRoutes.length, 7);
  assert.ok(manifestRoutes.every((capability) =>
    capability.finalStatus === 'CODE_PRESENT_UNBOUND'));
  assert.equal(
    inventory.capabilities.filter((capability) => capability.severity === 'P0').length,
    0,
  );
});

test('only SHA-bound L6 evidence is classified verified operational', () => {
  const inventory = readInventory();
  const verified = inventory.capabilities.filter((capability) =>
    capability.finalStatus === 'VERIFIED_OPERATIONAL');

  assert.equal(verified.length, 4);
  assert.ok(verified.every((capability) =>
    capability.verificationLevel === 'L6' &&
    capability.independentlyVerified === true &&
    capability.evidenceRefs.some((ref) => ref.includes('delivery-evidence-'))));
});

test('contextual closure parser excludes the four known fail-closed false positives', () => {
  const titles = [
    'fix(interest): fail closed on NO_BUCKETS (ADR-014 PR-2) (#1104)',
    'fix(receivable): fail closed unsupported rule components (RCV-CLAIM-FORM-P02-S01) (#1439)',
    'fix(tariff): fail closed on missing required tariff sections (#997)',
    'fix(uyap): fail closed on unsupported legacy instrument export',
  ];

  for (const [index, title] of titles.entries()) {
    assert.equal(legacyHistoricalStatusForTitle(title, true), 'CLOSED');
    const claim = parseHistoricalClosureClaim(`fixture:fail-closed:${index}`, title);
    assert.equal(claim.claimType, 'FALSE_POSITIVE_FAIL_CLOSED');
    assert.equal(claim.disposition, 'FALSE_POSITIVE');
    assert.equal(claim.confidence, 'LOW');
    assert.equal(isReliableClosureClaim(claim), false);
  }
});

test('runtime decorator extraction ignores comments and string literals', () => {
  const source = `
    /** @Cron(EVERY_HOUR) */
    // @Cron(EVERY_DAY_AT_3AM)
    const example = '@Cron(FAKE_LITERAL)';
    /* @Cron(EVERY_MINUTE) */
    @Cron(EVERY_HOUR)
    class Scheduler {
      @Interval(ONE_MINUTE)
      run() {}
    }
  `;

  assert.deepEqual(
    extractRuntimeDecorators(source).map((item) => [item.name, item.args.trim()]),
    [
      ['Cron', 'EVERY_HOUR'],
      ['Interval', 'ONE_MINUTE'],
    ],
  );
});

test('runtime class extraction excludes abstract, ambient, and class-expression declarations', () => {
  const source = `
    abstract class AbstractGuard {}
    declare class AmbientGuard {}
    interface TypeOnlyGuard {}
    const ExpressionGuard = class ExpressionGuard {};
    class ConcreteGuard extends AbstractGuard {}
  `;

  assert.deepEqual(
    extractRuntimeClassDeclarations(source).map((item) => item.name),
    ['ConcreteGuard'],
  );
});

test('explicit terminal status is accepted while feature-name closeout is excluded', () => {
  const explicit = parseHistoricalClosureClaim(
    'fixture:explicit',
    'FINAL STATUS: CLOSED',
  );
  const feature = parseHistoricalClosureClaim(
    'fixture:feature',
    'feat(governance): GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 (#1716)',
  );
  const technical = parseHistoricalClosureClaim(
    'fixture:technical',
    'docs: review closure methodology',
  );

  assert.equal(isReliableClosureClaim(explicit), true);
  assert.equal(explicit.confidence, 'HIGH');
  assert.equal(legacyHistoricalStatusForTitle(feature.normalizedTitle, true), 'CLOSED');
  assert.equal(feature.claimType, 'FALSE_POSITIVE_CLOSEOUT_NAME');
  assert.equal(isReliableClosureClaim(feature), false);
  assert.equal(technical.claimType, 'FALSE_POSITIVE_TECHNICAL_CLOSURE');
  assert.equal(isReliableClosureClaim(technical), false);
});

test('package-file history is contained to the exact changed script key', () => {
  const claimItem = {
    historicalWorkId: 'HIST-PACKAGE',
    sourceRefs: ['git:package'],
    changedFiles: ['project/package.json'],
    closureClaim: {
      sourceRef: 'git:package',
      normalizedTitle: 'FINAL STATUS: CLOSED',
    },
  };
  const capability = (id, scriptName) => ({
    capabilityId: id,
    implementationFiles: ['project/package.json'],
    registrationSites: [`project/package.json:scripts.${scriptName}`],
  });
  const changedScripts = new Map([
    ['project/package.json', new Set(['orch:closeout'])],
  ]);

  const exact = classifyClosureCapabilityMapping(
    claimItem,
    capability('CLI-EXACT', 'orch:closeout'),
    changedScripts,
  );
  const unrelated = classifyClosureCapabilityMapping(
    claimItem,
    capability('CLI-UNRELATED', 'build'),
    changedScripts,
  );

  assert.equal(exact.evidenceLevel, 'EXACT_PACKAGE_SCRIPT_KEY');
  assert.equal(unrelated.evidenceLevel, 'UNMAPPED');
});

test('direct implementation mapping never promotes unverified runtime to operational closure', () => {
  const claimItem = {
    historicalWorkId: 'HIST-PORTAL',
    sourceRefs: ['git:portal'],
    changedFiles: ['project/apps/web/src/app/portal/page.tsx'],
    closureClaim: {
      sourceRef: 'git:portal',
      normalizedTitle: 'FINAL STATUS: CLOSED',
    },
  };
  const mapping = classifyClosureCapabilityMapping(claimItem, {
    capabilityId: 'UI-PORTAL',
    implementationFiles: ['project/apps/web/src/app/portal/page.tsx'],
    registrationSites: [],
  });

  assert.equal(mapping.evidenceLevel, 'DIRECT_IMPLEMENTATION_FILE');
  assert.equal(
    closureCertificationStatus('OPERABLE_UNVERIFIED', true),
    'CLOSED_EVIDENCE_INSUFFICIENT',
  );
  assert.equal(
    closureCertificationStatus('VERIFIED_OPERATIONAL', true),
    'CLOSED_OPERATIONAL_CONFIRMED',
  );
});

test('successor artifact has closed shape, metrics, and one certification per capability', () => {
  const successor = JSON.parse(fs.readFileSync(successorPath, 'utf8'));
  const allowedMappingLevels = new Set([
    'EXACT_CAPABILITY_REF',
    'EXACT_PACKAGE_SCRIPT_KEY',
    'DIRECT_IMPLEMENTATION_FILE',
    'BROAD_FILE_TOUCH',
    'UNMAPPED',
  ]);

  assert.equal(successor.schemaVersion, 1);
  assert.equal(successor.ownerDecision, 'RATIFIED');
  assert.equal(successor.executionGrant, 'GO-COMPLETE');
  assert.equal(successor.certifications.length, successor.metadata.capabilityCount);
  assert.equal(
    new Set(successor.certifications.map((item) => item.capabilityId)).size,
    successor.metadata.capabilityCount,
  );
  assert.ok(successor.mappings.every((item) =>
    allowedMappingLevels.has(item.evidenceLevel)));
  assert.equal(
    successor.metrics.provenClosureDefectCount,
    successor.certifications.filter((item) => [
      'CLOSED_BINDING_DEFECT',
      'CLOSED_ACTIVATION_DEFECT',
      'CLOSED_REACHABILITY_DEFECT',
      'CLOSED_OPERABILITY_DEFECT',
    ].includes(item.closureCertificationStatus)).length,
  );
  assert.equal(
    successor.metrics.closureUncertifiedCount,
    successor.certifications.filter((item) => [
      'CLOSED_STATICALLY_BOUND_UNVERIFIED',
      'CLOSED_EVIDENCE_INSUFFICIENT',
    ].includes(item.closureCertificationStatus)).length,
  );
});

test('PR #1795 sealed artifact tree is unchanged from the frozen audit base', () => {
  const successor = JSON.parse(fs.readFileSync(successorPath, 'utf8'));
  const sealedPath = 'project/docs/audit/runtime-binding-reconciliation-r01';
  const baseTree = git(
    'rev-parse',
    `${successor.metadata.auditBaseSha}:${sealedPath}`,
  );
  const headTree = git('rev-parse', `HEAD:${sealedPath}`);

  assert.equal(baseTree, successor.metadata.sealedPr1795ArtifactTreeSha);
  assert.equal(headTree, baseTree);
  assert.equal(git('status', '--porcelain=v1', '--', sealedPath), '');
});

test('canonical dormant disposition is data-driven and removes records from unbound inventory', () => {
  const record = {
    capabilityId: 'HTTP-FIXTURE',
    name: 'FixtureController.read — GET /api/fixture',
    entryPointType: 'HTTP',
    expectedEntryPoints: ['/api/fixture'],
    implementationFiles: ['project/apps/api/src/modules/fixture/fixture.controller.ts'],
    runtimeBound: false,
    active: false,
    reachable: false,
    consumerCount: 0,
    consumers: [],
    actualEntryPoints: [],
    evidenceRefs: [],
    blockers: [],
    finalStatus: 'CODE_PRESENT_UNBOUND',
  };
  const registry = {
    schemaVersion: 1,
    kind: 'RUNTIME_CAPABILITY_DISPOSITION_REGISTRY',
    sourceCommitSha: 'a'.repeat(40),
    requiredCapabilityIds: [record.capabilityId],
    entries: [{
      capabilityId: record.capabilityId,
      recordFingerprint: dispositionFingerprint(record),
      implementationFiles: [...record.implementationFiles],
      disposition: 'INTENTIONALLY_DORMANT',
      runtimeBound: false,
      productionReachable: false,
      productionActive: false,
      operationalConsumer: 0,
      activationAuthority: 'ABSENT',
      defect: false,
      remediationRequired: false,
      reopenCondition: 'OWNER_APPROVED_CONSUMER_AND_TASK_BOUND_ACTIVATION_GRANT',
      evidenceRefs: ['fixture:controller:1'],
    }],
  };

  applyDispositionRegistry([record], { data: registry });

  assert.equal(record.finalStatus, 'INTENTIONALLY_DORMANT');
  assert.equal(record.runtimeBound, false);
  assert.equal(record.active, false);
  assert.equal(record.reachable, false);
  assert.equal(record.consumerCount, 0);
  assert.equal(record.disposition, 'INTENTIONALLY_DORMANT');
  assert.equal(record.activationAuthority, 'ABSENT');
  assert.equal(record.defect, false);
  assert.equal(record.remediationRequired, false);
});

test('dormant disposition registry rejects duplicate, missing and unknown records fail-closed', () => {
  const entry = {
    capabilityId: 'HTTP-FIXTURE',
    recordFingerprint: 'b'.repeat(64),
    implementationFiles: ['project/apps/api/src/modules/fixture/fixture.controller.ts'],
    disposition: 'INTENTIONALLY_DORMANT',
    runtimeBound: false,
    productionReachable: false,
    productionActive: false,
    operationalConsumer: 0,
    activationAuthority: 'ABSENT',
    defect: false,
    remediationRequired: false,
    reopenCondition: 'OWNER_APPROVED_CONSUMER_AND_TASK_BOUND_ACTIVATION_GRANT',
    evidenceRefs: ['fixture:controller:1'],
  };
  const base = {
    schemaVersion: 1,
    kind: 'RUNTIME_CAPABILITY_DISPOSITION_REGISTRY',
    sourceCommitSha: 'a'.repeat(40),
  };

  assert.throws(
    () => validateDispositionRegistryShape({
      ...base,
      requiredCapabilityIds: ['HTTP-FIXTURE', 'HTTP-FIXTURE'],
      entries: [entry, entry],
    }),
    /DISPOSITION_REGISTRY_DUPLICATE_REQUIRED_ID/,
  );
  assert.throws(
    () => validateDispositionRegistryShape({
      ...base,
      requiredCapabilityIds: ['HTTP-FIXTURE'],
      entries: [],
    }),
    /DISPOSITION_REGISTRY_ENTRY_COUNT_MISMATCH/,
  );
  assert.throws(
    () => applyDispositionRegistry([], {
      data: {
        ...base,
        requiredCapabilityIds: ['HTTP-UNKNOWN'],
        entries: [{ ...entry, capabilityId: 'HTTP-UNKNOWN' }],
      },
    }),
    /DISPOSITION_REGISTRY_UNKNOWN_CAPABILITY: HTTP-UNKNOWN/,
  );
});

test('T09 artifact covers the twelve Playbook and six composition routes exactly once', () => {
  const artifact = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'project', 'docs', 'audit', 'runtime-binding-reconciliation-r01-t09', 'capability-disposition-registry.json'),
    'utf8',
  ));
  assert.equal(artifact.requiredCapabilityIds.length, 18);
  assert.equal(artifact.entries.length, 18);
  assert.equal(new Set(artifact.requiredCapabilityIds).size, 18);
  assert.equal(new Set(artifact.entries.map((entry) => entry.capabilityId)).size, 18);
  assert.ok(artifact.entries.every((entry) => entry.disposition === 'INTENTIONALLY_DORMANT'));
  assert.ok(artifact.entries.every((entry) => entry.implementationFiles.length === 1));
  assert.equal(
    artifact.entries.filter((entry) => entry.evidenceRefs.some((ref) => ref.includes('playbook.controller.ts'))).length,
    18,
  );
  assert.equal(artifact.composition.module.name, 'PlaybookModule');
  assert.equal(artifact.composition.controllers.length, 3);
  assert.equal(artifact.composition.controllers.reduce((sum, item) => sum + item.routeCount, 0), 18);
  assert.equal(artifact.composition.providers.length, 14);
  assert.equal(artifact.composition.startupSideEffects.length, 4);
  assert.ok(artifact.composition.controllers.every((item) => item.runtimeBound === false));
  assert.ok(artifact.composition.startupSideEffects.every((item) => item.runtimeBound === false));
});

test('T13/T14 overlay composes canonical dispositions and reclassifies exact records', () => {
  const overlayPath = 'project/docs/audit/runtime-binding-reconciliation-r01-t13/capability-disposition-registry.json';
  const overlay = JSON.parse(fs.readFileSync(path.join(repoRoot, overlayPath), 'utf8'));
  const expectedT13Ids = [
    'INT-05763F53F1D3',
    'INT-1EBE1D6EC7BC',
    'INT-4C1CC43AA751',
    'INT-9CC5892AA884',
    'INT-E9AE1D631FFB',
    'INT-EC4A8FFB6463',
  ];
  const expectedT14Ids = [
    'HTTP-054B0508E07D', 'HTTP-061BBAAB776C', 'HTTP-0750799664CC',
    'HTTP-0B28437D962E', 'HTTP-122183895FD0', 'HTTP-1287CD839964',
    'HTTP-2F45FFAB19CE', 'HTTP-3F3BCA2293F5', 'HTTP-3F5457860C4F',
    'HTTP-512B39B42D1E', 'HTTP-694C905C4131', 'HTTP-8A5F22B0F914',
    'HTTP-A8EA32B0039F', 'HTTP-B0B542D6B1E4', 'HTTP-BCE31FB68E56',
    'HTTP-C0593CE2185B', 'HTTP-CB8DA0AB111B', 'HTTP-D17C40F4DDEF',
    'HTTP-E8DDE1EC0E7B', 'HTTP-F4A23B0C8754', 'HTTP-FEB481815B69',
    'INT-00FE7655123B', 'INT-0701AF188E63', 'INT-13396789FCC2',
    'INT-198D4A73BE9A', 'INT-1F8DF64CBF69', 'INT-241DB773E0E1',
    'INT-2458E64ED157', 'INT-26E0EEE47F55', 'INT-29C9D40F349D',
    'INT-2C570E829954', 'INT-2D535BFBE8A9', 'INT-2FFF74672109',
    'INT-31D483E4AB9F', 'INT-35978A278AC0', 'INT-585689494982',
    'INT-61CC7D2EC736', 'INT-6303E5E243D1', 'INT-862A2D8B25FA',
    'INT-8BD0574E3CBD', 'INT-97426B28EAEA', 'INT-9F9789B5BA7D',
    'INT-A5EA2CEAD034', 'INT-A8D86B977664', 'INT-AF017422CC46',
    'INT-AF1A55030C4B', 'INT-AFA258B36AD4', 'INT-B95A6AE15E4D',
    'INT-B9D28C2E2AE9', 'INT-C04D8D880754', 'INT-D0D17D782264',
    'INT-D98EA9E329D6',
  ];

  assert.equal(overlay.taskId, 'RBR-R01-T13');
  assert.equal(overlay.materializedByTaskId, 'RBR-R01-T14');
  assert.equal(overlay.baseRegistry, 'project/docs/audit/runtime-binding-reconciliation-r01-t09/capability-disposition-registry.json');
  assert.deepEqual(overlay.requiredCapabilityIds.slice(0, expectedT13Ids.length), expectedT13Ids);
  assert.deepEqual(overlay.requiredCapabilityIds.slice(expectedT13Ids.length), expectedT14Ids);
  assert.equal(overlay.requiredCapabilityIds.length, 58);
  assert.equal(overlay.entries.length, 58);
  assert.equal(new Set(overlay.requiredCapabilityIds).size, 58);
  assert.ok(overlay.entries.every((entry) =>
    entry.disposition === 'INTENTIONALLY_DORMANT' &&
    entry.runtimeBound === false &&
    entry.productionReachable === false &&
    entry.productionActive === false &&
    entry.operationalConsumer === 0 &&
    entry.activationAuthority === 'ABSENT' &&
    entry.defect === false &&
    entry.remediationRequired === false &&
    entry.recordFingerprint.length === 64));
  assert.ok(overlay.entries.slice(0, expectedT13Ids.length).every((entry) => entry.ownerDecisionRef.startsWith('OD-T12-')));
  assert.ok(overlay.entries.slice(expectedT13Ids.length).every((entry) => entry.ownerDecisionRef === 'RBR-R01-T14'));

  const resolved = loadDispositionRegistry(repoRoot, overlayPath, git('rev-parse', 'HEAD'));
  assert.equal(resolved.data.requiredCapabilityIds.length, 76);
  assert.equal(resolved.data.entries.length, 76);

  const inventory = readInventory();
  const before = new Map(
    inventory.capabilities
      .filter((record) => expectedT13Ids.includes(record.capabilityId))
      .map((record) => [record.capabilityId, record.finalStatus]),
  );
  assert.equal(before.size, expectedT13Ids.length);
  assert.ok([...before.values()].every((status) => status === 'CODE_PRESENT_UNBOUND'));

  const t13Only = {
    ...overlay,
    baseRegistry: undefined,
    requiredCapabilityIds: expectedT13Ids,
    entries: overlay.entries.slice(0, expectedT13Ids.length),
  };
  applyDispositionRegistry(inventory.capabilities, { data: t13Only });

  const after = inventory.capabilities.filter((record) => expectedT13Ids.includes(record.capabilityId));
  assert.equal(after.length, expectedT13Ids.length);
  assert.ok(after.every((record) =>
    record.finalStatus === 'INTENTIONALLY_DORMANT' &&
    record.runtimeBound === false &&
    record.active === false &&
    record.reachable === false &&
    record.consumerCount === 0 &&
    record.ownerDecisionRef.startsWith('OD-T12-')));
});

test('T14 materializes exactly 52 fresh CODE_PRESENT_UNBOUND records without activation', () => {
  const overlayPath = 'project/docs/audit/runtime-binding-reconciliation-r01-t13/capability-disposition-registry.json';
  const overlay = JSON.parse(fs.readFileSync(path.join(repoRoot, overlayPath), 'utf8'));
  const entries = overlay.entries.filter((entry) => entry.ownerDecisionRef === 'RBR-R01-T14');
  const expectedIds = overlay.requiredCapabilityIds.slice(-52);
  assert.equal(entries.length, 52);
  assert.deepEqual(entries.map((entry) => entry.capabilityId), expectedIds);
  assert.equal(new Set(expectedIds).size, 52);
  assert.equal(entries.filter((entry) => entry.ownerDisposition === 'OWNER_GATED_DORMANT / DO_NOT_BIND').length, 12);
  assert.equal(entries.filter((entry) => entry.ownerDisposition === 'OWNER_GATED_DORMANT / HARDEN_BEFORE_BIND').length, 30);
  assert.equal(entries.filter((entry) => entry.ownerDisposition === 'INTENTIONALLY_DORMANT / DO_NOT_BIND').length, 7);
  assert.equal(entries.filter((entry) => entry.ownerDisposition === 'INTENTIONALLY_DORMANT / MISSING_POLICY_GATE').length, 1);
  assert.equal(entries.filter((entry) => entry.ownerDisposition === 'INTENTIONALLY_DORMANT / TEST_OR_FUTURE_ADMIN_UTILITY').length, 1);
  assert.equal(entries.filter((entry) => entry.ownerDisposition === 'INTENTIONALLY_DORMANT / CONFIG_GATED_DEFAULT_OFF').length, 1);

  const outputDir = 'project/.tmp-t14-baseline';
  fs.mkdirSync(path.join(repoRoot, outputDir), { recursive: true });
  const dispositionFixture = path.join(repoRoot, outputDir, 't09-fixture.json');
  fs.copyFileSync(
    path.join(repoRoot, 'project', 'docs', 'audit', 'runtime-binding-reconciliation-r01-t09', 'capability-disposition-registry.json'),
    dispositionFixture,
  );
  const result = spawnSync(process.execPath, [
    path.join(projectRoot, 'scripts', 'runtime-binding-reconciliation-r01.cjs'),
    '--out-dir', outputDir,
    '--audit-started-at', '2026-08-03T00:00:00+03:00',
    '--disposition-file', `${outputDir}/t09-fixture.json`,
  ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const inventory = JSON.parse(fs.readFileSync(path.join(repoRoot, outputDir, 'runtime-capability-inventory.json'), 'utf8'));
  const records = inventory.capabilities.filter((record) => expectedIds.includes(record.capabilityId));
  assert.equal(records.length, 52);
  assert.ok(records.every((record) => record.finalStatus === 'CODE_PRESENT_UNBOUND'));
  const byId = new Map(records.map((record) => [record.capabilityId, record]));
  assert.ok(entries.every((entry) => dispositionFingerprint(byId.get(entry.capabilityId)) === entry.recordFingerprint));

  const t14Only = {
    ...overlay,
    baseRegistry: undefined,
    requiredCapabilityIds: expectedIds,
    entries,
  };
  applyDispositionRegistry(inventory.capabilities, { data: t14Only });
  const after = inventory.capabilities.filter((record) => expectedIds.includes(record.capabilityId));
  assert.ok(after.every((record) =>
    record.finalStatus === 'INTENTIONALLY_DORMANT' &&
    record.runtimeBound === false &&
    record.active === false &&
    record.reachable === false &&
    record.consumerCount === 0 &&
    record.ownerDecisionRef === 'RBR-R01-T14'));
  fs.rmSync(path.join(repoRoot, outputDir), { recursive: true, force: true });
});
