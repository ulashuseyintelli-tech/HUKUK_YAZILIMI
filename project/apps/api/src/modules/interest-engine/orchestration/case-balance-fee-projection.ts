import type { ClaimItemProjectionSource } from '../assembler/claim-bucket-assembler';
import { fromCents, toCents } from '../allocation/minor-unit';
import { isSupportedCurrency } from '../types/common.types';

export type FeeProjectionStatus = 'AVAILABLE' | 'NOT_CALCULATED' | 'UNAVAILABLE';
export type FeeProjectionDiagnosticCode =
  | 'FEE_PROJECTION_NOT_CALCULATED'
  | 'FEE_PROJECTION_SOURCE_AMOUNT_INVALID'
  | 'FEE_PROJECTION_CURRENCY_MISSING'
  | 'FEE_PROJECTION_CURRENCY_UNSUPPORTED'
  | 'FEE_PROJECTION_CURRENCY_MISMATCH'
  | 'FEE_PROJECTION_LEGAL_BALANCE_BLOCKED'
  | 'FEE_PROJECTION_CROSS_CURRENCY_TOTAL_FORBIDDEN'
  | 'FEE_POLICY_OWNER_GATED';

export interface FeeProjectionDiagnostic {
  code: FeeProjectionDiagnosticCode;
  severity: 'INFO' | 'WARNING' | 'BLOCKER';
  message: string;
  details?: Record<string, unknown>;
}

export interface FeeProjectionLine {
  sourceItemId: string;
  itemType: string;
  category: 'COST' | 'ANCILLARY';
  code: ClaimItemProjectionSource['code'];
  amount: number | null;
  currency: string;
  source: 'PERSISTED_CLAIM_ITEM';
  status: 'AVAILABLE' | 'UNAVAILABLE';
  diagnosticCodes?: FeeProjectionDiagnosticCode[];
}

export interface FeeProjectionCurrencyGroup {
  currency: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  totalProjectedAmount: number | null;
  lines: FeeProjectionLine[];
  diagnosticCodes?: FeeProjectionDiagnosticCode[];
}

/**
 * ADR-014 PR-7 DTO. It transports persisted source projection only; it never
 * calculates a fee/harc, converts currency, persists a snapshot or promotes authority.
 */
export interface CaseBalanceFeeProjection {
  status: FeeProjectionStatus;
  authority: 'SOURCE_PROJECTION_ONLY' | 'UNAVAILABLE';
  policyStatus: 'OWNER_GATED';
  aggregation: 'PER_CURRENCY_ONLY';
  currency: string | null;
  totalProjectedAmount: number | null;
  groups: FeeProjectionCurrencyGroup[];
  diagnostics: FeeProjectionDiagnostic[];
}

export interface BuildCaseBalanceFeeProjectionInput {
  sourceItems: ClaimItemProjectionSource[];
  currencyResults: Array<{
    currency: string;
    resultAvailable: boolean;
    skippedReason?: string;
  }>;
  globalBlockerCodes?: string[];
}

const ISSUE_ORDER: FeeProjectionDiagnosticCode[] = [
  'FEE_PROJECTION_SOURCE_AMOUNT_INVALID',
  'FEE_PROJECTION_CURRENCY_MISSING',
  'FEE_PROJECTION_CURRENCY_UNSUPPORTED',
  'FEE_PROJECTION_CURRENCY_MISMATCH',
  'FEE_PROJECTION_LEGAL_BALANCE_BLOCKED',
];

function evidenceCurrency(currency: string): string {
  return currency.trim().length === 0 ? 'UNKNOWN' : currency;
}

function compareSourceItems(a: ClaimItemProjectionSource, b: ClaimItemProjectionSource): number {
  return evidenceCurrency(a.currency).localeCompare(evidenceCurrency(b.currency))
    || a.sourceItemId.localeCompare(b.sourceItemId)
    || a.code.localeCompare(b.code);
}

function orderedIssues(issues: Set<FeeProjectionDiagnosticCode>): FeeProjectionDiagnosticCode[] {
  return ISSUE_ORDER.filter((code) => issues.has(code));
}

function groupMessage(code: FeeProjectionDiagnosticCode): string {
  switch (code) {
    case 'FEE_PROJECTION_SOURCE_AMOUNT_INVALID':
      return 'Projection source amount is missing, non-positive or non-finite; no amount is emitted.';
    case 'FEE_PROJECTION_CURRENCY_MISSING':
      return 'Projection source currency is missing; no fallback currency is assumed.';
    case 'FEE_PROJECTION_CURRENCY_UNSUPPORTED':
      return 'Projection source currency is outside the canonical supported domain; no conversion is applied.';
    case 'FEE_PROJECTION_CURRENCY_MISMATCH':
      return 'Projection currency has no matching calculated claim currency; cross-currency attachment is forbidden.';
    case 'FEE_PROJECTION_LEGAL_BALANCE_BLOCKED':
      return 'Legal balance blockers make this source projection unavailable for display authority.';
    default:
      return code;
  }
}

/** Pure mapper from persisted ClaimItem projection evidence to a fail-closed DTO. */
export function buildCaseBalanceFeeProjection(
  input: BuildCaseBalanceFeeProjectionInput,
): CaseBalanceFeeProjection {
  const diagnostics: FeeProjectionDiagnostic[] = [
    {
      code: 'FEE_POLICY_OWNER_GATED',
      severity: 'INFO',
      message: 'Fee/harc formula and policy are owner-gated; this DTO carries persisted source projection only.',
    },
  ];
  const globalBlockerCodes = [...new Set(input.globalBlockerCodes ?? [])].sort();
  const calculatedCurrencies = new Set(
    input.currencyResults
      .filter((row) => row.resultAvailable && isSupportedCurrency(evidenceCurrency(row.currency)))
      .map((row) => evidenceCurrency(row.currency)),
  );
  const skippedByCurrency = new Map(
    input.currencyResults
      .filter((row) => !row.resultAvailable)
      .map((row) => [evidenceCurrency(row.currency), row.skippedReason ?? 'UNAVAILABLE']),
  );

  const byCurrency = new Map<string, ClaimItemProjectionSource[]>();
  for (const item of [...input.sourceItems].sort(compareSourceItems)) {
    const currency = evidenceCurrency(item.currency);
    const group = byCurrency.get(currency) ?? [];
    group.push(item);
    byCurrency.set(currency, group);
  }

  const groups: FeeProjectionCurrencyGroup[] = [];
  for (const currency of [...byCurrency.keys()].sort()) {
    const sourceItems = byCurrency.get(currency) ?? [];
    const issues = new Set<FeeProjectionDiagnosticCode>();
    if (sourceItems.some((item) =>
      item.sourceStatus !== 'AVAILABLE' || !Number.isFinite(item.amount) || item.amount <= 0)) {
      issues.add('FEE_PROJECTION_SOURCE_AMOUNT_INVALID');
    }
    if (currency === 'UNKNOWN') {
      issues.add('FEE_PROJECTION_CURRENCY_MISSING');
    } else if (!isSupportedCurrency(currency)) {
      issues.add('FEE_PROJECTION_CURRENCY_UNSUPPORTED');
    } else if (!calculatedCurrencies.has(currency)) {
      issues.add('FEE_PROJECTION_CURRENCY_MISMATCH');
    }
    if (globalBlockerCodes.length > 0 || skippedByCurrency.has(currency)) {
      issues.add('FEE_PROJECTION_LEGAL_BALANCE_BLOCKED');
    }

    const diagnosticCodes = orderedIssues(issues);
    const available = diagnosticCodes.length === 0;
    const lines: FeeProjectionLine[] = sourceItems.map((item) => ({
      sourceItemId: item.sourceItemId,
      itemType: item.itemType,
      category: item.category,
      code: item.code,
      amount: available ? fromCents(toCents(item.amount)) : null,
      currency,
      source: 'PERSISTED_CLAIM_ITEM',
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
      ...(available ? {} : { diagnosticCodes }),
    }));
    const totalProjectedAmount = available
      ? fromCents(lines.reduce((sum, line) => sum + toCents(line.amount ?? 0), 0n))
      : null;

    groups.push({
      currency,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
      totalProjectedAmount,
      lines,
      ...(available ? {} : { diagnosticCodes }),
    });

    for (const code of diagnosticCodes) {
      diagnostics.push({
        code,
        severity: 'BLOCKER',
        message: groupMessage(code),
        details: {
          currency,
          sourceItemIds: sourceItems.map((item) => item.sourceItemId),
          ...(code === 'FEE_PROJECTION_LEGAL_BALANCE_BLOCKED'
            ? {
              globalBlockerCodes,
              ...(skippedByCurrency.has(currency)
                ? { skippedReason: skippedByCurrency.get(currency) }
                : {}),
            }
            : {}),
        },
      });
    }
  }

  if (groups.length === 0) {
    if (globalBlockerCodes.length > 0) {
      diagnostics.push({
        code: 'FEE_PROJECTION_LEGAL_BALANCE_BLOCKED',
        severity: 'BLOCKER',
        message: groupMessage('FEE_PROJECTION_LEGAL_BALANCE_BLOCKED'),
        details: { globalBlockerCodes },
      });
      return {
        status: 'UNAVAILABLE',
        authority: 'UNAVAILABLE',
        policyStatus: 'OWNER_GATED',
        aggregation: 'PER_CURRENCY_ONLY',
        currency: null,
        totalProjectedAmount: null,
        groups,
        diagnostics,
      };
    }
    diagnostics.push({
      code: 'FEE_PROJECTION_NOT_CALCULATED',
      severity: 'WARNING',
      message: 'No persisted fee/cost projection source is available; zero is not assumed.',
    });
    return {
      status: 'NOT_CALCULATED',
      authority: 'UNAVAILABLE',
      policyStatus: 'OWNER_GATED',
      aggregation: 'PER_CURRENCY_ONLY',
      currency: null,
      totalProjectedAmount: null,
      groups,
      diagnostics,
    };
  }

  const unavailable = groups.some((group) => group.status === 'UNAVAILABLE');
  const singleGroup = groups.length === 1 ? groups[0] : null;
  if (groups.length > 1) {
    diagnostics.push({
      code: 'FEE_PROJECTION_CROSS_CURRENCY_TOTAL_FORBIDDEN',
      severity: 'INFO',
      message: 'Projection groups remain per currency; no cross-currency total or conversion is produced.',
      details: { currencies: groups.map((group) => group.currency) },
    });
  }

  return {
    status: unavailable ? 'UNAVAILABLE' : 'AVAILABLE',
    authority: unavailable ? 'UNAVAILABLE' : 'SOURCE_PROJECTION_ONLY',
    policyStatus: 'OWNER_GATED',
    aggregation: 'PER_CURRENCY_ONLY',
    currency: singleGroup?.currency ?? null,
    totalProjectedAmount: singleGroup?.status === 'AVAILABLE'
      ? singleGroup.totalProjectedAmount
      : null,
    groups,
    diagnostics,
  };
}
