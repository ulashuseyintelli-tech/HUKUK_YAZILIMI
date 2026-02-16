/**
 * T22 — Metrics Failure Isolation (F15)
 *
 * Policy: Metrics = best-effort. Metrics failure/timeout MUST NOT change
 * business outcome or state transition. No retry storm (at most 1 attempt).
 * Error masking forbidden: primary exception path preserved.
 *
 * Invariants:
 *   MI-1: metrics fail/timeout → business outcome unchanged
 *   MI-2: bounded-time + no retry storm
 *   MI-3: error masking yok (primary exception korunur)
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D9.1
 * @see .kiro/specs/fault-injection-harness/requirements.md — Requirement 10
 */

import { PromoteService } from '../../promote.service';
import { HysteresisEscalationService } from '../../../playbook/hysteresis-escalation.service';
import {
  SimulationDisabledException,
} from '../../simulation-error.types';
import type { IClock } from '../../../evidence/clock.service';

// ============================================================================
// Mock Factories
// ============================================================================

function createMockFeatureFlag(enabled = true) {
  return { isSimulationEnabled: jest.fn().mockReturnValue(enabled) };
}

function createMockMetrics(overrides: Record<string, jest.Mock> = {}) {
  return {
    incPromoteSuccess: jest.fn(),
    incPromoteFailure: jest.fn(),
    incDriftDetected: jest.fn(),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(),
    incAuditWriteFailed: jest.fn(),
    incPhase7Evaluation: jest.fn(),
    incPhase7Block: jest.fn(),
    incPhase7Fault: jest.fn(),
    ...overrides,
  };
}

function createMockAudit() {
  const events: any[] = [];
  return {
    events,
    logSimulationEvent: jest.fn((event: any) => events.push(event)),
  };
}

function createMockClock(): jest.Mocked<IClock> {
  return { now: jest.fn().mockReturnValue(new Date('2026-02-10T00:00:00Z')) } as any;
}

function createMockRunStore(exists = true) {
  return {
    findById: jest.fn().mockResolvedValue(
      exists ? { id: 'run-m', baselineSnapshotId: null } : null,
    ),
  };
}

function createIdempotentPromoteStore() {
  const db = new Map<string, any>();
  return {
    db,
    claimOrGet: jest.fn(async (incidentId: string, runId: string, requestId: string) => {
      const key = `${incidentId}::${runId}`;
      const existing = db.get(key);
      if (existing) return { record: existing, isNew: false };
      const record = {
        id: `id-${requestId}`,
        requestId,
        incidentId,
        runId,
        status: 'IN_PROGRESS' as const,
        resultRef: null,
        createdAt: new Date('2026-02-10T00:00:00Z'),
        updatedAt: new Date('2026-02-10T00:00:00Z'),
      };
      db.set(key, record);
      return { record, isNew: true };
    }),
    get: jest.fn(),
    markSucceeded: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
}

function buildPromoteService(overrides: Record<string, any> = {}) {
  process.env.PHASE7_ENABLED = 'false';
  const featureFlag = overrides.featureFlag ?? createMockFeatureFlag();
  const promoteStore = overrides.promoteStore ?? createIdempotentPromoteStore();
  const runStore = overrides.runStore ?? createMockRunStore();
  const metrics = overrides.metrics ?? createMockMetrics();
  const audit = overrides.audit ?? createMockAudit();
  const clock = overrides.clock ?? createMockClock();
  const snapshotProvider = overrides.snapshotProvider ?? { getSnapshot: jest.fn().mockResolvedValue(null) };

  const service = new PromoteService(
    featureFlag as any,
    promoteStore as any,
    runStore as any,
    metrics as any,
    audit as any,
    clock,
    snapshotProvider as any,
  );
  return { service, featureFlag, promoteStore, runStore, metrics, audit, clock, snapshotProvider };
}

// ============================================================================
// Escalation Service Helpers
// ============================================================================

function createMockStateRepo(overrides: Record<string, any> = {}) {
  const state = {
    incidentId: 'inc-esc',
    currentLevel: 'NONE' as const,
    lastTransitionAt: '2026-02-09T00:00:00Z',
    holdDownUntil: null,
    stableWindowCounter: 0,
    stableWindowStartedAt: null,
    version: 1,
  };
  return {
    getState: jest.fn().mockResolvedValue(state),
    initState: jest.fn().mockResolvedValue(state),
    saveStateWithCas: jest.fn().mockResolvedValue({ ...state, version: 2 }),
    updateWithRetry: jest.fn(async (_incidentId: string, mutate: Function) => {
      const patch = mutate(state);
      return { ...state, ...patch, version: 2 };
    }),
    ...overrides,
  };
}

function buildEscalationService(overrides: Record<string, any> = {}) {
  const stateRepo = overrides.stateRepo ?? createMockStateRepo();
  const metrics = overrides.metrics ?? createMockMetrics();
  const featureFlag = overrides.featureFlag ?? createMockFeatureFlag();
  const config = {
    escalateThreshold: 0.8,
    deescalateThreshold: 0.4,
    stableWindowRunCount: 5,
    stableWindowMinutes: 10,
    holdDownMinutes: 15,
  };

  const service = new HysteresisEscalationService(
    stateRepo as any,
    metrics as any,
    featureFlag as any,
    config,
  );
  return { service, stateRepo, metrics, featureFlag };
}

// ============================================================================
// Tests — T22: Metrics Failure Isolation (F15)
// ============================================================================

describe('T22 — Metrics Failure Isolation (F15)', () => {

  afterEach(() => {
    delete process.env.PHASE7_ENABLED;
  });

  // --------------------------------------------------------------------------
  // Test 1: MI-1 — promote ACCEPTED path + metrics throw
  // --------------------------------------------------------------------------
  it('metrics_throw_during_promote_accepted_returns_accepted', async () => {
    const metrics = createMockMetrics({
      incPromoteSuccess: jest.fn(() => { throw new Error('metrics DB down'); }),
    });
    const { service, promoteStore } = buildPromoteService({ metrics });

    const result = await service.promote('inc-f15-1', 'run-f15-1', 'actor');

    expect(result.status).toBe('ACCEPTED');
    expect(promoteStore.markSucceeded).toHaveBeenCalledWith('inc-f15-1', 'run-f15-1');
    // Metrics was called exactly once (no retry)
    expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Test 2: MI-1 — idempotent replay + metrics throw
  // --------------------------------------------------------------------------
  it('metrics_throw_during_idempotent_replay_returns_already_promoted', async () => {
    const metrics = createMockMetrics({
      incPromoteSuccess: jest.fn(() => { throw new Error('metrics DB down'); }),
    });
    const { service } = buildPromoteService({ metrics });

    // First call: ACCEPTED
    const r1 = await service.promote('inc-f15-2', 'run-f15-2', 'actor');
    expect(r1.status).toBe('ACCEPTED');

    // Replay: ALREADY_PROMOTED — metrics throw on first call doesn't corrupt replay
    const r2 = await service.promote('inc-f15-2', 'run-f15-2', 'actor');
    expect(r2.status).toBe('ALREADY_PROMOTED');
    expect((r2 as any).requestId).toBe((r1 as any).requestId);
  });

  // --------------------------------------------------------------------------
  // Test 3: MI-1 — evaluate path + metrics throw
  // --------------------------------------------------------------------------
  it('metrics_throw_during_evaluate_does_not_change_decision', async () => {
    const metrics = createMockMetrics({
      incEscalationChurn: jest.fn(() => { throw new Error('metrics prom down'); }),
    });
    const { service } = buildEscalationService({ metrics });

    // metricValue=0.9 > escalateThreshold=0.8 → ESCALATE
    const result = await service.evaluate('inc-esc-f15', 0.9, new Date('2026-02-10T00:00:00Z'));

    expect(result.decision.action).toBe('ESCALATE');
    expect(result.transitioned).toBe(true);
    // Metrics was called (and threw), but decision unchanged
    expect(metrics.incEscalationChurn).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // Test 4: MI-2 — no retry storm
  // --------------------------------------------------------------------------
  it('metrics_timeout_no_retry_single_attempt', async () => {
    let callCount = 0;
    const metrics = createMockMetrics({
      incPromoteSuccess: jest.fn(() => {
        callCount++;
        throw new Error('metrics timeout');
      }),
    });
    const { service } = buildPromoteService({ metrics });

    const result = await service.promote('inc-f15-4', 'run-f15-4', 'actor');

    expect(result.status).toBe('ACCEPTED');
    // Exactly 1 attempt, no retry
    expect(callCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Test 5: MI-1 — metrics fail does not cascade to audit
  // --------------------------------------------------------------------------
  it('metrics_fail_does_not_cascade_to_audit', async () => {
    const metrics = createMockMetrics({
      incPromoteSuccess: jest.fn(() => { throw new Error('metrics down'); }),
    });
    const audit = createMockAudit();
    const { service } = buildPromoteService({ metrics, audit });

    await service.promote('inc-f15-5', 'run-f15-5', 'actor');

    // Audit event still emitted despite metrics failure
    expect(audit.logSimulationEvent).toHaveBeenCalledTimes(1);
    expect(audit.events[0].eventType).toBe('PROMOTE_ACCEPTED');
  });

  // --------------------------------------------------------------------------
  // Test 6: MI-1 — drift block path + metrics throw
  // --------------------------------------------------------------------------
  it('metrics_fail_during_drift_block_returns_drift_detected', async () => {
    const metrics = createMockMetrics({
      incDriftDetected: jest.fn(() => { throw new Error('metrics down'); }),
      incPromoteFailure: jest.fn(() => { throw new Error('metrics down'); }),
      incPhase7Block: jest.fn(() => { throw new Error('metrics down'); }),
      incPhase7Evaluation: jest.fn(() => { throw new Error('metrics down'); }),
    });

    // Phase-7 enabled with drift-triggering snapshots
    // DRIFT_THRESHOLD_OVERRIDE must be set BEFORE buildPromoteService (capturePhase7Config reads at pipeline start)
    process.env.PHASE7_ENABLED = 'true';
    process.env.DRIFT_THRESHOLD_OVERRIDE = '0.01';

    const baselineSnapshot = {
      snapshotId: 'snap-base',
      tenantId: 't1',
      incidentId: 'inc-f15-6',
      capturedAt: '2026-02-10T00:00:00Z',
      points: [{ metric: 'error_rate' as const, value: 0.01, confidence: 1, freshnessSec: 0 }],
    };
    const currentSnapshot = {
      snapshotId: 'snap-curr',
      tenantId: 't1',
      incidentId: 'inc-f15-6',
      capturedAt: '2026-02-10T00:01:00Z',
      points: [{ metric: 'error_rate' as const, value: 0.99, confidence: 1, freshnessSec: 0 }],
    };
    const snapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(baselineSnapshot)  // baseline
        .mockResolvedValueOnce(currentSnapshot),   // current (fresh)
    };
    const runStore = {
      findById: jest.fn().mockResolvedValue({
        id: 'run-drift',
        baselineSnapshotId: 'snap-base',
        currentSnapshotId: 'snap-curr',
      }),
    };
    const promoteStore = createIdempotentPromoteStore();

    const service = new PromoteService(
      createMockFeatureFlag() as any,
      promoteStore as any,
      runStore as any,
      metrics as any,
      createMockAudit() as any,
      createMockClock(),
      snapshotProvider as any,
    );

    const result = await service.promote('inc-f15-6', 'run-drift', 'actor');

    expect(result.status).toBe('DRIFT_DETECTED');
    expect(promoteStore.markFailed).toHaveBeenCalled();
    // Metrics were called (and threw) but business outcome correct
    expect(metrics.incDriftDetected).toHaveBeenCalledTimes(1);

    delete process.env.DRIFT_THRESHOLD_OVERRIDE;
  });

  // --------------------------------------------------------------------------
  // Test 7: MI-2 — slow-hang (never resolves) does not block pipeline
  // --------------------------------------------------------------------------
  it('metrics_slow_hang_does_not_block_pipeline', async () => {
    // Current metrics client is sync — a sync throw is the worst case.
    // This test verifies that even if metrics were to become a slow sync
    // operation, the pipeline still completes. Since our client is sync,
    // we simulate "hang" as a very slow sync operation that still throws.
    const metrics = createMockMetrics({
      incPromoteSuccess: jest.fn(() => {
        // Simulate expensive sync work that eventually throws
        const start = Date.now();
        while (Date.now() - start < 5) { /* busy wait 5ms */ }
        throw new Error('metrics slow then fail');
      }),
    });
    const { service } = buildPromoteService({ metrics });

    const startTime = Date.now();
    const result = await service.promote('inc-f15-7', 'run-f15-7', 'actor');
    const elapsed = Date.now() - startTime;

    expect(result.status).toBe('ACCEPTED');
    // Pipeline should complete in reasonable time (< 5 seconds)
    expect(elapsed).toBeLessThan(5000);
    expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(1);
  });
});
