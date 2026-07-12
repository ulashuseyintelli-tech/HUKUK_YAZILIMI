import type {
  BalanceDisplayAuthority,
  BalanceDisplayDiagnostic,
  BalanceDisplayUnsafeSource,
  CaseBalanceDisplay,
} from '../interest-engine/orchestration/case-balance-display';
import type { CaseBalanceFeeProjection } from '../interest-engine/orchestration/case-balance-fee-projection';
import type {
  CaseBalanceExplainabilityTrace,
  NonOfficialCaseBalanceSnapshot,
} from '../interest-engine/orchestration/case-balance-explainability';
import type { CaseBalanceSnapshotReadiness } from '../interest-engine/orchestration/case-balance-snapshot-readiness';

export const CASE_CALCULATION_SUMMARY_COMPATIBILITY_VERSION =
  'adr014-pr10.case-calculation-summary.compatibility.v1' as const;

export const LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS = [
  'asilAlacak',
  'tazminat',
  'komisyon',
  'takipOncesiFaiz',
  'takipTutari',
  'basvurmaHarci',
  'vekaletHarci',
  'pesinHarc',
  'dosyaGideri',
  'tebligatGideri',
  'vekaletPulu',
  'icraMasraflari',
  'pesinHarcDahilTahsilHarci',
  'pesinHarcHaricTahsilHarci',
  'vekaletUcreti',
  'takipSonrasiFaiz',
  'toplamBorc',
  'sonBorc',
  'toplamTahsilat',
  'kalanBorc',
  'kalanAnapara',
] as const;

export type LegacyCalculationSummaryNumericField =
  typeof LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS[number];

export type CompatibilityFieldStatus = 'AVAILABLE' | 'NOT_CALCULATED' | 'UNAVAILABLE';

export interface LegacyCalculationSummaryCompatibilityInput
  extends Record<LegacyCalculationSummaryNumericField, number> {
  caseId: string;
  hesapTarihi: string;
}

export interface CompatibilityMappedField {
  status: CompatibilityFieldStatus;
  amount: number | null;
  currency: string | null;
  source: string;
  diagnosticCodes: string[];
}

export interface CompatibilityParityEntry {
  field: LegacyCalculationSummaryNumericField;
  legacyAmount: number;
  canonicalAmount: number | null;
  status: 'MATCH' | 'CONFLICT' | 'NOT_COMPARABLE';
  deltaCents: number | null;
}

export interface CompatibilityCurrencyResult {
  currency: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  grossPrincipal: number;
  remainingPrincipal: number | null;
  totalInterest: number | null;
  preEnforcementInterest: number | null;
  postEnforcementInterest: number | null;
  claimRemaining: number | null;
  allocatedPayment: number | null;
  skippedReason: string | null;
  interestReconciled: boolean | null;
}

export interface CaseCalculationSummaryCompatibilityDiagnostic {
  code:
    | 'CANONICAL_COMPATIBILITY_UNAVAILABLE'
    | 'CANONICAL_DISPLAY_BLOCKED'
    | 'LEGACY_CANONICAL_CONFLICT'
    | 'SCALAR_CONTRACT_MULTI_CURRENCY_UNAVAILABLE'
    | 'FEE_POLICY_NOT_CALCULATED';
  severity: 'INFO' | 'WARNING' | 'BLOCKER';
  details?: Record<string, unknown>;
}

export interface CanonicalCalculationSummaryCompatibilityEvidence {
  tenantId: string;
  caseId: string;
  asOfDate: string;
  source: CaseBalanceDisplay['source'];
  displayStatus: CaseBalanceDisplay['status'];
  displayAuthority: BalanceDisplayAuthority;
  currency: string;
  currencyResults: CompatibilityCurrencyResult[];
  costs: {
    amount: number;
    currency: null;
    scope: 'CASE_LEVEL_UNSCOPED';
  };
  ancillaries: {
    amount: number;
    currency: null;
    scope: 'CASE_LEVEL_UNSCOPED';
  };
  totals: CaseBalanceDisplay['totals'];
  feeProjection: CaseBalanceFeeProjection;
  readiness: CaseBalanceSnapshotReadiness;
  blockers: CaseBalanceSnapshotReadiness['blockers'];
  diagnostics: BalanceDisplayDiagnostic[];
  unsafeSources: BalanceDisplayUnsafeSource[];
  trace: CaseBalanceExplainabilityTrace;
  nonOfficialSnapshot: NonOfficialCaseBalanceSnapshot;
}

export interface CaseCalculationSummaryCompatibilityAdapter {
  contractVersion: typeof CASE_CALCULATION_SUMMARY_COMPATIBILITY_VERSION;
  mode: 'ADDITIVE_SHADOW_ONLY';
  status: 'AVAILABLE' | 'BLOCKED' | 'UNAVAILABLE';
  consumerSwitchAuthorized: false;
  primaryAuthorityPromoted: false;
  primaryDisplayEligible: false;
  legacyFieldsPreserved: true;
  mappedFields: Record<LegacyCalculationSummaryNumericField, CompatibilityMappedField>;
  parity: {
    status: 'MATCH' | 'PARTIAL' | 'CONFLICT' | 'UNAVAILABLE';
    entries: CompatibilityParityEntry[];
  };
  canonical: CanonicalCalculationSummaryCompatibilityEvidence | null;
  diagnostics: CaseCalculationSummaryCompatibilityDiagnostic[];
  unavailableReason?: 'CASE_BALANCE_SERVICE_UNAVAILABLE' | 'CANONICAL_COMPUTE_FAILED';
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const toCents = (value: number): number => Math.round((value + Number.EPSILON) * 100);

function unavailableField(
  status: Exclude<CompatibilityFieldStatus, 'AVAILABLE'>,
  source: string,
  diagnosticCode: string,
): CompatibilityMappedField {
  return {
    status,
    amount: null,
    currency: null,
    source,
    diagnosticCodes: [diagnosticCode],
  };
}

function availableField(amount: number | null, currency: string, source: string): CompatibilityMappedField {
  if (amount == null || !Number.isFinite(amount)) {
    return unavailableField('UNAVAILABLE', source, 'CANONICAL_VALUE_UNAVAILABLE');
  }
  return {
    status: 'AVAILABLE',
    amount: round2(amount),
    currency,
    source,
    diagnosticCodes: [],
  };
}

function feeFieldStatus(feeProjection: CaseBalanceFeeProjection): Exclude<CompatibilityFieldStatus, 'AVAILABLE'> {
  return feeProjection.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'NOT_CALCULATED';
}

function sumAvailableFeeLines(
  display: CaseBalanceDisplay,
  predicate: (line: CaseBalanceFeeProjection['groups'][number]['lines'][number]) => boolean,
): number | null {
  if (display.feeProjection.status !== 'AVAILABLE' || display.feeProjection.groups.length !== 1) return null;
  const lines = display.feeProjection.groups[0].lines.filter(predicate);
  if (lines.length === 0 || lines.some((line) => line.status !== 'AVAILABLE' || line.amount == null)) return null;
  return round2(lines.reduce((sum, line) => sum + (line.amount ?? 0), 0));
}

function buildMappedFields(display: CaseBalanceDisplay): Record<LegacyCalculationSummaryNumericField, CompatibilityMappedField> {
  const feeStatus = feeFieldStatus(display.feeProjection);
  const feeUnavailable = (code: string): CompatibilityMappedField =>
    unavailableField(feeStatus, 'FEE_PROJECTION', code);
  const unsupported = (code: string): CompatibilityMappedField =>
    unavailableField('NOT_CALCULATED', 'NO_APPROVED_CANONICAL_MAPPING', code);
  const scalarUnavailable = display.status === 'UNAVAILABLE'
    || display.currency === 'MULTI'
    || display.currency === 'UNKNOWN';

  if (scalarUnavailable) {
    return Object.fromEntries(
      LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS.map((field) => [
        field,
        unavailableField('UNAVAILABLE', 'CANONICAL_CASE_BALANCE_DISPLAY', 'SCALAR_MAPPING_UNAVAILABLE'),
      ]),
    ) as Record<LegacyCalculationSummaryNumericField, CompatibilityMappedField>;
  }

  const currency = display.currencies.find((entry) => entry.currency === display.currency);
  const costs = sumAvailableFeeLines(display, (line) => line.category === 'COST');
  const attorneyFee = sumAvailableFeeLines(display, (line) => line.code === 'VEKALET_UCRETI');
  const unavailableFeeCode = display.feeProjection.status === 'UNAVAILABLE'
    ? 'FEE_PROJECTION_UNAVAILABLE'
    : 'FEE_PROJECTION_NOT_CALCULATED';

  return {
    asilAlacak: availableField(currency?.grossPrincipal ?? null, display.currency, 'GROSS_PRINCIPAL'),
    tazminat: unsupported('CANONICAL_ROW_UNSUPPORTED'),
    komisyon: unsupported('CANONICAL_ROW_UNSUPPORTED'),
    takipOncesiFaiz: availableField(
      currency?.preEnforcementInterest ?? null,
      display.currency,
      'PRE_ENFORCEMENT_INTEREST',
    ),
    takipTutari: unsupported('DEPENDENT_COMPONENTS_NOT_CALCULATED'),
    basvurmaHarci: feeUnavailable(unavailableFeeCode),
    vekaletHarci: feeUnavailable(unavailableFeeCode),
    pesinHarc: feeUnavailable(unavailableFeeCode),
    dosyaGideri: feeUnavailable(unavailableFeeCode),
    tebligatGideri: feeUnavailable(unavailableFeeCode),
    vekaletPulu: feeUnavailable(unavailableFeeCode),
    icraMasraflari: costs == null
      ? feeUnavailable(unavailableFeeCode)
      : availableField(costs, display.currency, 'FEE_PROJECTION_COST_LINES'),
    pesinHarcDahilTahsilHarci: feeUnavailable(unavailableFeeCode),
    pesinHarcHaricTahsilHarci: feeUnavailable(unavailableFeeCode),
    vekaletUcreti: attorneyFee == null
      ? feeUnavailable(unavailableFeeCode)
      : availableField(attorneyFee, display.currency, 'FEE_PROJECTION_ATTORNEY_FEE_LINE'),
    takipSonrasiFaiz: availableField(
      currency?.postEnforcementInterest ?? null,
      display.currency,
      'POST_ENFORCEMENT_INTEREST',
    ),
    toplamBorc: availableField(display.totals.totalDebtAmount, display.currency, 'CANONICAL_TOTAL_DEBT'),
    sonBorc: feeUnavailable('COLLECTION_FEE_NOT_CALCULATED'),
    toplamTahsilat: availableField(
      display.totals.grossReceivedAmount,
      display.currency,
      'CANONICAL_GROSS_RECEIVED',
    ),
    kalanBorc: feeUnavailable('COLLECTION_FEE_NOT_CALCULATED'),
    kalanAnapara: availableField(
      currency?.remainingPrincipal ?? null,
      display.currency,
      'FINAL_DEBT_STATE_PRINCIPAL',
    ),
  };
}

function buildCurrencyResults(display: CaseBalanceDisplay): CompatibilityCurrencyResult[] {
  return display.currencies.map((entry) => {
    const available = !entry.skipped;
    const totalInterest = available ? entry.interest : null;
    const pre = available ? entry.preEnforcementInterest : null;
    const post = available ? entry.postEnforcementInterest : null;
    return {
      currency: entry.currency,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
      grossPrincipal: entry.grossPrincipal,
      remainingPrincipal: available ? entry.remainingPrincipal : null,
      totalInterest,
      preEnforcementInterest: pre,
      postEnforcementInterest: post,
      claimRemaining: available ? entry.claimRemaining : null,
      allocatedPayment: available ? entry.collected : null,
      skippedReason: entry.skippedReason,
      interestReconciled: totalInterest == null || pre == null || post == null
        ? null
        : toCents(pre) + toCents(post) === toCents(totalInterest),
    };
  });
}

function buildParity(
  legacy: LegacyCalculationSummaryCompatibilityInput,
  mappedFields: Record<LegacyCalculationSummaryNumericField, CompatibilityMappedField>,
): CaseCalculationSummaryCompatibilityAdapter['parity'] {
  const entries = LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS.map((field): CompatibilityParityEntry => {
    const mapped = mappedFields[field];
    if (mapped.status !== 'AVAILABLE' || mapped.amount == null) {
      return {
        field,
        legacyAmount: legacy[field],
        canonicalAmount: null,
        status: 'NOT_COMPARABLE',
        deltaCents: null,
      };
    }
    const deltaCents = toCents(mapped.amount) - toCents(legacy[field]);
    return {
      field,
      legacyAmount: legacy[field],
      canonicalAmount: mapped.amount,
      status: deltaCents === 0 ? 'MATCH' : 'CONFLICT',
      deltaCents,
    };
  });
  if (entries.some((entry) => entry.status === 'CONFLICT')) return { status: 'CONFLICT', entries };
  if (entries.some((entry) => entry.status === 'NOT_COMPARABLE')) return { status: 'PARTIAL', entries };
  return { status: 'MATCH', entries };
}

/**
 * ADR-014 PR-10 pure adapter. Legacy alanlari mutate etmez; yalniz mevcut
 * canonical display evidence'ini additive, typed ve shadow-only bir contracta map eder.
 */
export function buildCaseCalculationSummaryCompatibilityAdapter(input: {
  legacy: LegacyCalculationSummaryCompatibilityInput;
  display: CaseBalanceDisplay;
}): CaseCalculationSummaryCompatibilityAdapter {
  const mappedFields = buildMappedFields(input.display);
  const parity = buildParity(input.legacy, mappedFields);
  const diagnostics: CaseCalculationSummaryCompatibilityDiagnostic[] = [];
  if (input.display.status === 'UNAVAILABLE' || input.display.readiness.blockers.length > 0) {
    diagnostics.push({
      code: 'CANONICAL_DISPLAY_BLOCKED',
      severity: 'BLOCKER',
      details: { blockerCodes: input.display.readiness.blockers.map((blocker) => blocker.code) },
    });
  }
  if (input.display.currency === 'MULTI' || input.display.currency === 'UNKNOWN') {
    diagnostics.push({
      code: 'SCALAR_CONTRACT_MULTI_CURRENCY_UNAVAILABLE',
      severity: 'BLOCKER',
      details: { displayCurrency: input.display.currency },
    });
  }
  if (parity.status === 'CONFLICT') {
    diagnostics.push({
      code: 'LEGACY_CANONICAL_CONFLICT',
      severity: 'BLOCKER',
      details: {
        fields: parity.entries.filter((entry) => entry.status === 'CONFLICT').map((entry) => entry.field),
      },
    });
  }
  if (input.display.feeProjection.status !== 'AVAILABLE') {
    diagnostics.push({
      code: 'FEE_POLICY_NOT_CALCULATED',
      severity: 'WARNING',
      details: { feeProjectionStatus: input.display.feeProjection.status },
    });
  }

  const blocked = diagnostics.some((diagnostic) => diagnostic.severity === 'BLOCKER');
  return {
    contractVersion: CASE_CALCULATION_SUMMARY_COMPATIBILITY_VERSION,
    mode: 'ADDITIVE_SHADOW_ONLY',
    status: blocked ? 'BLOCKED' : 'AVAILABLE',
    consumerSwitchAuthorized: false,
    primaryAuthorityPromoted: false,
    primaryDisplayEligible: false,
    legacyFieldsPreserved: true,
    mappedFields,
    parity,
    canonical: {
      tenantId: input.display.tenantId,
      caseId: input.display.caseId,
      asOfDate: input.display.asOfDate,
      source: input.display.source,
      displayStatus: input.display.status,
      displayAuthority: input.display.authority,
      currency: input.display.currency,
      currencyResults: buildCurrencyResults(input.display),
      costs: { amount: input.display.costs, currency: null, scope: 'CASE_LEVEL_UNSCOPED' },
      ancillaries: { amount: input.display.ancillaries, currency: null, scope: 'CASE_LEVEL_UNSCOPED' },
      totals: input.display.totals,
      feeProjection: input.display.feeProjection,
      readiness: input.display.readiness,
      blockers: input.display.readiness.blockers,
      diagnostics: input.display.diagnostics,
      unsafeSources: input.display.unsafeSources ?? [],
      trace: input.display.trace,
      nonOfficialSnapshot: input.display.nonOfficialSnapshot,
    },
    diagnostics,
  };
}

export function buildUnavailableCaseCalculationSummaryCompatibilityAdapter(input: {
  reason: 'CASE_BALANCE_SERVICE_UNAVAILABLE' | 'CANONICAL_COMPUTE_FAILED';
}): CaseCalculationSummaryCompatibilityAdapter {
  const mappedFields = Object.fromEntries(
    LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS.map((field) => [
      field,
      unavailableField('UNAVAILABLE', 'CANONICAL_CASE_BALANCE_DISPLAY', input.reason),
    ]),
  ) as Record<LegacyCalculationSummaryNumericField, CompatibilityMappedField>;
  return {
    contractVersion: CASE_CALCULATION_SUMMARY_COMPATIBILITY_VERSION,
    mode: 'ADDITIVE_SHADOW_ONLY',
    status: 'UNAVAILABLE',
    consumerSwitchAuthorized: false,
    primaryAuthorityPromoted: false,
    primaryDisplayEligible: false,
    legacyFieldsPreserved: true,
    mappedFields,
    parity: { status: 'UNAVAILABLE', entries: [] },
    canonical: null,
    diagnostics: [{
      code: 'CANONICAL_COMPATIBILITY_UNAVAILABLE',
      severity: 'BLOCKER',
      details: { reason: input.reason },
    }],
    unavailableReason: input.reason,
  };
}
