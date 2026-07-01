import type {
  JournalEntryDraft,
  JournalLineDraft,
  JournalMetadata,
  JournalValidationError,
  JournalValidationErrorCode,
  JournalValidationResult,
  ValidatedJournalEntryDraft,
} from './accounting-journal.types';

interface ParsedMoney {
  cents: bigint;
  errorCode: 'INVALID_AMOUNT' | 'INVALID_AMOUNT_PRECISION' | null;
}

export function validateJournalStructure(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];
  requireString(errors, draft.tenantId, 'tenantId');
  requireString(errors, draft.sourceType, 'sourceType');
  requireString(errors, draft.sourceId, 'sourceId');
  requireString(errors, draft.sourceAction, 'sourceAction');
  requireString(errors, draft.sourceVersion, 'sourceVersion');
  requireString(errors, draft.idempotencyKey, 'idempotencyKey');
  requireString(errors, draft.currency, 'currency');
  requireString(errors, draft.sourceOccurredAt, 'sourceOccurredAt');
  requireString(errors, draft.effectiveDate, 'effectiveDate');

  if (!Array.isArray(draft.lines) || draft.lines.length === 0) {
    errors.push(validationError('MISSING_REQUIRED_FIELD', 'Journal draft must contain at least one line.', 'lines'));
  }

  const lineNos = new Set<number>();
  const currencies = new Set<string>();
  let debitTotal = 0n;
  let creditTotal = 0n;

  for (let index = 0; index < draft.lines.length; index += 1) {
    const line = draft.lines[index];
    const linePath = `lines[${index}]`;

    if (!Number.isInteger(line.lineNo) || line.lineNo <= 0) {
      errors.push(validationError('MISSING_REQUIRED_FIELD', 'Journal lineNo must be a positive integer.', `${linePath}.lineNo`));
    } else if (lineNos.has(line.lineNo)) {
      errors.push(validationError('DUPLICATE_LINE_NO', 'Journal lineNo must be unique per draft.', `${linePath}.lineNo`, {
        lineNo: line.lineNo,
      }));
    } else {
      lineNos.add(line.lineNo);
    }

    requireString(errors, line.tenantId, `${linePath}.tenantId`);
    requireString(errors, line.accountCode, `${linePath}.accountCode`);
    requireString(errors, line.direction, `${linePath}.direction`);
    requireString(errors, line.amount, `${linePath}.amount`);
    requireString(errors, line.currency, `${linePath}.currency`);

    if (line.tenantId && line.tenantId !== draft.tenantId) {
      errors.push(validationError('TENANT_MISMATCH', 'Journal line tenantId must match entry tenantId.', `${linePath}.tenantId`, {
        entryTenantId: draft.tenantId,
        lineTenantId: line.tenantId,
      }));
    }

    if (line.currency) {
      currencies.add(line.currency);
      if (line.currency !== draft.currency) {
        errors.push(validationError('CURRENCY_MISMATCH', 'Journal line currency must match entry currency.', `${linePath}.currency`, {
          entryCurrency: draft.currency,
          lineCurrency: line.currency,
        }));
      }
    }

    const parsedAmount = parseMoney(line.amount);
    if (parsedAmount.errorCode) {
      errors.push(validationError(parsedAmount.errorCode, 'Journal line amount must be positive with max 2 decimal places.', `${linePath}.amount`, {
        amount: line.amount,
      }));
      continue;
    }

    if (line.direction === 'DEBIT') {
      debitTotal += parsedAmount.cents;
    } else if (line.direction === 'CREDIT') {
      creditTotal += parsedAmount.cents;
    } else {
      errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'Journal line direction must be DEBIT or CREDIT.', `${linePath}.direction`, {
        direction: line.direction,
      }));
    }
  }

  if (currencies.size > 1) {
    errors.push(validationError('CURRENCY_MISMATCH', 'Journal draft must contain a single currency.', 'lines', {
      currencies: [...currencies].sort(),
    }));
  }

  if (debitTotal !== creditTotal) {
    errors.push(validationError('UNBALANCED_ENTRY', 'Journal draft debit total must equal credit total.', 'lines', {
      debitCents: debitTotal.toString(),
      creditCents: creditTotal.toString(),
    }));
  }

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

export function validateJournalBusiness(draft: JournalEntryDraft): JournalValidationResult {
  switch (draft.sourceType) {
    case 'CLIENT_OFFSET':
      return validateClientOffsetBusiness(draft);
    case 'COLLECTION_DISPOSITION_LINE':
      return validateCollectionDispositionLineBusiness(draft);
    case 'CLIENT_PAYOUT':
      return validateClientPayoutBusiness(draft);
    case 'BALANCE_LEDGER':
      return validateBalanceLedgerBusiness(draft);
    case 'EXPENSE_REQUEST':
      return validateExpenseRequestBusiness(draft);
    case 'EXPENSE_PAYMENT':
      return validateExpensePaymentBusiness(draft);
    case 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION':
      return validateCollectionDispositionExpenseApplicationBusiness(draft);
    default:
      return { ok: true, draft };
  }
}

export function validateJournalDraft(draft: JournalEntryDraft): JournalValidationResult<ValidatedJournalEntryDraft> {
  const structural = validateJournalStructure(draft);
  if (!structural.ok) return { ok: false, errors: structural.errors };

  const business = validateJournalBusiness(draft);
  if (!business.ok) return { ok: false, errors: business.errors };

  return {
    ok: true,
    draft: {
      ...draft,
      validation: {
        structural: true,
        business: true,
      },
    },
  };
}

function validateCollectionDispositionLineBusiness(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];

  if (draft.sourceAction !== 'posted') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'CollectionDispositionLine sourceAction must be posted.', 'sourceAction', {
      sourceAction: draft.sourceAction,
    }));
  }

  if (draft.entryType !== 'COLLECTION_DISTRIBUTION_POSTED') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'CollectionDispositionLine entryType must be COLLECTION_DISTRIBUTION_POSTED.', 'entryType', {
      entryType: draft.entryType,
    }));
  }

  if (draft.metadata.manualReversalRequiredAt) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'Manual reversal marker on disposition line is not eligible for journal posting.', 'metadata.manualReversalRequiredAt', {
      manualReversalRequiredAt: draft.metadata.manualReversalRequiredAt,
    }));
  }

  if (draft.metadata.lineType === 'OTHER' || draft.metadata.lineType === 'HELD_PENDING_DISTRIBUTION') {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'OTHER/HELD disposition line cannot be auto-posted.', 'metadata.lineType', {
      lineType: draft.metadata.lineType,
    }));
  }

  const cashLine = findSingleLine(errors, draft.lines, 'CASH_CLEARING', 'CollectionDispositionLine cash leg');
  const creditLine = draft.lines.find((line) => line.direction === 'CREDIT' && line.accountCode !== 'CASH_CLEARING') ?? null;

  if (draft.lines.length !== 2) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'CollectionDispositionLine journal must contain exactly cash and credit legs.', 'lines', {
      lineCount: draft.lines.length,
    }));
  }

  if (!creditLine) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'CollectionDispositionLine credit leg must be present.', 'lines'));
  }

  if (cashLine && cashLine.direction !== 'DEBIT') {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'CollectionDispositionLine cash leg must be DEBIT.', `lines[${cashLine.lineNo}].direction`, {
      direction: cashLine.direction,
    }));
  }

  if (creditLine && creditLine.direction !== 'CREDIT') {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'CollectionDispositionLine mapped account leg must be CREDIT.', `lines[${creditLine.lineNo}].direction`, {
      direction: creditLine.direction,
    }));
  }

  const requiresCaseClient = creditLine?.accountCode === 'CLIENT_PAYABLE' || creditLine?.accountCode === 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE';
  for (const line of draft.lines) {
    validateCollectionDispositionLineDimensions(errors, draft, line, { requiresCaseClient });
  }

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

function validateCollectionDispositionLineDimensions(
  errors: JournalValidationError[],
  draft: JournalEntryDraft,
  line: JournalLineDraft,
  rule: { requiresCaseClient: boolean },
) {
  if (!line.caseId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'CollectionDispositionLine journal line requires caseId.', `lines[${line.lineNo}].caseId`));
  }

  if (draft.caseId && line.caseId && line.caseId !== draft.caseId) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'CollectionDispositionLine journal line caseId must match entry caseId.', `lines[${line.lineNo}].caseId`, {
      entryCaseId: draft.caseId,
      lineCaseId: line.caseId,
    }));
  }

  if (!line.collectionId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'CollectionDispositionLine journal line requires collectionId.', `lines[${line.lineNo}].collectionId`));
  }

  if (line.dispositionLineId !== draft.sourceId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'CollectionDispositionLine journal line must carry dispositionLineId from sourceId.', `lines[${line.lineNo}].dispositionLineId`, {
      expectedDispositionLineId: draft.sourceId,
      dispositionLineId: line.dispositionLineId,
    }));
  }

  if (rule.requiresCaseClient && !line.caseClientId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Client-attributed disposition journal lines require caseClientId.', `lines[${line.lineNo}].caseClientId`));
  }
}

function validateBalanceLedgerBusiness(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];

  if (draft.sourceAction !== 'posted') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'BalanceLedger sourceAction must be posted.', 'sourceAction', {
      sourceAction: draft.sourceAction,
    }));
  }

  if (draft.entryType !== 'CLIENT_ADVANCE_LEDGER_RECORDED') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'BalanceLedger entryType must be CLIENT_ADVANCE_LEDGER_RECORDED.', 'entryType', {
      entryType: draft.entryType,
    }));
  }

  if (draft.metadata.ledgerType !== 'CREDIT' && draft.metadata.ledgerType !== 'DEBIT') {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'BalanceLedger ADJUST/REFUND is not approved for journal posting.', 'metadata.ledgerType', {
      ledgerType: draft.metadata.ledgerType,
    }));
  }

  if (isDispositionLineBalanceLedgerMetadata(draft.metadata.balanceLedgerSource, draft.metadata.balanceLedgerSourceId)) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'Correlated disposition_line BalanceLedger must not be a direct journal source.', 'metadata.balanceLedgerSource', {
      balanceLedgerSource: draft.metadata.balanceLedgerSource,
      balanceLedgerSourceId: draft.metadata.balanceLedgerSourceId,
    }));
  }

  if (typeof draft.metadata.isIncrease !== 'boolean') {
    errors.push(validationError('MISSING_REQUIRED_FIELD', 'BalanceLedger journal metadata requires isIncrease.', 'metadata.isIncrease'));
  }

  if (draft.lines.length !== 2) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'BalanceLedger journal must contain exactly cash and client advance legs.', 'lines', {
      lineCount: draft.lines.length,
    }));
  }

  const cashLine = findSingleLine(errors, draft.lines, 'CASH_CLEARING', 'BalanceLedger cash leg');
  const advanceLine = findSingleLine(errors, draft.lines, 'CLIENT_ADVANCE_BALANCE', 'BalanceLedger client advance leg');
  const isIncrease = draft.metadata.isIncrease === true;

  if (cashLine) validateBalanceLedgerLine(errors, draft, cashLine, isIncrease ? 'DEBIT' : 'CREDIT');
  if (advanceLine) validateBalanceLedgerLine(errors, draft, advanceLine, isIncrease ? 'CREDIT' : 'DEBIT');

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

function validateBalanceLedgerLine(
  errors: JournalValidationError[],
  draft: JournalEntryDraft,
  line: JournalLineDraft,
  expectedDirection: 'DEBIT' | 'CREDIT',
) {
  if (line.direction !== expectedDirection) {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'BalanceLedger journal leg has invalid direction.', `lines[${line.lineNo}].direction`, {
      expectedDirection,
      direction: line.direction,
    }));
  }

  if (!line.caseId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'BalanceLedger journal line requires caseId.', `lines[${line.lineNo}].caseId`));
  }

  if (draft.caseId && line.caseId && line.caseId !== draft.caseId) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'BalanceLedger journal line caseId must match entry caseId.', `lines[${line.lineNo}].caseId`, {
      entryCaseId: draft.caseId,
      lineCaseId: line.caseId,
    }));
  }

  if (line.balanceLedgerId !== draft.sourceId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'BalanceLedger journal line must carry balanceLedgerId from sourceId.', `lines[${line.lineNo}].balanceLedgerId`, {
      expectedBalanceLedgerId: draft.sourceId,
      balanceLedgerId: line.balanceLedgerId,
    }));
  }

  if (
    line.clientId ||
    line.caseClientId ||
    line.collectionId ||
    line.dispositionLineId ||
    line.payoutId ||
    line.offsetId ||
    line.expenseRequestId ||
    line.expensePaymentId ||
    line.expenseApplicationId
  ) {
    errors.push(validationError('FORBIDDEN_SYNTHETIC_DIMENSION', 'BalanceLedger journal line must not carry unrelated source dimensions.', `lines[${line.lineNo}]`, {
      clientId: line.clientId,
      caseClientId: line.caseClientId,
      collectionId: line.collectionId,
      dispositionLineId: line.dispositionLineId,
      payoutId: line.payoutId,
      offsetId: line.offsetId,
      expenseRequestId: line.expenseRequestId,
      expensePaymentId: line.expensePaymentId,
      expenseApplicationId: line.expenseApplicationId,
    }));
  }
}

function isDispositionLineBalanceLedgerMetadata(source: unknown, sourceId: unknown): boolean {
  return parseDispositionLineMetadata(source) !== null || parseDispositionLineMetadata(sourceId) !== null || source === 'disposition_line';
}

function parseDispositionLineMetadata(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const prefix = 'disposition_line:';
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}
function validateExpenseRequestBusiness(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];
  const isRecorded = draft.sourceAction === 'recorded';
  const isCancel = draft.sourceAction === 'cancel';

  if (!isRecorded && !isCancel) {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ExpenseRequest journal sourceAction must be recorded or cancel.', 'sourceAction', {
      sourceAction: draft.sourceAction,
    }));
  }

  const expectedEntryType = isRecorded ? 'EXPENSE_REQUEST_RECORDED' : 'EXPENSE_REQUEST_CANCELLED';
  if ((isRecorded || isCancel) && draft.entryType !== expectedEntryType) {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ExpenseRequest entryType must match sourceAction.', 'entryType', {
      expectedEntryType,
      entryType: draft.entryType,
    }));
  }

  if (isRecorded && draft.reversalOf) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ExpenseRequest recorded journal must not carry reversal reference.', 'reversalOf', {
      reversalSourceType: draft.reversalOf.sourceType,
      reversalSourceId: draft.reversalOf.sourceId,
      reversalSourceAction: draft.reversalOf.sourceAction,
    }));
  }

  if (isCancel) {
    const invalidReversalReference =
      !draft.reversalOf ||
      draft.reversalOf.sourceType !== 'EXPENSE_REQUEST' ||
      draft.reversalOf.sourceId !== draft.sourceId ||
      draft.reversalOf.sourceAction !== 'recorded';

    if (invalidReversalReference) {
      errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ExpenseRequest cancel journal must reference the original recorded source.', 'reversalOf', {
        reversalSourceType: draft.reversalOf?.sourceType ?? null,
        reversalSourceId: draft.reversalOf?.sourceId ?? null,
        reversalSourceAction: draft.reversalOf?.sourceAction ?? null,
        sourceId: draft.sourceId,
      }));
    }
  }

  if (draft.lines.length !== 2) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'ExpenseRequest journal must contain exactly receivable and reimbursement legs.', 'lines', {
      lineCount: draft.lines.length,
    }));
  }

  const receivableLine = findSingleLine(errors, draft.lines, 'CLIENT_EXPENSE_RECEIVABLE', 'ExpenseRequest receivable leg');
  const reimbursementLine = findSingleLine(errors, draft.lines, 'FIRM_EXPENSE_REIMBURSEMENT', 'ExpenseRequest reimbursement leg');

  if (receivableLine) validateExpenseRequestLine(errors, draft, receivableLine, isRecorded ? 'DEBIT' : 'CREDIT');
  if (reimbursementLine) validateExpenseRequestLine(errors, draft, reimbursementLine, isRecorded ? 'CREDIT' : 'DEBIT');

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

function validateExpenseRequestLine(
  errors: JournalValidationError[],
  draft: JournalEntryDraft,
  line: JournalLineDraft,
  expectedDirection: 'DEBIT' | 'CREDIT',
) {
  if (line.direction !== expectedDirection) {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'ExpenseRequest journal leg has invalid direction.', `lines[${line.lineNo}].direction`, {
      expectedDirection,
      direction: line.direction,
    }));
  }

  if (!line.caseId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ExpenseRequest journal line requires caseId.', `lines[${line.lineNo}].caseId`));
  }

  if (draft.caseId && line.caseId && line.caseId !== draft.caseId) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ExpenseRequest journal line caseId must match entry caseId.', `lines[${line.lineNo}].caseId`, {
      entryCaseId: draft.caseId,
      lineCaseId: line.caseId,
    }));
  }

  if (!line.clientId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ExpenseRequest journal line requires clientId.', `lines[${line.lineNo}].clientId`));
  }

  if (line.expenseRequestId !== draft.sourceId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ExpenseRequest journal line must carry expenseRequestId from sourceId.', `lines[${line.lineNo}].expenseRequestId`, {
      expectedExpenseRequestId: draft.sourceId,
      expenseRequestId: line.expenseRequestId,
    }));
  }

  if (
    line.caseClientId ||
    line.collectionId ||
    line.dispositionLineId ||
    line.payoutId ||
    line.offsetId ||
    line.expensePaymentId ||
    line.expenseApplicationId ||
    line.balanceLedgerId
  ) {
    errors.push(validationError('FORBIDDEN_SYNTHETIC_DIMENSION', 'ExpenseRequest journal line must not carry unrelated source dimensions.', `lines[${line.lineNo}]`, {
      caseClientId: line.caseClientId,
      collectionId: line.collectionId,
      dispositionLineId: line.dispositionLineId,
      payoutId: line.payoutId,
      offsetId: line.offsetId,
      expensePaymentId: line.expensePaymentId,
      expenseApplicationId: line.expenseApplicationId,
      balanceLedgerId: line.balanceLedgerId,
    }));
  }
}
function validateExpensePaymentBusiness(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];

  if (draft.sourceAction !== 'recorded') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ExpensePayment sourceAction must be recorded.', 'sourceAction', {
      sourceAction: draft.sourceAction,
    }));
  }

  if (draft.entryType !== 'EXPENSE_PAYMENT_RECORDED') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ExpensePayment entryType must be EXPENSE_PAYMENT_RECORDED.', 'entryType', {
      entryType: draft.entryType,
    }));
  }

  if (draft.reversalOf) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ExpensePayment recorded journal must not carry reversal reference.', 'reversalOf', {
      reversalSourceType: draft.reversalOf.sourceType,
      reversalSourceId: draft.reversalOf.sourceId,
      reversalSourceAction: draft.reversalOf.sourceAction,
    }));
  }

  if (draft.lines.length !== 2) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'ExpensePayment journal must contain exactly cash and expense receivable legs.', 'lines', {
      lineCount: draft.lines.length,
    }));
  }

  const cashLine = findSingleLine(errors, draft.lines, 'CASH_CLEARING', 'ExpensePayment cash leg');
  const receivableLine = findSingleLine(errors, draft.lines, 'CLIENT_EXPENSE_RECEIVABLE', 'ExpensePayment receivable leg');

  if (cashLine) validateExpensePaymentLine(errors, draft, cashLine, 'DEBIT');
  if (receivableLine) validateExpensePaymentLine(errors, draft, receivableLine, 'CREDIT');

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

function validateExpensePaymentLine(
  errors: JournalValidationError[],
  draft: JournalEntryDraft,
  line: JournalLineDraft,
  expectedDirection: 'DEBIT' | 'CREDIT',
) {
  if (line.direction !== expectedDirection) {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'ExpensePayment journal leg has invalid direction.', `lines[${line.lineNo}].direction`, {
      expectedDirection,
      direction: line.direction,
    }));
  }

  if (!line.caseId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ExpensePayment journal line requires caseId.', `lines[${line.lineNo}].caseId`));
  }

  if (draft.caseId && line.caseId && line.caseId !== draft.caseId) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ExpensePayment journal line caseId must match entry caseId.', `lines[${line.lineNo}].caseId`, {
      entryCaseId: draft.caseId,
      lineCaseId: line.caseId,
    }));
  }

  if (!line.clientId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ExpensePayment journal line requires clientId.', `lines[${line.lineNo}].clientId`));
  }

  if (!line.expenseRequestId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ExpensePayment journal line requires expenseRequestId.', `lines[${line.lineNo}].expenseRequestId`));
  }

  if (line.expensePaymentId !== draft.sourceId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ExpensePayment journal line must carry expensePaymentId from sourceId.', `lines[${line.lineNo}].expensePaymentId`, {
      expectedExpensePaymentId: draft.sourceId,
      expensePaymentId: line.expensePaymentId,
    }));
  }

  if (
    line.caseClientId ||
    line.collectionId ||
    line.dispositionLineId ||
    line.payoutId ||
    line.offsetId ||
    line.expenseApplicationId ||
    line.balanceLedgerId
  ) {
    errors.push(validationError('FORBIDDEN_SYNTHETIC_DIMENSION', 'ExpensePayment journal line must not carry unrelated source dimensions.', `lines[${line.lineNo}]`, {
      caseClientId: line.caseClientId,
      collectionId: line.collectionId,
      dispositionLineId: line.dispositionLineId,
      payoutId: line.payoutId,
      offsetId: line.offsetId,
      expenseApplicationId: line.expenseApplicationId,
      balanceLedgerId: line.balanceLedgerId,
    }));
  }
}
function validateCollectionDispositionExpenseApplicationBusiness(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];
  const isApply = draft.sourceAction === 'apply';
  const isReversal = draft.sourceAction === 'reversal';

  if (!isApply && !isReversal) {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'CollectionDispositionExpenseApplication sourceAction must be apply or reversal.', 'sourceAction', {
      sourceAction: draft.sourceAction,
    }));
  }

  const expectedEntryType = isApply
    ? 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED'
    : 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED';
  if ((isApply || isReversal) && draft.entryType !== expectedEntryType) {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'CollectionDispositionExpenseApplication entryType must match sourceAction.', 'entryType', {
      expectedEntryType,
      entryType: draft.entryType,
    }));
  }

  if (isApply && draft.reversalOf) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'Expense application APPLY journal must not carry reversal reference.', 'reversalOf', {
      reversalSourceType: draft.reversalOf.sourceType,
      reversalSourceId: draft.reversalOf.sourceId,
      reversalSourceAction: draft.reversalOf.sourceAction,
    }));
  }

  if (isReversal) {
    const expectedOriginalId = typeof draft.metadata.reversesApplicationId === 'string' ? draft.metadata.reversesApplicationId : null;
    const invalidReversalReference =
      !draft.reversalOf ||
      draft.reversalOf.sourceType !== 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION' ||
      draft.reversalOf.sourceAction !== 'apply' ||
      !draft.reversalOf.sourceId ||
      draft.reversalOf.sourceId === draft.sourceId ||
      (expectedOriginalId !== null && draft.reversalOf.sourceId !== expectedOriginalId);

    if (invalidReversalReference) {
      errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'Expense application REVERSAL journal must reference the original APPLY source.', 'reversalOf', {
        reversalSourceType: draft.reversalOf?.sourceType ?? null,
        reversalSourceId: draft.reversalOf?.sourceId ?? null,
        reversalSourceAction: draft.reversalOf?.sourceAction ?? null,
        expectedOriginalId,
        sourceId: draft.sourceId,
      }));
    }
  }

  if (draft.lines.length !== 2) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'Expense application journal must contain exactly reimbursement and expense receivable legs.', 'lines', {
      lineCount: draft.lines.length,
    }));
  }

  if (typeof draft.metadata.collectionDispositionId !== 'string' || draft.metadata.collectionDispositionId.length === 0) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Expense application journal metadata requires collectionDispositionId.', 'metadata.collectionDispositionId'));
  }

  if (typeof draft.metadata.collectionDispositionLineId !== 'string' || draft.metadata.collectionDispositionLineId.length === 0) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Expense application journal metadata requires collectionDispositionLineId.', 'metadata.collectionDispositionLineId'));
  }

  const reimbursementScope = draft.metadata.reimbursementScope;
  const reimbursementAccount = reimbursementScope === 'CLIENT_FRONTED'
    ? 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE'
    : reimbursementScope === 'FIRM_FRONTED'
      ? 'FIRM_EXPENSE_REIMBURSEMENT'
      : null;

  if (!reimbursementAccount) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'Expense application reimbursementScope must map to a reimbursement account.', 'metadata.reimbursementScope', {
      reimbursementScope,
    }));
  }

  const receivableLine = findSingleLine(errors, draft.lines, 'CLIENT_EXPENSE_RECEIVABLE', 'Expense application receivable leg');
  const reimbursementLine = reimbursementAccount
    ? findSingleLine(errors, draft.lines, reimbursementAccount, 'Expense application reimbursement leg')
    : null;

  if (receivableLine) validateCollectionDispositionExpenseApplicationLine(errors, draft, receivableLine, isApply ? 'CREDIT' : 'DEBIT');
  if (reimbursementLine) validateCollectionDispositionExpenseApplicationLine(errors, draft, reimbursementLine, isApply ? 'DEBIT' : 'CREDIT');

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

function validateCollectionDispositionExpenseApplicationLine(
  errors: JournalValidationError[],
  draft: JournalEntryDraft,
  line: JournalLineDraft,
  expectedDirection: 'DEBIT' | 'CREDIT',
) {
  if (line.direction !== expectedDirection) {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'Expense application journal leg has invalid direction.', `lines[${line.lineNo}].direction`, {
      expectedDirection,
      direction: line.direction,
    }));
  }

  if (!line.caseId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Expense application journal line requires caseId.', `lines[${line.lineNo}].caseId`));
  }

  if (draft.caseId && line.caseId && line.caseId !== draft.caseId) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'Expense application journal line caseId must match entry caseId.', `lines[${line.lineNo}].caseId`, {
      entryCaseId: draft.caseId,
      lineCaseId: line.caseId,
    }));
  }

  if (!line.clientId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Expense application journal line requires clientId.', `lines[${line.lineNo}].clientId`));
  }

  if (!line.expenseRequestId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Expense application journal line requires expenseRequestId.', `lines[${line.lineNo}].expenseRequestId`));
  }

  if (line.expenseApplicationId !== draft.sourceId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Expense application journal line must carry expenseApplicationId from sourceId.', `lines[${line.lineNo}].expenseApplicationId`, {
      expectedExpenseApplicationId: draft.sourceId,
      expenseApplicationId: line.expenseApplicationId,
    }));
  }

  const expectedDispositionLineId = typeof draft.metadata.collectionDispositionLineId === 'string'
    ? draft.metadata.collectionDispositionLineId
    : null;
  if (!line.dispositionLineId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'Expense application journal line requires dispositionLineId.', `lines[${line.lineNo}].dispositionLineId`));
  } else if (expectedDispositionLineId && line.dispositionLineId !== expectedDispositionLineId) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'Expense application journal line dispositionLineId must match metadata collectionDispositionLineId.', `lines[${line.lineNo}].dispositionLineId`, {
      expectedDispositionLineId,
      dispositionLineId: line.dispositionLineId,
    }));
  }

  if (
    line.caseClientId ||
    line.payoutId ||
    line.offsetId ||
    line.expensePaymentId ||
    line.balanceLedgerId
  ) {
    errors.push(validationError('FORBIDDEN_SYNTHETIC_DIMENSION', 'Expense application journal line must not carry unrelated source dimensions.', `lines[${line.lineNo}]`, {
      caseClientId: line.caseClientId,
      payoutId: line.payoutId,
      offsetId: line.offsetId,
      expensePaymentId: line.expensePaymentId,
      balanceLedgerId: line.balanceLedgerId,
    }));
  }
}
function validateClientPayoutBusiness(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];

  if (draft.sourceAction !== 'recorded') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ClientPayout sourceAction must be recorded.', 'sourceAction', {
      sourceAction: draft.sourceAction,
    }));
  }

  if (draft.entryType !== 'CLIENT_PAYOUT_RECORDED') {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ClientPayout entryType must be CLIENT_PAYOUT_RECORDED.', 'entryType', {
      entryType: draft.entryType,
    }));
  }

  if (draft.lines.length !== 2) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'ClientPayout journal must contain exactly payable and cash legs.', 'lines', {
      lineCount: draft.lines.length,
    }));
  }

  const payableLine = findSingleLine(errors, draft.lines, 'CLIENT_PAYABLE', 'ClientPayout payable leg');
  const cashLine = findSingleLine(errors, draft.lines, 'CASH_CLEARING', 'ClientPayout cash leg');

  if (payableLine) validateClientPayoutLine(errors, draft, payableLine, 'DEBIT');
  if (cashLine) validateClientPayoutLine(errors, draft, cashLine, 'CREDIT');

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

function validateClientPayoutLine(
  errors: JournalValidationError[],
  draft: JournalEntryDraft,
  line: JournalLineDraft,
  expectedDirection: 'DEBIT' | 'CREDIT',
) {
  if (line.direction !== expectedDirection) {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', 'ClientPayout journal leg has invalid direction.', `lines[${line.lineNo}].direction`, {
      expectedDirection,
      direction: line.direction,
    }));
  }

  if (!line.caseId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ClientPayout journal line requires caseId.', `lines[${line.lineNo}].caseId`));
  }

  if (draft.caseId && line.caseId && line.caseId !== draft.caseId) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ClientPayout journal line caseId must match entry caseId.', `lines[${line.lineNo}].caseId`, {
      entryCaseId: draft.caseId,
      lineCaseId: line.caseId,
    }));
  }

  if (!line.caseClientId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ClientPayout journal line requires caseClientId.', `lines[${line.lineNo}].caseClientId`));
  }

  if (line.payoutId !== draft.sourceId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ClientPayout journal line must carry payoutId from sourceId.', `lines[${line.lineNo}].payoutId`, {
      expectedPayoutId: draft.sourceId,
      payoutId: line.payoutId,
    }));
  }

  if (line.collectionId || line.dispositionLineId || line.offsetId || line.expenseRequestId || line.expensePaymentId || line.expenseApplicationId || line.balanceLedgerId) {
    errors.push(validationError('FORBIDDEN_SYNTHETIC_DIMENSION', 'ClientPayout journal line must not carry unrelated source dimensions.', `lines[${line.lineNo}]`, {
      collectionId: line.collectionId,
      dispositionLineId: line.dispositionLineId,
      offsetId: line.offsetId,
      expenseRequestId: line.expenseRequestId,
      expensePaymentId: line.expensePaymentId,
      expenseApplicationId: line.expenseApplicationId,
      balanceLedgerId: line.balanceLedgerId,
    }));
  }
}

function validateClientOffsetBusiness(draft: JournalEntryDraft): JournalValidationResult {
  const errors: JournalValidationError[] = [];
  const isApply = draft.sourceAction === 'apply';
  const isReversal = draft.sourceAction === 'reversal';

  if (!isApply && !isReversal) {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ClientOffset journal sourceAction must be apply or reversal.', 'sourceAction', {
      sourceAction: draft.sourceAction,
    }));
  }

  const expectedEntryType = isApply ? 'CLIENT_OFFSET_APPLIED' : 'CLIENT_OFFSET_REVERSED';
  if ((isApply || isReversal) && draft.entryType !== expectedEntryType) {
    errors.push(validationError('INVALID_SOURCE_ACTION', 'ClientOffset entryType must match sourceAction.', 'entryType', {
      expectedEntryType,
      entryType: draft.entryType,
    }));
  }

  if (isApply && draft.reversalOf) {
    errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ClientOffset APPLY journal must not carry reversal reference.', 'reversalOf', {
      reversalSourceType: draft.reversalOf.sourceType,
      reversalSourceId: draft.reversalOf.sourceId,
      reversalSourceAction: draft.reversalOf.sourceAction,
    }));
  }

  if (isReversal) {
    const invalidReversalReference =
      !draft.reversalOf ||
      draft.reversalOf.sourceType !== 'CLIENT_OFFSET' ||
      draft.reversalOf.sourceAction !== 'apply' ||
      !draft.reversalOf.sourceId ||
      draft.reversalOf.sourceId === draft.sourceId;

    if (invalidReversalReference) {
      errors.push(validationError('UNSUPPORTED_BUSINESS_RULE', 'ClientOffset REVERSAL journal must reference the original APPLY source.', 'reversalOf', {
        reversalSourceType: draft.reversalOf?.sourceType ?? null,
        reversalSourceId: draft.reversalOf?.sourceId ?? null,
        reversalSourceAction: draft.reversalOf?.sourceAction ?? null,
        sourceId: draft.sourceId,
      }));
    }
  }
  const payableLine = findSingleLine(errors, draft.lines, 'CLIENT_PAYABLE', 'CLIENT_OFFSET payable leg');
  const expenseLine = findSingleLine(errors, draft.lines, 'CLIENT_EXPENSE_RECEIVABLE', 'CLIENT_OFFSET expense leg');

  if (draft.lines.length !== 2) {
    errors.push(validationError('INVALID_LINE_SHAPE', 'ClientOffset journal must contain exactly payable and expense legs.', 'lines', {
      lineCount: draft.lines.length,
    }));
  }

  if (payableLine) {
    validateClientOffsetLine(errors, draft, payableLine, {
      label: 'payable',
      expectedDirection: isApply ? 'DEBIT' : 'CREDIT',
      caseClientIdRequired: true,
      expenseCaseClientIdForbidden: false,
    });
  }

  if (expenseLine) {
    validateClientOffsetLine(errors, draft, expenseLine, {
      label: 'expense',
      expectedDirection: isApply ? 'CREDIT' : 'DEBIT',
      caseClientIdRequired: false,
      expenseCaseClientIdForbidden: true,
    });
  }

  return errors.length === 0 ? { ok: true, draft } : { ok: false, errors };
}

function validateClientOffsetLine(
  errors: JournalValidationError[],
  draft: JournalEntryDraft,
  line: JournalLineDraft,
  rule: {
    label: 'payable' | 'expense';
    expectedDirection: 'DEBIT' | 'CREDIT';
    caseClientIdRequired: boolean;
    expenseCaseClientIdForbidden: boolean;
  },
) {
  if (line.direction !== rule.expectedDirection) {
    errors.push(validationError('INVALID_ACCOUNT_DIRECTION', `ClientOffset ${rule.label} leg has invalid direction.`, `lines[${line.lineNo}].direction`, {
      expectedDirection: rule.expectedDirection,
      direction: line.direction,
    }));
  }

  if (!line.caseId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', `ClientOffset ${rule.label} leg requires caseId.`, `lines[${line.lineNo}].caseId`));
  }

  if (!line.clientId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', `ClientOffset ${rule.label} leg requires clientId.`, `lines[${line.lineNo}].clientId`));
  }

  if (line.offsetId !== draft.sourceId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', `ClientOffset ${rule.label} leg must carry offsetId from sourceId.`, `lines[${line.lineNo}].offsetId`, {
      expectedOffsetId: draft.sourceId,
      offsetId: line.offsetId,
    }));
  }

  if (rule.caseClientIdRequired && !line.caseClientId) {
    errors.push(validationError('MISSING_REQUIRED_DIMENSION', 'ClientOffset payable leg requires payable caseClientId.', `lines[${line.lineNo}].caseClientId`));
  }

  if (rule.expenseCaseClientIdForbidden && line.caseClientId !== null) {
    errors.push(validationError('FORBIDDEN_SYNTHETIC_DIMENSION', 'ClientOffset expense leg caseClientId must be null.', `lines[${line.lineNo}].caseClientId`, {
      caseClientId: line.caseClientId,
    }));
  }
}

function findSingleLine(
  errors: JournalValidationError[],
  lines: JournalLineDraft[],
  accountCode: JournalLineDraft['accountCode'],
  label: string,
): JournalLineDraft | null {
  const matches = lines.filter((line) => line.accountCode === accountCode);
  if (matches.length !== 1) {
    errors.push(validationError('INVALID_LINE_SHAPE', `${label} must appear exactly once.`, 'lines', {
      accountCode,
      count: matches.length,
    }));
    return null;
  }
  return matches[0];
}

function requireString(errors: JournalValidationError[], value: string | null | undefined, path: string) {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(validationError('MISSING_REQUIRED_FIELD', 'Required journal field is missing.', path));
  }
}

function parseMoney(amount: string): ParsedMoney {
  if (typeof amount !== 'string' || !/^\d+(?:\.\d+)?$/.test(amount)) {
    return { cents: 0n, errorCode: 'INVALID_AMOUNT' };
  }

  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > 2) {
    return { cents: 0n, errorCode: 'INVALID_AMOUNT_PRECISION' };
  }

  const cents = BigInt(whole) * 100n + BigInt((fraction || '0').padEnd(2, '0'));
  return cents > 0n ? { cents, errorCode: null } : { cents, errorCode: 'INVALID_AMOUNT' };
}

function validationError(
  code: JournalValidationErrorCode,
  message: string,
  path: string | null,
  details: JournalMetadata = {},
): JournalValidationError {
  return {
    code,
    message,
    path,
    details,
  };
}