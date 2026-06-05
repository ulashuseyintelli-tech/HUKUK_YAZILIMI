/**
 * DomainEventIngest — DB Integration Tests
 *
 * Phase 2 Sprint 1 Task 4 (integration coverage)
 *
 * Coverage:
 * - Test 1: aggregateVersion gap → INSERT fails (DB trigger)
 * - Test 2: duplicate aggregateVersion → fails (UNIQUE)
 * - Test 3: timeline UPDATE/DELETE → fails (immutability triggers)
 * - Test 4: fact audit UPDATE/DELETE → fails (immutability triggers)
 * - Test 8: event append succeeds inside tx
 * - Test 9: outbox row created in same tx as event
 *
 * Requires: DATABASE_URL pointing to test database with migration applied.
 * Skipped automatically if DATABASE_URL is not set.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import { DomainEventIngestService } from '../domain-event-ingest.service';
import { DomainEvent } from '../domain-event-ingest.types';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('DomainEventIngest — DB Integration', () => {
  let prisma: PrismaClient;
  let service: DomainEventIngestService;
  let testCaseId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    });
    await prisma.$connect();
    service = new DomainEventIngestService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    testCaseId = `test-case-${randomUUID()}`;
  });

  function buildEvent(overrides: Partial<DomainEvent['header']> = {}): DomainEvent {
    return {
      header: {
        eventId: `evt-${randomUUID()}`,
        aggregateType: 'Case',
        aggregateId: testCaseId,
        eventType: 'PAYMENT_RECEIVED',
        occurredAt: new Date().toISOString(),
        occurredAtConfidence: 'USER_DECLARED',
        actor: { type: 'HUMAN', userId: 'test-user' },
        tenantId: 'test-tenant',
        ...overrides,
      },
      payload: { amount: 1000, currency: 'TRY' },
    };
  }

  // ── Test 1: aggregateVersion gap fails ────────────────────────────────────

  describe('HR-11: aggregateVersion gap-free', () => {
    it('Test 1: aggregateVersion gap → INSERT fails (DB trigger 45011)', async () => {
      // First event: version = 1
      await prisma.$transaction(async (tx) => {
        await service.appendInTransaction(tx, buildEvent());
      });

      // Direct insert with gap (version 3 instead of 2) should fail
      await expect(
        (prisma as any).icrabotTimelineEntry.create({
          data: {
            caseId: testCaseId,
            type: 'PAYMENT_RECEIVED',
            severity: 'info',
            title: 'manual-gap-attempt',
            source: 'system',
            aggregateVersion: BigInt(3), // GAP: should be 2
          },
        }),
      ).rejects.toThrow(/aggregate_version_gap/);
    });

    it('Test 2: duplicate aggregateVersion → UNIQUE constraint fails', async () => {
      // First event: version = 1
      await prisma.$transaction(async (tx) => {
        await service.appendInTransaction(tx, buildEvent());
      });

      // Direct insert with same version should fail (UNIQUE)
      await expect(
        (prisma as any).icrabotTimelineEntry.create({
          data: {
            caseId: testCaseId,
            type: 'PAYMENT_RECEIVED',
            severity: 'info',
            title: 'duplicate-version',
            source: 'system',
            aggregateVersion: BigInt(1), // duplicate
          },
        }),
      ).rejects.toThrow();
    });

    it('sequential appends produce monotonic versions', async () => {
      const versions: bigint[] = [];

      for (let i = 0; i < 5; i++) {
        await prisma.$transaction(async (tx) => {
          const result = await service.appendInTransaction(tx, buildEvent());
          versions.push(result.aggregateVersion);
        });
      }

      expect(versions).toEqual([
        BigInt(1),
        BigInt(2),
        BigInt(3),
        BigInt(4),
        BigInt(5),
      ]);
    });
  });

  // ── Test 3: timeline immutability ─────────────────────────────────────────

  describe('HR-4 + HR-5: IcrabotTimelineEntry immutability', () => {
    it('Test 3a: timeline UPDATE → DB trigger fails (45010)', async () => {
      let entryId: string = '';
      await prisma.$transaction(async (tx) => {
        await service.appendInTransaction(tx, buildEvent());
        const entry = await (tx as any).icrabotTimelineEntry.findFirst({
          where: { caseId: testCaseId },
        });
        entryId = entry.id;
      });

      await expect(
        (prisma as any).icrabotTimelineEntry.update({
          where: { id: entryId },
          data: { title: 'modified' },
        }),
      ).rejects.toThrow(/immutable_violation/);
    });

    it('Test 3b: timeline DELETE → DB trigger fails (45010)', async () => {
      let entryId: string = '';
      await prisma.$transaction(async (tx) => {
        await service.appendInTransaction(tx, buildEvent());
        const entry = await (tx as any).icrabotTimelineEntry.findFirst({
          where: { caseId: testCaseId },
        });
        entryId = entry.id;
      });

      await expect(
        (prisma as any).icrabotTimelineEntry.delete({
          where: { id: entryId },
        }),
      ).rejects.toThrow(/immutable_violation/);
    });
  });

  // ── Test 4: fact audit immutability ───────────────────────────────────────

  describe('HR-5: IcrabotFactAudit immutability', () => {
    let auditId: string;

    beforeEach(async () => {
      // Create an audit row directly (this is allowed; we only test UPDATE/DELETE)
      const audit = await (prisma as any).icrabotFactAudit.create({
        data: {
          caseId: testCaseId,
          key: 'test.fact.key',
          oldValue: null,
          newValue: { v: 1 },
          kind: 'fact',
          meta: {},
        },
      });
      auditId = audit.id;
    });

    it('Test 4a: fact audit UPDATE → DB trigger fails (45010)', async () => {
      await expect(
        (prisma as any).icrabotFactAudit.update({
          where: { id: auditId },
          data: { newValue: { v: 2 } },
        }),
      ).rejects.toThrow(/immutable_violation/);
    });

    it('Test 4b: fact audit DELETE → DB trigger fails (45010)', async () => {
      await expect(
        (prisma as any).icrabotFactAudit.delete({
          where: { id: auditId },
        }),
      ).rejects.toThrow(/immutable_violation/);
    });
  });

  // ── Test 8: same-tx event append ──────────────────────────────────────────

  describe('HR-39 + HR-44 + HR-45: same-tx atomicity', () => {
    it('Test 8: event append succeeds inside tx; rolls back if tx fails', async () => {
      let attemptedEventId = '';

      // Try a transaction that succeeds in event append but fails afterward
      await expect(
        prisma.$transaction(async (tx) => {
          const event = buildEvent();
          attemptedEventId = event.header.eventId;
          await service.appendInTransaction(tx, event);

          // Force tx failure AFTER event append
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');

      // Event must NOT be persisted (rolled back)
      const found = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: {
          caseId: testCaseId,
          body: { path: ['header', 'eventId'], equals: attemptedEventId },
        },
      });
      expect(found).toBeNull();
    });

    it('Test 9: outbox row created in same tx as event (both rolled back together)', async () => {
      let attemptedKey = '';

      await expect(
        prisma.$transaction(async (tx) => {
          const event = buildEvent();
          attemptedKey = `evt:${event.header.eventId}`;
          await service.appendInTransaction(tx, event);
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');

      // Both timeline AND outbox must be absent
      const timeline = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId },
      });
      const outbox = await (prisma as any).icrabotOutboxAction.findUnique({
        where: { idempotencyKey: attemptedKey },
      });
      expect(timeline).toBeNull();
      expect(outbox).toBeNull();
    });

    it('successful tx persists both event and outbox row', async () => {
      let eventId = '';
      await prisma.$transaction(async (tx) => {
        const event = buildEvent();
        eventId = event.header.eventId;
        await service.appendInTransaction(tx, event);
      });

      const timeline = await (prisma as any).icrabotTimelineEntry.findFirst({
        where: { caseId: testCaseId },
      });
      const outbox = await (prisma as any).icrabotOutboxAction.findUnique({
        where: { idempotencyKey: `evt:${eventId}` },
      });

      expect(timeline).not.toBeNull();
      expect(timeline.aggregateVersion).toBe(BigInt(1));
      // spec-15 §1 Writer A: tenantId header'dan timeline kolonuna yazılmalı
      expect(timeline.tenantId).toBe('test-tenant');
      expect(outbox).not.toBeNull();
      expect(outbox.actionType).toBe('EVENT_PUBLISHED:PAYMENT_RECEIVED');
    });
  });
});
