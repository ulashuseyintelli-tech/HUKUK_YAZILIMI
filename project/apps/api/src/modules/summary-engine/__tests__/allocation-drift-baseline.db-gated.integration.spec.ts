import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import {
  buildAllocationComparisonContext,
  diagnoseCollectionAllocationProjection,
} from '../allocation-drift-baseline';
import { SummaryEngineService } from '../summary-engine.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('WS04-P01 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

interface Fixture {
  tenantId: string;
  caseId: string;
  claimItemId: string;
  summaryEngine: SummaryEngineService;
}

describeWithDisposableDb('WS04-P01 allocation drift baseline - disposable DB', () => {
  jest.setTimeout(90_000);
  let prisma: PrismaClient;
  const tenantIdsToClean = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterEach(async () => {
    for (const tenantId of [...tenantIdsToClean]) {
      await cleanupTenant(tenantId);
    }
  });

  afterAll(async () => {
    for (const tenantId of [...tenantIdsToClean]) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId: string): Promise<void> {
    await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
    await prisma.collection.deleteMany({ where: { tenantId } });
    await prisma.claimItem.deleteMany({ where: { tenantId } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    tenantIdsToClean.delete(tenantId);
  }

  async function createFixture(): Promise<Fixture> {
    const suffix = randomUUID();
    const tenantId = `ws04-p01-${suffix}`;
    tenantIdsToClean.add(tenantId);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'WS04 P01 Drift Evidence Tenant',
        slug: `ws04-p01-${suffix}`,
      },
    });
    const client = await prisma.client.create({
      data: {
        tenantId,
        displayName: 'WS04 P01 Client',
        type: 'INDIVIDUAL',
      },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `WS04-P01-${suffix}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
        interestType: 'YASAL',
      },
    });
    const claimItem = await prisma.claimItem.create({
      data: {
        tenantId,
        caseId: caseRow.id,
        itemType: 'PRINCIPAL',
        originalAmount: 1_000,
        demandedAmount: 1_000,
        amount: 1_000,
        currency: 'TRY',
        interestType: 'YASAL',
        interestAccrualStatus: 'NO_INTEREST',
        liableDebtorIds: [],
      },
    });
    const summaryEngine = new SummaryEngineService(
      prisma as never,
      new TBK100AllocatorService(),
    );
    await summaryEngine.onModuleInit();

    return {
      tenantId,
      caseId: caseRow.id,
      claimItemId: claimItem.id,
      summaryEngine,
    };
  }

  async function allocate(
    fixture: Fixture,
    amount: number,
    commandId = `ws04-p01-${randomUUID()}`,
  ) {
    return prisma.$transaction((tx) =>
      fixture.summaryEngine.allocatePaymentToLedgerInTx(
        tx,
        fixture.tenantId,
        fixture.caseId,
        amount,
        { commandId, sourceType: 'WS04_P01_EVIDENCE' },
      ),
    );
  }

  it('persisted/runtime ve LedgerAllocation/collectedAmount parity evidence cent-exact PASS olur', async () => {
    const fixture = await createFixture();

    const result = await allocate(fixture, 125.55, 'ws04-p01-equality');

    expect(result.authorityEvidence).toMatchObject({
      allocatorMode: 'TBK100',
      runtimePersisted: {
        classification: 'EQUALITY',
        canonicalTotal: 125.55,
        candidateTotal: 125.55,
      },
      ledgerCollectedAmount: {
        classification: 'EQUALITY',
        canonicalTotal: 125.55,
        candidateTotal: 125.55,
      },
    });
    const persisted = await prisma.ledgerAllocation.aggregate({
      where: {
        claimItemId: fixture.claimItemId,
        ledgerEntry: { tenantId: fixture.tenantId, status: 'CONFIRMED' },
      },
      _sum: { amount: true },
    });
    const claimItem = await prisma.claimItem.findUniqueOrThrow({
      where: { id: fixture.claimItemId },
    });
    expect(Number(persisted._sum.amount)).toBe(125.55);
    expect(Number(claimItem.collectedAmount)).toBe(125.55);
  });

  it('injected cache drift yeni financial write içinde tespit edilir ve transaction tamamen rollback olur', async () => {
    const fixture = await createFixture();
    await allocate(fixture, 100, 'ws04-p01-baseline');

    await prisma.claimItem.update({
      where: { id: fixture.claimItemId },
      data: { collectedAmount: { increment: 0.01 } },
    });
    const ledgerCountBefore = await prisma.ledgerEntry.count({
      where: { tenantId: fixture.tenantId },
    });
    const allocationCountBefore = await prisma.ledgerAllocation.count({
      where: { claimItemId: fixture.claimItemId },
    });

    await expect(
      allocate(fixture, 50, 'ws04-p01-drift-injection'),
    ).rejects.toMatchObject({
      code: 'ALLOCATION_DRIFT_DETECTED',
      boundary: 'LEDGER_ALLOCATION_TO_CLAIM_ITEM_COLLECTED_AMOUNT',
    });

    await expect(prisma.ledgerEntry.count({
      where: { tenantId: fixture.tenantId },
    })).resolves.toBe(ledgerCountBefore);
    await expect(prisma.ledgerAllocation.count({
      where: { claimItemId: fixture.claimItemId },
    })).resolves.toBe(allocationCountBefore);
    const claimItem = await prisma.claimItem.findUniqueOrThrow({
      where: { id: fixture.claimItemId },
    });
    expect(Number(claimItem.collectedAmount)).toBe(100.01);
  });

  it('CollectionAllocation compatibility projection ve explicit HELD farkı ayrı diagnostic üretir', async () => {
    const fixture = await createFixture();
    const collection = await prisma.collection.create({
      data: {
        tenantId: fixture.tenantId,
        caseId: fixture.caseId,
        amount: 100,
        currency: 'TRY',
        type: 'BANK_TRANSFER',
        channel: 'BANKA',
        date: new Date('2026-07-17T00:00:00.000Z'),
        idempotencyKey: `ws04-p01-projection-${randomUUID()}`,
      },
    });
    await prisma.$transaction((tx) =>
      fixture.summaryEngine.allocatePaymentToLedgerInTx(
        tx,
        fixture.tenantId,
        fixture.caseId,
        80,
        {
          commandId: 'ws04-p01-projection-evidence',
          collectionId: collection.id,
          sourceType: 'WS04_P01_EVIDENCE',
        },
      ),
    );
    await prisma.collectionAllocation.createMany({
      data: [
        {
          collectionId: collection.id,
          allocationType: 'PRINCIPAL',
          amount: 80,
        },
        {
          collectionId: collection.id,
          allocationType: 'OTHER',
          amount: 20,
        },
      ],
    });

    const [ledgerRows, projectionRows] = await Promise.all([
      prisma.ledgerAllocation.findMany({
        where: { ledgerEntry: { collectionId: collection.id, status: 'CONFIRMED' } },
        select: { amount: true, claimItem: { select: { itemType: true } } },
      }),
      prisma.collectionAllocation.findMany({
        where: { collectionId: collection.id },
        select: { allocationType: true, amount: true },
      }),
    ]);
    const diagnostic = diagnoseCollectionAllocationProjection({
      ledgerAllocation: ledgerRows.map((row) => ({
        key: row.claimItem.itemType,
        amount: row.amount,
      })),
      collectionAllocation: projectionRows.map((row) => ({
        key: row.allocationType,
        amount: row.amount,
      })),
      heldOverpayment: [{ key: 'OTHER', amount: 20 }],
      context: buildAllocationComparisonContext({
        tenantId: fixture.tenantId,
        caseId: fixture.caseId,
        currency: 'TRY',
        frozenInputId: collection.id,
      }),
    });

    expect(diagnostic).toMatchObject({
      classification: 'ALLOWED_DIVERGENCE',
      canonicalTotal: 80,
      candidateTotal: 100,
      allowedDivergenceTotal: 20,
    });
  });
});
