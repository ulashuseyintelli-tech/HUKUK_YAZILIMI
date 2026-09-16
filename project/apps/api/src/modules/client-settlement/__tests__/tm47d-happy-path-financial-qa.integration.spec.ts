import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { AuditService } from '../../audit/audit.service';
import { ClientStatementService } from '../../client-statement/client-statement.service';
import { ClientOffsetService } from '../client-offset.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';
import { CaseBalanceService } from '../../interest-engine/orchestration/case-balance.service';
import { RateProviderService } from '../../interest-engine/rates/rate-provider.service';
import { InterestEngineService } from '../../interest-engine/interest-engine.service';
import { PolicyGateV2Service } from '../../interest-engine/policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../../interest-engine/segments/segment-builder.service';
import { AllocationEngineService } from '../../interest-engine/allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../../interest-engine/allocation/claim-priority.service';
import { VersionPinningService } from '../../interest-engine/version/version-pinning.service';
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

// Yapisal kanit: bu fixture'da closingBalance'i para-hareketi (CASE_COLLECTION_PAYABLE)
// belirler; EXPENSE_REQUESTED bilgi satiridir (debit/credit 0) ve ClientOffset bacaklarinin
// toplami net 0'dir (client-statement.service.ts:704-778). Yalnizca beklenen sayiyi
// degistirerek degil, closing = collection payable'i URETENIN bu oldugunu dogrular.
async function expectExpenseInformationalAndOffsetNetZero(prisma: PrismaClient, statementId: string): Promise<void> {
  const rows = await prisma.clientStatementLine.findMany({
    where: { statementId },
    select: { lineType: true, debit: true, credit: true },
  });
  const expenseRows = rows.filter((r) => r.lineType === 'EXPENSE_REQUESTED');
  expect(expenseRows.length).toBeGreaterThan(0);
  for (const exp of expenseRows) {
    expect(exp.debit.toString()).toBe('0');
    expect(exp.credit.toString()).toBe('0');
  }
  const offsetLegs = rows.filter((r) => r.lineType.startsWith('CLIENT_OFFSET'));
  expect(offsetLegs.length).toBeGreaterThan(0);
  const offsetNet = offsetLegs.reduce((sum, r) => sum.plus(r.credit).minus(r.debit), new Prisma.Decimal(0));
  expect(offsetNet.toString()).toBe('0');
}

// ClientStatementService.loadAccruedInterest GERCEK CaseBalanceService.computeCaseBalance
// yolunu kullanir (RECEIVABLE outstanding faiz projeksiyonu). Ayni disposable Prisma ile
// gercek interest-engine zinciri kurulur (scenario-materializer.db-gated ile ayni desen).
// reportRenderer/auditWriter read-only bakiye hesabinda kullanilmaz -> {} birakilir; bu
// finansal sonucu SABITLEYEN/hesaplamayi atlayan mock DEGILDIR (policyGate/segmentBuilder/
// allocationEngine/rateProvider/versionPinning GERCEK, hesaplama gercek zincirden gecer).
function buildCaseBalanceService(prisma: PrismaClient): CaseBalanceService {
  const engine = new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never,
    {} as never,
    new VersionPinningService(),
    undefined,
  );
  return new CaseBalanceService(prisma as never, new RateProviderService(prisma as never), engine);
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
      { getOfficeIdentity: jest.fn().mockResolvedValue({ name: 'TM47D QA Office' }) } as any,
      audit,
      buildCaseBalanceService(prisma),
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
    // closingBalance = para-hareketi toplami = CASE_COLLECTION_PAYABLE (1000). Bu fixture'da
    // EXPENSE_REQUESTED bilgi satiridir (debit/credit 0) ve ClientOffset iki bacagi net 0'dir
    // (client-statement.service.ts:704-778) -> ikisi de closing'i oynatmaz, closing collection
    // payable'a esittir. ("closing her zaman brut" DEGIL; bu hareket kumesinin sonucu.) Musteri
    // NET pozisyonu (400) ayri kavramdir ve yukaridaki previewOffset netBefore/netAfter=400'de korunur.
    expect(appliedStatement.closingBalance.toString()).toBe('1000');
    await expectExpenseInformationalAndOffsetNetZero(prisma, appliedStatement.id);

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
    // Reverse + supersede sonrasi da collection payable sabit 1000; APPLY + REVERSAL offset
    // bacaklari net 0, EXPENSE_REQUESTED bilgi -> regenerated closing da 1000 (ayni para-hareketi formulu).
    expect(regeneratedStatement.closingBalance.toString()).toBe('1000');
    await expectExpenseInformationalAndOffsetNetZero(prisma, regeneratedStatement.id);

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