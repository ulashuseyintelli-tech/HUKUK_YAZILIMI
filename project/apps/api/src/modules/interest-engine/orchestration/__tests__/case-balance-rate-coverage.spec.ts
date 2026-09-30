/**
 * K3-L TK-1 / TK-2 — kanonik bakiyede faiz oranı:
 *  TK-1: değişken oranlı kalem YALNIZ kendi faiz türündeki oranı kullanır (başka kalemin oranı taşınmaz).
 *  TK-2: oran verisi faiz dönemini gün gün kapsamıyorsa komşu/gelecek oran ya da sıfır faizle "OK" toplam üretilmez;
 *        bilinen anapara korunur, faiz bilinmiyor (null), durum UNAVAILABLE, eksik dönem tanıda görünür.
 * Gerçek motor + CaseBalanceService + display; prisma ve oran sağlayıcı sahte (sentetik oranlar, gerçek yasal oran DEĞİL).
 */

import { CaseBalanceService } from '../case-balance.service';
import { toCaseBalanceDisplay } from '../case-balance-display';
import { InterestEngineService } from '../../interest-engine.service';
import { PolicyGateV2Service } from '../../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../../segments/segment-builder.service';
import { AllocationEngineService } from '../../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../../allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../../allocation/claim-priority.service';
import { VersionPinningService } from '../../version/version-pinning.service';
import { InterestTypeCode } from '../../types/domain.types';
import { RateSourceType } from '../../rates/rate-entry.entity';

function engine(): InterestEngineService {
  return new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never,
    { record: () => undefined, clearAll: () => undefined } as never,
    new VersionPinningService(),
  );
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const principal = (p: Record<string, unknown>) => ({
  itemType: 'PRINCIPAL', currency: 'TRY', status: 'ACTIVE', metadata: null, interestType: null, interestTypeCode: null,
  interestRate: null, interestStartDate: null, interestAccrualStatus: 'ACCRUES', interestStartDateProvenance: null,
  ...p,
  demandedAmount: p.amount,
});
const yasal = (id: string, amount: number, start: string) =>
  principal({ id, amount, interestType: 'YASAL', interestStartDate: d(start) });
const sabit = (id: string, amount: number, start: string, ratePercent: number) =>
  principal({ id, amount, interestType: 'SABIT', interestRate: ratePercent, interestStartDate: d(start) });
const legal = (id: string, validFrom: string, validTo: string | null, annualRate: number) => ({
  id, interestType: InterestTypeCode.LEGAL_3095, validFrom, validTo, annualRate,
  sourceId: id, sourceName: 'TEST', publishedAt: '2025-01-01T00:00:00.000Z', currency: 'TRY',
});

async function run(items: unknown[], rates: unknown[], asOf: string) {
  const prisma = {
    case: { findFirst: async () => ({ interestType: null, interestStartDate: null, caseDate: null }) },
    claimItem: { findMany: async () => items },
    ledgerEntry: { findMany: async () => [] },
    collection: { findMany: async () => [] },
    collectionOverpayment: { findMany: async () => [] },
    icrabotTimelineEntry: { findMany: async () => [] },
  };
  const rateProvider = { getRatesForPeriod: jest.fn().mockResolvedValue(rates) };
  const service = new CaseBalanceService(prisma as never, rateProvider as never, engine());
  const balance = await service.computeCaseBalance('t1', 'case1', asOf);
  const display = toCaseBalanceDisplay({ tenantId: 't1', caseId: 'case1', balance, generatedAt: '2026-09-30T00:00:00.000Z' });
  return { balance, display };
}

const interestOf = (balance: Awaited<ReturnType<typeof run>>['balance'], claimId: string) =>
  Math.round(
    (balance.currencyResults[0]?.result?.segments ?? [])
      .filter((segment) => segment.claimBucketId === claimId)
      .reduce((sum, segment) => sum + segment.segmentInterest, 0) * 100,
  ) / 100;

describe('K3-L TK-1: faiz oranı yalnız kalemin kendi türünden', () => {
  const legal73 = [legal('l73', '2025-12-01', null, 0.73)];

  it('sabit oranlı kalemin (SABIT %36,5) oranı değişken oranlı kalemin (YASAL) dönemine taşınmaz', async () => {
    const alone = await run([yasal('A', 1000, '2026-01-01')], legal73, '2026-04-01');
    const mixed = await run([yasal('A', 1000, '2026-01-01'), sabit('B', 1000, '2026-02-01', 36.5)], legal73, '2026-04-01');

    // A tek başına: 1.000 × %73 × 90/365 = 180,00 (sentetik oran)
    expect(interestOf(alone.balance, 'A')).toBe(180);
    // Aynı dosyaya B eklenince A'nın faizi DEĞİŞMEZ (düzeltmeden önce 121,00: Şubat–Mart B'nin %36,5'i uygulanıyordu)
    expect(interestOf(mixed.balance, 'A')).toBe(180);
    // B kendi sabit oranıyla: 1.000 × %36,5 × 59/365 = 59,00
    expect(interestOf(mixed.balance, 'B')).toBe(59);
    expect(mixed.balance.currencyResults[0].result!.totalDue).toBe(2239);
    // A'nın segmentlerinde yalnız kendi türündeki oran kimliği
    const aRateIds = new Set(
      mixed.balance.currencyResults[0].result!.segments.filter((s) => s.claimBucketId === 'A').map((s) => s.rateId),
    );
    expect([...aRateIds]).toEqual(['l73']);
    expect(mixed.display.status).toBe('OK');
  });
});

describe('K3-L TK-2: eksik oran verisi sessizce sıfır/komşu oran ve OK olmaz', () => {
  const expectUnavailableWithKnownPrincipal = (
    result: Awaited<ReturnType<typeof run>>,
    expectedGap: string,
  ) => {
    const { balance, display } = result;
    expect(balance.currencyResults).toHaveLength(1);
    expect(balance.currencyResults[0]).toMatchObject({
      currency: 'TRY',
      result: null,
      skippedReason: 'INTEREST_UNRESOLVED',
      grossPrincipal: 0,
      unsimulatedPrincipal: 1000,
    });
    expect(balance.unsimulatedPrincipals).toEqual([
      { claimItemId: 'A', currency: 'TRY', amount: 1000, kind: 'UNRESOLVED', reasonCode: 'RATE_COVERAGE_MISSING', accruedInterest: null },
    ]);
    expect(balance.diagnostics.fatal.map((f) => f.code)).toEqual(['INTEREST_UNRESOLVED']);
    expect(balance.diagnostics.perCurrency).toHaveLength(1);
    expect(balance.diagnostics.perCurrency[0].code).toBe('RATE_COVERAGE_MISSING');
    expect(balance.diagnostics.perCurrency[0].message).toContain(expectedGap);

    expect(display.status).toBe('UNAVAILABLE');
    expect(display.currencies[0]).toMatchObject({ interest: null, claimRemaining: null, unsimulatedPrincipal: 1000 });
    expect(display.totals.totalDebtAmount).toBeNull();
    expect(display.totals.outstandingAmount).toBeNull();
    const interestBucket = display.buckets.find((bucket) => bucket.code === 'ACCRUED_INTEREST')!;
    expect(interestBucket.amount).toBeNull();
    expect(interestBucket.source).toBe('UNAVAILABLE');
    const interestBase = display.readiness.blockers.find((blocker) => blocker.code === 'INTEREST_BASE');
    expect(interestBase?.sourceCodes).toContain('RATE_COVERAGE_MISSING');
  };

  it('ortadaki boşluk (Şubat oransız): komşu oranla 121,00 "OK" yerine faiz bilinmiyor + UNAVAILABLE', async () => {
    const gapRates = [legal('r1', '2026-01-01', '2026-01-31', 0.365), legal('r2', '2026-03-01', null, 0.73)];
    const result = await run([yasal('A', 1000, '2026-01-01')], gapRates, '2026-04-01');
    expectUnavailableWithKnownPrincipal(result, '2026-02-01–2026-02-28');
  });

  it('boşluktan başlayan faiz (10.02): gelecek oranla 100,00 "OK" yerine faiz bilinmiyor', async () => {
    const gapRates = [legal('r1', '2026-01-01', '2026-01-31', 0.365), legal('r2', '2026-03-01', null, 0.73)];
    const result = await run([yasal('A', 1000, '2026-02-10')], gapRates, '2026-04-01');
    expectUnavailableWithKnownPrincipal(result, '2026-02-10–2026-02-28');
  });

  it('oran tablosu boş: sıfır faizle "OK" 1.000 yerine faiz bilinmiyor', async () => {
    const result = await run([yasal('A', 1000, '2026-01-01')], [], '2026-04-01');
    expectUnavailableWithKnownPrincipal(result, '2026-01-01–2026-03-31');
  });

  it('ilk oran faiz başlangıcından sonra başlıyorsa baştaki oransız dönem de faiz bilinmiyor sayılır', async () => {
    const result = await run([yasal('A', 1000, '2026-01-01')], [legal('r1', '2026-01-15', null, 0.365)], '2026-04-01');
    expectUnavailableWithKnownPrincipal(result, '2026-01-01–2026-01-14');
  });

  it('bitişik oranlar (validTo DAHİL, sonraki gün yeni oran) boşluk SAYILMAZ; hesap aynen sürer', async () => {
    const contiguous = [legal('r1', '2026-01-01', '2026-01-31', 0.365), legal('r2', '2026-02-01', null, 0.73)];
    const { balance, display } = await run([yasal('A', 1000, '2026-01-01')], contiguous, '2026-04-01');
    // Ocak 31 gün × %36,5 = 31,00 ; Şubat–Mart 59 gün × %73 = 118,00
    expect(interestOf(balance, 'A')).toBe(149);
    expect(balance.currencyResults[0].result!.totalDue).toBe(1149);
    expect(balance.unsimulatedPrincipals).toBeUndefined();
    expect(display.status).toBe('OK');
  });

  it('faiz başlangıcı bir oranın son günü (validTo = başlangıç) → o gün kapsanır', async () => {
    const contiguous = [legal('r1', '2026-01-01', '2026-01-31', 0.365), legal('r2', '2026-02-01', null, 0.73)];
    const { balance, display } = await run([yasal('A', 1000, '2026-01-31')], contiguous, '2026-04-01');
    expect(balance.unsimulatedPrincipals).toBeUndefined();
    expect(display.status).toBe('OK');
    // 31.01 tek gün %36,5 = 1,00 ; 59 gün %73 = 118,00
    expect(interestOf(balance, 'A')).toBe(119);
  });

  it('açık uçlu üst üste oranlar (seed biçimi: hepsi validTo=null) boşluk sayılmaz; en son başlayan oran uygulanır', async () => {
    const seedLike = [legal('s1', '2006-01-01', null, 0.09), legal('s2', '2024-06-01', null, 0.24)];
    const { balance, display } = await run([yasal('A', 1000, '2026-01-01')], seedLike, '2026-04-01');
    expect(balance.unsimulatedPrincipals).toBeUndefined();
    expect(display.status).toBe('OK');
    // 90 gün × %24 = 59,18
    expect(interestOf(balance, 'A')).toBe(59.18);
  });

  it('karma dosya: yalnız oransız kalem taşınır; kapsanan kalemin anaparası grossPrincipal\'da kalır, toplam kesin sunulmaz', async () => {
    const gapRates = [legal('r1', '2026-01-01', '2026-01-31', 0.365), legal('r2', '2026-03-01', null, 0.73)];
    const { balance, display } = await run(
      [yasal('A', 1000, '2026-01-01'), sabit('B', 2000, '2026-01-01', 36.5)],
      gapRates,
      '2026-04-01',
    );
    expect(balance.currencyResults[0]).toMatchObject({
      result: null,
      skippedReason: 'INTEREST_UNRESOLVED',
      grossPrincipal: 2000,
      unsimulatedPrincipal: 1000,
    });
    expect(balance.unsimulatedPrincipals!.map((p) => p.claimItemId)).toEqual(['A']);
    expect(display.status).toBe('UNAVAILABLE');
    expect(display.totals.totalDebtAmount).toBeNull();
  });
});
