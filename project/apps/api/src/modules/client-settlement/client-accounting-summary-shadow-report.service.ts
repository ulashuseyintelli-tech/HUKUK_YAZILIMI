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

export type ExpensePaymentBackfillEvidenceStatus =
  | 'MATCHED'
  | 'BACKFILL_REQUIRED'
  | 'VALUE_MISMATCH'
  | 'DIMENSION_MISMATCH'
  | 'REVERSAL_REFUND_POLICY_BLOCKED'
  | 'REVERSAL_INCOMPLETE_BLOCKED'
  | 'REVERSAL_VALUE_MISMATCH'
  | 'REVERSAL_DIMENSION_MISMATCH'
  | 'PARENT_CANCELLED_BLOCKED';

export interface ExpensePaymentBackfillEvidenceItem {
  expensePaymentId: string;
  expenseRequestId: string;
  status: ExpensePaymentBackfillEvidenceStatus;
  legacyValue: string | null;
  journalValue: string | null;
  delta: string | null;
  blockerCodes: string[];
  journalEntryId: string | null;
  details: {
    caseId: string | null;
    clientId: string | null;
    currency: string;
    parentStatus: string;
    journalCaseId: string | null;
    journalClientId: string | null;
    journalCurrency: string | null;
    journalExpenseRequestId: string | null;
    journalExpensePaymentId: string | null;
    sourceAction: string | null;
    policyReason: string | null;
    reversalStatus: string | null;
    reversalJournalEntryId: string | null;
    reversalJournalValue: string | null;
  };
}

export interface ExpensePaymentBackfillEvidenceSummary {
  sourceType: 'EXPENSE_PAYMENT';
  sourceAction: 'recorded';
  sourceVersionEvidence: 'idempotencyKey/sourceHash/sourceTuple';
  statusCounts: Record<ExpensePaymentBackfillEvidenceStatus, number>;
  blockerCodes: string[];
  items: ExpensePaymentBackfillEvidenceItem[];
}

export interface ExpenseUnpaidJournalBreakdown {
  legacyValue: string;
  requestedJournalValue: string;
  paidJournalValue: string;
  offsetAppliedJournalValue: string;
  offsetReversalJournalValue: string;
  reimbursementAppliedJournalValue: string;
  reimbursementReversalJournalValue: string;
  journalValue: string;
  delta: string;
  blockerCodes: string[];
  blockerReason: string | null;
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

export interface CollectionCaseContextEvidenceItem {
  sourceType: 'COLLECTION' | 'COLLECTION_DISPOSITION';
  sourceId: string;
  status: 'BRIDGE_EVENT_ONLY' | 'NON_FINANCIAL_LIFECYCLE' | 'REFUND_POLICY_BLOCKED';
  blockerCodes: string[];
  details: {
    caseId: string;
    sourceStatus: string;
    currency: string;
    occurredAt: string | null;
    effect: 'NO_DIRECT_CLIENT_EFFECT' | 'NON_FINANCIAL_LIFECYCLE' | 'REFUND_POLICY_UNMAPPED';
  };
}

export interface CollectionDispositionReplayEvidenceSummary {
  sourceType: 'COLLECTION_DISPOSITION_LINE';
  sourceAction: 'posted';
  sourceVersionEvidence: 'postedAt/sourceId/idempotencyKey';
  statusCounts: Record<CollectionDispositionLineReplayEvidenceStatus, number>;
  blockerCodes: string[];
  lineItems: CollectionDispositionLineReplayEvidenceItem[];
  contextItems: CollectionCaseContextEvidenceItem[];
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
  expensePaymentBackfillEvidence?: ExpensePaymentBackfillEvidenceSummary;
  expensePaidComparison?: ClientAccountingSummaryShadowValueComparison;
  expenseUnpaidBreakdown?: ExpenseUnpaidJournalBreakdown;
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
  paidTotal: { toString(): string };
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

interface ExpensePaymentLegacyRow {
  id: string;
  expenseRequestId: string;
  amount: { toString(): string };
  createdAt: Date;
  paymentDate: Date;
  expenseRequest: {
    id: string;
    caseId: string;
    clientId: string;
    currency: string;
    status: string;
  };
}

interface ExpensePaymentRecordedJournalEntryRow {
  id: string;
  sourceId: string;
  sourceAction: string;
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
    expensePaymentId: string | null;
  }>;
}

interface ExpensePaymentReversalEvidenceRow {
  id: string;
  expensePaymentId: string;
  status: string;
  originalJournalEntryId: string;
  reversalJournalEntryId: string | null;
  reversalJournalEntry: {
    id: string;
    entryType: string;
    sourceType: string;
    sourceAction: string;
    reversalOfEntryId: string | null;
    lines: Array<{
      accountCode: string;
      direction: string;
      amount: { toString(): string };
      currency: string;
      caseId: string | null;
      clientId: string | null;
      expenseRequestId: string | null;
      expensePaymentId: string | null;
    }>;
  } | null;
}
interface ExpenseReceivableAdjustmentJournalLine {
  amount: { toString(): string };
  direction: string;
  journalEntry: {
    sourceType: string;
    sourceAction: string;
  };
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
  expensePaid: string;
  expenseUnpaid: string;
  expenseRequestedComparison: ClientAccountingSummaryShadowValueComparison;
  expensePaidComparison: ClientAccountingSummaryShadowValueComparison;
  expenseUnpaidComparison: ClientAccountingSummaryShadowValueComparison;
  expenseUnpaidBreakdown: ExpenseUnpaidJournalBreakdown;
  expenseRequestBackfillEvidence: ExpenseRequestBackfillEvidenceSummary;
  expensePaymentBackfillEvidence: ExpensePaymentBackfillEvidenceSummary;
  replayEvidence: ClientAccountingSummaryReplayEvidenceReport;
}

const ZERO = new Prisma.Decimal(0);
const SUPPORTED_COMPONENT_KEYS = ['payableNet', 'paidToClient', 'offsetApplied', 'expenseRequested', 'expensePaid', 'expenseUnpaid'] as const;
const VALUE_MISMATCH_BLOCKER = 'SUMMARY_SUPPORTED_COMPONENT_VALUE_MISMATCH';
const EXPENSE_REQUEST_BACKFILL_MISSING = 'EXPENSE_REQUEST_BACKFILL_MISSING';
const EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH = 'EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH';
const EXPENSE_REQUEST_DIMENSION_MISMATCH = 'EXPENSE_REQUEST_DIMENSION_MISMATCH';
const EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED = 'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED';
const EXPENSE_REQUEST_SETTLED_CANCEL_BLOCKED = 'EXPENSE_REQUEST_SETTLED_CANCEL_BLOCKED';
const EXPENSE_PAYMENT_BACKFILL_MISSING = 'EXPENSE_PAYMENT_BACKFILL_MISSING';
const EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH = 'EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH';
const EXPENSE_PAYMENT_DIMENSION_MISMATCH = 'EXPENSE_PAYMENT_DIMENSION_MISMATCH';
const EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING = 'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING';
const EXPENSE_PAYMENT_REVERSAL_INCOMPLETE = 'EXPENSE_PAYMENT_REVERSAL_INCOMPLETE';
const EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH = 'EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH';
const EXPENSE_PAYMENT_REVERSAL_DIMENSION_MISMATCH = 'EXPENSE_PAYMENT_REVERSAL_DIMENSION_MISMATCH';
const EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED = 'EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED';
const EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS = 'EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS';
const COLLECTION_REFUND_POLICY_UNMAPPED = 'COLLECTION_REFUND_POLICY_UNMAPPED';
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
      'EXPENSE_PAYMENT_BACKFILL_MISSING',
      'EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH',
      'EXPENSE_PAYMENT_DIMENSION_MISMATCH',
      'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
      'EXPENSE_PAYMENT_REVERSAL_INCOMPLETE',
      'EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH',
      'EXPENSE_PAYMENT_REVERSAL_DIMENSION_MISMATCH',
      'EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED',
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
      'EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS',
      'EXPENSE_PAYMENT_BACKFILL_MISSING',
      'EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH',
      'EXPENSE_PAYMENT_DIMENSION_MISMATCH',
      'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
      'EXPENSE_PAYMENT_REVERSAL_INCOMPLETE',
      'EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH',
      'EXPENSE_PAYMENT_REVERSAL_DIMENSION_MISMATCH',
      'EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED',
      'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED',
      'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
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
      'EXPENSE_PAYMENT_BACKFILL_MISSING',
      'EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH',
      'EXPENSE_PAYMENT_DIMENSION_MISMATCH',
      'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
      'EXPENSE_PAYMENT_REVERSAL_INCOMPLETE',
      'EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH',
      'EXPENSE_PAYMENT_REVERSAL_DIMENSION_MISMATCH',
      'EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED',
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
      'EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS',
      'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
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
  'ACCT-CUTOVER-3E2B close ExpensePayment reversal/refund and expenseUnpaid primary cutover blockers',
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
  ): Promise<Pick<
    ExpenseRequestShadowValues,
    | 'expenseRequested'
    | 'expensePaid'
    | 'expenseUnpaid'
    | 'expenseRequestedComparison'
    | 'expensePaidComparison'
    | 'expenseUnpaidComparison'
    | 'expenseUnpaidBreakdown'
    | 'expenseRequestBackfillEvidence'
    | 'expensePaymentBackfillEvidence'
  >> {
    const activeRequests = (await this.prisma!.expenseRequest.findMany({
      where: { tenantId: request.tenantId, clientId: request.clientId, currency, status: { not: 'CANCELLED' } },
      select: { id: true, caseId: true, clientId: true, totalAmount: true, paidTotal: true, currency: true, status: true },
    })) as ExpenseRequestLegacyRow[];
    const cancelledRequests = (await this.prisma!.expenseRequest.findMany({
      where: { tenantId: request.tenantId, clientId: request.clientId, currency, status: 'CANCELLED' },
      select: { id: true, caseId: true, clientId: true, totalAmount: true, paidTotal: true, currency: true, status: true },
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
    const payments = (await this.prisma!.expensePayment.findMany({
      where: { expenseRequest: { tenantId: request.tenantId, clientId: request.clientId, currency } },
      select: {
        id: true,
        expenseRequestId: true,
        amount: true,
        createdAt: true,
        paymentDate: true,
        expenseRequest: {
          select: {
            id: true,
            caseId: true,
            clientId: true,
            currency: true,
            status: true,
          },
        },
      },
    })) as ExpensePaymentLegacyRow[];
    const paymentIds = payments.map((row) => row.id);
    const paymentJournalEntries = paymentIds.length === 0 ? [] : (await this.prisma!.accountingJournalEntry.findMany({
      where: {
        tenantId: request.tenantId,
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: { in: paymentIds },
      },
      select: {
        id: true,
        sourceId: true,
        sourceAction: true,
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
            expensePaymentId: true,
          },
        },
      },
    })) as ExpensePaymentRecordedJournalEntryRow[];
    const paymentReversals = paymentIds.length === 0 ? [] : (await (this.prisma! as PrismaService & { expensePaymentReversal: { findMany(args: unknown): Promise<unknown[]> } }).expensePaymentReversal.findMany({
      where: {
        tenantId: request.tenantId,
        expensePaymentId: { in: paymentIds },
        kind: 'REVERSAL',
      },
      select: {
        id: true,
        expensePaymentId: true,
        status: true,
        originalJournalEntryId: true,
        reversalJournalEntryId: true,
        reversalJournalEntry: {
          select: {
            id: true,
            entryType: true,
            sourceType: true,
            sourceAction: true,
            reversalOfEntryId: true,
            lines: {
              select: {
                accountCode: true,
                direction: true,
                amount: true,
                currency: true,
                caseId: true,
                clientId: true,
                expenseRequestId: true,
                expensePaymentId: true,
              },
            },
          },
        },
      },
    })) as ExpensePaymentReversalEvidenceRow[];
    const adjustmentLines = activeIds.length === 0 ? [] : (await this.prisma!.accountingJournalLine.findMany({
      where: {
        tenantId: request.tenantId,
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        currency,
        expenseRequestId: { in: activeIds },
        journalEntry: {
          tenantId: request.tenantId,
          OR: [
            { sourceType: 'CLIENT_OFFSET', sourceAction: { in: ['apply', 'reversal'] } },
            { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: { in: ['apply', 'reversal'] } },
          ],
        },
      },
      select: {
        amount: true,
        direction: true,
        journalEntry: { select: { sourceType: true, sourceAction: true } },
      },
    })) as ExpenseReceivableAdjustmentJournalLine[];

    const settledCounts = await this.computeExpenseRequestSettledActivityCounts(request.tenantId, allIds);
    const requestEvidence = buildExpenseRequestBackfillEvidence(activeRequests, cancelledRequests, journalEntries, settledCounts);
    const paymentEvidence = buildExpensePaymentBackfillEvidence(payments, paymentJournalEntries, paymentReversals);
    const activePaymentIds = new Set(payments
      .filter((payment) => payment.expenseRequest.status !== 'CANCELLED')
      .map((payment) => payment.id));

    const requestedLegacyValue = activeRequests.reduce((sum, row) => sum.plus(decimalOf(row.totalAmount)), ZERO);
    const requestedJournalValue = requestEvidence.items
      .filter((item) => activeIds.includes(item.expenseRequestId))
      .reduce((sum, item) => sum.plus(decimalOf(item.journalValue ?? '0')), ZERO);
    const requestedDelta = requestedJournalValue.minus(requestedLegacyValue);
    const requestedBlockerCodes = uniqueSorted([
      ...requestEvidence.blockerCodes,
      ...(!requestedDelta.equals(ZERO) ? [EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH] : []),
    ]);

    const paidLegacyValue = activeRequests.reduce((sum, row) => sum.plus(decimalOf(row.paidTotal)), ZERO);
    const paidJournalValue = paymentEvidence.items
      .filter((item) => activePaymentIds.has(item.expensePaymentId))
      .reduce((sum, item) => sum.plus(decimalOf(item.journalValue ?? '0')), ZERO);
    const paidDelta = paidJournalValue.minus(paidLegacyValue);
    const paidBlockerCodes = uniqueSorted([
      ...paymentEvidence.blockerCodes,
      ...(!paidDelta.equals(ZERO) ? [EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH] : []),
    ]);

    const receivableAdjustments = expenseReceivableAdjustmentBreakdown(adjustmentLines);
    const unpaidLegacyValue = activeRequests.reduce((sum, row) => sum.plus(decimalOf(row.totalAmount).minus(decimalOf(row.paidTotal))), ZERO);
    const unpaidJournalValue = requestedJournalValue
      .minus(paidJournalValue)
      .minus(receivableAdjustments.offsetApplied)
      .plus(receivableAdjustments.offsetReversal)
      .minus(receivableAdjustments.reimbursementApplied)
      .plus(receivableAdjustments.reimbursementReversal);
    const unpaidDelta = unpaidJournalValue.minus(unpaidLegacyValue);
    const unpaidBlockerCodes = uniqueSorted([
      EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS,
      ...requestedBlockerCodes,
      ...paidBlockerCodes,
    ]);

    const expensePaidComparison: ClientAccountingSummaryShadowValueComparison = {
      legacyValue: decimalToString(paidLegacyValue),
      journalValue: decimalToString(paidJournalValue),
      delta: decimalToString(paidDelta),
      status: paidDelta.equals(ZERO) ? 'MATCH' : 'MISMATCH',
      blockerCodes: paidBlockerCodes,
      blockerReason: paidBlockerCodes[0] ?? null,
    };
    const expenseUnpaidBreakdown: ExpenseUnpaidJournalBreakdown = {
      legacyValue: decimalToString(unpaidLegacyValue),
      requestedJournalValue: decimalToString(requestedJournalValue),
      paidJournalValue: decimalToString(paidJournalValue),
      offsetAppliedJournalValue: decimalToString(receivableAdjustments.offsetApplied),
      offsetReversalJournalValue: decimalToString(receivableAdjustments.offsetReversal),
      reimbursementAppliedJournalValue: decimalToString(receivableAdjustments.reimbursementApplied),
      reimbursementReversalJournalValue: decimalToString(receivableAdjustments.reimbursementReversal),
      journalValue: decimalToString(unpaidJournalValue),
      delta: decimalToString(unpaidDelta),
      blockerCodes: unpaidBlockerCodes,
      blockerReason: unpaidBlockerCodes[0] ?? null,
    };

    return {
      expenseRequested: decimalToString(requestedJournalValue),
      expensePaid: decimalToString(paidJournalValue),
      expenseUnpaid: decimalToString(unpaidJournalValue),
      expenseRequestedComparison: {
        legacyValue: decimalToString(requestedLegacyValue),
        journalValue: decimalToString(requestedJournalValue),
        delta: decimalToString(requestedDelta),
        status: requestedBlockerCodes.includes(EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH) ? 'MISMATCH' : 'MATCH',
        blockerCodes: requestedBlockerCodes,
        blockerReason: requestedBlockerCodes[0] ?? null,
      },
      expensePaidComparison,
      expenseUnpaidComparison: {
        legacyValue: decimalToString(unpaidLegacyValue),
        journalValue: decimalToString(unpaidJournalValue),
        delta: decimalToString(unpaidDelta),
        status: unpaidDelta.equals(ZERO) ? 'MATCH' : 'MISMATCH',
        blockerCodes: unpaidBlockerCodes,
        blockerReason: unpaidBlockerCodes[0] ?? null,
      },
      expenseUnpaidBreakdown,
      expenseRequestBackfillEvidence: requestEvidence,
      expensePaymentBackfillEvidence: paymentEvidence,
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
      expensePaymentBackfillEvidence: shadowValues?.expensePaymentBackfillEvidence,
      expensePaidComparison: shadowValues?.expensePaidComparison,
      expenseUnpaidBreakdown: shadowValues?.expenseUnpaidBreakdown,
      replayEvidence: shadowValues?.replayEvidence,
      blockerCodes: uniqueSorted([
        ...components.flatMap((component) => component.blockerCodes),
        ...expenseCoveragePolicy.blockerCodes,
        ...supportedValueSummary.blockerCodes,
        ...(shadowValues?.expenseRequestBackfillEvidence.blockerCodes ?? []),
        ...(shadowValues?.expensePaymentBackfillEvidence.blockerCodes ?? []),
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

    if (key === 'expenseRequested' || key === 'expensePaid' || key === 'expenseUnpaid') {
      const comparison = key === 'expenseRequested'
        ? shadowValues?.expenseRequestedComparison
        : key === 'expensePaid'
          ? shadowValues?.expensePaidComparison
          : shadowValues?.expenseUnpaidComparison;
      if (comparison) {
        component.valueComparison = { ...comparison };
        component.blockerCodes = uniqueSorted([...component.blockerCodes, ...comparison.blockerCodes]);
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
  const contextItems: CollectionCaseContextEvidenceItem[] = [
    ...collections.map(collectionContextEvidenceItem),
    ...lifecycleDispositions.map(collectionDispositionLifecycleContextEvidenceItem),
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
      ...contextItems.flatMap((item) => item.blockerCodes),
    ]),
    lineItems,
    contextItems,
  };
}

function collectionContextEvidenceItem(collection: CollectionReplayRow): CollectionCaseContextEvidenceItem {
  const isRefunded = collection.status === 'REFUNDED';
  return {
    sourceType: 'COLLECTION',
    sourceId: collection.id,
    status: isRefunded ? 'REFUND_POLICY_BLOCKED' : 'BRIDGE_EVENT_ONLY',
    blockerCodes: isRefunded ? [COLLECTION_REFUND_POLICY_UNMAPPED] : [],
    details: {
      caseId: collection.caseId,
      sourceStatus: collection.status,
      currency: collection.currency,
      occurredAt: collection.date?.toISOString() ?? null,
      effect: isRefunded ? 'REFUND_POLICY_UNMAPPED' : 'NO_DIRECT_CLIENT_EFFECT',
    },
  };
}

function collectionDispositionLifecycleContextEvidenceItem(
  disposition: CollectionDispositionLifecycleReplayRow,
): CollectionCaseContextEvidenceItem {
  return {
    sourceType: 'COLLECTION_DISPOSITION',
    sourceId: disposition.id,
    status: 'NON_FINANCIAL_LIFECYCLE',
    blockerCodes: [],
    details: {
      caseId: disposition.caseId,
      sourceStatus: disposition.status,
      currency: disposition.currency,
      occurredAt: disposition.updatedAt?.toISOString() ?? null,
      effect: 'NON_FINANCIAL_LIFECYCLE',
    },
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

function buildExpensePaymentBackfillEvidence(
  payments: ExpensePaymentLegacyRow[],
  journalEntries: ExpensePaymentRecordedJournalEntryRow[],
  reversals: ExpensePaymentReversalEvidenceRow[],
): ExpensePaymentBackfillEvidenceSummary {
  const entriesBySourceId = new Map<string, ExpensePaymentRecordedJournalEntryRow[]>();
  for (const entry of journalEntries) {
    const entries = entriesBySourceId.get(entry.sourceId) ?? [];
    entries.push(entry);
    entriesBySourceId.set(entry.sourceId, entries);
  }
  const reversalsByPaymentId = new Map<string, ExpensePaymentReversalEvidenceRow>();
  for (const reversal of reversals) {
    reversalsByPaymentId.set(reversal.expensePaymentId, reversal);
  }
  const items = payments.map((payment) => buildExpensePaymentEvidenceItem(
    payment,
    entriesBySourceId.get(payment.id) ?? [],
    reversalsByPaymentId.get(payment.id) ?? null,
  ));
  const statusCounts = emptyExpensePaymentEvidenceStatusCounts();

  for (const item of items) {
    statusCounts[item.status] += 1;
  }

  return {
    sourceType: 'EXPENSE_PAYMENT',
    sourceAction: 'recorded',
    sourceVersionEvidence: 'idempotencyKey/sourceHash/sourceTuple',
    statusCounts,
    blockerCodes: uniqueSorted(items.flatMap((item) => item.blockerCodes)),
    items,
  };
}

function buildExpensePaymentEvidenceItem(
  payment: ExpensePaymentLegacyRow,
  entries: ExpensePaymentRecordedJournalEntryRow[],
  reversal: ExpensePaymentReversalEvidenceRow | null,
): ExpensePaymentBackfillEvidenceItem {
  const paymentValue = decimalOf(payment.amount);
  const unsupportedEntry = entries.find((entry) => entry.sourceAction !== 'recorded');
  const recordedEntry = entries.find((entry) => entry.sourceAction === 'recorded');
  const receivableLine = recordedEntry?.lines.find((line) => (
    line.accountCode === 'CLIENT_EXPENSE_RECEIVABLE' &&
    line.direction === 'CREDIT' &&
    line.expensePaymentId === payment.id
  ));
  const recordedJournalValue = receivableLine ? decimalOf(receivableLine.amount) : ZERO;
  const reversalLine = reversal?.reversalJournalEntry?.lines.find((line) => (
    line.accountCode === 'CLIENT_EXPENSE_RECEIVABLE' &&
    line.direction === 'DEBIT' &&
    line.expensePaymentId === payment.id
  )) ?? null;
  const reversalJournalValue = reversalLine ? decimalOf(reversalLine.amount) : ZERO;
  const netJournalValue = recordedJournalValue.minus(reversalJournalValue);
  const expectedLegacyValue = reversal?.status === 'COMPLETED' ? ZERO : paymentValue;
  const delta = netJournalValue.minus(expectedLegacyValue);

  if (unsupportedEntry) {
    return expensePaymentEvidenceItem(
      payment,
      'REVERSAL_REFUND_POLICY_BLOCKED',
      expectedLegacyValue,
      netJournalValue,
      delta,
      [EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING],
      unsupportedEntry,
      receivableLine ?? null,
      reversal,
      reversalLine,
    );
  }

  if (payment.expenseRequest.status === 'CANCELLED') {
    return expensePaymentEvidenceItem(
      payment,
      'PARENT_CANCELLED_BLOCKED',
      expectedLegacyValue,
      netJournalValue,
      delta,
      [EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED],
      recordedEntry ?? null,
      receivableLine ?? null,
      reversal,
      reversalLine,
    );
  }

  if (!recordedEntry || !receivableLine) {
    return expensePaymentEvidenceItem(
      payment,
      'BACKFILL_REQUIRED',
      expectedLegacyValue,
      netJournalValue,
      delta,
      [EXPENSE_PAYMENT_BACKFILL_MISSING],
      recordedEntry ?? null,
      receivableLine ?? null,
      reversal,
      reversalLine,
    );
  }

  const recordedDimensionMismatch = receivableLine.caseId !== payment.expenseRequest.caseId ||
    receivableLine.clientId !== payment.expenseRequest.clientId ||
    receivableLine.currency !== payment.expenseRequest.currency ||
    receivableLine.expenseRequestId !== payment.expenseRequestId ||
    receivableLine.expensePaymentId !== payment.id;
  if (recordedDimensionMismatch) {
    return expensePaymentEvidenceItem(
      payment,
      'DIMENSION_MISMATCH',
      expectedLegacyValue,
      netJournalValue,
      delta,
      [EXPENSE_PAYMENT_DIMENSION_MISMATCH],
      recordedEntry,
      receivableLine,
      reversal,
      reversalLine,
    );
  }

  if (reversal) {
    const reversalEntry = reversal.reversalJournalEntry;
    const reversalIncomplete = reversal.status !== 'COMPLETED' ||
      !reversal.reversalJournalEntryId ||
      !reversalEntry ||
      reversalEntry.entryType !== 'ACCOUNTING_JOURNAL_REVERSAL' ||
      reversalEntry.sourceType !== 'ACCOUNTING_JOURNAL_ENTRY' ||
      reversalEntry.sourceAction !== 'reversal' ||
      reversalEntry.reversalOfEntryId !== recordedEntry.id;
    if (reversalIncomplete) {
      return expensePaymentEvidenceItem(
        payment,
        'REVERSAL_INCOMPLETE_BLOCKED',
        expectedLegacyValue,
        netJournalValue,
        delta,
        [EXPENSE_PAYMENT_REVERSAL_INCOMPLETE],
        recordedEntry,
        receivableLine,
        reversal,
        reversalLine,
      );
    }

    const reversalDimensionMismatch = !reversalLine ||
      reversalLine.caseId !== payment.expenseRequest.caseId ||
      reversalLine.clientId !== payment.expenseRequest.clientId ||
      reversalLine.currency !== payment.expenseRequest.currency ||
      reversalLine.expenseRequestId !== payment.expenseRequestId ||
      reversalLine.expensePaymentId !== payment.id;
    if (reversalDimensionMismatch) {
      return expensePaymentEvidenceItem(
        payment,
        'REVERSAL_DIMENSION_MISMATCH',
        expectedLegacyValue,
        netJournalValue,
        delta,
        [EXPENSE_PAYMENT_REVERSAL_DIMENSION_MISMATCH],
        recordedEntry,
        receivableLine,
        reversal,
        reversalLine,
      );
    }

    if (!reversalJournalValue.equals(recordedJournalValue)) {
      return expensePaymentEvidenceItem(
        payment,
        'REVERSAL_VALUE_MISMATCH',
        expectedLegacyValue,
        netJournalValue,
        delta,
        [EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH],
        recordedEntry,
        receivableLine,
        reversal,
        reversalLine,
      );
    }
  }

  if (!delta.equals(ZERO)) {
    return expensePaymentEvidenceItem(
      payment,
      'VALUE_MISMATCH',
      expectedLegacyValue,
      netJournalValue,
      delta,
      [EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH],
      recordedEntry,
      receivableLine,
      reversal,
      reversalLine,
    );
  }

  return expensePaymentEvidenceItem(payment, 'MATCHED', expectedLegacyValue, netJournalValue, delta, [], recordedEntry, receivableLine, reversal, reversalLine);
}

function expensePaymentEvidenceItem(
  payment: ExpensePaymentLegacyRow,
  status: ExpensePaymentBackfillEvidenceStatus,
  legacyValue: Prisma.Decimal,
  journalValue: Prisma.Decimal,
  delta: Prisma.Decimal,
  blockerCodes: string[],
  entry: ExpensePaymentRecordedJournalEntryRow | null,
  line: ExpensePaymentRecordedJournalEntryRow['lines'][number] | null,
  reversal: ExpensePaymentReversalEvidenceRow | null,
  reversalLine: NonNullable<ExpensePaymentReversalEvidenceRow['reversalJournalEntry']>['lines'][number] | null,
): ExpensePaymentBackfillEvidenceItem {
  return {
    expensePaymentId: payment.id,
    expenseRequestId: payment.expenseRequestId,
    status,
    legacyValue: decimalToString(legacyValue),
    journalValue: decimalToString(journalValue),
    delta: decimalToString(delta),
    blockerCodes,
    journalEntryId: entry?.id ?? null,
    details: {
      caseId: payment.expenseRequest.caseId,
      clientId: payment.expenseRequest.clientId,
      currency: payment.expenseRequest.currency,
      parentStatus: payment.expenseRequest.status,
      journalCaseId: line?.caseId ?? null,
      journalClientId: line?.clientId ?? null,
      journalCurrency: line?.currency ?? null,
      journalExpenseRequestId: line?.expenseRequestId ?? null,
      journalExpensePaymentId: line?.expensePaymentId ?? null,
      sourceAction: entry?.sourceAction ?? null,
      policyReason: status === 'REVERSAL_REFUND_POLICY_BLOCKED'
        ? 'EXPENSE_PAYMENT_REVERSAL_REFUND_DOMAIN_POLICY_MISSING'
        : status === 'REVERSAL_INCOMPLETE_BLOCKED'
          ? 'EXPENSE_PAYMENT_REVERSAL_RUNTIME_EVIDENCE_INCOMPLETE'
          : null,
      reversalStatus: reversal?.status ?? null,
      reversalJournalEntryId: reversal?.reversalJournalEntryId ?? null,
      reversalJournalValue: reversalLine ? decimalToString(decimalOf(reversalLine.amount)) : null,
    },
  };
}
function emptyExpensePaymentEvidenceStatusCounts(): Record<ExpensePaymentBackfillEvidenceStatus, number> {
  return {
    MATCHED: 0,
    BACKFILL_REQUIRED: 0,
    VALUE_MISMATCH: 0,
    DIMENSION_MISMATCH: 0,
    REVERSAL_REFUND_POLICY_BLOCKED: 0,
    REVERSAL_INCOMPLETE_BLOCKED: 0,
    REVERSAL_VALUE_MISMATCH: 0,
    REVERSAL_DIMENSION_MISMATCH: 0,
    PARENT_CANCELLED_BLOCKED: 0,
  };
}

function expenseReceivableAdjustmentBreakdown(lines: ExpenseReceivableAdjustmentJournalLine[]): {
  offsetApplied: Prisma.Decimal;
  offsetReversal: Prisma.Decimal;
  reimbursementApplied: Prisma.Decimal;
  reimbursementReversal: Prisma.Decimal;
} {
  let offsetApplied = ZERO;
  let offsetReversal = ZERO;
  let reimbursementApplied = ZERO;
  let reimbursementReversal = ZERO;

  for (const line of lines) {
    const amount = decimalOf(line.amount);
    const { sourceType, sourceAction } = line.journalEntry;
    const isCredit = line.direction === 'CREDIT';
    const isDebit = line.direction === 'DEBIT';

    if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'apply' && isCredit) {
      offsetApplied = offsetApplied.plus(amount);
    }
    if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'reversal' && isDebit) {
      offsetReversal = offsetReversal.plus(amount);
    }
    if (sourceType === 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION' && sourceAction === 'apply' && isCredit) {
      reimbursementApplied = reimbursementApplied.plus(amount);
    }
    if (sourceType === 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION' && sourceAction === 'reversal' && isDebit) {
      reimbursementReversal = reimbursementReversal.plus(amount);
    }
  }

  return { offsetApplied, offsetReversal, reimbursementApplied, reimbursementReversal };
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
