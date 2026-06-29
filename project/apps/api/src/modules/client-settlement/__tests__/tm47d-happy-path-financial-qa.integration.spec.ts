import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { AuditService } from '../../audit/audit.service';
import { ClientStatementService } from '../../client-statement/client-statement.service';
import { ClientOffsetService } from '../client-offset.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';
import {
  cleanupTm47dHappyPathFixture,
  seedTm47dHappyPathFixture,
  Tm47dHappyPathSeedResult,
} from '../../../scripts/tm47d-happy-path-seed';

const SEED_KEY = 'tm47d-happy-path-e2e';
const ZERO = new Prisma.Decimal(0);

function dec(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function offsetDto(fixture: Tm47dHappyPathSeedResult, idempotencyKey = fixture.applyIdempotencyKey) {
  return {
    clientId: fixture.clientId,
    currency: fixture.currency,
    payableCaseId: fixture.payableCaseId,
    payableCaseClientId: fixture.payableCaseClientId,
    expenseCaseId: fixture.expenseCaseId,
    expenseRequestId: fixture.expenseRequestId,
    amount: fixture.offsetAmount,
    idempotencyKey,
  };
}

async function expenseUnpaid(prisma: PrismaClient, fixture: Tm47dHappyPathSeedResult): Promise<Prisma.Decimal> {
  const request = await prisma.expenseRequest.findUniqueOrThrow({
    where: { id: fixture.expenseRequestId },
    select: { totalAmount: true, paidTotal: true },
  });
  const [apply, reversal] = await Promise.all([
    prisma.clientOffset.aggregate({
      _sum: { amount: true },
      where: { tenantId: fixture.tenantId, expenseRequestId: fixture.expenseRequestId, kind: 'APPLY' },
    }),
    prisma.clientOffset.aggregate({
      _sum: { amount: true },
      where: { tenantId: fixture.tenantId, expenseRequestId: fixture.expenseRequestId, kind: 'REVERSAL' },
    }),
  ]);

  return request.totalAmount
    .minus(request.paidTotal)
    .minus(apply._sum.amount ?? ZERO)
    .plus(reversal._sum.amount ?? ZERO);
}

async function statementLineTypes(prisma: PrismaClient, statementId: string): Promise<string[]> {
  const rows = await prisma.clientStatementLine.findMany({
    where: { statementId },
    orderBy: [{ lineDate: 'asc' }, { createdAt: 'asc' }],
    select: { lineType: true },
  });
  return rows.map((row) => row.lineType);
}

describeDb('TM47D-6 happy path financial QA', () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let readService: ClientSettlementReadService;
  let offsetService: ClientOffsetService;
  let statementService: ClientStatementService;
  let fixture: Tm47dHappyPathSeedResult;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    audit = new AuditService(prisma as any);
    readService = new ClientSettlementReadService(prisma as any);
    offsetService = new ClientOffsetService(prisma as any, audit, readService);
    statementService = new ClientStatementService(
      prisma as any,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as any,
      { getOrCreate: jest.fn().mockResolvedValue({ name: 'TM47D QA Office' }) } as any,
      audit,
    );
  });

  beforeEach(async () => {
    fixture = await seedTm47dHappyPathFixture(prisma, { seedKey: SEED_KEY });
  });

  afterEach(async () => {
    await cleanupTm47dHappyPathFixture(prisma, { seedKey: SEED_KEY });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seed -> preview -> apply -> statement -> reverse -> supersede -> audit zincirini finansal invariantlarla dogrular', async () => {
    const seededPayable = await readService.computeOutstanding(
      prisma as any,
      fixture.tenantId,
      fixture.payableCaseId,
      fixture.payableCaseClientId,
      fixture.currency,
    );
    await expect(expenseUnpaid(prisma, fixture)).resolves.toEqual(dec('600'));
    expect(seededPayable.toString()).toBe('1000');

    const ledgerCountBefore = await prisma.balanceLedger.count({
      where: { tenantId: fixture.tenantId },
    });

    const preview = await offsetService.previewOffset(fixture.tenantId, fixture.actorUserId, offsetDto(fixture));
    expect(preview).toEqual({
      payableBefore: '1000',
      payableAfter: '600',
      expenseBefore: '600',
      expenseAfter: '200',
      netBefore: '400',
      netAfter: '400',
      maxAmount: '600',
      netUnchanged: true,
    });

    const applyResult = await offsetService.createOffset(fixture.tenantId, fixture.actorUserId, offsetDto(fixture));
    expect(applyResult).toEqual(expect.objectContaining({ created: true }));
    expect(
      (
        await readService.computeOutstanding(
          prisma as any,
          fixture.tenantId,
          fixture.payableCaseId,
          fixture.payableCaseClientId,
          fixture.currency,
        )
      ).toString(),
    ).toBe('600');
    await expect(expenseUnpaid(prisma, fixture)).resolves.toEqual(dec('200'));
    await expect(prisma.balanceLedger.count({ where: { tenantId: fixture.tenantId } })).resolves.toBe(ledgerCountBefore);

    const appliedStatement = await statementService.createClientLevel(fixture.tenantId, fixture.clientId, fixture.actorUserId, {
      periodStart: fixture.periodStart,
      periodEnd: fixture.periodEnd,
      note: 'TM47D-6 apply QA snapshot',
    });
    await expect(statementLineTypes(prisma, appliedStatement.id)).resolves.toEqual(
      expect.arrayContaining([
        'CASE_COLLECTION_PAYABLE',
        'EXPENSE_REQUESTED',
        'CLIENT_OFFSET_PAYABLE_APPLIED',
        'CLIENT_OFFSET_EXPENSE_APPLIED',
      ]),
    );
    expect(appliedStatement.closingBalance.toString()).toBe('400');

    const reverseResult = await offsetService.reverseOffset(fixture.tenantId, fixture.actorUserId, applyResult.offsetId, {
      reason: 'TM47D-6 happy path reverse QA kontrolu',
      idempotencyKey: fixture.reverseIdempotencyKey,
    });
    expect(reverseResult).toEqual(expect.objectContaining({ created: true, reversesOffsetId: applyResult.offsetId }));
    expect(
      (
        await readService.computeOutstanding(
          prisma as any,
          fixture.tenantId,
          fixture.payableCaseId,
          fixture.payableCaseClientId,
          fixture.currency,
        )
      ).toString(),
    ).toBe('1000');
    await expect(expenseUnpaid(prisma, fixture)).resolves.toEqual(dec('600'));
    await expect(prisma.balanceLedger.count({ where: { tenantId: fixture.tenantId } })).resolves.toBe(ledgerCountBefore);

    const regeneratedStatement = await statementService.supersede(fixture.tenantId, appliedStatement.id, fixture.actorUserId, {
      periodStart: fixture.periodStart,
      periodEnd: fixture.periodEnd,
      note: 'TM47D-6 reverse QA regenerated snapshot',
    });
    const oldStatement = await prisma.clientStatement.findUniqueOrThrow({
      where: { id: appliedStatement.id },
      select: { status: true, supersededById: true },
    });
    expect(oldStatement).toEqual({ status: 'SUPERSEDED', supersededById: regeneratedStatement.id });
    await expect(statementLineTypes(prisma, regeneratedStatement.id)).resolves.toEqual(
      expect.arrayContaining([
        'CASE_COLLECTION_PAYABLE',
        'EXPENSE_REQUESTED',
        'CLIENT_OFFSET_PAYABLE_APPLIED',
        'CLIENT_OFFSET_EXPENSE_APPLIED',
        'CLIENT_OFFSET_PAYABLE_REVERSED',
        'CLIENT_OFFSET_EXPENSE_REVERSED',
      ]),
    );
    expect(regeneratedStatement.closingBalance.toString()).toBe('400');

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: fixture.tenantId,
        entityType: 'ClientOffset',
        action: { in: ['CLIENT_OFFSET_CREATED', 'CLIENT_OFFSET_REVERSED'] },
      },
      select: { action: true, entityId: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((row) => row.action)).toEqual(['CLIENT_OFFSET_CREATED', 'CLIENT_OFFSET_REVERSED']);
    expect(audits.map((row) => row.entityId)).toEqual([applyResult.offsetId, reverseResult.offsetId]);
  });

  it('non-admin actor apply yapamaz ve hicbir offset/audit/ledger yazmaz', async () => {
    const ledgerCountBefore = await prisma.balanceLedger.count({ where: { tenantId: fixture.tenantId } });

    await expect(
      offsetService.createOffset(
        fixture.tenantId,
        fixture.plainUserId,
        offsetDto(fixture, `${fixture.applyIdempotencyKey}-forbidden`),
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(prisma.clientOffset.count({ where: { tenantId: fixture.tenantId } })).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          tenantId: fixture.tenantId,
          entityType: 'ClientOffset',
        },
      }),
    ).resolves.toBe(0);
    await expect(prisma.balanceLedger.count({ where: { tenantId: fixture.tenantId } })).resolves.toBe(ledgerCountBefore);
  });
});