import type {
  ClientOffsetJournalSource,
  CollectionDispositionLineJournalSource,
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
    case 'BALANCE_LEDGER':
    case 'ACCOUNTING_JOURNAL_ENTRY':
      return buildError('UNMAPPED_SOURCE', `Journal builder skeleton does not yet map ${source.sourceType}.`, 'sourceType', {
        sourceType: source.sourceType,
      });
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
    balanceLedgerId: null,
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