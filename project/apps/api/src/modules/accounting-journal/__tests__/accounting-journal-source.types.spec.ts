import { readFileSync } from 'fs';
import { join } from 'path';

import type {
  ClientOffsetJournalSource,
  ClientOffsetJournalSourcePayload,
  JournalSource,
} from '../accounting-journal.types';
import {
  createJournalSourceError,
  isJournalSourceErrorCode,
  JOURNAL_SOURCE_ERROR_CODES,
  type JournalSourceAdapter,
  type JournalSourceErrorCode,
  type JournalSourceIdentity,
  type JournalSourceLoader,
  type JournalSourceSnapshot,
  validateJournalSourceIdentity,
} from '../accounting-journal-source.types';

function sourceIdentity(overrides: Partial<JournalSourceIdentity> = {}): JournalSourceIdentity {
  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: overrides.sourceType ?? 'CLIENT_OFFSET',
    sourceId: overrides.sourceId ?? 'offset-1',
    sourceAction: overrides.sourceAction ?? 'apply',
    sourceVersion: overrides.sourceVersion ?? '1',
  };
}

function clientOffsetPayload(): ClientOffsetJournalSourcePayload {
  return {
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
}

function sourceSnapshot(
  overrides: Partial<JournalSourceSnapshot<ClientOffsetJournalSourcePayload>> = {},
): JournalSourceSnapshot<ClientOffsetJournalSourcePayload> {
  const identity = sourceIdentity();

  return {
    identity,
    tenantId: overrides.tenantId ?? identity.tenantId,
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'source-hash-1',
    metadata: overrides.metadata ?? { sourceName: 'client-offset-test' },
    payload: overrides.payload ?? clientOffsetPayload(),
    relationData: overrides.relationData ?? {
      payableCaseClientId: 'case-client-payable',
      expenseRequestId: 'expense-request-1',
    },
  };
}

describe('Accounting journal source adapter contracts', () => {
  it('source identity contract: requires tenantId, sourceType, sourceId, sourceAction and sourceVersion', () => {
    expect(validateJournalSourceIdentity(sourceIdentity()).ok).toBe(true);

    const missingCases: Array<[keyof JournalSourceIdentity, JournalSourceErrorCode]> = [
      ['tenantId', 'TENANT_MISMATCH'],
      ['sourceType', 'UNSUPPORTED_SOURCE_TYPE'],
      ['sourceId', 'INCOMPLETE_SOURCE_DIMENSIONS'],
      ['sourceAction', 'UNSUPPORTED_SOURCE_ACTION'],
      ['sourceVersion', 'SOURCE_VERSION_UNAVAILABLE'],
    ];

    for (const [field, expectedCode] of missingCases) {
      const candidate = { ...sourceIdentity(), [field]: '' } as Partial<JournalSourceIdentity>;
      const result = validateJournalSourceIdentity(candidate);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`Expected missing ${field} to fail.`);
      expect(result.errors.map((error) => error.code)).toContain(expectedCode);
    }
  });


  it('source identity contract: accepts ExpenseRequest recorded and cancel skeleton actions', () => {
    expect(validateJournalSourceIdentity(sourceIdentity({ sourceType: 'EXPENSE_REQUEST', sourceAction: 'recorded' })).ok).toBe(true);
    expect(validateJournalSourceIdentity(sourceIdentity({ sourceType: 'EXPENSE_REQUEST', sourceAction: 'cancel' })).ok).toBe(true);
  });

  it('source identity contract: accepts ExpensePayment recorded skeleton action', () => {
    expect(validateJournalSourceIdentity(sourceIdentity({ sourceType: 'EXPENSE_PAYMENT', sourceAction: 'recorded' })).ok).toBe(true);
  });

  it('source identity contract: accepts expense application apply and reversal skeleton actions', () => {
    expect(validateJournalSourceIdentity(sourceIdentity({ sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply' })).ok).toBe(true);
    expect(validateJournalSourceIdentity(sourceIdentity({ sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'reversal' })).ok).toBe(true);
  });

  it('source identity contract: accepts generic journal reversal and manual-adjustment actions', () => {
    expect(validateJournalSourceIdentity(sourceIdentity({ sourceType: 'ACCOUNTING_JOURNAL_ENTRY', sourceAction: 'reversal' })).ok).toBe(true);
    expect(validateJournalSourceIdentity(sourceIdentity({ sourceType: 'ACCOUNTING_JOURNAL_ENTRY', sourceAction: 'manual-adjustment' })).ok).toBe(true);
  });
  it('source loader contract: request shape is tenant-scoped and async without implementation coupling', async () => {
    const identity = sourceIdentity({ tenantId: 'tenant-scoped' });
    const loader: JournalSourceLoader = {
      async load(request) {
        expect(request.tenantId).toBe('tenant-scoped');
        expect(request.identity.tenantId).toBe('tenant-scoped');

        return {
          ok: false,
          errors: [createJournalSourceError('SOURCE_NOT_FOUND', 'Source was not loaded.')],
        };
      },
    };

    const result = await loader.load({ tenantId: identity.tenantId, identity });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected source loader contract test to return an error.');
    expect(result.errors[0]).toEqual(
      expect.objectContaining({
        code: 'SOURCE_NOT_FOUND',
        authorizationFailure: false,
      }),
    );
  });

  it('source adapter contract: converts loaded immutable snapshot to JournalSource without DB dependency', () => {
    const adapter: JournalSourceAdapter<
      JournalSourceSnapshot<ClientOffsetJournalSourcePayload>,
      ClientOffsetJournalSource
    > = {
      adapt(snapshot) {
        return {
          ok: true,
          source: {
            tenantId: snapshot.identity.tenantId,
            sourceType: 'CLIENT_OFFSET',
            sourceId: snapshot.identity.sourceId,
            sourceVersion: snapshot.identity.sourceVersion,
            sourceAction: 'apply',
            occurredAt: snapshot.occurredAt,
            effectiveDate: snapshot.effectiveDate,
            actorId: snapshot.actorId,
            currency: snapshot.currency,
            sourceHash: snapshot.sourceHash,
            metadata: snapshot.metadata,
            payload: snapshot.payload,
          },
        };
      },
    };

    const result = adapter.adapt(sourceSnapshot());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected adapter contract to return JournalSource.');

    const source: JournalSource = result.source;
    expect(source).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        sourceType: 'CLIENT_OFFSET',
        sourceId: 'offset-1',
        sourceAction: 'apply',
        sourceVersion: '1',
      }),
    );
  });

  it('source adapter error taxonomy: remains exhaustive and stable', () => {
    const expected: JournalSourceErrorCode[] = [
      'SOURCE_NOT_FOUND',
      'SOURCE_NOT_FINAL',
      'TENANT_MISMATCH',
      'UNSUPPORTED_SOURCE_ACTION',
      'SOURCE_VERSION_UNAVAILABLE',
      'SOURCE_HASH_FAILED',
      'INCOMPLETE_SOURCE_DIMENSIONS',
      'UNSUPPORTED_SOURCE_TYPE',
      'NON_JOURNALABLE_SOURCE',
    ];

    expect(JOURNAL_SOURCE_ERROR_CODES).toEqual(expected);
    expect(JOURNAL_SOURCE_ERROR_CODES.every(isJournalSourceErrorCode)).toBe(true);
    expect(isJournalSourceErrorCode('AUTHORIZATION_FAILED')).toBe(false);
  });

  it('source adapter errors: do not imply authorization failure or grant business permission', () => {
    for (const code of JOURNAL_SOURCE_ERROR_CODES) {
      expect(createJournalSourceError(code, 'Contract error.')).toEqual(
        expect.objectContaining({
          code,
          authorizationFailure: false,
        }),
      );
    }
  });

  it('source adapter boundary: has no runtime writer, Prisma or repository dependency', () => {
    const sourceFile = readFileSync(join(__dirname, '..', 'accounting-journal-source.types.ts'), 'utf8');

    expect(sourceFile).not.toMatch(/JournalWriter|accounting-journal\.writer|PrismaService|@prisma\/client/);
    expect(sourceFile).not.toMatch(/from ['"].*(repository|service|writer)/);
  });
});
