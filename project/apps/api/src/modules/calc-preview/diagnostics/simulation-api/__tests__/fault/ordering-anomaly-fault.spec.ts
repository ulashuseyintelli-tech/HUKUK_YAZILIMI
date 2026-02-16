/**
 * T23 — Ordering Anomaly Invariants (F16)
 *
 * Verifies that different promote calls under ordering anomalies
 * (mid-flight failure, replay after partial failure, completion-order inversion)
 * do not corrupt each other's state.
 *
 * Invariants:
 *   OI-1: Cross-key isolation — operations on key A cannot change key B's state
 *   No double-commit, no state corruption, audit completeness preserved
 *
 * Terminology: NO "rollback" — correct terms:
 *   - mid-flight failure
 *   - replay after partial failure
 *   - cross-key isolation
 *   - completion-order inversion
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D9.2
 * @see .kiro/specs/fault-injection-harness/requirements.md — Requirement 11
 */

import { PromoteService } from '../../promote.service';
import { RunNotFoundException } from '../../simulation-error.types';
import type { IClock } from '../../../evidence/clock.service';

// ============================================================================
// Mock Factories
// ============================================================================

function createMockFeatureFlag(enabled = true) {
  return { isSimulationEnabled: jest.fn().mockReturnValue(enabled) };
}

function createMockMetrics() {
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
      exists ? { id: 'run-ord', baselineSnapshotId: null } : null,
    ),
  };
}

/**
 * In-memory promote store with P2002 idempotency semantics.
 * Supports per-key markSucceeded failure injection for mid-flight failure tests.
 */
function createIdempotentPromoteStore(opts: {
  markSucceededFailKeys?: Set<string>;
} = {}) {
  const db = new Map<string, any>();
  const markSucceededCalls: Array<{ incidentId: string; runId: string }> = [];
  const markFailedCalls: Array<{ incidentId: string; runId: string }> = [];

  return {
    db,
    markSucceededCalls,
    markFailedCalls,

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

    markSucceeded: jest.fn(async (incidentId: string, runId: string) => {
      markSucceededCalls.push({ incidentId, runId });
      const key = `${incidentId}::${runId}`;
      if (opts.markSucceededFailKeys?.has(key)) {
        throw new Error(`markSucceeded DB failure for ${key}`);
      }
      const record = db.get(key);
      if (record) record.status = 'SUCCEEDED';
    }),

    markFailed: jest.fn(async (incidentId: string, runId: string) => {
      markFailedCalls.push({ incidentId, runId });
      const record = db.get(`${incidentId}::${runId}`);
      if (record) record.status = 'FAILED';
    }),
  };
}

function buildService(overrides: Record<string, any> = {}) {
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
// Tests — T23: Ordering Anomaly Invariants (F16)
// ============================================================================

describe('T23 — Ordering Anomaly Invariants (F16)', () => {

  afterEach(() => {
    delete process.env.PHASE7_ENABLED;
  });

  // --------------------------------------------------------------------------
  // Test 1: Mid-flight failure + cross-key isolation
  // A: INSERT ok → markSucceeded throws (mid-flight failure)
  // B: full success for different key
  // A replay → ALREADY_PROMOTED (row exists from first INSERT)
  // B state unchanged
  // --------------------------------------------------------------------------
  it('A_mid_flight_fail_B_succeed_A_replay_B_unchanged', async () => {
    const promoteStore = createIdempotentPromoteStore({
      markSucceededFailKeys: new Set(['inc-A::run-A']),
    });
    const metrics = createMockMetrics();
    const audit = createMockAudit();

    const { service } = buildService({ promoteStore, metrics, audit });

    // A: mid-flight failure (INSERT ok, markSucceeded throws)
    await expect(service.promote('inc-A', 'run-A', 'actor'))
      .rejects.toThrow('markSucceeded DB failure');

    // B: full success (different key)
    const resultB = await service.promote('inc-B', 'run-B', 'actor');
    expect(resultB.status).toBe('ACCEPTED');

    // A replay: row exists from first INSERT → ALREADY_PROMOTED
    const resultA2 = await service.promote('inc-A', 'run-A', 'actor');
    expect(resultA2.status).toBe('ALREADY_PROMOTED');

    // OI-1: B state unchanged — B's row still SUCCEEDED
    const bRecord = promoteStore.db.get('inc-B::run-B');
    expect(bRecord.status).toBe('SUCCEEDED');

    // No double-commit: markSucceeded for A called exactly once (the failed one)
    const aSucceededCalls = promoteStore.markSucceededCalls.filter(
      c => c.incidentId === 'inc-A',
    );
    expect(aSucceededCalls.length).toBe(1);

    // B metrics independent
    expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(1); // only B
  });

  // --------------------------------------------------------------------------
  // Test 2: Both succeed, A replay → no mutation
  // --------------------------------------------------------------------------
  it('A_succeed_B_succeed_A_replay_no_mutation', async () => {
    const promoteStore = createIdempotentPromoteStore();
    const metrics = createMockMetrics();

    const { service } = buildService({ promoteStore, metrics });

    // A: ACCEPTED
    const resultA = await service.promote('inc-A2', 'run-A2', 'actor');
    expect(resultA.status).toBe('ACCEPTED');

    // B: ACCEPTED (different key)
    const resultB = await service.promote('inc-B2', 'run-B2', 'actor');
    expect(resultB.status).toBe('ACCEPTED');

    // A replay: ALREADY_PROMOTED, no mutation
    const resultA2 = await service.promote('inc-A2', 'run-A2', 'actor');
    expect(resultA2.status).toBe('ALREADY_PROMOTED');
    expect((resultA2 as any).requestId).toBe((resultA as any).requestId);

    // No extra DB writes: markSucceeded called exactly 2 times (A + B, not A replay)
    expect(promoteStore.markSucceeded).toHaveBeenCalledTimes(2);

    // B unchanged
    const bRecord = promoteStore.db.get('inc-B2::run-B2');
    expect(bRecord.status).toBe('SUCCEEDED');

    // Metrics: 2 success (A + B), not 3
    expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(2);
  });

  // --------------------------------------------------------------------------
  // Test 3: Concurrent different keys, arbitrary completion order (OI-1)
  // --------------------------------------------------------------------------
  it('A_B_concurrent_different_keys_arbitrary_completion_order', async () => {
    // Inject artificial delay on A's run lookup to force completion-order inversion
    let resolveA: () => void;
    const aDelay = new Promise<void>(r => { resolveA = r; });

    const runStore = {
      findById: jest.fn(async (runId: string) => {
        if (runId === 'run-C1') {
          await aDelay; // A waits
        }
        return { id: runId, baselineSnapshotId: null };
      }),
    };

    const promoteStore = createIdempotentPromoteStore();
    const metrics = createMockMetrics();
    const audit = createMockAudit();

    const { service } = buildService({ promoteStore, metrics, audit, runStore });

    // Start A and B concurrently — B will complete first
    const promiseA = service.promote('inc-C1', 'run-C1', 'actor');
    const promiseB = service.promote('inc-C2', 'run-C2', 'actor');

    // Let B complete first, then release A
    const resultB = await promiseB;
    resolveA!();
    const resultA = await promiseA;

    // Both ACCEPTED (different keys)
    expect(resultA.status).toBe('ACCEPTED');
    expect(resultB.status).toBe('ACCEPTED');

    // Each key: exactly 1 row
    expect(promoteStore.db.size).toBe(2);
    expect(promoteStore.db.get('inc-C1::run-C1')).toBeDefined();
    expect(promoteStore.db.get('inc-C2::run-C2')).toBeDefined();

    // Independent metrics: 2 success
    expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(2);

    // Independent audit: 2 events, different keys
    expect(audit.events.length).toBe(2);
    const auditKeys = new Set(audit.events.map((e: any) => `${e.incidentId}:${e.runId}`));
    expect(auditKeys.size).toBe(2);

    // OI-1: No cross-contamination — each row has correct requestId
    expect((resultA as any).requestId).not.toBe((resultB as any).requestId);
  });

  // --------------------------------------------------------------------------
  // Test 4: Mid-flight failure (run lookup throws) → markFailed, replay → ALREADY_PROMOTED
  // No markSucceeded ever called for failed run
  // --------------------------------------------------------------------------
  it('mid_flight_fail_no_double_commit_no_state_corruption', async () => {
    const runStore = {
      findById: jest.fn()
        .mockResolvedValueOnce(null) // First call: run not found → markFailed
        .mockResolvedValue({ id: 'run-D', baselineSnapshotId: null }), // Subsequent: found
    };

    const promoteStore = createIdempotentPromoteStore();
    const metrics = createMockMetrics();

    const { service } = buildService({ promoteStore, metrics, runStore });

    // First call: run not found → RunNotFoundException + markFailed
    await expect(service.promote('inc-D', 'run-D', 'actor'))
      .rejects.toThrow(RunNotFoundException);

    // markFailed called
    expect(promoteStore.markFailed).toHaveBeenCalledWith('inc-D', 'run-D');
    const record = promoteStore.db.get('inc-D::run-D');
    expect(record.status).toBe('FAILED');

    // Replay: row exists → ALREADY_PROMOTED (no new INSERT, no markSucceeded)
    const result = await service.promote('inc-D', 'run-D', 'actor');
    expect(result.status).toBe('ALREADY_PROMOTED');

    // No double-commit: markSucceeded never called for this key
    const succeededCalls = promoteStore.markSucceededCalls.filter(
      c => c.incidentId === 'inc-D',
    );
    expect(succeededCalls.length).toBe(0);

    // No state corruption: row still FAILED (replay doesn't change status)
    expect(record.status).toBe('FAILED');

    // Metrics: no success for this key
    expect(metrics.incPromoteSuccess).not.toHaveBeenCalled();
  });
});
