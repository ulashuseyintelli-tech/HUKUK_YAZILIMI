import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { CollectionService } from '../collection.service';
import { CollectionType, type CreateCollectionDto } from '../dto/collection.dto';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'RCV-COL-IDEM-01 DB gate blocked: CI requires an approved TEST_DATABASE_URL.',
  );
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb(
  'RCV-COL-IDEM-01 full semantic command idempotency - disposable PostgreSQL',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    const tenantIds = new Set<string>();

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      await prisma.$connect();
    });

    afterAll(async () => {
      for (const tenantId of tenantIds) {
        await cleanupTenant(tenantId);
      }
      await prisma.$disconnect();
    });

    async function createFixture(label: string) {
      const suffix = randomUUID();
      const tenantId = `collection-idem-${label}-${suffix}`;
      tenantIds.add(tenantId);
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `Collection idempotency ${label}`,
          slug: `collection-idem-${label}-${suffix}`,
        },
      });
      const client = await prisma.client.create({
        data: {
          tenantId,
          displayName: `Client ${label}`,
          type: 'INDIVIDUAL',
        },
      });
      const caseRow = await prisma.case.create({
        data: {
          tenantId,
          clientId: client.id,
          fileNumber: `COL-IDEM-${suffix}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
          currency: 'TRY',
        },
      });
      return {
        tenantId,
        caseId: caseRow.id,
        userId: `actor-${suffix}`,
        key: `collection-command-${suffix}`,
      };
    }

    function dto(
      fixture: Awaited<ReturnType<typeof createFixture>>,
      overrides: Partial<CreateCollectionDto> = {},
    ): CreateCollectionDto {
      return {
        caseId: fixture.caseId,
        idempotencyKey: fixture.key,
        amount: 1250,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-07-31T09:30:00.000Z',
        description: 'Semantic replay fixture',
        ...overrides,
      } as CreateCollectionDto;
    }

    function service(
      client: PrismaClient,
      options: {
        ingest?: DomainEventIngestService;
        audit?: AuditService;
      } = {},
    ) {
      return new CollectionService(
        client as any,
        options.ingest ?? new DomainEventIngestService(),
        new CaseDebtorLifecycleGuardService(client as any),
        undefined,
        undefined,
        undefined,
        options.audit ?? new AuditService(client as any),
      );
    }

    async function snapshot(tenantId: string) {
      const [
        collections,
        journals,
        events,
        outbox,
        createAudits,
        conflictAudits,
      ] = await Promise.all([
        prisma.collection.count({ where: { tenantId } }),
        prisma.accountingJournalEntry.count({ where: { tenantId } }),
        prisma.icrabotTimelineEntry.count({ where: { tenantId } }),
        prisma.icrabotOutboxAction.count({ where: { tenantId } }),
        prisma.auditLog.count({
          where: { tenantId, action: 'COLLECTION_CREATE' },
        }),
        prisma.auditLog.count({
          where: {
            tenantId,
            action: 'COLLECTION_IDEMPOTENCY_SEMANTIC_CONFLICT',
          },
        }),
      ]);
      return {
        collections,
        journals,
        events,
        outbox,
        createAudits,
        conflictAudits,
      };
    }

    async function cleanupTenant(tenantId: string) {
      await prisma.icrabotOutboxAction.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.accountingJournalEntry.deleteMany({ where: { tenantId } });
      await prisma.collectionAllocation.deleteMany({
        where: { collection: { tenantId } },
      });
      await prisma.collection.deleteMany({ where: { tenantId } });
      await prisma.case.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      tenantIds.delete(tenantId);
    }

    it('concurrent same command creates exactly one Collection/effect chain and returns one identity', async () => {
      const fixture = await createFixture('same-race');
      const firstClient = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      const secondClient = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      await Promise.all([firstClient.$connect(), secondClient.$connect()]);
      try {
        const results = await Promise.all([
          service(firstClient).create(
            fixture.tenantId,
            dto(fixture),
            fixture.userId,
          ),
          service(secondClient).create(
            fixture.tenantId,
            dto(fixture),
            fixture.userId,
          ),
        ]);
        expect(results[0].id).toBe(results[1].id);
        await expect(snapshot(fixture.tenantId)).resolves.toEqual({
          collections: 1,
          journals: 1,
          events: 1,
          outbox: 1,
          createAudits: 1,
          conflictAudits: 0,
        });
      } finally {
        await Promise.all([
          firstClient.$disconnect(),
          secondClient.$disconnect(),
        ]);
      }
    });

    it('concurrent conflicting commands admit one and deterministically reject the other', async () => {
      const fixture = await createFixture('conflict-race');
      const firstClient = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      const secondClient = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      await Promise.all([firstClient.$connect(), secondClient.$connect()]);
      try {
        const results = await Promise.allSettled([
          service(firstClient).create(
            fixture.tenantId,
            dto(fixture, { amount: 1250 }),
            fixture.userId,
          ),
          service(secondClient).create(
            fixture.tenantId,
            dto(fixture, { amount: 1251 }),
            fixture.userId,
          ),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejection = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        expect(rejection?.reason).toBeInstanceOf(ConflictException);
        expect(rejection?.reason?.getResponse()).toMatchObject({
          code: 'IDEMPOTENCY_SEMANTIC_CONFLICT',
        });
        await expect(snapshot(fixture.tenantId)).resolves.toMatchObject({
          collections: 1,
          journals: 1,
          events: 1,
          outbox: 1,
          createAudits: 1,
          conflictAudits: 1,
        });
      } finally {
        await Promise.all([
          firstClient.$disconnect(),
          secondClient.$disconnect(),
        ]);
      }
    });

    it('event/outbox failure rolls evidence and Collection back; same command can retry cleanly', async () => {
      const fixture = await createFixture('event-rollback');
      const failingIngest = {
        appendInTransaction: jest.fn(async () => {
          throw new Error('FORCED_EVENT_OUTBOX_FAILURE');
        }),
      } as unknown as DomainEventIngestService;

      await expect(
        service(prisma, { ingest: failingIngest }).create(
          fixture.tenantId,
          dto(fixture),
          fixture.userId,
        ),
      ).rejects.toThrow('FORCED_EVENT_OUTBOX_FAILURE');
      await expect(snapshot(fixture.tenantId)).resolves.toEqual({
        collections: 0,
        journals: 0,
        events: 0,
        outbox: 0,
        createAudits: 0,
        conflictAudits: 0,
      });

      await expect(
        service(prisma).create(
          fixture.tenantId,
          dto(fixture),
          fixture.userId,
        ),
      ).resolves.toMatchObject({
        commandFingerprintVersion: 'RCV-COL-CMD/v1',
      });
      await expect(snapshot(fixture.tenantId)).resolves.toMatchObject({
        collections: 1,
        createAudits: 1,
      });
    });

    it('transaction-bound audit failure rolls evidence and all prior writes back', async () => {
      const fixture = await createFixture('audit-rollback');
      const failingAudit = {
        log: jest.fn(async () => undefined),
        logInTransaction: jest.fn(async () => {
          throw new Error('FORCED_COLLECTION_AUDIT_FAILURE');
        }),
      } as unknown as AuditService;

      await expect(
        service(prisma, { audit: failingAudit }).create(
          fixture.tenantId,
          dto(fixture),
          fixture.userId,
        ),
      ).rejects.toThrow('FORCED_COLLECTION_AUDIT_FAILURE');
      await expect(snapshot(fixture.tenantId)).resolves.toEqual({
        collections: 0,
        journals: 0,
        events: 0,
        outbox: 0,
        createAudits: 0,
        conflictAudits: 0,
      });
    });

    it('legacy row without evidence and legacy PENDING row both fail closed', async () => {
      const fixture = await createFixture('legacy');
      await prisma.collection.create({
        data: {
          tenantId: fixture.tenantId,
          caseId: fixture.caseId,
          idempotencyKey: fixture.key,
          amount: 1250,
          currency: 'TRY',
          type: 'BANK_TRANSFER',
          channel: 'BANKA',
          date: new Date('2026-07-31T09:30:00.000Z'),
          status: 'PENDING',
        },
      });

      await expect(
        service(prisma).create(
          fixture.tenantId,
          dto(fixture),
          fixture.userId,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'IDEMPOTENCY_LEGACY_UNVERIFIABLE',
        }),
      });
      await expect(snapshot(fixture.tenantId)).resolves.toMatchObject({
        collections: 1,
        journals: 0,
        events: 0,
        outbox: 0,
        createAudits: 0,
        conflictAudits: 1,
      });
    });

    it('same key remains tenant-scoped and creates independent canonical results', async () => {
      const first = await createFixture('tenant-a');
      const second = await createFixture('tenant-b');
      second.key = first.key;

      const [firstResult, secondResult] = await Promise.all([
        service(prisma).create(first.tenantId, dto(first), first.userId),
        service(prisma).create(second.tenantId, dto(second), second.userId),
      ]);
      expect(firstResult.id).not.toBe(secondResult.id);
      await expect(
        prisma.collection.count({
          where: { idempotencyKey: first.key },
        }),
      ).resolves.toBe(2);
    });

    it('DB enforces complete evidence tuple and immutable evidence after insert', async () => {
      const fixture = await createFixture('db-guards');
      const collection = await service(prisma).create(
        fixture.tenantId,
        dto(fixture),
        fixture.userId,
      );

      await expect(
        prisma.$executeRaw`
          UPDATE "Collection"
          SET "commandFingerprint" = ${'b'.repeat(64)}
          WHERE "tenantId" = ${fixture.tenantId}
            AND "id" = ${collection.id}
        `,
      ).rejects.toBeDefined();

      await expect(
        prisma.$executeRaw`
          INSERT INTO "Collection" (
            "id", "tenantId", "caseId", "amount", "currency", "type",
            "channel", "date", "idempotencyKey", "commandFingerprintVersion",
            "commandFingerprint", "createdAt", "updatedAt"
          )
          VALUES (
            ${randomUUID()}, ${fixture.tenantId}, ${fixture.caseId}, 1, 'TRY',
            'CASH', 'BANKA', NOW(), ${`${fixture.key}-partial`},
            'RCV-COL-CMD/v1', ${'c'.repeat(64)}, NOW(), NOW()
          )
        `,
      ).rejects.toBeDefined();
    });
  },
);
