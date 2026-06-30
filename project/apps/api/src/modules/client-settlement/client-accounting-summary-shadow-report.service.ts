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
  | 'BALANCE_LEDGER';

export type ClientAccountingSummaryShadowValueStatus = 'MATCH' | 'MISMATCH' | 'NOT_COMPUTED';

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
  supportedValueSummary: ClientAccountingSummaryShadowSupportedValueSummary;
  blockerCodes: string[];
  gapCodes: string[];
  nextImplementationTasks: string[];
}

interface CaseClientRow {
  id: string;
}

interface SupportedJournalLine {
  amount: { toString(): string };
  journalEntry: {
    sourceType: string;
    sourceAction: string;
  };
}

const ZERO = new Prisma.Decimal(0);
const SUPPORTED_COMPONENT_KEYS = ['payableNet', 'paidToClient', 'offsetApplied'] as const;
const VALUE_MISMATCH_BLOCKER = 'SUMMARY_SUPPORTED_COMPONENT_VALUE_MISMATCH';

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
  'ACCT-CUTOVER-3C define journal coverage for ExpenseRequest ExpensePayment and reimbursement applications',
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
  ): Promise<ClientAccountingSummaryShadowLegacyClientScopedValues> {
    const currency = request.currency || 'TRY';
    const caseClients = (await this.prisma!.caseClient.findMany({
      where: { clientId: request.clientId, role: { in: ['ALACAKLI', 'ORTAK_ALACAKLI'] }, client: { tenantId: request.tenantId } },
      select: { id: true },
    })) as CaseClientRow[];

    const caseClientIds = caseClients.map((row) => row.id);
    if (caseClientIds.length === 0) {
      return { payableNet: '0', paidToClient: '0', offsetApplied: '0' };
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

    return {
      payableNet: decimalToString(payableNet),
      paidToClient: decimalToString(paidToClient),
      offsetApplied: decimalToString(offsetApplied),
    };
  }

  private buildReport(
    request: ClientAccountingSummaryShadowReportRequest,
    shadowValues: ClientAccountingSummaryShadowLegacyClientScopedValues | null,
  ): ClientAccountingSummaryShadowReport {
    const components = SUMMARY_COMPONENTS.map((component) => cloneComponent(component));
    applySupportedValueComparisons(components, request.legacyClientScoped, shadowValues);
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
      supportedValueSummary,
      blockerCodes: uniqueSorted([
        ...components.flatMap((component) => component.blockerCodes),
        ...supportedValueSummary.blockerCodes,
      ]),
      gapCodes: uniqueSorted(components.flatMap((component) => component.gapCodes)),
      nextImplementationTasks: [...NEXT_IMPLEMENTATION_TASKS],
    };
  }
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
  shadowValues: ClientAccountingSummaryShadowLegacyClientScopedValues | null,
): void {
  for (const key of SUPPORTED_COMPONENT_KEYS) {
    const component = components.find((candidate) => candidate.key === key);
    if (!component) continue;

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

function decimalOf(value: string | number | { toString(): string }): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function decimalToString(value: Prisma.Decimal): string {
  return value.toString();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}