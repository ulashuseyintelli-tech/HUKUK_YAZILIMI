/**
 * S8-A — buildOffsetRecommendation + minDecimalString (saf, FE-only).
 * Doğrulanan kurallar:
 *  - Kaynak yalnız eligiblePayableBuckets (tip gereği pendingDistribution erişilemez).
 *  - OTOMATİK EŞLEME YOK: çoklu tarafta pairing seçilmez (yalnız tek-seçenekli bacak ön-seçilir).
 *  - UI HESAPLAMAZ: önerilen tutar iki backend decimal-string'inden BİREBİR küçüğü (float yok).
 *  - 0 kaynak / 0 masraf / sub-cent → null (kart gizlenir).
 */
import { describe, expect, it } from 'vitest';
import { buildOffsetRecommendation, minDecimalString, type OffsetEligibility } from '@/lib/api/client-offset';

const bucket = (over: Partial<OffsetEligibility['eligiblePayableBuckets'][number]> = {}) => ({
  payableCaseId: 'case-P', payableCaseClientId: 'cc-A', clientId: 'cl-1', currency: 'TRY',
  availableOutstanding: '5000', caseNumber: '2026/9501', role: 'ALACAKLI', ...over,
});
const expense = (over: Partial<OffsetEligibility['eligibleExpenseRequests'][number]> = {}) => ({
  expenseCaseId: 'case-E', expenseRequestId: 'er-1', clientId: 'cl-1', currency: 'TRY',
  unpaidAmount: '9201.60', caseNumber: '2026/9501', requestStatus: 'PENDING', ...over,
});
const elig = (over: Partial<OffsetEligibility> = {}): OffsetEligibility => ({
  clientId: 'cl-1', currency: 'TRY', canApply: true,
  eligiblePayableBuckets: [bucket()], eligibleExpenseRequests: [expense()], ...over,
});

describe('minDecimalString', () => {
  it('numerik küçüğü ORİJİNAL string olarak döndürür (float aritmetiği yok)', () => {
    expect(minDecimalString('5000', '9201.60')).toBe('5000');
    expect(minDecimalString('1431.10', '5000')).toBe('1431.10');
    expect(minDecimalString('9201.60', '5000')).toBe('5000');
  });
  it('eşitse ilkini döndürür; geçersizde finite olanı', () => {
    expect(minDecimalString('100.00', '100.00')).toBe('100.00');
    expect(minDecimalString('abc', '50')).toBe('50');
  });
});

describe('buildOffsetRecommendation', () => {
  it('1×1 → exact: iki bacak + faithful tutar seed; kaynak etiketi', () => {
    const r = buildOffsetRecommendation(elig());
    expect(r?.mode).toBe('exact');
    expect(r?.payableCaseClientId).toBe('cc-A');
    expect(r?.expenseRequestId).toBe('er-1');
    expect(r?.amount).toBe('5000'); // min(5000, 9201.60) faithful string
    expect(r?.suggestedAmount).toBe('5000');
    expect(r?.sourceLabel).toBe('2026/9501 (ALACAKLI)');
  });

  it('1 kaynak × N masraf → multi: yalnız payable ön-seçilir, expense+amount YOK (eşleme yapılmaz)', () => {
    const r = buildOffsetRecommendation(elig({
      eligibleExpenseRequests: [expense({ expenseRequestId: 'er-1', unpaidAmount: '1431.10' }), expense({ expenseRequestId: 'er-2', unpaidAmount: '2000' })],
    }));
    expect(r?.mode).toBe('multi');
    expect(r?.payableCaseClientId).toBe('cc-A'); // tek kaynak ön-seçilir
    expect(r?.expenseRequestId).toBeUndefined(); // çoklu masraf → seçilmez
    expect(r?.amount).toBeUndefined();
    expect(r?.bucketCount).toBe(1);
    expect(r?.expenseCount).toBe(2);
  });

  it('0 kaynak → null; 0 masraf → null', () => {
    expect(buildOffsetRecommendation(elig({ eligiblePayableBuckets: [] }))).toBeNull();
    expect(buildOffsetRecommendation(elig({ eligibleExpenseRequests: [] }))).toBeNull();
    expect(buildOffsetRecommendation(undefined)).toBeNull();
    expect(buildOffsetRecommendation(null)).toBeNull();
  });

  it('1×1 ama min sub-cent (<0.01) → null (uygulanabilir çift yok say)', () => {
    const r = buildOffsetRecommendation(elig({
      eligiblePayableBuckets: [bucket({ availableOutstanding: '0.004' })],
      eligibleExpenseRequests: [expense({ unpaidAmount: '0.003' })],
    }));
    expect(r).toBeNull();
  });
});
