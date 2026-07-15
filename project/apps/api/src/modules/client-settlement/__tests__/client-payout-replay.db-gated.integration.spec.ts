/**
 * RC-COL / W1.3 — ClientPayout replay characterization against real PostgreSQL.
 *
 * The payout call chain is exercised as request -> approve -> finalize. The
 * concurrent case uses a test-local Prisma middleware latch at the production
 * advisory-lock boundary, so both finalize calls pass the pre-check before
 * either transaction can persist a payout. No production hook is required.
 */
import 'reflect-metadata';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { describeDb } from '../../../../test/describe-db';
import { cleanupTm47dHappyPathFixture, seedTm47dHappyPathFixture, Tm47dHappyPathSeedResult } from '../../../scripts/tm47d-happy-path-seed';
import { AuditService } from '../../audit/audit.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { PayoutApprovalPolicy } from '../../office-approval/client-payout-approval.policy';
import { ClientPayoutService } from '../client-payout.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

interface PayoutServices {
  payout: ClientPayoutService;
  approval: OfficeApprovalService;
}

function buildServices(prisma: PrismaClient): PayoutServices {
  const audit = new AuditService(prisma as any);
  const policy = new PayoutApprovalPolicy(prisma as any);
  const approval = new OfficeApprovalService(prisma as any, audit, undefined, policy);
  const payout = new ClientPayoutService(
    prisma as any,
    new ClientSettlementReadService(prisma as any),
    audit,
    approval,
    policy,
  );
  return { payout, approval };
}

function payoutDto(fixture: Tm47dHappyPathSeedResult, idempotencyKey: string) {
  return {
    caseId: fixture.payableCaseId,
    caseClientId: fixture.payableCaseClientId,
    amount: '400',
    currency: fixture.currency,
    note: 'W1.3 replay characterization',
    idempotencyKey,
  };
}

async function approvePayout(
  services: PayoutServices,
  fixture: Tm47dHappyPathSeedResult,
  idempotencyKey: string,
) {
  const dto = payoutDto(fixture, idempotencyKey);
  const requested = await services.payout.requestPayout(
    fixture.tenantId,
    dto,
    { userId: fixture.actorUserId },
  );
  await services.approval.approve(requested.approvalRequestId, fixture.actorUserId);
  return { approvalRequestId: requested.approvalRequestId, dto };
}

async function readEvidence(prisma: PrismaClient, fixture: Tm47dHappyPathSeedResult) {
  const [
    payouts,
    payoutAllocations,
    approvals,
    journals,
    journalLines,
    ledgerEntries,
    ledgerAllocations,
    events,
    outbox,
  ] = await Promise.all([
    prisma.clientPayout.findMany({
      where: { tenantId: fixture.tenantId, caseId: fixture.payableCaseId },
      orderBy: { id: 'asc' },
    }),
    prisma.clientPayoutAllocation.findMany({
      where: { tenantId: fixture.tenantId, caseId: fixture.payableCaseId },
      orderBy: { id: 'asc' },
    }),
    prisma.officeApprovalRequest.findMany({
      where: { tenantId: fixture.tenantId, targetType: 'CLIENT_PAYOUT_REQUEST' },
      orderBy: { id: 'asc' },
    }),
    prisma.accountingJournalEntry.findMany({
      where: {
        tenantId: fixture.tenantId,
        caseId: fixture.payableCaseId,
        sourceType: 'CLIENT_PAYOUT',
      },
      orderBy: { id: 'asc' },
    }),
    prisma.accountingJournalLine.findMany({
      where: {
        tenantId: fixture.tenantId,
        caseId: fixture.payableCaseId,
        payoutId: { not: null },
      },
      orderBy: [{ journalEntryId: 'asc' }, { lineNo: 'asc' }],
    }),
    prisma.ledgerEntry.findMany({
      where: { tenantId: fixture.tenantId, caseId: fixture.payableCaseId },
      orderBy: { id: 'asc' },
    }),
    prisma.ledgerAllocation.findMany({
      where: { ledgerEntry: { tenantId: fixture.tenantId, caseId: fixture.payableCaseId } },
      orderBy: { id: 'asc' },
    }),
    prisma.icrabotTimelineEntry.findMany({
      where: { tenantId: fixture.tenantId, caseId: fixture.payableCaseId },
      orderBy: { id: 'asc' },
    }),
    prisma.icrabotOutboxAction.findMany({
      where: { tenantId: fixture.tenantId, caseId: fixture.payableCaseId },
      orderBy: { id: 'asc' },
    }),
  ]);

  return {
    payouts,
    payoutAllocations,
    approvals,
    journals,
    journalLines,
    ledgerEntries,
    ledgerAllocations,
    events,
    outbox,
  };
}

function evidenceCounts(evidence: Awaited<ReturnType<typeof readEvidence>>) {
  return {
    payouts: evidence.payouts.length,
    payoutAllocations: evidence.payoutAllocations.length,
    approvals: evidence.approvals.length,
    journals: evidence.journals.length,
    journalLines: evidence.journalLines.length,
    ledgerEntries: evidence.ledgerEntries.length,
    ledgerAllocations: evidence.ledgerAllocations.length,
    events: evidence.events.length,
    outbox: evidence.outbox.length,
  };
}

function expectCompleteSinglePayout(
  evidence: Awaited<ReturnType<typeof readEvidence>>,
  fixture: Tm47dHappyPathSeedResult,
  idempotencyKey: string,
) {
  expect(evidenceCounts(evidence)).toEqual({
    payouts: 1,
    payoutAllocations: 1,
    approvals: 1,
    journals: 1,
    journalLines: 2,
    ledgerEntries: 0,
    ledgerAllocations: 0,
    events: 0,
    outbox: 0,
  });

  const payout = evidence.payouts[0];
  expect(payout).toEqual(
    expect.objectContaining({
      tenantId: fixture.tenantId,
      caseId: fixture.payableCaseId,
      caseClientId: fixture.payableCaseClientId,
      idempotencyKey,
      status: 'RECORDED',
      currency: fixture.currency,
      paidById: fixture.actorUserId,
    }),
  );
  expect(payout.amount.equals(new Prisma.Decimal('400'))).toBe(true);

  expect(evidence.payoutAllocations[0]).toEqual(
    expect.objectContaining({
      clientPayoutId: payout.id,
      collectionId: fixture.collectionId,
      collectionDispositionId: fixture.collectionDispositionId,
      collectionDispositionLineId: fixture.collectionDispositionLineId,
    }),
  );
  expect(evidence.payoutAllocations[0].amount.equals(new Prisma.Decimal('400'))).toBe(true);

  expect(evidence.approvals[0]).toEqual(
    expect.objectContaining({
      actionCode: 'CLIENT_PAYOUT_POST',
      targetRef: idempotencyKey,
      status: 'APPROVED',
      executionStatus: 'SUCCEEDED',
      requesterUserId: fixture.actorUserId,
      approverUserId: fixture.actorUserId,
    }),
  );

  expect(evidence.journals[0]).toEqual(
    expect.objectContaining({
      entryType: 'CLIENT_PAYOUT_RECORDED',
      sourceType: 'CLIENT_PAYOUT',
      sourceId: payout.id,
      sourceAction: 'recorded',
    }),
  );
  expect(evidence.journalLines.map((line) => [line.accountCode, line.direction, line.payoutId]))
    .toEqual([
      ['CLIENT_PAYABLE', 'DEBIT', payout.id],
      ['CASH_CLEARING', 'CREDIT', payout.id],
    ]);
  expect(evidence.journalLines.every((line) => line.amount.equals(new Prisma.Decimal('400')))).toBe(true);
}

function createAdvisoryLockLatch() {
  let arrivals = 0;
  let resolveBothArrived!: () => void;
  let release!: () => void;
  const bothArrived = new Promise<void>((resolve) => { resolveBothArrived = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });

  return {
    async intercept() {
      arrivals += 1;
      if (arrivals === 2) resolveBothArrived();
      await released;
    },
    waitForBoth: () => bothArrived,
    release,
    get arrivals() { return arrivals; },
  };
}

async function cleanupFixture(prisma: PrismaClient, fixture: Tm47dHappyPathSeedResult | undefined, seedKey: string) {
  if (!fixture) return;
  await prisma.accountingJournalLine.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.accountingJournalEntry.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.ledgerAllocation.deleteMany({ where: { ledgerEntry: { tenantId: fixture.tenantId } } });
  await prisma.ledgerEntry.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.icrabotOutboxAction.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.officeApprovalRequest.deleteMany({ where: { tenantId: fixture.tenantId } });
  await cleanupTm47dHappyPathFixture(prisma, { seedKey });
}

describeDb('RC-COL / W1.3 ClientPayout replay characterization', () => {
  let prisma: PrismaClient;
  let fixture: Tm47dHappyPathSeedResult | undefined;
  let seedKey: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    await prisma.$connect();
  });

  beforeEach(async () => {
    seedKey = `w13-payout-${randomUUID()}`;
    fixture = await seedTm47dHappyPathFixture(prisma, { seedKey });
  });

  afterEach(async () => {
    await cleanupFixture(prisma, fixture, seedKey);
    fixture = undefined;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('same-key sequential finalize replay returns the original payout without duplicate persistence', async () => {
    const currentFixture = fixture!;
    const idempotencyKey = `${seedKey}-sequential`;
    const services = buildServices(prisma);
    const approved = await approvePayout(services, currentFixture, idempotencyKey);

    const first = await services.payout.finalize(
      currentFixture.tenantId,
      approved.approvalRequestId,
      approved.dto,
      { userId: currentFixture.actorUserId },
    );
    const afterFirst = await readEvidence(prisma, currentFixture);
    expectCompleteSinglePayout(afterFirst, currentFixture, idempotencyKey);

    const replay = await services.payout.finalize(
      currentFixture.tenantId,
      approved.approvalRequestId,
      approved.dto,
      { userId: currentFixture.actorUserId },
    );
    const afterReplay = await readEvidence(prisma, currentFixture);

    expect(first).toEqual({ created: true, payoutId: afterFirst.payouts[0].id });
    expect(replay).toEqual({ created: false, payoutId: first.payoutId, idempotentReplay: true });
    expectCompleteSinglePayout(afterReplay, currentFixture, idempotencyKey);
    expect(evidenceCounts(afterReplay)).toEqual(evidenceCounts(afterFirst));
  });

  it('same-key concurrent finalize replay serializes at the real advisory lock without duplicate or partial persistence', async () => {
    const currentFixture = fixture!;
    const idempotencyKey = `${seedKey}-concurrent`;
    const concurrencyPrisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    const latch = createAdvisoryLockLatch();

    concurrencyPrisma.$use(async (params, next) => {
      const rawQuery = (params.args as any)?.[0];
      const queryText = String(rawQuery?.sql ?? rawQuery?.text ?? rawQuery ?? '');
      if (params.action === 'executeRaw' && queryText.includes('pg_advisory_xact_lock')) {
        await latch.intercept();
      }
      return next(params);
    });

    await concurrencyPrisma.$connect();
    const services = buildServices(concurrencyPrisma);
    const approved = await approvePayout(services, currentFixture, idempotencyKey);
    const calls = [
      services.payout.finalize(
        currentFixture.tenantId,
        approved.approvalRequestId,
        approved.dto,
        { userId: currentFixture.actorUserId },
      ),
      services.payout.finalize(
        currentFixture.tenantId,
        approved.approvalRequestId,
        approved.dto,
        { userId: currentFixture.actorUserId },
      ),
    ];

    try {
      await latch.waitForBoth();
      expect(latch.arrivals).toBe(2);
      latch.release();

      const results = await Promise.all(calls);
      const evidence = await readEvidence(prisma, currentFixture);
      const payoutId = evidence.payouts[0].id;

      expect(results.map((result) => result.created).sort()).toEqual([false, true]);
      expect(results.every((result) => result.payoutId === payoutId)).toBe(true);
      expect(results.filter((result) => result.idempotentReplay === true)).toHaveLength(1);
      expectCompleteSinglePayout(evidence, currentFixture, idempotencyKey);
    } finally {
      latch.release();
      await Promise.allSettled(calls);
      await concurrencyPrisma.$disconnect();
    }
  }, 30_000);
});
