export const CANONICAL_SUMMARY_ROWS_CONTRACT_VERSION = 'canonical-summary-rows.shadow-status.v1' as const;

export const CANONICAL_SUMMARY_TARGET_ROW_IDS = [
  'tazminat',
  'komisyon',
  'takipOncesiFaiz',
] as const;

export type CanonicalSummaryRowId = typeof CANONICAL_SUMMARY_TARGET_ROW_IDS[number];

export type CanonicalSummaryRowStatus =
  | 'SUPPORTED'
  | 'NOT_APPLICABLE'
  | 'UNSUPPORTED'
  | 'ERROR';

export type CanonicalSummaryRowSourceAuthority =
  | 'CANONICAL'
  | 'LEGACY'
  | 'DERIVED'
  | 'UNKNOWN';

export type CanonicalSummaryRowAllocationCategory =
  | 'EXPENSE'
  | 'ACCRUED_INTEREST'
  | 'ATTORNEY_FEE'
  | 'OTHER_ANCILLARY'
  | 'PRINCIPAL'
  | 'OVERPAYMENT'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export type CanonicalSummaryRowTotalsParticipation =
  | 'INCLUDED'
  | 'EXCLUDED'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export type CanonicalSummaryDisplayTotalKey =
  | 'takipTutari'
  | 'toplamBorc'
  | 'sonBorc'
  | 'kalanBorc'
  | 'toplamTahsilat'
  | 'kalanAnapara';

export type CanonicalSummaryIncludedInTotals = Record<
  CanonicalSummaryDisplayTotalKey,
  CanonicalSummaryRowTotalsParticipation
>;

export interface CanonicalSummaryShadowStatusRowDiagnostic {
  code: 'CANONICAL_ROW_UNSUPPORTED';
  severity: 'BLOCKER';
}

export interface CanonicalSummaryShadowStatusRow {
  rowId: CanonicalSummaryRowId;
  labelKey: `accountSummary.${CanonicalSummaryRowId}`;
  amount: number | null;
  currency: string | null;
  status: CanonicalSummaryRowStatus;
  sourceAuthority: CanonicalSummaryRowSourceAuthority;
  includedInTotals: CanonicalSummaryIncludedInTotals;
  affectsPaymentAllocation: boolean;
  allocationCategory: CanonicalSummaryRowAllocationCategory;
  unsupportedReason: string;
  diagnostics: readonly CanonicalSummaryShadowStatusRowDiagnostic[];
  contractVersion: typeof CANONICAL_SUMMARY_ROWS_CONTRACT_VERSION;
  primaryEligible: boolean;
}

const UNSUPPORTED_TOTALS: CanonicalSummaryIncludedInTotals = {
  takipTutari: 'UNSUPPORTED',
  toplamBorc: 'UNSUPPORTED',
  sonBorc: 'UNSUPPORTED',
  kalanBorc: 'UNSUPPORTED',
  toplamTahsilat: 'EXCLUDED',
  kalanAnapara: 'EXCLUDED',
};

const UNSUPPORTED_REASONS: Record<CanonicalSummaryRowId, string> = {
  tazminat: 'Tazminat canonical row formula/legal provenance is not approved yet.',
  komisyon: 'Komisyon canonical row rate/source/legal basis is not approved yet.',
  takipOncesiFaiz: 'Takip oncesi faiz canonical basis and relation to accrued interest is not approved yet.',
};

const UNSUPPORTED_DIAGNOSTICS: readonly CanonicalSummaryShadowStatusRowDiagnostic[] = [
  { code: 'CANONICAL_ROW_UNSUPPORTED', severity: 'BLOCKER' },
];

function buildUnsupportedTargetRow(rowId: CanonicalSummaryRowId): CanonicalSummaryShadowStatusRow {
  return {
    rowId,
    labelKey: `accountSummary.${rowId}`,
    amount: null,
    currency: null,
    status: 'UNSUPPORTED',
    sourceAuthority: 'UNKNOWN',
    includedInTotals: { ...UNSUPPORTED_TOTALS },
    affectsPaymentAllocation: false,
    allocationCategory: 'UNSUPPORTED',
    unsupportedReason: UNSUPPORTED_REASONS[rowId],
    diagnostics: [...UNSUPPORTED_DIAGNOSTICS],
    contractVersion: CANONICAL_SUMMARY_ROWS_CONTRACT_VERSION,
    primaryEligible: false,
  };
}

export function buildCanonicalSummaryShadowStatusRows(): CanonicalSummaryShadowStatusRow[] {
  return CANONICAL_SUMMARY_TARGET_ROW_IDS.map(buildUnsupportedTargetRow);
}

export function isCanonicalSummaryShadowStatusRowPrimaryEligible(
  row: CanonicalSummaryShadowStatusRow,
): boolean {
  if (!row.primaryEligible) return false;
  if (row.status !== 'SUPPORTED' && row.status !== 'NOT_APPLICABLE') return false;
  if (row.sourceAuthority !== 'CANONICAL') return false;
  if (row.amount == null || !Number.isFinite(row.amount)) return false;
  if (row.allocationCategory === 'UNSUPPORTED' || row.allocationCategory === 'UNKNOWN') return false;
  return !Object.values(row.includedInTotals).some((participation) => participation === 'UNKNOWN');
}
