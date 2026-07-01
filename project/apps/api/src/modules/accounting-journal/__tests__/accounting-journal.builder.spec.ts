import {
  buildAccountingJournal,
  buildJournalIdempotencyKey,
  journalIdempotencyMaterialFromSource,
} from '../accounting-journal.builder';
import type {
  AccountingAccountCode,
  AccountingJournalReversalLinePayload,
  AccountingJournalReversalPayload,
  AccountingJournalReversalSource,
  BalanceLedgerJournalSource,
  BalanceLedgerRecordedPayload,
  ClientOffsetJournalSource,
  ClientOffsetJournalSourcePayload,
  ClientPayoutJournalSource,
  ClientPayoutRecordedPayload,
  CollectionDispositionExpenseApplicationJournalSource,
  CollectionDispositionExpenseApplicationPayload,
  CollectionDispositionLineJournalSource,
  CollectionDispositionLinePostedPayload,
  ExpensePaymentJournalSource,
  ExpensePaymentRecordedPayload,
  ExpenseRequestJournalSource,
  ExpenseRequestJournalSourcePayload,
  JournalEntryDraft,
  JournalMetadata,
  JournalValidationErrorCode,
  ManualAdjustmentJournalSource,
} from '../accounting-journal.types';
import {
  validateJournalBusiness,
  validateJournalDraft,
  validateJournalStructure,
} from '../accounting-journal.validators';

interface ClientOffsetSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  sourceAction?: ClientOffsetJournalSource['sourceAction'];
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<Omit<ClientOffsetJournalSourcePayload, 'payableLeg' | 'expenseLeg'>> & {
    payableLeg?: Partial<ClientOffsetJournalSourcePayload['payableLeg']>;
    expenseLeg?: Partial<ClientOffsetJournalSourcePayload['expenseLeg']>;
  };
}

function clientOffsetSource(overrides: ClientOffsetSourceOverrides = {}): ClientOffsetJournalSource {
  const payloadOverrides = overrides.payload ?? {};
  const basePayload: ClientOffsetJournalSourcePayload = {
    kind: 'APPLY',
    amount: '100.00',
    clientId: 'client-1',
    payableLeg: {
      caseId: 'case-payable',
      caseClientId: 'case-client-payable',
    },
    expenseLeg: {
      caseId: 'case-expense',
      caseClientId: null,
      expenseRequestId: 'expense-request-1',
    },
    reversesOffsetId: null,
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'CLIENT_OFFSET',
    sourceId: overrides.sourceId ?? 'offset-1',
    sourceVersion: overrides.sourceVersion ?? '1',
    sourceAction: overrides.sourceAction ?? 'apply',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'source-hash-1',
    metadata: overrides.metadata ?? { sourceName: 'client-offset-test' },
    payload: {
      ...basePayload,
      ...payloadOverrides,
      payableLeg: {
        ...basePayload.payableLeg,
        ...payloadOverrides.payableLeg,
      },
      expenseLeg: {
        ...basePayload.expenseLeg,
        ...payloadOverrides.expenseLeg,
      },
    },
  };
}

function buildDraft(source: ClientOffsetJournalSource = clientOffsetSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function lineByAccount(draft: JournalEntryDraft, accountCode: AccountingAccountCode) {
  const line = draft.lines.find((candidate) => candidate.accountCode === accountCode);
  expect(line).toBeDefined();
  return line!;
}

function expectStructuralError(
  mutate: (draft: JournalEntryDraft) => void,
  expectedCodes: JournalValidationErrorCode[],
) {
  const draft = buildDraft();
  mutate(draft);
  const result = validateJournalStructure(draft);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected structural validation to fail.');
  expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(expectedCodes));
}

function accountingJournalReversalLine(overrides: Partial<AccountingJournalReversalLinePayload> = {}): AccountingJournalReversalLinePayload {
  return {
    lineNo: overrides.lineNo ?? 1,
    accountCode: overrides.accountCode ?? 'CLIENT_PAYABLE',
    direction: overrides.direction ?? 'DEBIT',
    amount: overrides.amount ?? '125.50',
    currency: overrides.currency ?? 'TRY',
    caseId: overrides.caseId ?? 'case-payable',
    clientId: overrides.clientId ?? 'client-1',
    caseClientId: overrides.caseClientId ?? 'case-client-payable',
    collectionId: overrides.collectionId ?? 'collection-1',
    dispositionLineId: overrides.dispositionLineId ?? 'disposition-line-1',
    payoutId: overrides.payoutId ?? null,
    offsetId: overrides.offsetId ?? null,
    expenseRequestId: overrides.expenseRequestId ?? null,
    expensePaymentId: overrides.expensePaymentId ?? null,
    expenseApplicationId: overrides.expenseApplicationId ?? null,
    balanceLedgerId: overrides.balanceLedgerId ?? null,
  };
}

function accountingJournalReversalSource(
  overrides: Partial<Omit<AccountingJournalReversalSource, 'payload' | 'sourceType' | 'sourceAction'>> & {
    payload?: Partial<AccountingJournalReversalPayload>;
  } = {},
): AccountingJournalReversalSource {
  const originalJournalEntryId = overrides.sourceId ?? overrides.payload?.originalJournalEntryId ?? 'journal-original-1';
  const originalLines = overrides.payload?.originalLines ?? [
    accountingJournalReversalLine({ lineNo: 1, accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '125.50' }),
    accountingJournalReversalLine({
      lineNo: 2,
      accountCode: 'CASH_CLEARING',
      direction: 'CREDIT',
      amount: '125.50',
      caseId: 'case-payable',
      clientId: null,
      caseClientId: null,
      collectionId: null,
      dispositionLineId: null,
      payoutId: 'payout-1',
    }),
  ];
  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
    sourceId: originalJournalEntryId,
    sourceVersion: overrides.sourceVersion ?? `2026-07-01T13:00:00.000Z:${originalJournalEntryId}:reversal`,
    sourceAction: 'reversal',
    occurredAt: overrides.occurredAt ?? '2026-07-01T13:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-07-01',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'hash-generic-reversal',
    metadata: overrides.metadata ?? { sourceName: 'generic-reversal-test' },
    payload: {
      originalJournalEntryId,
      originalEntryType: 'CLIENT_PAYOUT_RECORDED',
      originalCaseId: 'case-payable',
      originalCurrency: overrides.currency ?? 'TRY',
      originalSourceType: 'CLIENT_PAYOUT',
      originalSourceId: 'payout-1',
      originalSourceAction: 'recorded',
      originalSourceVersion: '2026-06-30T08:00:00.000Z:payout-1',
      originalLines,
      ...(overrides.payload ?? {}),
    },
  };
}

function buildAccountingJournalReversalDraft(source: AccountingJournalReversalSource = accountingJournalReversalSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}
describe('AccountingJournalBuilder contract skeleton', () => {
  it('builder purity rule: CLIENT_OFFSET draft is deterministic and source object is not mutated', () => {
    const source = clientOffsetSource();
    const sourceBefore = clone(source);

    const first = buildAccountingJournal(source);
    const second = buildAccountingJournal(source);

    expect(first).toEqual(second);
    expect(source).toEqual(sourceBefore);
  });

  it('idempotency rule: key includes tenantId sourceType sourceId sourceAction sourceVersion', () => {
    const source = clientOffsetSource({
      tenantId: 'tenant-idem',
      sourceId: 'offset-idem',
      sourceVersion: '7',
      sourceAction: 'apply',
    });
    const material = journalIdempotencyMaterialFromSource(source);

    expect(buildJournalIdempotencyKey(material)).toBe(
      'acct-journal:v1:tenant-idem:CLIENT_OFFSET:offset-idem:apply:7',
    );
    expect(buildDraft(source).idempotencyKey).toBe(
      'acct-journal:v1:tenant-idem:CLIENT_OFFSET:offset-idem:apply:7',
    );
  });

  it('CLIENT_OFFSET APPLY accounting rule: payable DEBIT keeps payable caseClientId and expense CREDIT has null caseClientId', () => {
    const draft = buildDraft(
      clientOffsetSource({
        sourceId: 'offset-apply-cross',
        payload: {
          kind: 'APPLY',
          amount: '125.50',
          payableLeg: { caseId: 'case-payable-apply', caseClientId: 'cc-payable-apply' },
          expenseLeg: { caseId: 'case-expense-apply', caseClientId: null, expenseRequestId: 'expense-apply' },
        },
      }),
    );

    const payable = lineByAccount(draft, 'CLIENT_PAYABLE');
    const expense = lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE');

    expect(draft.entryType).toBe('CLIENT_OFFSET_APPLIED');
    expect(payable).toEqual(
      expect.objectContaining({
        lineNo: 1,
        direction: 'DEBIT',
        amount: '125.50',
        caseId: 'case-payable-apply',
        clientId: 'client-1',
        caseClientId: 'cc-payable-apply',
        offsetId: 'offset-apply-cross',
        expenseRequestId: null,
      }),
    );
    expect(expense).toEqual(
      expect.objectContaining({
        lineNo: 2,
        direction: 'CREDIT',
        amount: '125.50',
        caseId: 'case-expense-apply',
        clientId: 'client-1',
        caseClientId: null,
        offsetId: 'offset-apply-cross',
        expenseRequestId: 'expense-apply',
      }),
    );
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('CLIENT_OFFSET REVERSAL accounting rule: payable CREDIT keeps payable caseClientId and expense DEBIT has null caseClientId', () => {
    const draft = buildDraft(
      clientOffsetSource({
        sourceId: 'offset-reversal-cross',
        sourceVersion: '2',
        sourceAction: 'reversal',
        payload: {
          kind: 'REVERSAL',
          amount: '125.50',
          payableLeg: { caseId: 'case-payable-reversal', caseClientId: 'cc-payable-reversal' },
          expenseLeg: {
            caseId: 'case-expense-reversal',
            caseClientId: null,
            expenseRequestId: 'expense-reversal',
          },
          reversesOffsetId: 'offset-apply-cross',
        },
      }),
    );

    const payable = lineByAccount(draft, 'CLIENT_PAYABLE');
    const expense = lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE');

    expect(draft.entryType).toBe('CLIENT_OFFSET_REVERSED');
    expect(draft.reversalOf).toEqual(
      expect.objectContaining({
        sourceType: 'CLIENT_OFFSET',
        sourceId: 'offset-apply-cross',
        sourceAction: 'apply',
      }),
    );
    expect(payable).toEqual(
      expect.objectContaining({
        lineNo: 1,
        direction: 'CREDIT',
        amount: '125.50',
        caseId: 'case-payable-reversal',
        clientId: 'client-1',
        caseClientId: 'cc-payable-reversal',
        offsetId: 'offset-reversal-cross',
        expenseRequestId: null,
      }),
    );
    expect(expense).toEqual(
      expect.objectContaining({
        lineNo: 2,
        direction: 'DEBIT',
        amount: '125.50',
        caseId: 'case-expense-reversal',
        clientId: 'client-1',
        caseClientId: null,
        offsetId: 'offset-reversal-cross',
        expenseRequestId: 'expense-reversal',
      }),
    );
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('CLIENT_OFFSET source invariant: APPLY rejects reversesOffsetId and REVERSAL requires original APPLY id', () => {
    const applyWithReversalId = buildAccountingJournal(
      clientOffsetSource({
        payload: {
          kind: 'APPLY',
          reversesOffsetId: 'offset-original',
        },
      }),
    );

    expect(applyWithReversalId.ok).toBe(false);
    if (applyWithReversalId.ok) throw new Error('Expected APPLY source payload validation to fail.');
    expect(applyWithReversalId.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INVALID_SOURCE_PAYLOAD', path: 'payload.reversesOffsetId' })]),
    );

    const reversalWithoutOriginal = buildAccountingJournal(
      clientOffsetSource({
        sourceAction: 'reversal',
        payload: {
          kind: 'REVERSAL',
          reversesOffsetId: null,
        },
      }),
    );

    expect(reversalWithoutOriginal.ok).toBe(false);
    if (reversalWithoutOriginal.ok) throw new Error('Expected REVERSAL source payload validation to fail.');
    expect(reversalWithoutOriginal.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INVALID_SOURCE_PAYLOAD', path: 'payload.reversesOffsetId' })]),
    );
  });

  it('business validator rule: enforces ClientOffset reversal reference shape on drafts', () => {
    const applyDraft = buildDraft();
    applyDraft.reversalOf = {
      sourceType: 'CLIENT_OFFSET',
      sourceId: 'offset-original',
      sourceAction: 'apply',
      sourceVersion: null,
      journalEntryId: null,
    };

    const applyResult = validateJournalBusiness(applyDraft);
    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) throw new Error('Expected APPLY reversal reference validation to fail.');
    expect(applyResult.errors.map((error) => error.code)).toContain('UNSUPPORTED_BUSINESS_RULE');

    const reversalDraft = buildDraft(
      clientOffsetSource({
        sourceId: 'offset-reversal-missing-ref',
        sourceAction: 'reversal',
        payload: {
          kind: 'REVERSAL',
          reversesOffsetId: 'offset-original',
        },
      }),
    );
    reversalDraft.reversalOf = null;

    const missingReferenceResult = validateJournalBusiness(reversalDraft);
    expect(missingReferenceResult.ok).toBe(false);
    if (missingReferenceResult.ok) throw new Error('Expected REVERSAL missing reference validation to fail.');
    expect(missingReferenceResult.errors.map((error) => error.code)).toContain('UNSUPPORTED_BUSINESS_RULE');

    const selfReferenceDraft = buildDraft(
      clientOffsetSource({
        sourceId: 'offset-reversal-self-ref',
        sourceAction: 'reversal',
        payload: {
          kind: 'REVERSAL',
          reversesOffsetId: 'offset-original',
        },
      }),
    );
    selfReferenceDraft.reversalOf = {
      sourceType: 'CLIENT_OFFSET',
      sourceId: selfReferenceDraft.sourceId,
      sourceAction: 'apply',
      sourceVersion: null,
      journalEntryId: null,
    };

    const selfReferenceResult = validateJournalBusiness(selfReferenceDraft);
    expect(selfReferenceResult.ok).toBe(false);
    if (selfReferenceResult.ok) throw new Error('Expected REVERSAL self-reference validation to fail.');
    expect(selfReferenceResult.errors.map((error) => error.code)).toContain('UNSUPPORTED_BUSINESS_RULE');
  });
  it('structural validator rule: rejects unbalanced, non-positive, cross-currency, precision, tenant mismatch and duplicate lineNo drafts', () => {
    expectStructuralError((draft) => {
      lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE').amount = '90.00';
    }, ['UNBALANCED_ENTRY']);

    expectStructuralError((draft) => {
      lineByAccount(draft, 'CLIENT_PAYABLE').amount = '0.00';
    }, ['INVALID_AMOUNT']);

    expectStructuralError((draft) => {
      lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE').currency = 'USD';
    }, ['CURRENCY_MISMATCH']);

    expectStructuralError((draft) => {
      lineByAccount(draft, 'CLIENT_PAYABLE').amount = '1.001';
    }, ['INVALID_AMOUNT_PRECISION']);

    expectStructuralError((draft) => {
      lineByAccount(draft, 'CLIENT_PAYABLE').tenantId = 'tenant-other';
    }, ['TENANT_MISMATCH']);

    expectStructuralError((draft) => {
      lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE').lineNo = 1;
    }, ['DUPLICATE_LINE_NO']);
  });

  it('business validator rule: rejects synthetic expense caseClientId and missing payable caseClientId for CLIENT_OFFSET', () => {
    const syntheticExpenseDraft = buildDraft();
    lineByAccount(syntheticExpenseDraft, 'CLIENT_EXPENSE_RECEIVABLE').caseClientId = 'cc-synthetic';

    const syntheticResult = validateJournalBusiness(syntheticExpenseDraft);
    expect(syntheticResult.ok).toBe(false);
    if (syntheticResult.ok) throw new Error('Expected business validation to fail.');
    expect(syntheticResult.errors.map((error) => error.code)).toContain('FORBIDDEN_SYNTHETIC_DIMENSION');

    const missingPayableDraft = buildDraft();
    lineByAccount(missingPayableDraft, 'CLIENT_PAYABLE').caseClientId = null;

    const missingPayableResult = validateJournalBusiness(missingPayableDraft);
    expect(missingPayableResult.ok).toBe(false);
    if (missingPayableResult.ok) throw new Error('Expected business validation to fail.');
    expect(missingPayableResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');
  });
});

interface CollectionDispositionLineSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<CollectionDispositionLinePostedPayload>;
}

function collectionDispositionLineSource(overrides: CollectionDispositionLineSourceOverrides = {}): CollectionDispositionLineJournalSource {
  const basePayload: CollectionDispositionLinePostedPayload = {
    lineType: 'CLIENT_PAYABLE',
    amount: '100.00',
    caseId: 'case-1',
    caseClientId: 'case-client-1',
    clientId: 'client-1',
    collectionId: 'collection-1',
    dispositionLineId: overrides.sourceId ?? 'line-1',
    creditAccountCode: 'CLIENT_PAYABLE',
    manualReversalRequiredAt: null,
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'COLLECTION_DISPOSITION_LINE',
    sourceId: overrides.sourceId ?? 'line-1',
    sourceVersion: overrides.sourceVersion ?? '2026-06-30T08:00:00.000Z:line-1',
    sourceAction: 'posted',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? null,
    metadata: overrides.metadata ?? { sourceName: 'collection-disposition-line-test' },
    payload: {
      ...basePayload,
      ...overrides.payload,
      dispositionLineId: overrides.payload?.dispositionLineId ?? overrides.sourceId ?? basePayload.dispositionLineId,
    },
  };
}

function buildDispositionDraft(source: CollectionDispositionLineJournalSource = collectionDispositionLineSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

describe('AccountingJournalBuilder CollectionDispositionLine posting contract', () => {
  it('builds canonical live idempotency key with sourceVersion = postedAt ISO + line id', () => {
    const source = collectionDispositionLineSource({
      tenantId: 'tenant-live',
      sourceId: 'line-live',
      sourceVersion: '2026-06-30T09:10:11.000Z:line-live',
    });

    const draft = buildDispositionDraft(source);

    expect(draft.idempotencyKey).toBe(
      'acct-journal:v1:tenant-live:COLLECTION_DISPOSITION_LINE:line-live:posted:2026-06-30T09:10:11.000Z:line-live',
    );
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it.each([
    ['CLIENT_PAYABLE', 'CLIENT_PAYABLE'],
    ['CLIENT_EXPENSE_REIMBURSEMENT', 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE'],
    ['CONTRACTUAL_FEE_WITHHELD', 'ATTORNEY_FEE_REVENUE'],
    ['FIRM_EXPENSE_REIMBURSEMENT', 'FIRM_EXPENSE_REIMBURSEMENT'],
    ['OFFSET_CLIENT_ADVANCE', 'CLIENT_ADVANCE_BALANCE'],
  ] as const)('maps %s to CASH_CLEARING debit and %s credit', (lineType, creditAccountCode) => {
    const source = collectionDispositionLineSource({
      payload: {
        lineType,
        creditAccountCode,
        caseClientId: lineType === 'CLIENT_PAYABLE' || lineType === 'CLIENT_EXPENSE_REIMBURSEMENT' ? 'cc-1' : null,
      },
    });

    const draft = buildDispositionDraft(source);
    const cash = lineByAccount(draft, 'CASH_CLEARING');
    const credit = lineByAccount(draft, creditAccountCode);

    expect(draft.entryType).toBe('COLLECTION_DISTRIBUTION_POSTED');
    expect(cash).toEqual(expect.objectContaining({ direction: 'DEBIT', collectionId: 'collection-1', dispositionLineId: 'line-1' }));
    expect(credit).toEqual(expect.objectContaining({ direction: 'CREDIT', collectionId: 'collection-1', dispositionLineId: 'line-1' }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('rejects OTHER and manual reversal marker before live journal posting', () => {
    const other = buildAccountingJournal(collectionDispositionLineSource({
      payload: { lineType: 'OTHER', creditAccountCode: 'CLIENT_PAYABLE' },
    }));
    expect(other.ok).toBe(false);
    if (other.ok) throw new Error('Expected OTHER to be rejected.');
    expect(other.errors.map((error) => error.code)).toContain('UNMAPPED_SOURCE');

    const manual = buildAccountingJournal(collectionDispositionLineSource({
      payload: { manualReversalRequiredAt: '2026-06-30T10:00:00.000Z' },
    }));
    expect(manual.ok).toBe(false);
    if (manual.ok) throw new Error('Expected manual reversal marker to be rejected.');
    expect(manual.errors.map((error) => error.code)).toContain('INVALID_SOURCE_PAYLOAD');
  });

  it('business validator blocks missing caseClientId for client-attributed disposition buckets', () => {
    const draft = buildDispositionDraft(collectionDispositionLineSource({ payload: { caseClientId: null } }));

    const result = validateJournalBusiness(draft);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected missing caseClientId to fail.');
    expect(result.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');
  });

  it('business validator blocks case and dispositionLine dimension mismatches', () => {
    const caseMismatch = buildDispositionDraft();
    lineByAccount(caseMismatch, 'CASH_CLEARING').caseId = 'case-other';
    const caseResult = validateJournalBusiness(caseMismatch);
    expect(caseResult.ok).toBe(false);
    if (caseResult.ok) throw new Error('Expected case mismatch to fail.');
    expect(caseResult.errors.map((error) => error.code)).toContain('UNSUPPORTED_BUSINESS_RULE');

    const sourceMismatch = buildDispositionDraft();
    lineByAccount(sourceMismatch, 'CLIENT_PAYABLE').dispositionLineId = 'line-other';
    const sourceResult = validateJournalBusiness(sourceMismatch);
    expect(sourceResult.ok).toBe(false);
    if (sourceResult.ok) throw new Error('Expected source dimension mismatch to fail.');
    expect(sourceResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');
  });
});

interface ClientPayoutSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  sourceAction?: ClientPayoutJournalSource['sourceAction'];
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<ClientPayoutRecordedPayload>;
}

function clientPayoutSource(overrides: ClientPayoutSourceOverrides = {}): ClientPayoutJournalSource {
  const payoutId = overrides.sourceId ?? 'payout-1';
  const payload: ClientPayoutRecordedPayload = {
    amount: '400.00',
    caseId: 'case-1',
    caseClientId: 'case-client-1',
    clientId: 'client-1',
    payoutId,
    ...(overrides.payload ?? {}),
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'CLIENT_PAYOUT',
    sourceId: payoutId,
    sourceVersion: overrides.sourceVersion ?? `2026-06-30T08:00:00.000Z:${payoutId}`,
    sourceAction: overrides.sourceAction ?? 'recorded',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? null,
    metadata: overrides.metadata ?? { sourceName: 'client-payout-test' },
    payload,
  };
}

function buildPayoutDraft(source: ClientPayoutJournalSource = clientPayoutSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

describe('AccountingJournalBuilder ClientPayout recorded contract', () => {
  it('maps RECORDED payout to CLIENT_PAYABLE debit and CASH_CLEARING credit', () => {
    const draft = buildPayoutDraft(clientPayoutSource({
      tenantId: 'tenant-pay',
      sourceId: 'payout-live',
      sourceVersion: '2026-06-30T09:10:11.000Z:payout-live',
    }));

    const payable = lineByAccount(draft, 'CLIENT_PAYABLE');
    const cash = lineByAccount(draft, 'CASH_CLEARING');

    expect(draft.entryType).toBe('CLIENT_PAYOUT_RECORDED');
    expect(draft.idempotencyKey).toBe('acct-journal:v1:tenant-pay:CLIENT_PAYOUT:payout-live:recorded:2026-06-30T09:10:11.000Z:payout-live');
    expect(payable).toEqual(expect.objectContaining({ direction: 'DEBIT', amount: '400.00', payoutId: 'payout-live', caseClientId: 'case-client-1' }));
    expect(cash).toEqual(expect.objectContaining({ direction: 'CREDIT', amount: '400.00', payoutId: 'payout-live', caseClientId: 'case-client-1' }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('rejects unsupported payout source actions before live journal posting', () => {
    const result = buildAccountingJournal(clientPayoutSource({ sourceAction: 'posted' as any }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ClientPayout invalid action to be rejected.');
    expect(result.errors.map((error) => error.code)).toContain('UNSUPPORTED_SOURCE_ACTION');
  });

  it('business validator requires caseClientId and payoutId dimensions', () => {
    const missingClient = buildPayoutDraft();
    lineByAccount(missingClient, 'CLIENT_PAYABLE').caseClientId = null;
    const missingClientResult = validateJournalBusiness(missingClient);
    expect(missingClientResult.ok).toBe(false);
    if (missingClientResult.ok) throw new Error('Expected missing caseClientId to fail.');
    expect(missingClientResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');

    const missingPayout = buildPayoutDraft();
    lineByAccount(missingPayout, 'CASH_CLEARING').payoutId = null;
    const missingPayoutResult = validateJournalBusiness(missingPayout);
    expect(missingPayoutResult.ok).toBe(false);
    if (missingPayoutResult.ok) throw new Error('Expected missing payoutId to fail.');
    expect(missingPayoutResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');
  });

  it('business validator blocks unrelated source dimensions on payout lines', () => {
    const draft = buildPayoutDraft();
    lineByAccount(draft, 'CLIENT_PAYABLE').dispositionLineId = 'line-foreign';

    const result = validateJournalBusiness(draft);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unrelated dimension to fail.');
    expect(result.errors.map((error) => error.code)).toContain('FORBIDDEN_SYNTHETIC_DIMENSION');
  });
});

interface BalanceLedgerSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  sourceAction?: BalanceLedgerJournalSource['sourceAction'];
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<BalanceLedgerRecordedPayload>;
}

function balanceLedgerSource(overrides: BalanceLedgerSourceOverrides = {}): BalanceLedgerJournalSource {
  const ledgerId = overrides.sourceId ?? 'balance-ledger-1';
  const payload: BalanceLedgerRecordedPayload = {
    amount: '250.00',
    caseId: 'case-advance-1',
    balanceLedgerId: ledgerId,
    ledgerType: 'CREDIT',
    source: 'expense_request:expense-1',
    sourceId: 'expense-1',
    isIncrease: true,
    ...(overrides.payload ?? {}),
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'BALANCE_LEDGER',
    sourceId: ledgerId,
    sourceVersion: overrides.sourceVersion ?? `2026-06-30T08:00:00.000Z:${ledgerId}`,
    sourceAction: overrides.sourceAction ?? 'posted',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? null,
    metadata: overrides.metadata ?? { sourceName: 'balance-ledger-test' },
    payload,
  };
}

function buildBalanceLedgerDraft(source: BalanceLedgerJournalSource = balanceLedgerSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

describe('AccountingJournalBuilder BalanceLedger recorded contract', () => {
  it('maps direct CREDIT BalanceLedger to CASH_CLEARING debit and CLIENT_ADVANCE_BALANCE credit', () => {
    const draft = buildBalanceLedgerDraft(balanceLedgerSource({
      tenantId: 'tenant-bl',
      sourceId: 'bl-credit',
      sourceVersion: '2026-06-30T09:10:11.000Z:bl-credit',
      payload: { balanceLedgerId: 'bl-credit', ledgerType: 'CREDIT', isIncrease: true, amount: '100.00' },
    }));

    const cash = lineByAccount(draft, 'CASH_CLEARING');
    const advance = lineByAccount(draft, 'CLIENT_ADVANCE_BALANCE');

    expect(draft.entryType).toBe('CLIENT_ADVANCE_LEDGER_RECORDED');
    expect(draft.idempotencyKey).toBe('acct-journal:v1:tenant-bl:BALANCE_LEDGER:bl-credit:posted:2026-06-30T09:10:11.000Z:bl-credit');
    expect(cash).toEqual(expect.objectContaining({ direction: 'DEBIT', amount: '100.00', caseId: 'case-advance-1', balanceLedgerId: 'bl-credit' }));
    expect(advance).toEqual(expect.objectContaining({ direction: 'CREDIT', amount: '100.00', caseId: 'case-advance-1', balanceLedgerId: 'bl-credit' }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('maps direct DEBIT BalanceLedger to CLIENT_ADVANCE_BALANCE debit and CASH_CLEARING credit', () => {
    const draft = buildBalanceLedgerDraft(balanceLedgerSource({
      sourceId: 'bl-debit',
      payload: {
        amount: '75.25',
        balanceLedgerId: 'bl-debit',
        ledgerType: 'DEBIT',
        source: 'operation:haciz',
        sourceId: 'op-1',
        isIncrease: false,
      },
    }));

    const cash = lineByAccount(draft, 'CASH_CLEARING');
    const advance = lineByAccount(draft, 'CLIENT_ADVANCE_BALANCE');

    expect(advance).toEqual(expect.objectContaining({ direction: 'DEBIT', amount: '75.25', balanceLedgerId: 'bl-debit' }));
    expect(cash).toEqual(expect.objectContaining({ direction: 'CREDIT', amount: '75.25', balanceLedgerId: 'bl-debit' }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('rejects ADJUST/REFUND and correlated disposition_line BalanceLedger sources', () => {
    const adjust = buildAccountingJournal(balanceLedgerSource({ payload: { ledgerType: 'ADJUST', isIncrease: true } }));
    expect(adjust.ok).toBe(false);
    if (adjust.ok) throw new Error('Expected ADJUST BalanceLedger to be rejected.');
    expect(adjust.errors.map((error) => error.code)).toContain('UNMAPPED_SOURCE');

    const refund = buildAccountingJournal(balanceLedgerSource({ payload: { ledgerType: 'REFUND', isIncrease: false } }));
    expect(refund.ok).toBe(false);
    if (refund.ok) throw new Error('Expected REFUND BalanceLedger to be rejected.');
    expect(refund.errors.map((error) => error.code)).toContain('UNMAPPED_SOURCE');

    const correlated = buildAccountingJournal(balanceLedgerSource({ payload: { source: 'disposition_line:line-1', sourceId: 'line-1' } }));
    expect(correlated.ok).toBe(false);
    if (correlated.ok) throw new Error('Expected correlated BalanceLedger to be rejected.');
    expect(correlated.errors.map((error) => error.code)).toContain('UNMAPPED_SOURCE');
  });

  it('business validator requires balanceLedgerId dimension and rejects unrelated dimensions', () => {
    const missingLedger = buildBalanceLedgerDraft();
    lineByAccount(missingLedger, 'CASH_CLEARING').balanceLedgerId = null;
    const missingResult = validateJournalBusiness(missingLedger);
    expect(missingResult.ok).toBe(false);
    if (missingResult.ok) throw new Error('Expected missing balanceLedgerId to fail.');
    expect(missingResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');

    const syntheticDimension = buildBalanceLedgerDraft();
    lineByAccount(syntheticDimension, 'CLIENT_ADVANCE_BALANCE').caseClientId = 'case-client-synthetic';
    const syntheticResult = validateJournalBusiness(syntheticDimension);
    expect(syntheticResult.ok).toBe(false);
    if (syntheticResult.ok) throw new Error('Expected synthetic dimension to fail.');
    expect(syntheticResult.errors.map((error) => error.code)).toContain('FORBIDDEN_SYNTHETIC_DIMENSION');
  });
});
interface ExpenseRequestSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  sourceAction?: ExpenseRequestJournalSource['sourceAction'];
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<ExpenseRequestJournalSourcePayload>;
}

function expenseRequestSource(overrides: ExpenseRequestSourceOverrides = {}): ExpenseRequestJournalSource {
  const expenseRequestId = overrides.sourceId ?? 'expense-request-1';
  const payload: ExpenseRequestJournalSourcePayload = {
    kind: 'RECORDED',
    amount: '175.25',
    caseId: 'case-expense-request-1',
    clientId: 'client-1',
    expenseRequestId,
    cancelGuard: null,
    ...(overrides.payload ?? {}),
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'EXPENSE_REQUEST',
    sourceId: expenseRequestId,
    sourceVersion: overrides.sourceVersion ?? `2026-07-01T10:00:00.000Z:${expenseRequestId}:${payload.kind}`,
    sourceAction: overrides.sourceAction ?? (payload.kind === 'CANCEL' ? 'cancel' : 'recorded'),
    occurredAt: overrides.occurredAt ?? '2026-07-01T10:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-07-01',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'expense-request-hash-1',
    metadata: overrides.metadata ?? { sourceName: 'expense-request-test' },
    payload,
  };
}

function buildExpenseRequestDraft(source: ExpenseRequestJournalSource = expenseRequestSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

describe('AccountingJournalBuilder ExpenseRequest source skeleton', () => {
  it('maps recorded expense request to receivable debit and reimbursement credit with expenseRequestId', () => {
    const draft = buildExpenseRequestDraft(expenseRequestSource({
      tenantId: 'tenant-expense',
      sourceId: 'expense-request-recorded',
      payload: { amount: '275.75', caseId: 'case-expense-recorded', clientId: 'client-expense-recorded' },
    }));

    const receivable = lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE');
    const reimbursement = lineByAccount(draft, 'FIRM_EXPENSE_REIMBURSEMENT');

    expect(draft.entryType).toBe('EXPENSE_REQUEST_RECORDED');
    expect(draft.sourceAction).toBe('recorded');
    expect(draft.idempotencyKey).toBe(
      'acct-journal:v1:tenant-expense:EXPENSE_REQUEST:expense-request-recorded:recorded:2026-07-01T10:00:00.000Z:expense-request-recorded:RECORDED',
    );
    expect(receivable).toEqual(expect.objectContaining({
      direction: 'DEBIT',
      amount: '275.75',
      caseId: 'case-expense-recorded',
      clientId: 'client-expense-recorded',
      caseClientId: null,
      expenseRequestId: 'expense-request-recorded',
    }));
    expect(reimbursement).toEqual(expect.objectContaining({
      direction: 'CREDIT',
      amount: '275.75',
      caseId: 'case-expense-recorded',
      clientId: 'client-expense-recorded',
      caseClientId: null,
      expenseRequestId: 'expense-request-recorded',
    }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('maps guarded cancel skeleton to inverse lines and recorded reversal reference', () => {
    const draft = buildExpenseRequestDraft(expenseRequestSource({
      sourceId: 'expense-request-cancel',
      payload: {
        kind: 'CANCEL',
        amount: '90.00',
        cancelGuard: {
          hasExpensePayments: false,
          hasClientOffsets: false,
          hasReimbursementApplications: false,
        },
      },
    }));

    const receivable = lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE');
    const reimbursement = lineByAccount(draft, 'FIRM_EXPENSE_REIMBURSEMENT');

    expect(draft.entryType).toBe('EXPENSE_REQUEST_CANCELLED');
    expect(draft.sourceAction).toBe('cancel');
    expect(draft.reversalOf).toEqual(expect.objectContaining({
      sourceType: 'EXPENSE_REQUEST',
      sourceId: 'expense-request-cancel',
      sourceAction: 'recorded',
    }));
    expect(reimbursement).toEqual(expect.objectContaining({ direction: 'DEBIT', amount: '90.00', expenseRequestId: 'expense-request-cancel' }));
    expect(receivable).toEqual(expect.objectContaining({ direction: 'CREDIT', amount: '90.00', expenseRequestId: 'expense-request-cancel' }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('keeps cancel guarded when settled activity exists', () => {
    const result = buildAccountingJournal(expenseRequestSource({
      sourceId: 'expense-request-cancel-blocked',
      payload: {
        kind: 'CANCEL',
        cancelGuard: {
          hasExpensePayments: true,
          hasClientOffsets: false,
          hasReimbursementApplications: false,
        },
      },
    }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected guarded ExpenseRequest cancel to be unmapped.');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNMAPPED_SOURCE', path: 'payload.cancelGuard' }),
    ]));
  });

  it('business validator requires expenseRequestId and blocks unrelated dimensions', () => {
    const missingExpenseRequest = buildExpenseRequestDraft();
    lineByAccount(missingExpenseRequest, 'CLIENT_EXPENSE_RECEIVABLE').expenseRequestId = null;
    const missingResult = validateJournalBusiness(missingExpenseRequest);
    expect(missingResult.ok).toBe(false);
    if (missingResult.ok) throw new Error('Expected missing expenseRequestId to fail.');
    expect(missingResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');

    const syntheticDimension = buildExpenseRequestDraft();
    lineByAccount(syntheticDimension, 'FIRM_EXPENSE_REIMBURSEMENT').payoutId = 'payout-foreign';
    const syntheticResult = validateJournalBusiness(syntheticDimension);
    expect(syntheticResult.ok).toBe(false);
    if (syntheticResult.ok) throw new Error('Expected synthetic dimension to fail.');
    expect(syntheticResult.errors.map((error) => error.code)).toContain('FORBIDDEN_SYNTHETIC_DIMENSION');
  });
});
interface ExpensePaymentSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  sourceAction?: ExpensePaymentJournalSource['sourceAction'];
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<ExpensePaymentRecordedPayload>;
}

function expensePaymentSource(overrides: ExpensePaymentSourceOverrides = {}): ExpensePaymentJournalSource {
  const expensePaymentId = overrides.sourceId ?? 'expense-payment-1';
  const payload: ExpensePaymentRecordedPayload = {
    amount: '125.00',
    caseId: 'case-expense-payment-1',
    clientId: 'client-1',
    expenseRequestId: 'expense-request-1',
    expensePaymentId,
    paymentMethod: 'BANK_TRANSFER',
    reference: 'DEKONT-1',
    ...(overrides.payload ?? {}),
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'EXPENSE_PAYMENT',
    sourceId: expensePaymentId,
    sourceVersion: overrides.sourceVersion ?? `2026-07-01T11:00:00.000Z:${expensePaymentId}:RECORDED`,
    sourceAction: overrides.sourceAction ?? 'recorded',
    occurredAt: overrides.occurredAt ?? '2026-07-01T11:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-07-01',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'expense-payment-hash-1',
    metadata: overrides.metadata ?? { sourceName: 'expense-payment-test' },
    payload,
  };
}

function buildExpensePaymentDraft(source: ExpensePaymentJournalSource = expensePaymentSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

describe('AccountingJournalBuilder ExpensePayment source skeleton', () => {
  it('maps recorded payment to cash debit and expense receivable credit with request/payment dimensions', () => {
    const draft = buildExpensePaymentDraft(expensePaymentSource({
      tenantId: 'tenant-payment',
      sourceId: 'expense-payment-recorded',
      payload: {
        amount: '325.40',
        caseId: 'case-expense-payment-recorded',
        clientId: 'client-expense-payment',
        expenseRequestId: 'expense-request-recorded',
        paymentMethod: 'CASH',
        reference: 'MAKBUZ-42',
      },
    }));

    const cash = lineByAccount(draft, 'CASH_CLEARING');
    const receivable = lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE');

    expect(draft.entryType).toBe('EXPENSE_PAYMENT_RECORDED');
    expect(draft.sourceAction).toBe('recorded');
    expect(draft.idempotencyKey).toBe(
      'acct-journal:v1:tenant-payment:EXPENSE_PAYMENT:expense-payment-recorded:recorded:2026-07-01T11:00:00.000Z:expense-payment-recorded:RECORDED',
    );
    expect(draft.metadata).toEqual(expect.objectContaining({
      expenseRequestId: 'expense-request-recorded',
      expensePaymentId: 'expense-payment-recorded',
      paymentMethod: 'CASH',
      reference: 'MAKBUZ-42',
    }));
    expect(cash).toEqual(expect.objectContaining({
      direction: 'DEBIT',
      amount: '325.40',
      caseId: 'case-expense-payment-recorded',
      clientId: 'client-expense-payment',
      caseClientId: null,
      expenseRequestId: 'expense-request-recorded',
      expensePaymentId: 'expense-payment-recorded',
    }));
    expect(receivable).toEqual(expect.objectContaining({
      direction: 'CREDIT',
      amount: '325.40',
      caseId: 'case-expense-payment-recorded',
      clientId: 'client-expense-payment',
      caseClientId: null,
      expenseRequestId: 'expense-request-recorded',
      expensePaymentId: 'expense-payment-recorded',
    }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('keeps reversal/refund outside the ExpensePayment recorded skeleton', () => {
    const result = buildAccountingJournal(expensePaymentSource({ sourceAction: 'reversal' as any }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ExpensePayment reversal action to be rejected.');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNSUPPORTED_SOURCE_ACTION', path: 'sourceAction' }),
    ]));
  });

  it('business validator requires expenseRequestId and expensePaymentId and blocks unrelated dimensions', () => {
    const missingRequest = buildExpensePaymentDraft();
    lineByAccount(missingRequest, 'CLIENT_EXPENSE_RECEIVABLE').expenseRequestId = null;
    const missingRequestResult = validateJournalBusiness(missingRequest);
    expect(missingRequestResult.ok).toBe(false);
    if (missingRequestResult.ok) throw new Error('Expected missing expenseRequestId to fail.');
    expect(missingRequestResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');

    const missingPayment = buildExpensePaymentDraft();
    lineByAccount(missingPayment, 'CASH_CLEARING').expensePaymentId = null;
    const missingPaymentResult = validateJournalBusiness(missingPayment);
    expect(missingPaymentResult.ok).toBe(false);
    if (missingPaymentResult.ok) throw new Error('Expected missing expensePaymentId to fail.');
    expect(missingPaymentResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');

    const syntheticDimension = buildExpensePaymentDraft();
    lineByAccount(syntheticDimension, 'CLIENT_EXPENSE_RECEIVABLE').caseClientId = 'case-client-foreign';
    const syntheticResult = validateJournalBusiness(syntheticDimension);
    expect(syntheticResult.ok).toBe(false);
    if (syntheticResult.ok) throw new Error('Expected synthetic dimension to fail.');
    expect(syntheticResult.errors.map((error) => error.code)).toContain('FORBIDDEN_SYNTHETIC_DIMENSION');
  });
});
interface ExpenseApplicationSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  sourceAction?: CollectionDispositionExpenseApplicationJournalSource['sourceAction'];
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<CollectionDispositionExpenseApplicationPayload>;
}

function expenseApplicationSource(overrides: ExpenseApplicationSourceOverrides = {}): CollectionDispositionExpenseApplicationJournalSource {
  const expenseApplicationId = overrides.sourceId ?? 'expense-application-1';
  const payload: CollectionDispositionExpenseApplicationPayload = {
    kind: 'APPLY',
    amount: '80.00',
    caseId: 'case-expense-application-1',
    clientId: 'client-1',
    expenseRequestId: 'expense-request-1',
    expenseApplicationId,
    collectionId: 'collection-1',
    collectionDispositionId: 'disposition-1',
    collectionDispositionLineId: 'disposition-line-1',
    reimbursementScope: 'CLIENT_FRONTED',
    reversesApplicationId: null,
    ...(overrides.payload ?? {}),
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
    sourceId: expenseApplicationId,
    sourceVersion: overrides.sourceVersion ?? `2026-07-01T12:00:00.000Z:${expenseApplicationId}:${payload.kind}`,
    sourceAction: overrides.sourceAction ?? (payload.kind === 'REVERSAL' ? 'reversal' : 'apply'),
    occurredAt: overrides.occurredAt ?? '2026-07-01T12:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-07-01',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'expense-application-hash-1',
    metadata: overrides.metadata ?? { sourceName: 'expense-application-test' },
    payload,
  };
}

function buildExpenseApplicationDraft(
  source: CollectionDispositionExpenseApplicationJournalSource = expenseApplicationSource(),
): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

describe('AccountingJournalBuilder expense application source skeleton', () => {
  it('maps APPLY to reimbursement debit and expense receivable credit with request/application dimensions', () => {
    const draft = buildExpenseApplicationDraft(expenseApplicationSource({
      tenantId: 'tenant-expense-application',
      sourceId: 'expense-application-apply',
      payload: {
        amount: '150.75',
        caseId: 'case-expense-application-apply',
        clientId: 'client-expense-application',
        expenseRequestId: 'expense-request-apply',
        collectionId: 'collection-apply',
        collectionDispositionId: 'disposition-apply',
        collectionDispositionLineId: 'disposition-line-apply',
        reimbursementScope: 'CLIENT_FRONTED',
      },
    }));

    const reimbursement = lineByAccount(draft, 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE');
    const receivable = lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE');

    expect(draft.entryType).toBe('COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED');
    expect(draft.sourceAction).toBe('apply');
    expect(draft.reversalOf).toBeNull();
    expect(draft.idempotencyKey).toBe(
      'acct-journal:v1:tenant-expense-application:COLLECTION_DISPOSITION_EXPENSE_APPLICATION:expense-application-apply:apply:2026-07-01T12:00:00.000Z:expense-application-apply:APPLY',
    );
    expect(draft.metadata).toEqual(expect.objectContaining({
      expenseRequestId: 'expense-request-apply',
      expenseApplicationId: 'expense-application-apply',
      collectionDispositionId: 'disposition-apply',
      collectionDispositionLineId: 'disposition-line-apply',
      reimbursementScope: 'CLIENT_FRONTED',
      reversesApplicationId: null,
    }));
    expect(reimbursement).toEqual(expect.objectContaining({
      direction: 'DEBIT',
      amount: '150.75',
      caseId: 'case-expense-application-apply',
      clientId: 'client-expense-application',
      caseClientId: null,
      collectionId: 'collection-apply',
      dispositionLineId: 'disposition-line-apply',
      expenseRequestId: 'expense-request-apply',
      expenseApplicationId: 'expense-application-apply',
    }));
    expect(receivable).toEqual(expect.objectContaining({
      direction: 'CREDIT',
      amount: '150.75',
      expenseRequestId: 'expense-request-apply',
      expenseApplicationId: 'expense-application-apply',
    }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('maps REVERSAL to inverse lines and original APPLY reversal reference', () => {
    const draft = buildExpenseApplicationDraft(expenseApplicationSource({
      sourceId: 'expense-application-reversal',
      payload: {
        kind: 'REVERSAL',
        amount: '45.50',
        reimbursementScope: 'FIRM_FRONTED',
        reversesApplicationId: 'expense-application-apply-original',
      },
    }));

    const receivable = lineByAccount(draft, 'CLIENT_EXPENSE_RECEIVABLE');
    const reimbursement = lineByAccount(draft, 'FIRM_EXPENSE_REIMBURSEMENT');

    expect(draft.entryType).toBe('COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED');
    expect(draft.sourceAction).toBe('reversal');
    expect(draft.reversalOf).toEqual(expect.objectContaining({
      sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
      sourceId: 'expense-application-apply-original',
      sourceAction: 'apply',
    }));
    expect(receivable).toEqual(expect.objectContaining({ direction: 'DEBIT', amount: '45.50', expenseApplicationId: 'expense-application-reversal' }));
    expect(reimbursement).toEqual(expect.objectContaining({ direction: 'CREDIT', amount: '45.50', expenseApplicationId: 'expense-application-reversal' }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('enforces expense application apply/reversal source invariants', () => {
    const applyWithOriginal = buildAccountingJournal(expenseApplicationSource({
      payload: { reversesApplicationId: 'expense-application-original' },
    }));
    expect(applyWithOriginal.ok).toBe(false);
    if (applyWithOriginal.ok) throw new Error('Expected APPLY with reversesApplicationId to fail.');
    expect(applyWithOriginal.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_SOURCE_PAYLOAD', path: 'payload.reversesApplicationId' }),
    ]));

    const reversalWithoutOriginal = buildAccountingJournal(expenseApplicationSource({
      payload: { kind: 'REVERSAL', reversesApplicationId: null },
    }));
    expect(reversalWithoutOriginal.ok).toBe(false);
    if (reversalWithoutOriginal.ok) throw new Error('Expected REVERSAL without original to fail.');
    expect(reversalWithoutOriginal.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_SOURCE_PAYLOAD', path: 'payload.reversesApplicationId' }),
    ]));

    const actionMismatch = buildAccountingJournal(expenseApplicationSource({
      sourceAction: 'apply',
      payload: { kind: 'REVERSAL', reversesApplicationId: 'expense-application-original' },
    }));
    expect(actionMismatch.ok).toBe(false);
    if (actionMismatch.ok) throw new Error('Expected action/kind mismatch to fail.');
    expect(actionMismatch.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNSUPPORTED_SOURCE_ACTION', path: 'sourceAction' }),
    ]));
  });

  it('business validator requires request/application dimensions and blocks unrelated dimensions', () => {
    const missingRequest = buildExpenseApplicationDraft();
    lineByAccount(missingRequest, 'CLIENT_EXPENSE_RECEIVABLE').expenseRequestId = null;
    const missingRequestResult = validateJournalBusiness(missingRequest);
    expect(missingRequestResult.ok).toBe(false);
    if (missingRequestResult.ok) throw new Error('Expected missing expenseRequestId to fail.');
    expect(missingRequestResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');

    const missingApplication = buildExpenseApplicationDraft();
    lineByAccount(missingApplication, 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE').expenseApplicationId = null;
    const missingApplicationResult = validateJournalBusiness(missingApplication);
    expect(missingApplicationResult.ok).toBe(false);
    if (missingApplicationResult.ok) throw new Error('Expected missing expenseApplicationId to fail.');
    expect(missingApplicationResult.errors.map((error) => error.code)).toContain('MISSING_REQUIRED_DIMENSION');

    const syntheticDimension = buildExpenseApplicationDraft();
    lineByAccount(syntheticDimension, 'CLIENT_EXPENSE_RECEIVABLE').expensePaymentId = 'expense-payment-foreign';
    const syntheticResult = validateJournalBusiness(syntheticDimension);
    expect(syntheticResult.ok).toBe(false);
    if (syntheticResult.ok) throw new Error('Expected synthetic dimension to fail.');
    expect(syntheticResult.errors.map((error) => error.code)).toContain('FORBIDDEN_SYNTHETIC_DIMENSION');

    const reversalMissingRef = buildExpenseApplicationDraft(expenseApplicationSource({
      payload: { kind: 'REVERSAL', reversesApplicationId: 'expense-application-original' },
    }));
    reversalMissingRef.reversalOf = null;
    const reversalMissingRefResult = validateJournalBusiness(reversalMissingRef);
    expect(reversalMissingRefResult.ok).toBe(false);
    if (reversalMissingRefResult.ok) throw new Error('Expected missing reversal reference to fail.');
    expect(reversalMissingRefResult.errors.map((error) => error.code)).toContain('UNSUPPORTED_BUSINESS_RULE');
  });
});

describe('AccountingJournalEntry generic reversal contract', () => {
  it('maps ACCOUNTING_JOURNAL_ENTRY reversal to inverse lines and deterministic idempotency', () => {
    const source = accountingJournalReversalSource();
    const draft = buildAccountingJournalReversalDraft(source);

    expect(draft.entryType).toBe('ACCOUNTING_JOURNAL_REVERSAL');
    expect(draft.sourceType).toBe('ACCOUNTING_JOURNAL_ENTRY');
    expect(draft.sourceId).toBe('journal-original-1');
    expect(draft.idempotencyKey).toBe(buildJournalIdempotencyKey(journalIdempotencyMaterialFromSource(source)));
    expect(draft.reversalOf).toEqual(expect.objectContaining({
      sourceType: 'CLIENT_PAYOUT',
      sourceId: 'payout-1',
      sourceAction: 'recorded',
      journalEntryId: 'journal-original-1',
    }));

    expect(lineByAccount(draft, 'CLIENT_PAYABLE')).toEqual(expect.objectContaining({
      direction: 'CREDIT',
      amount: '125.50',
      caseId: 'case-payable',
      clientId: 'client-1',
      caseClientId: 'case-client-payable',
      collectionId: 'collection-1',
      dispositionLineId: 'disposition-line-1',
    }));
    expect(lineByAccount(draft, 'CASH_CLEARING')).toEqual(expect.objectContaining({
      direction: 'DEBIT',
      amount: '125.50',
      payoutId: 'payout-1',
    }));
    expect(validateJournalDraft(draft).ok).toBe(true);
  });

  it('rejects mismatched original id, reversal-of-reversal, and manual adjustment mapping', () => {
    const sourceMismatch = buildAccountingJournal(accountingJournalReversalSource({
      sourceId: 'journal-original-1',
      payload: { originalJournalEntryId: 'journal-other' },
    }));
    expect(sourceMismatch.ok).toBe(false);
    if (sourceMismatch.ok) throw new Error('Expected source/original mismatch to fail.');
    expect(sourceMismatch.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_SOURCE_PAYLOAD', path: 'payload.originalJournalEntryId' }),
    ]));

    const reversalOfReversal = buildAccountingJournal(accountingJournalReversalSource({
      payload: { originalEntryType: 'ACCOUNTING_JOURNAL_REVERSAL' },
    }));
    expect(reversalOfReversal.ok).toBe(false);
    if (reversalOfReversal.ok) throw new Error('Expected reversal-of-reversal to fail.');
    expect(reversalOfReversal.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_SOURCE_PAYLOAD', path: 'payload.originalEntryType' }),
    ]));

    const manualAdjustment: ManualAdjustmentJournalSource = {
      ...accountingJournalReversalSource(),
      sourceAction: 'manual-adjustment',
      payload: { amount: '10.00', reason: 'manual correction', lines: [] },
    };
    const manualResult = buildAccountingJournal(manualAdjustment);
    expect(manualResult.ok).toBe(false);
    if (manualResult.ok) throw new Error('Expected manual adjustment to remain unmapped.');
    expect(manualResult.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNMAPPED_SOURCE', path: 'sourceAction' }),
    ]));
  });

  it('business validator requires original journal reference for generic reversal drafts', () => {
    const missingReference = buildAccountingJournalReversalDraft();
    missingReference.reversalOf = null;
    const missingReferenceResult = validateJournalBusiness(missingReference);
    expect(missingReferenceResult.ok).toBe(false);
    if (missingReferenceResult.ok) throw new Error('Expected missing generic reversal reference to fail.');
    expect(missingReferenceResult.errors.map((error) => error.code)).toContain('UNSUPPORTED_BUSINESS_RULE');

    const wrongEntryType = buildAccountingJournalReversalDraft();
    wrongEntryType.entryType = 'CLIENT_PAYOUT_RECORDED';
    const wrongEntryTypeResult = validateJournalBusiness(wrongEntryType);
    expect(wrongEntryTypeResult.ok).toBe(false);
    if (wrongEntryTypeResult.ok) throw new Error('Expected wrong generic reversal entryType to fail.');
    expect(wrongEntryTypeResult.errors.map((error) => error.code)).toContain('INVALID_SOURCE_ACTION');
  });
});
