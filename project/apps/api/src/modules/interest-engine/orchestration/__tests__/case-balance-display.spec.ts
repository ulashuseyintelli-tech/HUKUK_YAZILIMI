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

function currencyResult(
  currency: string,
  result: any,
  skippedReason: string | null = null,
  grossPrincipal = 0,
) {
  return { currency, result, skippedReason: skippedReason ?? undefined, grossPrincipal };
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
      // GO-IMPLEMENT-1: grossPrincipal(0, bu mock'ta set edilmedi) + interest(150) + costs(100) + ancillaries(240).
      totalDebtAmount: 490,
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

  it('CB-01: finalDebtStates varsa PRINCIPAL bucket yalniz final debt state authority ile dolar', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 25,
          totalDue: 775,
          allocations: [],
          engineVersion: 'engine-v1',
          segments: [{ id: 's1' }],
          finalDebtStates: [
            {
              claimId: 'p1',
              currency: 'TRY',
              principal: 750,
              accruedInterest: 25,
              costs: {},
              ancillaries: {},
            },
          ],
        }),
      ] as any,
    });

    const d = toCaseBalanceDisplay({ tenantId: 'tenant-1', caseId: 'case-1', balance, generatedAt: GENERATED_AT });

    expect(d.buckets.find((bucket) => bucket.code === 'PRINCIPAL')).toMatchObject({
      amount: 750,
      displayable: true,
      source: 'COMPUTE_BALANCE_FINAL_DEBT_STATE',
    });
    expect(d.provenance.finalDebtStatesAvailable).toBe(true);
    expect(d.diagnostics.map((diag) => diag.code)).not.toContain('FINAL_DEBT_STATES_MISSING');
    expect(d.unsafeSources?.map((source) => source.code) ?? []).not.toContain('FINAL_DEBT_STATES_MISSING');
  });

  it('CB-04: finalDebtStates varken ClaimItem collected/remaining benzeri projection principal authority olamaz', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 25,
          totalDue: 775,
          allocations: [],
          engineVersion: 'engine-v1',
          segments: [{ id: 's1' }],
          finalDebtStates: [
            {
              claimId: 'p1',
              currency: 'TRY',
              principal: 750,
              accruedInterest: 25,
              costs: {},
              ancillaries: {},
            },
          ],
        }),
      ] as any,
    }) as CaseBalanceResult & {
      claimItems?: Array<{ demandedAmount: number; collectedAmount: number; remainingAmount: number }>;
    };
    balance.claimItems = [{ demandedAmount: 1000, collectedAmount: 999, remainingAmount: 1 }];

    const d = toCaseBalanceDisplay({ tenantId: 'tenant-1', caseId: 'case-1', balance, generatedAt: GENERATED_AT });
    const principalBucket = d.buckets.find((bucket) => bucket.code === 'PRINCIPAL');

    expect(principalBucket).toMatchObject({
      amount: 750,
      displayable: true,
      source: 'COMPUTE_BALANCE_FINAL_DEBT_STATE',
    });
    expect(principalBucket?.amount).not.toBe(1);
    expect(d.provenance.claimItemCollectedAmountUsedAsAuthority).toBe(false);
    expect(d.diagnostics.map((diag) => diag.code)).toContain('CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY');
  });

  it('CB-04: finalDebtStates yokken ClaimItem derived remaining fallback PRINCIPAL bucket uretmez', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 0,
          totalDue: 1,
          allocations: [],
          engineVersion: 'engine-v1',
          segments: [],
        }),
      ] as any,
    }) as CaseBalanceResult & {
      claimItems?: Array<{ demandedAmount: number; collectedAmount: number; remainingAmount: number }>;
    };
    balance.claimItems = [{ demandedAmount: 1000, collectedAmount: 999, remainingAmount: 1 }];

    const d = toCaseBalanceDisplay({ tenantId: 'tenant-1', caseId: 'case-1', balance, generatedAt: GENERATED_AT });
    const principalBucket = d.buckets.find((bucket) => bucket.code === 'PRINCIPAL');

    expect(principalBucket).toMatchObject({
      amount: null,
      displayable: false,
      source: 'UNAVAILABLE',
      diagnosticCodes: ['FINAL_DEBT_STATES_MISSING'],
    });
    expect(d.provenance.claimItemCollectedAmountUsedAsAuthority).toBe(false);
    expect(d.provenance.finalDebtStatesAvailable).toBe(false);
    expect(d.diagnostics.map((diag) => diag.code)).toEqual(
      expect.arrayContaining(['CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY', 'FINAL_DEBT_STATES_MISSING']),
    );
  });

  it('CB-01: finalDebtStates currency display currency ile uyusmazsa PRINCIPAL bucket dolmaz', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 25,
          totalDue: 775,
          allocations: [],
          engineVersion: 'engine-v1',
          segments: [{ id: 's1' }],
          finalDebtStates: [
            {
              claimId: 'p1',
              currency: 'USD',
              principal: 750,
              accruedInterest: 25,
              costs: {},
              ancillaries: {},
            },
          ],
        }),
      ] as any,
    });

    const d = toCaseBalanceDisplay({ tenantId: 'tenant-1', caseId: 'case-1', balance, generatedAt: GENERATED_AT });

    expect(d.buckets.find((bucket) => bucket.code === 'PRINCIPAL')).toMatchObject({
      amount: null,
      displayable: false,
      source: 'UNAVAILABLE',
      diagnosticCodes: ['FINAL_DEBT_STATES_CURRENCY_MISMATCH'],
    });
    expect(d.provenance.finalDebtStatesAvailable).toBe(false);
    expect(d.diagnostics.map((diag) => diag.code)).toContain('FINAL_DEBT_STATES_CURRENCY_MISMATCH');
    expect(d.unsafeSources?.map((source) => source.code)).toContain('FINAL_DEBT_STATES_CURRENCY_MISMATCH');
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
    // GO-IMPLEMENT-1: mixed currency → uydurma toplam yok, totalDebtAmount de null.
    expect(d.totals.totalDebtAmount).toBeNull();
    expect(d.diagnostics.map((diag) => diag.code)).toContain('MULTI_CURRENCY_DISPLAY_UNSAFE');
    expect(d.unsafeSources?.map((source) => source.code)).toContain('MULTI_CURRENCY_DISPLAY_UNSAFE');
  });

  it('ALC-AUTH-1B: allocatedPaidAmount + heldOverpaymentAmount = grossReceivedAmount (220.000 + 100.000 = 320.000); totalPaidAmount geriye dönük DEĞİŞMEZ', () => {
    // 2026/9502 senaryosu (ALC-AUTH-1A forensiği): 4 ödemeden 3'ü (20k+100k+100k=220k)
    // borca tahsis edildi (allocation step üretti); 4. ödeme (100k) borç zaten kapandığı
    // için hiçbir kategoriye tahsis edilemedi (allocation step YOK) — ayrı, bağımsız
    // CollectionOverpayment kaydından heldOverpayment olarak 100k okunuyor.
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', {
          totalInterest: 0,
          totalDue: 0,
          allocations: [
            { paymentId: 'p1', paymentAmount: 20000 },
            { paymentId: 'p2', paymentAmount: 100000 },
            { paymentId: 'p3', paymentAmount: 100000 },
            // p4 (100.000) BİLEREK yok — borç kapandıktan sonra geldiği için hiç
            // allocation step üretmedi (ALC-AUTH-1A'da koddan doğrulandı).
          ],
        }),
      ] as any,
      overpayments: {
        held: [
          { id: 'op1', collectionId: 'col-p4', currency: 'TRY', amount: 100000, remainingAmount: 100000, status: 'HELD' },
        ],
        blocked: [],
      } as any,
    });

    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });

    expect(d.totals.totalPaidAmount).toBe(220000); // geriye dönük uyumluluk: değer değişmedi
    expect(d.totals.allocatedPaidAmount).toBe(220000); // aynı değer, açık isim
    expect(d.totals.heldOverpaymentAmount).toBe(100000);
    expect(d.totals.grossReceivedAmount).toBe(320000); // 220.000 + 100.000 — dosyaya gerçekten gelen toplam
  });

  it('boş: currencyResults yoksa OK + currencies []', () => {
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance: makeBalance({ source: 'NONE' } as any), generatedAt: GENERATED_AT });
    expect(d.status).toBe('OK');
    expect(d.currencies).toEqual([]);
    expect(d.source).toBe('NONE');
    expect(d.currency).toBe('UNKNOWN');
    expect(d.diagnostics.map((diag) => diag.code)).toContain('MULTI_CURRENCY_DISPLAY_UNSAFE');
    expect(d.unsafeSources?.map((source) => source.code)).toContain('MULTI_CURRENCY_DISPLAY_UNSAFE');
    expect(d.buckets.find((bucket) => bucket.code === 'PRINCIPAL')).toMatchObject({
      amount: null,
      displayable: false,
    });
  });
});

describe('GO-IMPLEMENT-1: totalDebtAmount contract (canonical, gross, as-of-date, ödeme-öncesi)', () => {
  it('totalDebtAmount artık hardcoded null DEĞİL — gross bileşenler mevcutken gerçek değer üretir', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 10, totalDue: 90, allocations: [] }, null, 100)] as any,
      projections: { costs: { HARC: 5 }, ancillaries: { DIGER: 5 } } as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    // 100 (gross principal) + 10 (interest) + 5 (costs) + 5 (ancillaries) = 120
    expect(d.totals.totalDebtAmount).toBe(120);
  });

  it('2026/9502 senaryosu: gross principal=200.000, remaining principal (finalDebtStates)=0 — totalDebtAmount 200.000 içerir, 0 değil', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult(
          'TRY',
          {
            totalInterest: 0,
            totalDue: 0,
            allocations: [{ paymentId: 'p1', paymentAmount: 220000 }],
            finalDebtStates: [
              { claimId: 'p1', currency: 'TRY', principal: 0, accruedInterest: 0, costs: {}, ancillaries: {} },
            ],
          },
          null,
          200000, // grossPrincipal — assembler'ın demandedAmount'ı, ödemeden bağımsız
        ),
      ] as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });

    // Kalan (net) anapara — TBK100 tam mahsup sonrası 0. Bu, gross'tan AYRI bir alan/kavramdır.
    expect(d.buckets.find((bucket) => bucket.code === 'PRINCIPAL')).toMatchObject({ amount: 0, displayable: true });
    // Gross toplam borç — ödeme tahsisinden ETKİLENMEZ, 200.000 anaparayı İÇERİR (0 değil).
    expect(d.totals.totalDebtAmount).toBe(200000);
  });

  it('ödemeler totalDebtAmount\'ı KÜÇÜLTMEZ — aynı gross principal, farklı allocation/totalDue', () => {
    const partiallyPaid = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 0, totalDue: 150000, allocations: [] }, null, 200000)] as any,
    });
    const fullyPaid = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 0, totalDue: 0, allocations: [] }, null, 200000)] as any,
    });
    const dPartial = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance: partiallyPaid, generatedAt: GENERATED_AT });
    const dFull = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance: fullyPaid, generatedAt: GENERATED_AT });

    expect(dPartial.totals.totalDebtAmount).toBe(200000);
    expect(dFull.totals.totalDebtAmount).toBe(200000);
    // outstandingAmount ise (beklendiği gibi) ödemeyle değişir — totalDebtAmount'tan bağımsız davranış.
    expect(dPartial.totals.outstandingAmount).toBe(150000);
    expect(dFull.totals.outstandingAmount).toBe(0);
  });

  it('costs/ancillaries yalnız canonical projections\'tan gelir; legacy fallback yok (fonksiyon imzasında legacy parametresi yok)', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', { totalInterest: 0, totalDue: 0, allocations: [] }, null, 1000)] as any,
      projections: { costs: { HARC: 300, TEBLIGAT_MASRAFI: 200 }, ancillaries: { VEKALET_UCRETI: 400 } } as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    // 1000 + 0 + 500(costs) + 400(ancillaries) = 1900 — yalnız projections'tan, başka kaynak yok.
    expect(d.totals.totalDebtAmount).toBe(1900);
  });

  it('mixed currency → totalDebtAmount null (uydurma toplam üretilmez)', () => {
    const balance = makeBalance({
      currencyResults: [
        currencyResult('TRY', { totalInterest: 0, totalDue: 0, allocations: [] }, null, 1000),
        currencyResult('USD', { totalInterest: 0, totalDue: 0, allocations: [] }, null, 50),
      ] as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    expect(d.currency).toBe('MULTI');
    expect(d.totals.totalDebtAmount).toBeNull();
  });

  it('ENGINE_ERROR ile atlanan currency grubu → totalDebtAmount null + GROSS_DEBT_COMPONENT_UNAVAILABLE diagnostic', () => {
    const balance = makeBalance({
      currencyResults: [currencyResult('TRY', null, 'ENGINE_ERROR', 200000)] as any,
    });
    const d = toCaseBalanceDisplay({ tenantId: 't', caseId: 'c', balance, generatedAt: GENERATED_AT });
    expect(d.totals.totalDebtAmount).toBeNull();
    expect(d.diagnostics.map((diag) => diag.code)).toContain('GROSS_DEBT_COMPONENT_UNAVAILABLE');
  });
});
