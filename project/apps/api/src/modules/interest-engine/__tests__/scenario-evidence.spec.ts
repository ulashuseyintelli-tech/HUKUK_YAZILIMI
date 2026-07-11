/**
 * ADR-014 W0.3 — Evidence model / karşılaştırıcı birim testleri (DB'siz, saf).
 *
 * §12 kanıtı: `compareScenarioEvidence` HESAPLAMAZ — yalnız verilen expected'ı
 * verilen display gözlemiyle karşılaştırır. Bu suite karşılaştırıcının yalancı
 * PASS/FAIL üretmediğini DB olmadan, her CI koşumunda sabitler.
 */
import type { ScenarioExpected } from '../scenario-support/scenario-definition';
import type {
  CaseBalanceDisplay,
  BalanceDisplayDiagnostic,
  BalanceDisplayTotals,
  CaseBalanceDisplayCurrency,
} from '../orchestration/case-balance-display';
import {
  compareScenarioEvidence,
  extractBlockerCodes,
} from '../scenario-diagnostic/scenario-evidence';

const NULL_TOTALS: BalanceDisplayTotals = {
  totalDebtAmount: null,
  totalPaidAmount: null,
  outstandingAmount: null,
  heldOverpaymentAmount: null,
  allocatedPaidAmount: null,
  grossReceivedAmount: null,
};

function makeCurrency(overrides: Partial<CaseBalanceDisplayCurrency> = {}): CaseBalanceDisplayCurrency {
  return {
    currency: 'TRY',
    interest: 0,
    claimRemaining: 0,
    collected: 0,
    skipped: false,
    skippedReason: null,
    ...overrides,
  };
}

function makeDisplay(overrides: Partial<CaseBalanceDisplay> = {}): CaseBalanceDisplay {
  return {
    tenantId: 't-1',
    caseId: 'c-1',
    currency: 'TRY',
    authority: 'CANONICAL_CANDIDATE',
    generatedAt: '2026-07-01T00:00:00.000Z',
    sourceVersion: 'test',
    asOfDate: '2026-07-01',
    source: 'LEDGER' as CaseBalanceDisplay['source'],
    status: 'OK',
    costs: 0,
    ancillaries: 0,
    currencies: [makeCurrency()],
    buckets: [],
    totals: { ...NULL_TOTALS },
    diagnostics: [],
    provenance: {
      computeBalanceUsed: true,
      legacyCalculationSummaryUsed: false,
      claimItemCollectedAmountUsedAsAuthority: false,
      finalDebtStatesAvailable: false,
      overpaymentProjectionUsed: false,
      blockedOverpaymentDiagnosticsUsed: false,
    },
    notes: [],
    ...overrides,
  };
}

const BASE_EXPECTED: ScenarioExpected = {
  perCurrencyStatus: { TRY: 'OK' },
  blockerCodes: [],
  authority: 'CANONICAL_CANDIDATE',
};

const diag = (
  code: BalanceDisplayDiagnostic['code'],
  severity: BalanceDisplayDiagnostic['severity'],
): BalanceDisplayDiagnostic => ({ code, severity, message: code });

describe('W0.3 scenario-evidence karşılaştırıcısı (§12: hesaplamaz)', () => {
  it('uyumlu expected/actual → match=true, mismatch yok', () => {
    const result = compareScenarioEvidence(BASE_EXPECTED, makeDisplay());
    expect(result).toEqual({ match: true, mismatches: [], notes: [] });
  });

  it('authority farkı → tek mismatch, alan adı authority', () => {
    const result = compareScenarioEvidence(
      BASE_EXPECTED,
      makeDisplay({ authority: 'SHADOW_ONLY' }),
    );
    expect(result.match).toBe(false);
    expect(result.mismatches).toEqual([
      { field: 'authority', expected: 'CANONICAL_CANDIDATE', actual: 'SHADOW_ONLY' },
    ]);
  });

  it('blockerCodes: yalnız severity=BLOCKER sayılır; WARNING/INFO mismatch üretmez', () => {
    const display = makeDisplay({
      diagnostics: [
        diag('INTEREST_STUB_OR_EMPTY', 'WARNING'),
        diag('OVERPAYMENT_BLOCKED', 'BLOCKER'),
        diag('OVERPAYMENT_BLOCKED', 'BLOCKER'), // duplicate — tekilleşmeli
      ],
    });
    expect(extractBlockerCodes(display)).toEqual(['OVERPAYMENT_BLOCKED']);

    const missing = compareScenarioEvidence(BASE_EXPECTED, display);
    expect(missing.match).toBe(false);
    expect(missing.mismatches[0].field).toBe('blockerCodes');

    const matching = compareScenarioEvidence(
      { ...BASE_EXPECTED, blockerCodes: ['OVERPAYMENT_BLOCKED'] },
      display,
    );
    expect(matching.match).toBe(true);
  });

  it('perCurrencyStatus: SKIPPED beklentisi ve eksik currency doğru raporlanır', () => {
    const display = makeDisplay({
      currencies: [makeCurrency({ skipped: true, skippedReason: 'NO_BUCKETS' })],
    });
    const okBeklenirken = compareScenarioEvidence(BASE_EXPECTED, display);
    expect(okBeklenirken.mismatches).toEqual([
      { field: 'perCurrencyStatus.TRY', expected: 'OK', actual: 'SKIPPED' },
    ]);

    const eksikCurrency = compareScenarioEvidence(
      { ...BASE_EXPECTED, perCurrencyStatus: { TRY: 'OK', USD: 'OK' } },
      makeDisplay(),
    );
    expect(eksikCurrency.mismatches).toEqual([
      { field: 'perCurrencyStatus.USD', expected: 'OK', actual: 'MISSING' },
    ]);
  });

  it('NO_BUCKETS blocker ve unsafe authority evidence katmanına kayıpsız taşınır', () => {
    const display = makeDisplay({
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      status: 'UNAVAILABLE',
      unavailableReason: 'NO_BUCKETS',
      currencies: [makeCurrency({ skipped: true, skippedReason: 'NO_BUCKETS' })],
      diagnostics: [diag('NO_BUCKETS', 'BLOCKER')],
    });

    expect(compareScenarioEvidence({
      perCurrencyStatus: { TRY: 'SKIPPED' },
      blockerCodes: ['NO_BUCKETS'],
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
    }, display)).toEqual({ match: true, mismatches: [], notes: [] });
  });

  it('totals: yalnız verilen alanlar karşılaştırılır; float gürültüsü eşleşir, gerçek fark yakalanır, null==null geçer', () => {
    const display = makeDisplay({
      totals: { ...NULL_TOTALS, totalDebtAmount: 100, totalPaidAmount: 55.5 },
    });

    // Verilmeyen alanlar (totalPaidAmount dahil) hiç karşılaştırılmaz.
    const noise = compareScenarioEvidence(
      { ...BASE_EXPECTED, totals: { totalDebtAmount: 100.001 } },
      display,
    );
    expect(noise.match).toBe(true);

    const realDiff = compareScenarioEvidence(
      { ...BASE_EXPECTED, totals: { totalDebtAmount: 100.02 } },
      display,
    );
    expect(realDiff.match).toBe(false);
    expect(realDiff.mismatches[0].field).toBe('totals.totalDebtAmount');

    const nullEqual = compareScenarioEvidence(
      { ...BASE_EXPECTED, totals: { outstandingAmount: null } },
      display,
    );
    expect(nullEqual.match).toBe(true);
  });

  it('snapshotStatus verilirse karşılaştırılMAZ: not düşülür, match etkilenmez', () => {
    const result = compareScenarioEvidence(
      { ...BASE_EXPECTED, snapshotStatus: 'SAFE' },
      makeDisplay(),
    );
    expect(result.match).toBe(true);
    expect(result.notes.some((n) => n.includes('SNAPSHOT_PATH_NOT_EXERCISED'))).toBe(true);
  });
});
