import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_WRITE_ENVELOPE_VERSION,
  CanonicalWriteEnvelopeValidationError,
  buildCanonicalWriteEnvelopeV1,
  type BuildCanonicalWriteEnvelopeV1Input,
} from '../../../common/canonical-write-envelope';
import {
  buildClaimItemWriteCommand,
  type BuildClaimItemWriteCommandInput,
} from '../claim-item-write-command';

const occurredAt = '2026-07-14T10:00:00.000Z';

function envelopeInput(
  overrides: Partial<BuildCanonicalWriteEnvelopeV1Input<'ClaimItem'>> = {},
): BuildCanonicalWriteEnvelopeV1Input<'ClaimItem'> {
  return {
    tenantId: 'tenant-1',
    caseId: 'case-1',
    target: { aggregateType: 'ClaimItem', aggregateId: 'claim-1' },
    actor: { type: 'HUMAN', userId: 'user-1' },
    correlationId: 'request:01J2RCV9Z8',
    idempotencyKey: 'claim-item:update:claim-1:v3',
    expectedVersion: 3,
    occurredAt,
    effectiveAt: occurredAt,
    source: {
      sourceType: 'USER_COMMAND',
      sourceId: 'request:01J2RCV9Z8',
      evidenceRefs: ['approval:approval-1'],
    },
    authority: {
      legalBasisRef: 'REC-AUTH-002',
      policyRef: 'CLAIM_ITEM_WRITE_POLICY_V1',
      approvalRequestId: 'approval-1',
    },
    currency: 'TRY',
    ...overrides,
  };
}

function claimCommandInput(
  overrides: Partial<BuildClaimItemWriteCommandInput<Record<string, unknown>>> = {},
): BuildClaimItemWriteCommandInput<Record<string, unknown>> {
  const envelope = { ...envelopeInput() } as Partial<BuildCanonicalWriteEnvelopeV1Input<'ClaimItem'>>;
  delete envelope.target;
  return {
    operation: 'UPDATE',
    claimItemId: 'claim-1',
    envelope: envelope as BuildClaimItemWriteCommandInput<Record<string, unknown>>['envelope'],
    payload: { demandedAmount: '1250.00' },
    ...overrides,
  };
}

describe('CanonicalWriteEnvelope v1', () => {
  it('produces an exact immutable envelope with server-owned commandId', () => {
    const envelope = buildCanonicalWriteEnvelopeV1(envelopeInput());

    expect(Object.keys(envelope).sort()).toEqual([
      'actor',
      'authority',
      'caseId',
      'commandId',
      'correlationId',
      'currency',
      'effectiveAt',
      'expectedVersion',
      'idempotencyKey',
      'occurredAt',
      'source',
      'target',
      'tenantId',
      'version',
    ].sort());
    expect(envelope.version).toBe(CANONICAL_WRITE_ENVELOPE_VERSION);
    expect(envelope.commandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(envelope.commandId).not.toBe(envelope.correlationId);
    expect(envelope.commandId).not.toBe(envelope.idempotencyKey);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.actor)).toBe(true);
    expect(Object.isFrozen(envelope.target)).toBe(true);
    expect(Object.isFrozen(envelope.source)).toBe(true);
    expect(Object.isFrozen(envelope.source.evidenceRefs)).toBe(true);
    expect(Object.isFrozen(envelope.authority)).toBe(true);
  });

  it('keeps correlation and idempotency stable across retry while creating a new commandId per attempt', () => {
    const first = buildCanonicalWriteEnvelopeV1(envelopeInput());
    const retry = buildCanonicalWriteEnvelopeV1(envelopeInput());

    expect(retry.correlationId).toBe(first.correlationId);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry.commandId).not.toBe(first.commandId);
  });

  it.each([
    [{ type: 'HUMAN', userId: 'user-1' }, { type: 'HUMAN', userId: 'user-1' }],
    [{ type: 'SYSTEM', system: 'DUE_BRIDGE' }, { type: 'SYSTEM', system: 'DUE_BRIDGE' }],
    [{ type: 'EXTERNAL', externalSystem: 'UYAP' }, { type: 'EXTERNAL', externalSystem: 'UYAP' }],
  ] as const)('accepts the discriminated %s actor contract', (actor, expected) => {
    expect(buildCanonicalWriteEnvelopeV1(envelopeInput({ actor })).actor).toEqual(expected);
  });

  it.each([
    ['tenantId', { tenantId: ' tenant-1' }],
    ['currency', { currency: 'try' }],
    ['expectedVersion', { expectedVersion: -1 }],
    ['occurredAt', { occurredAt: '2026-07-14' }],
    ['correlationId', { correlationId: 'same', idempotencyKey: 'same' }],
    ['source.evidenceRefs', { source: { sourceType: 'USER_COMMAND', evidenceRefs: ['evidence-1', 'evidence-1'] } }],
    ['authority', { authority: {} }],
  ])('rejects invalid %s data fail-closed', (field, override) => {
    expect(() => buildCanonicalWriteEnvelopeV1(envelopeInput(override as any))).toThrow(
      CanonicalWriteEnvelopeValidationError,
    );
  });

  it('rejects non-allowlisted envelope and actor fields', () => {
    expect(() =>
      buildCanonicalWriteEnvelopeV1({
        ...envelopeInput(),
        rawDto: { description: 'must not leak into envelope' },
      } as any),
    ).toThrow(/non-allowlisted field/);

    expect(() =>
      buildCanonicalWriteEnvelopeV1(
        envelopeInput({ actor: { type: 'HUMAN', userId: 'user-1', email: 'user@example.com' } as any }),
      ),
    ).toThrow(/non-allowlisted field/);
  });
});

describe('ClaimItem canonical command boundary', () => {
  it('fixes aggregate type, preserves the operation and freezes the payload shell', () => {
    const command = buildClaimItemWriteCommand(claimCommandInput());

    expect(command.operation).toBe('UPDATE');
    expect(command.envelope.target).toEqual({ aggregateType: 'ClaimItem', aggregateId: 'claim-1' });
    expect(command.payload).toEqual({ demandedAmount: '1250.00' });
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.payload)).toBe(true);
  });

  it('allows CREATE without a preallocated id but requires id for UPDATE and CANCEL', () => {
    expect(
      buildClaimItemWriteCommand(claimCommandInput({ operation: 'CREATE', claimItemId: undefined }))
        .envelope.target,
    ).toEqual({ aggregateType: 'ClaimItem' });

    expect(() =>
      buildClaimItemWriteCommand(claimCommandInput({ operation: 'UPDATE', claimItemId: undefined })),
    ).toThrow('UPDATE requires claimItemId');
    expect(() =>
      buildClaimItemWriteCommand(claimCommandInput({ operation: 'CANCEL', claimItemId: undefined })),
    ).toThrow('CANCEL requires claimItemId');
  });

  it('is substrate-only and has no persistence, authorization, audit, event or Nest side effect', () => {
    const envelopeSource = readFileSync(
      resolve(__dirname, '..', '..', '..', 'common', 'canonical-write-envelope.ts'),
      'utf8',
    );
    const commandSource = readFileSync(resolve(__dirname, '..', 'claim-item-write-command.ts'), 'utf8');
    const combined = `${envelopeSource}\n${commandSource}`;

    expect(combined).not.toMatch(/Prisma|AuditService|OfficeApproval|@Injectable|@Controller/);
    expect(combined).not.toMatch(/\.create\(|\.update\(|\.upsert\(|\.delete\(|\$transaction/);
    expect(combined).not.toMatch(/DomainEvent|appendInTransaction|emit\(/);
  });
});
