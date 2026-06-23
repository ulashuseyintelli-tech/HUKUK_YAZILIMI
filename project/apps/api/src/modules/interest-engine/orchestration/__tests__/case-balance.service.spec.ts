/**
 * G4c-1 CaseBalanceService testleri — compute-on-demand orkestrasyon (gerçek engine + mock prisma/RateProvider).
 * ADDITIVE/READ-ONLY: prisma write çağrılmaz; trigger/persist yok.
 */

import { ClaimItemStatus } from '@prisma/client';
import { CaseBalanceService } from '../case-balance.service';
import { InterestEngineService } from '../../interest-engine.service';
import { PolicyGateV2Service } from '../../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../../segments/segment-builder.service';
import { AllocationEngineService } from '../../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../../allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../../allocation/claim-priority.service';
import { LegalReportRendererService } from '../../reporter/legal-report-renderer.service';
import { SegmentReporterService } from '../../reporter/segment-reporter.service';
import { AuditWriterService } from '../../audit/audit-writer.service';
import { VersionPinningService } from '../../version/version-pinning.service';
import { InterestTypeCode } from '../../types/domain.types';
import { RateSourceType } from '../../rates/rate-entry.entity';

function realEngine(): InterestEngineService {
  const policyGate = new PolicyGateV2Service();
  const segmentBuilder = new SegmentBuilderService();
  const allocationEngine = new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService());
  const reportRenderer = new LegalReportRendererService(new SegmentReporterService());
  const auditWriter = new AuditWriterService();
  auditWriter.clearAll();
  return new InterestEngineService(policyGate, segmentBuilder, allocationEngine, reportRenderer, auditWriter, new VersionPinningService());
}

function legalRate() {
  return [{ id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' }];
}

interface MockPrisma {
  case: { findFirst: jest.Mock };
  claimItem: { findMany: jest.Mock };
  ledgerEntry: { findMany: jest.Mock };
  collection: { findMany: jest.Mock };
  collectionOverpayment: { findMany: jest.Mock };
  icrabotTimelineEntry: { findMany: jest.Mock };
  due: { findMany: jest.Mock };
}

function setup(opts: {
  caseRow?: { interestType: string | null; interestStartDate: Date | null } | null;
  claimItems?: unknown[];
  ledger?: unknown[];
  collections?: unknown[];
  overpayments?: unknown[];
  blockedOverpaymentEvents?: unknown[];
  dues?: unknown[];
  rates?: unknown[];
}) {
  const claimItems = opts.claimItems ?? [];
  const prisma: MockPrisma = {
    case: { findFirst: jest.fn().mockResolvedValue(opts.caseRow === undefined ? { interestType: null, interestStartDate: null } : opts.caseRow) },
    claimItem: {
      findMany: jest.fn().mockImplementation(async (args?: any) => {
        const excludedStatus = args?.where?.status?.not;
        return excludedStatus
          ? claimItems.filter((item: any) => item.status !== excludedStatus)
          : claimItems;
      }),
    },
    ledgerEntry: { findMany: jest.fn().mockResolvedValue(opts.ledger ?? []) },
    collection: { findMany: jest.fn().mockResolvedValue(opts.collections ?? []) },
    collectionOverpayment: { findMany: jest.fn().mockResolvedValue(opts.overpayments ?? []) },
    icrabotTimelineEntry: { findMany: jest.fn().mockResolvedValue(opts.blockedOverpaymentEvents ?? []) },
    due: { findMany: jest.fn().mockResolvedValue(opts.dues ?? []) },
  };
  const rateProvider = { getRatesForPeriod: jest.fn().mockResolvedValue(opts.rates ?? []) };
  const engine = realEngine();
  const computeBalanceSpy = jest.spyOn(engine, 'computeBalance');
  const service = new CaseBalanceService(prisma as never, rateProvider as never, engine);
  return { service, prisma, rateProvider, computeBalanceSpy };
}

const principal = (p: Record<string, unknown> = {}) => ({
  id: 'p1', itemType: 'PRINCIPAL', demandedAmount: 10000, amount: 10000, currency: 'TRY',
  interestType: 'YASAL', interestRate: null, interestStartDate: new Date('2025-01-01'),
  status: 'ACTIVE', metadata: null, ...p,
});
const collection = (p: Record<string, unknown> = {}) => ({
  id: 'c1', status: 'CONFIRMED', cancelledAt: null, amount: 2000, currency: 'TRY',
  date: new Date('2025-03-01'), sourceType: 'BANKA', channel: null, ...p,
});

describe('CaseBalanceService (G4c-1)', () => {
  it('happy: principal(YASAL) + collection + variable rate → result, source COLLECTION', async () => {
    const { service, rateProvider } = setup({ claimItems: [principal()], collections: [collection()], rates: legalRate() });
    const res = await service.computeCaseBalance('t1', 'case1', '2025-06-01');
    expect(res.source).toBe('COLLECTION');
    expect(res.currencyResults).toHaveLength(1);
    expect(res.currencyResults[0].currency).toBe('TRY');
    expect(res.currencyResults[0].result).not.toBeNull();
    expect(res.currencyResults[0].result!.totalInterest).toBeGreaterThanOrEqual(0);
    expect(rateProvider.getRatesForPeriod).toHaveBeenCalledTimes(1);
  });

  it('ledger-first: confirmed PAYMENT ledger varsa source LEDGER', async () => {
    const { service } = setup({
      claimItems: [principal()],
      ledger: [{ id: 'L1', entryType: 'PAYMENT', status: 'CONFIRMED', amount: 500, currency: 'TRY', entryDate: new Date('2025-03-10'), effectiveDate: null, sourceType: 'BANKA' }],
      collections: [collection()],
      rates: legalRate(),
    });
    const res = await service.computeCaseBalance('t1', 'case1', '2025-06-01');
    expect(res.source).toBe('LEDGER');
  });

  it('fixed-rate: SABIT bucket → sentetik rate, RateProvider ÇAĞRILMAZ, result null DEĞİL', async () => {
    const { service, rateProvider } = setup({
      claimItems: [principal({ interestType: 'SABIT', interestRate: 48 })],
      collections: [collection()],
    });
    const res = await service.computeCaseBalance('t1', 'case1', '2025-06-01');
    expect(rateProvider.getRatesForPeriod).not.toHaveBeenCalled(); // fixed → requirement yok
    expect(res.currencyResults[0].result).not.toBeNull();
  });

  it('principal faiz configli + explicit INTEREST amount → engine tek principal bucket alır; INTEREST amount totalDueya eklenmez', async () => {
    const explicitInterest = {
      id: 'i1',
      itemType: 'INTEREST',
      demandedAmount: 500,
      amount: 500,
      currency: 'TRY',
      interestType: 'YASAL',
      interestRate: null,
      interestStartDate: new Date('2024-01-01'),
      status: 'ACTIVE',
      metadata: null,
    };
    const { service, computeBalanceSpy } = setup({
      claimItems: [principal(), explicitInterest],
      collections: [],
      rates: legalRate(),
    });

    const res = await service.computeCaseBalance('t1', 'case1', '2025-06-01');

    expect(computeBalanceSpy).toHaveBeenCalledTimes(1);
    const request = computeBalanceSpy.mock.calls[0][0];
    expect(request.claimBuckets).toHaveLength(1);
    expect(request.claimBuckets[0]).toMatchObject({ id: 'p1', amount: 10000 });
    expect(request.claimBuckets.find((bucket) => bucket.id === 'i1')).toBeUndefined();
    expect(res.currencyResults[0].result).not.toBeNull();
    expect(res.currencyResults[0].result!.totalDue).toBeCloseTo(
      10000 + res.currencyResults[0].result!.totalInterest,
      5,
    );
  });

  it('çok-currency: USD payment-only → NO_BUCKETS skip + CURRENCY_MISMATCH', async () => {
    const { service } = setup({
      claimItems: [principal()],
      collections: [collection(), collection({ id: 'c2', currency: 'USD', amount: 100 })],
      rates: legalRate(),
    });
    const res = await service.computeCaseBalance('t1', 'case1', '2025-06-01');
    const usd = res.currencyResults.find((r) => r.currency === 'USD')!;
    expect(usd.result).toBeNull();
    expect(usd.skippedReason).toBe('NO_BUCKETS');
    expect(res.diagnostics.currency).toEqual([{ code: 'CURRENCY_MISMATCH', currency: 'USD', detail: '1 payment(s), 0 bucket' }]);
  });

  it('assembler diagnostic: faiz konfigsiz principal → MISSING_INTEREST_CONFIG, bucket yok', async () => {
    const { service } = setup({
      caseRow: { interestType: null, interestStartDate: null },
      claimItems: [principal({ interestType: null, interestStartDate: null })],
      collections: [],
    });
    const res = await service.computeCaseBalance('t1', 'case1', '2025-06-01');
    expect(res.diagnostics.assembler.map((d) => d.code)).toContain('MISSING_INTEREST_CONFIG');
    expect(res.currencyResults).toHaveLength(0);
  });

  it('CANCELLED ClaimItem computeCaseBalance hesabına dahil edilmez', async () => {
    const { service, prisma, rateProvider } = setup({
      claimItems: [principal({ status: ClaimItemStatus.CANCELLED })],
      collections: [],
      rates: legalRate(),
    });

    const res = await service.computeCaseBalance('t1', 'case1', '2025-06-01');

    expect(prisma.claimItem.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case1', tenantId: 't1', status: { not: ClaimItemStatus.CANCELLED } },
    });
    expect(res.currencyResults).toHaveLength(0);
    expect(rateProvider.getRatesForPeriod).not.toHaveBeenCalled();
  });

  it('case yok → CASE_NOT_FOUND, erken dön (claimItem okunmaz)', async () => {
    const { service, prisma } = setup({ caseRow: null });
    const res = await service.computeCaseBalance('t1', 'missing', '2025-06-01');
    expect(res.diagnostics.fatal).toEqual([{ code: 'CASE_NOT_FOUND', caseId: 'missing' }]);
    expect(res.currencyResults).toHaveLength(0);
    expect(prisma.claimItem.findMany).not.toHaveBeenCalled();
  });

  it('tenant-scoped okuma (where tenantId)', async () => {
    const { service, prisma } = setup({ claimItems: [principal()], collections: [collection()], rates: legalRate() });
    await service.computeCaseBalance('tenantX', 'caseY', '2025-06-01');
    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'caseY', tenantId: 'tenantX' } }));
    expect(prisma.claimItem.findMany).toHaveBeenCalledWith({
      where: { caseId: 'caseY', tenantId: 'tenantX', status: { not: ClaimItemStatus.CANCELLED } },
    });
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith({ where: { caseId: 'caseY', tenantId: 'tenantX', entryType: 'PAYMENT' } });
  });

  it('NAFAKA Due satırlarını display balance için kör PRINCIPAL bucket kaynağı olarak okumaz', async () => {
    const { service, prisma, rateProvider } = setup({
      claimItems: [],
      dues: [{ id: 'due-nafaka', type: 'NAFAKA', amount: 1500, currency: 'TRY' }],
      collections: [],
    });

    const res = await service.computeCaseBalance('tenantX', 'caseY', '2025-06-01');

    expect(prisma.due.findMany).not.toHaveBeenCalled();
    expect(res.currencyResults).toEqual([]);
    expect(rateProvider.getRatesForPeriod).not.toHaveBeenCalled();
  });

  it('overpayment display metadata tenant/case scoped okunur; HELD ve BLOCKED borca gomulmeden tasinir', async () => {
    const { service, prisma } = setup({
      overpayments: [
        {
          id: 'op1',
          collectionId: 'col1',
          sourceLedgerEntryId: 'le1',
          amount: 250,
          remainingAmount: 200,
          currency: 'TRY',
          status: 'HELD',
        },
        {
          id: 'op-zero',
          collectionId: 'col2',
          sourceLedgerEntryId: null,
          amount: 50,
          remainingAmount: 0,
          currency: 'TRY',
          status: 'HELD',
        },
      ],
      blockedOverpaymentEvents: [
        {
          id: 'evt1',
          createdAt: new Date('2026-06-20T10:00:00.000Z'),
          body: {
            payload: {
              collectionId: 'col3',
              sourceLedgerEntryId: 'le3',
              attemptedOverpaymentAmount: 75,
              currency: 'TRY',
              blockedReasons: [{ reason: 'RESTRICTED_PAYMENT_UNSUPPORTED', message: 'restricted' }],
            },
          },
        },
      ],
    });

    const res = await service.computeCaseBalance('tenantX', 'caseY', '2025-06-01');

    expect(prisma.collectionOverpayment.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenantX', caseId: 'caseY', status: 'HELD' },
      select: {
        id: true,
        collectionId: true,
        sourceLedgerEntryId: true,
        amount: true,
        remainingAmount: true,
        currency: true,
        status: true,
      },
    });
    expect(prisma.icrabotTimelineEntry.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenantX', caseId: 'caseY', type: 'OVERPAYMENT_BLOCKED' },
      select: { id: true, body: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(res.overpayments.held).toEqual([
      {
        id: 'op1',
        collectionId: 'col1',
        sourceLedgerEntryId: 'le1',
        amount: 250,
        remainingAmount: 200,
        currency: 'TRY',
        status: 'HELD',
      },
    ]);
    expect(res.overpayments.blocked).toEqual([
      {
        id: 'evt1',
        collectionId: 'col3',
        sourceLedgerEntryId: 'le3',
        attemptedOverpaymentAmount: 75,
        currency: 'TRY',
        blockedReasons: [{ reason: 'RESTRICTED_PAYMENT_UNSUPPORTED', message: 'restricted' }],
        createdAt: '2026-06-20T10:00:00.000Z',
      },
    ]);
  });
});
