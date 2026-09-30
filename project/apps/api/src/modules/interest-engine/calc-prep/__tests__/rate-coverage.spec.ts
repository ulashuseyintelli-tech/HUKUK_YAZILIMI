/**
 * K3-L TK-2 — SAF oran kapsama denetimi (findRateCoverageGaps / findUncoveredRateBuckets) ve oran sağlayıcının
 * validTo-DAHİL sorgusu. Kural oran aramasıyla (findRateForDate) aynı: d için validFrom ≤ d ≤ validTo (ya da açık uç).
 */

import { findRateCoverageGaps, findUncoveredRateBuckets } from '../rate-coverage';
import { InterestTypeCode, ClaimBucket } from '../../types/domain.types';
import { RateEntry, RateSourceType } from '../../rates/rate-entry.entity';
import { RateProviderService } from '../../rates/rate-provider.service';

const rate = (id: string, interestType: InterestTypeCode, validFrom: string, validTo: string | null): RateEntry => ({
  id, interestType, validFrom, validTo, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: id, createdAt: '2025-01-01T00:00:00Z',
});
const L = InterestTypeCode.LEGAL_3095;
const AVANS = InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;

describe('findRateCoverageGaps', () => {
  it('açık uçlu tek oran başlangıçtan önce başlıyorsa boşluk yok', () => {
    expect(findRateCoverageGaps(L, '2026-01-01', '2026-04-01', [rate('a', L, '2025-01-01', null)])).toEqual([]);
  });

  it('validTo DAHİL: bitişik oranlar arasında boşluk yok', () => {
    const rates = [rate('a', L, '2026-01-01', '2026-01-31'), rate('b', L, '2026-02-01', null)];
    expect(findRateCoverageGaps(L, '2026-01-01', '2026-04-01', rates)).toEqual([]);
  });

  it('ortadaki boşluk uçları dahil raporlanır', () => {
    const rates = [rate('a', L, '2026-01-01', '2026-01-31'), rate('b', L, '2026-03-01', null)];
    expect(findRateCoverageGaps(L, '2026-01-01', '2026-04-01', rates)).toEqual([{ from: '2026-02-01', to: '2026-02-28' }]);
  });

  it('başta, ortada ve sonda birden çok boşluk', () => {
    const rates = [rate('a', L, '2026-01-10', '2026-01-20'), rate('b', L, '2026-02-01', '2026-02-10')];
    expect(findRateCoverageGaps(L, '2026-01-01', '2026-03-01', rates)).toEqual([
      { from: '2026-01-01', to: '2026-01-09' },
      { from: '2026-01-21', to: '2026-01-31' },
      { from: '2026-02-11', to: '2026-02-28' },
    ]);
  });

  it('başka türün oranı kapsama SAYILMAZ', () => {
    expect(findRateCoverageGaps(L, '2026-01-01', '2026-02-01', [rate('x', AVANS, '2020-01-01', null)])).toEqual([
      { from: '2026-01-01', to: '2026-01-31' },
    ]);
  });

  it('üst üste binen oranlar (seed: hepsi açık uçlu) boşluk üretmez', () => {
    const rates = [rate('s2', L, '2024-06-01', null), rate('s1', L, '2006-01-01', null)];
    expect(findRateCoverageGaps(L, '2026-01-01', '2026-04-01', rates)).toEqual([]);
  });

  it('dönem boşsa (başlangıç ≥ hesap tarihi) boşluk yok', () => {
    expect(findRateCoverageGaps(L, '2026-04-01', '2026-04-01', [])).toEqual([]);
    expect(findRateCoverageGaps(L, '2026-05-01', '2026-04-01', [])).toEqual([]);
  });

  it('hesap tarihinde başlayan oran önceki günleri kapsamaz', () => {
    expect(findRateCoverageGaps(L, '2026-03-01', '2026-04-01', [rate('a', L, '2026-04-01', null)])).toEqual([
      { from: '2026-03-01', to: '2026-03-31' },
    ]);
  });
});

describe('findUncoveredRateBuckets', () => {
  const bucket = (p: Partial<ClaimBucket>): ClaimBucket => ({
    id: 'b', amount: 1000, currency: 'TRY', startDate: '2026-01-01', interestType: L, dayCountBasis: 365, ...p,
  });

  it('sabit oranlı kova oran tablosu kullanmaz → denetlenmez', () => {
    expect(findUncoveredRateBuckets(
      [bucket({ id: 'f', interestType: InterestTypeCode.CONTRACTUAL, fixedRate: 0.3 })], [], '2026-04-01',
    )).toEqual([]);
  });

  it('ibraz tarihi varsa faiz dönemi ibrazdan başlar (segment kurucuyla aynı)', () => {
    const rates = [rate('a', L, '2026-02-01', null)];
    expect(findUncoveredRateBuckets([bucket({ ibrazTarihi: '2026-02-01' })], rates, '2026-04-01')).toEqual([]);
    expect(findUncoveredRateBuckets([bucket({})], rates, '2026-04-01')).toEqual([
      { claimItemId: 'b', amount: 1000, currency: 'TRY', interestType: L, gaps: [{ from: '2026-01-01', to: '2026-01-31' }] },
    ]);
  });
});

describe('RateProviderService — validTo DAHİL sorgu (başlangıç günü biten oran dışlanmaz)', () => {
  it('in-memory: validTo = başlangıç günü olan oran döner', async () => {
    const provider = new RateProviderService();
    provider.loadRates([
      { id: 'a', interestType: L, annualRate: 0.365, validFrom: '2026-01-01', validTo: '2026-01-31', sourceId: 'a', sourceName: 'T', publishedAt: '2026-01-01T00:00:00Z', currency: 'TRY' },
      { id: 'b', interestType: L, annualRate: 0.73, validFrom: '2026-02-01', validTo: null, sourceId: 'b', sourceName: 'T', publishedAt: '2026-01-01T00:00:00Z', currency: 'TRY' },
    ]);
    const rates = await provider.getRatesForPeriod({ interestType: L, startDate: '2026-01-31', endDate: '2026-04-01', currency: 'TRY' });
    expect(rates.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('prisma: validTo filtresi gte (başlangıç günü dahil)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const provider = new RateProviderService({ rateSchedule: { findMany } } as never);
    await provider.getRatesForPeriod({ interestType: L, startDate: '2026-01-31', endDate: '2026-04-01', tenantId: 't1' });
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ validTo: null }, { validTo: { gte: new Date('2026-01-31') } }]);
  });
});
