/**
 * K3-L KP-11 (owner kararı 2026-10-01) — hesap tarihi verilmeyen hesap uçlarında varsayılan Türkiye takvimine göre
 * bugün; kullanıcının ya da kaydın verdiği tarih aynen kullanılır. Gün sınırı: TSİ 00:00–02:59 arasında UTC günü bir
 * önceki gündür (önceki davranış).
 */
import { CaseController } from '../case.controller';
import { ReportService } from '../../report/report.service';

const AT_TSI_0230 = new Date('2026-09-30T23:30:00.000Z'); // UTC günü 2026-09-30, Türkiye günü 2026-10-01

function caseController(getCalculationSummary: jest.Mock): CaseController {
  return new CaseController(
    { getCalculationSummary } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function reportService(caseRow: Record<string, unknown>): ReportService {
  const prisma = {
    case: { findFirst: jest.fn(async () => caseRow) },
    collection: { findMany: jest.fn(async () => []) },
    collectionAllocationHold: { findMany: jest.fn(async () => []) },
  };
  const collectionService = { getCollectedBreakdown: jest.fn(async () => ({})) };
  return new ReportService(prisma as never, collectionService as never, {} as never);
}

const CASE_ROW = {
  id: 'case-1',
  fileNumber: '2026/1',
  executionFileNumber: null,
  client: { displayName: 'Müvekkil', name: null },
  caseStatus: 'DERDEST',
  caseDate: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  debtors: [],
  principalAmount: 36500,
  interestRate: 10,
  interestType: 'YASAL',
  interestStartDate: new Date('2026-09-20T00:00:00.000Z'),
  currency: 'TRY',
};

describe('K3-L KP-11: varsayılan hesap tarihi Türkiye takvimine göre bugün', () => {
  afterEach(() => jest.useRealTimers());

  it('GET /cases/:id/calculation-summary — tarih yoksa Türkiye günü, varsa aynen', async () => {
    jest.useFakeTimers({ now: AT_TSI_0230 });
    const getCalculationSummary = jest.fn(async () => ({}));
    const controller = caseController(getCalculationSummary);

    await controller.getCalculationSummary('tenant-1', 'case-1', undefined);
    await controller.getCalculationSummary('tenant-1', 'case-1', '2026-06-15');

    expect(getCalculationSummary).toHaveBeenNthCalledWith(1, 'tenant-1', 'case-1', '2026-10-01');
    expect(getCalculationSummary).toHaveBeenNthCalledWith(2, 'tenant-1', 'case-1', '2026-06-15');
  });

  it('dosya borç raporu — hesap tarihi yoksa Türkiye günü (anlık UTC zaman damgası değil); gün sayısı tam gün', async () => {
    jest.useFakeTimers({ now: AT_TSI_0230 });
    const report = await reportService(CASE_ROW).getCaseDebtReport('tenant-1', 'case-1', undefined);

    expect(report.calculationDate).toBe('2026-10-01T00:00:00.000Z');
    expect(report.claimDetails.interestEndDate).toBe('2026-10-01T00:00:00.000Z');
    // 20.09 → 01.10 = 11 gün × 36.500 × %10 / 365 = 110,00 (önceki davranış: UTC 30.09 23:30 → 10 tam gün = 100,00)
    expect(report.claimDetails.interestAmount).toBe(110);
  });

  it('faiz raporu — bitiş tarihi yoksa Türkiye günü', async () => {
    jest.useFakeTimers({ now: AT_TSI_0230 });
    const service = reportService(CASE_ROW);
    const report = await service.getInterestReport('tenant-1', 'case-1', '2026-09-20', undefined);

    expect(report.interestDetails.endDate).toBe('2026-10-01T00:00:00.000Z');
    expect(report.summary.totalDays).toBe(11);
  });
});
