/**
 * K3-L KP-2 (owner kararı 2026-10-01) — kanonik bakiyede dosya düzeyi faiz türü:
 * kalem faiz türünü dosya düzeyinden (YASAL) alıyorsa ve dosya türü açıkça seçilmemiş ya da kaynağı doğrulanamıyorsa
 * hesap SÜRER (tür geçersiz sayılmaz, değiştirilmez) ama görünür UYARI üretilir. Açık seçimde uyarı yoktur.
 * Gerçek motor + CaseBalanceService + display; prisma sahte; oran sağlayıcı sabit yanıt (LEGAL_3095 %36,5).
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
const principal = (extra: Record<string, unknown> = {}) => ({
  id: 'P1', itemType: 'PRINCIPAL', currency: 'TRY', status: 'ACTIVE', metadata: null, interestType: null,
  interestTypeCode: null, interestRate: null, interestStartDate: null, interestAccrualStatus: 'ACCRUES',
  interestStartDateProvenance: null, amount: 1000, demandedAmount: 1000, ...extra,
});
const LEGAL_RATE = [{
  id: 'rate-legal', interestType: 'LEGAL_3095', validFrom: '2020-01-01', validTo: null, annualRate: 0.365,
  sourceId: 'src', sourceName: 'RESMI_GAZETE', publishedAt: '2020-01-01T00:00:00.000Z', currency: 'TRY',
}];

async function run(caseRow: Record<string, unknown>, items: unknown[] = [principal()]) {
  const prisma = {
    case: { findFirst: async () => ({ interestStartDate: d('2026-01-01'), caseDate: null, ...caseRow }) },
    claimItem: { findMany: async () => items },
    ledgerEntry: { findMany: async () => [] },
    collection: { findMany: async () => [] },
    collectionOverpayment: { findMany: async () => [] },
    icrabotTimelineEntry: { findMany: async () => [] },
  };
  const service = new CaseBalanceService(prisma as never, { getRatesForPeriod: async () => LEGAL_RATE } as never, engine());
  const balance = await service.computeCaseBalance('t1', 'case1', '2026-04-11');
  const display = toCaseBalanceDisplay({ tenantId: 't1', caseId: 'case1', balance, generatedAt: '2026-10-01T00:00:00.000Z' });
  const warning = display.diagnostics.find((diagnostic) => diagnostic.code === 'CASE_INTEREST_TYPE_UNCONFIRMED');
  return { balance, display, warning };
}

describe('K3-L KP-2: dosya düzeyi YASAL faiz türünün kaynağı', () => {
  it('eski dosya (kaynak kaydı yok): hesap sürer, tür değişmez; görünür uyarı — source UNKNOWN', async () => {
    const { display, warning } = await run({ interestType: 'YASAL', metadata: null });

    expect(display.status).toBe('OK');
    // 01.01 → 11.04 = 100 gün × 1.000 × %36,5 / 365 = 100,00 (YASAL oranla hesaplandı)
    expect(display.currencies[0]).toMatchObject({ interest: 100, claimRemaining: 1100 });
    expect(warning).toMatchObject({
      severity: 'WARNING',
      details: { caseInterestType: 'YASAL', source: 'UNKNOWN', claimItemIds: ['P1'] },
    });
  });

  it('sistem varsayılanı (açılışta seçilmedi): uyarı — source SYSTEM_DEFAULT; sonuç aynı', async () => {
    const { display, warning } = await run({ interestType: 'YASAL', metadata: { interestTypeSource: 'SYSTEM_DEFAULT' } });

    expect(display.status).toBe('OK');
    expect(display.currencies[0]).toMatchObject({ interest: 100, claimRemaining: 1100 });
    expect(warning).toMatchObject({ severity: 'WARNING', details: { source: 'SYSTEM_DEFAULT' } });
  });

  it('açıkça seçilmiş YASAL: uyarı yok; sayılar aynı (karar hesabı değiştirmez)', async () => {
    const { display, warning } = await run({ interestType: 'YASAL', metadata: { interestTypeSource: 'REQUEST_EXPLICIT' } });

    expect(display.status).toBe('OK');
    expect(display.currencies[0]).toMatchObject({ interest: 100, claimRemaining: 1100 });
    expect(warning).toBeUndefined();
  });

  it('kalem kendi faiz ayarını taşıyorsa dosya düzeyine düşülmez → uyarı yok', async () => {
    const { warning } = await run(
      { interestType: 'YASAL', metadata: null },
      [principal({ interestType: 'YASAL', interestStartDate: d('2026-01-01') })],
    );
    expect(warning).toBeUndefined();
  });

  it('kalem kendi tarihini, türü dosyadan alıyorsa (kademe 1.5) da uyarı verilir', async () => {
    const { warning } = await run(
      { interestType: 'YASAL', metadata: null },
      [principal({ interestStartDate: d('2026-02-01') })],
    );
    expect(warning).toMatchObject({ severity: 'WARNING', details: { claimItemIds: ['P1'] } });
  });
});
