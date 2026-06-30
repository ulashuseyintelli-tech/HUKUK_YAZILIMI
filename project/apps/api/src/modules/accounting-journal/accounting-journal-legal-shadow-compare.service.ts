import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccountingAccountCode, AccountingJournalDirection } from './accounting-journal.types';

export type AccountingJournalLegalShadowMatchStatus =
  | 'MATCH'
  | 'DIVERGENT'
  | 'SUMMARY_ONLY'
  | 'ENGINE_ONLY';

export type AccountingJournalLegalShadowSeverity = 'INFO' | 'YELLOW' | 'RED';

export type AccountingJournalLegalSourcePolicyDecision =
  | 'MAPPED'
  | 'ACCEPTED_EXCLUSION'
  | 'BLOCKED';

export type AccountingJournalLegalShadowZeroingDecision =
  | 'ZEROED'
  | 'ACCEPTED_EXCLUSION'
  | 'REAL_MISMATCH'
  | 'UNSUPPORTED_BLOCKER'
  | 'DIAGNOSTIC_ONLY';

export interface AccountingJournalLegalShadowZeroingSummary {
  zeroedRows: number;
  acceptedExclusionRows: number;
  unsupportedBlockerRows: number;
  realMismatchRows: number;
  diagnosticOnlyRows: number;
  blockingDivergentRows: number;
  blockingSummaryOnlyRows: number;
  blockingEngineOnlyRows: number;
}

export type AccountingJournalLegalShadowTechnicalAcceptanceStatus =
  | 'BLOCKED'
  | 'READY_FOR_LEGAL_SIGNOFF'
  | 'READY_FOR_PRIMARY_CUTOVER';

export type AccountingJournalLegalShadowTechnicalAcceptanceThresholdCode =
  | 'LEGAL_SAMPLE_PRESENT'
  | 'ROWS_PRODUCED'
  | 'REAL_MISMATCH_ROWS_ZERO'
  | 'UNSUPPORTED_BLOCKER_ROWS_ZERO'
  | 'BLOCKING_DIVERGENT_ROWS_ZERO'
  | 'BLOCKING_SUMMARY_ONLY_ROWS_ZERO'
  | 'BLOCKING_ENGINE_ONLY_ROWS_ZERO'
  | 'DIAGNOSTIC_ONLY_ROWS_ZERO';

export interface AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult {
  code: AccountingJournalLegalShadowTechnicalAcceptanceThresholdCode;
  passed: boolean;
  actual: number;
  expected: string;
  blockerCode?: string;
}

export interface AccountingJournalLegalShadowTechnicalAcceptanceThresholds {
  legalSamplePresent: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
  rowsProduced: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
  realMismatchRows: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
  unsupportedBlockerRows: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
  blockingDivergentRows: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
  blockingSummaryOnlyRows: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
  blockingEngineOnlyRows: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
  diagnosticOnlyRows: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult;
}

export interface AccountingJournalLegalShadowAcceptedExclusionSignoff {
  required: boolean;
  rows: number;
  reasonCodes: string[];
  rowKeys: string[];
}

export interface AccountingJournalLegalShadowRedBlockerFamily {
  family: string;
  codes: string[];
  rowCount: number;
}

export interface AccountingJournalLegalShadowTechnicalEvidenceField {
  field: string;
  available: boolean;
}

export interface AccountingJournalLegalShadowTechnicalEvidenceChecklist {
  rowLevelFields: AccountingJournalLegalShadowTechnicalEvidenceField[];
  sourceIdentityFields: AccountingJournalLegalShadowTechnicalEvidenceField[];
}

export interface AccountingJournalLegalShadowTechnicalAcceptanceReport {
  status: AccountingJournalLegalShadowTechnicalAcceptanceStatus;
  thresholds: AccountingJournalLegalShadowTechnicalAcceptanceThresholds;
  failingThresholds: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult[];
  acceptedExclusionSignoff: AccountingJournalLegalShadowAcceptedExclusionSignoff;
  redBlockerFamilies: AccountingJournalLegalShadowRedBlockerFamily[];
  evidenceChecklist: AccountingJournalLegalShadowTechnicalEvidenceChecklist;
}

export interface AccountingJournalLegalShadowCompareFilters {
  tenantId: string;
  currency?: string;
  caseId?: string;
  postedFrom?: string | Date;
  postedTo?: string | Date;
}

export interface AccountingJournalLegalShadowCompareRow {
  key: string;
  domain: string;
  sourceType: string;
  sourceAction: string;
  sourceId: string;
  accountCode: string;
  direction: AccountingJournalDirection;
  currency: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
  journalAmount: string | null;
  legalProjectionAmount: string | null;
  delta: string | null;
  matchStatus: AccountingJournalLegalShadowMatchStatus;
  engineLineCount: number;
  summaryLineCount: number;
  blockerCodes: string[];
  zeroingDecision: AccountingJournalLegalShadowZeroingDecision;
  zeroingReasonCode: string;
  zeroingBlocker: boolean;
  legalSourcePolicy?: AccountingJournalLegalSourcePolicyDecision;
  legalSourcePolicyCode?: string;
}

export interface AccountingJournalLegalShadowIssue {
  code: string;
  severity: AccountingJournalLegalShadowSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface AccountingJournalLegalShadowCutoverReadiness {
  safeForPrimaryCutover: boolean;
  safeForOptInShadow: boolean;
  blockers: string[];
  zeroing: AccountingJournalLegalShadowZeroingSummary;
  nextRequiredEvidence: string[];
}

export interface AccountingJournalLegalShadowCoverage {
  journalLineCount: number;
  projectionSourceCount: number;
  legalLedgerEntryCount: number;
  suppressedSourceCount: number;
  comparedRows: number;
  matchRows: number;
  divergentRows: number;
  summaryOnlyRows: number;
  engineOnlyRows: number;
  legalMappedRows: number;
  legalAcceptedExclusionRows: number;
  legalBlockedRows: number;
  zeroedRows: number;
  acceptedExclusionRows: number;
  unsupportedBlockerRows: number;
  realMismatchRows: number;
  diagnosticOnlyRows: number;
  blockingDivergentRows: number;
  blockingSummaryOnlyRows: number;
  blockingEngineOnlyRows: number;
}

export interface AccountingJournalLegalShadowCompareReport {
  tenantId: string;
  filters: AccountingJournalLegalShadowCompareFilters;
  rows: AccountingJournalLegalShadowCompareRow[];
  blockers: AccountingJournalLegalShadowIssue[];
  diagnostics: AccountingJournalLegalShadowIssue[];
  cutoverReadiness: AccountingJournalLegalShadowCutoverReadiness;
  technicalAcceptanceStatus: AccountingJournalLegalShadowTechnicalAcceptanceStatus;
  technicalAcceptance: AccountingJournalLegalShadowTechnicalAcceptanceReport;
  coverage: AccountingJournalLegalShadowCoverage;
}
type ContributionSide = 'ENGINE' | 'SUMMARY';

interface Contribution {
  side: ContributionSide;
  domain: string;
  sourceType: string;
  sourceAction: string;
  sourceId: string;
  accountCode: string;
  direction: AccountingJournalDirection;
  amount: Prisma.Decimal;
  currency: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
  blockerCodes?: string[];
  legalSourcePolicy?: AccountingJournalLegalSourcePolicyDecision;
  legalSourcePolicyCode?: string;
}

interface ShadowAccumulator extends Omit<Contribution, 'side' | 'amount' | 'blockerCodes'> {
  key: string;
  engineAmount: Prisma.Decimal;
  summaryAmount: Prisma.Decimal;
  engineLineCount: number;
  summaryLineCount: number;
  blockerCodes: Set<string>;
  legalSourcePolicy?: AccountingJournalLegalSourcePolicyDecision;
  legalSourcePolicyCode?: string;
}

type JournalLineRow = {
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: Prisma.Decimal;
  currency: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
  journalEntry: {
    sourceType: string;
    sourceAction: string;
    sourceId: string;
  };
};

type CollectionDispositionLineRow = {
  id: string;
  type: string;
  amount: Prisma.Decimal;
  caseClientId: string | null;
  disposition: {
    caseId: string;
    collectionId: string;
    currency: string;
    manualReversalRequiredAt: Date | null;
  };
};

type ClientPayoutRow = {
  id: string;
  tenantId: string;
  caseId: string;
  caseClientId: string;
  amount: Prisma.Decimal;
  currency: string;
};

type ClientOffsetRow = {
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
};

type BalanceLedgerRow = {
  id: string;
  tenantId: string;
  amount: Prisma.Decimal;
  currency: string;
  type: string;
  source: string | null;
  sourceId: string | null;
  caseBalance: { caseId: string };
};

type LedgerEntryRow = {
  id: string;
  tenantId: string;
  caseId: string;
  collectionId: string | null;
  reversesLedgerEntryId: string | null;
  entryType: string;
  amount: Prisma.Decimal;
  currency: string;
  sourceType: string | null;
  sourceId: string | null;
  allocations: Array<{ amount: Prisma.Decimal }>;
};

const ZERO = new Prisma.Decimal(0);

export const LEGAL_LEDGER_SOURCE_POLICY_MATRIX = {
  mappedSourceTypes: {
    COLLECTION_DISPOSITION_LINE: 'posted',
    CLIENT_PAYOUT: 'recorded',
    BALANCE_LEDGER: 'posted',
  },
  conditionalMappedSourceTypes: ['CLIENT_OFFSET'],
  unsupportedClientPayoutEntryTypes: ['REVERSAL', 'REFUND'],
  acceptedExclusionSourceTypes: ['MANUAL', 'MANUEL'],
  unsupportedWorkflowSourceTypes: ['COLLECTION_CANCEL', 'COLLECTION_REVERSAL', 'COLLECTION_BACKFILL'],
} as const;

@Injectable()
export class AccountingJournalLegalShadowCompareService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - PB-018B read-only test/diagnostic seam. Controller ve cutover yok.
  /// </remarks>
  async compare(
    filters: AccountingJournalLegalShadowCompareFilters,
  ): Promise<AccountingJournalLegalShadowCompareReport> {
    const [
      journalLines,
      dispositionLines,
      clientPayouts,
      clientOffsets,
      balanceLedgerRows,
      ledgerEntries,
    ] = await Promise.all([
      this.readJournalLines(filters),
      this.readDispositionLines(filters),
      this.readClientPayouts(filters),
      this.readClientOffsets(filters),
      this.readBalanceLedgerRows(filters),
      this.readLedgerEntries(filters),
    ]);

    const contributions: Contribution[] = [];
    const diagnostics: AccountingJournalLegalShadowIssue[] = [];

    for (const line of journalLines) contributions.push(journalLineContribution(line));
    for (const line of dispositionLines) {
      contributions.push(...dispositionLineContributions(filters.tenantId, line));
    }
    for (const payout of clientPayouts) {
      contributions.push(...clientPayoutContributions(payout));
    }
    for (const offset of clientOffsets) {
      contributions.push(...clientOffsetContributions(offset));
    }

    let suppressedSourceCount = 0;
    for (const ledger of balanceLedgerRows) {
      const correlatedDispositionLineId = dispositionLineCorrelation(ledger);
      if (correlatedDispositionLineId) {
        suppressedSourceCount += 1;
        diagnostics.push(issue(
          'SUPPRESSED_CORRELATED_BALANCE_LEDGER',
          'INFO',
          `BalanceLedger ${ledger.id} disposition line ${correlatedDispositionLineId} ile korele oldugu icin ayri shadow source sayilmadi.`,
          { balanceLedgerId: ledger.id, dispositionLineId: correlatedDispositionLineId },
        ));
        continue;
      }
      contributions.push(...balanceLedgerContributions(ledger));
    }

    for (const entry of ledgerEntries) {
      contributions.push(ledgerEntryContribution(entry));
    }

    const rows = rowsFromContributions(contributions);
    const zeroing = zeroingSummaryFromRows(rows);
    const blockers = blockersFromRows(rows, ledgerEntries.length);
    const cutover = cutoverReadiness(rows, blockers, ledgerEntries.length, zeroing);
    const technicalAcceptance = technicalAcceptanceReport({
      rows,
      blockers,
      legalLedgerEntryCount: ledgerEntries.length,
      zeroing,
      cutoverReadiness: cutover,
    });
    const coverage = coverageFromRows({
      rows,
      journalLineCount: journalLines.length,
      projectionSourceCount: dispositionLines.length + clientPayouts.length + clientOffsets.length + balanceLedgerRows.length,
      legalLedgerEntryCount: ledgerEntries.length,
      suppressedSourceCount,
    });

    return {
      tenantId: filters.tenantId,
      filters,
      rows,
      blockers,
      diagnostics,
      cutoverReadiness: cutover,
      technicalAcceptanceStatus: technicalAcceptance.status,
      technicalAcceptance,
      coverage,
    };
  }

  private readJournalLines(filters: AccountingJournalLegalShadowCompareFilters): Promise<JournalLineRow[]> {
    const postedAt = dateRange(filters.postedFrom, filters.postedTo);
    return this.prisma.accountingJournalLine.findMany({
      where: {
        tenantId: filters.tenantId,
        ...(filters.currency ? { currency: filters.currency } : {}),
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        journalEntry: {
          tenantId: filters.tenantId,
          ...(postedAt ? { postedAt } : {}),
        },
      },
      select: {
        accountCode: true,
        direction: true,
        amount: true,
        currency: true,
        caseId: true,
        clientId: true,
        caseClientId: true,
        journalEntry: {
          select: {
            sourceType: true,
            sourceAction: true,
            sourceId: true,
          },
        },
      },
      orderBy: [{ accountCode: 'asc' }, { currency: 'asc' }, { lineNo: 'asc' }],
    }) as Promise<JournalLineRow[]>;
  }

  private readDispositionLines(
    filters: AccountingJournalLegalShadowCompareFilters,
  ): Promise<CollectionDispositionLineRow[]> {
    const postedAt = dateRange(filters.postedFrom, filters.postedTo);
    return this.prisma.collectionDispositionLine.findMany({
      where: {
        disposition: {
          tenantId: filters.tenantId,
          status: 'POSTED',
          ...(filters.caseId ? { caseId: filters.caseId } : {}),
          ...(filters.currency ? { currency: filters.currency } : {}),
          ...(postedAt ? { postedAt } : {}),
        },
      },
      select: {
        id: true,
        type: true,
        amount: true,
        caseClientId: true,
        disposition: {
          select: {
            caseId: true,
            collectionId: true,
            currency: true,
            manualReversalRequiredAt: true,
          },
        },
      },
    }) as Promise<CollectionDispositionLineRow[]>;
  }

  private readClientPayouts(filters: AccountingJournalLegalShadowCompareFilters): Promise<ClientPayoutRow[]> {
    const paidAt = dateRange(filters.postedFrom, filters.postedTo);
    return this.prisma.clientPayout.findMany({
      where: {
        tenantId: filters.tenantId,
        status: 'RECORDED',
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.currency ? { currency: filters.currency } : {}),
        ...(paidAt ? { paidAt } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        caseId: true,
        caseClientId: true,
        amount: true,
        currency: true,
      },
    }) as Promise<ClientPayoutRow[]>;
  }

  private readClientOffsets(filters: AccountingJournalLegalShadowCompareFilters): Promise<ClientOffsetRow[]> {
    const createdAt = dateRange(filters.postedFrom, filters.postedTo);
    return this.prisma.clientOffset.findMany({
      where: {
        tenantId: filters.tenantId,
        ...(filters.currency ? { currency: filters.currency } : {}),
        ...(filters.caseId ? { OR: [{ payableCaseId: filters.caseId }, { expenseCaseId: filters.caseId }] } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
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
      },
    }) as Promise<ClientOffsetRow[]>;
  }

  private readBalanceLedgerRows(filters: AccountingJournalLegalShadowCompareFilters): Promise<BalanceLedgerRow[]> {
    const createdAt = dateRange(filters.postedFrom, filters.postedTo);
    return this.prisma.balanceLedger.findMany({
      where: {
        tenantId: filters.tenantId,
        ...(filters.currency ? { currency: filters.currency } : {}),
        ...(filters.caseId ? { caseBalance: { caseId: filters.caseId } } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        amount: true,
        currency: true,
        type: true,
        source: true,
        sourceId: true,
        caseBalance: { select: { caseId: true } },
      },
    }) as Promise<BalanceLedgerRow[]>;
  }

  private readLedgerEntries(filters: AccountingJournalLegalShadowCompareFilters): Promise<LedgerEntryRow[]> {
    const entryDate = dateRange(filters.postedFrom, filters.postedTo);
    return this.prisma.ledgerEntry.findMany({
      where: {
        tenantId: filters.tenantId,
        status: 'CONFIRMED',
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.currency ? { currency: filters.currency } : {}),
        ...(entryDate ? { entryDate } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        caseId: true,
        collectionId: true,
        reversesLedgerEntryId: true,
        entryType: true,
        amount: true,
        currency: true,
        sourceType: true,
        sourceId: true,
        allocations: { select: { amount: true } },
      },
    }) as Promise<LedgerEntryRow[]>;
  }
}

function journalLineContribution(line: JournalLineRow): Contribution {
  return {
    side: 'ENGINE',
    domain: domainForSource(line.journalEntry.sourceType),
    sourceType: line.journalEntry.sourceType,
    sourceAction: line.journalEntry.sourceAction,
    sourceId: line.journalEntry.sourceId,
    accountCode: line.accountCode,
    direction: line.direction,
    amount: decimal(line.amount),
    currency: line.currency,
    caseId: line.caseId,
    clientId: line.clientId,
    caseClientId: line.caseClientId,
  };
}

function dispositionLineContributions(
  tenantId: string,
  line: CollectionDispositionLineRow,
): Contribution[] {
  if (line.disposition.manualReversalRequiredAt) {
    return [summaryOnlyBlocked({
      tenantId,
      domain: 'COLLECTION_DISTRIBUTION',
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceAction: 'posted',
      sourceId: line.id,
      accountCode: 'UNMAPPED_DISPOSITION_MANUAL_REVERSAL',
      amount: line.amount,
      currency: line.disposition.currency,
      caseId: line.disposition.caseId,
      caseClientId: line.caseClientId,
      blockerCode: 'MANUAL_REVERSAL_DISPOSITION_LINE_UNMAPPED',
    })];
  }

  const creditAccount = dispositionCreditAccount(line.type);
  if (!creditAccount) {
    return [summaryOnlyBlocked({
      tenantId,
      domain: 'COLLECTION_DISTRIBUTION',
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceAction: 'posted',
      sourceId: line.id,
      accountCode: 'UNSUPPORTED_DISPOSITION_LINE_TYPE',
      amount: line.amount,
      currency: line.disposition.currency,
      caseId: line.disposition.caseId,
      caseClientId: line.caseClientId,
      blockerCode: 'UNSUPPORTED_DISPOSITION_LINE_TYPE',
    })];
  }

  return [
    summaryContribution({
      domain: 'COLLECTION_DISTRIBUTION',
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceAction: 'posted',
      sourceId: line.id,
      accountCode: 'CASH_CLEARING',
      direction: 'DEBIT',
      amount: line.amount,
      currency: line.disposition.currency,
      caseId: line.disposition.caseId,
      clientId: null,
      caseClientId: line.caseClientId,
    }),
    summaryContribution({
      domain: 'COLLECTION_DISTRIBUTION',
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceAction: 'posted',
      sourceId: line.id,
      accountCode: creditAccount,
      direction: 'CREDIT',
      amount: line.amount,
      currency: line.disposition.currency,
      caseId: line.disposition.caseId,
      clientId: null,
      caseClientId: line.caseClientId,
    }),
  ];
}

function clientPayoutContributions(payout: ClientPayoutRow): Contribution[] {
  return [
    summaryContribution({
      domain: 'CLIENT_PAYOUT',
      sourceType: 'CLIENT_PAYOUT',
      sourceAction: 'recorded',
      sourceId: payout.id,
      accountCode: 'CLIENT_PAYABLE',
      direction: 'DEBIT',
      amount: payout.amount,
      currency: payout.currency,
      caseId: payout.caseId,
      clientId: null,
      caseClientId: payout.caseClientId,
    }),
    summaryContribution({
      domain: 'CLIENT_PAYOUT',
      sourceType: 'CLIENT_PAYOUT',
      sourceAction: 'recorded',
      sourceId: payout.id,
      accountCode: 'CASH_CLEARING',
      direction: 'CREDIT',
      amount: payout.amount,
      currency: payout.currency,
      caseId: payout.caseId,
      clientId: null,
      caseClientId: payout.caseClientId,
    }),
  ];
}

function clientOffsetContributions(offset: ClientOffsetRow): Contribution[] {
  const isApply = offset.kind === 'APPLY';
  const sourceAction = isApply ? 'apply' : 'reversal';
  return [
    summaryContribution({
      domain: 'CLIENT_OFFSET',
      sourceType: 'CLIENT_OFFSET',
      sourceAction,
      sourceId: offset.id,
      accountCode: 'CLIENT_PAYABLE',
      direction: isApply ? 'DEBIT' : 'CREDIT',
      amount: offset.amount,
      currency: offset.currency,
      caseId: offset.payableCaseId,
      clientId: offset.clientId,
      caseClientId: offset.payableCaseClientId,
    }),
    summaryContribution({
      domain: 'CLIENT_OFFSET',
      sourceType: 'CLIENT_OFFSET',
      sourceAction,
      sourceId: offset.id,
      accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
      direction: isApply ? 'CREDIT' : 'DEBIT',
      amount: offset.amount,
      currency: offset.currency,
      caseId: offset.expenseCaseId,
      clientId: offset.clientId,
      caseClientId: null,
    }),
  ];
}

function balanceLedgerContributions(ledger: BalanceLedgerRow): Contribution[] {
  if (ledger.type !== 'CREDIT' && ledger.type !== 'DEBIT') {
    return [summaryOnlyBlocked({
      tenantId: ledger.tenantId,
      domain: 'CLIENT_ADVANCE',
      sourceType: 'BALANCE_LEDGER',
      sourceAction: 'posted',
      sourceId: ledger.id,
      accountCode: 'UNSUPPORTED_BALANCE_LEDGER_TYPE',
      amount: absoluteDecimal(ledger.amount),
      currency: ledger.currency,
      caseId: ledger.caseBalance.caseId,
      caseClientId: null,
      blockerCode: 'UNSUPPORTED_BALANCE_LEDGER_TYPE',
    })];
  }

  const isIncrease = ledger.type === 'CREDIT';
  return [
    summaryContribution({
      domain: 'CLIENT_ADVANCE',
      sourceType: 'BALANCE_LEDGER',
      sourceAction: 'posted',
      sourceId: ledger.id,
      accountCode: isIncrease ? 'CASH_CLEARING' : 'CLIENT_ADVANCE_BALANCE',
      direction: 'DEBIT',
      amount: absoluteDecimal(ledger.amount),
      currency: ledger.currency,
      caseId: ledger.caseBalance.caseId,
      clientId: null,
      caseClientId: null,
    }),
    summaryContribution({
      domain: 'CLIENT_ADVANCE',
      sourceType: 'BALANCE_LEDGER',
      sourceAction: 'posted',
      sourceId: ledger.id,
      accountCode: isIncrease ? 'CLIENT_ADVANCE_BALANCE' : 'CASH_CLEARING',
      direction: 'CREDIT',
      amount: absoluteDecimal(ledger.amount),
      currency: ledger.currency,
      caseId: ledger.caseBalance.caseId,
      clientId: null,
      caseClientId: null,
    }),
  ];
}

function ledgerEntryContribution(entry: LedgerEntryRow): Contribution {
  const policy = legalLedgerSourcePolicy(entry);
  const allocationTotal = entry.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), ZERO);
  const amount = allocationTotal.isZero() ? absoluteDecimal(entry.amount) : absoluteDecimal(allocationTotal);
  return summaryContribution({
    domain: policy.domain,
    sourceType: policy.sourceType,
    sourceAction: policy.sourceAction,
    sourceId: policy.sourceId,
    accountCode: 'LEGAL_LEDGER_ALLOCATED_AMOUNT',
    direction: 'DEBIT',
    amount,
    currency: entry.currency,
    caseId: entry.caseId,
    clientId: null,
    caseClientId: null,
    blockerCodes: policy.blockerCodes,
    legalSourcePolicy: policy.decision,
    legalSourcePolicyCode: policy.code,
  });
}

interface LegalLedgerSourcePolicy {
  decision: AccountingJournalLegalSourcePolicyDecision;
  code: string;
  domain: string;
  sourceType: string;
  sourceAction: string;
  sourceId: string;
  blockerCodes: string[];
}

function legalLedgerSourcePolicy(entry: LedgerEntryRow): LegalLedgerSourcePolicy {
  const normalizedSourceType = normalizeLegalSourceType(entry.sourceType);
  const unsupportedWorkflow = unsupportedLegalWorkflowCode(entry, normalizedSourceType);
  if (unsupportedWorkflow) {
    return blockedLegalPolicy(entry, unsupportedWorkflow);
  }

  const unsupportedSourceAction = unsupportedLegalSourceActionCode(entry, normalizedSourceType);
  if (unsupportedSourceAction) {
    return blockedLegalPolicy(entry, unsupportedSourceAction);
  }

  const mappedAction = mappedLegalSourceAction(normalizedSourceType, entry);
  if (mappedAction && entry.sourceId) {
    return {
      decision: 'MAPPED',
      code: 'LEGAL_LEDGER_SOURCE_MAPPED',
      domain: domainForSource(normalizedSourceType as string),
      sourceType: normalizedSourceType as string,
      sourceAction: mappedAction,
      sourceId: entry.sourceId,
      blockerCodes: [],
    };
  }

  if (isAcceptedLegalExclusion(normalizedSourceType, entry.sourceId)) {
    return {
      decision: 'ACCEPTED_EXCLUSION',
      code: 'LEGAL_LEDGER_ACCEPTED_EXCLUSION',
      domain: 'LEGAL_LEDGER',
      sourceType: 'LEGAL_LEDGER',
      sourceAction: String(entry.entryType).toLowerCase(),
      sourceId: entry.id,
      blockerCodes: ['LEGAL_LEDGER_ACCEPTED_EXCLUSION'],
    };
  }

  return blockedLegalPolicy(entry, 'LEGAL_LEDGER_SOURCE_UNMAPPED');
}

function blockedLegalPolicy(entry: LedgerEntryRow, code: string): LegalLedgerSourcePolicy {
  return {
    decision: 'BLOCKED',
    code,
    domain: 'LEGAL_LEDGER',
    sourceType: 'LEGAL_LEDGER',
    sourceAction: String(entry.entryType).toLowerCase(),
    sourceId: entry.id,
    blockerCodes: ['LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED', code],
  };
}

function normalizeLegalSourceType(sourceType: string | null): string | null {
  const normalized = sourceType?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function mappedLegalSourceAction(sourceType: string | null, entry: LedgerEntryRow): string | null {
  if (!sourceType) return null;
  if (sourceType === 'CLIENT_OFFSET') return entry.entryType === 'REVERSAL' ? 'reversal' : 'apply';
  return LEGAL_LEDGER_SOURCE_POLICY_MATRIX.mappedSourceTypes[
    sourceType as keyof typeof LEGAL_LEDGER_SOURCE_POLICY_MATRIX.mappedSourceTypes
  ] ?? null;
}

function isAcceptedLegalExclusion(sourceType: string | null, sourceId: string | null): boolean {
  if (!sourceType || !sourceId) return false;
  return LEGAL_LEDGER_SOURCE_POLICY_MATRIX.acceptedExclusionSourceTypes.includes(
    sourceType as typeof LEGAL_LEDGER_SOURCE_POLICY_MATRIX.acceptedExclusionSourceTypes[number],
  );
}

function unsupportedLegalSourceActionCode(entry: LedgerEntryRow, sourceType: string | null): string | null {
  if (sourceType === 'CLIENT_PAYOUT' && LEGAL_LEDGER_SOURCE_POLICY_MATRIX.unsupportedClientPayoutEntryTypes.includes(
    entry.entryType as typeof LEGAL_LEDGER_SOURCE_POLICY_MATRIX.unsupportedClientPayoutEntryTypes[number],
  )) {
    return 'LEGAL_LEDGER_UNSUPPORTED_CLIENT_PAYOUT_REVERSAL_REFUND';
  }
  return null;
}

function unsupportedLegalWorkflowCode(entry: LedgerEntryRow, sourceType: string | null): string | null {
  if (sourceType && LEGAL_LEDGER_SOURCE_POLICY_MATRIX.unsupportedWorkflowSourceTypes.includes(
    sourceType as typeof LEGAL_LEDGER_SOURCE_POLICY_MATRIX.unsupportedWorkflowSourceTypes[number],
  )) {
    return 'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL';
  }
  if (!sourceType && (entry.entryType === 'REVERSAL' || entry.reversesLedgerEntryId)) {
    return 'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL';
  }
  return null;
}

function summaryContribution(input: Omit<Contribution, 'side' | 'amount'> & {
  amount: Prisma.Decimal | string | number;
}): Contribution {
  return {
    ...input,
    side: 'SUMMARY',
    amount: decimal(input.amount),
  };
}

function summaryOnlyBlocked(input: {
  tenantId: string;
  domain: string;
  sourceType: string;
  sourceAction: string;
  sourceId: string;
  accountCode: string;
  amount: Prisma.Decimal | string | number;
  currency: string;
  caseId: string | null;
  caseClientId: string | null;
  blockerCode: string;
}): Contribution {
  return summaryContribution({
    domain: input.domain,
    sourceType: input.sourceType,
    sourceAction: input.sourceAction,
    sourceId: input.sourceId,
    accountCode: input.accountCode,
    direction: 'CREDIT',
    amount: input.amount,
    currency: input.currency,
    caseId: input.caseId,
    clientId: null,
    caseClientId: input.caseClientId,
    blockerCodes: [input.blockerCode],
  });
}

function rowsFromContributions(contributions: Contribution[]): AccountingJournalLegalShadowCompareRow[] {
  const map = new Map<string, ShadowAccumulator>();
  for (const contribution of contributions) addContribution(map, contribution);

  return [...map.values()]
    .map(rowFromAccumulator)
    .sort(
      (a, b) =>
        a.sourceType.localeCompare(b.sourceType) ||
        a.sourceAction.localeCompare(b.sourceAction) ||
        a.sourceId.localeCompare(b.sourceId) ||
        a.accountCode.localeCompare(b.accountCode) ||
        a.direction.localeCompare(b.direction) ||
        a.currency.localeCompare(b.currency) ||
        (a.caseId ?? '').localeCompare(b.caseId ?? '') ||
        (a.caseClientId ?? '').localeCompare(b.caseClientId ?? ''),
    );
}

function addContribution(map: Map<string, ShadowAccumulator>, contribution: Contribution): void {
  const key = contributionKey(contribution);
  const current = map.get(key) ?? {
    key,
    domain: contribution.domain,
    sourceType: contribution.sourceType,
    sourceAction: contribution.sourceAction,
    sourceId: contribution.sourceId,
    accountCode: contribution.accountCode,
    direction: contribution.direction,
    currency: contribution.currency,
    caseId: contribution.caseId,
    clientId: contribution.clientId,
    caseClientId: contribution.caseClientId,
    engineAmount: ZERO,
    summaryAmount: ZERO,
    engineLineCount: 0,
    summaryLineCount: 0,
    blockerCodes: new Set<string>(),
    legalSourcePolicy: contribution.legalSourcePolicy,
    legalSourcePolicyCode: contribution.legalSourcePolicyCode,
  };

  if (contribution.side === 'ENGINE') {
    current.engineAmount = current.engineAmount.plus(contribution.amount);
    current.engineLineCount += 1;
  } else {
    current.summaryAmount = current.summaryAmount.plus(contribution.amount);
    current.summaryLineCount += 1;
  }
  for (const code of contribution.blockerCodes ?? []) current.blockerCodes.add(code);
  if (contribution.legalSourcePolicy && !current.legalSourcePolicy) current.legalSourcePolicy = contribution.legalSourcePolicy;
  if (contribution.legalSourcePolicyCode && !current.legalSourcePolicyCode) current.legalSourcePolicyCode = contribution.legalSourcePolicyCode;
  map.set(key, current);
}

function rowFromAccumulator(acc: ShadowAccumulator): AccountingJournalLegalShadowCompareRow {
  const hasEngine = acc.engineLineCount > 0;
  const hasSummary = acc.summaryLineCount > 0;
  const delta = hasEngine && hasSummary ? acc.engineAmount.minus(acc.summaryAmount) : null;
  const matchStatus: AccountingJournalLegalShadowMatchStatus =
    hasEngine && hasSummary
      ? delta!.equals(ZERO) ? 'MATCH' : 'DIVERGENT'
      : hasSummary ? 'SUMMARY_ONLY' : 'ENGINE_ONLY';

  const blockerCodes = new Set(acc.blockerCodes);
  if (matchStatus === 'DIVERGENT') blockerCodes.add('DIVERGENT_SHADOW_ROW');
  if (matchStatus === 'SUMMARY_ONLY') blockerCodes.add('SUMMARY_ONLY_SHADOW_ROW');
  if (matchStatus === 'ENGINE_ONLY') blockerCodes.add('ENGINE_ONLY_SHADOW_ROW');

  const zeroing = zeroingDecisionForRow(matchStatus, blockerCodes);

  return {
    key: acc.key,
    domain: acc.domain,
    sourceType: acc.sourceType,
    sourceAction: acc.sourceAction,
    sourceId: acc.sourceId,
    accountCode: acc.accountCode,
    direction: acc.direction,
    currency: acc.currency,
    caseId: acc.caseId,
    clientId: acc.clientId,
    caseClientId: acc.caseClientId,
    journalAmount: hasEngine ? money(acc.engineAmount) : null,
    legalProjectionAmount: hasSummary ? money(acc.summaryAmount) : null,
    delta: delta ? money(delta) : null,
    matchStatus,
    engineLineCount: acc.engineLineCount,
    summaryLineCount: acc.summaryLineCount,
    blockerCodes: [...blockerCodes].sort(),
    zeroingDecision: zeroing.decision,
    zeroingReasonCode: zeroing.reasonCode,
    zeroingBlocker: zeroing.blocker,
    ...(acc.legalSourcePolicy ? { legalSourcePolicy: acc.legalSourcePolicy } : {}),
    ...(acc.legalSourcePolicyCode ? { legalSourcePolicyCode: acc.legalSourcePolicyCode } : {}),
  };
}

interface RowZeroingDecision {
  decision: AccountingJournalLegalShadowZeroingDecision;
  reasonCode: string;
  blocker: boolean;
}

const ACCEPTED_EXCLUSION_ZEROING_CODES = new Set([
  'LEGAL_LEDGER_ACCEPTED_EXCLUSION',
]);

const UNSUPPORTED_ZEROING_CODES = new Set([
  'LEGAL_LEDGER_SOURCE_UNMAPPED',
  'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL',
  'LEGAL_LEDGER_UNSUPPORTED_CLIENT_PAYOUT_REVERSAL_REFUND',
  'MANUAL_REVERSAL_DISPOSITION_LINE_UNMAPPED',
  'UNSUPPORTED_DISPOSITION_LINE_TYPE',
  'UNSUPPORTED_BALANCE_LEDGER_TYPE',
  'LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED',
]);

function zeroingDecisionForRow(
  matchStatus: AccountingJournalLegalShadowMatchStatus,
  blockerCodes: Set<string>,
): RowZeroingDecision {
  const acceptedExclusionCode = firstMatchingCode(blockerCodes, ACCEPTED_EXCLUSION_ZEROING_CODES);
  if (acceptedExclusionCode) {
    return { decision: 'ACCEPTED_EXCLUSION', reasonCode: acceptedExclusionCode, blocker: true };
  }

  const unsupportedCode = firstMatchingCode(blockerCodes, UNSUPPORTED_ZEROING_CODES);
  if (unsupportedCode) {
    return { decision: 'UNSUPPORTED_BLOCKER', reasonCode: unsupportedCode, blocker: true };
  }

  if (matchStatus === 'MATCH') {
    return { decision: 'ZEROED', reasonCode: 'MATCHED_SHADOW_ROW', blocker: false };
  }

  if (matchStatus === 'DIVERGENT') {
    return { decision: 'REAL_MISMATCH', reasonCode: 'DIVERGENT_SHADOW_ROW', blocker: true };
  }
  if (matchStatus === 'SUMMARY_ONLY') {
    return { decision: 'REAL_MISMATCH', reasonCode: 'SUMMARY_ONLY_SHADOW_ROW', blocker: true };
  }
  if (matchStatus === 'ENGINE_ONLY') {
    return { decision: 'REAL_MISMATCH', reasonCode: 'ENGINE_ONLY_SHADOW_ROW', blocker: true };
  }

  return { decision: 'DIAGNOSTIC_ONLY', reasonCode: 'DIAGNOSTIC_ONLY_ROW', blocker: false };
}

function firstMatchingCode(codes: Set<string>, candidates: Set<string>): string | null {
  for (const candidate of candidates) {
    if (codes.has(candidate)) return candidate;
  }
  return null;
}
function blockersFromRows(
  rows: AccountingJournalLegalShadowCompareRow[],
  legalLedgerEntryCount: number,
): AccountingJournalLegalShadowIssue[] {
  const codes = new Set<string>();
  for (const row of rows) {
    for (const code of row.blockerCodes) codes.add(code);
  }
  if (rows.length === 0) codes.add('NO_SHADOW_COMPARE_ROWS');
  if (legalLedgerEntryCount === 0) codes.add('LEGAL_LEDGER_SAMPLE_MISSING');
  return [...codes].sort().map((code) => issue(code, severityForBlocker(code), messageForBlocker(code)));
}

function cutoverReadiness(
  rows: AccountingJournalLegalShadowCompareRow[],
  blockers: AccountingJournalLegalShadowIssue[],
  legalLedgerEntryCount: number,
  zeroing: AccountingJournalLegalShadowZeroingSummary,
): AccountingJournalLegalShadowCutoverReadiness {
  const blockerCodes = blockers.map((blocker) => blocker.code);
  return {
    safeForPrimaryCutover: rows.length > 0 && legalLedgerEntryCount > 0 && blockerCodes.length === 0,
    safeForOptInShadow: rows.length > 0,
    blockers: blockerCodes,
    zeroing,
    nextRequiredEvidence: [
      'LedgerEntry/LedgerAllocation icin MAPPED, ACCEPTED_EXCLUSION veya BLOCKED policy karari.',
      'Accepted exclusion legal satirlari sessiz dusmeden raporda gorunur blocker olarak kalmali.',
      'CollectionDisposition/ClientPayout/ClientOffset/BalanceLedger fixture matrix: MATCH, DIVERGENT, SUMMARY_ONLY, ENGINE_ONLY.',
      'Zeroing report: accepted exclusion, unsupported blocker ve real mismatch ayrimi sifirlanmali.',
      'Cancel/reversal/backfill ve payout refund alanlari icin ya mapped compare ya fail-closed blocker.',
      'Feature flag ve legal sign-off olmadan primary cutover acma.',
    ],
  };
}

function technicalAcceptanceReport(input: {
  rows: AccountingJournalLegalShadowCompareRow[];
  blockers: AccountingJournalLegalShadowIssue[];
  legalLedgerEntryCount: number;
  zeroing: AccountingJournalLegalShadowZeroingSummary;
  cutoverReadiness: AccountingJournalLegalShadowCutoverReadiness;
}): AccountingJournalLegalShadowTechnicalAcceptanceReport {
  const thresholds = technicalAcceptanceThresholds(input);
  const failingThresholds = Object.values(thresholds).filter((threshold) => !threshold.passed);
  const acceptedExclusionSignoff = acceptedExclusionSignoffFromRows(input.rows);
  const redBlockerFamilies = redBlockerFamiliesFromRows(input.rows, input.blockers);
  const status = technicalAcceptanceStatus({
    failingThresholds,
    acceptedExclusionSignoff,
    redBlockerFamilies,
    cutoverReadiness: input.cutoverReadiness,
  });

  return {
    status,
    thresholds,
    failingThresholds,
    acceptedExclusionSignoff,
    redBlockerFamilies,
    evidenceChecklist: technicalEvidenceChecklist(input.rows),
  };
}

function technicalAcceptanceThresholds(input: {
  rows: AccountingJournalLegalShadowCompareRow[];
  legalLedgerEntryCount: number;
  zeroing: AccountingJournalLegalShadowZeroingSummary;
}): AccountingJournalLegalShadowTechnicalAcceptanceThresholds {
  return {
    legalSamplePresent: thresholdResult('LEGAL_SAMPLE_PRESENT', input.legalLedgerEntryCount, '> 0', input.legalLedgerEntryCount > 0, 'LEGAL_LEDGER_SAMPLE_MISSING'),
    rowsProduced: thresholdResult('ROWS_PRODUCED', input.rows.length, '> 0', input.rows.length > 0, 'NO_SHADOW_COMPARE_ROWS'),
    realMismatchRows: thresholdResult('REAL_MISMATCH_ROWS_ZERO', input.zeroing.realMismatchRows, '0', input.zeroing.realMismatchRows === 0),
    unsupportedBlockerRows: thresholdResult('UNSUPPORTED_BLOCKER_ROWS_ZERO', input.zeroing.unsupportedBlockerRows, '0', input.zeroing.unsupportedBlockerRows === 0),
    blockingDivergentRows: thresholdResult('BLOCKING_DIVERGENT_ROWS_ZERO', input.zeroing.blockingDivergentRows, '0', input.zeroing.blockingDivergentRows === 0, 'DIVERGENT_SHADOW_ROW'),
    blockingSummaryOnlyRows: thresholdResult('BLOCKING_SUMMARY_ONLY_ROWS_ZERO', input.zeroing.blockingSummaryOnlyRows, '0', input.zeroing.blockingSummaryOnlyRows === 0, 'SUMMARY_ONLY_SHADOW_ROW'),
    blockingEngineOnlyRows: thresholdResult('BLOCKING_ENGINE_ONLY_ROWS_ZERO', input.zeroing.blockingEngineOnlyRows, '0', input.zeroing.blockingEngineOnlyRows === 0, 'ENGINE_ONLY_SHADOW_ROW'),
    diagnosticOnlyRows: thresholdResult('DIAGNOSTIC_ONLY_ROWS_ZERO', input.zeroing.diagnosticOnlyRows, '0', input.zeroing.diagnosticOnlyRows === 0),
  };
}

function thresholdResult(
  code: AccountingJournalLegalShadowTechnicalAcceptanceThresholdCode,
  actual: number,
  expected: string,
  passed: boolean,
  blockerCode?: string,
): AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult {
  return {
    code,
    passed,
    actual,
    expected,
    ...(blockerCode ? { blockerCode } : {}),
  };
}

function acceptedExclusionSignoffFromRows(
  rows: AccountingJournalLegalShadowCompareRow[],
): AccountingJournalLegalShadowAcceptedExclusionSignoff {
  const acceptedRows = rows.filter((row) => row.zeroingDecision === 'ACCEPTED_EXCLUSION');
  return {
    required: acceptedRows.length > 0,
    rows: acceptedRows.length,
    reasonCodes: uniqueSorted(acceptedRows.map((row) => row.zeroingReasonCode)),
    rowKeys: uniqueSorted(acceptedRows.map((row) => row.key)),
  };
}

function technicalAcceptanceStatus(input: {
  failingThresholds: AccountingJournalLegalShadowTechnicalAcceptanceThresholdResult[];
  acceptedExclusionSignoff: AccountingJournalLegalShadowAcceptedExclusionSignoff;
  redBlockerFamilies: AccountingJournalLegalShadowRedBlockerFamily[];
  cutoverReadiness: AccountingJournalLegalShadowCutoverReadiness;
}): AccountingJournalLegalShadowTechnicalAcceptanceStatus {
  if (input.failingThresholds.length > 0 || input.redBlockerFamilies.length > 0) {
    return 'BLOCKED';
  }
  if (input.acceptedExclusionSignoff.required || !input.cutoverReadiness.safeForPrimaryCutover) {
    return 'READY_FOR_LEGAL_SIGNOFF';
  }
  return 'READY_FOR_PRIMARY_CUTOVER';
}

const RED_BLOCKER_FAMILY_BY_CODE: Record<string, string> = {
  NO_SHADOW_COMPARE_ROWS: 'SAMPLE_READINESS',
  ENGINE_ONLY_SHADOW_ROW: 'ROW_MISMATCH',
  SUMMARY_ONLY_SHADOW_ROW: 'ROW_MISMATCH',
  DIVERGENT_SHADOW_ROW: 'ROW_MISMATCH',
  LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED: 'LEGAL_SOURCE_MAPPING',
  LEGAL_LEDGER_SOURCE_UNMAPPED: 'LEGAL_SOURCE_MAPPING',
  LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL: 'UNSUPPORTED_CANCEL_REVERSAL_BACKFILL',
  LEGAL_LEDGER_UNSUPPORTED_CLIENT_PAYOUT_REVERSAL_REFUND: 'UNSUPPORTED_CLIENT_PAYOUT_REVERSAL_REFUND',
  MANUAL_REVERSAL_DISPOSITION_LINE_UNMAPPED: 'UNSUPPORTED_PROJECTION_SOURCE',
  UNSUPPORTED_DISPOSITION_LINE_TYPE: 'UNSUPPORTED_PROJECTION_SOURCE',
  UNSUPPORTED_BALANCE_LEDGER_TYPE: 'UNSUPPORTED_PROJECTION_SOURCE',
};

const ROW_LEVEL_RED_BLOCKER_CODES = new Set([
  'ENGINE_ONLY_SHADOW_ROW',
  'SUMMARY_ONLY_SHADOW_ROW',
  'DIVERGENT_SHADOW_ROW',
  'LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED',
  'LEGAL_LEDGER_SOURCE_UNMAPPED',
  'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL',
  'LEGAL_LEDGER_UNSUPPORTED_CLIENT_PAYOUT_REVERSAL_REFUND',
  'MANUAL_REVERSAL_DISPOSITION_LINE_UNMAPPED',
  'UNSUPPORTED_DISPOSITION_LINE_TYPE',
  'UNSUPPORTED_BALANCE_LEDGER_TYPE',
]);

function redBlockerFamiliesFromRows(
  rows: AccountingJournalLegalShadowCompareRow[],
  blockers: AccountingJournalLegalShadowIssue[],
): AccountingJournalLegalShadowRedBlockerFamily[] {
  const families = new Map<string, { codes: Set<string>; rowKeys: Set<string> }>();
  for (const blocker of blockers.filter((candidate) => candidate.severity === 'RED')) {
    const family = RED_BLOCKER_FAMILY_BY_CODE[blocker.code] ?? 'OTHER_RED_BLOCKER';
    const blockerRows = rows.filter(
      (row) => row.zeroingDecision !== 'ACCEPTED_EXCLUSION' && row.blockerCodes.includes(blocker.code),
    );
    if (ROW_LEVEL_RED_BLOCKER_CODES.has(blocker.code) && blockerRows.length === 0) continue;

    const entry = families.get(family) ?? { codes: new Set<string>(), rowKeys: new Set<string>() };
    entry.codes.add(blocker.code);
    for (const row of blockerRows) entry.rowKeys.add(row.key);
    families.set(family, entry);
  }

  return [...families.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, entry]) => ({
      family,
      codes: [...entry.codes].sort(),
      rowCount: entry.rowKeys.size,
    }));
}

const ROW_LEVEL_EVIDENCE_FIELDS = [
  'zeroingDecision',
  'zeroingReasonCode',
  'blockerCodes',
  'journalAmount',
  'legalProjectionAmount',
  'delta',
] as const;

const SOURCE_IDENTITY_EVIDENCE_FIELDS = [
  'domain',
  'sourceType',
  'sourceAction',
  'sourceId',
  'accountCode',
  'direction',
  'currency',
  'caseId',
  'clientId',
  'caseClientId',
] as const;

function technicalEvidenceChecklist(
  rows: AccountingJournalLegalShadowCompareRow[],
): AccountingJournalLegalShadowTechnicalEvidenceChecklist {
  return {
    rowLevelFields: ROW_LEVEL_EVIDENCE_FIELDS.map((field) => evidenceField(field, rows)),
    sourceIdentityFields: SOURCE_IDENTITY_EVIDENCE_FIELDS.map((field) => evidenceField(field, rows)),
  };
}

function evidenceField(field: string, rows: AccountingJournalLegalShadowCompareRow[]): AccountingJournalLegalShadowTechnicalEvidenceField {
  return {
    field,
    available: rows.length > 0 && rows.every((row) => Object.prototype.hasOwnProperty.call(row, field)),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
function zeroingSummaryFromRows(rows: AccountingJournalLegalShadowCompareRow[]): AccountingJournalLegalShadowZeroingSummary {
  return {
    zeroedRows: rows.filter((row) => row.zeroingDecision === 'ZEROED').length,
    acceptedExclusionRows: rows.filter((row) => row.zeroingDecision === 'ACCEPTED_EXCLUSION').length,
    unsupportedBlockerRows: rows.filter((row) => row.zeroingDecision === 'UNSUPPORTED_BLOCKER').length,
    realMismatchRows: rows.filter((row) => row.zeroingDecision === 'REAL_MISMATCH').length,
    diagnosticOnlyRows: rows.filter((row) => row.zeroingDecision === 'DIAGNOSTIC_ONLY').length,
    blockingDivergentRows: rows.filter((row) => row.zeroingBlocker && row.zeroingDecision !== 'ACCEPTED_EXCLUSION' && row.matchStatus === 'DIVERGENT').length,
    blockingSummaryOnlyRows: rows.filter((row) => row.zeroingBlocker && row.zeroingDecision !== 'ACCEPTED_EXCLUSION' && row.matchStatus === 'SUMMARY_ONLY').length,
    blockingEngineOnlyRows: rows.filter((row) => row.zeroingBlocker && row.zeroingDecision !== 'ACCEPTED_EXCLUSION' && row.matchStatus === 'ENGINE_ONLY').length,
  };
}

function coverageFromRows(input: {
  rows: AccountingJournalLegalShadowCompareRow[];
  journalLineCount: number;
  projectionSourceCount: number;
  legalLedgerEntryCount: number;
  suppressedSourceCount: number;
}): AccountingJournalLegalShadowCoverage {
  return {
    journalLineCount: input.journalLineCount,
    projectionSourceCount: input.projectionSourceCount,
    legalLedgerEntryCount: input.legalLedgerEntryCount,
    suppressedSourceCount: input.suppressedSourceCount,
    comparedRows: input.rows.length,
    matchRows: input.rows.filter((row) => row.matchStatus === 'MATCH').length,
    divergentRows: input.rows.filter((row) => row.matchStatus === 'DIVERGENT').length,
    summaryOnlyRows: input.rows.filter((row) => row.matchStatus === 'SUMMARY_ONLY').length,
    engineOnlyRows: input.rows.filter((row) => row.matchStatus === 'ENGINE_ONLY').length,
    legalMappedRows: input.rows.filter((row) => row.legalSourcePolicy === 'MAPPED').length,
    legalAcceptedExclusionRows: input.rows.filter((row) => row.legalSourcePolicy === 'ACCEPTED_EXCLUSION').length,
    legalBlockedRows: input.rows.filter((row) => row.legalSourcePolicy === 'BLOCKED').length,
    ...zeroingSummaryFromRows(input.rows),
  };
}

function contributionKey(input: Contribution): string {
  return [
    input.sourceType,
    input.sourceAction,
    input.sourceId,
    input.accountCode,
    input.direction,
    input.currency,
    input.caseId ?? '',
    input.clientId ?? '',
    input.caseClientId ?? '',
  ].join('|');
}

function dateRange(
  from: AccountingJournalLegalShadowCompareFilters['postedFrom'],
  to: AccountingJournalLegalShadowCompareFilters['postedTo'],
): Prisma.DateTimeFilter | null {
  if (!from && !to) return null;
  return {
    ...(from ? { gte: toDate(from) } : {}),
    ...(to ? { lte: toDate(to) } : {}),
  };
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function decimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(value as Prisma.Decimal.Value);
}

function absoluteDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  const amount = decimal(value);
  return amount.lt(0) ? amount.negated() : amount;
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function dispositionCreditAccount(type: string): AccountingAccountCode | null {
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

function domainForSource(sourceType: string): string {
  switch (sourceType) {
    case 'COLLECTION_DISPOSITION_LINE':
      return 'COLLECTION_DISTRIBUTION';
    case 'CLIENT_PAYOUT':
      return 'CLIENT_PAYOUT';
    case 'CLIENT_OFFSET':
      return 'CLIENT_OFFSET';
    case 'BALANCE_LEDGER':
      return 'CLIENT_ADVANCE';
    case 'LEGAL_LEDGER':
      return 'LEGAL_LEDGER';
    default:
      return 'UNKNOWN';
  }
}

function dispositionLineCorrelation(ledger: BalanceLedgerRow): string | null {
  return parseDispositionLineSource(ledger.sourceId)
    ?? parseDispositionLineSource(ledger.source)
    ?? (ledger.source === 'disposition_line' ? ledger.sourceId : null);
}

function parseDispositionLineSource(value: string | null): string | null {
  if (!value) return null;
  const prefix = 'disposition_line:';
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function issue(
  code: string,
  severity: AccountingJournalLegalShadowSeverity,
  message: string,
  details?: Record<string, unknown>,
): AccountingJournalLegalShadowIssue {
  return {
    code,
    severity,
    message,
    ...(details ? { details } : {}),
  };
}

function severityForBlocker(code: string): AccountingJournalLegalShadowSeverity {
  if (code === 'LEGAL_LEDGER_SAMPLE_MISSING') return 'YELLOW';
  if (code === 'NO_SHADOW_COMPARE_ROWS') return 'RED';
  if (code === 'ENGINE_ONLY_SHADOW_ROW') return 'RED';
  if (code === 'SUMMARY_ONLY_SHADOW_ROW') return 'RED';
  if (code === 'DIVERGENT_SHADOW_ROW') return 'RED';
  if (code === 'LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED') return 'RED';
  if (code === 'LEGAL_LEDGER_SOURCE_UNMAPPED') return 'RED';
  if (code === 'LEGAL_LEDGER_ACCEPTED_EXCLUSION') return 'YELLOW';
  if (code === 'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL') return 'RED';
  if (code === 'LEGAL_LEDGER_UNSUPPORTED_CLIENT_PAYOUT_REVERSAL_REFUND') return 'RED';
  return 'RED';
}

function messageForBlocker(code: string): string {
  switch (code) {
    case 'LEGAL_LEDGER_SAMPLE_MISSING':
      return 'Legal ledger sample yok; PB-018B cutover kaniti tamamlanmis sayilamaz.';
    case 'NO_SHADOW_COMPARE_ROWS':
      return 'Shadow compare icin AccountingJournal veya legal/projection satiri bulunamadi.';
    case 'ENGINE_ONLY_SHADOW_ROW':
      return 'AccountingJournal satiri var ancak legal/projection karsiligi yok.';
    case 'SUMMARY_ONLY_SHADOW_ROW':
      return 'Legal/projection satiri var ancak AccountingJournal karsiligi yok.';
    case 'DIVERGENT_SHADOW_ROW':
      return 'AccountingJournal ile legal/projection tutarlari farkli.';
    case 'LEGAL_LEDGER_ACCOUNTING_SOURCE_UNMAPPED':
      return 'LedgerEntry/LedgerAllocation icin AccountingJournal source mapping henuz yok.';
    case 'LEGAL_LEDGER_SOURCE_UNMAPPED':
      return 'Legal ledger source AccountingJournal source identity olarak map edilemiyor.';
    case 'LEGAL_LEDGER_ACCEPTED_EXCLUSION':
      return 'Legal ledger source acik accepted exclusion kapsaminda; sessiz dusmez ve signoff kaniti ister.';
    case 'LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL':
      return 'Legal ledger cancel/reversal/backfill kaynagi AccountingJournal primary cutover kapsaminda desteklenmiyor.';
    case 'LEGAL_LEDGER_UNSUPPORTED_CLIENT_PAYOUT_REVERSAL_REFUND':
      return 'ClientPayout reversal/refund legal ledger kaynagi AccountingJournal primary cutover kapsaminda desteklenmiyor.';
    case 'MANUAL_REVERSAL_DISPOSITION_LINE_UNMAPPED':
      return 'Manual reversal marker tasiyan disposition line auto-compare/cutover disinda.';
    case 'UNSUPPORTED_DISPOSITION_LINE_TYPE':
      return 'Disposition line tipi otomatik journal mapping disinda.';
    case 'UNSUPPORTED_BALANCE_LEDGER_TYPE':
      return 'BalanceLedger ADJUST/REFUND tipi auto-post/compare disinda.';
    default:
      return code;
  }
}
