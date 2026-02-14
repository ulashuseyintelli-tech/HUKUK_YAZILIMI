/**
 * Audit Adapter — Fault Injection Tests (F3)
 *
 * F3 sync:  logAccessAttempt throws → main op unchanged + counter + log
 * F3 async: logAccessAttempt returns rejecting Promise → .catch() handles it
 *
 * Assertion triple: main op outcome + metric increment + structured log
 *
 * Fire-and-forget contract: audit failure NEVER surfaces to caller.
 *
 * @see .kiro/specs/fault-injection-harness/requirements.md — Req 2, 8
 * @see .kiro/specs/fault-injection-harness/design.md — D2.3, D6
 */

import { SimulationAuditAdapter } from '../../simulation-audit.adapter';
import { selectScenario } from './fault-injector';

// ============================================================================
// Helpers
// ============================================================================

const SEED = 42;

function createMockAuditService(behavior: 'success' | 'sync_throw' | 'async_reject') {
  return {
    logAccessAttempt: jest.fn().mockImplementation(() => {
      if (behavior === 'sync_throw') {
        throw new Error('audit DB timeout (simulated)');
      }
      if (behavior === 'async_reject') {
        return Promise.reject(new Error('audit async rejection (simulated)'));
      }
      // success: void return (sync)
    }),
  };
}

function createMockMetrics() {
  const calls: string[] = [];
  return {
    calls,
    incAuditWriteFailed: jest.fn(() => calls.push('audit_write_failed')),
    // Stubs for other methods (not used but may be needed by type)
    incPromoteSuccess: jest.fn(),
    incPromoteFailure: jest.fn(),
    incDriftDetected: jest.fn(),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(),
  };
}

function buildTestEvent(suffix = '') {
  return {
    eventId: `evt-f3${suffix}`,
    eventType: 'PROMOTE_ACCEPTED' as const,
    timestamp: new Date().toISOString(),
    actorId: 'actor-f3',
    incidentId: `inc-f3${suffix}`,
    runId: `run-f3${suffix}`,
    requestId: `req-f3${suffix}`,
    detail: 'F3 fault test',
  };
}

// ============================================================================
// F3 Sync — Audit write throws synchronously
// ============================================================================

describe('Audit Adapter — Fault Injection F3 (Tier-1)', () => {
  describe('F3 sync: fault_audit_sync_throw_increments_counter_and_continues_main_op', () => {
    it('should catch sync throw, increment counter, and not re-throw', () => {
      const scenario = selectScenario(SEED, 'F3');
      expect(scenario).toBeDefined();
      expect(scenario!.expectedContract).toBe('main_unchanged_no_throw');

      const auditService = createMockAuditService('sync_throw');
      const metrics = createMockMetrics();

      const adapter = new SimulationAuditAdapter(
        auditService as any,
        metrics as any,
      );

      // Act: logSimulationEvent should NOT throw
      expect(() => adapter.logSimulationEvent(buildTestEvent())).not.toThrow();

      // Metric: incAuditWriteFailed called exactly once
      expect(metrics.incAuditWriteFailed).toHaveBeenCalledTimes(1);

      // Audit service was called (it threw, but was called)
      expect(auditService.logAccessAttempt).toHaveBeenCalledTimes(1);
    });

    it('should not increment counter on success path', () => {
      const auditService = createMockAuditService('success');
      const metrics = createMockMetrics();

      const adapter = new SimulationAuditAdapter(
        auditService as any,
        metrics as any,
      );

      adapter.logSimulationEvent(buildTestEvent('-success'));

      // Counter should NOT increment on success
      expect(metrics.incAuditWriteFailed).not.toHaveBeenCalled();
      expect(auditService.logAccessAttempt).toHaveBeenCalledTimes(1);
    });

    it('should suppress duplicate events even when first write fails', () => {
      const auditService = createMockAuditService('sync_throw');
      const metrics = createMockMetrics();

      const adapter = new SimulationAuditAdapter(
        auditService as any,
        metrics as any,
      );

      const event = buildTestEvent('-dedup');

      // First call: throws internally, but seenKeys records the key
      adapter.logSimulationEvent(event);
      expect(metrics.incAuditWriteFailed).toHaveBeenCalledTimes(1);

      // Second call: same key → duplicate suppressed, no audit call
      adapter.logSimulationEvent(event);
      // auditService only called once (second was suppressed)
      expect(auditService.logAccessAttempt).toHaveBeenCalledTimes(1);
      // Counter still 1 (no new failure)
      expect(metrics.incAuditWriteFailed).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // F3 Async — Audit write returns rejecting Promise
  // ==========================================================================

  describe('F3 async: fault_audit_async_reject_is_caught_no_unhandled_rejection', () => {
    it('should catch async rejection via .catch() and increment counter', async () => {
      const auditService = createMockAuditService('async_reject');
      const metrics = createMockMetrics();

      const adapter = new SimulationAuditAdapter(
        auditService as any,
        metrics as any,
      );

      // Track unhandled rejections in this test scope
      const unhandledRejections: Error[] = [];
      const handler = (err: Error) => unhandledRejections.push(err);
      process.on('unhandledRejection', handler);

      try {
        // Act: logSimulationEvent should NOT throw (sync return)
        expect(() => adapter.logSimulationEvent(buildTestEvent('-async'))).not.toThrow();

        // The .catch() handler runs asynchronously — give it a tick
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Metric: incAuditWriteFailed called by .catch() handler
        expect(metrics.incAuditWriteFailed).toHaveBeenCalledTimes(1);

        // No unhandled rejections
        expect(unhandledRejections).toHaveLength(0);
      } finally {
        process.removeListener('unhandledRejection', handler);
      }
    });

    it('should handle multiple async rejections without unhandled rejection', async () => {
      const auditService = createMockAuditService('async_reject');
      const metrics = createMockMetrics();

      const adapter = new SimulationAuditAdapter(
        auditService as any,
        metrics as any,
      );

      const unhandledRejections: Error[] = [];
      const handler = (err: Error) => unhandledRejections.push(err);
      process.on('unhandledRejection', handler);

      try {
        // Fire 3 events with different keys (no dedup)
        adapter.logSimulationEvent(buildTestEvent('-async-1'));
        adapter.logSimulationEvent(buildTestEvent('-async-2'));
        adapter.logSimulationEvent(buildTestEvent('-async-3'));

        await new Promise((resolve) => setTimeout(resolve, 100));

        // All 3 rejections caught
        expect(metrics.incAuditWriteFailed).toHaveBeenCalledTimes(3);
        expect(unhandledRejections).toHaveLength(0);
      } finally {
        process.removeListener('unhandledRejection', handler);
      }
    });
  });
});
