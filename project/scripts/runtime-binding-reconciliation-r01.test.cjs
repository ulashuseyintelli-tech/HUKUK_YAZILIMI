#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

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
