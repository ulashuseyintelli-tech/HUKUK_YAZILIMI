/**
 * S1 — Soak: No Faults, Steady Load
 *
 * Soak Validation — Task 5
 *
 * Fault injector off, PHASE7_ENABLED=true, drift = 0 (identical snapshots).
 * 10 paralel caller × 20 round = 200 toplam çağrı.
 *
 * DoD: p95/p99 stabil, metric cardinality artmıyor, 0 unexpected 500
 *
 * @see .kiro/specs/chaos-soak-validation/design.md — S1
 */

import { PromoteService, PromoteResult } from '../../../promote.service';
import type { ISnapshotProvider } from '../../../promote.service';
import { PHASE7_ENV_KEYS } from '../../../phase7-config';
import {
  ChaosMetricsSpy,
  RedFlagChecker,
  createChaosFeatureFlag,
  createChaosPromoteStore,
  createChaosRunStore,
  createChaosAudit,
  createChaosClock,
  buildChaosSnapshot,
  cleanupPhase7Env,
} from './chaos-helpers';

const CONCURRENCY = 10;
const ROUNDS = 20;
const TOTAL = CONCURRENCY * ROUNDS;

jest.setTimeout(120_000);

describe('S1: Soak — No Faults, Steady Load', () => {
  let service: PromoteService;
  let metricsSpy: ChaosMetricsSpy;
  let promoteStore: ReturnType<typeof createChaosPromoteStore>;
  let audit: ReturnType<typeof createChaosAudit>;
  let redFlagChecker: RedFlagChecker;

  beforeEach(() => {
    process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'true';

    metricsSpy = new ChaosMetricsSpy();
    promoteStore = createChaosPromoteStore();
    audit = createChaosAudit();
    redFlagChecker = new RedFlagChecker();

    // Soak setup: identical snapshots → drift = 0 → all ACCEPTED
    const snapshot = buildChaosSnapshot('snap-shared');
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn(async () => snapshot),
    };

    service = new PromoteService(
      createChaosFeatureFlag() as any,
      promoteStore as any,
      createChaosRunStore() as any,
      metricsSpy.mock as any,
      audit as any,
      createChaosClock(),
      snapshotProvider,
    );
  });

  afterEach(() => {
    cleanupPhase7Env();
  });

  it(`should produce ${TOTAL} ACCEPTED results with 0 unexpected errors across ${ROUNDS} rounds`, async () => {
    let totalAccepted = 0;
    let totalErrors = 0;

    for (let round = 0; round < ROUNDS; round++) {
      const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
        const incidentId = `inc-soak-r${round}-c${i}`;
        const runId = `run-soak-r${round}-c${i}`;
        return service.promote(incidentId, runId, 'actor-soak')
          .then((result) => ({ type: 'success' as const, result }))
          .catch((err) => ({ type: 'error' as const, message: err?.message }));
      });

      const results = await Promise.all(promises);

      for (const r of results) {
        if (r.type === 'success') {
          expect(r.result.status).toBe('ACCEPTED');
          totalAccepted++;
        } else {
          totalErrors++;
        }
      }
    }

    // 0 unexpected errors
    expect(totalErrors).toBe(0);
    expect(totalAccepted).toBe(TOTAL);
  });

  it('should have correct metric counters after steady load', async () => {
    // Run all rounds
    for (let round = 0; round < ROUNDS; round++) {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, i) =>
          service.promote(`inc-m-r${round}-c${i}`, `run-m-r${round}-c${i}`, 'actor-soak'),
        ),
      );
    }

    const snap = metricsSpy.snapshot();

    // promote_success_total = TOTAL
    expect(snap.promote_success_total).toBe(TOTAL);

    // phase7_evaluations_total = TOTAL (every call evaluates drift)
    expect(snap.phase7_evaluations_total).toBe(TOTAL);

    // phase7_faults_total = 0 (no faults injected)
    const totalFaults = Object.values(snap.phase7_faults_total).reduce((a, b) => a + b, 0);
    expect(totalFaults).toBe(0);

    // phase7_blocks_total = 0 (drift = 0, no blocks)
    const totalBlocks = Object.values(snap.phase7_blocks_total).reduce((a, b) => a + b, 0);
    expect(totalBlocks).toBe(0);

    // escalation_state_conflict_total = 0
    expect(snap.escalation_state_conflict_total).toBe(0);
  });

  it('should maintain metric cardinality (label set bounded)', async () => {
    // Run a few rounds
    for (let round = 0; round < 5; round++) {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, i) =>
          service.promote(`inc-card-r${round}-c${i}`, `run-card-r${round}-c${i}`, 'actor-soak'),
        ),
      );
    }

    const snap = metricsSpy.snapshot();

    // phase7_faults_total should have no labels (no faults)
    expect(Object.keys(snap.phase7_faults_total)).toHaveLength(0);

    // phase7_blocks_total should have no labels (no blocks)
    expect(Object.keys(snap.phase7_blocks_total)).toHaveLength(0);

    // promote_failure_total should have no labels (no failures)
    expect(Object.keys(snap.promote_failure_total)).toHaveLength(0);
  });

  it('should not produce duplicate audit events', async () => {
    // Run a smaller set for audit check
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        service.promote(`inc-aud-${i}`, `run-aud-${i}`, 'actor-soak'),
      ),
    );

    // Red flag check
    const snap = metricsSpy.snapshot();
    const result = redFlagChecker.check({
      metrics: snap,
      promoteStore,
      audit,
      expectedFaultLabels: [],
      expectNoConflictMetric: true,
    });

    expect(result.passed).toBe(true);
    if (!result.passed) {
      console.error('Red flags:', result.flags);
    }
  });

  it('should have markSucceeded = calls, markFailed = 0 (no faults)', async () => {
    const N = 10;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        service.promote(`inc-commit-${i}`, `run-commit-${i}`, 'actor-soak'),
      ),
    );

    expect(promoteStore.markSucceededCallCount).toBe(N);
    expect(promoteStore.markFailedCallCount).toBe(0);
  });
});
