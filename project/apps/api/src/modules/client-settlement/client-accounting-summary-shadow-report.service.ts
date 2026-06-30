import { Injectable } from '@nestjs/common';

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
  | 'BALANCE_LEDGER';

export interface ClientAccountingSummaryShadowReportRequest {
  tenantId: string;
  clientId: string;
  currency?: string;
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
  blockerCodes: string[];
  gapCodes: string[];
  nextImplementationTasks: string[];
}

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
    coverage: 'GAP',
    legacySources: ['ExpenseRequest'],
    journalSources: [],
    blockerCodes: ['EXPENSE_REQUEST_JOURNAL_COVERAGE_MISSING'],
    gapCodes: ['EXPENSE_REQUEST_JOURNAL_SOURCE_MISSING'],
  },
  {
    key: 'expensePaid',
    responsePath: 'clientScoped.expensePaid',
    group: 'CLIENT_SCOPED',
    coverage: 'GAP',
    legacySources: ['ExpenseRequest', 'ExpensePayment'],
    journalSources: [],
    blockerCodes: ['EXPENSE_REQUEST_JOURNAL_COVERAGE_MISSING'],
    gapCodes: ['EXPENSE_PAYMENT_JOURNAL_SOURCE_MISSING', 'EXPENSE_REQUEST_PAID_TOTAL_PROJECTION_ONLY'],
  },
  {
    key: 'expenseUnpaid',
    responsePath: 'clientScoped.expenseUnpaid',
    group: 'CLIENT_SCOPED',
    coverage: 'BLOCKER',
    legacySources: ['ExpenseRequest', 'ClientOffset', 'CollectionDispositionExpenseApplication'],
    journalSources: ['CLIENT_OFFSET'],
    blockerCodes: [
      'EXPENSE_REQUEST_JOURNAL_COVERAGE_MISSING',
      'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_COVERAGE_MISSING',
    ],
    gapCodes: ['EXPENSE_REQUEST_JOURNAL_SOURCE_MISSING'],
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
  'ACCT-CUTOVER-3B implement journal-supported summary shadow values for payableNet paidToClient offsetApplied',
  'ACCT-CUTOVER-3C define journal coverage for ExpenseRequest ExpensePayment and reimbursement applications',
  'ACCT-CUTOVER-3D define case-context Collection and CaseBalance journal replay policy',
];

@Injectable()
export class ClientAccountingSummaryShadowReportService {
  /// <remarks>
  /// Cagrildigi yerler:
  /// - ACCT-CUTOVER-3A tests -> read-only component coverage report for GET /clients/:clientId/accounting/summary readiness.
  /// </remarks>
  getSummaryShadowReport(
    request: ClientAccountingSummaryShadowReportRequest,
  ): ClientAccountingSummaryShadowReport {
    const components = SUMMARY_COMPONENTS.map((component) => ({
      ...component,
      legacySources: [...component.legacySources],
      journalSources: [...component.journalSources],
      blockerCodes: [...component.blockerCodes],
      gapCodes: [...component.gapCodes],
    }));

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
      blockerCodes: uniqueSorted(components.flatMap((component) => component.blockerCodes)),
      gapCodes: uniqueSorted(components.flatMap((component) => component.gapCodes)),
      nextImplementationTasks: [...NEXT_IMPLEMENTATION_TASKS],
    };
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
