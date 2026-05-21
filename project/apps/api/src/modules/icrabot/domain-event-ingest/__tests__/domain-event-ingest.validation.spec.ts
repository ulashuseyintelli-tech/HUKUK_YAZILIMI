/**
 * DomainEventIngestService — Validation Unit Tests
 *
 * Phase 2 Sprint 1 Task 4
 *
 * Coverage:
 * - Test 5: PAYMENT_REVERSED without caused_by fails (HR-23)
 * - Test 6: EXTERNAL_SIGNED without evidence fails (HR-34)
 * - Test 7: retroactive effective_from without override fails (HR-33)
 * - Plus: confidence missing, human actor required, happy paths
 *
 * No DB required — these tests exercise validation logic via a mock tx
 * that throws on use (validation should fail BEFORE any DB call).
 */
import { DomainEventIngestService } from '../domain-event-ingest.service';
import {
  CausedByRequiredError,
  HumanActorRequiredError,
  ConfidenceMissingError,
  EvidenceMissingError,
  RetroactiveOverrideRequiredError,
} from '../domain-event-ingest.errors';
import { DomainEvent } from '../domain-event-ingest.types';

// ─── Mock Transaction ────────────────────────────────────────────────────────

/**
 * Mock tx that records calls but allows aggregate queries to return empty.
 * Validation errors must throw BEFORE any write call is made.
 */
function createMockTx(opts?: {
  earliestCreatedAt?: Date;
  currentMaxVersion?: bigint | null;
}) {
  const calls: { method: string; args: unknown[] }[] = [];

  const tx = {
    icrabotTimelineEntry: {
      findFirst: jest.fn().mockResolvedValue(
        opts?.earliestCreatedAt
          ? { createdAt: opts.earliestCreatedAt }
          : null,
      ),
      aggregate: jest.fn().mockResolvedValue({
        _max: { aggregateVersion: opts?.currentMaxVersion ?? null },
      }),
      create: jest.fn().mockImplementation((args) => {
        calls.push({ method: 'timeline.create', args: [args] });
        return Promise.resolve({ id: 'fake-id' });
      }),
    },
    icrabotOutboxAction: {
      create: jest.fn().mockImplementation((args) => {
        calls.push({ method: 'outbox.create', args: [args] });
        return Promise.resolve({ id: 'fake-outbox-id' });
      }),
    },
  };

  return { tx, calls };
}

// ─── Event Builder ───────────────────────────────────────────────────────────

function buildEvent(overrides: Partial<DomainEvent['header']> = {}): DomainEvent {
  return {
    header: {
      eventId: 'evt-' + Math.random().toString(36).slice(2),
      aggregateType: 'Case',
      aggregateId: 'case-001',
      eventType: 'PAYMENT_RECEIVED',
      occurredAt: '2026-05-20T10:00:00.000Z',
      occurredAtConfidence: 'USER_DECLARED',
      actor: { type: 'HUMAN', userId: 'user-1' },
      tenantId: 'tenant-1',
      ...overrides,
    },
    payload: { amount: 1000, currency: 'TRY' },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DomainEventIngestService — Validation', () => {
  let service: DomainEventIngestService;

  beforeEach(() => {
    service = new DomainEventIngestService();
  });

  // ── HR-34: occurred_at_confidence ─────────────────────────────────────────

  describe('HR-34: occurred_at_confidence', () => {
    it('rejects event without occurredAtConfidence', async () => {
      const { tx } = createMockTx();
      const event = buildEvent();
      // Force missing field
      delete (event.header as Partial<DomainEvent['header']>).occurredAtConfidence;

      await expect(
        service.appendInTransaction(tx as never, event),
      ).rejects.toBeInstanceOf(ConfidenceMissingError);
    });

    it('Test 6: EXTERNAL_SIGNED without evidence fails', async () => {
      const { tx, calls } = createMockTx();
      const event = buildEvent({
        occurredAtConfidence: 'EXTERNAL_SIGNED',
        // no occurredAtEvidence
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).rejects.toBeInstanceOf(EvidenceMissingError);

      // Validation must fail BEFORE any write
      expect(calls).toHaveLength(0);
    });

    it('accepts EXTERNAL_SIGNED with evidence', async () => {
      const { tx } = createMockTx();
      const event = buildEvent({
        occurredAtConfidence: 'EXTERNAL_SIGNED',
        occurredAtEvidence: 'UYAP-BARCODE-12345',
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });
  });

  // ── HR-23: caused_by required ─────────────────────────────────────────────

  describe('HR-23: caused_by required', () => {
    it('Test 5: PAYMENT_REVERSED without caused_by fails', async () => {
      const { tx, calls } = createMockTx();
      const event = buildEvent({
        eventType: 'PAYMENT_REVERSED',
        // no causedBy
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).rejects.toBeInstanceOf(CausedByRequiredError);

      expect(calls).toHaveLength(0);
    });

    it('CASE_RESUMED without caused_by fails', async () => {
      const { tx } = createMockTx();
      const event = buildEvent({ eventType: 'CASE_RESUMED' });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).rejects.toBeInstanceOf(CausedByRequiredError);
    });

    it('CASE_REOPENED without caused_by fails', async () => {
      const { tx } = createMockTx();
      const event = buildEvent({ eventType: 'CASE_REOPENED' });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).rejects.toBeInstanceOf(CausedByRequiredError);
    });

    it('PAYMENT_REVERSED with caused_by succeeds', async () => {
      const { tx } = createMockTx();
      const event = buildEvent({
        eventType: 'PAYMENT_REVERSED',
        causedBy: 'evt-original-payment',
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });

    it('PAYMENT_RECEIVED without caused_by succeeds (not in required set)', async () => {
      const { tx } = createMockTx();
      const event = buildEvent({ eventType: 'PAYMENT_RECEIVED' });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });
  });

  // ── HR-26: human actor required ───────────────────────────────────────────

  describe('HR-26: human actor required', () => {
    it.each([
      'CASE_CLOSED',
      'CASE_REOPENED',
      'CASE_SUSPENDED',
      'DEBTOR_IDENTITY_CORRECTED',
      'INTEREST_POLICY_ASSIGNED',
    ])('rejects %s with SYSTEM actor', async (eventType) => {
      const { tx } = createMockTx();
      const event = buildEvent({
        eventType,
        causedBy:
          eventType === 'CASE_REOPENED' ? 'evt-prior-close' : undefined,
        actor: { type: 'SYSTEM' },
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).rejects.toBeInstanceOf(HumanActorRequiredError);
    });

    it('CASE_CLOSED with HUMAN actor succeeds', async () => {
      const { tx } = createMockTx();
      const event = buildEvent({
        eventType: 'CASE_CLOSED',
        actor: { type: 'HUMAN', userId: 'lawyer-1' },
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });

    it('PAYMENT_RECEIVED with SYSTEM actor succeeds (not human-required)', async () => {
      const { tx } = createMockTx();
      const event = buildEvent({
        eventType: 'PAYMENT_RECEIVED',
        actor: { type: 'SYSTEM' },
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });
  });

  // ── HR-33: retroactive override ───────────────────────────────────────────

  describe('HR-33: retroactive override', () => {
    it('Test 7: retroactive effective_from without override fails', async () => {
      const { tx, calls } = createMockTx({
        earliestCreatedAt: new Date('2025-06-01T00:00:00.000Z'),
      });
      const event = buildEvent({
        effectiveFrom: '2024-01-01', // before earliest event
        // no retroactiveOverride
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).rejects.toBeInstanceOf(RetroactiveOverrideRequiredError);

      expect(calls).toHaveLength(0);
    });

    it('retroactive effective_from with override succeeds', async () => {
      const { tx } = createMockTx({
        earliestCreatedAt: new Date('2025-06-01T00:00:00.000Z'),
      });
      const event = buildEvent({
        effectiveFrom: '2024-01-01',
        retroactiveOverride: {
          authorizedBy: 'partner-1',
          authorizationReason: 'Contractual override',
          references: ['contract-ref-001'],
        },
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });

    it('non-retroactive event (effective_from after earliest) succeeds without override', async () => {
      const { tx } = createMockTx({
        earliestCreatedAt: new Date('2025-06-01T00:00:00.000Z'),
      });
      const event = buildEvent({
        effectiveFrom: '2026-05-20',
      });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });

    it('first event (no earliest exists) succeeds without override', async () => {
      const { tx } = createMockTx({ earliestCreatedAt: undefined });
      const event = buildEvent({ effectiveFrom: '2020-01-01' });

      await expect(
        service.appendInTransaction(tx as never, event),
      ).resolves.toEqual({ aggregateVersion: BigInt(1) });
    });
  });

  // ── HR-11: aggregate_version increment ────────────────────────────────────

  describe('HR-11: aggregate_version', () => {
    it('first event gets aggregateVersion = 1', async () => {
      const { tx } = createMockTx({ currentMaxVersion: null });
      const event = buildEvent();

      const result = await service.appendInTransaction(tx as never, event);

      expect(result.aggregateVersion).toBe(BigInt(1));
    });

    it('subsequent event gets max + 1', async () => {
      const { tx } = createMockTx({ currentMaxVersion: BigInt(7) });
      const event = buildEvent();

      const result = await service.appendInTransaction(tx as never, event);

      expect(result.aggregateVersion).toBe(BigInt(8));
    });
  });

  // ── HR-39 + HR-44: same-tx outbox append ──────────────────────────────────

  describe('HR-39 + HR-44: same-tx event + outbox append', () => {
    it('writes both timeline entry and outbox row in same tx', async () => {
      const { tx, calls } = createMockTx();
      const event = buildEvent();

      await service.appendInTransaction(tx as never, event);

      expect(calls).toHaveLength(2);
      expect(calls[0].method).toBe('timeline.create');
      expect(calls[1].method).toBe('outbox.create');
    });

    it('outbox row has idempotencyKey derived from eventId', async () => {
      const { tx, calls } = createMockTx();
      const event = buildEvent({ eventId: 'evt-fixed-123' });

      await service.appendInTransaction(tx as never, event);

      const outboxCall = calls.find((c) => c.method === 'outbox.create');
      const data = (outboxCall!.args[0] as { data: { idempotencyKey: string } })
        .data;
      expect(data.idempotencyKey).toBe('evt:evt-fixed-123');
    });

    it('outbox actionType encodes event type', async () => {
      const { tx, calls } = createMockTx();
      const event = buildEvent({ eventType: 'PAYMENT_RECEIVED' });

      await service.appendInTransaction(tx as never, event);

      const outboxCall = calls.find((c) => c.method === 'outbox.create');
      const data = (outboxCall!.args[0] as { data: { actionType: string } })
        .data;
      expect(data.actionType).toBe('EVENT_PUBLISHED:PAYMENT_RECEIVED');
    });
  });
});
