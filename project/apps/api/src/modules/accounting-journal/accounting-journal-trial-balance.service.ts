import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccountingAccountCode,
  AccountingJournalDirection,
  AccountingJournalSourceType,
} from './accounting-journal.types';
import type {
  AccountingJournalTrialBalanceCurrencyTotal,
  AccountingJournalTrialBalanceDiagnostics,
  AccountingJournalTrialBalanceEvidenceStatus,
  AccountingJournalTrialBalanceFilters,
  AccountingJournalTrialBalanceReport,
  AccountingJournalTrialBalanceReconciliationEvidence,
  AccountingJournalTrialBalanceReconciliationWarning,
  AccountingJournalTrialBalanceRow,
  AccountingJournalTrialBalanceSourceBreakdown,
  AccountingJournalTrialBalanceSourceCoverage,
  AccountingJournalTrialBalanceUnbalancedCurrency,
  AccountingJournalTrialBalanceWarningCode,
} from './accounting-journal-trial-balance.types';

interface AggregateAmountGroup {
  direction: AccountingJournalDirection;
  currency: string;
  _sum: { amount: Prisma.Decimal | null };
  _count: { _all: number };
}

type AccountAggregateGroup = AggregateAmountGroup & {
  accountCode: AccountingAccountCode;
};

type SourceAggregateGroup = AggregateAmountGroup & {
  journalEntryId: string;
};

type SourceEntryRow = {
  id: string;
  sourceType: AccountingJournalSourceType;
  sourceAction: string;
};

interface SourceEvidenceResult {
  sourceBreakdown: AccountingJournalTrialBalanceSourceBreakdown[];
  sourceCoverage: AccountingJournalTrialBalanceSourceCoverage[];
  missingSourceEntryCount: number;
  missingSourceLineCount: number;
}

interface MutableTotal {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  lineCount: number;
}

interface MutableSourceCoverage {
  entryIds: Set<string>;
  lineCount: number;
  currencies: Set<string>;
}

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class AccountingJournalTrialBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalTrialBalanceController.getTrialBalance() -> GET /accounting-journal/trial-balance (read-only admin diagnostic evidence).
  /// - AccountingJournalTrialBalanceService tests -> read-only Trial Balance read model and reconciliation evidence seam.
  /// </remarks>
  async getTrialBalance(filters: AccountingJournalTrialBalanceFilters): Promise<AccountingJournalTrialBalanceReport> {
    const normalizedFilters = normalizeFilters(filters);
    const where = this.buildWhere(normalizedFilters);

    const [accountGroups, sourceGroups] = await Promise.all([
      this.prisma.accountingJournalLine.groupBy({
        by: ['accountCode', 'currency', 'direction'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: [{ accountCode: 'asc' }, { currency: 'asc' }, { direction: 'asc' }],
      }),
      this.prisma.accountingJournalLine.groupBy({
        by: ['journalEntryId', 'currency', 'direction'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: [{ journalEntryId: 'asc' }, { currency: 'asc' }, { direction: 'asc' }],
      }),
    ]);

    const accountAggregateGroups = accountGroups as AccountAggregateGroup[];
    const sourceAggregateGroups = sourceGroups as SourceAggregateGroup[];
    const rows = rowsFromAccountGroups(accountAggregateGroups);
    const totals = totalsFromAccountGroups(accountAggregateGroups);
    const sourceEvidence = await this.sourceEvidenceFromGroups(normalizedFilters.tenantId, sourceAggregateGroups);
    const entryCount = uniqueEntryCount(sourceAggregateGroups);
    const lineCount = lineCountFromGroups(accountAggregateGroups);
    const reportDiagnostics = diagnostics(normalizedFilters, totals, lineCount, entryCount, new Date().toISOString());

    return {
      tenantId: normalizedFilters.tenantId,
      filters: normalizedFilters,
      rows,
      totals,
      sourceBreakdown: sourceEvidence.sourceBreakdown,
      diagnostics: reportDiagnostics,
      reconciliation: reconciliationEvidence(reportDiagnostics, sourceEvidence),
    };
  }

  private buildWhere(filters: AccountingJournalTrialBalanceFilters): Prisma.AccountingJournalLineWhereInput {
    const postedAt = dateRange(filters.postedFrom, filters.postedTo);
    const journalEntry: Prisma.AccountingJournalEntryWhereInput = {
      tenantId: filters.tenantId,
      ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters.sourceAction ? { sourceAction: filters.sourceAction } : {}),
      ...(filters.entryType ? { entryType: filters.entryType } : {}),
      ...(postedAt ? { postedAt } : {}),
    };

    return {
      tenantId: filters.tenantId,
      ...(filters.currency ? { currency: filters.currency } : {}),
      ...(filters.caseId ? { caseId: filters.caseId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.caseClientId ? { caseClientId: filters.caseClientId } : {}),
      ...(filters.accountCode ? { accountCode: filters.accountCode } : {}),
      journalEntry,
    };
  }

  private async sourceEvidenceFromGroups(
    tenantId: string,
    groups: SourceAggregateGroup[],
  ): Promise<SourceEvidenceResult> {
    const entryIds = uniqueEntryIds(groups);
    if (entryIds.length === 0) return emptySourceEvidence();

    const entries = await this.prisma.accountingJournalEntry.findMany({
      where: { tenantId, id: { in: entryIds } },
      select: { id: true, sourceType: true, sourceAction: true },
    });
    const entryById = new Map((entries as SourceEntryRow[]).map((entry) => [entry.id, entry]));
    const breakdown = new Map<string, MutableTotal>();
    const coverage = new Map<string, MutableSourceCoverage>();
    const missingSourceEntryIds = new Set<string>();
    let missingSourceLineCount = 0;

    for (const group of groups) {
      const entry = entryById.get(group.journalEntryId);
      const lineCount = aggregateLineCount(group);
      if (!entry) {
        missingSourceEntryIds.add(group.journalEntryId);
        missingSourceLineCount += lineCount;
        continue;
      }

      addAggregate(
        breakdown,
        sourceBreakdownKey(entry.sourceType, entry.sourceAction, group.currency),
        group.direction,
        aggregateAmount(group),
        lineCount,
      );
      addSourceCoverage(coverage, entry, group.currency, lineCount);
    }

    const sourceBreakdown = [...breakdown.entries()]
      .map(([key, total]) => {
        const [sourceType, sourceAction, currency] = key.split('|') as [AccountingJournalSourceType, string, string];
        return sourceBreakdownFromTotal(sourceType, sourceAction, currency, total);
      })
      .sort(
        (a, b) =>
          a.sourceType.localeCompare(b.sourceType) ||
          a.sourceAction.localeCompare(b.sourceAction) ||
          a.currency.localeCompare(b.currency),
      );

    return {
      sourceBreakdown,
      sourceCoverage: sourceCoverageFromMaps(coverage, sourceBreakdown),
      missingSourceEntryCount: missingSourceEntryIds.size,
      missingSourceLineCount,
    };
  }
}

function normalizeFilters(filters: AccountingJournalTrialBalanceFilters): AccountingJournalTrialBalanceFilters {
  return {
    ...filters,
    ...(filters.postedFrom !== undefined ? { postedFrom: parseDateFilter('postedFrom', filters.postedFrom).toISOString() } : {}),
    ...(filters.postedTo !== undefined ? { postedTo: parseDateFilter('postedTo', filters.postedTo).toISOString() } : {}),
  };
}

function dateRange(
  postedFrom: AccountingJournalTrialBalanceFilters['postedFrom'],
  postedTo: AccountingJournalTrialBalanceFilters['postedTo'],
): Prisma.DateTimeFilter | null {
  if (postedFrom === undefined && postedTo === undefined) return null;
  return {
    ...(postedFrom !== undefined ? { gte: parseDateFilter('postedFrom', postedFrom) } : {}),
    ...(postedTo !== undefined ? { lte: parseDateFilter('postedTo', postedTo) } : {}),
  };
}

function parseDateFilter(field: 'postedFrom' | 'postedTo', value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO date or Date.`);
  }
  return date;
}

function rowsFromAccountGroups(groups: AccountAggregateGroup[]): AccountingJournalTrialBalanceRow[] {
  const rowsByAccountCurrency = new Map<string, MutableTotal>();
  for (const group of groups) {
    addAggregate(
      rowsByAccountCurrency,
      `${group.accountCode}|${group.currency}`,
      group.direction,
      aggregateAmount(group),
      aggregateLineCount(group),
    );
  }

  return [...rowsByAccountCurrency.entries()]
    .map(([key, total]) => {
      const [accountCode, currency] = key.split('|') as [AccountingAccountCode, string];
      return rowFromTotal(accountCode, currency, total);
    })
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.currency.localeCompare(b.currency));
}

function totalsFromAccountGroups(groups: AccountAggregateGroup[]): AccountingJournalTrialBalanceCurrencyTotal[] {
  const totalsByCurrency = new Map<string, MutableTotal>();
  for (const group of groups) {
    addAggregate(totalsByCurrency, group.currency, group.direction, aggregateAmount(group), aggregateLineCount(group));
  }

  return [...totalsByCurrency.entries()]
    .map(([currency, total]) => currencyTotalFromTotal(currency, total))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function addAggregate(
  map: Map<string, MutableTotal>,
  key: string,
  direction: AccountingJournalDirection,
  amount: Prisma.Decimal,
  lineCount: number,
): void {
  const current = map.get(key) ?? { debit: ZERO, credit: ZERO, lineCount: 0 };
  if (direction === 'DEBIT') current.debit = current.debit.plus(amount);
  if (direction === 'CREDIT') current.credit = current.credit.plus(amount);
  current.lineCount += lineCount;
  map.set(key, current);
}

function addSourceCoverage(
  map: Map<string, MutableSourceCoverage>,
  entry: SourceEntryRow,
  currency: string,
  lineCount: number,
): void {
  const key = sourceCoverageKey(entry.sourceType, entry.sourceAction);
  const current = map.get(key) ?? { entryIds: new Set<string>(), lineCount: 0, currencies: new Set<string>() };
  current.entryIds.add(entry.id);
  current.lineCount += lineCount;
  current.currencies.add(currency);
  map.set(key, current);
}

function sourceBreakdownKey(sourceType: AccountingJournalSourceType, sourceAction: string, currency: string): string {
  return `${sourceType}|${sourceAction}|${currency}`;
}

function sourceCoverageKey(sourceType: AccountingJournalSourceType, sourceAction: string): string {
  return `${sourceType}|${sourceAction}`;
}

function emptySourceEvidence(): SourceEvidenceResult {
  return {
    sourceBreakdown: [],
    sourceCoverage: [],
    missingSourceEntryCount: 0,
    missingSourceLineCount: 0,
  };
}

function sourceCoverageFromMaps(
  coverage: Map<string, MutableSourceCoverage>,
  sourceBreakdown: AccountingJournalTrialBalanceSourceBreakdown[],
): AccountingJournalTrialBalanceSourceCoverage[] {
  const balancedBySource = new Map<string, boolean>();
  for (const row of sourceBreakdown) {
    const key = sourceCoverageKey(row.sourceType, row.sourceAction);
    balancedBySource.set(key, (balancedBySource.get(key) ?? true) && row.balanced);
  }

  return [...coverage.entries()]
    .map(([key, total]) => {
      const [sourceType, sourceAction] = key.split('|') as [AccountingJournalSourceType, string];
      const currencies = [...total.currencies].sort();
      return {
        sourceType,
        sourceAction,
        entryCount: total.entryIds.size,
        lineCount: total.lineCount,
        currencyCount: currencies.length,
        currencies,
        balanced: balancedBySource.get(key) ?? true,
      };
    })
    .sort((a, b) => a.sourceType.localeCompare(b.sourceType) || a.sourceAction.localeCompare(b.sourceAction));
}

function rowFromTotal(
  accountCode: AccountingAccountCode,
  currency: string,
  total: MutableTotal,
): AccountingJournalTrialBalanceRow {
  const net = total.debit.minus(total.credit);
  return {
    accountCode,
    currency,
    debit: money(total.debit),
    credit: money(total.credit),
    netDebit: money(net.gt(0) ? net : ZERO),
    netCredit: money(net.lt(0) ? net.abs() : ZERO),
    lineCount: total.lineCount,
  };
}

function currencyTotalFromTotal(currency: string, total: MutableTotal): AccountingJournalTrialBalanceCurrencyTotal {
  return {
    currency,
    debit: money(total.debit),
    credit: money(total.credit),
    balanced: total.debit.equals(total.credit),
    lineCount: total.lineCount,
  };
}

function sourceBreakdownFromTotal(
  sourceType: AccountingJournalSourceType,
  sourceAction: string,
  currency: string,
  total: MutableTotal,
): AccountingJournalTrialBalanceSourceBreakdown {
  return {
    sourceType,
    sourceAction,
    currency,
    debit: money(total.debit),
    credit: money(total.credit),
    balanced: total.debit.equals(total.credit),
    lineCount: total.lineCount,
  };
}

function diagnostics(
  filters: AccountingJournalTrialBalanceFilters,
  totals: AccountingJournalTrialBalanceCurrencyTotal[],
  lineCount: number,
  entryCount: number,
  generatedAt: string,
): AccountingJournalTrialBalanceDiagnostics {
  const dimensionScoped = Boolean(filters.caseId || filters.clientId || filters.caseClientId || filters.accountCode);
  const balanced = totals.every((total) => total.balanced);
  const warningCodes: AccountingJournalTrialBalanceWarningCode[] = [];
  if (lineCount === 0) warningCodes.push('NO_JOURNAL_LINES');
  if (dimensionScoped && !balanced) warningCodes.push('DIMENSION_SCOPED_IMBALANCE');
  if (!dimensionScoped && !balanced) warningCodes.push('TRIAL_BALANCE_IMBALANCE');

  return {
    balanced,
    dimensionScoped,
    partialEntryScope: dimensionScoped,
    dateBasis: 'postedAt',
    generatedAt,
    lineCount,
    entryCount,
    currencyCount: totals.length,
    evidenceStatus: evidenceStatus(lineCount, balanced, dimensionScoped),
    unbalancedCurrencies: unbalancedCurrencies(totals),
    missingEffectiveDateColumn: true,
    missingSourceVersionColumn: true,
    warningCodes,
  };
}

function reconciliationEvidence(
  reportDiagnostics: AccountingJournalTrialBalanceDiagnostics,
  sourceEvidence: SourceEvidenceResult,
): AccountingJournalTrialBalanceReconciliationEvidence {
  return {
    evidenceSource: 'PERSISTED_ACCOUNTING_JOURNAL',
    aggregateBasis: 'DB_AGGREGATE',
    tenantScoped: true,
    dateBasis: 'postedAt',
    amountBasis: 'AccountingJournalLine.amount',
    directionBasis: 'AccountingJournalLine.direction',
    entryJoinBasis: 'AccountingJournalLine.journalEntryId -> AccountingJournalEntry.id',
    balanced: reportDiagnostics.balanced,
    evidenceStatus: reportDiagnostics.evidenceStatus,
    lineCount: reportDiagnostics.lineCount,
    entryCount: reportDiagnostics.entryCount,
    currencyCount: reportDiagnostics.currencyCount,
    sourceCount: sourceEvidence.sourceCoverage.length,
    sourceCoverage: sourceEvidence.sourceCoverage,
    warnings: reconciliationWarnings(reportDiagnostics, sourceEvidence),
  };
}

function reconciliationWarnings(
  reportDiagnostics: AccountingJournalTrialBalanceDiagnostics,
  sourceEvidence: SourceEvidenceResult,
): AccountingJournalTrialBalanceReconciliationWarning[] {
  const warnings: AccountingJournalTrialBalanceReconciliationWarning[] = reportDiagnostics.warningCodes.map((code) => ({
    code,
    message: diagnosticsWarningMessage(code),
  }));

  if (reportDiagnostics.dimensionScoped) {
    warnings.push({
      code: 'DIMENSION_SCOPED_EVIDENCE',
      message: 'Filters narrow the journal evidence scope and may include only part of one or more entries.',
    });
  }

  if (sourceEvidence.sourceCoverage.some((source) => !source.balanced)) {
    warnings.push({
      code: 'SOURCE_BREAKDOWN_IMBALANCE',
      message: 'At least one journal source bucket is not balanced within the returned evidence scope.',
    });
  }

  if (sourceEvidence.missingSourceEntryCount > 0) {
    warnings.push({
      code: 'MISSING_SOURCE_METADATA',
      message: `${sourceEvidence.missingSourceEntryCount} journal entries covering ${sourceEvidence.missingSourceLineCount} lines were missing source metadata.`,
    });
  }

  return warnings;
}

function diagnosticsWarningMessage(code: AccountingJournalTrialBalanceWarningCode): string {
  if (code === 'NO_JOURNAL_LINES') return 'No persisted journal lines matched the requested Trial Balance scope.';
  if (code === 'DIMENSION_SCOPED_IMBALANCE') return 'The scoped journal evidence is imbalanced within the requested dimension.';
  return 'The unscoped persisted journal evidence is imbalanced.';
}

function evidenceStatus(
  lineCount: number,
  balanced: boolean,
  dimensionScoped: boolean,
): AccountingJournalTrialBalanceEvidenceStatus {
  if (lineCount === 0) return 'NO_LINES';
  if (balanced) return 'BALANCED';
  return dimensionScoped ? 'DIMENSION_SCOPED' : 'IMBALANCED';
}

function unbalancedCurrencies(
  totals: AccountingJournalTrialBalanceCurrencyTotal[],
): AccountingJournalTrialBalanceUnbalancedCurrency[] {
  return totals
    .filter((total) => !total.balanced)
    .map((total) => {
      const debit = new Prisma.Decimal(total.debit);
      const credit = new Prisma.Decimal(total.credit);
      return {
        currency: total.currency,
        debit: total.debit,
        credit: total.credit,
        difference: money(debit.minus(credit)),
      };
    });
}

function lineCountFromGroups(groups: AggregateAmountGroup[]): number {
  return groups.reduce((sum, group) => sum + aggregateLineCount(group), 0);
}

function uniqueEntryCount(groups: SourceAggregateGroup[]): number {
  return uniqueEntryIds(groups).length;
}

function uniqueEntryIds(groups: SourceAggregateGroup[]): string[] {
  return [...new Set(groups.map((group) => group.journalEntryId))].sort();
}

function aggregateLineCount(group: AggregateAmountGroup): number {
  return group._count._all;
}

function aggregateAmount(group: AggregateAmountGroup): Prisma.Decimal {
  return group._sum.amount ?? ZERO;
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}
