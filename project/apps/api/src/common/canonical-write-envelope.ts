import { randomUUID } from 'node:crypto';

export const CANONICAL_WRITE_ENVELOPE_VERSION = 1 as const;

export const CANONICAL_WRITE_ACTOR_TYPES = ['HUMAN', 'SYSTEM', 'EXTERNAL'] as const;
export type CanonicalWriteActorType = (typeof CANONICAL_WRITE_ACTOR_TYPES)[number];

export type CanonicalWriteActor =
  | Readonly<{ type: 'HUMAN'; userId: string }>
  | Readonly<{ type: 'SYSTEM'; system: string }>
  | Readonly<{ type: 'EXTERNAL'; externalSystem: string }>;

export interface CanonicalWriteTarget<TAggregateType extends string = string> {
  readonly aggregateType: TAggregateType;
  readonly aggregateId?: string;
}

export interface CanonicalWriteSource {
  readonly sourceType: string;
  readonly sourceId?: string;
  readonly evidenceRefs: readonly string[];
}

export interface CanonicalWriteAuthority {
  readonly policyRef?: string;
  readonly legalBasisRef?: string;
  readonly approvalRequestId?: string;
}

/**
 * Canonical mutation metadata. It is deliberately separate from a command payload:
 * payload validation belongs to the aggregate command boundary, while this envelope
 * carries only authority, tenant, provenance, timing and correlation facts.
 */
export interface CanonicalWriteEnvelopeV1<TAggregateType extends string = string> {
  readonly version: typeof CANONICAL_WRITE_ENVELOPE_VERSION;
  readonly tenantId: string;
  readonly caseId: string;
  readonly target: Readonly<CanonicalWriteTarget<TAggregateType>>;
  readonly actor: CanonicalWriteActor;
  readonly commandId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly idempotencyKey: string;
  readonly expectedVersion?: number;
  readonly occurredAt: string;
  readonly effectiveAt: string;
  readonly source: Readonly<CanonicalWriteSource>;
  readonly authority: Readonly<CanonicalWriteAuthority>;
  readonly currency?: string;
}

export interface BuildCanonicalWriteEnvelopeV1Input<TAggregateType extends string = string> {
  readonly tenantId: string;
  readonly caseId: string;
  readonly target: CanonicalWriteTarget<TAggregateType>;
  readonly actor: CanonicalWriteActor;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly idempotencyKey: string;
  readonly expectedVersion?: number;
  readonly occurredAt: string;
  readonly effectiveAt: string;
  readonly source: CanonicalWriteSource;
  readonly authority: CanonicalWriteAuthority;
  readonly currency?: string;
}

export class CanonicalWriteEnvelopeValidationError extends TypeError {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`CanonicalWriteEnvelope v1: ${field} ${message}`);
    this.name = 'CanonicalWriteEnvelopeValidationError';
  }
}

const TOP_LEVEL_INPUT_KEYS = new Set([
  'tenantId',
  'caseId',
  'target',
  'actor',
  'correlationId',
  'causationId',
  'idempotencyKey',
  'expectedVersion',
  'occurredAt',
  'effectiveAt',
  'source',
  'authority',
  'currency',
]);
const TARGET_KEYS = new Set(['aggregateType', 'aggregateId']);
const SOURCE_KEYS = new Set(['sourceType', 'sourceId', 'evidenceRefs']);
const AUTHORITY_KEYS = new Set(['policyRef', 'legalBasisRef', 'approvalRequestId']);
const ACTOR_KEYS: Record<CanonicalWriteActorType, ReadonlySet<string>> = {
  HUMAN: new Set(['type', 'userId']),
  SYSTEM: new Set(['type', 'system']),
  EXTERNAL: new Set(['type', 'externalSystem']),
};

const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const MAX_EVIDENCE_REFS = 32;

/**
 * Builds the immutable v1 envelope at the server command boundary.
 *
 * `commandId` is intentionally not accepted from the caller: every invocation creates
 * a new server UUID. `correlationId` and `idempotencyKey` remain caller-context inputs
 * with distinct lifecycle semantics.
 *
 * This builder performs structural validation only. It does not resolve a tenant,
 * authorize an actor, load a case, approve a mutation, persist data or emit an event.
 */
export function buildCanonicalWriteEnvelopeV1<TAggregateType extends string>(
  input: BuildCanonicalWriteEnvelopeV1Input<TAggregateType>,
): CanonicalWriteEnvelopeV1<TAggregateType> {
  assertRecord(input, 'input');
  assertExactKeys(input, TOP_LEVEL_INPUT_KEYS, 'input');
  assertRecord(input.target, 'target');
  assertExactKeys(input.target, TARGET_KEYS, 'target');
  assertRecord(input.actor, 'actor');
  assertRecord(input.source, 'source');
  assertExactKeys(input.source, SOURCE_KEYS, 'source');
  assertRecord(input.authority, 'authority');
  assertExactKeys(input.authority, AUTHORITY_KEYS, 'authority');

  assertOpaqueReference(input.tenantId, 'tenantId');
  assertOpaqueReference(input.caseId, 'caseId');
  assertOpaqueReference(input.target.aggregateType, 'target.aggregateType');
  if (input.target.aggregateId !== undefined) {
    assertOpaqueReference(input.target.aggregateId, 'target.aggregateId');
  }

  const actor = copyActor(input.actor);
  assertOpaqueReference(input.correlationId, 'correlationId');
  assertOpaqueReference(input.idempotencyKey, 'idempotencyKey');
  if (input.causationId !== undefined) assertOpaqueReference(input.causationId, 'causationId');

  if (
    input.expectedVersion !== undefined &&
    (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
  ) {
    fail('expectedVersion', 'must be a non-negative safe integer');
  }

  assertIsoTimestamp(input.occurredAt, 'occurredAt');
  assertIsoTimestamp(input.effectiveAt, 'effectiveAt');

  assertOpaqueReference(input.source.sourceType, 'source.sourceType');
  if (input.source.sourceId !== undefined) assertOpaqueReference(input.source.sourceId, 'source.sourceId');
  if (!Array.isArray(input.source.evidenceRefs)) fail('source.evidenceRefs', 'must be an array');
  if (input.source.evidenceRefs.length > MAX_EVIDENCE_REFS) {
    fail('source.evidenceRefs', `must contain at most ${MAX_EVIDENCE_REFS} references`);
  }
  input.source.evidenceRefs.forEach((reference, index) =>
    assertOpaqueReference(reference, `source.evidenceRefs[${index}]`),
  );
  if (new Set(input.source.evidenceRefs).size !== input.source.evidenceRefs.length) {
    fail('source.evidenceRefs', 'must not contain duplicates');
  }

  if (input.authority.policyRef !== undefined) {
    assertOpaqueReference(input.authority.policyRef, 'authority.policyRef');
  }
  if (input.authority.legalBasisRef !== undefined) {
    assertOpaqueReference(input.authority.legalBasisRef, 'authority.legalBasisRef');
  }
  if (input.authority.approvalRequestId !== undefined) {
    assertOpaqueReference(input.authority.approvalRequestId, 'authority.approvalRequestId');
  }
  if (input.authority.policyRef === undefined && input.authority.legalBasisRef === undefined) {
    fail('authority', 'must contain policyRef or legalBasisRef');
  }

  if (input.currency !== undefined && !ISO_CURRENCY.test(input.currency)) {
    fail('currency', 'must be an uppercase three-letter currency code');
  }

  const commandId = randomUUID();
  if (commandId === input.correlationId || commandId === input.idempotencyKey) {
    fail('commandId', 'must be distinct from correlationId and idempotencyKey');
  }
  if (input.correlationId === input.idempotencyKey) {
    fail('correlationId', 'must be distinct from idempotencyKey');
  }

  const target = Object.freeze({
    aggregateType: input.target.aggregateType,
    ...(input.target.aggregateId === undefined ? {} : { aggregateId: input.target.aggregateId }),
  }) as Readonly<CanonicalWriteTarget<TAggregateType>>;
  const source = Object.freeze({
    sourceType: input.source.sourceType,
    ...(input.source.sourceId === undefined ? {} : { sourceId: input.source.sourceId }),
    evidenceRefs: Object.freeze([...input.source.evidenceRefs]),
  });
  const authority = Object.freeze({
    ...(input.authority.policyRef === undefined ? {} : { policyRef: input.authority.policyRef }),
    ...(input.authority.legalBasisRef === undefined ? {} : { legalBasisRef: input.authority.legalBasisRef }),
    ...(input.authority.approvalRequestId === undefined
      ? {}
      : { approvalRequestId: input.authority.approvalRequestId }),
  });

  return Object.freeze({
    version: CANONICAL_WRITE_ENVELOPE_VERSION,
    tenantId: input.tenantId,
    caseId: input.caseId,
    target,
    actor,
    commandId,
    correlationId: input.correlationId,
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    idempotencyKey: input.idempotencyKey,
    ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
    occurredAt: input.occurredAt,
    effectiveAt: input.effectiveAt,
    source,
    authority,
    ...(input.currency === undefined ? {} : { currency: input.currency }),
  });
}

function copyActor(actor: CanonicalWriteActor): CanonicalWriteActor {
  if (!CANONICAL_WRITE_ACTOR_TYPES.includes(actor.type as CanonicalWriteActorType)) {
    fail('actor.type', 'must be HUMAN, SYSTEM or EXTERNAL');
  }

  assertExactKeys(actor, ACTOR_KEYS[actor.type], 'actor');
  switch (actor.type) {
    case 'HUMAN':
      assertOpaqueReference(actor.userId, 'actor.userId');
      return Object.freeze({ type: actor.type, userId: actor.userId });
    case 'SYSTEM':
      assertOpaqueReference(actor.system, 'actor.system');
      return Object.freeze({ type: actor.type, system: actor.system });
    case 'EXTERNAL':
      assertOpaqueReference(actor.externalSystem, 'actor.externalSystem');
      return Object.freeze({ type: actor.type, externalSystem: actor.externalSystem });
  }
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field, 'must be an object');
}

function assertExactKeys(value: object, allowed: ReadonlySet<string>, field: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) fail(field, `contains non-allowlisted field(s): ${unexpected.join(', ')}`);
}

function assertOpaqueReference(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !OPAQUE_REFERENCE.test(value)) {
    fail(field, 'must be a non-empty opaque reference');
  }
}

function assertIsoTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') fail(field, 'must be an ISO-8601 timestamp');
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    fail(field, 'must be a normalized ISO-8601 timestamp');
  }
}

function fail(field: string, message: string): never {
  throw new CanonicalWriteEnvelopeValidationError(field, message);
}
