export type AccountingJournalEntryType =
  | 'COLLECTION_DISTRIBUTION_POSTED'
  | 'CLIENT_PAYOUT_RECORDED'
  | 'CLIENT_OFFSET_APPLIED'
  | 'CLIENT_OFFSET_REVERSED'
  | 'CLIENT_ADVANCE_LEDGER_RECORDED'
  | 'EXPENSE_REQUEST_RECORDED'
  | 'EXPENSE_REQUEST_CANCELLED'
  | 'EXPENSE_PAYMENT_RECORDED'
  | 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED'
  | 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED'
  | 'ACCOUNTING_JOURNAL_REVERSAL'
  | 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT';

export type AccountingJournalSourceType =
  | 'COLLECTION_DISPOSITION_LINE'
  | 'CLIENT_PAYOUT'
  | 'CLIENT_OFFSET'
  | 'BALANCE_LEDGER'
  | 'EXPENSE_REQUEST'
  | 'EXPENSE_PAYMENT'
  | 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION'
  | 'ACCOUNTING_JOURNAL_ENTRY';

export type AccountingAccountCode =
  | 'CASH_CLEARING'
  | 'CLIENT_PAYABLE'
  | 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE'
  | 'CLIENT_EXPENSE_RECEIVABLE'
  | 'ATTORNEY_FEE_REVENUE'
  | 'FIRM_EXPENSE_REIMBURSEMENT'
  | 'CLIENT_ADVANCE_BALANCE';

export type AccountingJournalDirection = 'DEBIT' | 'CREDIT';

export type JournalSourceAction = 'posted' | 'recorded' | 'apply' | 'reversal' | 'cancel' | 'manual-adjustment';

export type JournalMetadataValue =
  | string
  | number
  | boolean
  | null
  | JournalMetadataValue[]
  | { [key: string]: JournalMetadataValue };

export type JournalMetadata = Record<string, JournalMetadataValue>;

export type MoneyAmount = string;

export interface JournalSourceBase<
  TSourceType extends AccountingJournalSourceType,
  TSourceAction extends JournalSourceAction,
  TPayload,
> {
  tenantId: string;
  sourceType: TSourceType;
  sourceId: string;
  sourceVersion: string;
  sourceAction: TSourceAction;
  occurredAt: string;
  effectiveDate: string;
  actorId: string | null;
  currency: string;
  sourceHash: string | null;
  metadata: JournalMetadata;
  payload: TPayload;
}

export type ClientOffsetSourceAction = 'apply' | 'reversal';

export type ClientOffsetKind = 'APPLY' | 'REVERSAL';

export interface ClientOffsetJournalSourcePayload {
  kind: ClientOffsetKind;
  amount: MoneyAmount;
  clientId: string;
  payableLeg: {
    caseId: string;
    caseClientId: string;
  };
  expenseLeg: {
    caseId: string;
    caseClientId: null;
    expenseRequestId: string | null;
  };
  reversesOffsetId: string | null;
}

export type ClientOffsetJournalSource = JournalSourceBase<
  'CLIENT_OFFSET',
  ClientOffsetSourceAction,
  ClientOffsetJournalSourcePayload
>;

export interface CollectionDispositionLinePostedPayload {
  lineType:
    | 'CLIENT_PAYABLE'
    | 'CONTRACTUAL_FEE_WITHHELD'
    | 'FIRM_EXPENSE_REIMBURSEMENT'
    | 'CLIENT_EXPENSE_REIMBURSEMENT'
    | 'OFFSET_CLIENT_ADVANCE'
    | 'HELD_PENDING_DISTRIBUTION'
    | 'OTHER';
  amount: MoneyAmount;
  caseId: string;
  caseClientId: string | null;
  clientId: string | null;
  collectionId: string;
  dispositionLineId: string;
  creditAccountCode: AccountingAccountCode;
  manualReversalRequiredAt: string | null;
}

export type CollectionDispositionLineJournalSource = JournalSourceBase<
  'COLLECTION_DISPOSITION_LINE',
  'posted',
  CollectionDispositionLinePostedPayload
>;

export interface ClientPayoutRecordedPayload {
  amount: MoneyAmount;
  caseId: string;
  caseClientId: string;
  clientId: string | null;
  payoutId: string;
}

export type ClientPayoutJournalSource = JournalSourceBase<'CLIENT_PAYOUT', 'recorded', ClientPayoutRecordedPayload>;

export type BalanceLedgerRecordedType = 'CREDIT' | 'DEBIT' | 'ADJUST' | 'REFUND';

export interface BalanceLedgerRecordedPayload {
  amount: MoneyAmount;
  caseId: string;
  balanceLedgerId: string;
  ledgerType: BalanceLedgerRecordedType;
  source: string;
  sourceId: string | null;
  isIncrease: boolean;
}

export type BalanceLedgerJournalSource = JournalSourceBase<'BALANCE_LEDGER', 'posted', BalanceLedgerRecordedPayload>;

export type ExpenseRequestSourceAction = 'recorded' | 'cancel';

export type ExpenseRequestJournalKind = 'RECORDED' | 'CANCEL';

export interface ExpenseRequestCancelGuard {
  hasExpensePayments: boolean;
  hasClientOffsets: boolean;
  hasReimbursementApplications: boolean;
}

export interface ExpenseRequestJournalSourcePayload {
  kind: ExpenseRequestJournalKind;
  amount: MoneyAmount;
  caseId: string;
  clientId: string;
  expenseRequestId: string;
  cancelGuard: ExpenseRequestCancelGuard | null;
}

export type ExpenseRequestJournalSource = JournalSourceBase<
  'EXPENSE_REQUEST',
  ExpenseRequestSourceAction,
  ExpenseRequestJournalSourcePayload
>;

export interface ExpensePaymentRecordedPayload {
  amount: MoneyAmount;
  caseId: string;
  clientId: string;
  expenseRequestId: string;
  expensePaymentId: string;
  paymentMethod: string | null;
  reference: string | null;
}

export type ExpensePaymentJournalSource = JournalSourceBase<'EXPENSE_PAYMENT', 'recorded', ExpensePaymentRecordedPayload>;

export type CollectionDispositionExpenseApplicationSourceAction = 'apply' | 'reversal';

export type CollectionDispositionExpenseApplicationKind = 'APPLY' | 'REVERSAL';

export type ExpenseApplicationReimbursementScope = 'CLIENT_FRONTED' | 'FIRM_FRONTED';

export interface CollectionDispositionExpenseApplicationPayload {
  kind: CollectionDispositionExpenseApplicationKind;
  amount: MoneyAmount;
  caseId: string;
  clientId: string;
  expenseRequestId: string;
  expenseApplicationId: string;
  collectionId: string | null;
  collectionDispositionId: string;
  collectionDispositionLineId: string;
  reimbursementScope: ExpenseApplicationReimbursementScope;
  reversesApplicationId: string | null;
}

export type CollectionDispositionExpenseApplicationJournalSource = JournalSourceBase<
  'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
  CollectionDispositionExpenseApplicationSourceAction,
  CollectionDispositionExpenseApplicationPayload
>;
export interface AccountingJournalReversalLinePayload {
  lineNo: number;
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: MoneyAmount;
  currency: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
  collectionId: string | null;
  dispositionLineId: string | null;
  payoutId: string | null;
  offsetId: string | null;
  expenseRequestId: string | null;
  expensePaymentId: string | null;
  expenseApplicationId: string | null;
  balanceLedgerId: string | null;
}

export interface AccountingJournalReversalPayload {
  originalJournalEntryId: string;
  originalEntryType: AccountingJournalEntryType;
  originalCaseId: string | null;
  originalCurrency: string;
  originalSourceType: AccountingJournalSourceType;
  originalSourceId: string;
  originalSourceAction: string;
  originalSourceVersion: string | null;
  originalLines: ReadonlyArray<AccountingJournalReversalLinePayload>;
}

export interface ManualAdjustmentJournalLinePayload {
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: MoneyAmount;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
}

export interface ManualAdjustmentJournalPayload {
  amount: MoneyAmount;
  reason: string;
  evidenceRef: string | null;
  lines: ReadonlyArray<ManualAdjustmentJournalLinePayload>;
}

export type AccountingJournalReversalSource = JournalSourceBase<
  'ACCOUNTING_JOURNAL_ENTRY',
  'reversal',
  AccountingJournalReversalPayload
>;

export type ManualAdjustmentJournalSource = JournalSourceBase<
  'ACCOUNTING_JOURNAL_ENTRY',
  'manual-adjustment',
  ManualAdjustmentJournalPayload
>;

export type AccountingJournalEntrySource = AccountingJournalReversalSource | ManualAdjustmentJournalSource;

export type JournalSource =
  | ClientOffsetJournalSource
  | CollectionDispositionLineJournalSource
  | ClientPayoutJournalSource
  | BalanceLedgerJournalSource
  | ExpenseRequestJournalSource
  | ExpensePaymentJournalSource
  | CollectionDispositionExpenseApplicationJournalSource
  | AccountingJournalEntrySource;

export interface JournalIdempotencyMaterial {
  tenantId: string;
  sourceType: AccountingJournalSourceType;
  sourceId: string;
  sourceAction: string;
  sourceVersion: string;
}

export interface JournalReversalReference {
  sourceType: AccountingJournalSourceType;
  sourceId: string;
  sourceAction: string;
  sourceVersion: string | null;
  journalEntryId: string | null;
}

export interface JournalLineDraft {
  lineNo: number;
  tenantId: string;
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: MoneyAmount;
  currency: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
  collectionId: string | null;
  dispositionLineId: string | null;
  payoutId: string | null;
  offsetId: string | null;
  expenseRequestId: string | null;
  expensePaymentId: string | null;
  expenseApplicationId: string | null;
  balanceLedgerId: string | null;
}

export interface JournalEntryDraft {
  tenantId: string;
  caseId: string | null;
  currency: string;
  entryType: AccountingJournalEntryType;
  sourceType: AccountingJournalSourceType;
  sourceId: string;
  sourceAction: string;
  sourceVersion: string;
  idempotencyKey: string;
  idempotencyMaterial: JournalIdempotencyMaterial;
  sourceHash: string | null;
  sourceOccurredAt: string;
  effectiveDate: string;
  postedById: string | null;
  description: null;
  metadata: JournalMetadata;
  reversalOf: JournalReversalReference | null;
  lines: JournalLineDraft[];
}

export type JournalBuildErrorCode =
  | 'UNSUPPORTED_SOURCE_TYPE'
  | 'UNSUPPORTED_SOURCE_ACTION'
  | 'INVALID_SOURCE_PAYLOAD'
  | 'INVALID_IDEMPOTENCY_MATERIAL'
  | 'UNMAPPED_SOURCE';

export interface JournalBuildError {
  code: JournalBuildErrorCode;
  message: string;
  path: string | null;
  details: JournalMetadata;
}

export type JournalBuildResult =
  | { ok: true; draft: JournalEntryDraft }
  | { ok: false; errors: JournalBuildError[] };

export type JournalValidationErrorCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_AMOUNT'
  | 'INVALID_AMOUNT_PRECISION'
  | 'UNBALANCED_ENTRY'
  | 'CURRENCY_MISMATCH'
  | 'TENANT_MISMATCH'
  | 'DUPLICATE_LINE_NO'
  | 'MISSING_REQUIRED_DIMENSION'
  | 'FORBIDDEN_SYNTHETIC_DIMENSION'
  | 'UNSUPPORTED_BUSINESS_RULE'
  | 'INVALID_SOURCE_ACTION'
  | 'INVALID_ACCOUNT_DIRECTION'
  | 'INVALID_LINE_SHAPE';

export interface JournalValidationError {
  code: JournalValidationErrorCode;
  message: string;
  path: string | null;
  details: JournalMetadata;
}

export interface ValidatedJournalEntryDraft extends JournalEntryDraft {
  validation: {
    structural: true;
    business: true;
  };
}

export type JournalValidationResult<TDraft extends JournalEntryDraft = JournalEntryDraft> =
  | { ok: true; draft: TDraft }
  | { ok: false; errors: JournalValidationError[] };

export interface JournalWriterInput {
  draft: ValidatedJournalEntryDraft;
}

export type JournalWriterStatus = 'CREATED' | 'REPLAYED';

export interface JournalWriterOutput {
  status: JournalWriterStatus;
  journalEntryId: string;
  idempotencyKey: string;
  sourceVersion: string;
  lineCount: number;
}

export type JournalWriterErrorCode =
  | 'IDEMPOTENCY_CONFLICT'
  | 'SOURCE_VERSION_STALE'
  | 'SOURCE_HASH_MISMATCH'
  | 'REVERSAL_ALREADY_EXISTS'
  | 'REVERSAL_ORIGINAL_NOT_FOUND'
  | 'REVERSAL_ORIGINAL_NOT_REVERSIBLE'
  | 'TENANT_MISMATCH'
  | 'DB_WRITE_FAILED';

export interface JournalWriterError {
  code: JournalWriterErrorCode;
  message: string;
  idempotencyKey: string | null;
  details: JournalMetadata;
}

export type JournalWriterResult =
  | { ok: true; output: JournalWriterOutput }
  | { ok: false; errors: JournalWriterError[] };
