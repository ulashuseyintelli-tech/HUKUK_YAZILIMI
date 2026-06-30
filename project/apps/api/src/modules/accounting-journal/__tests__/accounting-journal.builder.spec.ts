import {
  buildAccountingJournal,
  buildJournalIdempotencyKey,
  journalIdempotencyMaterialFromSource,
} from '../accounting-journal.builder';
import type {
  AccountingAccountCode,
  ClientOffsetJournalSource,
  ClientOffsetJournalSourcePayload,
  ClientPayoutJournalSource,
  ClientPayoutRecordedPayload,
  CollectionDispositionLineJournalSource,
  CollectionDispositionLinePostedPayload,
  JournalEntryDraft,
  JournalMetadata,
  JournalValidationErrorCode,
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
