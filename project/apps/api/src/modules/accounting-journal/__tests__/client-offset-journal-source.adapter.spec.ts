import { readFileSync } from 'fs';
import { join } from 'path';

import {
  adaptClientOffsetSourceSnapshot,
  type ClientOffsetSourceIdentity,
  type ClientOffsetSourceSnapshot,
  type ClientOffsetSourceSnapshotPayload,
} from '../client-offset-journal-source.adapter';
import {
  canonicalSourceHashJson,
  createCanonicalSourceHash,
} from '../accounting-journal-source-hash';

interface SnapshotOverrides extends Partial<Omit<ClientOffsetSourceSnapshot, 'identity' | 'payload'>> {
  identity?: Partial<ClientOffsetSourceIdentity>;
  payload?: Partial<ClientOffsetSourceSnapshotPayload>;
}

function offsetSnapshot(overrides: SnapshotOverrides = {}): ClientOffsetSourceSnapshot {
  const payloadOverrides = overrides.payload ?? {};
  const hasPayloadField = (field: keyof ClientOffsetSourceSnapshotPayload) =>
    Object.prototype.hasOwnProperty.call(payloadOverrides, field);
  const payload: ClientOffsetSourceSnapshotPayload = {
    id: payloadOverrides.id ?? overrides.identity?.sourceId ?? 'offset-1',
    kind: payloadOverrides.kind ?? 'APPLY',
    amount: payloadOverrides.amount ?? '100.00',
    clientId: payloadOverrides.clientId ?? 'client-1',
    payableCaseId: payloadOverrides.payableCaseId ?? 'case-payable',
    payableCaseClientId: payloadOverrides.payableCaseClientId ?? 'case-client-payable',
    expenseCaseId: payloadOverrides.expenseCaseId ?? 'case-expense',
    expenseRequestId: hasPayloadField('expenseRequestId') ? payloadOverrides.expenseRequestId ?? null : 'expense-request-1',
    reversesOffsetId: hasPayloadField('reversesOffsetId') ? payloadOverrides.reversesOffsetId ?? null : null,
  };
  const sourceAction = overrides.identity?.sourceAction ?? (payload.kind === 'APPLY' ? 'apply' : 'reversal');

  return {
    identity: {
      tenantId: overrides.identity?.tenantId ?? 'tenant-1',
      sourceType: overrides.identity?.sourceType ?? 'CLIENT_OFFSET',
      sourceId: overrides.identity?.sourceId ?? payload.id,
      sourceAction,
      sourceVersion: overrides.identity?.sourceVersion ?? '1',
    },
    tenantId: overrides.tenantId ?? overrides.identity?.tenantId ?? 'tenant-1',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    metadata: overrides.metadata ?? { sourceName: 'client-offset-test', authoritativeCode: 'offset-contract' },
    payload,
    relationData: overrides.relationData ?? {
      payableCaseClientId: 'case-client-payable',
      expenseRequestId: 'expense-request-1',
    },
  };
}

function expectClientOffsetSource(overrides: SnapshotOverrides = {}) {
  const result = adaptClientOffsetSourceSnapshot(offsetSnapshot(overrides));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.source;
}

describe('ClientOffset journal source adapter', () => {
  it('sourceHash rule: canonical JSON and hash are deterministic despite object key order', () => {
    const first = {
      b: 'two',
      a: { z: null, amount: '00100.0' },
    };
    const second = {
      a: { amount: '100.00', z: null },
      b: 'two',
    };

    expect(canonicalSourceHashJson(first)).toBe('{"a":{"amount":"100.00","z":null},"b":"two"}');
    expect(canonicalSourceHashJson(first)).toBe(canonicalSourceHashJson(second));
    expect(createCanonicalSourceHash(first)).toBe(createCanonicalSourceHash(second));
  });

  it('sourceHash rule: Date values normalize to ISO strings', () => {
    const iso = '2026-06-30T08:00:00.000Z';

    expect(canonicalSourceHashJson({ occurredAt: new Date(iso) })).toBe(
      canonicalSourceHashJson({ occurredAt: iso }),
    );
    expect(createCanonicalSourceHash({ occurredAt: new Date(iso) })).toBe(
      createCanonicalSourceHash({ occurredAt: iso }),
    );
  });

  it('sourceHash rule: Decimal-like, numeric and string amounts normalize to 2-scale strings', () => {
    const decimalLike = { toString: () => '0100.500' };

    expect(canonicalSourceHashJson({ amount: '100.5' })).toBe('{"amount":"100.50"}');
    expect(createCanonicalSourceHash({ amount: '100.5' })).toBe(createCanonicalSourceHash({ amount: 100.5 }));
    expect(createCanonicalSourceHash({ amount: '100.50' })).toBe(createCanonicalSourceHash({ amount: decimalLike }));
  });

  it('sourceHash rule: nulls are explicit and non-authoritative metadata is excluded', () => {
    const first = {
      metadata: { sourceName: 'view label', displayName: 'Ayse', authoritativeCode: 'A1' },
      payload: { amount: '10', expenseRequestId: null },
    };
    const second = {
      payload: { expenseRequestId: null, amount: '10.00' },
      metadata: { sourceName: 'changed label', displayName: 'Changed', authoritativeCode: 'A1' },
    };

    const json = canonicalSourceHashJson(first);

    expect(json).toContain('"expenseRequestId":null');
    expect(json).toContain('"authoritativeCode":"A1"');
    expect(json).not.toContain('sourceName');
    expect(json).not.toContain('displayName');
    expect(createCanonicalSourceHash(first)).toBe(createCanonicalSourceHash(second));
  });

  it('ClientOffset APPLY adapter rule: maps immutable snapshot to JournalSource with payable caseClientId and null expense caseClientId', () => {
    const source = expectClientOffsetSource({
      occurredAt: new Date('2026-06-30T08:00:00.000Z'),
      payload: {
        id: 'offset-apply-1',
        kind: 'APPLY',
        amount: '125.5',
        payableCaseId: 'case-payable-apply',
        payableCaseClientId: 'cc-payable-apply',
        expenseCaseId: 'case-expense-apply',
        expenseRequestId: 'expense-apply',
      },
    });

    expect(source).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        sourceType: 'CLIENT_OFFSET',
        sourceId: 'offset-apply-1',
        sourceAction: 'apply',
        sourceVersion: '1',
        occurredAt: '2026-06-30T08:00:00.000Z',
        effectiveDate: '2026-06-30',
        actorId: 'user-1',
        currency: 'TRY',
      }),
    );
    expect(source.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(source.payload).toEqual({
      kind: 'APPLY',
      amount: '125.50',
      clientId: 'client-1',
      payableLeg: { caseId: 'case-payable-apply', caseClientId: 'cc-payable-apply' },
      expenseLeg: { caseId: 'case-expense-apply', caseClientId: null, expenseRequestId: 'expense-apply' },
      reversesOffsetId: null,
    });
  });

  it('ClientOffset REVERSAL adapter rule: maps immutable snapshot to reversal JournalSource without synthetic expense caseClientId', () => {
    const source = expectClientOffsetSource({
      identity: { sourceId: 'offset-reversal-1', sourceAction: 'reversal', sourceVersion: '2' },
      payload: {
        id: 'offset-reversal-1',
        kind: 'REVERSAL',
        amount: { toString: () => '20' },
        payableCaseId: 'case-payable-reversal',
        payableCaseClientId: 'cc-payable-reversal',
        expenseCaseId: 'case-expense-reversal',
        expenseRequestId: null,
        reversesOffsetId: 'offset-apply-1',
      },
    });

    expect(source.sourceAction).toBe('reversal');
    expect(source.sourceVersion).toBe('2');
    expect(source.payload).toEqual({
      kind: 'REVERSAL',
      amount: '20.00',
      clientId: 'client-1',
      payableLeg: { caseId: 'case-payable-reversal', caseClientId: 'cc-payable-reversal' },
      expenseLeg: { caseId: 'case-expense-reversal', caseClientId: null, expenseRequestId: null },
      reversesOffsetId: 'offset-apply-1',
    });
  });

  it('ClientOffset adapter rule: missing sourceVersion fails before JournalSource creation', () => {
    const result = adaptClientOffsetSourceSnapshot(
      offsetSnapshot({ identity: { sourceVersion: '' } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected missing sourceVersion to fail.');
    expect(result.errors.map((error) => error.code)).toContain('SOURCE_VERSION_UNAVAILABLE');
  });

  it('ClientOffset adapter rule: tenant mismatch and incomplete dimensions return source adapter errors', () => {
    const tenantResult = adaptClientOffsetSourceSnapshot(offsetSnapshot({ tenantId: 'tenant-other' }));
    expect(tenantResult.ok).toBe(false);
    if (tenantResult.ok) throw new Error('Expected tenant mismatch to fail.');
    expect(tenantResult.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TENANT_MISMATCH', path: 'tenantId' })]),
    );

    const dimensionResult = adaptClientOffsetSourceSnapshot(
      offsetSnapshot({ payload: { payableCaseClientId: '' } }),
    );
    expect(dimensionResult.ok).toBe(false);
    if (dimensionResult.ok) throw new Error('Expected incomplete dimension to fail.');
    expect(dimensionResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INCOMPLETE_SOURCE_DIMENSIONS', path: 'payload.payableCaseClientId' }),
      ]),
    );
  });

  it('ClientOffset adapter boundary: imports no writer, runtime DB, Prisma, service or repository dependency', () => {
    const adapterFile = readFileSync(join(__dirname, '..', 'client-offset-journal-source.adapter.ts'), 'utf8');
    const hashFile = readFileSync(join(__dirname, '..', 'accounting-journal-source-hash.ts'), 'utf8');
    const combined = `${adapterFile}\n${hashFile}`;

    expect(combined).not.toMatch(/JournalWriter|accounting-journal\.writer|PrismaService|@prisma\/client/);
    expect(combined).not.toMatch(/from ['"].*(repository|service|writer)/);
  });
});