/** ADR-014 PR-1B: real CollectionService create/cancel reversal gate on disposable PostgreSQL. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { CollectionService } from '../collection.service';
import {
  CollectionChannel,
  CollectionSource,
  CollectionType,
  CreateCollectionDto,
} from '../dto/collection.dto';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { CaseBalanceService } from '../../interest-engine/orchestration/case-balance.service';
import { RateProviderService } from '../../interest-engine/rates/rate-provider.service';
import { InterestEngineService } from '../../interest-engine/interest-engine.service';
import { PolicyGateV2Service } from '../../interest-engine/policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../../interest-engine/segments/segment-builder.service';
import { AllocationEngineService } from '../../interest-engine/allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../../interest-engine/allocation/claim-priority.service';
import { VersionPinningService } from '../../interest-engine/version/version-pinning.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('ADR-014 PR-1B DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const CLAIM_START = new Date('2026-06-01T00:00:00.000Z');
const PAYMENT_DATE = '2026-06-20T00:00:00.000Z';
const AS_OF = '2026-07-01';
const PAYMENT_AMOUNT = 2_000;

function buildInterestEngine(): InterestEngineService {
  return new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never,
    {} as never,
    new VersionPinningService(),
    undefined,
  );
}

interface Fixture {
  tenantId: string;
  userId: string;
  caseId: string;
  caseDebtorId: string;
  claimItemId: string;
  collectionService: CollectionService;
  caseBalance: CaseBalanceService;
  domainEvents: DomainEventIngestService;
  summaryEngine: SummaryEngineService;
}

describeWithDisposableDb('ADR-014 PR-1B CollectionService cancellation reversal - disposable DB', () => {
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
    await prisma.icrabotOutboxAction.deleteMany({ where: { tenantId } });
    await prisma.accountingJournalEntry.deleteMany({ where: { tenantId } });
    await prisma.collectionOverpayment.deleteMany({ where: { tenantId } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId, entryType: 'REVERSAL' } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
    await prisma.collection.deleteMany({ where: { tenantId } });
    await prisma.claimItem.deleteMany({ where: { tenantId } });
    await prisma.rateSchedule.deleteMany({ where: { tenantId } });
    await prisma.office.deleteMany({ where: { tenantId } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    tenantIdsToClean.delete(tenantId);
    // IcrabotTimelineEntry append-only DB trigger nedeniyle silinmez. Her fixture random
    // tenant/case kimliği kullanır; disposable DB kapatıldığında fiziksel olarak temizlenir.
  }

  async function createFixture(): Promise<Fixture> {
    const suffix = randomUUID();
    const tenantId = `pr1b-${suffix}`;
    tenantIdsToClean.add(tenantId);

    await prisma.tenant.create({
      data: { id: tenantId, name: 'ADR-014 PR-1B Tenant', slug: `pr1b-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `pr1b-${suffix}@example.test`,
        name: 'ADR014',
        surname: 'PR1B',
      },
    });
    await prisma.office.create({ data: { id: tenantId, tenantId, name: 'ADR-014 PR-1B Office' } });
    await prisma.rateSchedule.create({
      data: {
        tenantId,
        interestType: 'LEGAL_3095',
        validFrom: new Date('2020-01-01T00:00:00.000Z'),
        annualRate: 0.24,
        source: 'MANUAL',
        versionHash: `pr1b-rate-${suffix}`,
      },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'ADR-014 Muvekkil', type: 'INDIVIDUAL' },
    });
    const debtor = await prisma.debtor.create({
      data: { tenantId, name: 'ADR-014 Borclu', type: 'INDIVIDUAL' },
    });
    const caseRow = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `PR1B-${suffix}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
        interestType: 'YASAL',
      },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: caseRow.id, debtorId: debtor.id, role: 'ASIL_BORCLU' },
    });
    const claimItem = await prisma.claimItem.create({
      data: {
        tenantId,
        caseId: caseRow.id,
        itemType: 'PRINCIPAL',
        originalAmount: 10_000,
        demandedAmount: 10_000,
        amount: 10_000,
        currency: 'TRY',
        interestType: 'YASAL',
        interestStartDate: CLAIM_START,
        interestAccrualStatus: 'ACCRUES',
        interestStartDateProvenance: 'MANUAL_LAWYER_CONFIRMED',
        liableDebtorIds: [],
      },
    });

    const domainEvents = new DomainEventIngestService();
    const summaryEngine = new SummaryEngineService(
      prisma as never,
      new TBK100AllocatorService(),
    );
    await summaryEngine.onModuleInit();
    const collectionService = new CollectionService(
      prisma as never,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as never),
      summaryEngine,
      new AccountingJournalWriterService(prisma as never),
    );
    const caseBalance = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      buildInterestEngine(),
    );

    return {
      tenantId,
      userId: user.id,
      caseId: caseRow.id,
      caseDebtorId: caseDebtor.id,
      claimItemId: claimItem.id,
      collectionService,
      caseBalance,
      domainEvents,
      summaryEngine,
    };
  }

  function collectionDto(fixture: Fixture): CreateCollectionDto {
    return {
      caseId: fixture.caseId,
      caseDebtorId: fixture.caseDebtorId,
      idempotencyKey: randomUUID(),
      amount: PAYMENT_AMOUNT,
      currency: 'TRY',
      type: CollectionType.BANK_TRANSFER,
      channel: CollectionChannel.BANKA,
      date: PAYMENT_DATE,
      sourceType: CollectionSource.MANUAL,
      receiptNo: `PR1B-${randomUUID()}`,
      autoAllocate: false,
    };
  }

  async function totalDue(fixture: Fixture): Promise<{ totalDue: number; source: string }> {
    const balance = await fixture.caseBalance.computeCaseBalance(fixture.tenantId, fixture.caseId, AS_OF);
    expect(balance.diagnostics.fatal).toEqual([]);
    const tryResult = balance.currencyResults.find((item) => item.currency === 'TRY')?.result;
    expect(tryResult).not.toBeNull();
    return { totalDue: tryResult!.totalDue, source: balance.source };
  }

  async function createPayment(fixture: Fixture) {
    return fixture.collectionService.create(
      fixture.tenantId,
      collectionDto(fixture),
      fixture.userId,
    );
  }

  it('real create -> cancel writes the exact linked reversal and restores pre-payment CaseBalance', async () => {
    const fixture = await createFixture();
    const prePayment = await totalDue(fixture);

    const collection = await createPayment(fixture);
    expect(collection.status).toBe('CONFIRMED');
    const paymentEvent = await prisma.icrabotTimelineEntry.findFirst({
      where: { tenantId: fixture.tenantId, caseId: fixture.caseId, type: 'PAYMENT_RECEIVED' },
    });
    expect(paymentEvent).not.toBeNull();

    const payment = await prisma.ledgerEntry.findFirstOrThrow({
      where: {
        tenantId: fixture.tenantId,
        caseId: fixture.caseId,
        collectionId: collection.id,
        entryType: 'PAYMENT',
        status: 'CONFIRMED',
      },
      include: { allocations: true },
    });
    const paid = await totalDue(fixture);
    expect(paid.source).toBe('LEDGER');
    expect(paid.totalDue).toBeLessThan(prePayment.totalDue);

    await fixture.collectionService.cancel(
      fixture.tenantId,
      collection.id,
      { cancelReason: 'ADR-014 PR-1B acceptance' },
      fixture.userId,
      fixture.caseId,
    );

    const cancelledCollection = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
    expect(cancelledCollection.status).toBe('CANCELLED');
    const reversals = await prisma.ledgerEntry.findMany({
      where: { tenantId: fixture.tenantId, caseId: fixture.caseId, collectionId: collection.id, entryType: 'REVERSAL' },
      include: { allocations: true },
    });
    expect(reversals).toHaveLength(1);
    expect(reversals[0]).toMatchObject({
      reversesLedgerEntryId: payment.id,
      tenantId: fixture.tenantId,
      caseId: fixture.caseId,
      currency: payment.currency,
      status: 'CONFIRMED',
    });
    expect(Number(reversals[0].amount)).toBe(-Number(payment.amount));
    expect(
      reversals[0].allocations.map((allocation) => ({
        claimItemId: allocation.claimItemId,
        amount: Number(allocation.amount),
        order: allocation.allocationOrder,
      })),
    ).toEqual(
      payment.allocations.map((allocation) => ({
        claimItemId: allocation.claimItemId,
        amount: -Number(allocation.amount),
        order: allocation.allocationOrder,
      })),
    );

    await expect(prisma.accountingJournalEntry.count({
      where: {
        tenantId: fixture.tenantId,
        sourceType: 'COLLECTION',
        sourceId: collection.id,
        sourceAction: 'cancel',
        entryType: 'COLLECTION_CASH_RECEIPT_REVERSED',
      },
    })).resolves.toBe(1);
    await expect(prisma.icrabotTimelineEntry.count({
      where: { tenantId: fixture.tenantId, caseId: fixture.caseId, type: 'PAYMENT_REVERSED' },
    })).resolves.toBe(1);

    const cancelled = await totalDue(fixture);
    expect(cancelled.source).toBe('LEDGER');
    expect(cancelled.totalDue).toBeCloseTo(prePayment.totalDue, 2);
  });

  it('tenant isolation prevents foreign cancellation and foreign CaseBalance consumption', async () => {
    const fixture = await createFixture();
    const collection = await createPayment(fixture);
    const foreignTenantId = `pr1b-foreign-${randomUUID()}`;
    tenantIdsToClean.add(foreignTenantId);
    await prisma.tenant.create({
      data: { id: foreignTenantId, name: 'ADR-014 Foreign Tenant', slug: foreignTenantId },
    });

    await expect(
      fixture.collectionService.cancel(
        foreignTenantId,
        collection.id,
        { cancelReason: 'cross-tenant attempt' },
        fixture.userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(prisma.ledgerEntry.count({
      where: { tenantId: foreignTenantId, entryType: 'REVERSAL' },
    })).resolves.toBe(0);

    const foreignBalance = await fixture.caseBalance.computeCaseBalance(foreignTenantId, fixture.caseId, AS_OF);
    expect(foreignBalance.currencyResults).toEqual([]);
    expect(foreignBalance.diagnostics.fatal).toEqual([{ code: 'CASE_NOT_FOUND', caseId: fixture.caseId }]);
  });

  it('duplicate cancel is rejected and leaves exactly one reversal, journal and event', async () => {
    const fixture = await createFixture();
    const collection = await createPayment(fixture);
    await fixture.collectionService.cancel(
      fixture.tenantId,
      collection.id,
      { cancelReason: 'first cancel' },
      fixture.userId,
    );

    await expect(
      fixture.collectionService.cancel(
        fixture.tenantId,
        collection.id,
        { cancelReason: 'duplicate cancel' },
        fixture.userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(prisma.ledgerEntry.count({
      where: { tenantId: fixture.tenantId, collectionId: collection.id, entryType: 'REVERSAL' },
    })).resolves.toBe(1);
    await expect(prisma.accountingJournalEntry.count({
      where: { tenantId: fixture.tenantId, sourceId: collection.id, sourceAction: 'cancel' },
    })).resolves.toBe(1);
    await expect(prisma.icrabotTimelineEntry.count({
      where: { tenantId: fixture.tenantId, caseId: fixture.caseId, type: 'PAYMENT_REVERSED' },
    })).resolves.toBe(1);
  });

  it('journal-stage failure rolls back cancellation, reversal, projections and event/outbox writes', async () => {
    const fixture = await createFixture();
    const collection = await createPayment(fixture);
    const payment = await prisma.ledgerEntry.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, collectionId: collection.id, entryType: 'PAYMENT' },
      include: { allocations: true },
    });
    const journalCountBefore = await prisma.accountingJournalEntry.count({ where: { tenantId: fixture.tenantId } });
    const outboxCountBefore = await prisma.icrabotOutboxAction.count({ where: { tenantId: fixture.tenantId } });
    const failingJournal = {
      write: jest.fn().mockResolvedValue({ ok: false, errors: [{ code: 'FORCED_PR1B_FAILURE' }] }),
    };
    const failingService = new CollectionService(
      prisma as never,
      fixture.domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as never),
      fixture.summaryEngine,
      failingJournal as never,
    );

    await expect(
      failingService.cancel(
        fixture.tenantId,
        collection.id,
        { cancelReason: 'forced rollback' },
        fixture.userId,
      ),
    ).rejects.toThrow('Collection cancel journal write failed: FORCED_PR1B_FAILURE');
    expect(failingJournal.write).toHaveBeenCalledTimes(1);

    const persistedCollection = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
    expect(persistedCollection.status).toBe('CONFIRMED');
    expect(persistedCollection.cancelledAt).toBeNull();
    await expect(prisma.ledgerEntry.count({
      where: { tenantId: fixture.tenantId, collectionId: collection.id, entryType: 'REVERSAL' },
    })).resolves.toBe(0);
    await expect(prisma.ledgerAllocation.count({
      where: { ledgerEntry: { tenantId: fixture.tenantId, collectionId: collection.id } },
    })).resolves.toBe(payment.allocations.length);
    const claimItem = await prisma.claimItem.findUniqueOrThrow({ where: { id: fixture.claimItemId } });
    expect(Number(claimItem.collectedAmount)).toBe(PAYMENT_AMOUNT);
    await expect(prisma.accountingJournalEntry.count({ where: { tenantId: fixture.tenantId } }))
      .resolves.toBe(journalCountBefore);
    await expect(prisma.icrabotTimelineEntry.count({
      where: { tenantId: fixture.tenantId, caseId: fixture.caseId, type: 'PAYMENT_REVERSED' },
    })).resolves.toBe(0);
    await expect(prisma.icrabotOutboxAction.count({ where: { tenantId: fixture.tenantId } }))
      .resolves.toBe(outboxCountBefore);
    await expect(prisma.ledgerEntry.findUnique({ where: { id: payment.id } }))
      .resolves.toMatchObject({ status: 'CONFIRMED', reversesLedgerEntryId: null });
  });
});
