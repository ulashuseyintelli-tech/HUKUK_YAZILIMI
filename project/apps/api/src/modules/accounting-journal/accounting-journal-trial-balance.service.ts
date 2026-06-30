import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccountingAccountCode,
  AccountingJournalDirection,
  AccountingJournalEntryType,
  AccountingJournalSourceType,
} from './accounting-journal.types';
import type {
  AccountingJournalTrialBalanceCurrencyTotal,
  AccountingJournalTrialBalanceDiagnostics,
  AccountingJournalTrialBalanceFilters,
  AccountingJournalTrialBalanceReport,
  AccountingJournalTrialBalanceRow,
  AccountingJournalTrialBalanceSourceBreakdown,
  AccountingJournalTrialBalanceWarningCode,
} from './accounting-journal-trial-balance.types';

type TrialBalanceLineRow = {
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: Prisma.Decimal;
  currency: string;
  journalEntry: {
    tenantId: string;
    sourceType: AccountingJournalSourceType;
    sourceAction: string;
    entryType: AccountingJournalEntryType;
  };
};

interface MutableTotal {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  lineCount: number;
}

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class AccountingJournalTrialBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalTrialBalanceService.getTrialBalance() -> read-only service/test seam; controller henuz yok.
  /// - Future AccountingJournalController.trialBalance() -> GET /accounting-journal/trial-balance (future, not wired in ACCT-2A-1).
  /// </remarks>
  async getTrialBalance(filters: AccountingJournalTrialBalanceFilters): Promise<AccountingJournalTrialBalanceReport> {
    const rows = await this.prisma.accountingJournalLine.findMany({
      where: this.buildWhere(filters),
      select: {
        accountCode: true,
        direction: true,
        amount: true,
        currency: true,
        journalEntry: {
          select: {
            tenantId: true,
            sourceType: true,
            sourceAction: true,
            entryType: true,
          },
        },
      },
      orderBy: [{ accountCode: 'asc' }, { currency: 'asc' }, { lineNo: 'asc' }],
    });

    return this.toReport(filters, rows as TrialBalanceLineRow[]);
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

  private toReport(
    filters: AccountingJournalTrialBalanceFilters,
    lines: TrialBalanceLineRow[],
  ): AccountingJournalTrialBalanceReport {
    const rowsByAccountCurrency = new Map<string, MutableTotal>();
    const totalsByCurrency = new Map<string, MutableTotal>();
    const sourceBreakdown = new Map<string, MutableTotal>();

    for (const line of lines) {
      addLine(rowsByAccountCurrency, `${line.accountCode}|${line.currency}`, line);
      addLine(totalsByCurrency, line.currency, line);
      addLine(
        sourceBreakdown,
        `${line.journalEntry.sourceType}|${line.journalEntry.sourceAction}|${line.currency}`,
        line,
      );
    }

    const rows = [...rowsByAccountCurrency.entries()]
      .map(([key, total]) => {
        const [accountCode, currency] = key.split('|') as [AccountingAccountCode, string];
        return rowFromTotal(accountCode, currency, total);
      })
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.currency.localeCompare(b.currency));

    const totals = [...totalsByCurrency.entries()]
      .map(([currency, total]) => currencyTotalFromTotal(currency, total))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    const breakdown = [...sourceBreakdown.entries()]
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
      tenantId: filters.tenantId,
      filters,
      rows,
      totals,
      sourceBreakdown: breakdown,
      diagnostics: diagnostics(filters, totals, lines.length),
    };
  }
}

function dateRange(
  postedFrom: AccountingJournalTrialBalanceFilters['postedFrom'],
  postedTo: AccountingJournalTrialBalanceFilters['postedTo'],
): Prisma.DateTimeFilter | null {
  if (!postedFrom && !postedTo) return null;
  return {
    ...(postedFrom ? { gte: toDate(postedFrom) } : {}),
    ...(postedTo ? { lte: toDate(postedTo) } : {}),
  };
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function addLine(map: Map<string, MutableTotal>, key: string, line: TrialBalanceLineRow): void {
  const current = map.get(key) ?? { debit: ZERO, credit: ZERO, lineCount: 0 };
  if (line.direction === 'DEBIT') current.debit = current.debit.plus(line.amount);
  if (line.direction === 'CREDIT') current.credit = current.credit.plus(line.amount);
  current.lineCount += 1;
  map.set(key, current);
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
): AccountingJournalTrialBalanceDiagnostics {
  const dimensionScoped = Boolean(filters.caseId || filters.clientId || filters.caseClientId || filters.accountCode);
  const balanced = totals.every((total) => total.balanced);
  const warningCodes: AccountingJournalTrialBalanceWarningCode[] = [];
  if (lineCount === 0) warningCodes.push('NO_JOURNAL_LINES');
  if (dimensionScoped && !balanced) warningCodes.push('DIMENSION_SCOPED_IMBALANCE');

  return {
    balanced,
    dimensionScoped,
    partialEntryScope: dimensionScoped,
    dateBasis: 'postedAt',
    missingEffectiveDateColumn: true,
    missingSourceVersionColumn: true,
    warningCodes,
  };
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}
