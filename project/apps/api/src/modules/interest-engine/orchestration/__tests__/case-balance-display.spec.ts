import { toCaseBalanceDisplay } from '../case-balance-display';
import type { CaseBalanceResult } from '../case-balance.service';

// BALANCE-DISPLAY PR-1: saf mapper testleri. Engine raw → panel DTO; YALNIZ doğrulanmış alanlar, uydurma yok.

function makeBalance(overrides: Partial<CaseBalanceResult> = {}): CaseBalanceResult {
  return {
    asOfDate: '2026-06-23',
    source: 'COLLECTION',
    currencyResults: [],
    projections: { costs: {}, ancillaries: {} },
    diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
    ...overrides,
  } as unknown as CaseBalanceResult;
}

function currencyResult(currency: string, result: any, skippedReason: string | null = null) {
  return { currency, result, skippedReason: skippedReason ?? undefined };
}

describe('toCaseBalanceDisplay — BALANCE-DISPLAY PR-1 (saf mapper)', () => {
  it('OK tek-currency: faiz/claimRemaining/collected/costs/ancillaries doğru map + round2', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 150.005,
          totalDue: 1200.004,
          allocations: [{ paymentId: 'p1', paymentAmount: 300 }],
        }),
      ] as any,
      projections: { costs: { EXPENSE: 200 }, ancillaries: { PENALTY: 50 } } as any,
    });

    const d = toCaseBalanceDisplay('case-1', balance);

    expect(d.caseId).toBe('case-1');
    expect(d.status).toBe('OK');
    expect(d.source).toBe('COLLECTION');
    expect(d.costs).toBe(200);
    expect(d.ancillaries).toBe(50);
    expect(d.currencies).toHaveLength(1);
    expect(d.currencies[0].currency).toBe('TRY');
    expect(d.currencies[0].interest).toBe(150.01); // round2(150.005)
    expect(d.currencies[0].claimRemaining).toBe(1200); // round2(1200.004)
    expect(d.currencies[0].collected).toBe(300);
    expect(d.currencies[0].skipped).toBe(false);
  });

  it('collected: aynı paymentId çoklu adımda DEDUP (çift saymaz)', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 0,
          totalDue: 0,
          allocations: [
            { paymentId: 'p1', paymentAmount: 300 },
            { paymentId: 'p1', paymentAmount: 300 }, // aynı ödeme, ikinci bucket → SAYILMAZ
            { paymentId: 'p2', paymentAmount: 100 },
          ],
        }),
      ] as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies[0].collected).toBe(400); // 300 + 100, 700 DEĞİL
  });

  it('ödeme yoksa (allocations undefined) collected = 0', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 10, totalDue: 1000 })] as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies[0].collected).toBe(0);
  });

  it('skipped currency: result null → skipped true + skippedReason taşınır, tutarlar 0', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('USD', null, 'NO_BUCKETS')] as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies[0].skipped).toBe(true);
    expect(d.currencies[0].skippedReason).toBe('NO_BUCKETS');
    expect(d.currencies[0].interest).toBe(0);
    expect(d.currencies[0].claimRemaining).toBe(0);
  });

  it('UNAVAILABLE: diagnostics.fatal varsa status UNAVAILABLE + unavailableReason', () => {
    const balance = makeBalance({
      diagnostics: { fatal: [{ code: 'CASE_NOT_FOUND', caseId: 'c' }], assembler: [], payments: [], currency: [], perCurrency: [] } as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.status).toBe('UNAVAILABLE');
    expect(d.unavailableReason).toBe('CASE_NOT_FOUND');
  });

  it('UYDURMA YOK: standalone "anapara"/"principal" alanı YOK; not finalDebtStates limitini açıklar', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 150, totalDue: 1200, allocations: [] })] as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    // Türetilmemiş anapara alanı eklenmemeli (ne case ne currency seviyesinde):
    expect(Object.keys(d)).not.toContain('anapara');
    expect(Object.keys(d)).not.toContain('principal');
    expect(Object.keys(d.currencies[0])).not.toContain('anapara');
    expect(Object.keys(d.currencies[0])).not.toContain('principal');
    // Dürüstlük notu finalDebtStates limitini taşımalı:
    expect(d.notes.some((n) => n.includes('finalDebtStates'))).toBe(true);
  });

  it('multi-currency: her grup ayrı map; costs/ancillaries CASE-level (currency-split değil)', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', { totalInterest: 100, totalDue: 1000, allocations: [] }),
        currencyResult('USD', { totalInterest: 5, totalDue: 50, allocations: [] }),
      ] as any,
      projections: { costs: { EXPENSE: 300 }, ancillaries: {} } as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies.map((c) => c.currency)).toEqual(['TRY', 'USD']);
    expect(d.costs).toBe(300); // case-level, tek
  });

  it('boş: currencyResults yoksa OK + currencies []', () => {
    const d = toCaseBalanceDisplay('c', makeBalance({ source: 'NONE' } as any));
    expect(d.status).toBe('OK');
    expect(d.currencies).toEqual([]);
    expect(d.source).toBe('NONE');
  });
});
