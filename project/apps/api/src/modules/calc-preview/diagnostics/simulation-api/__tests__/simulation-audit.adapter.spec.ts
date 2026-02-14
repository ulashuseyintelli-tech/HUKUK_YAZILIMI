/**
 * SimulationAuditAdapter — Unit Tests
 *
 * Sprint 3 - Task 7.1
 *
 * Tests:
 *   1. Single write for same composite key (idempotent)
 *   2. Parallel Promise.all → single write
 *   3. Different event_type → new write
 *   4. Fire-and-forget: audit write failure does not throw
 *   5. All required fields forwarded to DiagnosticsAuditService
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §5
 */

import { SimulationAuditAdapter } from '../simulation-audit.adapter';
import { SimulationAuditEvent } from '../simulation-audit.types';
import { SimulationMetricsService } from '../simulation-metrics.service';

// ============================================================================
// Mock DiagnosticsAuditService
// ============================================================================

function createMockAuditService() {
  const calls: any[][] = [];
  return {
    calls,
    logAccessAttempt: jest.fn((...args: any[]) => {
      calls.push(args);
    }),
  };
}

function createMockMetrics(): SimulationMetricsService {
  return {
    incAuditWriteFailed: jest.fn(),
    incPromoteSuccess: jest.fn(),
    incPromoteFailure: jest.fn(),
    incDriftDetected: jest.fn(),
    incEscalationChurn: jest.fn(),
    incEscalationStateConflict: jest.fn(),
  } as any;
}

// ============================================================================
// Helpers
// ============================================================================

function makeEvent(overrides: Partial<SimulationAuditEvent> = {}): SimulationAuditEvent {
  return {
    eventId: 'evt-1',
    eventType: 'PROMOTE_ACCEPTED',
    timestamp: '2026-02-13T10:00:00.000Z',
    actorId: 'user-1',
    incidentId: 'inc-1',
    runId: 'run-1',
    requestId: 'req-1',
    detail: 'test detail',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SimulationAuditAdapter', () => {
  let adapter: SimulationAuditAdapter;
  let mockAudit: ReturnType<typeof createMockAuditService>;
  let mockMetrics: SimulationMetricsService;

  beforeEach(() => {
    mockAudit = createMockAuditService();
    mockMetrics = createMockMetrics();
    adapter = new SimulationAuditAdapter(mockAudit as any, mockMetrics);
  });

  describe('idempotent write (same composite key)', () => {
    it('should write once for same composite key', () => {
      const event = makeEvent();

      adapter.logSimulationEvent(event);
      adapter.logSimulationEvent(event); // duplicate

      expect(mockAudit.logAccessAttempt).toHaveBeenCalledTimes(1);
    });

    it('should suppress duplicate even with different eventId', () => {
      // Composite key = eventType + incidentId + runId + requestId
      // eventId is NOT part of composite key
      const event1 = makeEvent({ eventId: 'evt-1' });
      const event2 = makeEvent({ eventId: 'evt-2' }); // different eventId, same composite

      adapter.logSimulationEvent(event1);
      adapter.logSimulationEvent(event2);

      expect(mockAudit.logAccessAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe('parallel writes (Promise.all)', () => {
    it('should produce single write for parallel calls with same key', () => {
      const event = makeEvent();

      // Synchronous calls simulate same-tick parallel
      adapter.logSimulationEvent(event);
      adapter.logSimulationEvent(event);
      adapter.logSimulationEvent(event);

      expect(mockAudit.logAccessAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe('different event_type → new write', () => {
    it('should write separately for different eventType', () => {
      const accepted = makeEvent({ eventType: 'PROMOTE_ACCEPTED' });
      const blocked = makeEvent({ eventType: 'PROMOTE_DRIFT_BLOCKED' });

      adapter.logSimulationEvent(accepted);
      adapter.logSimulationEvent(blocked);

      expect(mockAudit.logAccessAttempt).toHaveBeenCalledTimes(2);
    });

    it('should write separately for different incidentId', () => {
      const event1 = makeEvent({ incidentId: 'inc-1' });
      const event2 = makeEvent({ incidentId: 'inc-2' });

      adapter.logSimulationEvent(event1);
      adapter.logSimulationEvent(event2);

      expect(mockAudit.logAccessAttempt).toHaveBeenCalledTimes(2);
    });

    it('should write separately for different runId', () => {
      const event1 = makeEvent({ runId: 'run-1' });
      const event2 = makeEvent({ runId: 'run-2' });

      adapter.logSimulationEvent(event1);
      adapter.logSimulationEvent(event2);

      expect(mockAudit.logAccessAttempt).toHaveBeenCalledTimes(2);
    });
  });

  describe('fire-and-forget (audit failure does not throw)', () => {
    it('should swallow audit write errors and increment metric', () => {
      mockAudit.logAccessAttempt.mockImplementation(() => {
        throw new Error('DB connection lost');
      });

      // Should NOT throw
      expect(() => adapter.logSimulationEvent(makeEvent())).not.toThrow();
      expect(mockMetrics.incAuditWriteFailed).toHaveBeenCalledTimes(1);
    });

    it('should still suppress duplicates after a failed write', () => {
      let callCount = 0;
      mockAudit.logAccessAttempt.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('transient failure');
      });

      adapter.logSimulationEvent(makeEvent());
      adapter.logSimulationEvent(makeEvent()); // same key — should be suppressed

      // First call attempted (threw), second call suppressed by Set
      expect(mockAudit.logAccessAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe('field forwarding', () => {
    it('should forward actorId, eventType, incidentId, detail to audit service', () => {
      const event = makeEvent({
        actorId: 'operator-42',
        eventType: 'ESCALATION_TRIGGERED',
        incidentId: 'inc-99',
        detail: 'L1 → L2',
      });

      adapter.logSimulationEvent(event);

      expect(mockAudit.logAccessAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'operator-42' }),
        'ESCALATION_TRIGGERED',
        'trace',
        'inc-99',
        true,
        'L1 → L2',
      );
    });
  });
});
