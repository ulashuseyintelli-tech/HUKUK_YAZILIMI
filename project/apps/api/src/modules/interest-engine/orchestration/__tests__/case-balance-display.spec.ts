import { toCaseBalanceDisplay } from '../case-balance-display';
import type { CaseBalanceResult } from '../case-balance.service';

// BALANCE-DISPLAY PR-1 (+PR-1b): saf mapper testleri. Engine raw → panel DTO; YALNIZ doğrulanmış alanlar, uydurma yok.

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

describe('toCaseBalanceDisplay — BALANCE-DISPLAY PR-1/PR-1b (saf mapper)', () => {
  it('OK tek-currency: 4 alan (grossAccruedInterest/remainingPrincipal/remainingInterest/claimRemaining) + costs/collected', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 150.005,
          totalDue: 1200.004,
          remainingPrincipal: 1050.002,
          remainingInterest: 150.005,
          allocations: [{ paymentId: 'p1', paymentAmount: 300 }],
        }),
      ] as any,
      projections: { costs: { EXPENSE: 200 }, ancillaries: { PENALTY: 50 } } as any,
    });

    const d = toCaseBalanceDisplay('case-1', balance);

    expect(d.caseId).toBe('case-1');
    expect(d.status).toBe('OK');
    expect(d.costs).toBe(200);
    expect(d.ancillaries).toBe(50);
    expect(d.currencies[0].grossAccruedInterest).toBe(150.01); // round2(totalInterest)
    expect(d.currencies[0].remainingPrincipal).toBe(1050); // round2(remainingPrincipal)
    expect(d.currencies[0].remainingInterest).toBe(150.01);
    expect(d.currencies[0].claimRemaining).toBe(1200); // round2(totalDue)
    expect(d.currencies[0].collected).toBe(300);
    expect(d.currencies[0].skipped).toBe(false);
  });

  it('UYDURMA YOK: remainingPrincipal/remainingInterest engine alanından gelir, türetilmez (gross ≠ remaining)', () => {
    // Ödeme faize değmiş senaryo: gross faiz 250, kalan faiz 100; kalan anapara 900; totalDue 1000.
    // Eğer mapper yanlışlıkla türetseydi: remainingPrincipal = totalDue − totalInterest = 1000 − 250 = 750 (YANLIŞ).
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 250,
          totalDue: 1000,
          remainingPrincipal: 900,
          remainingInterest: 100,
          allocations: [{ paymentId: 'p1', paymentAmount: 150 }],
        }),
      ] as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies[0].grossAccruedInterest).toBe(250); // brüt
    expect(d.currencies[0].remainingInterest).toBe(100); // kalan (< brüt) — türetme değil
    expect(d.currencies[0].remainingPrincipal).toBe(900); // engine'den; 750 (türetme) DEĞİL
    // INVARIANT: claimRemaining ≈ remainingPrincipal + remainingInterest
    expect(d.currencies[0].claimRemaining).toBe(1000);
    expect(d.currencies[0].remainingPrincipal + d.currencies[0].remainingInterest).toBeCloseTo(d.currencies[0].claimRemaining, 5);
  });

  it('collected: aynı paymentId çoklu adımda DEDUP (çift saymaz)', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 0, totalDue: 0, remainingPrincipal: 0, remainingInterest: 0,
          allocations: [
            { paymentId: 'p1', paymentAmount: 300 },
            { paymentId: 'p1', paymentAmount: 300 }, // aynı ödeme → SAYILMAZ
            { paymentId: 'p2', paymentAmount: 100 },
          ],
        }),
      ] as any,
    });
    expect(toCaseBalanceDisplay('c', balance).currencies[0].collected).toBe(400);
  });

  it('eski engine (remaining* yok): null-safe → 0 (geriye uyum)', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 10, totalDue: 1000 })] as any, // remaining* undefined
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies[0].remainingPrincipal).toBe(0);
    expect(d.currencies[0].remainingInterest).toBe(0);
    expect(d.currencies[0].collected).toBe(0);
    expect(d.currencies[0].grossAccruedInterest).toBe(10);
  });

  it('skipped currency: result null → skipped true + skippedReason; tutarlar 0', () => {
    const balance = makeBalance({ currencyResults: [currencyResult('USD', null, 'NO_BUCKETS')] as any });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies[0].skipped).toBe(true);
    expect(d.currencies[0].skippedReason).toBe('NO_BUCKETS');
    expect(d.currencies[0].grossAccruedInterest).toBe(0);
    expect(d.currencies[0].remainingPrincipal).toBe(0);
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

  it('multi-currency: her grup ayrı map; costs/ancillaries CASE-level', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', { totalInterest: 100, totalDue: 1000, remainingPrincipal: 900, remainingInterest: 100 }),
        currencyResult('USD', { totalInterest: 5, totalDue: 50, remainingPrincipal: 45, remainingInterest: 5 }),
      ] as any,
      projections: { costs: { EXPENSE: 300 }, ancillaries: {} } as any,
    });
    const d = toCaseBalanceDisplay('c', balance);
    expect(d.currencies.map((c) => c.currency)).toEqual(['TRY', 'USD']);
    expect(d.costs).toBe(300);
  });

  it('boş: currencyResults yoksa OK + currencies []', () => {
    const d = toCaseBalanceDisplay('c', makeBalance({ source: 'NONE' } as any));
    expect(d.status).toBe('OK');
    expect(d.currencies).toEqual([]);
  });
});
