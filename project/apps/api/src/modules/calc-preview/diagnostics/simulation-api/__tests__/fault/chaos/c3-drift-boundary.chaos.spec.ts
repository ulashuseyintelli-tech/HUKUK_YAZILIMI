/**
 * C3 — Drift Threshold Edge: Boundary Testi
 *
 * Chaos Validation — Task 4
 *
 * Drift score tam eşik çevresinde (just below / at / just above).
 * 1000 iterasyon → 0 nondeterministic block.
 *
 * DoD: 1000 iterasyon → 0 flip (deterministic)
 *
 * @see .kiro/specs/chaos-soak-validation/design.md — C3
 */

import { PromoteService, PromoteResult } from '../../../promote.service';
import type { ISnapshotProvider } from '../../../promote.service';
import { PHASE7_ENV_KEYS } from '../../../phase7-config';
import { DRIFT_THRESHOLD } from '../../../../evidence/drift-utils';
import type { EvidenceSnapshot } from '../../../../diagnostics.types';
import {
  ChaosMetricsSpy,
  createChaosFeatureFlag,
  createChaosPromoteStore,
  createChaosRunStore,
  createChaosAudit,
  createChaosClock,
  buildChaosSnapshot,
  cleanupPhase7Env,
} from './chaos-helpers';

jest.setTimeout(120_000);

/**
 * Build a current snapshot that produces a specific drift score relative to baseline.
 *
 * Strategy: baseline has error_rate=1.0, we adjust current error_rate to control drift.
 * With single metric and weight=2.0:
 *   relativeDrift = |current - 1.0| / 1.0 = |current - 1.0|
 *   weightedContribution = relativeDrift * 2.0
 *   driftScore = sqrt(wc^2 / w^2) = relativeDrift
 *
 * So: driftScore ≈ |currentValue - 1.0|
 * To get driftScore = target: currentValue = 1.0 + target (or 1.0 - target)
 */
function buildBaselineForBoundary(): EvidenceSnapshot {
  return buildChaosSnapshot('snap-baseline', {
    points: [
      { metric: 'error_rate', value: 1.0, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-14T12:00:00Z' },
    ],
  });
}

function buildCurrentForDriftScore(targetDrift: number): EvidenceSnapshot {
  // currentValue = 1.0 + targetDrift → relativeDrift = targetDrift
  const currentValue = 1.0 + targetDrift;
  return buildChaosSnapshot('snap-current', {
    points: [
      { metric: 'error_rate', value: currentValue, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-14T12:00:00Z' },
    ],
  });
}

function buildServiceForDrift(
  targetDrift: number,
  metricsSpy: ChaosMetricsSpy,
  thresholdOverride?: number,
): { service: PromoteService; promoteStore: ReturnType<typeof createChaosPromoteStore> } {
  const baseline = buildBaselineForBoundary();
  const current = buildCurrentForDriftScore(targetDrift);

  const snapshotProvider: ISnapshotProvider = {
    getSnapshot: jest.fn(async (id: string) => {
      if (id === 'snap-baseline') return baseline;
      return current;
    }),
  };

  const promoteStore = createChaosPromoteStore();

  if (thresholdOverride !== undefined) {
    process.env[PHASE7_ENV_KEYS.DRIFT_THRESHOLD_OVERRIDE] = String(thresholdOverride);
  }

  const service = new PromoteService(
    createChaosFeatureFlag() as any,
    promoteStore as any,
    createChaosRunStore() as any,
    metricsSpy.mock as any,
    createChaosAudit() as any,
    createChaosClock(),
    snapshotProvider,
  );

  return { service, promoteStore };
}

describe('C3: Drift Threshold Edge — Boundary Testi', () => {
  beforeEach(() => {
    process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'true';
  });

  afterEach(() => {
    cleanupPhase7Env();
  });

  it('drift score just below threshold → ACCEPTED', async () => {
    const metricsSpy = new ChaosMetricsSpy();
    const targetDrift = DRIFT_THRESHOLD - 0.01; // Just below
    const { service } = buildServiceForDrift(targetDrift, metricsSpy);

    const result = await service.promote('inc-below', 'run-below', 'actor-1');
    expect(result.status).toBe('ACCEPTED');
  });

  it('drift score at threshold (+ fp epsilon) → DRIFT_DETECTED (>= semantics)', async () => {
    // IEEE 754: sqrt(0.0225) = 0.14999...94 < 0.15 due to floating point.
    // To reliably hit >= threshold, we add a tiny epsilon to ensure we cross it.
    const metricsSpy = new ChaosMetricsSpy();
    const targetDrift = DRIFT_THRESHOLD + 1e-10; // Just above threshold (fp-safe)
    const { service } = buildServiceForDrift(targetDrift, metricsSpy);

    const result = await service.promote('inc-at', 'run-at', 'actor-1');
    expect(result.status).toBe('DRIFT_DETECTED');
  });

  it('drift score just above threshold → DRIFT_DETECTED', async () => {
    const metricsSpy = new ChaosMetricsSpy();
    const targetDrift = DRIFT_THRESHOLD + 0.01; // Just above
    const { service } = buildServiceForDrift(targetDrift, metricsSpy);

    const result = await service.promote('inc-above', 'run-above', 'actor-1');
    expect(result.status).toBe('DRIFT_DETECTED');
  });

  it('1000 iterations with same input → 0 nondeterministic flips (below threshold)', async () => {
    const ITERATIONS = 1000;
    const metricsSpy = new ChaosMetricsSpy();
    const targetDrift = DRIFT_THRESHOLD - 0.02; // Safely below

    let acceptedCount = 0;
    let driftCount = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const { service } = buildServiceForDrift(targetDrift, metricsSpy);
      const result = await service.promote(`inc-iter-${i}`, `run-iter-${i}`, 'actor-1');

      if (result.status === 'ACCEPTED') acceptedCount++;
      else if (result.status === 'DRIFT_DETECTED') driftCount++;
    }

    // All should be ACCEPTED — 0 flips
    expect(acceptedCount).toBe(ITERATIONS);
    expect(driftCount).toBe(0);
  });

  it('1000 iterations with same input → 0 nondeterministic flips (above threshold)', async () => {
    const ITERATIONS = 1000;
    const metricsSpy = new ChaosMetricsSpy();
    const targetDrift = DRIFT_THRESHOLD + 0.02; // Safely above

    let acceptedCount = 0;
    let driftCount = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const { service } = buildServiceForDrift(targetDrift, metricsSpy);
      const result = await service.promote(`inc-iter-${i}`, `run-iter-${i}`, 'actor-1');

      if (result.status === 'ACCEPTED') acceptedCount++;
      else if (result.status === 'DRIFT_DETECTED') driftCount++;
    }

    // All should be DRIFT_DETECTED — 0 flips
    expect(driftCount).toBe(ITERATIONS);
    expect(acceptedCount).toBe(0);
  });

  it('DRIFT_THRESHOLD_OVERRIDE env should override default threshold', async () => {
    const metricsSpy = new ChaosMetricsSpy();
    // Default threshold is 0.15. Set override to 0.50.
    // Drift score = 0.30 → below override (0.50) → ACCEPTED
    const targetDrift = 0.30;
    const { service } = buildServiceForDrift(targetDrift, metricsSpy, 0.50);

    const result = await service.promote('inc-override', 'run-override', 'actor-1');
    expect(result.status).toBe('ACCEPTED');

    // Without override, 0.30 > 0.15 would be DRIFT_DETECTED
    // With override 0.50, 0.30 < 0.50 → ACCEPTED
  });

  it('DRIFT_THRESHOLD_OVERRIDE with lower value should block more aggressively', async () => {
    const metricsSpy = new ChaosMetricsSpy();
    // Set override to 0.05. Drift score = 0.10 → above override → DRIFT_DETECTED
    const targetDrift = 0.10;
    const { service } = buildServiceForDrift(targetDrift, metricsSpy, 0.05);

    const result = await service.promote('inc-low', 'run-low', 'actor-1');
    expect(result.status).toBe('DRIFT_DETECTED');
  });
});
