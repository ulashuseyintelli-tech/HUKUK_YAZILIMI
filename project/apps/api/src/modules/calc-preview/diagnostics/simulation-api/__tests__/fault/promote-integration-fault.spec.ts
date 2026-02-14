/**
 * Promote → Escalation Cross-Boundary Integration — Tier-2
 *
 * Phase-7 independent contract tests. These lock three invariants:
 *   1. Idempotency propagation: same (incidentId, runId) → same requestId, same response class
 *   2. Exactly-once effects: at most 1 DB row, 1 audit event, 1 metric increment per unique key
 *   3. Deterministic outcomes: same input → same status/HTTP/metric regardless of call count
 *
 * Phase-7 is currently no-op (always allow, driftScore=0). These tests verify
 * the pipeline contract above the Phase-7 boundary. When Phase-7 is wired,
 * these tests become the regression shield.
 *
 * @see .kiro/specs/fault-injection-harness/design.md — D6
 */

import { PromoteService } from '../../promote.service';
import {
  SimulationDisabledException,
  RunNotFoundException,
} from '../../simulation-error.types';
import { buildAuditIdempotencyKey } from '../../simulation-audit.types';
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
    findById: jest.fn().mockResolvedValue(exists ? { id: 'run-t2' } : null),
  };
}

/**
 * In-memory promote store with P2002 idempotency semantics.
 * INSERT-or-SELECT: first call creates, subsequent calls return existing.
 */
function createIdempotentPromoteStore() {
  const db = new Map<string, any>();
  let claimCallCount = 0;

  return {
    db,
    get claimCallCount() { return claimCallCount; },

    claimOrGet: jest.fn(async (incidentId: string, runId: string, requestId: string) => {
      claimCallCount++;
      const key = `${incidentId}::${runId}`;
      const existing = db.get(key);
      if (existing) {
        return { record: existing, isNew: false };
      }
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

function buildService(overrides: {
  featureFlag?: any;
  promoteStore?: any;
  runStore?: any;
  metrics?: any;
  audit?: any;
  clock?: any;
} = {}) {
  const featureFlag = overrides.featureFlag ?? createMockFeatureFlag();
  const promoteStore = overrides.promoteStore ?? createIdempotentPromoteStore();
  const runStore = overrides.runStore ?? createMockRunStore();
  const metrics = overrides.metrics ?? createMockMetrics();
  const audit = overrides.audit ?? createMockAudit();
  const clock = overrides.clock ?? createMockClock();

  const service = new PromoteService(
    featureFlag as any,
    promoteStore as any,
    runStore as any,
    metrics as any,
    audit as any,
    clock,
  );

  return { service, featureFlag, promoteStore, runStore, metrics, audit, clock };
}

// ============================================================================
// Tests
// ============================================================================

describe('Promote Pipeline — Cross-Boundary Integration (Tier-2)', () => {

  // ==========================================================================
  // 1. Idempotency Propagation
  // ==========================================================================

  describe('idempotency_propagation_same_key_same_response_class', () => {
    it('N calls with same (incidentId, runId) → 1 ACCEPTED + (N-1) ALREADY_PROMOTED, same requestId', async () => {
      const { service, promoteStore, metrics, audit } = buildService();

      const N = 5;
      const results = [];
      for (let i = 0; i < N; i++) {
        results.push(await service.promote('inc-t2', 'run-t2', 'actor-t2'));
      }

      // First call: ACCEPTED
      expect(results[0].status).toBe('ACCEPTED');
      const acceptedRequestId = (results[0] as any).requestId;

      // Subsequent calls: ALREADY_PROMOTED with same requestId
      for (let i = 1; i < N; i++) {
        expect(results[i].status).toBe('ALREADY_PROMOTED');
        expect((results[i] as any).requestId).toBe(acceptedRequestId);
      }

      // DB: exactly 1 row
      expect(promoteStore.db.size).toBe(1);

      // Metrics: promote_success_total incremented exactly once
      expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(1);

      // Audit: PROMOTE_ACCEPTED emitted exactly once (replay path skips audit)
      expect(audit.logSimulationEvent).toHaveBeenCalledTimes(1);
      expect(audit.events[0].eventType).toBe('PROMOTE_ACCEPTED');
    });

    it('different (incidentId, runId) pairs → independent rows and metrics', async () => {
      const { service, promoteStore, metrics } = buildService();

      const r1 = await service.promote('inc-a', 'run-a', 'actor');
      const r2 = await service.promote('inc-b', 'run-b', 'actor');

      expect(r1.status).toBe('ACCEPTED');
      expect(r2.status).toBe('ACCEPTED');
      expect((r1 as any).requestId).not.toBe((r2 as any).requestId);

      // 2 independent rows
      expect(promoteStore.db.size).toBe(2);

      // 2 success metrics
      expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // 2. Exactly-Once Effects Under Concurrency
  // ==========================================================================

  describe('exactly_once_effects_concurrent_promote_calls', () => {
    it('Promise.all with same key → exactly 1 ACCEPTED, rest ALREADY_PROMOTED', async () => {
      const { service, promoteStore, metrics, audit } = buildService();

      // 10 concurrent calls with same key
      const promises = Array.from({ length: 10 }, () =>
        service.promote('inc-race', 'run-race', 'actor-race'),
      );
      const results = await Promise.all(promises);

      const accepted = results.filter(r => r.status === 'ACCEPTED');
      const replayed = results.filter(r => r.status === 'ALREADY_PROMOTED');

      // Exactly 1 winner
      expect(accepted.length).toBe(1);
      expect(replayed.length).toBe(9);

      // All return same requestId
      const requestIds = new Set(results.map(r => (r as any).requestId));
      expect(requestIds.size).toBe(1);

      // DB: 1 row
      expect(promoteStore.db.size).toBe(1);

      // Metrics: 1 success
      expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(1);

      // Audit: 1 event
      expect(audit.logSimulationEvent).toHaveBeenCalledTimes(1);
    });

    it('concurrent calls with different keys → independent effects', async () => {
      const { service, promoteStore, metrics } = buildService();

      const promises = Array.from({ length: 5 }, (_, i) =>
        service.promote(`inc-${i}`, `run-${i}`, 'actor'),
      );
      const results = await Promise.all(promises);

      // All ACCEPTED (different keys)
      expect(results.every(r => r.status === 'ACCEPTED')).toBe(true);

      // 5 independent rows
      expect(promoteStore.db.size).toBe(5);

      // 5 success metrics
      expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(5);
    });
  });

  // ==========================================================================
  // 3. Audit Idempotency Key Correctness
  // ==========================================================================

  describe('audit_idempotency_key_composition_correctness', () => {
    it('audit event key matches canonical composition: eventType:incidentId:runId:requestId', async () => {
      const { service, audit } = buildService();

      await service.promote('inc-key', 'run-key', 'actor-key');

      expect(audit.logSimulationEvent).toHaveBeenCalledTimes(1);
      const event = audit.events[0];

      // Verify all key components are present
      expect(event.eventType).toBe('PROMOTE_ACCEPTED');
      expect(event.incidentId).toBe('inc-key');
      expect(event.runId).toBe('run-key');
      expect(event.requestId).toBeDefined();
      expect(event.actorId).toBe('actor-key');

      // Verify canonical key composition
      const key = buildAuditIdempotencyKey(event);
      expect(key).toBe(`PROMOTE_ACCEPTED:inc-key:run-key:${event.requestId}`);

      // Key is deterministic: same event → same key
      const key2 = buildAuditIdempotencyKey(event);
      expect(key2).toBe(key);
    });

    it('different events produce different idempotency keys', async () => {
      const { service, audit } = buildService();

      await service.promote('inc-a', 'run-a', 'actor');
      await service.promote('inc-b', 'run-b', 'actor');

      expect(audit.events.length).toBe(2);

      const key1 = buildAuditIdempotencyKey(audit.events[0]);
      const key2 = buildAuditIdempotencyKey(audit.events[1]);
      expect(key1).not.toBe(key2);
    });

    it('replay calls do NOT emit duplicate audit events', async () => {
      const { service, audit } = buildService();

      await service.promote('inc-dup', 'run-dup', 'actor');
      await service.promote('inc-dup', 'run-dup', 'actor');
      await service.promote('inc-dup', 'run-dup', 'actor');

      // Only 1 audit event (first ACCEPTED call)
      expect(audit.logSimulationEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 4. Deterministic Outcome Class
  // ==========================================================================

  describe('deterministic_outcome_class_same_input_same_result', () => {
    it('same input always produces same status class regardless of call order', async () => {
      // Run the same scenario 3 times with fresh services
      const outcomes: string[] = [];

      for (let trial = 0; trial < 3; trial++) {
        const { service } = buildService();
        const result = await service.promote('inc-det', 'run-det', 'actor-det');
        outcomes.push(result.status);
      }

      // All trials produce ACCEPTED (fresh store each time)
      expect(outcomes).toEqual(['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
    });

    it('flag disabled → always 503 regardless of store state', async () => {
      const { service } = buildService({
        featureFlag: createMockFeatureFlag(false),
      });

      // Multiple calls → all 503
      for (let i = 0; i < 3; i++) {
        await expect(service.promote('inc-det', 'run-det', 'actor'))
          .rejects.toThrow(SimulationDisabledException);
      }
    });

    it('run not found → always 404 + markFailed', async () => {
      const promoteStore = createIdempotentPromoteStore();
      const { service } = buildService({
        promoteStore,
        runStore: createMockRunStore(false),
      });

      await expect(service.promote('inc-det', 'run-det', 'actor'))
        .rejects.toThrow(RunNotFoundException);

      // markFailed called
      expect(promoteStore.markFailed).toHaveBeenCalledWith('inc-det', 'run-det');
    });
  });

  // ==========================================================================
  // 5. Audit Failure Isolation in Integration Context
  // ==========================================================================

  describe('audit_failure_does_not_corrupt_promote_outcome', () => {
    it('audit throw during ACCEPTED path → promote still returns ACCEPTED', async () => {
      const audit = createMockAudit();
      audit.logSimulationEvent.mockImplementation(() => {
        throw new Error('audit DB down');
      });

      const { service, metrics } = buildService({ audit });

      // Should NOT throw — fire-and-forget in promote.service try/catch
      const result = await service.promote('inc-audit-fail', 'run-audit-fail', 'actor');
      expect(result.status).toBe('ACCEPTED');

      // Metrics still incremented
      expect(metrics.incPromoteSuccess).toHaveBeenCalledTimes(1);
    });

    it('audit failure on first call does not affect idempotent replay', async () => {
      const audit = createMockAudit();
      // First call: audit throws
      audit.logSimulationEvent.mockImplementationOnce(() => {
        throw new Error('audit DB down');
      });
      // Second call: audit succeeds (but won't be called — replay path)

      const { service } = buildService({ audit });

      const r1 = await service.promote('inc-af', 'run-af', 'actor');
      const r2 = await service.promote('inc-af', 'run-af', 'actor');

      expect(r1.status).toBe('ACCEPTED');
      expect(r2.status).toBe('ALREADY_PROMOTED');
      expect((r1 as any).requestId).toBe((r2 as any).requestId);
    });
  });
});
