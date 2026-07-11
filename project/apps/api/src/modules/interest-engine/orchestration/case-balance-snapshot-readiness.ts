/**
 * ADR-014 PR-8a: read-only snapshot/readiness signal.
 *
 * Bu katman snapshot URETMEZ veya persist ETMEZ. Yalniz mevcut CaseBalance
 * kanitini, ADR-014 MUST-NOT #8'deki bes canonical blocker sinifina kayipsiz
 * ve deterministik olarak indirger. Official snapshot lifecycle PR-8a disidir.
 */
import type { CaseBalanceResult } from './case-balance.service';

export type CanonicalSnapshotBlockerCode =
  | 'REVERSAL_INTEGRITY'
  | 'NO_BUCKETS'
  | 'TBK100_ALLOCATION'
  | 'INTEREST_BASE'
  | 'CURRENCY_INTEGRITY';

export type SnapshotReadinessBlockerCode =
  | CanonicalSnapshotBlockerCode
  | 'CASE_BALANCE_UNAVAILABLE';

export interface SnapshotReadinessBlocker {
  code: SnapshotReadinessBlockerCode;
  sourceCodes: string[];
  message: string;
}

export interface CaseBalanceSnapshotReadiness {
  /** BLOCKED = calculation blocker; UNSAFE = blocker yok ama official snapshot da yok. */
  status: 'BLOCKED' | 'UNSAFE';
  /** PR-8a official veya persisted snapshot uretmez. */
  snapshotAvailable: false;
  /** Runtime cutover/primary authority bu PR'de her durumda kapali kalir. */
  primaryDisplayEligible: false;
  blockers: SnapshotReadinessBlocker[];
}

const REVERSAL_CODES = new Set([
  'REVERSAL_INTEGRITY_INVALID',
  'REVERSAL_REFERENCE_MISSING',
  'REVERSAL_PAYMENT_NOT_FOUND',
  'REVERSAL_TENANT_MISMATCH',
  'REVERSAL_CASE_MISMATCH',
  'REVERSAL_CURRENCY_MISMATCH',
  'REVERSAL_SIGN_INVALID',
  'REVERSAL_AMOUNT_MISMATCH',
  'REVERSAL_DUPLICATE',
]);
const CURRENCY_CODES = new Set(['CURRENCY_MISSING', 'CURRENCY_UNSUPPORTED', 'CURRENCY_MISMATCH']);
const RECOGNIZED_FATAL_CODES = new Set([
  'REVERSAL_INTEGRITY_INVALID',
  'NO_BUCKETS',
  'CURRENCY_MISSING',
  'CURRENCY_UNSUPPORTED',
]);

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

/** Canonical order: reversal → NO_BUCKETS → TBK100 → interest-base → currency/FX. */
export function buildCaseBalanceSnapshotReadiness(balance: CaseBalanceResult): CaseBalanceSnapshotReadiness {
  const fatalCodes = (balance.diagnostics?.fatal ?? []).map((diagnostic) => diagnostic.code);
  const paymentCodes = (balance.diagnostics?.payments ?? []).map((diagnostic) => diagnostic.code);
  const currencyCodes = (balance.diagnostics?.currency ?? []).map((diagnostic) => diagnostic.code);
  const perCurrencyCodes = (balance.diagnostics?.perCurrency ?? []).map((diagnostic) => diagnostic.code);
  const skippedReasons = (balance.currencyResults ?? [])
    .map((result) => result.skippedReason)
    .filter((reason): reason is NonNullable<typeof reason> => reason != null);
  const blockers: SnapshotReadinessBlocker[] = [];
  const finalDebtStateCurrencyMismatch = (balance.currencyResults ?? []).some((currencyResult) =>
    (currencyResult.result?.finalDebtStates ?? [])
      .some((state) => state.currency !== currencyResult.currency),
  );

  const reversalSourceCodes = uniqueSorted(
    [...fatalCodes, ...paymentCodes].filter((code) => REVERSAL_CODES.has(code)),
  );
  if (reversalSourceCodes.length > 0) {
    blockers.push({
      code: 'REVERSAL_INTEGRITY',
      sourceCodes: reversalSourceCodes,
      message: 'Reversal kaniti gecersiz veya uyumsuz; snapshot/readiness fail-closed kalir.',
    });
  }

  const noBucketsSourceCodes = uniqueSorted([
    ...fatalCodes.filter((code) => code === 'NO_BUCKETS'),
    ...skippedReasons.filter((code) => code === 'NO_BUCKETS'),
  ]);
  if (noBucketsSourceCodes.length > 0) {
    blockers.push({
      code: 'NO_BUCKETS',
      sourceCodes: noBucketsSourceCodes,
      message: 'Odeme etkisi hesaplanabilir claim bucket ile eslesmiyor.',
    });
  }

  const tbk100SourceCodes = uniqueSorted(paymentCodes.filter((code) => code === 'ZERO_OR_NEGATIVE_PAYMENT'));
  if (tbk100SourceCodes.length > 0) {
    blockers.push({
      code: 'TBK100_ALLOCATION',
      sourceCodes: tbk100SourceCodes,
      message: 'Gecersiz odeme girdisi TBK100 tahsis kanitini kullanilamaz kiliyor.',
    });
  }

  const interestBaseSourceCodes = uniqueSorted([
    ...skippedReasons.filter((code) => code === 'ENGINE_ERROR'),
    ...perCurrencyCodes,
  ]);
  if (skippedReasons.includes('ENGINE_ERROR')) {
    blockers.push({
      code: 'INTEREST_BASE',
      sourceCodes: interestBaseSourceCodes.length > 0 ? interestBaseSourceCodes : ['ENGINE_ERROR'],
      message: 'Interest-base hesaplama sonucu uretilemedi; bos veya sifir basari fallback uygulanmaz.',
    });
  }

  const currencySourceCodes = uniqueSorted(
    [
      ...fatalCodes,
      ...currencyCodes,
      ...(finalDebtStateCurrencyMismatch ? ['FINAL_DEBT_STATES_CURRENCY_MISMATCH'] : []),
    ].filter((code) => CURRENCY_CODES.has(code) || code === 'FINAL_DEBT_STATES_CURRENCY_MISMATCH'),
  );
  if (currencySourceCodes.length > 0) {
    blockers.push({
      code: 'CURRENCY_INTEGRITY',
      sourceCodes: currencySourceCodes,
      message: 'Currency kaniti eksik veya uyumsuz; conversion ve authority promotion uygulanmaz.',
    });
  }

  const unclassifiedFatalCodes = uniqueSorted(
    fatalCodes.filter((code) => !RECOGNIZED_FATAL_CODES.has(code)),
  );
  if (unclassifiedFatalCodes.length > 0) {
    blockers.push({
      code: 'CASE_BALANCE_UNAVAILABLE',
      sourceCodes: unclassifiedFatalCodes,
      message: 'CaseBalance fatal diagnostic nedeniyle kullanilamaz.',
    });
  }

  return {
    status: blockers.length > 0 ? 'BLOCKED' : 'UNSAFE',
    snapshotAvailable: false,
    primaryDisplayEligible: false,
    blockers,
  };
}
