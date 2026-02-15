/**
 * Phase-7 Drift Integration — Contract Tests (F6, F7, Drift)
 *
 * Tier-2: Tests verify Phase-7 pipeline behavior with real drift detection,
 * snapshot fetching, and fault injection.
 *
 * Contract table:
 *   F6: Snapshot fetch failure → 500 terminal, no retry (K1)
 *   F7: Partial/empty snapshot → 500 terminal, no retry
 *   Drift: calculateDrift wired, threshold-based block
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D6, D8
 */

import { PromoteService } from '../../promote.service';
import type { ISnapshotProvider } from '../../promote.service';
import {
  SimulationDisabledException,
  Phase7TimeoutException,
  Phase7PartialResponseException,
} from '../../simulation-error.types';
import { selectScenario, FAULT_SCENARIOS } from './fault-injector';
import type { IClock } from '../../../evidence/clock.service';
import type { EvidenceSnapshot } from '../../../diagnostics.types';
import { PHASE7_ENV_KEYS } from '../../phase7-config';

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
  return {
    now: jest.fn().mockReturnValue(new Date('2026-02-10T00:00:00Z')),
  } as any;
}

function createMockPromoteStore() {
  const db = new Map<string, any>();
  let callCount = 0;
  return {
    db,
    claimOrGet: jest.fn(async (incidentId: string, runId: string, requestId: string) => {
      const key = `${incidentId}:${runId}`;
      if (db.has(key)) {
        return { record: db.get(key), isNew: false };
      }
      const record = {
        id: `id-${callCount++}`,
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

function createMockRunStore(overrides: Partial<{ baselineSnapshotId: string; currentSnapshotId: string }> = {}) {
  return {
    findById: jest.fn().mockResolvedValue({
      id: 'run-1',
      runId: 'run-1',
      incidentId: 'inc-1',
      tenantId: 'tenant-1',
      scenarioId: 'sc-1',
      seed: 42,
      simulationVersion: '1.0.0',
      status: 'COMPLETED',
      startedAt: '2026-02-10T00:00:00Z',
      baselineSnapshotId: overrides.baselineSnapshotId ?? 'snap-baseline',
      currentSnapshotId: overrides.currentSnapshotId ?? 'snap-current',
    }),
  };
}

/** Build a valid EvidenceSnapshot with matching metrics */
function buildSnapshot(id: string, overrides: Partial<{ points: any[] }> = {}): EvidenceSnapshot {
  return {
    snapshotId: id,
    tenantId: 'tenant-1',
    incidentId: 'inc-1',
    capturedAt: '2026-02-10T00:00:00Z',
    points: overrides.points ?? [
      { metric: 'error_rate', value: 0.02, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      { metric: 'latency_p99', value: 150, unit: 'ms', windowSec: 300, confidence: 0.85, freshnessSec: 15, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      { metric: 'slo_burn_rate', value: 0.5, unit: 'ratio', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
    ],
  };
}

function buildService(overrides: {
  featureFlag?: any;
  promoteStore?: any;
  runStore?: any;
  metrics?: any;
  audit?: any;
  clock?: any;
  snapshotProvider?: any;
} = {}) {
  const featureFlag = overrides.featureFlag ?? createMockFeatureFlag();
  const promoteStore = overrides.promoteStore ?? createMockPromoteStore();
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
// Registry validation (runs always)
// ============================================================================

describe('Phase-7 Drift Integration — Registry Contracts', () => {
  it('F6 and F7 exist in registry as active Tier-2 scenarios with HTTP 500', () => {
    const f6 = selectScenario(42, 'F6');
    const f7 = selectScenario(42, 'F7');

    expect(f6).toBeDefined();
    expect(f6!.tier).toBe(2);
    expect(f6!.active).toBe(true);
    expect(f6!.surface).toBe('phase7_pipeline');
    expect(f6!.expectedHttpClass).toBe(500);

    expect(f7).toBeDefined();
    expect(f7!.tier).toBe(2);
    expect(f7!.active).toBe(true);
    expect(f7!.surface).toBe('phase7_pipeline');
    expect(f7!.expectedHttpClass).toBe(500);
  });
});

// ============================================================================
// F6: External API Fault — snapshot fetch failure
// ============================================================================

describe('F6: Phase-7 External API Fault (Snapshot Fetch Failure)', () => {
  beforeEach(() => {
    process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'true';
  });

  afterEach(() => {
    delete process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED];
  });

  it('snapshot not found → 500 + promote_failure_total(PHASE7_TIMEOUT) + phase7_faults_total{F6}', async () => {
    // snapshotProvider returns null for current snapshot → F6
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))  // baseline OK
        .mockResolvedValueOnce(null),                            // current → not found → F6
    };

    const { service, metrics, promoteStore } = buildService({ snapshotProvider });

    await expect(service.promote('inc-1', 'run-1', 'actor-1'))
      .rejects.toThrow(expect.objectContaining({ status: 500 }));

    // Metrics: F6 fault + promote failure
    expect(metrics.incPhase7Fault).toHaveBeenCalledWith('F6');
    expect(metrics.incPromoteFailure).toHaveBeenCalledWith('PHASE7_TIMEOUT');

    // DB: row marked FAILED
    expect(promoteStore.markFailed).toHaveBeenCalledWith('inc-1', 'run-1');
    expect(promoteStore.markSucceeded).not.toHaveBeenCalled();
  });

  it('snapshot provider throws → 500 + phase7_faults_total{F6}', async () => {
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))
        .mockRejectedValueOnce(new Error('connection reset')),
    };

    const { service, metrics, promoteStore } = buildService({ snapshotProvider });

    await expect(service.promote('inc-1', 'run-1', 'actor-1'))
      .rejects.toThrow(expect.objectContaining({ status: 500 }));

    expect(metrics.incPhase7Fault).toHaveBeenCalledWith('F6');
    expect(promoteStore.markFailed).toHaveBeenCalledWith('inc-1', 'run-1');
  });

  it('F6 after DB write → row status remains IN_PROGRESS then markFailed', async () => {
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))
        .mockResolvedValueOnce(null), // F6
    };

    const { service, promoteStore } = buildService({ snapshotProvider });

    await expect(service.promote('inc-1', 'run-1', 'actor-1')).rejects.toThrow();

    // claimOrGet was called (row created) then markFailed
    expect(promoteStore.claimOrGet).toHaveBeenCalled();
    expect(promoteStore.markFailed).toHaveBeenCalledWith('inc-1', 'run-1');
    expect(promoteStore.markSucceeded).not.toHaveBeenCalled();
  });

  it('retry after F6 → idempotent (same requestId via P2002 path, no duplicate)', async () => {
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))
        .mockResolvedValueOnce(null), // F6 on first call
    };

    const promoteStore = createMockPromoteStore();
    const { service } = buildService({ snapshotProvider, promoteStore });

    // First call: F6
    await expect(service.promote('inc-1', 'run-1', 'actor-1')).rejects.toThrow();

    // Retry: claimOrGet returns existing record (isNew=false) → ALREADY_PROMOTED
    // (markFailed was called, but unique constraint still holds)
    const result = await service.promote('inc-1', 'run-1', 'actor-1');
    expect(result.status).toBe('ALREADY_PROMOTED');
  });
});

// ============================================================================
// F7: Partial Response — snapshot with missing/empty points
// ============================================================================

describe('F7: Phase-7 Partial Response (Empty Evidence Points)', () => {
  beforeEach(() => {
    process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'true';
  });

  afterEach(() => {
    delete process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED];
  });

  it('empty points → 500 + phase7_faults_total{F7} + promote_failure_total(PHASE7_PARTIAL)', async () => {
    const emptySnapshot = buildSnapshot('snap-current', { points: [] });
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))
        .mockResolvedValueOnce(emptySnapshot),
    };

    const { service, metrics, promoteStore } = buildService({ snapshotProvider });

    await expect(service.promote('inc-1', 'run-1', 'actor-1'))
      .rejects.toThrow(expect.objectContaining({ status: 500 }));

    expect(metrics.incPhase7Fault).toHaveBeenCalledWith('F7');
    expect(metrics.incPromoteFailure).toHaveBeenCalledWith('PHASE7_PARTIAL');
    expect(promoteStore.markFailed).toHaveBeenCalledWith('inc-1', 'run-1');
  });

  it('partial response → row marked FAILED, not SUCCEEDED', async () => {
    const emptySnapshot = buildSnapshot('snap-current', { points: [] });
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))
        .mockResolvedValueOnce(emptySnapshot),
    };

    const { service, promoteStore } = buildService({ snapshotProvider });

    await expect(service.promote('inc-1', 'run-1', 'actor-1')).rejects.toThrow();

    expect(promoteStore.markFailed).toHaveBeenCalled();
    expect(promoteStore.markSucceeded).not.toHaveBeenCalled();
  });

  it('partial response → audit event PHASE7_FAULT emitted', async () => {
    const emptySnapshot = buildSnapshot('snap-current', { points: [] });
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))
        .mockResolvedValueOnce(emptySnapshot),
    };

    const { service, audit } = buildService({ snapshotProvider });

    await expect(service.promote('inc-1', 'run-1', 'actor-1')).rejects.toThrow();

    expect(audit.logSimulationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PHASE7_FAULT',
        detail: expect.stringContaining('F7'),
      }),
    );
  });

  it('retry after partial response → fresh attempt (row was FAILED, P2002 → ALREADY_PROMOTED)', async () => {
    const emptySnapshot = buildSnapshot('snap-current', { points: [] });
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(buildSnapshot('snap-baseline'))
        .mockResolvedValueOnce(emptySnapshot),
    };

    const promoteStore = createMockPromoteStore();
    const { service } = buildService({ snapshotProvider, promoteStore });

    // First call: F7
    await expect(service.promote('inc-1', 'run-1', 'actor-1')).rejects.toThrow();

    // Retry: existing row → ALREADY_PROMOTED
    const result = await service.promote('inc-1', 'run-1', 'actor-1');
    expect(result.status).toBe('ALREADY_PROMOTED');
  });
});

// ============================================================================
// Drift Detection — Real drift logic with calculateDrift
// ============================================================================

describe('Drift Detection Integration (Real calculateDrift)', () => {
  beforeEach(() => {
    process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED] = 'true';
  });

  afterEach(() => {
    delete process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED];
  });

  it('drift score > threshold → DRIFT_DETECTED 409 + markFailed + drift_detected_total++', async () => {
    // Baseline: low error rate. Current: high error rate → drift
    const baseline = buildSnapshot('snap-baseline', {
      points: [
        { metric: 'error_rate', value: 0.01, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
        { metric: 'slo_burn_rate', value: 0.1, unit: 'ratio', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });
    const current = buildSnapshot('snap-current', {
      points: [
        { metric: 'error_rate', value: 5.0, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
        { metric: 'slo_burn_rate', value: 10.0, unit: 'ratio', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });

    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(baseline)
        .mockResolvedValueOnce(current),
    };

    const { service, metrics, promoteStore } = buildService({ snapshotProvider });

    const result = await service.promote('inc-1', 'run-1', 'actor-1');

    // HTTP: DRIFT_DETECTED (controller maps to 409)
    expect(result.status).toBe('DRIFT_DETECTED');
    expect((result as any).driftScore).toBeGreaterThan(0);

    // DB: markFailed
    expect(promoteStore.markFailed).toHaveBeenCalledWith('inc-1', 'run-1');
    expect(promoteStore.markSucceeded).not.toHaveBeenCalled();

    // Metrics
    expect(metrics.incDriftDetected).toHaveBeenCalledWith('inc-1');
    expect(metrics.incPromoteFailure).toHaveBeenCalledWith('DRIFT_DETECTED');
    expect(metrics.incPhase7Block).toHaveBeenCalledWith('DRIFT');
    expect(metrics.incPhase7Evaluation).toHaveBeenCalled();
  });

  it('drift score = 0 → ACCEPTED (identical snapshots)', async () => {
    const snapshot = buildSnapshot('snap-baseline');
    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce(snapshot), // same data → drift = 0
    };

    const { service, metrics, promoteStore } = buildService({ snapshotProvider });

    const result = await service.promote('inc-1', 'run-1', 'actor-1');

    expect(result.status).toBe('ACCEPTED');
    expect(promoteStore.markSucceeded).toHaveBeenCalledWith('inc-1', 'run-1');
    expect(metrics.incPromoteSuccess).toHaveBeenCalled();
    expect(metrics.incPhase7Evaluation).toHaveBeenCalled();
  });

  it('drift detected → audit event PROMOTE_DRIFT_BLOCKED emitted', async () => {
    const baseline = buildSnapshot('snap-baseline', {
      points: [
        { metric: 'error_rate', value: 0.01, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });
    const current = buildSnapshot('snap-current', {
      points: [
        { metric: 'error_rate', value: 100.0, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });

    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(baseline)
        .mockResolvedValueOnce(current),
    };

    const { service, audit } = buildService({ snapshotProvider });

    await service.promote('inc-1', 'run-1', 'actor-1');

    // Audit: PROMOTE_DRIFT_BLOCKED + PHASE7_EVALUATED
    const eventTypes = audit.events.map((e: any) => e.eventType);
    expect(eventTypes).toContain('PHASE7_EVALUATED');
    expect(eventTypes).toContain('PROMOTE_DRIFT_BLOCKED');
  });

  it('drift detected → no Phase-7 emit (markSucceeded not called)', async () => {
    const baseline = buildSnapshot('snap-baseline', {
      points: [
        { metric: 'error_rate', value: 0.01, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });
    const current = buildSnapshot('snap-current', {
      points: [
        { metric: 'error_rate', value: 100.0, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });

    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(baseline)
        .mockResolvedValueOnce(current),
    };

    const { service, promoteStore } = buildService({ snapshotProvider });

    await service.promote('inc-1', 'run-1', 'actor-1');

    // Pipeline stopped at drift guard — no Phase-7 emit
    expect(promoteStore.markSucceeded).not.toHaveBeenCalled();
    expect(promoteStore.markFailed).toHaveBeenCalled();
  });

  it('drift + idempotent replay → ALREADY_PROMOTED (no re-evaluation)', async () => {
    const baseline = buildSnapshot('snap-baseline', {
      points: [
        { metric: 'error_rate', value: 0.01, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });
    const current = buildSnapshot('snap-current', {
      points: [
        { metric: 'error_rate', value: 100.0, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-10T00:00:00Z' },
      ],
    });

    const snapshotProvider: ISnapshotProvider = {
      getSnapshot: jest.fn()
        .mockResolvedValueOnce(baseline)
        .mockResolvedValueOnce(current),
    };

    const promoteStore = createMockPromoteStore();
    const { service } = buildService({ snapshotProvider, promoteStore });

    // First call: DRIFT_DETECTED
    const r1 = await service.promote('inc-1', 'run-1', 'actor-1');
    expect(r1.status).toBe('DRIFT_DETECTED');

    // Replay: existing row → ALREADY_PROMOTED (no drift re-evaluation)
    const r2 = await service.promote('inc-1', 'run-1', 'actor-1');
    expect(r2.status).toBe('ALREADY_PROMOTED');

    // snapshotProvider only called for first attempt (2 calls: baseline + current)
    // Second attempt short-circuits at idempotency check
    expect(snapshotProvider.getSnapshot).toHaveBeenCalledTimes(2);
  });
});
