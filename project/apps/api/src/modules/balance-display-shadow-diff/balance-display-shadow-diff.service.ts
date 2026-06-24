import { Injectable } from '@nestjs/common';
import { CaseService } from '../case/case.service';
import { CaseBalanceService } from '../interest-engine/orchestration/case-balance.service';
import type { CaseBalanceResult } from '../interest-engine/orchestration/case-balance.service';
import { toCaseBalanceDisplay } from '../interest-engine/orchestration/case-balance-display';
import type {
  CaseBalanceDisplay,
  BalanceDisplayBucket,
} from '../interest-engine/orchestration/case-balance-display';
import type {
  BalanceDisplayShadowDiffReport,
  ShadowAmountDiff,
  ShadowBucketDiff,
  ShadowDiffClassification,
  ShadowDiffBlocker,
  ShadowDiffDiagnostic,
  ShadowDiffIssue,
  ShadowDiffSeverity,
  ShadowDiffWarning,
  ShadowTotals,
} from './balance-display-shadow-diff.types';

const LEGACY_ENDPOINT = '/cases/:id/calculation-summary' as const;
const CANONICAL_DISPLAY_ENDPOINT = '/interest-engine/case/:caseId/balance/display' as const;
const MINOR_DELTA_PERCENT = 1;

type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

type LegacyCalculationSummary = Record<string, unknown> & {
  canonicalShadow?: Record<string, unknown>;
  faizSegmentleri?: {
    takipOncesi?: unknown[];
    takipSonrasi?: unknown[];
  };
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMinorUnits(value: number): bigint {
  const scaled = Number(`${value}e2`);
  const rounded = scaled >= 0 ? Math.round(scaled) : -Math.round(-scaled);
  return BigInt(rounded);
}

function fromMinorUnits(value: bigint): number {
  return Number(value) / 100;
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(typeof value === 'object' && value !== null ? (value as { toString(): string }).toString() : value);
  return Number.isFinite(n) ? n : null;
}

function numberField(source: Record<string, unknown> | undefined, key: string): number | null {
  if (!source) return null;
  return asNumber(source[key]);
}

function sumNumbers(...values: Array<number | null>): number | null {
  let seen = false;
  let total = 0;
  for (const value of values) {
    if (value != null) {
      seen = true;
      total += value;
    }
  }
  return seen ? round2(total) : null;
}

async function capture<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function classifyAmountDiff(
  legacyAmount: number | null,
  canonicalAmount: number | null,
): Pick<ShadowAmountDiff, 'classification' | 'delta' | 'deltaPercent' | 'status' | 'severity'> {
  if (legacyAmount == null && canonicalAmount == null) {
    return {
      classification: 'BLOCKER',
      delta: null,
      deltaPercent: null,
      status: 'NOT_COMPARABLE',
      severity: 'UNKNOWN_NEEDS_FOLLOWUP',
    };
  }
  if (legacyAmount == null) {
    return {
      classification: 'MISSING_LEGACY_FIELD',
      delta: null,
      deltaPercent: null,
      status: 'CANONICAL_ONLY',
      severity: 'YELLOW',
    };
  }
  if (canonicalAmount == null) {
    return {
      classification: 'MISSING_CANONICAL_FIELD',
      delta: null,
      deltaPercent: null,
      status: 'LEGACY_ONLY',
      severity: 'YELLOW',
    };
  }

  const legacyMinor = toMinorUnits(legacyAmount);
  const canonicalMinor = toMinorUnits(canonicalAmount);
  const deltaMinor = canonicalMinor - legacyMinor;
  const delta = fromMinorUnits(deltaMinor);
  const deltaPercent = legacyAmount !== 0 ? round2((delta / legacyAmount) * 100) : null;
  if (deltaMinor === BigInt(0)) {
    return {
      classification: 'EXACT_MATCH',
      delta,
      deltaPercent,
      status: 'MATCH',
      severity: 'GREEN',
    };
  }
  if (deltaPercent != null && Math.abs(deltaPercent) < MINOR_DELTA_PERCENT) {
    return {
      classification: 'EXPECTED_CANONICAL_DIVERGENCE',
      delta,
      deltaPercent,
      status: 'MINOR_DELTA',
      severity: 'YELLOW',
    };
  }
  return {
    classification: 'EXPECTED_CANONICAL_DIVERGENCE',
    delta,
    deltaPercent,
    status: 'MAJOR_DELTA',
    severity: 'RED',
  };
}

function amountDiff(input: {
  code: string;
  label: string;
  legacyField: string;
  canonicalField: string;
  legacyAmount: number | null;
  canonicalAmount: number | null;
  explanation: string;
  comparisonBlockedBy?: ShadowDiffClassification;
  classificationOverride?: ShadowDiffClassification;
  severityOverride?: ShadowDiffSeverity;
}): ShadowAmountDiff {
  const comparisonBlocked = Boolean(input.comparisonBlockedBy);
  const classified = input.comparisonBlockedBy
    ? {
        classification: input.comparisonBlockedBy,
        delta: null,
        deltaPercent: null,
        status: 'NOT_COMPARABLE' as const,
        severity: 'RED' as const,
      }
    : classifyAmountDiff(input.legacyAmount, input.canonicalAmount);
  return {
    code: input.code,
    label: input.label,
    classification: comparisonBlocked ? classified.classification : input.classificationOverride ?? classified.classification,
    legacyField: input.legacyField,
    canonicalField: input.canonicalField,
    legacyAmount: comparisonBlocked ? null : input.legacyAmount,
    canonicalAmount: comparisonBlocked ? null : input.canonicalAmount,
    delta: classified.delta,
    deltaPercent: classified.deltaPercent,
    status: classified.status,
    severity: comparisonBlocked ? classified.severity : input.severityOverride ?? classified.severity,
    explanation: input.explanation,
  };
}

function issue<T extends ShadowDiffIssue>(
  code: string,
  classification: ShadowDiffClassification,
  severity: T['severity'],
  message: string,
  details?: Record<string, unknown>,
): T {
  return {
    code,
    classification,
    severity,
    message,
    ...(details ? { details } : {}),
  } as T;
}

function legacyCurrency(legacy: LegacyCalculationSummary | undefined): string | null {
  const direct = typeof legacy?.currency === 'string' ? legacy.currency : null;
  const shadowCurrency =
    typeof legacy?.canonicalShadow?.legacyCurrency === 'string' ? String(legacy.canonicalShadow.legacyCurrency) : null;
  return direct ?? shadowCurrency;
}

function hasLegacyInterestStub(legacy: LegacyCalculationSummary): boolean {
  const pre = numberField(legacy, 'takipOncesiFaiz') ?? 0;
  const post = numberField(legacy, 'takipSonrasiFaiz') ?? 0;
  const preSegments = legacy.faizSegmentleri?.takipOncesi?.length ?? 0;
  const postSegments = legacy.faizSegmentleri?.takipSonrasi?.length ?? 0;
  return pre === 0 && post === 0 && preSegments === 0 && postSegments === 0;
}

function legacyDiagnostics(legacy: LegacyCalculationSummary | undefined, unavailableMessage?: string): string[] {
  if (!legacy) return unavailableMessage ? [`LEGACY_UNAVAILABLE:${unavailableMessage}`] : ['LEGACY_UNAVAILABLE'];
  const diagnostics = ['LEGACY_CALCULATION_SUMMARY_LIVE'];
  if (legacy.canonicalShadow) diagnostics.push('CANONICAL_SHADOW_PRESENT_NOT_USED_AS_SOURCE');
  if (hasLegacyInterestStub(legacy)) diagnostics.push('LEGACY_INTEREST_STUB_OR_EMPTY');
  return diagnostics;
}

function canonicalDiagnostics(display: CaseBalanceDisplay | undefined, unavailableMessage?: string): string[] {
  if (!display) return unavailableMessage ? [`CANONICAL_UNAVAILABLE:${unavailableMessage}`] : ['CANONICAL_UNAVAILABLE'];
  return display.diagnostics.map((diagnostic) => diagnostic.code);
}

function canonicalUnsafeSources(display: CaseBalanceDisplay | undefined): string[] {
  return (display?.unsafeSources ?? []).map((source) => source.code);
}

function findBucket(display: CaseBalanceDisplay | undefined, code: string): BalanceDisplayBucket | undefined {
  return display?.buckets.find((bucket) => bucket.code === code);
}

function bucketAmount(display: CaseBalanceDisplay | undefined, code: string): number | null {
  const bucket = findBucket(display, code);
  return bucket ? bucket.amount : null;
}

function buildLegacyTotals(legacy: LegacyCalculationSummary | undefined): ShadowTotals | undefined {
  if (!legacy) return undefined;
  const takipOncesiFaiz = numberField(legacy, 'takipOncesiFaiz');
  const takipSonrasiFaiz = numberField(legacy, 'takipSonrasiFaiz');
  const interestAmount = sumNumbers(takipOncesiFaiz, takipSonrasiFaiz);
  return {
    currency: legacyCurrency(legacy),
    totalDebtAmount: numberField(legacy, 'sonBorc'),
    totalPaidAmount: numberField(legacy, 'toplamTahsilat'),
    outstandingAmount: numberField(legacy, 'kalanBorc'),
    interestAmount,
    costsAmount: numberField(legacy, 'icraMasraflari'),
    attorneyFeeAmount: numberField(legacy, 'vekaletUcreti'),
    raw: {
      asilAlacak: numberField(legacy, 'asilAlacak'),
      takipOncesiFaiz,
      takipSonrasiFaiz,
      toplamBorc: numberField(legacy, 'toplamBorc'),
      sonBorc: numberField(legacy, 'sonBorc'),
      toplamTahsilat: numberField(legacy, 'toplamTahsilat'),
      kalanBorc: numberField(legacy, 'kalanBorc'),
      pesinHarcHaricTahsilHarci: numberField(legacy, 'pesinHarcHaricTahsilHarci'),
      icraMasraflari: numberField(legacy, 'icraMasraflari'),
      vekaletUcreti: numberField(legacy, 'vekaletUcreti'),
    },
  };
}

function buildCanonicalTotals(display: CaseBalanceDisplay | undefined): ShadowTotals | undefined {
  if (!display) return undefined;
  const interestAmount = bucketAmount(display, 'ACCRUED_INTEREST');
  const attorneyFeeAmount = bucketAmount(display, 'ATTORNEY_FEE');
  return {
    currency: display.currency,
    totalDebtAmount: display.totals.totalDebtAmount,
    totalPaidAmount: display.totals.totalPaidAmount,
    outstandingAmount: display.totals.outstandingAmount,
    interestAmount,
    costsAmount: display.costs,
    attorneyFeeAmount,
    heldOverpaymentAmount: display.totals.heldOverpaymentAmount,
    raw: {
      totalDebtAmount: display.totals.totalDebtAmount,
      totalPaidAmount: display.totals.totalPaidAmount,
      outstandingAmount: display.totals.outstandingAmount,
      heldOverpaymentAmount: display.totals.heldOverpaymentAmount,
      costs: display.costs,
      ancillaries: display.ancillaries,
      claimRemaining: sumNumbers(...display.currencies.map((currency) => currency.claimRemaining)),
    },
  };
}

function buildTotalDiffs(
  legacy?: ShadowTotals,
  canonical?: ShadowTotals,
  comparisonBlockedBy?: ShadowDiffClassification,
): ShadowAmountDiff[] {
  return [
    amountDiff({
      code: 'OUTSTANDING_DELTA',
      label: 'Legacy kalanBorc vs canonical outstandingAmount',
      legacyField: 'legacy.kalanBorc',
      canonicalField: 'canonical.totals.outstandingAmount',
      legacyAmount: legacy?.outstandingAmount ?? null,
      canonicalAmount: canonical?.outstandingAmount ?? null,
      explanation: 'Net bakiye benzeri iki alan yan yana raporlanır; scope farkları kapatılmaz.',
      comparisonBlockedBy,
    }),
    amountDiff({
      code: 'PAID_DELTA',
      label: 'Legacy toplamTahsilat vs canonical totalPaidAmount',
      legacyField: 'legacy.toplamTahsilat',
      canonicalField: 'canonical.totals.totalPaidAmount',
      legacyAmount: legacy?.totalPaidAmount ?? null,
      canonicalAmount: canonical?.totalPaidAmount ?? null,
      explanation: 'Legacy collections toplamı ile canonical payment mapper kaynağı farklı olabilir.',
      comparisonBlockedBy,
    }),
    amountDiff({
      code: 'INTEREST_DELTA',
      label: 'Legacy interest vs canonical accrued interest',
      legacyField: 'legacy.takipOncesiFaiz + legacy.takipSonrasiFaiz',
      canonicalField: 'canonical.bucket.ACCRUED_INTEREST',
      legacyAmount: legacy?.interestAmount ?? null,
      canonicalAmount: canonical?.interestAmount ?? null,
      explanation: 'Legacy faiz stub/empty olabilir; canonical brüt işlemiş faizi ayrı gösterir.',
      comparisonBlockedBy,
    }),
    amountDiff({
      code: 'COSTS_DELTA',
      label: 'Legacy icraMasraflari vs canonical costs',
      legacyField: 'legacy.icraMasraflari',
      canonicalField: 'canonical.costs',
      legacyAmount: legacy?.costsAmount ?? null,
      canonicalAmount: canonical?.costsAmount ?? null,
      explanation: 'Legacy masraf hesapları ile canonical case-level cost projection aynı otorite değildir.',
      comparisonBlockedBy,
    }),
    amountDiff({
      code: 'ATTORNEY_FEE_DELTA',
      label: 'Legacy vekaletUcreti vs canonical attorney fee',
      legacyField: 'legacy.vekaletUcreti',
      canonicalField: 'canonical.bucket.ATTORNEY_FEE',
      legacyAmount: legacy?.attorneyFeeAmount ?? null,
      canonicalAmount: canonical?.attorneyFeeAmount ?? null,
      explanation: 'Vekalet ücreti farkı cutover öncesi görünür kalmalıdır.',
      comparisonBlockedBy,
    }),
  ];
}

function buildBucketDiffs(
  legacy: LegacyCalculationSummary | undefined,
  display: CaseBalanceDisplay | undefined,
  comparisonBlockedBy?: ShadowDiffClassification,
): ShadowBucketDiff[] {
  const legacyInterest = legacy ? sumNumbers(numberField(legacy, 'takipOncesiFaiz'), numberField(legacy, 'takipSonrasiFaiz')) : null;
  const principalBucket = findBucket(display, 'PRINCIPAL');
  const principalAvailable = principalBucket?.displayable === true && principalBucket.amount != null;
  const specs: Array<{
    bucket: string;
    legacyField: string;
    canonicalField: string;
    legacyAmount: number | null;
    canonicalCode: string;
    explanation: string;
    classificationOverride?: ShadowDiffClassification;
    severityOverride?: ShadowDiffSeverity;
  }> = [
    {
      bucket: 'PRINCIPAL',
      legacyField: 'legacy.asilAlacak',
      canonicalField: 'canonical.bucket.PRINCIPAL',
      legacyAmount: legacy ? numberField(legacy, 'asilAlacak') : null,
      canonicalCode: 'PRINCIPAL',
      explanation: 'Canonical display PRINCIPAL kovasını yalnız finalDebtStates authority varsa doldurur; yoksa uydurmaz.',
      classificationOverride: principalAvailable ? undefined : 'MISSING_CANONICAL_FIELD',
      severityOverride: principalAvailable ? undefined : 'YELLOW',
    },
    {
      bucket: 'ACCRUED_INTEREST',
      legacyField: 'legacy.interest',
      canonicalField: 'canonical.bucket.ACCRUED_INTEREST',
      legacyAmount: legacyInterest,
      canonicalCode: 'ACCRUED_INTEREST',
      explanation: 'Legacy faiz stub olabilir; canonical faiz kanıtı ayrıca sınıflanır.',
    },
    {
      bucket: 'EXPENSE',
      legacyField: 'legacy.icraMasraflari',
      canonicalField: 'canonical.bucket.EXPENSE',
      legacyAmount: legacy ? numberField(legacy, 'icraMasraflari') : null,
      canonicalCode: 'EXPENSE',
      explanation: 'Masraf projection farkları hesap mantığına müdahale edilmeden raporlanır.',
    },
    {
      bucket: 'ATTORNEY_FEE',
      legacyField: 'legacy.vekaletUcreti',
      canonicalField: 'canonical.bucket.ATTORNEY_FEE',
      legacyAmount: legacy ? numberField(legacy, 'vekaletUcreti') : null,
      canonicalCode: 'ATTORNEY_FEE',
      explanation: 'Vekalet ücreti projection farkı cutover blocker adayıdır.',
    },
    {
      bucket: 'HELD_OVERPAYMENT',
      legacyField: 'legacy.none',
      canonicalField: 'canonical.bucket.HELD_OVERPAYMENT',
      legacyAmount: null,
      canonicalCode: 'HELD_OVERPAYMENT',
      explanation: 'HELD overpayment legacy borçtan düşülmez; canonical ayrı projection olarak taşır.',
      classificationOverride: 'EXPECTED_CANONICAL_DIVERGENCE',
      severityOverride: 'YELLOW',
    },
  ];

  return specs.map((spec) => {
    const bucket = findBucket(display, spec.canonicalCode);
    const diff = amountDiff({
      code: `${spec.bucket}_BUCKET_DELTA`,
      label: `${spec.bucket} bucket shadow diff`,
      legacyField: spec.legacyField,
      canonicalField: spec.canonicalField,
      legacyAmount: spec.legacyAmount,
      canonicalAmount: bucket?.amount ?? null,
      explanation: spec.explanation,
      comparisonBlockedBy,
      classificationOverride: spec.classificationOverride,
      severityOverride: spec.severityOverride,
    });
    return {
      ...diff,
      bucket: spec.bucket,
      canonicalDisplayable: bucket?.displayable ?? false,
    };
  });
}

function stringField(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' ? value : null;
}

function currencyMismatch(legacyCurrency: string | null, canonicalCurrency: string | null): boolean {
  return Boolean(
    legacyCurrency &&
      canonicalCurrency &&
      canonicalCurrency !== 'MULTI' &&
      canonicalCurrency !== 'UNKNOWN' &&
      legacyCurrency !== canonicalCurrency,
  );
}

function buildComparability(input: {
  tenantId: string;
  caseId: string;
  legacy?: LegacyCalculationSummary;
  legacyError?: string;
  display?: CaseBalanceDisplay;
  canonicalError?: string;
  legacyCurrency: string | null;
}): {
  blockers: ShadowDiffBlocker[];
  warnings: ShadowDiffWarning[];
  comparable: boolean;
  classification: ShadowDiffClassification;
  severity: ShadowDiffSeverity;
} {
  const blockers: ShadowDiffBlocker[] = [];
  const warnings: ShadowDiffWarning[] = [];
  const canonicalCurrency = input.display?.currency ?? null;
  const legacyCaseId = stringField(input.legacy, 'caseId');
  const legacyTenantId = stringField(input.legacy, 'tenantId');

  if (!input.legacy) {
    blockers.push(issue<ShadowDiffBlocker>(
      'LEGACY_UNAVAILABLE',
      'MISSING_LEGACY_FIELD',
      'RED',
      'Legacy calculation-summary üretilemedi.',
      { error: input.legacyError },
    ));
  }
  if (!input.display) {
    blockers.push(issue<ShadowDiffBlocker>(
      'CANONICAL_DISPLAY_UNAVAILABLE',
      'MISSING_CANONICAL_FIELD',
      'RED',
      'Canonical balance/display üretilemedi.',
      { error: input.canonicalError },
    ));
  }
  if (
    (legacyCaseId && legacyCaseId !== input.caseId) ||
    (legacyTenantId && legacyTenantId !== input.tenantId) ||
    (input.display && (input.display.caseId !== input.caseId || input.display.tenantId !== input.tenantId))
  ) {
    blockers.push(issue<ShadowDiffBlocker>(
      'CONTEXT_MISMATCH',
      'CONTEXT_MISMATCH',
      'RED',
      'Legacy/canonical response tenant veya case bağlamı request ile eşleşmiyor.',
      {
        requestedTenantId: input.tenantId,
        requestedCaseId: input.caseId,
        legacyTenantId,
        legacyCaseId,
        canonicalTenantId: input.display?.tenantId,
        canonicalCaseId: input.display?.caseId,
      },
    ));
  }
  if (input.display?.status === 'UNAVAILABLE') {
    blockers.push(issue<ShadowDiffBlocker>(
      'CANONICAL_DISPLAY_STATUS_UNAVAILABLE',
      'CANONICAL_UNSAFE',
      'RED',
      'Canonical display status UNAVAILABLE.',
      { unavailableReason: input.display.unavailableReason },
    ));
  }
  if (input.display?.authority === 'UNSAFE_FOR_PRIMARY_DISPLAY') {
    blockers.push(issue<ShadowDiffBlocker>(
      'CANONICAL_UNSAFE_FOR_PRIMARY_DISPLAY',
      'CANONICAL_UNSAFE',
      'RED',
      'Canonical display primary için unsafe işaretli.',
    ));
  }
  if (currencyMismatch(input.legacyCurrency, canonicalCurrency)) {
    blockers.push(issue<ShadowDiffBlocker>(
      'CURRENCY_MISMATCH',
      'CURRENCY_MISMATCH',
      'RED',
      'Legacy ve canonical para birimi farklı.',
      {
        legacyCurrency: input.legacyCurrency,
        canonicalCurrency,
      },
    ));
  }

  warnings.push(issue<ShadowDiffWarning>(
    'SOURCE_SCOPE_MISMATCH',
    'EXPECTED_CANONICAL_DIVERGENCE',
    'YELLOW',
    'Legacy DTO ve canonical display aynı scope değildir; farklar normalize edilmez.',
  ));
  if (input.legacy?.canonicalShadow) {
    warnings.push(issue<ShadowDiffWarning>(
      'CANONICAL_SHADOW_PRESENT_NOT_USED_AS_SOURCE',
      'LEGACY_AUTHORITY_RISK',
      'YELLOW',
      'Legacy canonicalShadow yalnız provenance/diagnostic; canonical source değildir.',
    ));
  }
  if (input.legacy && hasLegacyInterestStub(input.legacy)) {
    warnings.push(issue<ShadowDiffWarning>(
      'LEGACY_INTEREST_STUB_OR_EMPTY',
      'LEGACY_STUB',
      'YELLOW',
      'Legacy faiz alanları 0/empty stub görünüyor.',
    ));
  }
  if (canonicalCurrency === 'MULTI' || canonicalCurrency === 'UNKNOWN') {
    blockers.push(issue<ShadowDiffBlocker>(
      'CANONICAL_CURRENCY_UNSAFE',
      'CANONICAL_UNSAFE',
      'RED',
      'Canonical display top-level currency primary display ve amount comparison icin guvenli degil.',
      { canonicalCurrency },
    ));
  }
  if (input.display?.diagnostics.some((diagnostic) => diagnostic.code === 'FINAL_DEBT_STATES_MISSING')) {
    warnings.push(issue<ShadowDiffWarning>(
      'FINAL_DEBT_STATES_MISSING',
      'MISSING_CANONICAL_FIELD',
      'YELLOW',
      'Standalone principal/outstanding kırılımı için finalDebtStates yok.',
    ));
  }
  if (input.display?.diagnostics.some((diagnostic) => diagnostic.code === 'OVERPAYMENT_BLOCKED')) {
    warnings.push(issue<ShadowDiffWarning>(
      'OVERPAYMENT_BLOCKED',
      'CANONICAL_UNSAFE',
      'YELLOW',
      'Blocked overpayment diagnostic display contract üzerinde görünür.',
    ));
  }

  const firstBlocker = blockers[0];
  return {
    blockers,
    warnings,
    comparable: blockers.length === 0,
    classification: firstBlocker?.classification ?? 'EXPECTED_CANONICAL_DIVERGENCE',
    severity: firstBlocker?.severity ?? 'YELLOW',
  };
}

function classificationForDiagnosticCode(code: string): ShadowDiffClassification {
  if (code === 'LEGACY_INTEREST_STUB_OR_EMPTY' || code === 'INTEREST_STUB_OR_EMPTY') {
    return 'LEGACY_STUB';
  }
  if (
    code === 'LEGACY_CALCULATION_SUMMARY_LIVE' ||
    code === 'CANONICAL_SHADOW_PRESENT_NOT_USED_AS_SOURCE' ||
    code === 'CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY'
  ) {
    return 'LEGACY_AUTHORITY_RISK';
  }
  if (
    code === 'FINAL_DEBT_STATES_MISSING' ||
    code === 'FINAL_DEBT_STATES_CURRENCY_MISMATCH' ||
    code === 'CANONICAL_UNAVAILABLE' ||
    code === 'CANONICAL_DISPLAY_UNAVAILABLE'
  ) {
    return 'MISSING_CANONICAL_FIELD';
  }
  if (
    code === 'OVERPAYMENT_BLOCKED' ||
    code === 'RESTRICTED_PAYMENT_DISPLAY_UNSAFE' ||
    code === 'NAFAKA_PRINCIPAL_DISPLAY_RISK' ||
    code === 'MULTI_CURRENCY_DISPLAY_UNSAFE' ||
    code === 'CANONICAL_CURRENCY_UNSAFE'
  ) {
    return 'CANONICAL_UNSAFE';
  }
  if (code === 'LEGACY_UNAVAILABLE') {
    return 'MISSING_LEGACY_FIELD';
  }
  if (code === 'CURRENCY_MISMATCH') {
    return 'CURRENCY_MISMATCH';
  }
  if (code === 'CONTEXT_MISMATCH') {
    return 'CONTEXT_MISMATCH';
  }
  return 'EXPECTED_CANONICAL_DIVERGENCE';
}

function allDiagnostics(input: {
  blockers: ShadowDiffBlocker[];
  warnings: ShadowDiffWarning[];
  legacyDiagnostics: string[];
  canonicalDiagnostics: string[];
  totalDiffs: ShadowAmountDiff[];
  bucketDiffs: ShadowBucketDiff[];
}): ShadowDiffDiagnostic[] {
  const diagnostics: ShadowDiffDiagnostic[] = [...input.blockers, ...input.warnings];
  for (const code of input.legacyDiagnostics) {
    const baseCode = code.split(':')[0];
    diagnostics.push(issue<ShadowDiffDiagnostic>(
      baseCode,
      classificationForDiagnosticCode(baseCode),
      'YELLOW',
      `Legacy source diagnostic: ${code}`,
    ));
  }
  for (const code of input.canonicalDiagnostics) {
    const baseCode = code.split(':')[0];
    diagnostics.push(issue<ShadowDiffDiagnostic>(
      baseCode,
      classificationForDiagnosticCode(baseCode),
      baseCode === 'FINAL_DEBT_STATES_MISSING' ? 'RED' : 'YELLOW',
      `Canonical display diagnostic: ${code}`,
    ));
  }
  for (const diff of [...input.totalDiffs, ...input.bucketDiffs]) {
    if (diff.status !== 'MATCH') {
      diagnostics.push(issue<ShadowDiffDiagnostic>(
        diff.code,
        diff.classification,
        diff.severity,
        diff.explanation,
        {
          status: diff.status,
          delta: diff.delta,
          deltaPercent: diff.deltaPercent,
        },
      ));
    }
  }
  return diagnostics;
}

function cutoverReadiness(input: {
  display?: CaseBalanceDisplay;
  blockers: ShadowDiffBlocker[];
  totalDiffs: ShadowAmountDiff[];
  bucketDiffs: ShadowBucketDiff[];
}): BalanceDisplayShadowDiffReport['cutoverReadiness'] {
  const diffBlockers = [...input.totalDiffs, ...input.bucketDiffs]
    .filter((diff) => diff.severity === 'RED')
    .map((diff) => diff.code);
  const blockerCodes = [...input.blockers.map((blocker) => blocker.code), ...diffBlockers];
  if (input.display?.diagnostics.some((diagnostic) => diagnostic.code === 'FINAL_DEBT_STATES_MISSING')) {
    blockerCodes.push('FINAL_DEBT_STATES_MISSING');
  }
  if (input.display?.diagnostics.some((diagnostic) => diagnostic.code === 'FINAL_DEBT_STATES_CURRENCY_MISMATCH')) {
    blockerCodes.push('FINAL_DEBT_STATES_CURRENCY_MISMATCH');
  }
  if (input.display?.diagnostics.some((diagnostic) => diagnostic.code === 'OVERPAYMENT_BLOCKED')) {
    blockerCodes.push('OVERPAYMENT_BLOCKED');
  }
  if (input.display?.diagnostics.some((diagnostic) => diagnostic.code === 'NAFAKA_PRINCIPAL_DISPLAY_RISK')) {
    blockerCodes.push('NAFAKA_PRINCIPAL_DISPLAY_RISK');
  }

  const optInShadowBlockers = new Set([
    'LEGACY_UNAVAILABLE',
    'CANONICAL_DISPLAY_UNAVAILABLE',
    'CANONICAL_DISPLAY_STATUS_UNAVAILABLE',
    'CANONICAL_UNSAFE_FOR_PRIMARY_DISPLAY',
    'CANONICAL_CURRENCY_UNSAFE',
    'CURRENCY_MISMATCH',
    'CONTEXT_MISMATCH',
  ]);

  return {
    safeForPrimaryDisplay: blockerCodes.length === 0,
    safeForOptInShadow: Boolean(input.display) && input.blockers.every((blocker) => !optInShadowBlockers.has(blocker.code)),
    blockers: [...new Set(blockerCodes)],
    nextRequiredEvidence: [
      'Legacy/canonical fixture coverage: genel ilamsiz, kambiyo, kira, nafaka, ilam, fatura, rehin/ipotek.',
      'finalDebtStates veya equivalent principal/outstanding contract olmadan primary cutover yapma.',
      'HELD/BLOCKED overpayment UI metni ve avukat sign-off.',
      'Multi-currency costs/ancillaries projection karar testi.',
    ],
  };
}

@Injectable()
export class BalanceDisplayShadowDiffService {
  constructor(
    private readonly caseService: CaseService,
    private readonly caseBalance: CaseBalanceService,
  ) {}

  /**
   * Legacy calculation-summary DTO ile hardened balance/display DTO'sunu yan yana üretir.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - BalanceDisplayShadowDiffController.getShadowDiff() → GET /interest-engine/case/:caseId/balance/display/shadow-diff (read-only shadow evidence)
   * </remarks>
   */
  async compare(
    tenantId: string,
    caseId: string,
    asOfDate: string,
    generatedAt: string,
  ): Promise<BalanceDisplayShadowDiffReport> {
    const [legacyOutcome, balanceOutcome] = await Promise.all([
      capture(() => this.caseService.getCalculationSummary(tenantId, caseId, asOfDate) as Promise<LegacyCalculationSummary>),
      capture(() => this.caseBalance.computeCaseBalance(tenantId, caseId, asOfDate)),
    ]);

    const legacy = legacyOutcome.ok ? legacyOutcome.value : undefined;
    const balance: CaseBalanceResult | undefined = balanceOutcome.ok ? balanceOutcome.value : undefined;
    const display = balance ? toCaseBalanceDisplay({ tenantId, caseId, balance, generatedAt }) : undefined;

    const legacyDiag = legacyDiagnostics(legacy, legacyOutcome.ok ? undefined : legacyOutcome.message);
    const canonicalDiag = canonicalDiagnostics(display, balanceOutcome.ok ? undefined : balanceOutcome.message);
    const legacyTotals = buildLegacyTotals(legacy);
    const canonicalTotals = buildCanonicalTotals(display);
    const compare = buildComparability({
      tenantId,
      caseId,
      legacy,
      legacyError: legacyOutcome.ok ? undefined : legacyOutcome.message,
      display,
      canonicalError: balanceOutcome.ok ? undefined : balanceOutcome.message,
      legacyCurrency: legacyTotals?.currency ?? null,
    });
    const comparisonBlockedBy = compare.blockers.find((blocker) =>
      blocker.classification === 'CURRENCY_MISMATCH' ||
      blocker.classification === 'CONTEXT_MISMATCH' ||
      blocker.code === 'CANONICAL_CURRENCY_UNSAFE' ||
      blocker.code === 'CANONICAL_DISPLAY_UNAVAILABLE' ||
      blocker.code === 'CANONICAL_DISPLAY_STATUS_UNAVAILABLE' ||
      blocker.code === 'CANONICAL_UNSAFE_FOR_PRIMARY_DISPLAY',
    )?.classification;
    const totalDiffs = buildTotalDiffs(legacyTotals, canonicalTotals, comparisonBlockedBy);
    const bucketDiffs = buildBucketDiffs(legacy, display, comparisonBlockedBy);
    const diagnostics = allDiagnostics({
      blockers: compare.blockers,
      warnings: compare.warnings,
      legacyDiagnostics: legacyDiag,
      canonicalDiagnostics: canonicalDiag,
      totalDiffs,
      bucketDiffs,
    });
    const readiness = cutoverReadiness({
      display,
      blockers: compare.blockers,
      totalDiffs,
      bucketDiffs,
    });

    return {
      tenantId,
      caseId,
      currency: display?.currency ?? legacyTotals?.currency ?? null,
      generatedAt,
      sourceVersion: display?.sourceVersion ?? 'balance-display:unavailable',
      mode: 'SHADOW_ONLY',
      primaryDisplayUnchanged: true,
      sources: {
        legacyCalculationSummary: {
          available: Boolean(legacy),
          endpoint: LEGACY_ENDPOINT,
          authority: 'LEGACY_DISPLAY',
          diagnostics: legacyDiag,
        },
        canonicalBalanceDisplay: {
          available: Boolean(display),
          endpoint: CANONICAL_DISPLAY_ENDPOINT,
          authority: display?.authority ?? 'UNAVAILABLE',
          diagnostics: canonicalDiag,
          unsafeSources: canonicalUnsafeSources(display),
        },
      },
      comparability: compare,
      totals: {
        ...(legacyTotals ? { legacy: legacyTotals } : {}),
        ...(canonicalTotals ? { canonical: canonicalTotals } : {}),
        diffs: totalDiffs,
      },
      bucketDiffs,
      diagnostics,
      cutoverReadiness: readiness,
      provenance: {
        legacyCalculationSummaryUsed: Boolean(legacy),
        canonicalBalanceDisplayUsed: Boolean(display),
        computeBalanceUsed: display?.provenance.computeBalanceUsed ?? Boolean(balance),
        finalDebtStatesAvailable: display?.provenance.finalDebtStatesAvailable ?? false,
        claimItemCollectedAmountUsedAsAuthority: display?.provenance.claimItemCollectedAmountUsedAsAuthority ?? false,
        overpaymentHeldAvailable: display?.provenance.overpaymentProjectionUsed ?? false,
        blockedOverpaymentDiagnosticsAvailable: display?.provenance.blockedOverpaymentDiagnosticsUsed ?? false,
      },
    };
  }
}
