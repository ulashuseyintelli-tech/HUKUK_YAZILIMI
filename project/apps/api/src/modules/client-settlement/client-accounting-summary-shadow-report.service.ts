import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ClientAccountingSummaryShadowCandidateStatus = 'BLOCKED';

export type ClientAccountingSummaryShadowComponentCoverage =
  | 'JOURNAL_SUPPORTED'
  | 'BLOCKER'
  | 'GAP';

export type ClientAccountingSummaryShadowComponentGroup =
  | 'CLIENT_SCOPED'
  | 'CASE_SCOPED_CONTEXT'
  | 'DERIVED';

export type ClientAccountingSummaryShadowLegacySource =
  | 'CaseClient'
  | 'Collection'
  | 'CollectionDisposition'
  | 'CollectionDispositionLine'
  | 'CollectionDispositionExpenseApplication'
  | 'ClientPayout'
  | 'ClientOffset'
  | 'ExpenseRequest'
  | 'ExpensePayment'
  | 'CaseBalance';

export type ClientAccountingSummaryShadowJournalSource =
  | 'COLLECTION_DISPOSITION_LINE'
  | 'CLIENT_PAYOUT'
  | 'CLIENT_OFFSET'
  | 'BALANCE_LEDGER'
  | 'EXPENSE_REQUEST'
  | 'EXPENSE_PAYMENT'
  | 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION';

export type ClientAccountingSummaryShadowValueStatus = 'MATCH' | 'MISMATCH' | 'NOT_COMPUTED';

export type ClientAccountingSummaryExpensePolicyCoverage =
  | 'CONTRACT_EXISTS'
  | 'MISSING_POLICY';

export interface ClientAccountingSummaryExpenseCoveragePolicyItem {
  component: 'expenseRequested' | 'expensePaid' | 'expenseUnpaid' | 'reimbursementApplication';
  responsePath: string;
  coverage: ClientAccountingSummaryExpensePolicyCoverage;
  requiredSources: ClientAccountingSummaryShadowJournalSource[];
  requiredActions: string[];
  requiredDimensions: string[];
  supportedSources: ClientAccountingSummaryShadowJournalSource[];
  blockerCodes: string[];
  gapCodes: string[];
}

export interface ClientAccountingSummaryExpenseCoveragePolicy {
  status: 'BLOCKED';
  items: ClientAccountingSummaryExpenseCoveragePolicyItem[];
  blockerCodes: string[];
  gapCodes: string[];
}

export interface ClientAccountingSummaryShadowLegacyClientScopedValues {
  payableNet: string;
  paidToClient: string;
  offsetApplied: string;
}

export interface ClientAccountingSummaryShadowReportRequest {
  tenantId: string;
  clientId: string;
  currency?: string;
  legacyClientScoped?: ClientAccountingSummaryShadowLegacyClientScopedValues;
}

export interface ClientAccountingSummaryShadowValueComparison {
  legacyValue: string | null;
  journalValue: string | null;
  delta: string | null;
  status: ClientAccountingSummaryShadowValueStatus;
  blockerCodes: string[];
  blockerReason?: string | null;
}

export interface ClientAccountingSummaryShadowComponent {
  key: string;
  responsePath: string;
  group: ClientAccountingSummaryShadowComponentGroup;
  coverage: ClientAccountingSummaryShadowComponentCoverage;
  legacySources: ClientAccountingSummaryShadowLegacySource[];
  journalSources: ClientAccountingSummaryShadowJournalSource[];
  blockerCodes: string[];
  gapCodes: string[];
  valueComparison?: ClientAccountingSummaryShadowValueComparison;
}

export interface ClientAccountingSummaryShadowSupportedValueSummary {
  status: 'MATCH' | 'MISMATCH' | 'NOT_COMPUTED';
  comparedComponents: string[];
  matchedCount: number;
  mismatchedCount: number;
  notComputedCount: number;
  blockerCodes: string[];
}

export type ExpenseRequestBackfillEvidenceStatus =
  | 'MATCHED'
  | 'BACKFILL_REQUIRED'
  | 'VALUE_MISMATCH'
  | 'DIMENSION_MISMATCH'
  | 'CANCELLED_SOURCE_BLOCKED'
  | 'SETTLED_CANCEL_BLOCKED';

export interface ExpenseRequestBackfillEvidenceItem {
  expenseRequestId: string;
  status: ExpenseRequestBackfillEvidenceStatus;
  legacyValue: string | null;
  journalValue: string | null;
  delta: string | null;
  blockerCodes: string[];
  journalEntryId: string | null;
  details: {
    caseId: string | null;
    clientId: string | null;
    currency: string;
    journalCaseId: string | null;
    journalClientId: string | null;
    journalCurrency: string | null;
    settledActivityCount: number;
  };
}

export interface ExpenseRequestBackfillEvidenceSummary {
  sourceType: 'EXPENSE_REQUEST';
  sourceAction: 'recorded';
  sourceVersionEvidence: 'idempotencyKey/sourceHash/sourceTuple';
  statusCounts: Record<ExpenseRequestBackfillEvidenceStatus, number>;
  blockerCodes: string[];
  items: ExpenseRequestBackfillEvidenceItem[];
}

export type CollectionDispositionLineReplayEvidenceStatus =
  | 'REPLAY_ELIGIBLE'
  | 'MANUAL_REVERSAL_BLOCKED'
  | 'UNMAPPED_LINE_BLOCKED';

export interface CollectionDispositionLineReplayEvidenceItem {
  dispositionLineId: string;
  status: CollectionDispositionLineReplayEvidenceStatus;
  blockerCodes: string[];
  journalEntryId: string | null;
  details: {
    dispositionId: string;
    collectionId: string;
    caseId: string;
    caseClientId: string | null;
    lineType: string;
    amount: string;
    currency: string;
    postedAt: string | null;
    manualReversalRequiredAt: string | null;
  };
}

export interface CollectionCaseContextBlockerItem {
  sourceType: 'COLLECTION' | 'COLLECTION_DISPOSITION';
  sourceId: string;
  status: 'RAW_COLLECTION_BLOCKED' | 'LIFECYCLE_BLOCKED';
  blockerCodes: string[];
  details: {
    caseId: string;
    sourceStatus: string;
    currency: string;
    occurredAt: string | null;
  };
}

export interface CollectionDispositionReplayEvidenceSummary {
  sourceType: 'COLLECTION_DISPOSITION_LINE';
  sourceAction: 'posted';
  sourceVersionEvidence: 'postedAt/sourceId/idempotencyKey';
  statusCounts: Record<CollectionDispositionLineReplayEvidenceStatus, number>;
  blockerCodes: string[];
  lineItems: CollectionDispositionLineReplayEvidenceItem[];
  blockerItems: CollectionCaseContextBlockerItem[];
}

export type BalanceLedgerReplayEvidenceStatus =
  | 'REPLAY_ELIGIBLE'
  | 'CORRELATED_DISPOSITION_LINE_SUPPRESSED'
  | 'UNMAPPED_LEDGER_BLOCKED';

export interface BalanceLedgerReplayEvidenceItem {
  balanceLedgerId: string;
  status: BalanceLedgerReplayEvidenceStatus;
  blockerCodes: string[];
  journalEntryId: string | null;
  details: {
    caseId: string;
    ledgerType: string;
    amount: string;
    currency: string;
    source: string | null;
    sourceId: string | null;
    createdAt: string;
  };
}

export interface BalanceLedgerReplayEvidenceSummary {
  sourceType: 'BALANCE_LEDGER';
  sourceAction: 'posted';
  sourceVersionEvidence: 'createdAt/sourceId/idempotencyKey';
  statusCounts: Record<BalanceLedgerReplayEvidenceStatus, number>;
  blockerCodes: string[];
  items: BalanceLedgerReplayEvidenceItem[];
}

export interface ClientAccountingSummaryReplayEvidenceReport {
  sourceVersion: 'acct-cutover-3d1-replay-evidence-v1';
  pendingDistribution: CollectionDispositionReplayEvidenceSummary;
  advanceBalance: BalanceLedgerReplayEvidenceSummary;
  blockerCodes: string[];
}
export interface ClientAccountingSummaryShadowReport {
  tenantId: string;
  clientId: string;
  currency: string;
  generatedAt: string;
  mode: 'READ_ONLY_COMPONENT_COVERAGE';
  sourceVersion: 'acct-cutover-summary-shadow-report-v1';
  primarySwitchUnchanged: true;
  candidateStatus: ClientAccountingSummaryShadowCandidateStatus;
  safeForPrimaryCutover: false;
  components: ClientAccountingSummaryShadowComponent[];
  expenseCoveragePolicy: ClientAccountingSummaryExpenseCoveragePolicy;
  supportedValueSummary: ClientAccountingSummaryShadowSupportedValueSummary;
  expenseRequestBackfillEvidence?: ExpenseRequestBackfillEvidenceSummary;
  replayEvidence?: ClientAccountingSummaryReplayEvidenceReport;
  blockerCodes: string[];
  gapCodes: string[];
  nextImplementationTasks: string[];
}

interface CaseClientRow {
  id: string;
  caseId: string;
}

interface SupportedJournalLine {
  amount: { toString(): string };
  journalEntry: {
    sourceType: string;
    sourceAction: string;
  };
}

interface ExpenseRequestLegacyRow {
  id: string;
  caseId: string;
  clientId: string;
  totalAmount: { toString(): string };
  currency: string;
  status: string;
}

interface ExpenseRequestRecordedJournalEntryRow {
  id: string;
  sourceId: string;
  sourceHash: string | null;
  idempotencyKey: string;
  lines: Array<{
    accountCode: string;
    direction: string;
    amount: { toString(): string };
    currency: string;
    caseId: string | null;
    clientId: string | null;
    expenseRequestId: string | null;
  }>;
}

interface CollectionDispositionLineReplayRow {
  id: string;
  type: string;
  amount: { toString(): string };
  caseClientId: string | null;
  disposition: {
    id: string;
    collectionId: string;
    caseId: string;
    currency: string;
    postedAt: Date | null;
    manualReversalRequiredAt: Date | null;
  };
}

interface CollectionReplayRow {
  id: string;
  caseId: string;
  currency: string;
  status: string;
  date: Date | null;
}

interface CollectionDispositionLifecycleReplayRow {
  id: string;
  caseId: string;
  currency: string;
  status: string;
  updatedAt: Date | null;
}

interface BalanceLedgerReplayRow {
  id: string;
  type: string;
  amount: { toString(): string };
  currency: string;
  source: string | null;
  sourceId: string | null;
  createdAt: Date;
  caseBalance: { caseId: string };
}

interface ReplayJournalEntryRow {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceAction: string;
}

interface ExpenseRequestShadowValues extends ClientAccountingSummaryShadowLegacyClientScopedValues {
  expenseRequested: string;
  expenseRequestedComparison: ClientAccountingSummaryShadowValueComparison;
  expenseRequestBackfillEvidence: ExpenseRequestBackfillEvidenceSummary;
  replayEvidence: ClientAccountingSummaryReplayEvidenceReport;
}

const ZERO = new Prisma.Decimal(0);
const SUPPORTED_COMPONENT_KEYS = ['payableNet', 'paidToClient', 'offsetApplied', 'expenseRequested'] as const;
const VALUE_MISMATCH_BLOCKER = 'SUMMARY_SUPPORTED_COMPONENT_VALUE_MISMATCH';
const EXPENSE_REQUEST_BACKFILL_MISSING = 'EXPENSE_REQUEST_BACKFILL_MISSING';
const EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH = 'EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH';
const EXPENSE_REQUEST_DIMENSION_MISMATCH = 'EXPENSE_REQUEST_DIMENSION_MISMATCH';
const EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED = 'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED';
const EXPENSE_REQUEST_SETTLED_CANCEL_BLOCKED = 'EXPENSE_REQUEST_SETTLED_CANCEL_BLOCKED';
const COLLECTION_RAW_SOURCE_BLOCKED = 'COLLECTION_RAW_SOURCE_BLOCKED';
const COLLECTION_DISPOSITION_LIFECYCLE_BLOCKED = 'COLLECTION_DISPOSITION_LIFECYCLE_BLOCKED';
const COLLECTION_DISPOSITION_LINE_MANUAL_REVERSAL_BLOCKED = 'COLLECTION_DISPOSITION_LINE_MANUAL_REVERSAL_BLOCKED';
const COLLECTION_DISPOSITION_LINE_UNMAPPED_BLOCKED = 'COLLECTION_DISPOSITION_LINE_UNMAPPED_BLOCKED';
const BALANCE_LEDGER_CORRELATED_DISPOSITION_LINE_SUPPRESSED = 'BALANCE_LEDGER_CORRELATED_DISPOSITION_LINE_SUPPRESSED';
const BALANCE_LEDGER_ADJUST_REFUND_UNMAPPED = 'BALANCE_LEDGER_ADJUST_REFUND_UNMAPPED';

const EXPENSE_COVERAGE_POLICY_ITEMS: ClientAccountingSummaryExpenseCoveragePolicyItem[] = [
  {
    component: 'expenseRequested',
    responsePath: 'clientScoped.expenseRequested',
    coverage: 'CONTRACT_EXISTS',
    requiredSources: ['EXPENSE_REQUEST'],
    requiredActions: ['recorded', 'cancel'],
    requiredDimensions: ['tenantId', 'clientId', 'caseId', 'expenseRequestId', 'currency'],
    supportedSources: ['EXPENSE_REQUEST'],
    blockerCodes: [
      'EXPENSE_REQUEST_BACKFILL_MISSING',
      'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED',
    ],
    gapCodes: [],
  },
  {
    component: 'expensePaid',
    responsePath: 'clientScoped.expensePaid',
    coverage: 'CONTRACT_EXISTS',
    requiredSources: ['EXPENSE_PAYMENT'],
    requiredActions: ['recorded'],
    requiredDimensions: ['tenantId', 'clientId', 'caseId', 'expenseRequestId', 'expensePaymentId', 'currency'],
    supportedSources: ['EXPENSE_PAYMENT'],
    blockerCodes: [
      'EXPENSE_PAYMENT_LIVE_POSTING_MISSING',
      'EXPENSE_PAYMENT_BACKFILL_MISSING',
      'EXPENSE_PAYMENT_VALUE_SHADOW_MISSING',
      'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
    ],
    gapCodes: ['EXPENSE_REQUEST_PAID_TOTAL_PROJECTION_ONLY'],
  },
  {
    component: 'expenseUnpaid',
    responsePath: 'clientScoped.expenseUnpaid',
    coverage: 'MISSING_POLICY',
    requiredSources: ['EXPENSE_REQUEST', 'EXPENSE_PAYMENT', 'CLIENT_OFFSET', 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
    requiredActions: ['recorded', 'cancel', 'apply', 'reversal'],
    requiredDimensions: ['tenantId', 'clientId', 'caseId', 'expenseRequestId', 'currency'],
    supportedSources: ['EXPENSE_REQUEST', 'EXPENSE_PAYMENT', 'CLIENT_OFFSET', 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
    blockerCodes: [
      'EXPENSE_PAYMENT_LIVE_POSTING_MISSING',
      'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
      'EXPENSE_SUMMARY_VALUE_SHADOW_MISSING',
      'EXPENSE_SUMMARY_BACKFILL_MISSING',
      'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
      'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED',
    ],
    gapCodes: [],
  },
  {
    component: 'reimbursementApplication',
    responsePath: 'clientScoped.expenseUnpaid.reimbursementApplication',
    coverage: 'CONTRACT_EXISTS',
    requiredSources: ['COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
    requiredActions: ['apply', 'reversal'],
    requiredDimensions: [
      'tenantId',
      'clientId',
      'caseId',
      'expenseRequestId',
      'collectionDispositionId',
      'collectionDispositionLineId',
      'reimbursementScope',
      'currency',
    ],
    supportedSources: ['COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
    blockerCodes: [
      'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
      'EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING',
      'EXPENSE_REIMBURSEMENT_APPLICATION_VALUE_SHADOW_MISSING',
    ],
    gapCodes: [],
  },
];

const SUMMARY_COMPONENTS: ClientAccountingSummaryShadowComponent[] = [
  {
    key: 'payableNet',
    responsePath: 'clientScoped.payableNet',
    group: 'CLIENT_SCOPED',
    coverage: 'JOURNAL_SUPPORTED',
    legacySources: ['CaseClient', 'CollectionDispositionLine', 'Collection', 'ClientPayout', 'ClientOffset'],
    journalSources: ['COLLECTION_DISPOSITION_LINE', 'CLIENT_PAYOUT', 'CLIENT_OFFSET'],
    blockerCodes: [],
    gapCodes: [],
  },
  {
    key: 'paidToClient',
    responsePath: 'clientScoped.paidToClient',
    group: 'CLIENT_SCOPED',
    coverage: 'JOURNAL_SUPPORTED',
    legacySources: ['ClientPayout'],
    journalSources: ['CLIENT_PAYOUT'],
    blockerCodes: [],
    gapCodes: [],
  },
  {
    key: 'offsetApplied',
    responsePath: 'clientScoped.offsetApplied',
    group: 'CLIENT_SCOPED',
    coverage: 'JOURNAL_SUPPORTED',
    legacySources: ['ClientOffset'],
    journalSources: ['CLIENT_OFFSET'],
    blockerCodes: [],
    gapCodes: [],
  },
  {
    key: 'expenseRequested',
    responsePath: 'clientScoped.expenseRequested',
    group: 'CLIENT_SCOPED',
    coverage: 'BLOCKER',
    legacySources: ['ExpenseRequest'],
    journalSources: ['EXPENSE_REQUEST'],
    blockerCodes: [
      'EXPENSE_REQUEST_BACKFILL_MISSING',
      'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED',
    ],
    gapCodes: [],
  },
  {
    key: 'expensePaid',
    responsePath: 'clientScoped.expensePaid',
    group: 'CLIENT_SCOPED',
    coverage: 'BLOCKER',
    legacySources: ['ExpenseRequest', 'ExpensePayment'],
    journalSources: ['EXPENSE_PAYMENT'],
    blockerCodes: [
      'EXPENSE_PAYMENT_LIVE_POSTING_MISSING',
      'EXPENSE_PAYMENT_BACKFILL_MISSING',
      'EXPENSE_PAYMENT_VALUE_SHADOW_MISSING',
      'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
    ],
    gapCodes: ['EXPENSE_REQUEST_PAID_TOTAL_PROJECTION_ONLY'],
  },
  {
    key: 'expenseUnpaid',
    responsePath: 'clientScoped.expenseUnpaid',
    group: 'CLIENT_SCOPED',
    coverage: 'BLOCKER',
    legacySources: ['ExpenseRequest', 'ClientOffset', 'CollectionDispositionExpenseApplication'],
    journalSources: ['EXPENSE_REQUEST', 'EXPENSE_PAYMENT', 'CLIENT_OFFSET', 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
    blockerCodes: [
      'EXPENSE_PAYMENT_LIVE_POSTING_MISSING',
      'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
      'EXPENSE_SUMMARY_VALUE_SHADOW_MISSING',
      'EXPENSE_SUMMARY_BACKFILL_MISSING',
    ],
    gapCodes: [],
  },
  {
    key: 'offsettableNetPosition',
    responsePath: 'clientScoped.offsettableNetPosition',
    group: 'DERIVED',
    coverage: 'BLOCKER',
    legacySources: ['CollectionDispositionLine', 'ClientPayout', 'ClientOffset', 'ExpenseRequest'],
    journalSources: ['COLLECTION_DISPOSITION_LINE', 'CLIENT_PAYOUT', 'CLIENT_OFFSET'],
    blockerCodes: ['SUMMARY_DERIVED_FROM_BLOCKED_EXPENSE_UNPAID'],
    gapCodes: [],
  },
  {
    key: 'debtorCollection',
    responsePath: 'caseScopedContext.debtorCollection',
    group: 'CASE_SCOPED_CONTEXT',
    coverage: 'GAP',
    legacySources: ['Collection'],
    journalSources: [],
    blockerCodes: ['CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING'],
    gapCodes: ['COLLECTION_JOURNAL_SOURCE_MISSING'],
  },
  {
    key: 'pendingDistribution',
    responsePath: 'caseScopedContext.pendingDistribution',
    group: 'CASE_SCOPED_CONTEXT',
    coverage: 'BLOCKER',
    legacySources: ['Collection', 'CollectionDisposition'],
    journalSources: ['COLLECTION_DISPOSITION_LINE'],
    blockerCodes: ['CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING'],
    gapCodes: ['COLLECTION_JOURNAL_SOURCE_MISSING'],
  },
  {
    key: 'advanceBalance',
    responsePath: 'caseScopedContext.advanceBalance',
    group: 'CASE_SCOPED_CONTEXT',
    coverage: 'BLOCKER',
    legacySources: ['CaseBalance'],
    journalSources: ['BALANCE_LEDGER'],
    blockerCodes: ['CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED'],
    gapCodes: ['CASE_BALANCE_SNAPSHOT_NOT_JOURNAL_DERIVED'],
  },
  {
    key: 'needsReview',
    responsePath: 'needsReview',
    group: 'DERIVED',
    coverage: 'BLOCKER',
    legacySources: ['Collection', 'CollectionDisposition'],
    journalSources: ['COLLECTION_DISPOSITION_LINE'],
    blockerCodes: ['SUMMARY_DERIVED_FROM_BLOCKED_PENDING_DISTRIBUTION'],
    gapCodes: ['COLLECTION_JOURNAL_SOURCE_MISSING'],
  },
];

const NEXT_IMPLEMENTATION_TASKS = [
  'ACCT-CUTOVER-3C5B add ExpenseRequest backfill evidence and supported summary value shadow tests',
  'ACCT-CUTOVER-3D define case-context Collection and CaseBalance journal replay policy',
];

@Injectable()
export class ClientAccountingSummaryShadowReportService {
  constructor(private readonly prisma?: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ACCT-CUTOVER-3A/3B tests -> read-only component coverage and supported shadow values for GET /clients/:clientId/accounting/summary readiness.
  /// </remarks>
  getSummaryShadowReport(
    request: ClientAccountingSummaryShadowReportRequest,
  ): ClientAccountingSummaryShadowReport {
    return this.buildReport(request, null);
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ACCT-CUTOVER-3B tests -> read-only journal-derived value compare for supported summary components.
  /// </remarks>
  async getSummaryShadowReportWithSupportedValues(
    request: ClientAccountingSummaryShadowReportRequest,
  ): Promise<ClientAccountingSummaryShadowReport> {
    if (!this.prisma) {
      throw new Error('PrismaService is required for supported summary shadow values.');
    }

    const shadowValues = await this.computeSupportedShadowValues(request);
    return this.buildReport(request, shadowValues);
  }

  private async computeSupportedShadowValues(
    request: ClientAccountingSummaryShadowReportRequest,
  ): Promise<ExpenseRequestShadowValues> {
    const currency = request.currency || 'TRY';
    const caseClients = (await this.prisma!.caseClient.findMany({
      where: { clientId: request.clientId, role: { in: ['ALACAKLI', 'ORTAK_ALACAKLI'] }, client: { tenantId: request.tenantId } },
      select: { id: true, caseId: true },
    })) as CaseClientRow[];

    const caseClientIds = caseClients.map((row) => row.id);
    const caseIds = uniqueSorted(caseClients.map((row) => row.caseId));
    if (caseClientIds.length === 0) {
      const expenseRequestShadow = await this.computeExpenseRequestShadowValues(request, currency);
      const replayEvidence = await this.computeReplayEvidence(request.tenantId, currency, []);
      return { payableNet: '0', paidToClient: '0', offsetApplied: '0', ...expenseRequestShadow, replayEvidence };
    }

    const lines = (await this.prisma!.accountingJournalLine.findMany({
      where: {
        tenantId: request.tenantId,
        accountCode: 'CLIENT_PAYABLE',
        currency,
        caseClientId: { in: caseClientIds },
        journalEntry: {
          tenantId: request.tenantId,
          OR: [
            { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted' },
            { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded' },
            { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply' },
            { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal' },
          ],
        },
      },
      select: {
        amount: true,
        journalEntry: { select: { sourceType: true, sourceAction: true } },
      },
    })) as SupportedJournalLine[];

    let payableNet = ZERO;
    let paidToClient = ZERO;
    let offsetApplied = ZERO;

    for (const line of lines) {
      const amount = decimalOf(line.amount);
      const { sourceType, sourceAction } = line.journalEntry;

      if (sourceType === 'COLLECTION_DISPOSITION_LINE' && sourceAction === 'posted') {
        payableNet = payableNet.plus(amount);
      }
      if (sourceType === 'CLIENT_PAYOUT' && sourceAction === 'recorded') {
        payableNet = payableNet.minus(amount);
        paidToClient = paidToClient.plus(amount);
      }
      if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'apply') {
        payableNet = payableNet.minus(amount);
        offsetApplied = offsetApplied.plus(amount);
      }
      if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'reversal') {
        payableNet = payableNet.plus(amount);
        offsetApplied = offsetApplied.minus(amount);
      }
    }

    const expenseRequestShadow = await this.computeExpenseRequestShadowValues(request, currency);
    const replayEvidence = await this.computeReplayEvidence(request.tenantId, currency, caseIds);

    return {
      payableNet: decimalToString(payableNet),
      paidToClient: decimalToString(paidToClient),
      offsetApplied: decimalToString(offsetApplied),
      ...expenseRequestShadow,
      replayEvidence,
    };
  }

  private async computeReplayEvidence(
    tenantId: string,
    currency: string,
    caseIds: string[],
  ): Promise<ClientAccountingSummaryReplayEvidenceReport> {
    if (caseIds.length === 0) {
      return buildReplayEvidence([], [], [], [], []);
    }

    const [dispositionLines, collections, lifecycleDispositions, balanceLedgers] = await Promise.all([
      this.prisma!.collectionDispositionLine.findMany({
        where: { disposition: { tenantId, caseId: { in: caseIds }, currency, status: 'POSTED' } },
        select: {
          id: true,
          type: true,
          amount: true,
          caseClientId: true,
          disposition: {
            select: {
              id: true,
              collectionId: true,
              caseId: true,
              currency: true,
              postedAt: true,
              manualReversalRequiredAt: true,
            },
          },
        },
      }),
      this.prisma!.collection.findMany({
        where: { tenantId, caseId: { in: caseIds }, currency, status: { in: ['CONFIRMED', 'CANCELLED', 'REFUNDED'] } },
        select: { id: true, caseId: true, currency: true, status: true, date: true },
      }),
      this.prisma!.collectionDisposition.findMany({
        where: { tenantId, caseId: { in: caseIds }, currency, status: { not: 'POSTED' } },
        select: { id: true, caseId: true, currency: true, status: true, updatedAt: true },
      }),
      this.prisma!.balanceLedger.findMany({
        where: { tenantId, currency, caseBalance: { caseId: { in: caseIds } } },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          source: true,
          sourceId: true,
          createdAt: true,
          caseBalance: { select: { caseId: true } },
        },
      }),
    ]) as [
      CollectionDispositionLineReplayRow[],
      CollectionReplayRow[],
      CollectionDispositionLifecycleReplayRow[],
      BalanceLedgerReplayRow[],
    ];

    const lineIds = dispositionLines.map((line) => line.id);
    const ledgerIds = balanceLedgers.map((ledger) => ledger.id);
    const replayJournalSources: Prisma.AccountingJournalEntryWhereInput[] = [
      ...(lineIds.length > 0
        ? [{ sourceType: 'COLLECTION_DISPOSITION_LINE' as const, sourceAction: 'posted', sourceId: { in: lineIds } }]
        : []),
      ...(ledgerIds.length > 0
        ? [{ sourceType: 'BALANCE_LEDGER' as const, sourceAction: 'posted', sourceId: { in: ledgerIds } }]
        : []),
    ];
    const journalEntries = replayJournalSources.length === 0
      ? []
      : (await this.prisma!.accountingJournalEntry.findMany({
          where: {
            tenantId,
            OR: replayJournalSources,
          },
          select: { id: true, sourceType: true, sourceId: true, sourceAction: true },
        })) as ReplayJournalEntryRow[];

    return buildReplayEvidence(dispositionLines, collections, lifecycleDispositions, balanceLedgers, journalEntries);
  }

  private async computeExpenseRequestShadowValues(
    request: ClientAccountingSummaryShadowReportRequest,
    currency: string,
  ): Promise<Pick<ExpenseRequestShadowValues, 'expenseRequested' | 'expenseRequestedComparison' | 'expenseRequestBackfillEvidence'>> {
    const activeRequests = (await this.prisma!.expenseRequest.findMany({
      where: { tenantId: request.tenantId, clientId: request.clientId, currency, status: { not: 'CANCELLED' } },
      select: { id: true, caseId: true, clientId: true, totalAmount: true, currency: true, status: true },
    })) as ExpenseRequestLegacyRow[];
    const cancelledRequests = (await this.prisma!.expenseRequest.findMany({
      where: { tenantId: request.tenantId, clientId: request.clientId, currency, status: 'CANCELLED' },
      select: { id: true, caseId: true, clientId: true, totalAmount: true, currency: true, status: true },
    })) as ExpenseRequestLegacyRow[];
    const activeIds = activeRequests.map((row) => row.id);
    const cancelledIds = cancelledRequests.map((row) => row.id);
    const allIds = [...activeIds, ...cancelledIds];
    const journalEntries = allIds.length === 0 ? [] : (await this.prisma!.accountingJournalEntry.findMany({
      where: {
        tenantId: request.tenantId,
        sourceType: 'EXPENSE_REQUEST',
        sourceAction: 'recorded',
        sourceId: { in: allIds },
      },
      select: {
        id: true,
        sourceId: true,
        sourceHash: true,
        idempotencyKey: true,
        lines: {
          select: {
            accountCode: true,
            direction: true,
            amount: true,
            currency: true,
            caseId: true,
            clientId: true,
            expenseRequestId: true,
          },
        },
      },
    })) as ExpenseRequestRecordedJournalEntryRow[];
    const settledCounts = await this.computeExpenseRequestSettledActivityCounts(request.tenantId, allIds);
    const evidence = buildExpenseRequestBackfillEvidence(activeRequests, cancelledRequests, journalEntries, settledCounts);
    const legacyValue = activeRequests.reduce((sum, row) => sum.plus(decimalOf(row.totalAmount)), ZERO);
    const journalValue = evidence.items
      .filter((item) => activeIds.includes(item.expenseRequestId))
      .reduce((sum, item) => sum.plus(decimalOf(item.journalValue ?? '0')), ZERO);
    const delta = journalValue.minus(legacyValue);
    const blockerCodes = uniqueSorted([
      ...evidence.blockerCodes,
      ...(!delta.equals(ZERO) ? [EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH] : []),
    ]);

    return {
      expenseRequested: decimalToString(journalValue),
      expenseRequestedComparison: {
        legacyValue: decimalToString(legacyValue),
        journalValue: decimalToString(journalValue),
        delta: decimalToString(delta),
        status: blockerCodes.includes(EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH) ? 'MISMATCH' : 'MATCH',
        blockerCodes,
        blockerReason: blockerCodes[0] ?? null,
      },
      expenseRequestBackfillEvidence: evidence,
    };
  }

  private async computeExpenseRequestSettledActivityCounts(
    tenantId: string,
    expenseRequestIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (expenseRequestIds.length === 0) return counts;

    const [payments, offsets, applications] = await Promise.all([
      this.prisma!.expensePayment.findMany({
        where: { expenseRequestId: { in: expenseRequestIds } },
        select: { expenseRequestId: true },
      }),
      this.prisma!.clientOffset.findMany({
        where: { tenantId, expenseRequestId: { in: expenseRequestIds } },
        select: { expenseRequestId: true },
      }),
      this.prisma!.collectionDispositionExpenseApplication.findMany({
        where: { tenantId, expenseRequestId: { in: expenseRequestIds } },
        select: { expenseRequestId: true },
      }),
    ]) as Array<Array<{ expenseRequestId: string }>>;

    for (const row of [...payments, ...offsets, ...applications]) {
      counts.set(row.expenseRequestId, (counts.get(row.expenseRequestId) ?? 0) + 1);
    }

    return counts;
  }

  private buildReport(
    request: ClientAccountingSummaryShadowReportRequest,
    shadowValues: ExpenseRequestShadowValues | null,
  ): ClientAccountingSummaryShadowReport {
    const components = SUMMARY_COMPONENTS.map((component) => cloneComponent(component));
    const expenseCoveragePolicy = buildExpenseCoveragePolicy();
    applySupportedValueComparisons(components, request.legacyClientScoped, shadowValues);
    applyReplayEvidenceBreakdowns(components, shadowValues?.replayEvidence ?? null);
    const supportedValueSummary = summarizeSupportedValueComparisons(components);

    return {
      tenantId: request.tenantId,
      clientId: request.clientId,
      currency: request.currency || 'TRY',
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_COMPONENT_COVERAGE',
      sourceVersion: 'acct-cutover-summary-shadow-report-v1',
      primarySwitchUnchanged: true,
      candidateStatus: 'BLOCKED',
      safeForPrimaryCutover: false,
      components,
      expenseCoveragePolicy,
      supportedValueSummary,
      expenseRequestBackfillEvidence: shadowValues?.expenseRequestBackfillEvidence,
      replayEvidence: shadowValues?.replayEvidence,
      blockerCodes: uniqueSorted([
        ...components.flatMap((component) => component.blockerCodes),
        ...expenseCoveragePolicy.blockerCodes,
        ...supportedValueSummary.blockerCodes,
        ...(shadowValues?.expenseRequestBackfillEvidence.blockerCodes ?? []),
        ...(shadowValues?.replayEvidence.blockerCodes ?? []),
      ]),
      gapCodes: uniqueSorted([
        ...components.flatMap((component) => component.gapCodes),
        ...expenseCoveragePolicy.gapCodes,
      ]),
      nextImplementationTasks: [...NEXT_IMPLEMENTATION_TASKS],
    };
  }
}

function buildExpenseCoveragePolicy(): ClientAccountingSummaryExpenseCoveragePolicy {
  const items = EXPENSE_COVERAGE_POLICY_ITEMS.map((item) => ({
    ...item,
    requiredSources: [...item.requiredSources],
    requiredActions: [...item.requiredActions],
    requiredDimensions: [...item.requiredDimensions],
    supportedSources: [...item.supportedSources],
    blockerCodes: [...item.blockerCodes],
    gapCodes: [...item.gapCodes],
  }));

  return {
    status: 'BLOCKED',
    items,
    blockerCodes: uniqueSorted(items.flatMap((item) => item.blockerCodes)),
    gapCodes: uniqueSorted(items.flatMap((item) => item.gapCodes)),
  };
}

function cloneComponent(component: ClientAccountingSummaryShadowComponent): ClientAccountingSummaryShadowComponent {
  return {
    ...component,
    legacySources: [...component.legacySources],
    journalSources: [...component.journalSources],
    blockerCodes: [...component.blockerCodes],
    gapCodes: [...component.gapCodes],
  };
}

function applySupportedValueComparisons(
  components: ClientAccountingSummaryShadowComponent[],
  legacyValues: ClientAccountingSummaryShadowLegacyClientScopedValues | undefined,
  shadowValues: ExpenseRequestShadowValues | null,
): void {
  for (const key of SUPPORTED_COMPONENT_KEYS) {
    const component = components.find((candidate) => candidate.key === key);
    if (!component) continue;

    if (key === 'expenseRequested') {
      if (shadowValues) {
        component.valueComparison = { ...shadowValues.expenseRequestedComparison };
        component.blockerCodes = uniqueSorted([...component.blockerCodes, ...shadowValues.expenseRequestedComparison.blockerCodes]);
      } else {
        component.valueComparison = {
          legacyValue: null,
          journalValue: null,
          delta: null,
          status: 'NOT_COMPUTED',
          blockerCodes: [],
        };
      }
      continue;
    }

    if (!legacyValues || !shadowValues) {
      component.valueComparison = {
        legacyValue: legacyValues?.[key] ?? null,
        journalValue: shadowValues?.[key] ?? null,
        delta: null,
        status: 'NOT_COMPUTED',
        blockerCodes: [],
      };
      continue;
    }
    const legacyValue = decimalOf(legacyValues[key]);
    const journalValue = decimalOf(shadowValues[key]);
    const delta = journalValue.minus(legacyValue);
    const mismatch = !delta.equals(ZERO);
    const blockerCodes = mismatch ? [VALUE_MISMATCH_BLOCKER] : [];
    component.valueComparison = {
      legacyValue: decimalToString(legacyValue),
      journalValue: decimalToString(journalValue),
      delta: decimalToString(delta),
      status: mismatch ? 'MISMATCH' : 'MATCH',
      blockerCodes,
    };
    component.blockerCodes = uniqueSorted([...component.blockerCodes, ...blockerCodes]);
  }
}

function applyReplayEvidenceBreakdowns(
  components: ClientAccountingSummaryShadowComponent[],
  replayEvidence: ClientAccountingSummaryReplayEvidenceReport | null,
): void {
  if (!replayEvidence) return;

  const pendingDistribution = components.find((component) => component.key === 'pendingDistribution');
  if (pendingDistribution) {
    pendingDistribution.blockerCodes = uniqueSorted([
      ...pendingDistribution.blockerCodes,
      ...replayEvidence.pendingDistribution.blockerCodes,
    ]);
  }

  const advanceBalance = components.find((component) => component.key === 'advanceBalance');
  if (advanceBalance) {
    advanceBalance.blockerCodes = uniqueSorted([
      ...advanceBalance.blockerCodes,
      ...replayEvidence.advanceBalance.blockerCodes,
    ]);
  }
}

function summarizeSupportedValueComparisons(
  components: ClientAccountingSummaryShadowComponent[],
): ClientAccountingSummaryShadowSupportedValueSummary {
  const comparisons = components
    .filter((component) => SUPPORTED_COMPONENT_KEYS.includes(component.key as typeof SUPPORTED_COMPONENT_KEYS[number]))
    .map((component) => ({ key: component.key, comparison: component.valueComparison }));
  const matchedCount = comparisons.filter((item) => item.comparison?.status === 'MATCH').length;
  const mismatchedCount = comparisons.filter((item) => item.comparison?.status === 'MISMATCH').length;
  const notComputedCount = comparisons.filter((item) => item.comparison?.status === 'NOT_COMPUTED').length;
  const blockerCodes = uniqueSorted(comparisons.flatMap((item) => item.comparison?.blockerCodes ?? []));

  return {
    status: mismatchedCount > 0 ? 'MISMATCH' : notComputedCount > 0 ? 'NOT_COMPUTED' : 'MATCH',
    comparedComponents: comparisons.map((item) => item.key),
    matchedCount,
    mismatchedCount,
    notComputedCount,
    blockerCodes,
  };
}

function buildReplayEvidence(
  dispositionLines: CollectionDispositionLineReplayRow[],
  collections: CollectionReplayRow[],
  lifecycleDispositions: CollectionDispositionLifecycleReplayRow[],
  balanceLedgers: BalanceLedgerReplayRow[],
  journalEntries: ReplayJournalEntryRow[],
): ClientAccountingSummaryReplayEvidenceReport {
  const journalBySource = new Map(journalEntries.map((entry) => [`${entry.sourceType}:${entry.sourceAction}:${entry.sourceId}`, entry]));
  const pendingDistribution = buildCollectionDispositionReplayEvidence(dispositionLines, collections, lifecycleDispositions, journalBySource);
  const advanceBalance = buildBalanceLedgerReplayEvidence(balanceLedgers, journalBySource);

  return {
    sourceVersion: 'acct-cutover-3d1-replay-evidence-v1',
    pendingDistribution,
    advanceBalance,
    blockerCodes: uniqueSorted([...pendingDistribution.blockerCodes, ...advanceBalance.blockerCodes]),
  };
}

function buildCollectionDispositionReplayEvidence(
  dispositionLines: CollectionDispositionLineReplayRow[],
  collections: CollectionReplayRow[],
  lifecycleDispositions: CollectionDispositionLifecycleReplayRow[],
  journalBySource: Map<string, ReplayJournalEntryRow>,
): CollectionDispositionReplayEvidenceSummary {
  const lineItems = dispositionLines.map((line) => collectionDispositionLineReplayItem(line, journalBySource.get(`COLLECTION_DISPOSITION_LINE:posted:${line.id}`) ?? null));
  const blockerItems: CollectionCaseContextBlockerItem[] = [
    ...collections.map((collection) => ({
      sourceType: 'COLLECTION' as const,
      sourceId: collection.id,
      status: 'RAW_COLLECTION_BLOCKED' as const,
      blockerCodes: [COLLECTION_RAW_SOURCE_BLOCKED],
      details: {
        caseId: collection.caseId,
        sourceStatus: collection.status,
        currency: collection.currency,
        occurredAt: collection.date?.toISOString() ?? null,
      },
    })),
    ...lifecycleDispositions.map((disposition) => ({
      sourceType: 'COLLECTION_DISPOSITION' as const,
      sourceId: disposition.id,
      status: 'LIFECYCLE_BLOCKED' as const,
      blockerCodes: [COLLECTION_DISPOSITION_LIFECYCLE_BLOCKED],
      details: {
        caseId: disposition.caseId,
        sourceStatus: disposition.status,
        currency: disposition.currency,
        occurredAt: disposition.updatedAt?.toISOString() ?? null,
      },
    })),
  ];
  const statusCounts = emptyCollectionDispositionLineReplayStatusCounts();

  for (const item of lineItems) {
    statusCounts[item.status] += 1;
  }

  return {
    sourceType: 'COLLECTION_DISPOSITION_LINE',
    sourceAction: 'posted',
    sourceVersionEvidence: 'postedAt/sourceId/idempotencyKey',
    statusCounts,
    blockerCodes: uniqueSorted([
      ...lineItems.flatMap((item) => item.blockerCodes),
      ...blockerItems.flatMap((item) => item.blockerCodes),
    ]),
    lineItems,
    blockerItems,
  };
}

function collectionDispositionLineReplayItem(
  line: CollectionDispositionLineReplayRow,
  journalEntry: ReplayJournalEntryRow | null,
): CollectionDispositionLineReplayEvidenceItem {
  const manualReversalRequiredAt = line.disposition.manualReversalRequiredAt?.toISOString() ?? null;
  const unmappedLineType = line.type === 'OTHER' || line.type === 'HELD_PENDING_DISTRIBUTION';
  const status: CollectionDispositionLineReplayEvidenceStatus = manualReversalRequiredAt
    ? 'MANUAL_REVERSAL_BLOCKED'
    : unmappedLineType
      ? 'UNMAPPED_LINE_BLOCKED'
      : 'REPLAY_ELIGIBLE';
  const blockerCodes = status === 'MANUAL_REVERSAL_BLOCKED'
    ? [COLLECTION_DISPOSITION_LINE_MANUAL_REVERSAL_BLOCKED]
    : status === 'UNMAPPED_LINE_BLOCKED'
      ? [COLLECTION_DISPOSITION_LINE_UNMAPPED_BLOCKED]
      : [];

  return {
    dispositionLineId: line.id,
    status,
    blockerCodes,
    journalEntryId: journalEntry?.id ?? null,
    details: {
      dispositionId: line.disposition.id,
      collectionId: line.disposition.collectionId,
      caseId: line.disposition.caseId,
      caseClientId: line.caseClientId,
      lineType: line.type,
      amount: line.amount.toString(),
      currency: line.disposition.currency,
      postedAt: line.disposition.postedAt?.toISOString() ?? null,
      manualReversalRequiredAt,
    },
  };
}

function buildBalanceLedgerReplayEvidence(
  balanceLedgers: BalanceLedgerReplayRow[],
  journalBySource: Map<string, ReplayJournalEntryRow>,
): BalanceLedgerReplayEvidenceSummary {
  const items = balanceLedgers.map((ledger) => balanceLedgerReplayItem(ledger, journalBySource.get(`BALANCE_LEDGER:posted:${ledger.id}`) ?? null));
  const statusCounts = emptyBalanceLedgerReplayStatusCounts();

  for (const item of items) {
    statusCounts[item.status] += 1;
  }

  return {
    sourceType: 'BALANCE_LEDGER',
    sourceAction: 'posted',
    sourceVersionEvidence: 'createdAt/sourceId/idempotencyKey',
    statusCounts,
    blockerCodes: uniqueSorted(items.flatMap((item) => item.blockerCodes)),
    items,
  };
}

function balanceLedgerReplayItem(
  ledger: BalanceLedgerReplayRow,
  journalEntry: ReplayJournalEntryRow | null,
): BalanceLedgerReplayEvidenceItem {
  const correlatedDispositionLine = isDispositionLineSource(ledger.source) || isDispositionLineSource(ledger.sourceId) || ledger.source === 'disposition_line';
  const unmappedType = ledger.type !== 'CREDIT' && ledger.type !== 'DEBIT';
  const status: BalanceLedgerReplayEvidenceStatus = correlatedDispositionLine
    ? 'CORRELATED_DISPOSITION_LINE_SUPPRESSED'
    : unmappedType
      ? 'UNMAPPED_LEDGER_BLOCKED'
      : 'REPLAY_ELIGIBLE';
  const blockerCodes = status === 'CORRELATED_DISPOSITION_LINE_SUPPRESSED'
    ? [BALANCE_LEDGER_CORRELATED_DISPOSITION_LINE_SUPPRESSED]
    : status === 'UNMAPPED_LEDGER_BLOCKED'
      ? [BALANCE_LEDGER_ADJUST_REFUND_UNMAPPED]
      : [];

  return {
    balanceLedgerId: ledger.id,
    status,
    blockerCodes,
    journalEntryId: journalEntry?.id ?? null,
    details: {
      caseId: ledger.caseBalance.caseId,
      ledgerType: ledger.type,
      amount: ledger.amount.toString(),
      currency: ledger.currency,
      source: ledger.source,
      sourceId: ledger.sourceId,
      createdAt: ledger.createdAt.toISOString(),
    },
  };
}

function isDispositionLineSource(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith('disposition_line:'));
}

function emptyCollectionDispositionLineReplayStatusCounts(): Record<CollectionDispositionLineReplayEvidenceStatus, number> {
  return {
    REPLAY_ELIGIBLE: 0,
    MANUAL_REVERSAL_BLOCKED: 0,
    UNMAPPED_LINE_BLOCKED: 0,
  };
}

function emptyBalanceLedgerReplayStatusCounts(): Record<BalanceLedgerReplayEvidenceStatus, number> {
  return {
    REPLAY_ELIGIBLE: 0,
    CORRELATED_DISPOSITION_LINE_SUPPRESSED: 0,
    UNMAPPED_LEDGER_BLOCKED: 0,
  };
}

function buildExpenseRequestBackfillEvidence(
  activeRequests: ExpenseRequestLegacyRow[],
  cancelledRequests: ExpenseRequestLegacyRow[],
  journalEntries: ExpenseRequestRecordedJournalEntryRow[],
  settledCounts: Map<string, number>,
): ExpenseRequestBackfillEvidenceSummary {
  const entriesBySourceId = new Map(journalEntries.map((entry) => [entry.sourceId, entry]));
  const items = [
    ...activeRequests.map((request) => buildActiveExpenseRequestEvidenceItem(request, entriesBySourceId.get(request.id))),
    ...cancelledRequests.map((request) => buildCancelledExpenseRequestEvidenceItem(request, entriesBySourceId.get(request.id), settledCounts.get(request.id) ?? 0)),
  ];
  const statusCounts = emptyExpenseRequestEvidenceStatusCounts();

  for (const item of items) {
    statusCounts[item.status] += 1;
  }

  return {
    sourceType: 'EXPENSE_REQUEST',
    sourceAction: 'recorded',
    sourceVersionEvidence: 'idempotencyKey/sourceHash/sourceTuple',
    statusCounts,
    blockerCodes: uniqueSorted(items.flatMap((item) => item.blockerCodes)),
    items,
  };
}

function buildActiveExpenseRequestEvidenceItem(
  request: ExpenseRequestLegacyRow,
  entry: ExpenseRequestRecordedJournalEntryRow | undefined,
): ExpenseRequestBackfillEvidenceItem {
  const legacyValue = decimalOf(request.totalAmount);
  const receivableLine = entry?.lines.find((line) => (
    line.accountCode === 'CLIENT_EXPENSE_RECEIVABLE' &&
    line.direction === 'DEBIT' &&
    line.expenseRequestId === request.id
  ));
  const journalValue = receivableLine ? decimalOf(receivableLine.amount) : ZERO;
  const delta = journalValue.minus(legacyValue);

  if (!entry || !receivableLine) {
    return expenseRequestEvidenceItem(request, 'BACKFILL_REQUIRED', legacyValue, journalValue, delta, [EXPENSE_REQUEST_BACKFILL_MISSING], entry ?? null, receivableLine ?? null, 0);
  }

  const dimensionMismatch = receivableLine.caseId !== request.caseId ||
    receivableLine.clientId !== request.clientId ||
    receivableLine.currency !== request.currency;
  if (dimensionMismatch) {
    return expenseRequestEvidenceItem(request, 'DIMENSION_MISMATCH', legacyValue, journalValue, delta, [EXPENSE_REQUEST_DIMENSION_MISMATCH], entry, receivableLine, 0);
  }

  if (!delta.equals(ZERO)) {
    return expenseRequestEvidenceItem(request, 'VALUE_MISMATCH', legacyValue, journalValue, delta, [EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH], entry, receivableLine, 0);
  }

  return expenseRequestEvidenceItem(request, 'MATCHED', legacyValue, journalValue, delta, [], entry, receivableLine, 0);
}

function buildCancelledExpenseRequestEvidenceItem(
  request: ExpenseRequestLegacyRow,
  entry: ExpenseRequestRecordedJournalEntryRow | undefined,
  settledActivityCount: number,
): ExpenseRequestBackfillEvidenceItem {
  const legacyValue = decimalOf(request.totalAmount);
  const receivableLine = entry?.lines.find((line) => (
    line.accountCode === 'CLIENT_EXPENSE_RECEIVABLE' &&
    line.direction === 'DEBIT' &&
    line.expenseRequestId === request.id
  ));
  const journalValue = receivableLine ? decimalOf(receivableLine.amount) : ZERO;
  const delta = journalValue.minus(legacyValue);
  const status: ExpenseRequestBackfillEvidenceStatus = settledActivityCount > 0 ? 'SETTLED_CANCEL_BLOCKED' : 'CANCELLED_SOURCE_BLOCKED';
  const blockerCodes = settledActivityCount > 0
    ? [EXPENSE_REQUEST_SETTLED_CANCEL_BLOCKED]
    : [EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED];

  return expenseRequestEvidenceItem(request, status, legacyValue, journalValue, delta, blockerCodes, entry ?? null, receivableLine ?? null, settledActivityCount);
}

function expenseRequestEvidenceItem(
  request: ExpenseRequestLegacyRow,
  status: ExpenseRequestBackfillEvidenceStatus,
  legacyValue: Prisma.Decimal,
  journalValue: Prisma.Decimal,
  delta: Prisma.Decimal,
  blockerCodes: string[],
  entry: ExpenseRequestRecordedJournalEntryRow | null,
  line: ExpenseRequestRecordedJournalEntryRow['lines'][number] | null,
  settledActivityCount: number,
): ExpenseRequestBackfillEvidenceItem {
  return {
    expenseRequestId: request.id,
    status,
    legacyValue: decimalToString(legacyValue),
    journalValue: decimalToString(journalValue),
    delta: decimalToString(delta),
    blockerCodes,
    journalEntryId: entry?.id ?? null,
    details: {
      caseId: request.caseId,
      clientId: request.clientId,
      currency: request.currency,
      journalCaseId: line?.caseId ?? null,
      journalClientId: line?.clientId ?? null,
      journalCurrency: line?.currency ?? null,
      settledActivityCount,
    },
  };
}

function emptyExpenseRequestEvidenceStatusCounts(): Record<ExpenseRequestBackfillEvidenceStatus, number> {
  return {
    MATCHED: 0,
    BACKFILL_REQUIRED: 0,
    VALUE_MISMATCH: 0,
    DIMENSION_MISMATCH: 0,
    CANCELLED_SOURCE_BLOCKED: 0,
    SETTLED_CANCEL_BLOCKED: 0,
  };
}

function decimalOf(value: string | number | { toString(): string }): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function decimalToString(value: Prisma.Decimal): string {
  return value.toString();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
