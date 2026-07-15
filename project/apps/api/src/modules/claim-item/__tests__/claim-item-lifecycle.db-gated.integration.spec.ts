import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import {
  parseBackfillArgs,
  runBackfill,
  runRollback,
} from '../../case/backfill/due-to-claimitem-backfill.core';
import { ClaimItemWriteGateService } from '../claim-item-write-gate.service';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('RCV-P2-WS02-P04 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('RCV-P2-WS02-P04 lifecycle continuity - disposable PostgreSQL', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaClient;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-rcv-p04-lifecycle-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: `RCV P04 lifecycle ${label}`,
        slug: `test-rcv-p04-lifecycle-${label}-${suffix}`,
      },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        fileNumber: `RCV-P04-LIFECYCLE-${label}-${suffix}`,
        type: 'GENERAL_EXECUTION',
      },
    });
    const due = await prisma.due.create({
      data: {
        caseId: caseRow.id,
        type: 'PRINCIPAL',
        amount: 100,
        dueDate: new Date('2026-01-01T00:00:00.000Z'),
        currency: 'TRY',
      },
    });
    return { tenantId, caseId: caseRow.id, dueId: due.id };
  }

  function createInput(f: Awaited<ReturnType<typeof fixture>>) {
    return {
      route: 'DUE_BRIDGE' as const,
      tenantId: f.tenantId,
      caseId: f.caseId,
      sourceId: f.dueId,
      initiatedByUserId: 'requester-1',
      currency: 'TRY',
      data: {
        tenantId: f.tenantId,
        caseId: f.caseId,
        itemType: 'PRINCIPAL',
        originalAmount: 100,
        demandedAmount: 100,
        collectedAmount: 0,
        amount: 100,
        currency: 'TRY',
        liableDebtorIds: [],
        metadata: { dueSync: { sourceDueId: f.dueId } },
      },
    };
  }

  function router(domainEventIngest: DomainEventIngestService) {
    return new ClaimItemWriterRouterService(
      prisma as any,
      new ClaimItemWriteGateService(prisma as any),
      domainEventIngest,
    );
  }

  it('create ve cancel, retained tombstone + audit + domain event/outbox zincirini atomik yazar', async () => {
    const f = await fixture('create-cancel');
    const service = router(new DomainEventIngestService());
    const created = await service.createSystemClaimItem<any>(createInput(f));

    await service.cancelSystemClaimItem({
      route: 'DUE_BRIDGE',
      tenantId: f.tenantId,
      caseId: f.caseId,
      sourceId: f.dueId,
      initiatedByUserId: 'requester-1',
      claimItemId: created.id,
      currency: 'TRY',
    });

    await expect(prisma.claimItem.findUniqueOrThrow({ where: { id: created.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    const audits = await prisma.auditLog.findMany({
      where: { tenantId: f.tenantId, entityId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((row) => row.action)).toEqual([
      'CLAIM_ITEM_SYSTEM_CREATED',
      'CLAIM_ITEM_SYSTEM_CANCELLED',
    ]);
    expect((audits[1].metadata as any).retentionDisposition).toBe('TOMBSTONE_RETAINED');

    const events = await prisma.icrabotTimelineEntry.findMany({
      where: { caseId: f.caseId },
      orderBy: { aggregateVersion: 'asc' },
    });
    expect(events.map((row) => row.type)).toEqual([
      'CLAIM_ITEM_CREATED',
      'CLAIM_ITEM_CANCELLED',
    ]);
    const outbox = await prisma.icrabotOutboxAction.findMany({
      where: { caseId: f.caseId },
      orderBy: { createdAt: 'asc' },
    });
    expect(outbox.map((row) => row.actionType)).toEqual([
      'EVENT_PUBLISHED:CLAIM_ITEM_CREATED',
      'EVENT_PUBLISHED:CLAIM_ITEM_CANCELLED',
    ]);
  });

  it('event append başarısızsa ClaimItem ve audit aynı transaction ile rollback olur', async () => {
    const f = await fixture('event-rollback');
    const failingEvent = {
      appendInTransaction: jest.fn().mockRejectedValue(new Error('event unavailable')),
    } as unknown as DomainEventIngestService;

    await expect(router(failingEvent).createSystemClaimItem(createInput(f)))
      .rejects.toThrow('event unavailable');

    await expect(prisma.claimItem.count({ where: { caseId: f.caseId } })).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { tenantId: f.tenantId } })).resolves.toBe(0);
  });

  it('exact backfill provenance operational rollback ile audit/event bırakarak fiziksel silinir', async () => {
    const f = await fixture('backfill-rollback');
    const eventService = new DomainEventIngestService();
    const apply = await runBackfill(
      prisma as any,
      parseBackfillArgs(['--apply', '--tenant', f.tenantId]),
      {
        now: () => new Date('2026-07-15T00:00:00.000Z'),
        domainEventIngest: eventService,
      },
    );
    expect(apply.claimItemsCreated).toBe(1);

    const rollback = await runRollback(
      prisma as any,
      parseBackfillArgs(['--rollback', apply.runId, '--apply']),
      {
        now: () => new Date('2026-07-15T00:01:00.000Z'),
        domainEventIngest: eventService,
      },
    );

    expect(rollback).toMatchObject({
      matched: 1,
      deleted: 1,
      refused_hasAllocations: 0,
      refused_invalidProvenance: 0,
    });
    await expect(prisma.claimItem.count({ where: { caseId: f.caseId } })).resolves.toBe(0);
    await expect(prisma.auditLog.count({
      where: {
        tenantId: f.tenantId,
        action: 'CLAIM_ITEM_BACKFILL_ROLLED_BACK',
      },
    })).resolves.toBe(1);
    await expect(prisma.icrabotTimelineEntry.count({
      where: { caseId: f.caseId, type: 'CLAIM_ITEM_ROLLED_BACK' },
    })).resolves.toBe(1);
  });
});
