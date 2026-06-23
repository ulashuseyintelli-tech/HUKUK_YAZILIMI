import { toCaseBalanceDisplay } from '../case-balance-display';
import type { CaseBalanceResult } from '../case-balance.service';

// BALANCE-DISPLAY PR-1: saf mapper testleri. Engine raw → panel DTO; YALNIZ doğrulanmış alanlar, uydurma yok.

const GENERATED_AT = '2026-06-23T09:00:00.000Z';

function makeBalance(overrides: Partial<CaseBalanceResult> = {}): CaseBalanceResult {
  return {
    asOfDate: '2026-06-23',
    source: 'COLLECTION',
    currencyResults: [],
    projections: { costs: {}, ancillaries: {} },
    diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
    overpayments: { held: [], blocked: [] },
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

    const d = toCaseBalanceDisplay({ tenantId: 'tenant-1', caseId: 'case-1', balance, generatedAt: GENERATED_AT });

    expect(d.tenantId).toBe('tenant-1');
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

  it('contract hardening: authority, buckets, totals, provenance ve diagnostics açık taşınır', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 150,
          totalDue: 1200,
          allocations: [{ paymentId: 'p1', paymentAmount: 300 }],
          engineVersion: 'engine-v1',
          segments: [{ id: 's1' }],
        }),
      ] as any,
      projections: {
        costs: { HARC: 75, TEBLIGAT_MASRAFI: 25 },
        ancillaries: { VEKALET_UCRETI: 200, DIGER: 40 },
      } as any,
      overpayments: {
        held: [{ id: 'op1', collectionId: 'col1', currency: 'TRY', amount: 100, remainingAmount: 80, status: 'HELD' }],
        blocked: [
          {
            id: 'evt1',
            currency: 'TRY',
            attemptedOverpaymentAmount: 25,
            collectionId: 'col2',
            blockedReasons: [{ reason: 'RESTRICTED_PAYMENT_UNSUPPORTED' }],
          },
        ],
      } as any,
    });

    const d = toCaseBalanceDisplay({ tenantId: 'tenant-1', caseId: 'case-1', balance, generatedAt: GENERATED_AT });

    expect(d.generatedAt).toBe(GENERATED_AT);
    expect(d.currency).toBe('TRY');
    expect(d.authority).toBe('SHADOW_ONLY');
    expect(d.sourceVersion).toBe('computeBalance:engine-v1');
    expect(new Set(d.buckets.map((bucket) => bucket.code))).toEqual(
      new Set(['EXPENSE', 'ACCRUED_INTEREST', 'ATTORNEY_FEE', 'OTHER_ANCILLARY', 'PRINCIPAL', 'HELD_OVERPAYMENT']),
    );
    expect(d.buckets.find((bucket) => bucket.code === 'EXPENSE')).toMatchObject({ amount: 100, source: 'CASE_LEVEL_PROJECTION' });
    expect(d.buckets.find((bucket) => bucket.code === 'ATTORNEY_FEE')).toMatchObject({ amount: 200 });
    expect(d.buckets.find((bucket) => bucket.code === 'OTHER_ANCILLARY')).toMatchObject({ amount: 40 });
    expect(d.buckets.find((bucket) => bucket.code === 'HELD_OVERPAYMENT')).toMatchObject({
      amount: 80,
      source: 'OVERPAYMENT_PROJECTION',
    });
    expect(d.buckets.find((bucket) => bucket.code === 'PRINCIPAL')).toMatchObject({
      amount: null,
      displayable: false,
      diagnosticCodes: ['FINAL_DEBT_STATES_MISSING'],
    });
    expect(d.totals).toMatchObject({
      totalDebtAmount: null,
      totalPaidAmount: 300,
      outstandingAmount: 1540,
      heldOverpaymentAmount: 80,
      blockedOverpaymentAmount: 25,
    });
    expect(d.provenance).toEqual({
      computeBalanceUsed: true,
      legacyCalculationSummaryUsed: false,
      claimItemCollectedAmountUsedAsAuthority: false,
      finalDebtStatesAvailable: false,
      overpaymentProjectionUsed: true,
      blockedOverpaymentDiagnosticsUsed: true,
    });
    expect(d.diagnostics.map((diag) => diag.code)).toEqual(
      expect.arrayContaining([
        'LEGACY_CALCULATION_SUMMARY_LIVE',
        'FINAL_DEBT_STATES_MISSING',
        'CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY',
        'OVERPAYMENT_BLOCKED',
        'RESTRICTED_PAYMENT_DISPLAY_UNSAFE',
      ]),
    );
    expect(d.unsafeSources?.map((source) => source.code)).toContain('RESTRICTED_PAYMENT_DISPLAY_UNSAFE');
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
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    expect(d.currencies[0].collected).toBe(400); // 300 + 100, 700 DEĞİL
  });

  it('ödeme yoksa (allocations undefined) collected = 0', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 10, totalDue: 1000 })] as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    expect(d.currencies[0].collected).toBe(0);
  });

  it('faiz 0/empty ise sessiz legal interest gibi sunmaz; diagnostic üretir', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 0,
          totalDue: 1000,
          allocations: [],
          segments: [],
        }),
      ] as any,
    });

    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });

    expect(d.buckets.find((bucket) => bucket.code === 'ACCRUED_INTEREST')).toMatchObject({
      amount: 0,
      displayable: true,
    });
    expect(d.diagnostics.map((diag) => diag.code)).toContain('INTEREST_STUB_OR_EMPTY');
  });

  it('HELD overpayment outstanding borçtan düşülmez; negatif borç üretmez', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 100, totalDue: 1000, allocations: [] })] as any,
      overpayments: {
        held: [
          {
            id: 'op-big',
            collectionId: 'col-big',
            currency: 'TRY',
            amount: 5000,
            remainingAmount: 5000,
            status: 'HELD',
          },
        ],
        blocked: [],
      } as any,
    });

    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });

    expect(d.totals.outstandingAmount).toBe(1000);
    expect(d.totals.heldOverpaymentAmount).toBe(5000);
    expect(d.buckets.find((bucket) => bucket.code === 'HELD_OVERPAYMENT')).toMatchObject({
      amount: 5000,
      source: 'OVERPAYMENT_PROJECTION',
    });
  });

  it('skipped currency: result null → skipped true + skippedReason taşınır, tutarlar 0', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('USD', null, 'NO_BUCKETS')] as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    expect(d.currencies[0].skipped).toBe(true);
    expect(d.currencies[0].skippedReason).toBe('NO_BUCKETS');
    expect(d.currencies[0].interest).toBe(0);
    expect(d.currencies[0].claimRemaining).toBe(0);
  });

  it('UNAVAILABLE: diagnostics.fatal varsa status UNAVAILABLE + unavailableReason', () => {
    const balance = makeBalance({
      diagnostics: { fatal: [{ code: 'CASE_NOT_FOUND', caseId: 'c' }], assembler: [], payments: [], currency: [], perCurrency: [] } as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    expect(d.status).toBe('UNAVAILABLE');
    expect(d.unavailableReason).toBe('CASE_NOT_FOUND');
    expect(d.authority).toBe('UNSAFE_FOR_PRIMARY_DISPLAY');
  });

  it('UYDURMA YOK: standalone "anapara"/"principal" alanı YOK; not finalDebtStates limitini açıklar', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 150, totalDue: 1200, allocations: [] })] as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
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
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    expect(d.currencies.map((c) => c.currency)).toEqual(['TRY', 'USD']);
    expect(d.costs).toBe(300); // case-level, tek
    expect(d.currency).toBe('MULTI');
    expect(d.totals.outstandingAmount).toBeNull();
    expect(d.diagnostics.map((diag) => diag.code)).toContain('MULTI_CURRENCY_DISPLAY_UNSAFE');
  });

  it('boş: currencyResults yoksa OK + currencies []', () => {
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance: makeBalance({ source: 'NONE' } as any), generatedAt: GENERATED_AT });
    expect(d.status).toBe('OK');
    expect(d.currencies).toEqual([]);
    expect(d.source).toBe('NONE');
    expect(d.currency).toBe('UNKNOWN');
  });
});
