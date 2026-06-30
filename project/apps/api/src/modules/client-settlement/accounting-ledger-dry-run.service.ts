import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildAccountingJournal,
  buildJournalIdempotencyKey,
} from '../accounting-journal/accounting-journal.builder';
import type {
  BalanceLedgerJournalSource,
  BalanceLedgerRecordedType,
  JournalEntryDraft,
  JournalLineDraft,
} from '../accounting-journal/accounting-journal.types';
import { validateJournalDraft } from '../accounting-journal/accounting-journal.validators';
import {
  adaptClientOffsetSourceSnapshot,
  type ClientOffsetSourceSnapshot,
} from '../accounting-journal/client-offset-journal-source.adapter';

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

export interface AccountingDryRunSuppressedBalanceLedgerSource {
  dispositionLineId: string;
  balanceLedgerId: string;
  caseId: string;
  currency: string;
  amount: string;
  reason: 'CORRELATED_OFFSET_CLIENT_ADVANCE';
}

export type AccountingDryRunMismatchWarningReason =
  | 'MISSING_CORRELATION'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'CASE_MISMATCH'
  | 'TENANT_MISMATCH'
  | 'DUPLICATE_SOURCE'
  | 'MANUAL_REVERSAL_MARKER'
  | 'OTHER_SUSPENSE_MANUAL_REVIEW';

export interface AccountingDryRunMismatchWarning {
  reason: AccountingDryRunMismatchWarningReason;
  sourceType: AccountingDryRunSourceType;
  sourceId: string;
  dispositionLineId: string | null;
  balanceLedgerId: string | null;
  expected: string | null;
  actual: string | null;
  message: string;
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
  suppressedBalanceLedgerSources: AccountingDryRunSuppressedBalanceLedgerSource[];
  mismatchWarnings: AccountingDryRunMismatchWarning[];
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
  tenantId: string;
  clientId: string;
  amount: Prisma.Decimal;
  currency: string;
  kind: 'APPLY' | 'REVERSAL';
  payableCaseId: string;
  payableCaseClientId: string;
  expenseCaseId: string;
  expenseRequestId: string | null;
  createdAt: Date;
  createdById: string | null;
  reversesOffsetId: string | null;
}

interface BalanceLedgerSource {
  id: string;
  tenantId: string;
  amount: Prisma.Decimal;
  currency: string;
  type: string;
  source: string | null;
  sourceId: string | null;
  createdAt: Date;
  createdById: string | null;
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
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - AccountingLedgerDryRunService.buildReport() â†’ S9B/S9D dry-run utility; runtime HTTP endpoint yok, test/future admin job tarafÄ±ndan Ã§aÄŸrÄ±lacak.
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
          tenantId: true,
          clientId: true,
          amount: true,
          currency: true,
          kind: true,
          payableCaseId: true,
          payableCaseClientId: true,
          expenseCaseId: true,
          expenseRequestId: true,
          createdAt: true,
          createdById: true,
          reversesOffsetId: true,
        },
      }),
      this.prisma.balanceLedger.findMany({
        where: balanceWhere,
        select: {
          id: true,
          tenantId: true,
          amount: true,
          currency: true,
          type: true,
          source: true,
          sourceId: true,
          createdAt: true,
          createdById: true,
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

export function accountingDryRunSourceVersion(sourceId: string, occurredAt?: Date | null): string {
  return occurredAt ? `${occurredAt.toISOString()}:${sourceId}` : `dry-run:${sourceId}`;
}

export function accountingDryRunIdempotencyKey(
  sourceType: AccountingDryRunSourceType,
  tenantIdOrSourceId: string,
  sourceIdOrAction: string,
  action?: string,
  sourceVersion?: string,
): string {
  if (sourceType === 'CLIENT_OFFSET' && action === undefined) {
    const sourceId = tenantIdOrSourceId;
    const sourceAction = sourceIdOrAction;
    return `client_offset:${sourceId}:${sourceAction}`;
  }

  const tenantId = tenantIdOrSourceId;
  const sourceId = sourceIdOrAction;
  if (!action) throw new Error('accountingDryRunIdempotencyKey requires action for canonical sources');

  return buildJournalIdempotencyKey({
    tenantId,
    sourceType,
    sourceId,
    sourceAction: action,
    sourceVersion: sourceVersion ?? sourceId,
  });
}
export function buildAccountingLedgerDryRunReport(sources: AccountingLedgerDryRunSources): AccountingLedgerDryRunReport {
  const entries: AccountingDryRunJournalEntry[] = [];
  const manualReversalDispositionLines: AccountingDryRunManualReversalItem[] = [];
  const suspenseItems: AccountingDryRunSuspenseItem[] = [];
  const offsetDoubleCountCandidates: AccountingDryRunOffsetDoubleCountCandidate[] = [];
  const suppressedBalanceLedgerSources: AccountingDryRunSuppressedBalanceLedgerSource[] = [];
  const mismatchWarnings: AccountingDryRunMismatchWarning[] = [];
  const offsetDispositionLines = new Map<string, DispositionLineSource>();
  const matchedOffsetDispositionLineIds = new Set<string>();
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
      mismatchWarnings.push({
        reason: 'MANUAL_REVERSAL_MARKER',
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        sourceId: line.id,
        dispositionLineId: line.id,
        balanceLedgerId: null,
        expected: null,
        actual: line.disposition.manualReversalRequiredAt.toISOString(),
        message: `Disposition line ${line.id} manual reversal marker nedeniyle dry-run journal disinda tutuldu.`,
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
      mismatchWarnings.push({
        reason: 'OTHER_SUSPENSE_MANUAL_REVIEW',
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        sourceId: line.id,
        dispositionLineId: line.id,
        balanceLedgerId: null,
        expected: 'explicit-account-mapping',
        actual: 'OTHER',
        message: `Disposition line ${line.id} OTHER bucket oldugu icin auto-post edilmedi; manuel review gerekir.`,
      });
      continue;
    }

    if (line.type === 'OFFSET_CLIENT_ADVANCE') {
      offsetDispositionLines.set(line.id, line);
    }

    const creditAccount = dispositionCreditAccount(line.type);
    if (!creditAccount) continue;

    pushEntry({
      idempotencyKey: accountingDryRunIdempotencyKey('COLLECTION_DISPOSITION_LINE', sources.tenantId, line.id, 'posted', accountingDryRunSourceVersion(line.id, line.disposition.postedAt)),
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
      idempotencyKey: accountingDryRunIdempotencyKey('CLIENT_PAYOUT', sources.tenantId, payout.id, 'recorded', accountingDryRunSourceVersion(payout.id, payout.paidAt)),
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
    const dryRunEntry = buildClientOffsetDryRunEntry(sources.tenantId, offset);
    pushEntry(dryRunEntry);
    addOutstanding(
      clientAccountingExpected,
      sources.tenantId,
      offset.payableCaseId,
      offset.payableCaseClientId,
      offset.currency,
      offset.kind === 'APPLY' ? offset.amount.negated() : offset.amount,
    );
  }

  for (const ledger of sources.balanceLedgerRows) {
    const sourceLineId = parseDispositionLineCorrelation(ledger);
    if (sourceLineId) {
      if (offsetDispositionLines.has(sourceLineId)) {
        const offsetLine = offsetDispositionLines.get(sourceLineId)!;
        matchedOffsetDispositionLineIds.add(sourceLineId);
        mismatchWarnings.push(...collectOffsetBalanceLedgerMismatchWarnings(sources.tenantId, offsetLine, ledger));
        offsetDoubleCountCandidates.push({
          dispositionLineId: offsetLine.id,
          balanceLedgerId: ledger.id,
          caseId: ledger.caseBalance.caseId,
          currency: ledger.currency,
          dispositionAmount: offsetLine.amount.toString(),
          balanceLedgerAmount: ledger.amount.toString(),
          reason: 'OFFSET_CLIENT_ADVANCE_BALANCE_LEDGER_MATCH',
        });
      } else {
        mismatchWarnings.push({
          reason: 'MISSING_CORRELATION',
          sourceType: 'BALANCE_LEDGER',
          sourceId: ledger.id,
          dispositionLineId: sourceLineId,
          balanceLedgerId: ledger.id,
          expected: 'POSTED OFFSET_CLIENT_ADVANCE disposition line in dry-run scope',
          actual: null,
          message: `BalanceLedger ${ledger.id} disposition_line:${sourceLineId} korelasyonlu oldugu icin direct journal adayi yapilmadi; eslesen OFFSET_CLIENT_ADVANCE line dry-run scope disinda veya yok.`,
        });
      }
      suppressedBalanceLedgerSources.push({
        dispositionLineId: sourceLineId,
        balanceLedgerId: ledger.id,
        caseId: ledger.caseBalance.caseId,
        currency: ledger.currency,
        amount: ledger.amount.toString(),
        reason: 'CORRELATED_OFFSET_CLIENT_ADVANCE',
      });
      continue;
    }

    if (ledger.type !== 'CREDIT' && ledger.type !== 'DEBIT') {
      mismatchWarnings.push({
        reason: 'OTHER_SUSPENSE_MANUAL_REVIEW',
        sourceType: 'BALANCE_LEDGER',
        sourceId: ledger.id,
        dispositionLineId: null,
        balanceLedgerId: ledger.id,
        expected: 'CREDIT or DEBIT',
        actual: ledger.type,
        message: `BalanceLedger ${ledger.id} type ${ledger.type} is not approved for journal posting.`,
      });
      continue;
    }

    pushEntry(buildBalanceLedgerDryRunEntry(sources.tenantId, ledger));
  }

  for (const offsetLine of offsetDispositionLines.values()) {
    if (matchedOffsetDispositionLineIds.has(offsetLine.id)) continue;
    mismatchWarnings.push({
      reason: 'MISSING_CORRELATION',
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceId: offsetLine.id,
      dispositionLineId: offsetLine.id,
      balanceLedgerId: null,
      expected: `BalanceLedger.source/sourceId=disposition_line:${offsetLine.id}`,
      actual: null,
      message: `OFFSET_CLIENT_ADVANCE disposition line ${offsetLine.id} icin korelasyonlu BalanceLedger bulunamadi.`,
    });
  }

  const duplicateIdempotencyKeys = duplicated(entries.map((entry) => entry.idempotencyKey));
  mismatchWarnings.push(...duplicateIdempotencyWarnings(duplicateIdempotencyKeys));
  const totalsByTenantCaseCurrency = buildTotals(entries);
  const unbalancedIdempotencyKeys = entries
    .filter((entry) => !entryBalanced(entry))
    .map((entry) => entry.idempotencyKey);
  const projectedSourceRows = entries.length;
  const reportedOnlySourceRows = manualReversalDispositionLines.length + suspenseItems.length + suppressedBalanceLedgerSources.length;
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
    suppressedBalanceLedgerSources,
    mismatchWarnings,
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
    case 'OFFSET_CLIENT_ADVANCE':
      return 'CLIENT_ADVANCE_BALANCE';
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

function buildClientOffsetDryRunEntry(tenantId: string, offset: ClientOffsetSource): AccountingDryRunJournalEntry {
  const snapshot = buildClientOffsetSourceSnapshot(tenantId, offset);
  const adapted = adaptClientOffsetSourceSnapshot(snapshot);
  if (!adapted.ok) {
    throw dryRunFailFast('ClientOffset source adapter failed', offset.id, adapted.errors);
  }

  const built = buildAccountingJournal(adapted.source);
  if (!built.ok) {
    throw dryRunFailFast('ClientOffset journal builder failed', offset.id, built.errors);
  }

  const validated = validateJournalDraft(built.draft);
  if (!validated.ok) {
    throw dryRunFailFast('ClientOffset journal validation failed', offset.id, validated.errors);
  }

  return formatClientOffsetDraftForDryRun(validated.draft);
}

function buildClientOffsetSourceSnapshot(tenantId: string, offset: ClientOffsetSource): ClientOffsetSourceSnapshot {
  return {
    identity: {
      tenantId,
      sourceType: 'CLIENT_OFFSET',
      sourceId: offset.id,
      sourceAction: clientOffsetDryRunSourceAction(offset.kind),
      sourceVersion: accountingDryRunSourceVersion(offset.id, offset.createdAt),
    },
    tenantId: offset.tenantId,
    occurredAt: offset.createdAt,
    effectiveDate: offset.createdAt,
    actorId: offset.createdById,
    currency: offset.currency,
    metadata: {},
    payload: {
      id: offset.id,
      kind: offset.kind,
      amount: offset.amount,
      clientId: offset.clientId,
      payableCaseId: offset.payableCaseId,
      payableCaseClientId: offset.payableCaseClientId,
      expenseCaseId: offset.expenseCaseId,
      expenseRequestId: offset.expenseRequestId,
      reversesOffsetId: offset.reversesOffsetId,
    },
  };
}

function clientOffsetDryRunSourceAction(kind: ClientOffsetSource['kind']): 'apply' | 'reversal' {
  if (kind === 'APPLY') return 'apply';
  if (kind === 'REVERSAL') return 'reversal';
  throw new Error(`Unsupported ClientOffset kind for dry-run journal: ${kind}`);
}

function formatClientOffsetDraftForDryRun(draft: JournalEntryDraft): AccountingDryRunJournalEntry {
  const caseId = requiredDryRunDimension(draft.caseId, 'entry.caseId', draft.sourceId);
  return {
    idempotencyKey: accountingDryRunIdempotencyKey('CLIENT_OFFSET', draft.tenantId, draft.sourceId, draft.sourceAction, draft.sourceVersion),
    sourceType: 'CLIENT_OFFSET',
    sourceId: draft.sourceId,
    tenantId: draft.tenantId,
    caseId,
    currency: draft.currency,
    effectiveAt: null,
    lines: draft.lines.map((line) => formatClientOffsetLineForDryRun(line, draft.sourceId)),
  };
}

function formatClientOffsetLineForDryRun(line: JournalLineDraft, sourceId: string): AccountingDryRunJournalLine {
  return {
    accountCode: line.accountCode,
    direction: line.direction,
    amount: new Prisma.Decimal(line.amount).toString(),
    tenantId: line.tenantId,
    caseId: requiredDryRunDimension(line.caseId, `lines[${line.lineNo}].caseId`, sourceId),
    currency: line.currency,
    clientId: line.clientId,
    caseClientId: line.caseClientId,
    collectionId: line.collectionId,
    dispositionLineId: line.dispositionLineId,
    payoutId: line.payoutId,
    offsetId: line.offsetId,
    balanceLedgerId: line.balanceLedgerId,
  };
}

function buildBalanceLedgerDryRunEntry(tenantId: string, ledger: BalanceLedgerSource): AccountingDryRunJournalEntry {
  if (!isJournalableBalanceLedgerType(ledger.type)) {
    throw new Error(`Unsupported BalanceLedger type for dry-run journal: ${ledger.type}`);
  }

  const sourceVersion = accountingDryRunSourceVersion(ledger.id, ledger.createdAt);
  const source: BalanceLedgerJournalSource = {
    tenantId,
    sourceType: 'BALANCE_LEDGER',
    sourceId: ledger.id,
    sourceVersion,
    sourceAction: 'posted',
    occurredAt: ledger.createdAt.toISOString(),
    effectiveDate: ledger.createdAt.toISOString().slice(0, 10),
    actorId: ledger.createdById,
    currency: ledger.currency,
    sourceHash: null,
    metadata: { sourceName: 'balance-ledger-dry-run' },
    payload: {
      amount: positiveDryRunAmount(ledger.amount),
      caseId: ledger.caseBalance.caseId,
      balanceLedgerId: ledger.id,
      ledgerType: ledger.type,
      source: ledger.source ?? '',
      sourceId: ledger.sourceId,
      isIncrease: ledger.type === 'CREDIT',
    },
  };

  const built = buildAccountingJournal(source);
  if (!built.ok) {
    throw dryRunFailFast('BalanceLedger journal builder failed', ledger.id, built.errors);
  }

  const validated = validateJournalDraft(built.draft);
  if (!validated.ok) {
    throw dryRunFailFast('BalanceLedger journal validation failed', ledger.id, validated.errors);
  }

  return formatBalanceLedgerDraftForDryRun(validated.draft);
}

function isJournalableBalanceLedgerType(type: string): type is Extract<BalanceLedgerRecordedType, 'CREDIT' | 'DEBIT'> {
  return type === 'CREDIT' || type === 'DEBIT';
}

function positiveDryRunAmount(amount: Prisma.Decimal): string {
  return amount.lt(ZERO) ? amount.negated().toString() : amount.toString();
}

function formatBalanceLedgerDraftForDryRun(draft: JournalEntryDraft): AccountingDryRunJournalEntry {
  const caseId = requiredDryRunDimension(draft.caseId, 'entry.caseId', draft.sourceId);
  return {
    idempotencyKey: draft.idempotencyKey,
    sourceType: 'BALANCE_LEDGER',
    sourceId: draft.sourceId,
    tenantId: draft.tenantId,
    caseId,
    currency: draft.currency,
    effectiveAt: draft.sourceOccurredAt,
    lines: draft.lines.map((line) => formatBalanceLedgerLineForDryRun(line, draft.sourceId)),
  };
}

function formatBalanceLedgerLineForDryRun(line: JournalLineDraft, sourceId: string): AccountingDryRunJournalLine {
  return {
    accountCode: line.accountCode,
    direction: line.direction,
    amount: new Prisma.Decimal(line.amount).toString(),
    tenantId: line.tenantId,
    caseId: requiredDryRunDimension(line.caseId, `lines[${line.lineNo}].caseId`, sourceId),
    currency: line.currency,
    clientId: line.clientId,
    caseClientId: line.caseClientId,
    collectionId: line.collectionId,
    dispositionLineId: line.dispositionLineId,
    payoutId: line.payoutId,
    offsetId: line.offsetId,
    balanceLedgerId: line.balanceLedgerId,
  };
}

function requiredDryRunDimension(value: string | null, path: string, sourceId: string): string {
  if (value) return value;
  throw new Error(`ClientOffset dry-run formatter missing required dimension ${path} for ${sourceId}`);
}

function dryRunFailFast(
  stage: string,
  sourceId: string,
  errors: ReadonlyArray<{ code: string; message: string; path: string | null }>,
): never {
  const detail = errors.map((error) => `${error.code}${error.path ? ` at ${error.path}` : ''}: ${error.message}`).join('; ');
  throw new Error(`${stage} for ${sourceId}: ${detail}`);
}

function parseDispositionLineSource(source: string | null): string | null {
  const prefix = 'disposition_line:';
  return source?.startsWith(prefix) ? source.slice(prefix.length) : null;
}

function parseDispositionLineCorrelation(ledger: Pick<BalanceLedgerSource, 'source' | 'sourceId'>): string | null {
  return parseDispositionLineSource(ledger.sourceId) ?? parseDispositionLineSource(ledger.source) ?? (ledger.source === 'disposition_line' ? ledger.sourceId : null);
}

function collectOffsetBalanceLedgerMismatchWarnings(
  tenantId: string,
  offsetLine: DispositionLineSource,
  ledger: BalanceLedgerSource,
): AccountingDryRunMismatchWarning[] {
  const warnings: AccountingDryRunMismatchWarning[] = [];
  const common = {
    sourceType: 'BALANCE_LEDGER' as const,
    sourceId: ledger.id,
    dispositionLineId: offsetLine.id,
    balanceLedgerId: ledger.id,
  };
  if (ledger.tenantId !== tenantId) {
    warnings.push({
      ...common,
      reason: 'TENANT_MISMATCH',
      expected: tenantId,
      actual: ledger.tenantId,
      message: `BalanceLedger ${ledger.id} tenant scope ${ledger.tenantId}; expected ${tenantId}.`,
    });
  }
  if (!ledger.amount.equals(offsetLine.amount)) {
    warnings.push({
      ...common,
      reason: 'AMOUNT_MISMATCH',
      expected: offsetLine.amount.toString(),
      actual: ledger.amount.toString(),
      message: `BalanceLedger ${ledger.id} amount ${ledger.amount.toString()} != OFFSET_CLIENT_ADVANCE line ${offsetLine.id} amount ${offsetLine.amount.toString()}.`,
    });
  }
  if (ledger.currency !== offsetLine.disposition.currency) {
    warnings.push({
      ...common,
      reason: 'CURRENCY_MISMATCH',
      expected: offsetLine.disposition.currency,
      actual: ledger.currency,
      message: `BalanceLedger ${ledger.id} currency ${ledger.currency} != disposition line ${offsetLine.id} currency ${offsetLine.disposition.currency}.`,
    });
  }
  if (ledger.caseBalance.caseId !== offsetLine.disposition.caseId) {
    warnings.push({
      ...common,
      reason: 'CASE_MISMATCH',
      expected: offsetLine.disposition.caseId,
      actual: ledger.caseBalance.caseId,
      message: `BalanceLedger ${ledger.id} case ${ledger.caseBalance.caseId} != disposition line ${offsetLine.id} case ${offsetLine.disposition.caseId}.`,
    });
  }
  return warnings;
}

function duplicateIdempotencyWarnings(keys: string[]): AccountingDryRunMismatchWarning[] {
  return keys.map((key) => ({
    reason: 'DUPLICATE_SOURCE',
    sourceType: sourceTypeFromIdempotencyKey(key),
    sourceId: key,
    dispositionLineId: null,
    balanceLedgerId: null,
    expected: 'unique idempotency key',
    actual: key,
    message: `Duplicate accounting dry-run idempotency key: ${key}`,
  }));
}

function sourceTypeFromIdempotencyKey(key: string): AccountingDryRunSourceType {
  if (key.includes(':CLIENT_PAYOUT:')) return 'CLIENT_PAYOUT';
  if (key.includes(':CLIENT_OFFSET:')) return 'CLIENT_OFFSET';
  if (key.includes(':BALANCE_LEDGER:')) return 'BALANCE_LEDGER';
  return 'COLLECTION_DISPOSITION_LINE';
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
