/**
 * Chaos/Soak Test Helpers
 *
 * Ortak mock factory'ler, metric spy, red flag checker.
 * Phase-7 aware: snapshotProvider, phase7_* counters dahil.
 *
 * @see .kiro/specs/chaos-soak-validation/design.md — CS2
 */

import type { ISnapshotProvider } from '../../../promote.service';
import type { IClock } from '../../../../evidence/clock.service';
import type { EvidenceSnapshot } from '../../../../diagnostics.types';
import { PHASE7_ENV_KEYS } from '../../../phase7-config';

// ============================================================================
// Types
// ============================================================================

export interface ChaosMetricsSnapshot {
  promote_success_total: number;
  promote_failure_total: Record<string, number>;
  drift_detected_total: number;
  escalation_state_conflict_total: number;
  phase7_evaluations_total: number;
  phase7_blocks_total: Record<string, number>;
  phase7_faults_total: Record<string, number>;
  audit_write_failed_total: number;
}

export interface RedFlagResult {
  passed: boolean;
  flags: string[];
}

export interface ChaosRoundResult {
  round: number;
  totalCalls: number;
  errors: Array<{ status?: number; message: string }>;
  successes: Array<{ status: string; requestId?: string }>;
  metrics: ChaosMetricsSnapshot;
  redFlags: RedFlagResult;
}

// ============================================================================
// Mock Factories
// ============================================================================

export function createChaosClock(): jest.Mocked<IClock> {
  return {
    now: jest.fn().mockReturnValue(new Date('2026-02-14T12:00:00Z')),
  } as any;
}

export function createChaosFeatureFlag(enabled = true) {
  return { isSimulationEnabled: jest.fn().mockReturnValue(enabled) };
}

export function createChaosAudit() {
  const events: any[] = [];
  return {
    events,
    logSimulationEvent: jest.fn((event: any) => events.push(event)),
    getEventsByType(type: string) {
      return events.filter((e) => e.eventType === type);
    },
    getEventsByRequestId(requestId: string) {
      return events.filter((e) => e.requestId === requestId);
    },
    clear() {
      events.length = 0;
      (this.logSimulationEvent as jest.Mock).mockClear();
    },
  };
}

export function createChaosPromoteStore() {
  const db = new Map<string, any>();
  let callCount = 0;
  let markFailedCount = 0;
  let markSucceededCount = 0;

  return {
    db,
    get markFailedCallCount() { return markFailedCount; },
    get markSucceededCallCount() { return markSucceededCount; },
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
        createdAt: new Date('2026-02-14T12:00:00Z'),
        updatedAt: new Date('2026-02-14T12:00:00Z'),
      };
      db.set(key, record);
      return { record, isNew: true };
    }),
    markSucceeded: jest.fn(async () => { markSucceededCount++; }),
    markFailed: jest.fn(async () => { markFailedCount++; }),
    resetCounters() {
      markFailedCount = 0;
      markSucceededCount = 0;
      db.clear();
      callCount = 0;
    },
  };
}

export function createChaosRunStore(overrides: Partial<{
  baselineSnapshotId: string;
  currentSnapshotId: string;
}> = {}) {
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
      startedAt: '2026-02-14T12:00:00Z',
      baselineSnapshotId: overrides.baselineSnapshotId ?? 'snap-baseline',
      currentSnapshotId: overrides.currentSnapshotId ?? 'snap-current',
    }),
  };
}

// ============================================================================
// Chaos Metrics Spy (Phase-7 aware)
// ============================================================================

export class ChaosMetricsSpy {
  private counts: ChaosMetricsSnapshot = this.emptySnapshot();

  readonly mock = {
    incPromoteSuccess: jest.fn(() => { this.counts.promote_success_total++; }),
    incPromoteFailure: jest.fn((reason: string) => {
      this.counts.promote_failure_total[reason] =
        (this.counts.promote_failure_total[reason] ?? 0) + 1;
    }),
    incDriftDetected: jest.fn(() => { this.counts.drift_detected_total++; }),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(() => {
      this.counts.escalation_state_conflict_total++;
    }),
    incAuditWriteFailed: jest.fn(() => { this.counts.audit_write_failed_total++; }),
    incPhase7Evaluation: jest.fn(() => { this.counts.phase7_evaluations_total++; }),
    incPhase7Block: jest.fn((reason: string) => {
      this.counts.phase7_blocks_total[reason] =
        (this.counts.phase7_blocks_total[reason] ?? 0) + 1;
    }),
    incPhase7Fault: jest.fn((fault: string) => {
      this.counts.phase7_faults_total[fault] =
        (this.counts.phase7_faults_total[fault] ?? 0) + 1;
    }),
  };

  snapshot(): ChaosMetricsSnapshot {
    return {
      ...this.counts,
      promote_failure_total: { ...this.counts.promote_failure_total },
      phase7_blocks_total: { ...this.counts.phase7_blocks_total },
      phase7_faults_total: { ...this.counts.phase7_faults_total },
    };
  }

  reset(): void {
    this.counts = this.emptySnapshot();
    Object.values(this.mock).forEach((fn) => fn.mockClear());
  }

  private emptySnapshot(): ChaosMetricsSnapshot {
    return {
      promote_success_total: 0,
      promote_failure_total: {},
      drift_detected_total: 0,
      escalation_state_conflict_total: 0,
      phase7_evaluations_total: 0,
      phase7_blocks_total: {},
      phase7_faults_total: {},
      audit_write_failed_total: 0,
    };
  }
}

// ============================================================================
// Red Flag Checker
// ============================================================================

export class RedFlagChecker {
  /**
   * Check all red flags after a chaos/soak round.
   * Any flag raised → test should FAIL.
   */
  check(opts: {
    metrics: ChaosMetricsSnapshot;
    promoteStore: ReturnType<typeof createChaosPromoteStore>;
    audit: ReturnType<typeof createChaosAudit>;
    expectedFaultLabels?: string[];
    expectNoConflictMetric?: boolean;
  }): RedFlagResult {
    const flags: string[] = [];

    // RF1: Cardinality leak — unexpected fault labels
    if (opts.expectedFaultLabels) {
      const actualLabels = Object.keys(opts.metrics.phase7_faults_total);
      const unexpected = actualLabels.filter((l) => !opts.expectedFaultLabels!.includes(l));
      if (unexpected.length > 0) {
        flags.push(`CARDINALITY_LEAK: unexpected fault labels: ${unexpected.join(', ')}`);
      }
    }

    // RF4: CAS metric leak under IO fault
    if (opts.expectNoConflictMetric && opts.metrics.escalation_state_conflict_total > 0) {
      flags.push(`CAS_METRIC_LEAK: escalation_state_conflict_total = ${opts.metrics.escalation_state_conflict_total} (expected 0 under IO fault)`);
    }

    // RF5: Double commit — markSucceeded + markFailed both > 0 for same request
    // (simplified: if both counters > 0 in a pure-fault scenario, something is wrong)
    if (opts.promoteStore.markSucceededCallCount > 0 && opts.promoteStore.markFailedCallCount > 0) {
      // Only flag if this is a pure-fault scenario (all calls should fail)
      const totalFaults = Object.values(opts.metrics.phase7_faults_total).reduce((a, b) => a + b, 0);
      if (totalFaults > 0 && opts.metrics.promote_success_total === 0) {
        flags.push(`DOUBLE_COMMIT: markSucceeded=${opts.promoteStore.markSucceededCallCount} + markFailed=${opts.promoteStore.markFailedCallCount} in pure-fault scenario`);
      }
    }

    // RF3: Audit spam — same requestId + same eventType more than once
    const auditKeySet = new Set<string>();
    for (const event of opts.audit.events) {
      const key = `${event.requestId}:${event.eventType}`;
      if (auditKeySet.has(key)) {
        flags.push(`AUDIT_SPAM: duplicate audit event ${key}`);
        break; // One flag is enough
      }
      auditKeySet.add(key);
    }

    return { passed: flags.length === 0, flags };
  }
}

// ============================================================================
// Snapshot Builders
// ============================================================================

export function buildChaosSnapshot(
  id: string,
  overrides: Partial<{ points: any[] }> = {},
): EvidenceSnapshot {
  return {
    snapshotId: id,
    tenantId: 'tenant-1',
    incidentId: 'inc-1',
    capturedAt: '2026-02-14T12:00:00Z',
    points: overrides.points ?? [
      { metric: 'error_rate', value: 0.02, unit: '%', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-14T12:00:00Z' },
      { metric: 'latency_p99', value: 150, unit: 'ms', windowSec: 300, confidence: 0.85, freshnessSec: 15, source: 'prometheus', timestamp: '2026-02-14T12:00:00Z' },
      { metric: 'slo_burn_rate', value: 0.5, unit: 'ratio', windowSec: 300, confidence: 0.9, freshnessSec: 10, source: 'prometheus', timestamp: '2026-02-14T12:00:00Z' },
    ],
  };
}

// ============================================================================
// Env Cleanup
// ============================================================================

export function cleanupPhase7Env(): void {
  delete process.env[PHASE7_ENV_KEYS.PHASE7_ENABLED];
  delete process.env[PHASE7_ENV_KEYS.DRIFT_THRESHOLD_OVERRIDE];
}
