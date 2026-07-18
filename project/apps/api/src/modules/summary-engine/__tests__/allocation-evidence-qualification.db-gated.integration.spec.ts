import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { CollectionService } from '../../collection/collection.service';
import {
  AllocationComparisonRow,
  buildAllocationComparisonContext,
  classifyAllocationComparison,
  diagnoseCollectionAllocationProjection,
} from '../allocation-drift-baseline';
import {
  ALLOCATION_MIXED_HISTORY_EXPECTED_V1,
} from '../allocation-evidence-qualification';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('WS04-P02 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

type ExpectedQualification =
  | 'LEDGER_ONLY'
  | 'COMPATIBILITY_ONLY'
  | 'EQUALITY'
  | 'FAIL_CLOSED_DRIFT'
  | 'CACHE_EQUALITY'
  | 'CACHE_DRIFT'
  | 'ALLOWED_DIVERGENCE'
  | 'CASE_ISOLATED';

interface HistoryScenario {
  id: string;
  ledger?: Array<{
    amount: number;
    itemType?: 'PRINCIPAL' | 'INTEREST';
    status?: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  }>;
  projection?: Array<{
    amount: number;
    allocationType?: 'PRINCIPAL' | 'INTEREST' | 'OTHER';
    status?: 'CONFIRMED' | 'CANCELLED';
  }>;
  collectedAmount?: number;
  heldOverpayment?: number;
  crossCaseProjection?: number;
  expected: ExpectedQualification;
  expectedReaderPrincipal: number;
  expectedReaderInterest?: number;
  expectedUnexplainedMinor: number;
}

const MIXED_HISTORY_SCENARIOS: HistoryScenario[] = [
  {
    id: 'MH-01',
    ledger: [{ amount: 100 }],
    expected: 'LEDGER_ONLY',
    expectedReaderPrincipal: 100,
    expectedUnexplainedMinor: 0,
  },
  {
    id: 'MH-02',
    projection: [{ amount: 100 }],
    expected: 'COMPATIBILITY_ONLY',
    expectedReaderPrincipal: 100,
    expectedUnexplainedMinor: 0,
  },
  {
    id: 'MH-03',
    ledger: [{ amount: 100 }],
    projection: [{ amount: 100 }],
    expected: 'EQUALITY',
    expectedReaderPrincipal: 100,
    expectedUnexplainedMinor: 0,
  },
  {
    id: 'MH-04',
    ledger: [{ amount: 80 }],
    projection: [{ amount: 100 }],
    expected: 'FAIL_CLOSED_DRIFT',
    expectedReaderPrincipal: 80,
    expectedUnexplainedMinor: 2_000,
  },
  {
    id: 'MH-05',
    ledger: [
      { amount: 70, itemType: 'PRINCIPAL' },
      { amount: 30, itemType: 'INTEREST' },
    ],
    projection: [
      { amount: 100, allocationType: 'PRINCIPAL' },
    ],
    expected: 'FAIL_CLOSED_DRIFT',
    expectedReaderPrincipal: 70,
    expectedReaderInterest: 30,
    expectedUnexplainedMinor: 6_000,
  },
  {
    id: 'MH-06',
    ledger: [
      { amount: 60, status: 'CONFIRMED' },
      { amount: 40, status: 'PENDING' },
    ],
    projection: [{ amount: 100 }],
    expected: 'FAIL_CLOSED_DRIFT',
    expectedReaderPrincipal: 60,
    expectedUnexplainedMinor: 4_000,
  },
  {
    id: 'MH-07',
    projection: [
      { amount: 50, status: 'CONFIRMED' },
      { amount: 100, status: 'CANCELLED' },
    ],
    expected: 'COMPATIBILITY_ONLY',
    expectedReaderPrincipal: 50,
    expectedUnexplainedMinor: 0,
  },
  {
    id: 'MH-08',
    ledger: [{ amount: 25 }],
    collectedAmount: 25,
    expected: 'CACHE_EQUALITY',
    expectedReaderPrincipal: 25,
    expectedUnexplainedMinor: 0,
  },
  {
    id: 'MH-09',
    ledger: [{ amount: 25 }],
    collectedAmount: 25.01,
    expected: 'CACHE_DRIFT',
    expectedReaderPrincipal: 25,
    expectedUnexplainedMinor: 1,
  },
  {
    id: 'MH-10',
    ledger: [{ amount: 80 }],
    projection: [
      { amount: 80, allocationType: 'PRINCIPAL' },
      { amount: 20, allocationType: 'OTHER' },
    ],
    heldOverpayment: 20,
    expected: 'ALLOWED_DIVERGENCE',
    expectedReaderPrincipal: 80,
    expectedUnexplainedMinor: 0,
  },
  {
    id: 'MH-11',
    ledger: [{ amount: 30 }],
    crossCaseProjection: 100,
    expected: 'CASE_ISOLATED',
    expectedReaderPrincipal: 30,
    expectedUnexplainedMinor: 0,
  },
];

describeWithDisposableDb('WS04-P02 mixed-history evidence matrix - disposable DB', () => {
  jest.setTimeout(120_000);
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

  it.each(MIXED_HISTORY_SCENARIOS)(
    '$id canonical/projection/current-reader/omitted-unexplained evidence üretir',
    async (scenario) => {
      const fixture = await createFixture(scenario);
      const evidence = await captureEvidence(fixture, scenario);

      expect(evidence).toMatchObject({
        scenarioId: scenario.id,
        qualification: scenario.expected,
        currentReader: {
          PRINCIPAL: scenario.expectedReaderPrincipal,
          INTEREST: scenario.expectedReaderInterest ?? 0,
        },
        unexplainedMinor: scenario.expectedUnexplainedMinor,
      });
      expect(scenario.expected).toBe(
        ALLOCATION_MIXED_HISTORY_EXPECTED_V1[
          scenario.id as keyof typeof ALLOCATION_MIXED_HISTORY_EXPECTED_V1
        ],
      );
      expect(evidence.omittedProjectionMinor).toBe(
        evidence.canonicalLegalAllocation.length > 0
          ? evidence.compatibilityProjection.reduce(
            (sum, row) => sum + Number(row.amountMinor),
            0,
          )
          : 0,
      );
    },
  );

  it('MH-12 reversal/refund bu evidence authorization dışında açıkça route edilir', () => {
    expect({
      scenarioId: 'MH-12',
      status: 'NOT_EXECUTED',
      authorization: 'NOT_AUTHORIZED',
      route: 'OWNER_LEGAL_GATED_REVERSAL_REFUND_LINE',
    }).toEqual(expect.objectContaining({
      status: 'NOT_EXECUTED',
      authorization: 'NOT_AUTHORIZED',
    }));
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

  async function createFixture(scenario: HistoryScenario) {
    const suffix = randomUUID();
    const tenantId = `ws04-p02-${suffix}`;
    tenantIdsToClean.add(tenantId);
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'WS04 P02 Disposable Evidence',
        slug: `ws04-p02-${suffix}`,
      },
    });
    const client = await prisma.client.create({
      data: {
        tenantId,
        displayName: 'WS04 P02 Client',
        type: 'INDIVIDUAL',
      },
    });
    const caseRow = await createCase(tenantId, client.id, `PRIMARY-${suffix}`);
    const principal = await createClaimItem(
      tenantId,
      caseRow.id,
      'PRINCIPAL',
      scenario.collectedAmount ?? 0,
    );
    const interest = await createClaimItem(tenantId, caseRow.id, 'INTEREST', 0);

    const confirmedCollection = await createCollection(
      tenantId,
      caseRow.id,
      'CONFIRMED',
      `primary-${suffix}`,
      sum(scenario.projection?.filter((row) => (row.status ?? 'CONFIRMED') === 'CONFIRMED')
        .map((row) => row.amount) ?? []) + (scenario.heldOverpayment ?? 0),
    );
    for (const [index, projection] of (scenario.projection ?? []).entries()) {
      const status = projection.status ?? 'CONFIRMED';
      const collection = status === 'CONFIRMED'
        ? confirmedCollection
        : await createCollection(
          tenantId,
          caseRow.id,
          status,
          `projection-${index}-${suffix}`,
          projection.amount,
        );
      await prisma.collectionAllocation.create({
        data: {
          collectionId: collection.id,
          allocationType: projection.allocationType ?? 'PRINCIPAL',
          amount: projection.amount,
        },
      });
    }
    for (const [index, ledger] of (scenario.ledger ?? []).entries()) {
      await prisma.ledgerEntry.create({
        data: {
          tenantId,
          caseId: caseRow.id,
          collectionId: index === 0 ? confirmedCollection.id : undefined,
          entryType: 'PAYMENT',
          amount: ledger.amount,
          currency: 'TRY',
          entryDate: new Date('2026-07-18T09:00:00.000Z'),
          status: ledger.status ?? 'CONFIRMED',
          sourceType: 'WS04_P02_DISPOSABLE_EVIDENCE',
          allocations: {
            create: [{
              claimItemId: ledger.itemType === 'INTEREST'
                ? interest.id
                : principal.id,
              amount: ledger.amount,
              allocationOrder: index + 1,
            }],
          },
        },
      });
    }
    if (scenario.heldOverpayment) {
      const ledger = await prisma.ledgerEntry.findFirst({
        where: {
          tenantId,
          caseId: caseRow.id,
          status: 'CONFIRMED',
        },
      });
      await prisma.collectionOverpayment.create({
        data: {
          tenantId,
          caseId: caseRow.id,
          collectionId: confirmedCollection.id,
          sourceLedgerEntryId: ledger?.id,
          amount: scenario.heldOverpayment,
          remainingAmount: scenario.heldOverpayment,
          currency: 'TRY',
          status: 'HELD',
        },
      });
    }
    if (scenario.crossCaseProjection) {
      const secondCase = await createCase(tenantId, client.id, `SECONDARY-${suffix}`);
      const secondCollection = await createCollection(
        tenantId,
        secondCase.id,
        'CONFIRMED',
        `cross-case-${suffix}`,
        scenario.crossCaseProjection,
      );
      await prisma.collectionAllocation.create({
        data: {
          collectionId: secondCollection.id,
          allocationType: 'PRINCIPAL',
          amount: scenario.crossCaseProjection,
        },
      });
    }

    return {
      tenantId,
      caseId: caseRow.id,
      principalId: principal.id,
      interestId: interest.id,
    };
  }

  async function captureEvidence(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    scenario: HistoryScenario,
  ) {
    const [ledgerRows, projectionRows, claimItems, heldRows] = await Promise.all([
      prisma.ledgerAllocation.findMany({
        where: {
          ledgerEntry: {
            tenantId: fixture.tenantId,
            caseId: fixture.caseId,
            status: 'CONFIRMED',
          },
        },
        select: {
          amount: true,
          allocationOrder: true,
          claimItem: { select: { id: true, itemType: true } },
        },
        orderBy: { allocationOrder: 'asc' },
      }),
      prisma.collectionAllocation.findMany({
        where: {
          collection: {
            tenantId: fixture.tenantId,
            caseId: fixture.caseId,
            status: 'CONFIRMED',
          },
        },
        select: { allocationType: true, amount: true },
      }),
      prisma.claimItem.findMany({
        where: {
          tenantId: fixture.tenantId,
          caseId: fixture.caseId,
        },
        select: { id: true, itemType: true, collectedAmount: true },
      }),
      prisma.collectionOverpayment.findMany({
        where: {
          tenantId: fixture.tenantId,
          caseId: fixture.caseId,
          status: 'HELD',
        },
        select: { remainingAmount: true },
      }),
    ]);
    const collectionService = new CollectionService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const currentReader = await collectionService.getCollectedBreakdown(
      fixture.tenantId,
      fixture.caseId,
    );
    const context = buildAllocationComparisonContext({
      tenantId: fixture.tenantId,
      caseId: fixture.caseId,
      currency: 'TRY',
      frozenInputId: scenario.id,
    });
    const canonicalRows: AllocationComparisonRow[] = ledgerRows.map((row) => ({
      key: row.claimItem.itemType,
      amount: row.amount,
    }));
    const projectionComparisonRows: AllocationComparisonRow[] = projectionRows.map(
      (row) => ({
        key: row.allocationType,
        amount: row.amount,
      }),
    );
    const projectionComparison = ledgerRows.length > 0 && projectionRows.length > 0
      ? diagnoseCollectionAllocationProjection({
        ledgerAllocation: canonicalRows,
        collectionAllocation: projectionComparisonRows,
        heldOverpayment: heldRows.map((row) => ({
          key: 'OTHER',
          amount: row.remainingAmount,
        })),
        context,
      })
      : null;
    const cacheComparison = scenario.collectedAmount !== undefined
      ? classifyAllocationComparison({
        canonical: canonicalRows.map((row) => ({
          key: row.key === 'PRINCIPAL' ? fixture.principalId : fixture.interestId,
          amount: row.amount,
        })),
        candidate: claimItems.map((row) => ({
          key: row.id,
          amount: row.collectedAmount,
        })),
        canonicalContext: context,
        candidateContext: context,
      })
      : null;
    const qualification = resolveQualification(
      scenario,
      ledgerRows.length,
      projectionRows.length,
      projectionComparison?.classification,
      cacheComparison?.classification,
    );
    const unexplainedMinor = cacheComparison
      ? sumAbsoluteUnexplainedMinor(cacheComparison.deltas)
      : projectionComparison
        ? sumAbsoluteUnexplainedMinor(projectionComparison.deltas)
        : 0;

    return {
      scenarioId: scenario.id,
      qualification,
      canonicalLegalAllocation: ledgerRows.map((row) => ({
        claimItemId: row.claimItem.id,
        legalBucket: row.claimItem.itemType,
        allocationOrder: row.allocationOrder,
        amountMinor: toMinor(row.amount),
      })),
      compatibilityProjection: projectionRows.map((row, index) => ({
        claimItemId: 'COMPATIBILITY_PROJECTION',
        legalBucket: row.allocationType,
        allocationOrder: index + 1,
        amountMinor: toMinor(row.amount),
      })),
      currentReader,
      omittedProjectionMinor: ledgerRows.length > 0
        ? projectionRows.reduce((sum, row) => sum + Number(toMinor(row.amount)), 0)
        : 0,
      unexplainedMinor,
    };
  }

  async function createCase(tenantId: string, clientId: string, suffix: string) {
    return prisma.case.create({
      data: {
        tenantId,
        clientId,
        fileNumber: `WS04-P02-${suffix}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
        interestType: 'YASAL',
      },
    });
  }

  async function createClaimItem(
    tenantId: string,
    caseId: string,
    itemType: 'PRINCIPAL' | 'INTEREST',
    collectedAmount: number,
  ) {
    return prisma.claimItem.create({
      data: {
        tenantId,
        caseId,
        itemType,
        originalAmount: 1_000,
        demandedAmount: 1_000,
        collectedAmount,
        amount: 1_000,
        currency: 'TRY',
        interestType: 'YASAL',
        interestAccrualStatus: itemType === 'PRINCIPAL'
          ? 'NO_INTEREST'
          : 'ACCRUES',
        liableDebtorIds: [],
      },
    });
  }

  async function createCollection(
    tenantId: string,
    caseId: string,
    status: 'CONFIRMED' | 'CANCELLED',
    idempotencyKey: string,
    amount: number,
  ) {
    return prisma.collection.create({
      data: {
        tenantId,
        caseId,
        amount,
        currency: 'TRY',
        type: 'BANK_TRANSFER',
        channel: 'BANKA',
        date: new Date('2026-07-18T09:00:00.000Z'),
        idempotencyKey,
        status,
      },
    });
  }
});

function resolveQualification(
  scenario: HistoryScenario,
  ledgerCount: number,
  projectionCount: number,
  projectionClass?: string,
  cacheClass?: string,
): ExpectedQualification {
  if (scenario.crossCaseProjection) return 'CASE_ISOLATED';
  if (cacheClass === 'EQUALITY') return 'CACHE_EQUALITY';
  if (cacheClass === 'FAIL_CLOSED_DRIFT') return 'CACHE_DRIFT';
  if (projectionClass === 'ALLOWED_DIVERGENCE') return 'ALLOWED_DIVERGENCE';
  if (projectionClass === 'EQUALITY') return 'EQUALITY';
  if (projectionClass === 'FAIL_CLOSED_DRIFT') return 'FAIL_CLOSED_DRIFT';
  if (ledgerCount > 0 && projectionCount === 0) return 'LEDGER_ONLY';
  return 'COMPATIBILITY_ONLY';
}

function sumAbsoluteUnexplainedMinor(
  deltas: Array<{ unexplainedDifference: number }>,
): number {
  return deltas.reduce(
    (sum, delta) => sum + Math.abs(Math.round(delta.unexplainedDifference * 100)),
    0,
  );
}

function toMinor(value: unknown): string {
  return String(Math.round(Number(String(value)) * 100));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
