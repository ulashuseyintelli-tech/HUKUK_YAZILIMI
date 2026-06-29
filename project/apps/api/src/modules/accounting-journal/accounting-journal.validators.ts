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
  if (draft.sourceType !== 'CLIENT_OFFSET') {
    return { ok: true, draft };
  }

  return validateClientOffsetBusiness(draft);
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
