import type {
  ClientOffsetJournalSource,
  ClientOffsetJournalSourcePayload,
  ClientOffsetSourceAction,
  JournalMetadata,
} from './accounting-journal.types';
import {
  createCanonicalSourceHash,
  normalizeSourceHashAmount,
  normalizeSourceHashDate,
  type SourceHashAmountInput,
} from './accounting-journal-source-hash';
import {
  createJournalSourceError,
  type JournalSourceAdapterResult,
  type JournalSourceError,
  type JournalSourceIdentity,
  type JournalSourceRelationData,
  validateJournalSourceIdentity,
} from './accounting-journal-source.types';

export interface ClientOffsetSourceIdentity extends JournalSourceIdentity {
  sourceType: 'CLIENT_OFFSET';
  sourceAction: ClientOffsetSourceAction;
}

export interface ClientOffsetSourceSnapshotPayload {
  id: string;
  kind: 'APPLY' | 'REVERSAL';
  amount: SourceHashAmountInput;
  clientId: string;
  payableCaseId: string;
  payableCaseClientId: string;
  expenseCaseId: string;
  expenseRequestId: string | null;
  reversesOffsetId: string | null;
}

export type ClientOffsetSourceSnapshotRelationData = JournalSourceRelationData & {
  payableCaseClientId?: string;
  expenseRequestId?: string | null;
};

export interface ClientOffsetSourceSnapshot {
  identity: ClientOffsetSourceIdentity;
  tenantId: string;
  occurredAt: string | Date;
  effectiveDate: string | Date;
  actorId: string | null;
  currency: string;
  metadata: JournalMetadata;
  payload: ClientOffsetSourceSnapshotPayload;
  relationData?: ClientOffsetSourceSnapshotRelationData;
}

export function adaptClientOffsetSourceSnapshot(
  snapshot: ClientOffsetSourceSnapshot,
): JournalSourceAdapterResult<ClientOffsetJournalSource> {
  const errors = validateClientOffsetSnapshot(snapshot);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  try {
    const sourceAction = clientOffsetSourceAction(snapshot.payload.kind);
    const occurredAt = normalizeSourceHashDate(snapshot.occurredAt);
    const effectiveDate = normalizeSourceHashDate(snapshot.effectiveDate);
    const payload = clientOffsetJournalPayload(snapshot.payload);
    const sourceHash = createCanonicalSourceHash({
      tenantId: snapshot.identity.tenantId,
      sourceType: 'CLIENT_OFFSET',
      sourceId: snapshot.identity.sourceId,
      sourceAction,
      sourceVersion: snapshot.identity.sourceVersion,
      occurredAt,
      effectiveDate,
      actorId: snapshot.actorId,
      currency: snapshot.currency,
      payload,
    });

    return {
      ok: true,
      source: {
        tenantId: snapshot.identity.tenantId,
        sourceType: 'CLIENT_OFFSET',
        sourceId: snapshot.identity.sourceId,
        sourceAction,
        sourceVersion: snapshot.identity.sourceVersion,
        occurredAt,
        effectiveDate,
        actorId: snapshot.actorId,
        currency: snapshot.currency,
        sourceHash,
        metadata: snapshot.metadata,
        payload,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        createJournalSourceError('SOURCE_HASH_FAILED', 'ClientOffset sourceHash canonicalization failed.', {
          path: 'sourceHash',
          details: { message: error instanceof Error ? error.message : 'Unknown sourceHash error.' },
        }),
      ],
    };
  }
}

export const clientOffsetJournalSourceAdapter = {
  adapt: adaptClientOffsetSourceSnapshot,
};

function validateClientOffsetSnapshot(snapshot: ClientOffsetSourceSnapshot): JournalSourceError[] {
  const errors: JournalSourceError[] = [];
  const identityResult = validateJournalSourceIdentity(snapshot.identity);

  if (!identityResult.ok) {
    errors.push(...identityResult.errors);
  }

  if (snapshot.identity.sourceType !== 'CLIENT_OFFSET') {
    errors.push(
      createJournalSourceError('UNSUPPORTED_SOURCE_TYPE', 'ClientOffset adapter only supports CLIENT_OFFSET.', {
        path: 'identity.sourceType',
      }),
    );
  }

  if (!['apply', 'reversal'].includes(snapshot.identity.sourceAction)) {
    errors.push(
      createJournalSourceError('UNSUPPORTED_SOURCE_ACTION', 'ClientOffset adapter only supports apply/reversal.', {
        path: 'identity.sourceAction',
      }),
    );
  }

  if (typeof snapshot.identity.sourceVersion !== 'string') {
    errors.push(
      createJournalSourceError('SOURCE_VERSION_UNAVAILABLE', 'ClientOffset sourceVersion must be a string.', {
        path: 'identity.sourceVersion',
      }),
    );
  }

  if (snapshot.tenantId !== snapshot.identity.tenantId) {
    errors.push(
      createJournalSourceError('TENANT_MISMATCH', 'ClientOffset snapshot tenantId must match source identity tenantId.', {
        path: 'tenantId',
        details: { snapshotTenantId: snapshot.tenantId, identityTenantId: snapshot.identity.tenantId },
      }),
    );
  }

  const hasSupportedKind = snapshot.payload.kind === 'APPLY' || snapshot.payload.kind === 'REVERSAL';
  if (!hasSupportedKind) {
    errors.push(
      createJournalSourceError('UNSUPPORTED_SOURCE_ACTION', 'ClientOffset payload kind must be APPLY or REVERSAL.', {
        path: 'payload.kind',
        details: { kind: snapshot.payload.kind },
      }),
    );
  }

  const expectedAction = hasSupportedKind ? clientOffsetSourceAction(snapshot.payload.kind) : null;
  if (expectedAction && snapshot.identity.sourceAction !== expectedAction) {
    errors.push(
      createJournalSourceError('UNSUPPORTED_SOURCE_ACTION', 'ClientOffset kind and sourceAction must match.', {
        path: 'identity.sourceAction',
        details: { kind: snapshot.payload.kind, sourceAction: snapshot.identity.sourceAction },
      }),
    );
  }

  if (snapshot.payload.id !== snapshot.identity.sourceId) {
    errors.push(
      createJournalSourceError('INCOMPLETE_SOURCE_DIMENSIONS', 'ClientOffset payload id must match sourceId.', {
        path: 'payload.id',
        details: { payloadId: snapshot.payload.id, sourceId: snapshot.identity.sourceId },
      }),
    );
  }

  if (!snapshot.payload.clientId) {
    errors.push(missingDimension('payload.clientId'));
  }

  if (!snapshot.payload.payableCaseId) {
    errors.push(missingDimension('payload.payableCaseId'));
  }

  if (!snapshot.payload.payableCaseClientId) {
    errors.push(missingDimension('payload.payableCaseClientId'));
  }

  if (!snapshot.payload.expenseCaseId) {
    errors.push(missingDimension('payload.expenseCaseId'));
  }

  if (!snapshot.currency) {
    errors.push(missingDimension('currency'));
  }

  return errors;
}

function clientOffsetJournalPayload(payload: ClientOffsetSourceSnapshotPayload): ClientOffsetJournalSourcePayload {
  return {
    kind: payload.kind,
    amount: normalizeSourceHashAmount(payload.amount),
    clientId: payload.clientId,
    payableLeg: {
      caseId: payload.payableCaseId,
      caseClientId: payload.payableCaseClientId,
    },
    expenseLeg: {
      caseId: payload.expenseCaseId,
      caseClientId: null,
      expenseRequestId: payload.expenseRequestId,
    },
    reversesOffsetId: payload.reversesOffsetId,
  };
}

function clientOffsetSourceAction(kind: ClientOffsetSourceSnapshotPayload['kind']): ClientOffsetSourceAction {
  return kind === 'APPLY' ? 'apply' : 'reversal';
}

function missingDimension(path: string): JournalSourceError {
  return createJournalSourceError('INCOMPLETE_SOURCE_DIMENSIONS', 'ClientOffset source snapshot is incomplete.', {
    path,
  });
}