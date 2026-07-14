import {
  buildCanonicalWriteEnvelopeV1,
  type BuildCanonicalWriteEnvelopeV1Input,
  type CanonicalWriteEnvelopeV1,
} from '../../common/canonical-write-envelope';

export const CLAIM_ITEM_CANONICAL_AGGREGATE_TYPE = 'ClaimItem' as const;
export const CLAIM_ITEM_WRITE_OPERATIONS = ['CREATE', 'UPDATE', 'CANCEL'] as const;
export type ClaimItemWriteOperation = (typeof CLAIM_ITEM_WRITE_OPERATIONS)[number];

export type ClaimItemWriteEnvelopeInput = Omit<
  BuildCanonicalWriteEnvelopeV1Input<typeof CLAIM_ITEM_CANONICAL_AGGREGATE_TYPE>,
  'target'
>;

export interface BuildClaimItemWriteCommandInput<TPayload extends Record<string, unknown>> {
  readonly operation: ClaimItemWriteOperation;
  readonly claimItemId?: string;
  readonly envelope: ClaimItemWriteEnvelopeInput;
  readonly payload: TPayload;
}

export interface ClaimItemWriteCommand<TPayload extends Record<string, unknown>> {
  readonly operation: ClaimItemWriteOperation;
  readonly envelope: CanonicalWriteEnvelopeV1<typeof CLAIM_ITEM_CANONICAL_AGGREGATE_TYPE>;
  readonly payload: Readonly<TPayload>;
}

/**
 * ClaimItem command substrate for WS01-P01.
 *
 * It fixes the aggregate name and lifecycle vocabulary but intentionally performs no
 * authorization, tenant/case lookup, approval, persistence, audit or event emission.
 * Existing ClaimItem writers are not routed here until the separately authorized WS01-P03.
 */
export function buildClaimItemWriteCommand<TPayload extends Record<string, unknown>>(
  input: BuildClaimItemWriteCommandInput<TPayload>,
): ClaimItemWriteCommand<TPayload> {
  if (!CLAIM_ITEM_WRITE_OPERATIONS.includes(input.operation as ClaimItemWriteOperation)) {
    throw new TypeError(`ClaimItem write command: unsupported operation ${String(input.operation)}`);
  }
  if (
    (input.operation === 'UPDATE' || input.operation === 'CANCEL') &&
    input.claimItemId === undefined
  ) {
    throw new TypeError(`ClaimItem write command: ${input.operation} requires claimItemId`);
  }
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    throw new TypeError('ClaimItem write command: payload must be an object');
  }

  const envelope = buildCanonicalWriteEnvelopeV1({
    ...input.envelope,
    target: {
      aggregateType: CLAIM_ITEM_CANONICAL_AGGREGATE_TYPE,
      ...(input.claimItemId === undefined ? {} : { aggregateId: input.claimItemId }),
    },
  });
  const payload = Object.freeze({ ...input.payload }) as Readonly<TPayload>;

  return Object.freeze({
    operation: input.operation,
    envelope,
    payload,
  });
}
