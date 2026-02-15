/**
 * C1 — F6 Storm: Concurrency Altında Snapshot Fetch Failure
 *
 * Chaos Validation — Task 2
 *
 * F6 fault aktifken 20 paralel caller × 5 round = 100 toplam çağrı.
 * Tüm çağrılar HTTP 500 terminal, retry yok (K1).
 *
 * DoD: "no double commit", "no duplicate audit", "metric bounded"
 *
 * @see .kiro/specs/chaos-soak-validation/design.md — C1
 */

import { PromoteService } from '../../../promote.service';
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

const CONCURRENCY = 20;
const ROUNDS = 5;

jest.setTimeout(120_000);

describe('C1: F6 Storm — Concurrency Altında Snapshot Fetch Failure', () => {
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

    // F6 setup: baseline OK, current → null (not found)
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn(async (id: string) => {
        if (id === 'snap-baseline') return buildChaosSnapshot('snap-baseline');
        return null; // F6: current snapshot not found
      }),
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

  it(`should return HTTP 500 for all ${CONCURRENCY * ROUNDS} calls across ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      // Each round uses unique incident/run pairs to avoid idempotency short-circuit
      const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
        const incidentId = `inc-r${round}-c${i}`;
        const runId = `run-r${round}-c${i}`;
        return service.promote(incidentId, runId, 'actor-chaos')
          .then((result) => ({ type: 'success' as const, result }))
          .catch((err) => ({ type: 'error' as const, status: err?.status, message: err?.message }));
      });

      const results = await Promise.all(promises);

      // All calls must be errors with status 500
      for (const r of results) {
        expect(r.type).toBe('error');
        if (r.type === 'error') {
          expect(r.status).toBe(500);
        }
      }
    }

    const snap = metricsSpy.snapshot();
    const total = CONCURRENCY * ROUNDS;

    // Metrics: all F6, no F7
    expect(snap.phase7_faults_total['F6']).toBe(total);
    expect(snap.phase7_faults_total['F7'] ?? 0).toBe(0);

    // Metrics: promote failure with PHASE7_TIMEOUT reason
    expect(snap.promote_failure_total['PHASE7_TIMEOUT']).toBe(total);

    // No success
    expect(snap.promote_success_total).toBe(0);

    // IO ≠ CAS: escalation conflict metric must not increment
    expect(snap.escalation_state_conflict_total).toBe(0);

    // No double commit: markSucceeded must be 0
    expect(promoteStore.markSucceededCallCount).toBe(0);
    expect(promoteStore.markFailedCallCount).toBe(total);
  });

  it('should not produce duplicate audit events per requestId', async () => {
    // Single round with unique keys
    const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
      service.promote(`inc-audit-${i}`, `run-audit-${i}`, 'actor-chaos').catch(() => {}),
    );
    await Promise.all(promises);

    // Red flag check: no audit spam, no cardinality leak, no CAS metric
    const snap = metricsSpy.snapshot();
    const result = redFlagChecker.check({
      metrics: snap,
      promoteStore,
      audit,
      expectedFaultLabels: ['F6'],
      expectNoConflictMetric: true,
    });

    expect(result.passed).toBe(true);
    if (!result.passed) {
      console.error('Red flags:', result.flags);
    }
  });

  it('should keep phase7_faults_total label set bounded to {F6}', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        service.promote(`inc-label-${i}`, `run-label-${i}`, 'actor-chaos').catch(() => {}),
      ),
    );

    const snap = metricsSpy.snapshot();
    const faultLabels = Object.keys(snap.phase7_faults_total);

    // Only F6 label should exist
    expect(faultLabels).toEqual(['F6']);
  });

  it('should emit PHASE7_FAULT audit events', async () => {
    await service.promote('inc-af', 'run-af', 'actor-chaos').catch(() => {});

    const faultEvents = audit.getEventsByType('PHASE7_FAULT');
    expect(faultEvents.length).toBeGreaterThanOrEqual(1);
    expect(faultEvents[0].detail).toContain('F6');
  });
});
