import { BadRequestException } from '@nestjs/common';
import { resolveCanonicalCollectionReceiptCommand } from '../collection-receipt-command';
import { CollectionSource, CollectionType } from '../dto/collection.dto';

const trace = {
  correlationId: 'corr-1',
  commandId: 'cmd-1',
  causationId: 'bank-transaction:tx-1',
} as const;

const dto = {
  caseId: ' case-1 ',
  idempotencyKey: ' bank-transaction:tx-1 ',
  amount: 100,
  currency: ' try ',
  type: CollectionType.BANK_TRANSFER,
  date: '2026-07-01',
  sourceType: CollectionSource.BANK_INTEGRATION,
  sourceId: ' tx-1 ',
};

function resolve(overrides: Record<string, unknown> = {}) {
  return resolveCanonicalCollectionReceiptCommand({
    tenantId: ' tenant-1 ',
    dto: { ...dto, ...(overrides.dto as object) } as any,
    userId: 'user-1',
    requestContext: {
      producer: 'BANK_TRANSACTION_MATCH',
      actor: { type: 'HUMAN', userId: 'user-1' },
      ...(overrides.requestContext as object),
    },
    trace: (overrides.trace as any) ?? trace,
  });
}

describe('Canonical Collection receipt command', () => {
  it('tenant/case/source/currency/date alanlarını deterministik normalize eder', () => {
    const command = resolve();

    expect(command).toMatchObject({
      tenantId: 'tenant-1',
      producer: 'BANK_TRANSACTION_MATCH',
      actor: { type: 'HUMAN', userId: 'user-1' },
      sourceIdentity: { type: 'BANK_INTEGRATION', id: 'tx-1' },
      dto: {
        caseId: 'case-1',
        idempotencyKey: 'bank-transaction:tx-1',
        currency: 'TRY',
        date: '2026-07-01T00:00:00.000Z',
        sourceId: 'tx-1',
      },
    });
  });

  it('external source identity eksikse fail-closed kalır', () => {
    expect(() => resolve({ dto: { sourceId: undefined } })).toThrow(BadRequestException);
  });

  it('bank/external producer causation taşımıyorsa fail-closed kalır', () => {
    expect(() => resolve({ trace: { correlationId: 'corr-1', commandId: 'cmd-1' } }))
      .toThrow(BadRequestException);
  });

  it('tanımsız HUMAN actor fail-closed kalır', () => {
    expect(() => resolve({ requestContext: { actor: { type: 'HUMAN' } } }))
      .toThrow(BadRequestException);
  });
});
