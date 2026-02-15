/**
 * SimulationAuditAdapter — Property-Based Tests (P11)
 *
 * Sprint 3 - Task 7.4
 *
 * P11: Audit olay bütünlüğü
 *   For any simulation lifecycle action, the audit log SHALL contain
 *   a record with the correct eventType and ALL required fields:
 *   eventId, ISO 8601 timestamp, actorId, incidentId, eventType.
 *
 * Generator invariants:
 *   - eventType: one of 9 valid SimulationAuditAction values
 *   - eventId: non-empty UUID-like string
 *   - timestamp: valid ISO 8601
 *   - actorId: non-empty string
 *   - incidentId: non-empty string
 *   - runId/requestId: optional (may be undefined)
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md — Property 11
 * @see .kiro/specs/sprint-3-deploy-ready/requirements.md — Req 5.1-5.6
 */

import * as fc from 'fast-check';
import { SimulationAuditAdapter } from '../simulation-audit.adapter';
import {
  SimulationAuditEvent,
  SimulationAuditAction,
  buildAuditIdempotencyKey,
} from '../simulation-audit.types';

// ============================================================================
// Stub metrics (fire-and-forget counter)
// ============================================================================

function createStubMetrics() {
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
// All valid lifecycle audit event types (exhaustive — 9 types).
// Excludes PHASE7_EVALUATED / PHASE7_BLOCKED / PHASE7_FAULT by spec:
// those are operational/diagnostic events emitted via metrics+logs,
// not persisted in lifecycle audit store.
// See design.md § Property 11 — Scope.
// ============================================================================

const ALL_EVENT_TYPES: SimulationAuditAction[] = [
  'SIMULATION_STARTED',
  'SIMULATION_COMPLETED',
  'SIMULATION_FAILED',
  'PROMOTE_REQUESTED',
  'PROMOTE_ACCEPTED',
  'PROMOTE_DRIFT_BLOCKED',
  'ESCALATION_TRIGGERED',
  'DEESCALATION_TRIGGERED',
  'ESCALATION_STATE_CONFLICT',
];

// ============================================================================
// Mock DiagnosticsAuditService — captures all calls
// ============================================================================

interface CapturedCall {
  ctx: { userId: string };
  action: string;
  resourceType: string;
  resourceId: string;
  allowed: boolean;
  reason: string | undefined;
}

function createCapturingAuditService() {
  const captured: CapturedCall[] = [];
  return {
    captured,
    logAccessAttempt: jest.fn((ctx, action, resourceType, resourceId, allowed, reason) => {
      captured.push({ ctx, action, resourceType, resourceId, allowed, reason });
    }),
  };
}

// ============================================================================
// Generators
// ============================================================================

const eventTypeArb = fc.constantFrom<SimulationAuditAction>(...ALL_EVENT_TYPES);

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 36 }).filter(
  (s) => s.length > 0,
);

const isoTimestampArb = fc.integer({
  min: Date.parse('2025-01-01T00:00:00Z'),
  max: Date.parse('2027-12-31T23:59:59Z'),
}).map((ms) => new Date(ms).toISOString());

const auditEventArb = fc.record({
  eventId: nonEmptyStringArb,
  eventType: eventTypeArb,
  timestamp: isoTimestampArb,
  actorId: nonEmptyStringArb,
  incidentId: nonEmptyStringArb,
  runId: fc.option(nonEmptyStringArb, { nil: undefined }),
  requestId: fc.option(nonEmptyStringArb, { nil: undefined }),
  detail: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
});

/**
 * Generator for unique events — each call produces a distinct composite key.
 * Uses counter-based incidentId to guarantee uniqueness.
 */
let uniqueCounter = 0;
const uniqueAuditEventArb = auditEventArb.map((event) => ({
  ...event,
  incidentId: `inc-${++uniqueCounter}-${event.incidentId}`,
}));

// ============================================================================
// Property 11: Audit olay bütünlüğü
// ============================================================================

describe('Feature: sprint-3-deploy-ready, Property 11: Audit olay bütünlüğü', () => {
  beforeEach(() => {
    uniqueCounter = 0;
  });

  // --------------------------------------------------------------------------
  // P11.1: Every lifecycle event produces exactly one audit record
  //        with the correct eventType
  // --------------------------------------------------------------------------

  it('should produce exactly one audit record for any valid lifecycle event', () => {
    fc.assert(
      fc.property(
        uniqueAuditEventArb,
        (event) => {
          const mockAudit = createCapturingAuditService();
          const adapter = new SimulationAuditAdapter(mockAudit as any, createStubMetrics());

          adapter.logSimulationEvent(event);

          // Exactly one call
          expect(mockAudit.captured).toHaveLength(1);

          // Correct eventType forwarded
          expect(mockAudit.captured[0].action).toBe(event.eventType);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // P11.2: Required fields are always present and correctly forwarded
  //        eventId → (implicit in call), actorId → ctx.userId,
  //        incidentId → resourceId, eventType → action,
  //        timestamp → (in event, not directly forwarded to logAccessAttempt
  //        but present in the event object passed to adapter)
  // --------------------------------------------------------------------------

  it('should forward actorId, incidentId, eventType, and detail for any event', () => {
    fc.assert(
      fc.property(
        uniqueAuditEventArb,
        (event) => {
          const mockAudit = createCapturingAuditService();
          const adapter = new SimulationAuditAdapter(mockAudit as any, createStubMetrics());

          adapter.logSimulationEvent(event);

          const call = mockAudit.captured[0];

          // actorId → ctx.userId
          expect(call.ctx.userId).toBe(event.actorId);

          // eventType → action
          expect(call.action).toBe(event.eventType);

          // incidentId → resourceId
          expect(call.resourceId).toBe(event.incidentId);

          // resourceType is always 'trace'
          expect(call.resourceType).toBe('trace');

          // allowed is always true (audit records, not access denials)
          expect(call.allowed).toBe(true);

          // detail → reason
          expect(call.reason).toBe(event.detail);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // P11.3: All 9 event types are accepted (exhaustive coverage)
  //        No event type is silently dropped or causes an error
  // --------------------------------------------------------------------------

  it('should accept all 9 SimulationAuditAction types without error', () => {
    ALL_EVENT_TYPES.forEach((eventType) => {
      const mockAudit = createCapturingAuditService();
      const adapter = new SimulationAuditAdapter(mockAudit as any, createStubMetrics());

      const event: SimulationAuditEvent = {
        eventId: `evt-${eventType}`,
        eventType,
        timestamp: '2026-02-13T10:00:00.000Z',
        actorId: 'actor-1',
        incidentId: `inc-${eventType}`,
        runId: 'run-1',
        requestId: 'req-1',
      };

      adapter.logSimulationEvent(event);

      expect(mockAudit.captured).toHaveLength(1);
      expect(mockAudit.captured[0].action).toBe(eventType);
    });
  });

  // --------------------------------------------------------------------------
  // P11.4: Event with required fields only (no optional fields)
  //        should still produce a valid audit record
  // --------------------------------------------------------------------------

  it('should produce valid audit record even without optional fields (runId, requestId, detail)', () => {
    fc.assert(
      fc.property(
        eventTypeArb,
        nonEmptyStringArb,
        isoTimestampArb,
        nonEmptyStringArb,
        nonEmptyStringArb,
        (eventType, eventId, timestamp, actorId, incidentId) => {
          const mockAudit = createCapturingAuditService();
          const adapter = new SimulationAuditAdapter(mockAudit as any, createStubMetrics());

          const event: SimulationAuditEvent = {
            eventId,
            eventType,
            timestamp,
            actorId,
            incidentId,
            // runId, requestId, detail intentionally omitted
          };

          adapter.logSimulationEvent(event);

          expect(mockAudit.captured).toHaveLength(1);
          expect(mockAudit.captured[0].action).toBe(eventType);
          expect(mockAudit.captured[0].ctx.userId).toBe(actorId);
          expect(mockAudit.captured[0].resourceId).toBe(incidentId);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // P11.5: Idempotency key composition is deterministic
  //        Same event → same key, different composite fields → different key
  // --------------------------------------------------------------------------

  it('should produce deterministic idempotency key for any event', () => {
    fc.assert(
      fc.property(
        auditEventArb,
        (event) => {
          const key1 = buildAuditIdempotencyKey(event);
          const key2 = buildAuditIdempotencyKey(event);

          // Deterministic
          expect(key1).toBe(key2);

          // Key contains eventType and incidentId
          expect(key1).toContain(event.eventType);
          expect(key1).toContain(event.incidentId);

          // Key is non-empty
          expect(key1.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // P11.6: Duplicate suppression preserves first write, blocks second
  //        (idempotent write invariant)
  // --------------------------------------------------------------------------

  it('should write exactly once for duplicate events with same composite key', () => {
    fc.assert(
      fc.property(
        auditEventArb,
        (event) => {
          const mockAudit = createCapturingAuditService();
          const adapter = new SimulationAuditAdapter(mockAudit as any, createStubMetrics());

          adapter.logSimulationEvent(event);
          adapter.logSimulationEvent(event); // duplicate
          adapter.logSimulationEvent(event); // triple

          // Exactly one write
          expect(mockAudit.captured).toHaveLength(1);

          // First write has correct data
          expect(mockAudit.captured[0].action).toBe(event.eventType);
          expect(mockAudit.captured[0].resourceId).toBe(event.incidentId);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // P11.7: Fire-and-forget — audit failure does not prevent subsequent
  //        events from being written (adapter remains functional)
  // --------------------------------------------------------------------------

  it('should remain functional after audit write failure', () => {
    fc.assert(
      fc.property(
        uniqueAuditEventArb,
        uniqueAuditEventArb,
        (event1, event2) => {
          // Ensure different composite keys
          fc.pre(buildAuditIdempotencyKey(event1) !== buildAuditIdempotencyKey(event2));

          let callCount = 0;
          const captured: CapturedCall[] = [];
          const failingAudit = {
            logAccessAttempt: jest.fn((ctx: any, action: any, rt: any, rid: any, allowed: any, reason: any) => {
              callCount++;
              if (callCount === 1) throw new Error('transient DB failure');
              captured.push({ ctx, action, resourceType: rt, resourceId: rid, allowed, reason });
            }),
          };

          const adapter = new SimulationAuditAdapter(failingAudit as any, createStubMetrics());

          // First event — write fails (fire-and-forget)
          expect(() => adapter.logSimulationEvent(event1)).not.toThrow();

          // Second event — write succeeds (adapter still functional)
          adapter.logSimulationEvent(event2);

          // Second event was written successfully
          expect(captured).toHaveLength(1);
          expect(captured[0].action).toBe(event2.eventType);
        },
      ),
      { numRuns: 100 },
    );
  });
});
