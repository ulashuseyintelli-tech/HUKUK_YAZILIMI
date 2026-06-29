import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);

export type AccountingDryRunSourceType =
  | 'COLLECTION_DISPOSITION_LINE'
  | 'CLIENT_PAYOUT'
  | 'CLIENT_OFFSET'
  | 'BALANCE_LEDGER';

export type AccountingDryRunAccountCode =
  | 'CASH_CLEARING'
  | 'CLIENT_PAYABLE'
  | 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE'
  | 'CLIENT_EXPENSE_RECEIVABLE'
  | 'ATTORNEY_FEE_REVENUE'
  | 'FIRM_EXPENSE_REIMBURSEMENT'
  | 'CLIENT_ADVANCE_BALANCE';

export type AccountingDryRunDirection = 'DEBIT' | 'CREDIT';

export interface AccountingLedgerDryRunOptions {
  caseId?: string;
  currency?: string;
}

export interface AccountingDryRunJournalLine {
  accountCode: AccountingDryRunAccountCode;
  direction: AccountingDryRunDirection;
  amount: string;
  tenantId: string;
  caseId: string;
  currency: string;
  clientId: string | null;
  caseClientId: string | null;
  collectionId: string | null;
  dispositionLineId: string | null;
  payoutId: string | null;
  offsetId: string | null;
  balanceLedgerId: string | null;
}

export interface AccountingDryRunJournalEntry {
  idempotencyKey: string;
  sourceType: AccountingDryRunSourceType;
  sourceId: string;
  tenantId: string;
  caseId: string;
  currency: string;
  effectiveAt: string | null;
  lines: AccountingDryRunJournalLine[];
}

export interface AccountingDryRunTotal {
  tenantId: string;
  caseId: string;
  currency: string;
  debit: string;
  credit: string;
  balanced: boolean;
}

export interface AccountingDryRunManualReversalItem {
  dispositionLineId: string;
  dispositionId: string;
  caseId: string;
  currency: string;
  amount: string;
  type: string;
  manualReversalRequiredAt: string;
}

export interface AccountingDryRunSuspenseItem {
  dispositionLineId: string;
  dispositionId: string;
  caseId: string;
  currency: string;
  amount: string;
  reason: 'OTHER_BUCKET';
}

export interface AccountingDryRunOffsetDoubleCountCandidate {
  dispositionLineId: string;
  balanceLedgerId: string;
  caseId: string;
  currency: string;
  dispositionAmount: string;
  balanceLedgerAmount: string;
  reason: 'OFFSET_CLIENT_ADVANCE_BALANCE_LEDGER_MATCH';
}

export interface AccountingDryRunOutstandingComparison {
  tenantId: string;
  caseId: string;
  caseClientId: string;
  currency: string;
  clientAccountingOutstanding: string;
  expectedAccountingProjection: string;
  difference: string;
}

export interface AccountingLedgerDryRunReport {
  tenantId: string;
  filters: AccountingLedgerDryRunOptions;
  entries: AccountingDryRunJournalEntry[];
  sourceCounts: Record<AccountingDryRunSourceType, number>;
  totalsByTenantCaseCurrency: AccountingDryRunTotal[];
  debitCreditBalance: {
    balanced: boolean;
    unbalancedIdempotencyKeys: string[];
  };
  duplicateIdempotencyKeys: string[];
  offsetDoubleCountCandidates: AccountingDryRunOffsetDoubleCountCandidate[];
  manualReversalDispositionLines: AccountingDryRunManualReversalItem[];
  suspenseItems: AccountingDryRunSuspenseItem[];
  sourceCoverage: {
    totalSourceRows: number;
    projectedSourceRows: number;
    reportedOnlySourceRows: number;
    coverageRatio: string;
  };
  outstandingComparison: AccountingDryRunOutstandingComparison[];
  clientStatementComparison: {
    compared: false;
    autoFix: false;
    reason: string;
  };
}

interface DispositionLineSource {
  id: string;
  type: string;
  amount: Prisma.Decimal;
  caseClientId: string | null;
  disposition: {
    id: string;
    caseId: string;
    collectionId: string;
    currency: string;
    postedAt: Date | null;
    manualReversalRequiredAt: Date | null;
  };
}

interface ClientPayoutSource {
  id: string;
  caseId: string;
  caseClientId: string;
  amount: Prisma.Decimal;
  currency: string;
  paidAt: Date;
}

interface ClientOffsetSource {
  id: string;
  clientId: string;
  amount: Prisma.Decimal;
  currency: string;
  kind: string;
  payableCaseId: string;
  payableCaseClientId: string;
  expenseCaseId: string;
}

interface BalanceLedgerSource {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
  type: string;
  source: string | null;
  sourceId: string | null;
  createdAt: Date;
  caseBalance: {
    caseId: string;
  };
}

export interface AccountingLedgerDryRunSources {
  tenantId: string;
  filters?: AccountingLedgerDryRunOptions;
  dispositionLines: DispositionLineSource[];
  clientPayouts: ClientPayoutSource[];
  clientOffsets: ClientOffsetSource[];
  balanceLedgerRows: BalanceLedgerSource[];
}

@Injectable()
export class AccountingLedgerDryRunService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AccountingLedgerDryRunService.buildReport() → S9B dry-run utility; runtime HTTP endpoint yok, test/future admin job tarafından çağrılacak.
  /// </remarks>
  async buildReport(tenantId: string, options: AccountingLedgerDryRunOptions = {}): Promise<AccountingLedgerDryRunReport> {
    const dispositionWhere: Prisma.CollectionDispositionLineWhereInput = {
      disposition: {
        tenantId,
        status: 'POSTED',
        ...(options.caseId ? { caseId: options.caseId } : {}),
        ...(options.currency ? { currency: options.currency } : {}),
      },
    };
    const payoutWhere: Prisma.ClientPayoutWhereInput = {
      tenantId,
      status: 'RECORDED',
      ...(options.caseId ? { caseId: options.caseId } : {}),
      ...(options.currency ? { currency: options.currency } : {}),
    };
    const offsetWhere: Prisma.ClientOffsetWhereInput = {
      tenantId,
      ...(options.currency ? { currency: options.currency } : {}),
      ...(options.caseId ? { OR: [{ payableCaseId: options.caseId }, { expenseCaseId: options.caseId }] } : {}),
    };
    const balanceWhere: Prisma.BalanceLedgerWhereInput = {
      tenantId,
      ...(options.currency ? { currency: options.currency } : {}),
      ...(options.caseId ? { caseBalance: { caseId: options.caseId } } : {}),
    };

    const [dispositionLines, clientPayouts, clientOffsets, balanceLedgerRows] = await Promise.all([
      this.prisma.collectionDispositionLine.findMany({
        where: dispositionWhere,
        select: {
          id: true,
          type: true,
          amount: true,
          caseClientId: true,
          disposition: {
            select: {
              id: true,
              caseId: true,
              collectionId: true,
              currency: true,
              postedAt: true,
              manualReversalRequiredAt: true,
            },
          },
        },
      }),
      this.prisma.clientPayout.findMany({
        where: payoutWhere,
        select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true, paidAt: true },
      }),
      this.prisma.clientOffset.findMany({
        where: offsetWhere,
        select: {
          id: true,
          clientId: true,
          amount: true,
          currency: true,
          kind: true,
          payableCaseId: true,
          payableCaseClientId: true,
          expenseCaseId: true,
        },
      }),
      this.prisma.balanceLedger.findMany({
        where: balanceWhere,
        select: {
          id: true,
          amount: true,
          currency: true,
          type: true,
          source: true,
          sourceId: true,
          createdAt: true,
          caseBalance: { select: { caseId: true } },
        },
      }),
    ]);

    return buildAccountingLedgerDryRunReport({
      tenantId,
      filters: options,
      dispositionLines,
      clientPayouts,
      clientOffsets,
      balanceLedgerRows,
    });
  }
}

export function accountingDryRunIdempotencyKey(sourceType: AccountingDryRunSourceType, sourceId: string, action: string): string {
  return `${sourceType.toLowerCase()}:${sourceId}:${action}`;
}

export function buildAccountingLedgerDryRunReport(sources: AccountingLedgerDryRunSources): AccountingLedgerDryRunReport {
  const entries: AccountingDryRunJournalEntry[] = [];
  const manualReversalDispositionLines: AccountingDryRunManualReversalItem[] = [];
  const suspenseItems: AccountingDryRunSuspenseItem[] = [];
  const offsetDoubleCountCandidates: AccountingDryRunOffsetDoubleCountCandidate[] = [];
  const offsetDispositionLines = new Map<string, DispositionLineSource>();
  const clientAccountingExpected = new Map<string, Prisma.Decimal>();

  const pushEntry = (entry: AccountingDryRunJournalEntry) => {
    entries.push(entry);
  };

  for (const line of sources.dispositionLines) {
    if (line.disposition.manualReversalRequiredAt) {
      manualReversalDispositionLines.push({
        dispositionLineId: line.id,
        dispositionId: line.disposition.id,
        caseId: line.disposition.caseId,
        currency: line.disposition.currency,
        amount: line.amount.toString(),
        type: line.type,
        manualReversalRequiredAt: line.disposition.manualReversalRequiredAt.toISOString(),
      });
      continue;
    }

    if (line.type === 'OTHER') {
      suspenseItems.push({
        dispositionLineId: line.id,
        dispositionId: line.disposition.id,
        caseId: line.disposition.caseId,
        currency: line.disposition.currency,
        amount: line.amount.toString(),
        reason: 'OTHER_BUCKET',
      });
      continue;
    }

    if (line.type === 'OFFSET_CLIENT_ADVANCE') {
      offsetDispositionLines.set(line.id, line);
      continue;
    }

    const creditAccount = dispositionCreditAccount(line.type);
    if (!creditAccount) continue;

    pushEntry({
      idempotencyKey: accountingDryRunIdempotencyKey('COLLECTION_DISPOSITION_LINE', line.id, 'posted'),
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceId: line.id,
      tenantId: sources.tenantId,
      caseId: line.disposition.caseId,
      currency: line.disposition.currency,
      effectiveAt: line.disposition.postedAt?.toISOString() ?? null,
      lines: [
        dryRunLine('CASH_CLEARING', 'DEBIT', line.amount, sources.tenantId, line.disposition.caseId, line.disposition.currency, {
          collectionId: line.disposition.collectionId,
          dispositionLineId: line.id,
          caseClientId: line.caseClientId,
        }),
        dryRunLine(creditAccount, 'CREDIT', line.amount, sources.tenantId, line.disposition.caseId, line.disposition.currency, {
          collectionId: line.disposition.collectionId,
          dispositionLineId: line.id,
          caseClientId: line.caseClientId,
        }),
      ],
    });

    if (line.type === 'CLIENT_PAYABLE' && line.caseClientId) {
      addOutstanding(clientAccountingExpected, sources.tenantId, line.disposition.caseId, line.caseClientId, line.disposition.currency, line.amount);
    }
  }

  for (const payout of sources.clientPayouts) {
    pushEntry({
      idempotencyKey: accountingDryRunIdempotencyKey('CLIENT_PAYOUT', payout.id, 'recorded'),
      sourceType: 'CLIENT_PAYOUT',
      sourceId: payout.id,
      tenantId: sources.tenantId,
      caseId: payout.caseId,
      currency: payout.currency,
      effectiveAt: payout.paidAt.toISOString(),
      lines: [
        dryRunLine('CLIENT_PAYABLE', 'DEBIT', payout.amount, sources.tenantId, payout.caseId, payout.currency, {
          payoutId: payout.id,
          caseClientId: payout.caseClientId,
        }),
        dryRunLine('CASH_CLEARING', 'CREDIT', payout.amount, sources.tenantId, payout.caseId, payout.currency, {
          payoutId: payout.id,
          caseClientId: payout.caseClientId,
        }),
      ],
    });
    addOutstanding(clientAccountingExpected, sources.tenantId, payout.caseId, payout.caseClientId, payout.currency, payout.amount.negated());
  }

  for (const offset of sources.clientOffsets) {
    const isApply = offset.kind === 'APPLY';
    const debitAccount: AccountingDryRunAccountCode = isApply ? 'CLIENT_PAYABLE' : 'CLIENT_EXPENSE_RECEIVABLE';
    const creditAccount: AccountingDryRunAccountCode = isApply ? 'CLIENT_EXPENSE_RECEIVABLE' : 'CLIENT_PAYABLE';
    pushEntry({
      idempotencyKey: accountingDryRunIdempotencyKey('CLIENT_OFFSET', offset.id, offset.kind.toLowerCase()),
      sourceType: 'CLIENT_OFFSET',
      sourceId: offset.id,
      tenantId: sources.tenantId,
      caseId: offset.payableCaseId,
      currency: offset.currency,
      effectiveAt: null,
      lines: [
        dryRunLine(debitAccount, 'DEBIT', offset.amount, sources.tenantId, offset.payableCaseId, offset.currency, {
          clientId: offset.clientId,
          offsetId: offset.id,
          caseClientId: offset.payableCaseClientId,
        }),
        dryRunLine(creditAccount, 'CREDIT', offset.amount, sources.tenantId, offset.expenseCaseId, offset.currency, {
          clientId: offset.clientId,
          offsetId: offset.id,
          caseClientId: offset.payableCaseClientId,
        }),
      ],
    });
    addOutstanding(
      clientAccountingExpected,
      sources.tenantId,
      offset.payableCaseId,
      offset.payableCaseClientId,
      offset.currency,
      isApply ? offset.amount.negated() : offset.amount,
    );
  }

  for (const ledger of sources.balanceLedgerRows) {
    const isIncrease = ledger.type === 'CREDIT' || ledger.type === 'ADJUST';
    pushEntry({
      idempotencyKey: accountingDryRunIdempotencyKey('BALANCE_LEDGER', ledger.id, 'posted'),
      sourceType: 'BALANCE_LEDGER',
      sourceId: ledger.id,
      tenantId: sources.tenantId,
      caseId: ledger.caseBalance.caseId,
      currency: ledger.currency,
      effectiveAt: ledger.createdAt.toISOString(),
      lines: [
        dryRunLine(isIncrease ? 'CASH_CLEARING' : 'CLIENT_ADVANCE_BALANCE', 'DEBIT', ledger.amount, sources.tenantId, ledger.caseBalance.caseId, ledger.currency, {
          balanceLedgerId: ledger.id,
        }),
        dryRunLine(isIncrease ? 'CLIENT_ADVANCE_BALANCE' : 'CASH_CLEARING', 'CREDIT', ledger.amount, sources.tenantId, ledger.caseBalance.caseId, ledger.currency, {
          balanceLedgerId: ledger.id,
        }),
      ],
    });

    const sourceLineId = ledger.sourceId ?? parseDispositionLineSource(ledger.source);
    if (sourceLineId && offsetDispositionLines.has(sourceLineId)) {
      const offsetLine = offsetDispositionLines.get(sourceLineId)!;
      offsetDoubleCountCandidates.push({
        dispositionLineId: offsetLine.id,
        balanceLedgerId: ledger.id,
        caseId: ledger.caseBalance.caseId,
        currency: ledger.currency,
        dispositionAmount: offsetLine.amount.toString(),
        balanceLedgerAmount: ledger.amount.toString(),
        reason: 'OFFSET_CLIENT_ADVANCE_BALANCE_LEDGER_MATCH',
      });
    }
  }

  const duplicateIdempotencyKeys = duplicated(entries.map((entry) => entry.idempotencyKey));
  const totalsByTenantCaseCurrency = buildTotals(entries);
  const unbalancedIdempotencyKeys = entries
    .filter((entry) => !entryBalanced(entry))
    .map((entry) => entry.idempotencyKey);
  const projectedSourceRows = entries.length;
  const reportedOnlySourceRows = manualReversalDispositionLines.length + suspenseItems.length + offsetDispositionLines.size;
  const totalSourceRows =
    sources.dispositionLines.length +
    sources.clientPayouts.length +
    sources.clientOffsets.length +
    sources.balanceLedgerRows.length;

  return {
    tenantId: sources.tenantId,
    filters: sources.filters ?? {},
    entries,
    sourceCounts: {
      COLLECTION_DISPOSITION_LINE: sources.dispositionLines.length,
      CLIENT_PAYOUT: sources.clientPayouts.length,
      CLIENT_OFFSET: sources.clientOffsets.length,
      BALANCE_LEDGER: sources.balanceLedgerRows.length,
    },
    totalsByTenantCaseCurrency,
    debitCreditBalance: {
      balanced: unbalancedIdempotencyKeys.length === 0,
      unbalancedIdempotencyKeys,
    },
    duplicateIdempotencyKeys,
    offsetDoubleCountCandidates,
    manualReversalDispositionLines,
    suspenseItems,
    sourceCoverage: {
      totalSourceRows,
      projectedSourceRows,
      reportedOnlySourceRows,
      coverageRatio: totalSourceRows === 0 ? '1' : new Prisma.Decimal(projectedSourceRows + reportedOnlySourceRows).div(totalSourceRows).toString(),
    },
    outstandingComparison: buildOutstandingComparison(entries, clientAccountingExpected),
    clientStatementComparison: {
      compared: false,
      autoFix: false,
      reason: 'ClientStatementLine S9B dry-run source degildir; fark yalniz raporlanir, auto-fix yoktur.',
    },
  };
}

function dispositionCreditAccount(type: string): AccountingDryRunAccountCode | null {
  switch (type) {
    case 'CLIENT_PAYABLE':
      return 'CLIENT_PAYABLE';
    case 'CLIENT_EXPENSE_REIMBURSEMENT':
      return 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE';
    case 'CONTRACTUAL_FEE_WITHHELD':
      return 'ATTORNEY_FEE_REVENUE';
    case 'FIRM_EXPENSE_REIMBURSEMENT':
      return 'FIRM_EXPENSE_REIMBURSEMENT';
    default:
      return null;
  }
}

function dryRunLine(
  accountCode: AccountingDryRunAccountCode,
  direction: AccountingDryRunDirection,
  amount: Prisma.Decimal,
  tenantId: string,
  caseId: string,
  currency: string,
  dimensions: Partial<Pick<AccountingDryRunJournalLine, 'clientId' | 'caseClientId' | 'collectionId' | 'dispositionLineId' | 'payoutId' | 'offsetId' | 'balanceLedgerId'>>,
): AccountingDryRunJournalLine {
  return {
    accountCode,
    direction,
    amount: amount.toString(),
    tenantId,
    caseId,
    currency,
    clientId: dimensions.clientId ?? null,
    caseClientId: dimensions.caseClientId ?? null,
    collectionId: dimensions.collectionId ?? null,
    dispositionLineId: dimensions.dispositionLineId ?? null,
    payoutId: dimensions.payoutId ?? null,
    offsetId: dimensions.offsetId ?? null,
    balanceLedgerId: dimensions.balanceLedgerId ?? null,
  };
}

function parseDispositionLineSource(source: string | null): string | null {
  const prefix = 'disposition_line:';
  return source?.startsWith(prefix) ? source.slice(prefix.length) : null;
}

function addOutstanding(
  map: Map<string, Prisma.Decimal>,
  tenantId: string,
  caseId: string,
  caseClientId: string,
  currency: string,
  delta: Prisma.Decimal,
) {
  const key = outstandingKey(tenantId, caseId, caseClientId, currency);
  map.set(key, (map.get(key) ?? ZERO).plus(delta));
}

function outstandingKey(tenantId: string, caseId: string, caseClientId: string, currency: string): string {
  return `${tenantId}|${caseId}|${caseClientId}|${currency}`;
}

function buildOutstandingComparison(
  entries: AccountingDryRunJournalEntry[],
  clientAccountingExpected: Map<string, Prisma.Decimal>,
): AccountingDryRunOutstandingComparison[] {
  const accounting = new Map<string, Prisma.Decimal>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountCode !== 'CLIENT_PAYABLE' || !line.caseClientId) continue;
      const signed = line.direction === 'CREDIT' ? new Prisma.Decimal(line.amount) : new Prisma.Decimal(line.amount).negated();
      addOutstanding(accounting, line.tenantId, line.caseId, line.caseClientId, line.currency, signed);
    }
  }
  const keys = [...new Set([...clientAccountingExpected.keys(), ...accounting.keys()])].sort();
  return keys.map((key) => {
    const [tenantId, caseId, caseClientId, currency] = key.split('|');
    const source = clientAccountingExpected.get(key) ?? ZERO;
    const projected = accounting.get(key) ?? ZERO;
    return {
      tenantId,
      caseId,
      caseClientId,
      currency,
      clientAccountingOutstanding: source.toString(),
      expectedAccountingProjection: projected.toString(),
      difference: projected.minus(source).toString(),
    };
  });
}

function buildTotals(entries: AccountingDryRunJournalEntry[]): AccountingDryRunTotal[] {
  const totals = new Map<string, { tenantId: string; caseId: string; currency: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const key = `${line.tenantId}|${line.caseId}|${line.currency}`;
      const current = totals.get(key) ?? { tenantId: line.tenantId, caseId: line.caseId, currency: line.currency, debit: ZERO, credit: ZERO };
      if (line.direction === 'DEBIT') current.debit = current.debit.plus(line.amount);
      if (line.direction === 'CREDIT') current.credit = current.credit.plus(line.amount);
      totals.set(key, current);
    }
  }
  return [...totals.values()]
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId) || a.caseId.localeCompare(b.caseId) || a.currency.localeCompare(b.currency))
    .map((row) => ({
      tenantId: row.tenantId,
      caseId: row.caseId,
      currency: row.currency,
      debit: row.debit.toString(),
      credit: row.credit.toString(),
      balanced: row.debit.equals(row.credit),
    }));
}

function entryBalanced(entry: AccountingDryRunJournalEntry): boolean {
  let debit = ZERO;
  let credit = ZERO;
  for (const line of entry.lines) {
    if (line.direction === 'DEBIT') debit = debit.plus(line.amount);
    if (line.direction === 'CREDIT') credit = credit.plus(line.amount);
  }
  return debit.equals(credit);
}

function duplicated(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}
