import { BalanceDisplayShadowDiffService } from '../balance-display-shadow-diff.service';
import type { CaseService } from '../../case/case.service';
import type { CaseBalanceService, CaseBalanceResult } from '../../interest-engine/orchestration/case-balance.service';
import { AncillaryType } from '../../interest-engine/types/domain.types';

const GENERATED_AT = '2026-06-24T10:00:00.000Z';

function legacySummary(overrides: Record<string, unknown> = {}) {
  return {
    caseId: 'case-1',
    hesapTarihi: '2026-06-24',
    takipTarihi: '2026-01-01',
    kalemTuru: 'PRINCIPAL',
    asilAlacak: 1000,
    takipOncesiFaiz: 0,
    takipSonrasiFaiz: 0,
    faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
    toplamBorc: 1300,
    sonBorc: 1350,
    toplamTahsilat: 100,
    kalanBorc: 1250,
    icraMasraflari: 50,
    vekaletUcreti: 150,
    pesinHarcHaricTahsilHarci: 25,
    canonicalShadow: {
      status: 'OK',
      source: 'computeCaseBalance',
      legacyCurrency: 'TRY',
    },
    ...overrides,
  };
}

function canonicalBalance(overrides: Partial<CaseBalanceResult> = {}): CaseBalanceResult {
  return {
    asOfDate: '2026-06-24',
    source: 'LEDGER',
    currencyResults: [
      {
        currency: 'TRY',
        result: {
          engineVersion: 'engine-v1',
          totalDue: 900,
          totalInterest: 25,
          allocations: [{ paymentId: 'pay-1', paymentAmount: 100 }],
          segments: [{ id: 'seg-1' }],
        } as any,
      },
    ],
    projections: {
      costs: { [AncillaryType.HARC]: 50 },
      ancillaries: { [AncillaryType.VEKALET_UCRETI]: 150 },
    },
    diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
    overpayments: {
      held: [
        {
          id: 'op-held',
          collectionId: 'col-1',
          sourceLedgerEntryId: 'le-1',
          amount: 80,
          remainingAmount: 80,
          currency: 'TRY',
          status: 'HELD',
        },
      ],
      blocked: [
        {
          id: 'timeline-1',
          collectionId: 'col-2',
          sourceLedgerEntryId: 'le-2',
          attemptedOverpaymentAmount: 40,
          currency: 'TRY',
          blockedReasons: [{ reason: 'RESTRICTED_PAYMENT_UNSUPPORTED' }],
          createdAt: '2026-06-24T09:00:00.000Z',
        },
      ],
    },
    ...overrides,
  };
}

function makeService(
  legacy: unknown = legacySummary(),
  canonical: CaseBalanceResult | Error = canonicalBalance(),
) {
  const mutators = {
    createLedgerEntry: jest.fn(),
    createLedgerAllocation: jest.fn(),
    createCollection: jest.fn(),
    createCollectionAllocation: jest.fn(),
    createCollectionOverpayment: jest.fn(),
    createDue: jest.fn(),
    createClaimItem: jest.fn(),
    persistCalculationSummary: jest.fn(),
    persistBalanceDisplay: jest.fn(),
  };
  const caseService = {
    getCalculationSummary: jest.fn().mockImplementation(async () => {
      if (legacy instanceof Error) throw legacy;
      return legacy;
    }),
    ...mutators,
  } as unknown as CaseService;
  const caseBalance = {
    computeCaseBalance: jest.fn().mockImplementation(async () => {
      if (canonical instanceof Error) throw canonical;
      return canonical;
    }),
    ...mutators,
  } as unknown as CaseBalanceService;

  return {
    service: new BalanceDisplayShadowDiffService(caseService, caseBalance),
    caseService,
    caseBalance,
    mutators,
  };
}

describe('BalanceDisplayShadowDiffService', () => {
  it('legacy calculation-summary ile hardened balance/display DTOsunu shadow-only raporda yan yana üretir', async () => {
    const { service, caseService, caseBalance } = makeService();

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(caseService.getCalculationSummary).toHaveBeenCalledWith('tenant-1', 'case-1', '2026-06-24');
    expect(caseBalance.computeCaseBalance).toHaveBeenCalledWith('tenant-1', 'case-1', '2026-06-24');
    expect(report).toMatchObject({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      currency: 'TRY',
      generatedAt: GENERATED_AT,
      sourceVersion: 'computeBalance:engine-v1',
      mode: 'SHADOW_ONLY',
      primaryDisplayUnchanged: true,
      comparability: {
        comparable: true,
        classification: 'EXPECTED_CANONICAL_DIVERGENCE',
        severity: 'YELLOW',
      },
      sources: {
        legacyCalculationSummary: {
          available: true,
          endpoint: '/cases/:id/calculation-summary',
          authority: 'LEGACY_DISPLAY',
        },
        canonicalBalanceDisplay: {
          available: true,
          endpoint: '/interest-engine/case/:caseId/balance/display',
          authority: 'SHADOW_ONLY',
        },
      },
      provenance: {
        legacyCalculationSummaryUsed: true,
        canonicalBalanceDisplayUsed: true,
        computeBalanceUsed: true,
        finalDebtStatesAvailable: false,
        claimItemCollectedAmountUsedAsAuthority: false,
        overpaymentHeldAvailable: true,
        blockedOverpaymentDiagnosticsAvailable: true,
      },
    });
    expect(report.sources.legacyCalculationSummary.diagnostics).toEqual(expect.arrayContaining([
      'LEGACY_CALCULATION_SUMMARY_LIVE',
      'CANONICAL_SHADOW_PRESENT_NOT_USED_AS_SOURCE',
      'LEGACY_INTEREST_STUB_OR_EMPTY',
    ]));
    expect(report.sources.canonicalBalanceDisplay.diagnostics).toEqual(expect.arrayContaining([
      'FINAL_DEBT_STATES_MISSING',
      'OVERPAYMENT_BLOCKED',
      'RESTRICTED_PAYMENT_DISPLAY_UNSAFE',
    ]));
    expect(report.sources.canonicalBalanceDisplay.unsafeSources).toEqual(expect.arrayContaining([
      'LEGACY_CALCULATION_SUMMARY_LIVE',
      'FINAL_DEBT_STATES_MISSING',
      'RESTRICTED_PAYMENT_DISPLAY_UNSAFE',
    ]));
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'LEGACY_INTEREST_STUB_OR_EMPTY',
        classification: 'LEGACY_STUB',
        severity: 'YELLOW',
      }),
      expect.objectContaining({
        code: 'CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY',
        classification: 'LEGACY_AUTHORITY_RISK',
      }),
    ]));
  });

  it('HELD overpaymenti outstanding borçtan düşmeden ayrı evidence olarak taşır', async () => {
    const { service } = makeService();

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.totals.canonical).toMatchObject({
      outstandingAmount: 1100,
      totalPaidAmount: 100,
      heldOverpaymentAmount: 80,
    });
    expect(report.totals.canonical).not.toHaveProperty('blockedOverpaymentAmount');
    expect(report.bucketDiffs.find((diff) => diff.bucket === 'HELD_OVERPAYMENT')).toMatchObject({
      canonicalAmount: 80,
      canonicalDisplayable: true,
      status: 'CANONICAL_ONLY',
      classification: 'EXPECTED_CANONICAL_DIVERGENCE',
      severity: 'YELLOW',
    });
  });

  it('finalDebtStates yokken PRINCIPAL uydurmadığını ve primary cutover blocker ürettiğini raporlar', async () => {
    const { service } = makeService();

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL')).toMatchObject({
      legacyAmount: 1000,
      canonicalAmount: null,
      canonicalDisplayable: false,
      status: 'LEGACY_ONLY',
      classification: 'MISSING_CANONICAL_FIELD',
      severity: 'YELLOW',
    });
    expect(report.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
    expect(report.cutoverReadiness.safeForOptInShadow).toBe(true);
    expect(report.cutoverReadiness.blockers).toContain('FINAL_DEBT_STATES_MISSING');
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'FINAL_DEBT_STATES_MISSING',
        classification: 'MISSING_CANONICAL_FIELD',
        severity: 'RED',
      }),
    ]));
  });

  it('CB-01: finalDebtStates varsa PRINCIPAL canonical diff final debt state authority ile karsilastirilir', async () => {
    const { service } = makeService(
      legacySummary({ asilAlacak: 750 }),
      canonicalBalance({
        currencyResults: [
          {
            currency: 'TRY',
            result: {
              engineVersion: 'engine-v1',
              totalDue: 775,
              totalInterest: 25,
              allocations: [{ paymentId: 'pay-1', paymentAmount: 100 }],
              segments: [{ id: 'seg-1' }],
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
            } as any,
          },
        ],
        overpayments: { held: [], blocked: [] },
      }),
    );

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.provenance.finalDebtStatesAvailable).toBe(true);
    expect(report.sources.canonicalBalanceDisplay.diagnostics).not.toContain('FINAL_DEBT_STATES_MISSING');
    expect(report.cutoverReadiness.blockers).not.toContain('FINAL_DEBT_STATES_MISSING');
    expect(report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL')).toMatchObject({
      legacyAmount: 750,
      canonicalAmount: 750,
      canonicalDisplayable: true,
      status: 'MATCH',
      classification: 'EXACT_MATCH',
      severity: 'GREEN',
    });
  });

  it('CB-01: legacy ve canonical principal farkliysa deterministic amount diff uretir', async () => {
    const { service } = makeService(
      legacySummary({ asilAlacak: 900 }),
      canonicalBalance({
        currencyResults: [
          {
            currency: 'TRY',
            result: {
              engineVersion: 'engine-v1',
              totalDue: 775,
              totalInterest: 25,
              allocations: [{ paymentId: 'pay-1', paymentAmount: 100 }],
              segments: [{ id: 'seg-1' }],
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
            } as any,
          },
        ],
        overpayments: { held: [], blocked: [] },
      }),
    );

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL')).toMatchObject({
      legacyAmount: 900,
      canonicalAmount: 750,
      canonicalDisplayable: true,
      status: 'MAJOR_DELTA',
      classification: 'EXPECTED_CANONICAL_DIVERGENCE',
      severity: 'RED',
      delta: -150,
    });
    expect(report.cutoverReadiness.safeForPrimaryDisplay).toBe(false);
    expect(report.cutoverReadiness.blockers).not.toContain('FINAL_DEBT_STATES_MISSING');
  });

  it('legacy canonicalShadow alanını canonical source olarak kullanmaz; sadece diagnostic/provenance işareti yapar', async () => {
    const { service, caseBalance } = makeService(legacySummary({
      canonicalShadow: {
        status: 'OK',
        legacyCurrency: 'TRY',
        canonicalTotalDue: 999999,
      },
    }));

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(caseBalance.computeCaseBalance).toHaveBeenCalledTimes(1);
    expect(report.totals.canonical?.raw.claimRemaining).toBe(900);
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('CANONICAL_SHADOW_PRESENT_NOT_USED_AS_SOURCE');
    expect(JSON.stringify(report)).not.toContain('999999');
  });

  it('exact amount karşılaştırmalarını EXACT_MATCH / GREEN olarak sınıflandırır', async () => {
    const { service } = makeService(legacySummary({
      takipOncesiFaiz: 0,
      takipSonrasiFaiz: 25,
      faizSegmentleri: { takipOncesi: [], takipSonrasi: [{ id: 'legacy-post' }] },
      toplamTahsilat: 100,
      kalanBorc: 1100,
      icraMasraflari: 50,
      vekaletUcreti: 150,
    }));

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.totals.diffs.find((diff) => diff.code === 'OUTSTANDING_DELTA')).toMatchObject({
      classification: 'EXACT_MATCH',
      severity: 'GREEN',
      status: 'MATCH',
      delta: 0,
    });
    expect(report.totals.diffs.find((diff) => diff.code === 'INTEREST_DELTA')).toMatchObject({
      classification: 'EXACT_MATCH',
      severity: 'GREEN',
      status: 'MATCH',
      delta: 0,
    });
  });

  it('currency mismatch varsa amount comparison yapmaz ve RED blocker döner', async () => {
    const { service } = makeService(legacySummary({ currency: 'USD' }));

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.comparability).toMatchObject({
      comparable: false,
      classification: 'CURRENCY_MISMATCH',
      severity: 'RED',
    });
    expect(report.comparability.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CURRENCY_MISMATCH',
        classification: 'CURRENCY_MISMATCH',
        severity: 'RED',
      }),
    ]));
    expect(report.totals.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        classification: 'CURRENCY_MISMATCH',
        severity: 'RED',
        status: 'NOT_COMPARABLE',
        delta: null,
        deltaPercent: null,
      }),
    ]));
  });

  it('tenant/case mismatch varsa cross-context veriyi sessizce comparable yapmaz', async () => {
    const { service } = makeService(legacySummary({ tenantId: 'tenant-other', caseId: 'case-other' }));

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.comparability).toMatchObject({
      comparable: false,
      classification: 'CONTEXT_MISMATCH',
      severity: 'RED',
    });
    expect(report.comparability.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONTEXT_MISMATCH',
        classification: 'CONTEXT_MISMATCH',
        severity: 'RED',
      }),
    ]));
    expect(report.bucketDiffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        classification: 'CONTEXT_MISMATCH',
        status: 'NOT_COMPARABLE',
      }),
    ]));
  });

  it('OVERPAYMENT_BLOCKED borç/totals kalemi değil diagnostic ve cutover blocker olarak kalır', async () => {
    const { service } = makeService();

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.totals.canonical).not.toHaveProperty('blockedOverpaymentAmount');
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'OVERPAYMENT_BLOCKED',
        classification: 'CANONICAL_UNSAFE',
      }),
    ]));
    expect(report.cutoverReadiness.blockers).toContain('OVERPAYMENT_BLOCKED');
  });

  it('NAFAKA legacy satırını canonical PRINCIPAL bucket kaynağı yapmaz', async () => {
    const { service } = makeService(legacySummary({
      kalemTuru: 'NAFAKA',
      asilAlacak: 750,
    }));

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL')).toMatchObject({
      legacyField: 'legacy.asilAlacak',
      canonicalField: 'canonical.bucket.PRINCIPAL',
      legacyAmount: 750,
      canonicalAmount: null,
      classification: 'MISSING_CANONICAL_FIELD',
    });
    expect(report.provenance.claimItemCollectedAmountUsedAsAuthority).toBe(false);
  });

  it('shadow diff read-only kalır; tahsilat/bakiye tabloları için mutator çağırmaz', async () => {
    const { service, mutators } = makeService();

    await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    for (const mutator of Object.values(mutators)) {
      expect(mutator).not.toHaveBeenCalled();
    }
  });

  it('legacy üretilemezse merge/cutover değil blocker içeren read-only rapor döner', async () => {
    const { service } = makeService(new Error('Dosya bulunamadı'), canonicalBalance());

    const report = await service.compare('tenant-1', 'missing', '2026-06-24', GENERATED_AT);

    expect(report.sources.legacyCalculationSummary.available).toBe(false);
    expect(report.sources.canonicalBalanceDisplay.available).toBe(true);
    expect(report.comparability.comparable).toBe(false);
    expect(report.comparability.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'LEGACY_UNAVAILABLE',
        classification: 'MISSING_LEGACY_FIELD',
        severity: 'RED',
      }),
    ]));
    expect(report.cutoverReadiness.safeForOptInShadow).toBe(false);
  });

  it('canonical display üretilemezse legacy davranışı değiştirmeden blocker raporu üretir', async () => {
    const { service } = makeService(legacySummary(), new Error('engine down'));

    const report = await service.compare('tenant-1', 'case-1', '2026-06-24', GENERATED_AT);

    expect(report.sources.legacyCalculationSummary.available).toBe(true);
    expect(report.sources.canonicalBalanceDisplay.available).toBe(false);
    expect(report.sources.canonicalBalanceDisplay.diagnostics).toEqual(['CANONICAL_UNAVAILABLE:engine down']);
    expect(report.comparability.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CANONICAL_DISPLAY_UNAVAILABLE',
        classification: 'MISSING_CANONICAL_FIELD',
        severity: 'RED',
      }),
    ]));
  });
});
