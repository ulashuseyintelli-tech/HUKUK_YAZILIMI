import type {
  AccountingJournalEntrySource,
  AccountingJournalReversalLinePayload,
  AccountingJournalReversalSource,
  ManualAdjustmentJournalLinePayload,
  ManualAdjustmentJournalSource,
  BalanceLedgerJournalSource,
  ClientPayoutJournalSource,
  ClientOffsetJournalSource,
  CollectionDispositionExpenseApplicationJournalSource,
  CollectionDispositionLineJournalSource,
  ExpensePaymentJournalSource,
  ExpenseRequestJournalSource,
  JournalBuildError,
  JournalBuildResult,
  JournalEntryDraft,
  JournalIdempotencyMaterial,
  JournalLineDraft,
  JournalMetadata,
  JournalSource,
} from './accounting-journal.types';

const IDEMPOTENCY_PREFIX = 'acct-journal:v1';

export function journalIdempotencyMaterialFromSource(source: JournalSource): JournalIdempotencyMaterial {
  return {
    tenantId: source.tenantId,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
  };
}

export function buildJournalIdempotencyKey(material: JournalIdempotencyMaterial): string {
  return [
    IDEMPOTENCY_PREFIX,
    material.tenantId,
    material.sourceType,
    material.sourceId,
    material.sourceAction,
    material.sourceVersion,
  ].join(':');
}

export function buildAccountingJournal(source: JournalSource): JournalBuildResult {
  switch (source.sourceType) {
    case 'CLIENT_OFFSET':
      return buildClientOffsetJournal(source);
    case 'COLLECTION_DISPOSITION_LINE':
      return buildCollectionDispositionLineJournal(source);
    case 'CLIENT_PAYOUT':
      return buildClientPayoutJournal(source);
    case 'BALANCE_LEDGER':
      return buildBalanceLedgerJournal(source);
    case 'EXPENSE_REQUEST':
      return buildExpenseRequestJournal(source);
    case 'EXPENSE_PAYMENT':
      return buildExpensePaymentJournal(source);
    case 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION':
      return buildCollectionDispositionExpenseApplicationJournal(source);
    case 'ACCOUNTING_JOURNAL_ENTRY':
      return buildAccountingJournalEntryJournal(source);
  }
}

function buildCollectionDispositionLineJournal(source: CollectionDispositionLineJournalSource): JournalBuildResult {
  if (source.sourceAction !== 'posted') {
    return buildError('UNSUPPORTED_SOURCE_ACTION', 'CollectionDispositionLine sourceAction must be posted.', 'sourceAction', {
      sourceAction: source.sourceAction,
    });
  }

  if (source.payload.manualReversalRequiredAt) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'Manual reversal marker on disposition line cannot be a live journal source.', 'payload.manualReversalRequiredAt', {
      manualReversalRequiredAt: source.payload.manualReversalRequiredAt,
    });
  }

  if (source.payload.lineType === 'OTHER' || source.payload.lineType === 'HELD_PENDING_DISTRIBUTION') {
    return buildError('UNMAPPED_SOURCE', 'OTHER/HELD disposition line is not auto-posted; manual review is required.', 'payload.lineType', {
      lineType: source.payload.lineType,
    });
  }



  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: 'Collection disposition line posted',
    lineType: source.payload.lineType,
    manualReversalRequiredAt: source.payload.manualReversalRequiredAt,
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.caseId,
    currency: source.currency,
    entryType: 'COLLECTION_DISTRIBUTION_POSTED',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: null,
    lines: [
      collectionDispositionLine(source, 1, 'CASH_CLEARING', 'DEBIT'),
      collectionDispositionLine(source, 2, source.payload.creditAccountCode, 'CREDIT'),
    ],
  };

  return { ok: true, draft };
}

function collectionDispositionLine(
  source: CollectionDispositionLineJournalSource,
  lineNo: number,
  accountCode: JournalLineDraft['accountCode'],
  direction: JournalLineDraft['direction'],
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode,
    direction,
    amount: source.payload.amount,
    currency: source.currency,
    caseId: source.payload.caseId,
    clientId: source.payload.clientId,
    caseClientId: source.payload.caseClientId,
    collectionId: source.payload.collectionId,
    dispositionLineId: source.payload.dispositionLineId,
    payoutId: null,
    offsetId: null,
    expenseRequestId: null,
    expensePaymentId: null,
    expenseApplicationId: null,
    balanceLedgerId: null,
  };
}

function buildBalanceLedgerJournal(source: BalanceLedgerJournalSource): JournalBuildResult {
  if (source.sourceAction !== 'posted') {
    return buildError('UNSUPPORTED_SOURCE_ACTION', 'BalanceLedger sourceAction must be posted.', 'sourceAction', {
      sourceAction: source.sourceAction,
    });
  }

  if (source.payload.ledgerType !== 'CREDIT' && source.payload.ledgerType !== 'DEBIT') {
    return buildError('UNMAPPED_SOURCE', 'BalanceLedger ADJUST/REFUND is not approved for journal posting.', 'payload.ledgerType', {
      ledgerType: source.payload.ledgerType,
    });
  }

  if (isDispositionLineBalanceLedgerSource(source.payload.source, source.payload.sourceId)) {
    return buildError('UNMAPPED_SOURCE', 'Correlated disposition_line BalanceLedger is reported-only; CollectionDispositionLine is the canonical journal source.', 'payload.source', {
      source: source.payload.source,
      sourceId: source.payload.sourceId,
    });
  }

  if (isExpensePaymentBalanceLedgerSource(source.payload.source, source.payload.sourceId)) {
    return buildError('UNMAPPED_SOURCE', 'Correlated expense_payment BalanceLedger is reported-only; ExpensePayment is the canonical journal source.', 'payload.source', {
      source: source.payload.source,
      sourceId: source.payload.sourceId,
    });
  }

  const expectedIncrease = source.payload.ledgerType === 'CREDIT';
  if (source.payload.isIncrease !== expectedIncrease) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'BalanceLedger isIncrease must match ledgerType.', 'payload.isIncrease', {
      ledgerType: source.payload.ledgerType,
      isIncrease: source.payload.isIncrease,
    });
  }

  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: 'Balance ledger recorded',
    ledgerType: source.payload.ledgerType,
    balanceLedgerSource: source.payload.source,
    balanceLedgerSourceId: source.payload.sourceId,
    isIncrease: source.payload.isIncrease,
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.caseId,
    currency: source.currency,
    entryType: 'CLIENT_ADVANCE_LEDGER_RECORDED',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: null,
    lines: [
      balanceLedgerLine(source, 1, source.payload.isIncrease ? 'CASH_CLEARING' : 'CLIENT_ADVANCE_BALANCE', 'DEBIT'),
      balanceLedgerLine(source, 2, source.payload.isIncrease ? 'CLIENT_ADVANCE_BALANCE' : 'CASH_CLEARING', 'CREDIT'),
    ],
  };

  return { ok: true, draft };
}

function balanceLedgerLine(
  source: BalanceLedgerJournalSource,
  lineNo: number,
  accountCode: JournalLineDraft['accountCode'],
  direction: JournalLineDraft['direction'],
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode,
    direction,
    amount: source.payload.amount,
    currency: source.currency,
    caseId: source.payload.caseId,
    clientId: null,
    caseClientId: null,
    collectionId: null,
    dispositionLineId: null,
    payoutId: null,
    offsetId: null,
    expenseRequestId: null,
    expensePaymentId: null,
    expenseApplicationId: null,
    balanceLedgerId: source.payload.balanceLedgerId,
  };
}

function isDispositionLineBalanceLedgerSource(source: string | null | undefined, sourceId: string | null | undefined): boolean {
  return parseDispositionLineSource(source) !== null || parseDispositionLineSource(sourceId) !== null || source === 'disposition_line';
}

function parseDispositionLineSource(value: string | null | undefined): string | null {
  if (!value) return null;
  const prefix = 'disposition_line:';
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function isExpensePaymentBalanceLedgerSource(source: string | null | undefined, sourceId: string | null | undefined): boolean {
  return parseExpensePaymentSource(source) !== null || parseExpensePaymentSource(sourceId) !== null || source === 'expense_payment';
}

function parseExpensePaymentSource(value: string | null | undefined): string | null {
  if (!value) return null;
  const prefix = 'expense_payment:';
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}
function buildExpenseRequestJournal(source: ExpenseRequestJournalSource): JournalBuildResult {
  const isRecorded = source.payload.kind === 'RECORDED';
  const expectedAction = isRecorded ? 'recorded' : 'cancel';
  if (source.sourceAction !== expectedAction) {
    return buildError('UNSUPPORTED_SOURCE_ACTION', 'ExpenseRequest sourceAction must match payload kind.', 'sourceAction', {
      expectedAction,
      actualAction: source.sourceAction,
      kind: source.payload.kind,
    });
  }

  if (source.payload.expenseRequestId !== source.sourceId) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'ExpenseRequest payload expenseRequestId must match sourceId.', 'payload.expenseRequestId', {
      sourceId: source.sourceId,
      expenseRequestId: source.payload.expenseRequestId,
    });
  }

  if (isRecorded && source.payload.cancelGuard) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'ExpenseRequest recorded source must not carry cancelGuard.', 'payload.cancelGuard', {
      cancelGuard: expenseRequestCancelGuardMetadata(source.payload.cancelGuard),
    });
  }

  if (!isRecorded) {
    if (!source.payload.cancelGuard) {
      return buildError('INVALID_SOURCE_PAYLOAD', 'ExpenseRequest cancel skeleton requires cancelGuard.', 'payload.cancelGuard', {
        sourceId: source.sourceId,
      });
    }

    const hasRetainedActivity =
      source.payload.cancelGuard.hasExpensePayments ||
      source.payload.cancelGuard.hasClientOffsets ||
      source.payload.cancelGuard.hasReimbursementApplications;
    if (hasRetainedActivity) {
      return buildError('UNMAPPED_SOURCE', 'ExpenseRequest cancel with settled activity is guarded and not mapped for live journal posting.', 'payload.cancelGuard', {
        cancelGuard: expenseRequestCancelGuardMetadata(source.payload.cancelGuard),
      });
    }
  }

  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: isRecorded ? 'Expense request recorded' : 'Expense request cancelled',
    expenseRequestId: source.payload.expenseRequestId,
    expenseRequestKind: source.payload.kind,
    cancelGuard: source.payload.cancelGuard ? expenseRequestCancelGuardMetadata(source.payload.cancelGuard) : null,
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.caseId,
    currency: source.currency,
    entryType: isRecorded ? 'EXPENSE_REQUEST_RECORDED' : 'EXPENSE_REQUEST_CANCELLED',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: isRecorded
      ? null
      : {
          sourceType: 'EXPENSE_REQUEST',
          sourceId: source.sourceId,
          sourceAction: 'recorded',
          sourceVersion: null,
          journalEntryId: null,
        },
    lines: isRecorded
      ? [
          expenseRequestLine(source, 1, 'CLIENT_EXPENSE_RECEIVABLE', 'DEBIT'),
          expenseRequestLine(source, 2, 'FIRM_EXPENSE_REIMBURSEMENT', 'CREDIT'),
        ]
      : [
          expenseRequestLine(source, 1, 'FIRM_EXPENSE_REIMBURSEMENT', 'DEBIT'),
          expenseRequestLine(source, 2, 'CLIENT_EXPENSE_RECEIVABLE', 'CREDIT'),
        ],
  };

  return { ok: true, draft };
}

function expenseRequestCancelGuardMetadata(
  guard: NonNullable<ExpenseRequestJournalSource['payload']['cancelGuard']>,
): JournalMetadata {
  return {
    hasExpensePayments: guard.hasExpensePayments,
    hasClientOffsets: guard.hasClientOffsets,
    hasReimbursementApplications: guard.hasReimbursementApplications,
  };
}
function expenseRequestLine(
  source: ExpenseRequestJournalSource,
  lineNo: number,
  accountCode: JournalLineDraft['accountCode'],
  direction: JournalLineDraft['direction'],
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode,
    direction,
    amount: source.payload.amount,
    currency: source.currency,
    caseId: source.payload.caseId,
    clientId: source.payload.clientId,
    caseClientId: null,
    collectionId: null,
    dispositionLineId: null,
    payoutId: null,
    offsetId: null,
    expenseRequestId: source.payload.expenseRequestId,
    expensePaymentId: null,
    expenseApplicationId: null,
    balanceLedgerId: null,
  };
}
function buildExpensePaymentJournal(source: ExpensePaymentJournalSource): JournalBuildResult {
  if (source.sourceAction !== 'recorded') {
    return buildError('UNSUPPORTED_SOURCE_ACTION', 'ExpensePayment sourceAction must be recorded; reversal/refund are not mapped.', 'sourceAction', {
      sourceAction: source.sourceAction,
    });
  }

  if (source.payload.expensePaymentId !== source.sourceId) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'ExpensePayment payload expensePaymentId must match sourceId.', 'payload.expensePaymentId', {
      sourceId: source.sourceId,
      expensePaymentId: source.payload.expensePaymentId,
    });
  }

  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: 'Expense payment recorded',
    expenseRequestId: source.payload.expenseRequestId,
    expensePaymentId: source.payload.expensePaymentId,
    paymentMethod: source.payload.paymentMethod,
    reference: source.payload.reference,
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.caseId,
    currency: source.currency,
    entryType: 'EXPENSE_PAYMENT_RECORDED',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: null,
    lines: [
      expensePaymentLine(source, 1, 'CASH_CLEARING', 'DEBIT'),
      expensePaymentLine(source, 2, 'CLIENT_EXPENSE_RECEIVABLE', 'CREDIT'),
    ],
  };

  return { ok: true, draft };
}

function expensePaymentLine(
  source: ExpensePaymentJournalSource,
  lineNo: number,
  accountCode: JournalLineDraft['accountCode'],
  direction: JournalLineDraft['direction'],
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode,
    direction,
    amount: source.payload.amount,
    currency: source.currency,
    caseId: source.payload.caseId,
    clientId: source.payload.clientId,
    caseClientId: null,
    collectionId: null,
    dispositionLineId: null,
    payoutId: null,
    offsetId: null,
    expenseRequestId: source.payload.expenseRequestId,
    expensePaymentId: source.payload.expensePaymentId,
    expenseApplicationId: null,
    balanceLedgerId: null,
  };
}
function buildCollectionDispositionExpenseApplicationJournal(
  source: CollectionDispositionExpenseApplicationJournalSource,
): JournalBuildResult {
  const isApply = source.payload.kind === 'APPLY';
  const expectedAction = isApply ? 'apply' : 'reversal';
  if (source.sourceAction !== expectedAction) {
    return buildError('UNSUPPORTED_SOURCE_ACTION', 'CollectionDispositionExpenseApplication sourceAction must match payload kind.', 'sourceAction', {
      expectedAction,
      actualAction: source.sourceAction,
      kind: source.payload.kind,
    });
  }

  if (source.payload.expenseApplicationId !== source.sourceId) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'CollectionDispositionExpenseApplication payload expenseApplicationId must match sourceId.', 'payload.expenseApplicationId', {
      sourceId: source.sourceId,
      expenseApplicationId: source.payload.expenseApplicationId,
    });
  }

  if (isApply && source.payload.reversesApplicationId) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'Expense application APPLY source must not carry reversesApplicationId.', 'payload.reversesApplicationId', {
      reversesApplicationId: source.payload.reversesApplicationId,
    });
  }

  if (!isApply) {
    if (!source.payload.reversesApplicationId) {
      return buildError('INVALID_SOURCE_PAYLOAD', 'Expense application REVERSAL source requires reversesApplicationId.', 'payload.reversesApplicationId', {
        sourceId: source.sourceId,
      });
    }
    if (source.payload.reversesApplicationId === source.sourceId) {
      return buildError('INVALID_SOURCE_PAYLOAD', 'Expense application REVERSAL source must not self-reference.', 'payload.reversesApplicationId', {
        sourceId: source.sourceId,
        reversesApplicationId: source.payload.reversesApplicationId,
      });
    }
  }

  const reimbursementAccount = expenseApplicationReimbursementAccount(source.payload.reimbursementScope);
  if (!reimbursementAccount) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'Expense application reimbursementScope is not mapped.', 'payload.reimbursementScope', {
      reimbursementScope: source.payload.reimbursementScope,
    });
  }

  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: isApply ? 'Expense reimbursement application applied' : 'Expense reimbursement application reversed',
    expenseApplicationKind: source.payload.kind,
    expenseRequestId: source.payload.expenseRequestId,
    expenseApplicationId: source.payload.expenseApplicationId,
    collectionId: source.payload.collectionId,
    collectionDispositionId: source.payload.collectionDispositionId,
    collectionDispositionLineId: source.payload.collectionDispositionLineId,
    reimbursementScope: source.payload.reimbursementScope,
    reversesApplicationId: source.payload.reversesApplicationId,
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.caseId,
    currency: source.currency,
    entryType: isApply
      ? 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED'
      : 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: isApply
      ? null
      : {
          sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
          sourceId: source.payload.reversesApplicationId ?? source.sourceId,
          sourceAction: 'apply',
          sourceVersion: null,
          journalEntryId: null,
        },
    lines: isApply
      ? [
          expenseApplicationLine(source, 1, reimbursementAccount, 'DEBIT'),
          expenseApplicationLine(source, 2, 'CLIENT_EXPENSE_RECEIVABLE', 'CREDIT'),
        ]
      : [
          expenseApplicationLine(source, 1, 'CLIENT_EXPENSE_RECEIVABLE', 'DEBIT'),
          expenseApplicationLine(source, 2, reimbursementAccount, 'CREDIT'),
        ],
  };

  return { ok: true, draft };
}

function expenseApplicationReimbursementAccount(
  reimbursementScope: CollectionDispositionExpenseApplicationJournalSource['payload']['reimbursementScope'],
): JournalLineDraft['accountCode'] | null {
  if (reimbursementScope === 'CLIENT_FRONTED') return 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE';
  if (reimbursementScope === 'FIRM_FRONTED') return 'FIRM_EXPENSE_REIMBURSEMENT';
  return null;
}

function expenseApplicationLine(
  source: CollectionDispositionExpenseApplicationJournalSource,
  lineNo: number,
  accountCode: JournalLineDraft['accountCode'],
  direction: JournalLineDraft['direction'],
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode,
    direction,
    amount: source.payload.amount,
    currency: source.currency,
    caseId: source.payload.caseId,
    clientId: source.payload.clientId,
    caseClientId: null,
    collectionId: source.payload.collectionId,
    dispositionLineId: source.payload.collectionDispositionLineId,
    payoutId: null,
    offsetId: null,
    expenseRequestId: source.payload.expenseRequestId,
    expensePaymentId: null,
    expenseApplicationId: source.payload.expenseApplicationId,
    balanceLedgerId: null,
  };
}
function buildClientPayoutJournal(source: ClientPayoutJournalSource): JournalBuildResult {
  if (source.sourceAction !== 'recorded') {
    return buildError('UNSUPPORTED_SOURCE_ACTION', 'ClientPayout sourceAction must be recorded.', 'sourceAction', {
      sourceAction: source.sourceAction,
    });
  }



  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: 'Client payout recorded',
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.caseId,
    currency: source.currency,
    entryType: 'CLIENT_PAYOUT_RECORDED',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: null,
    lines: [
      clientPayoutLine(source, 1, 'CLIENT_PAYABLE', 'DEBIT'),
      clientPayoutLine(source, 2, 'CASH_CLEARING', 'CREDIT'),
    ],
  };

  return { ok: true, draft };
}

function clientPayoutLine(
  source: ClientPayoutJournalSource,
  lineNo: number,
  accountCode: JournalLineDraft['accountCode'],
  direction: JournalLineDraft['direction'],
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode,
    direction,
    amount: source.payload.amount,
    currency: source.currency,
    caseId: source.payload.caseId,
    clientId: source.payload.clientId,
    caseClientId: source.payload.caseClientId,
    collectionId: null,
    dispositionLineId: null,
    payoutId: source.payload.payoutId,
    offsetId: null,
    expenseRequestId: null,
    expensePaymentId: null,
    expenseApplicationId: null,
    balanceLedgerId: null,
  };
}

function buildClientOffsetJournal(source: ClientOffsetJournalSource): JournalBuildResult {
  const expectedAction = source.payload.kind === 'APPLY' ? 'apply' : 'reversal';
  if (source.sourceAction !== expectedAction) {
    return buildError('UNSUPPORTED_SOURCE_ACTION', 'ClientOffset sourceAction must match payload kind.', 'sourceAction', {
      expectedAction,
      actualAction: source.sourceAction,
      kind: source.payload.kind,
    });
  }



  if (source.payload.kind === 'APPLY' && source.payload.reversesOffsetId) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'ClientOffset APPLY source must not carry reversesOffsetId.', 'payload.reversesOffsetId', {
      reversesOffsetId: source.payload.reversesOffsetId,
    });
  }

  if (source.payload.kind === 'REVERSAL' && !source.payload.reversesOffsetId) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'ClientOffset REVERSAL source requires reversesOffsetId.', 'payload.reversesOffsetId', {
      sourceId: source.sourceId,
    });
  }
  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const isApply = source.payload.kind === 'APPLY';
  const metadata: JournalMetadata = {
    ...source.metadata,
    description: isApply ? 'Client offset applied' : 'Client offset reversed',
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.payableLeg.caseId,
    currency: source.currency,
    entryType: isApply ? 'CLIENT_OFFSET_APPLIED' : 'CLIENT_OFFSET_REVERSED',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: isApply
      ? null
      : {
          sourceType: 'CLIENT_OFFSET',
          sourceId: source.payload.reversesOffsetId ?? source.sourceId,
          sourceAction: 'apply',
          sourceVersion: null,
          journalEntryId: null,
        },
    lines: [
      clientOffsetLine(source, 1, 'CLIENT_PAYABLE', isApply ? 'DEBIT' : 'CREDIT', {
        caseId: source.payload.payableLeg.caseId,
        caseClientId: source.payload.payableLeg.caseClientId,
        expenseRequestId: null,
      }),
      clientOffsetLine(source, 2, 'CLIENT_EXPENSE_RECEIVABLE', isApply ? 'CREDIT' : 'DEBIT', {
        caseId: source.payload.expenseLeg.caseId,
        caseClientId: null,
        expenseRequestId: source.payload.expenseLeg.expenseRequestId,
      }),
    ],
  };

  return { ok: true, draft };
}

function clientOffsetLine(
  source: ClientOffsetJournalSource,
  lineNo: number,
  accountCode: JournalLineDraft['accountCode'],
  direction: JournalLineDraft['direction'],
  dimensions: Pick<JournalLineDraft, 'caseId' | 'caseClientId' | 'expenseRequestId'>,
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode,
    direction,
    amount: source.payload.amount,
    currency: source.currency,
    caseId: dimensions.caseId,
    clientId: source.payload.clientId,
    caseClientId: dimensions.caseClientId,
    collectionId: null,
    dispositionLineId: null,
    payoutId: null,
    offsetId: source.sourceId,
    expenseRequestId: dimensions.expenseRequestId,
    expensePaymentId: null,
    expenseApplicationId: null,
    balanceLedgerId: null,
  };
}

function buildAccountingJournalEntryJournal(source: AccountingJournalEntrySource): JournalBuildResult {
  if (source.sourceAction === 'manual-adjustment') {
    return buildManualAdjustmentJournal(source);
  }

  if (source.payload.originalJournalEntryId !== source.sourceId) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'AccountingJournalEntry reversal sourceId must be the original journal entry id.', 'payload.originalJournalEntryId', {
      sourceId: source.sourceId,
      originalJournalEntryId: source.payload.originalJournalEntryId,
    });
  }

  if (source.payload.originalEntryType === 'ACCOUNTING_JOURNAL_REVERSAL') {
    return buildError('INVALID_SOURCE_PAYLOAD', 'AccountingJournalEntry reversal cannot reverse another reversal entry.', 'payload.originalEntryType', {
      originalEntryType: source.payload.originalEntryType,
    });
  }

  if (source.payload.originalCurrency !== source.currency) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'AccountingJournalEntry reversal currency must match original journal currency.', 'payload.originalCurrency', {
      currency: source.currency,
      originalCurrency: source.payload.originalCurrency,
    });
  }

  if (!Array.isArray(source.payload.originalLines) || source.payload.originalLines.length === 0) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'AccountingJournalEntry reversal requires original journal lines.', 'payload.originalLines', {
      originalJournalEntryId: source.payload.originalJournalEntryId,
    });
  }

  const invalidDirection = source.payload.originalLines.find((line) => line.direction !== 'DEBIT' && line.direction !== 'CREDIT');
  if (invalidDirection) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'AccountingJournalEntry reversal original line direction must be DEBIT or CREDIT.', 'payload.originalLines.direction', {
      lineNo: invalidDirection.lineNo,
      direction: invalidDirection.direction,
    });
  }

  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: 'Accounting journal entry reversed',
    originalJournalEntryId: source.payload.originalJournalEntryId,
    originalEntryType: source.payload.originalEntryType,
    originalSourceType: source.payload.originalSourceType,
    originalSourceId: source.payload.originalSourceId,
    originalSourceAction: source.payload.originalSourceAction,
    originalSourceVersion: source.payload.originalSourceVersion,
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: source.payload.originalCaseId,
    currency: source.currency,
    entryType: 'ACCOUNTING_JOURNAL_REVERSAL',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: {
      sourceType: source.payload.originalSourceType,
      sourceId: source.payload.originalSourceId,
      sourceAction: source.payload.originalSourceAction,
      sourceVersion: source.payload.originalSourceVersion,
      journalEntryId: source.payload.originalJournalEntryId,
    },
    lines: source.payload.originalLines.map((line) => accountingJournalEntryReversalLine(source, line)),
  };

  return { ok: true, draft };
}

function buildManualAdjustmentJournal(source: ManualAdjustmentJournalSource): JournalBuildResult {
  const reason = source.payload.reason.trim();
  if (!reason) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'AccountingJournalEntry manual adjustment requires reason.', 'payload.reason');
  }

  const lineCount = Array.isArray(source.payload.lines) ? source.payload.lines.length : 0;
  if (lineCount < 2) {
    return buildError('INVALID_SOURCE_PAYLOAD', 'AccountingJournalEntry manual adjustment requires at least two lines.', 'payload.lines', {
      lineCount,
    });
  }

  const idempotencyMaterial = journalIdempotencyMaterialFromSource(source);
  const idempotencyKey = buildJournalIdempotencyKey(idempotencyMaterial);
  if (!source.tenantId || !source.sourceId || !source.sourceAction || !source.sourceVersion) {
    return buildError('INVALID_IDEMPOTENCY_MATERIAL', 'Journal source is missing idempotency material.', null, {
      idempotencyKey,
    });
  }

  const metadata: JournalMetadata = {
    ...source.metadata,
    description: 'Accounting journal manual adjustment',
    adjustmentAmount: source.payload.amount,
    reason,
    evidenceRef: source.payload.evidenceRef,
  };

  const draft: JournalEntryDraft = {
    tenantId: source.tenantId,
    caseId: commonManualAdjustmentCaseId(source.payload.lines),
    currency: source.currency,
    entryType: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT',
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceAction: source.sourceAction,
    sourceVersion: source.sourceVersion,
    idempotencyKey,
    idempotencyMaterial,
    sourceHash: source.sourceHash,
    sourceOccurredAt: source.occurredAt,
    effectiveDate: source.effectiveDate,
    postedById: source.actorId,
    description: null,
    metadata,
    reversalOf: null,
    lines: source.payload.lines.map((line, index) => manualAdjustmentLine(source, index + 1, line)),
  };

  return { ok: true, draft };
}

function manualAdjustmentLine(
  source: ManualAdjustmentJournalSource,
  lineNo: number,
  line: ManualAdjustmentJournalLinePayload,
): JournalLineDraft {
  return {
    lineNo,
    tenantId: source.tenantId,
    accountCode: line.accountCode,
    direction: line.direction,
    amount: line.amount,
    currency: source.currency,
    caseId: line.caseId,
    clientId: line.clientId,
    caseClientId: line.caseClientId,
    collectionId: null,
    dispositionLineId: null,
    payoutId: null,
    offsetId: null,
    expenseRequestId: null,
    expensePaymentId: null,
    expenseApplicationId: null,
    balanceLedgerId: null,
  };
}

function commonManualAdjustmentCaseId(lines: ReadonlyArray<ManualAdjustmentJournalLinePayload>): string | null {
  let caseId: string | null = null;
  for (const line of lines) {
    if (!line.caseId) continue;
    if (caseId === null) {
      caseId = line.caseId;
      continue;
    }
    if (caseId !== line.caseId) return null;
  }
  return caseId;
}

function accountingJournalEntryReversalLine(
  source: AccountingJournalReversalSource,
  originalLine: AccountingJournalReversalLinePayload,
): JournalLineDraft {
  return {
    lineNo: originalLine.lineNo,
    tenantId: source.tenantId,
    accountCode: originalLine.accountCode,
    direction: originalLine.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amount: originalLine.amount,
    currency: originalLine.currency,
    caseId: originalLine.caseId,
    clientId: originalLine.clientId,
    caseClientId: originalLine.caseClientId,
    collectionId: originalLine.collectionId,
    dispositionLineId: originalLine.dispositionLineId,
    payoutId: originalLine.payoutId,
    offsetId: originalLine.offsetId,
    expenseRequestId: originalLine.expenseRequestId,
    expensePaymentId: originalLine.expensePaymentId,
    expenseApplicationId: originalLine.expenseApplicationId,
    balanceLedgerId: originalLine.balanceLedgerId,
  };
}

function buildError(
  code: JournalBuildError['code'],
  message: string,
  path: string | null,
  details: JournalMetadata = {},
): JournalBuildResult {
  return {
    ok: false,
    errors: [
      {
        code,
        message,
        path,
        details,
      },
    ],
  };
}