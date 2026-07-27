import {
  canonicalJsonStringify,
  stableJsonHash,
} from '../../permission-diagnostics/guided-edge/canonical-json';

export const LEGAL_BASIS_PROJECTION_BINDING_PERSISTENCE_CONTRACT_VERSION = '1' as const;

export interface LegalBasisProjectionBindingPersistenceEnvelopeV1 {
  readonly contractVersion: '1';
  readonly canonicalPayload: string;
  readonly checksum: string;
}

export type LegalBasisProjectionBindingPersistenceErrorCode =
  | 'PROJECTION_BINDING_VERSION_UNSUPPORTED'
  | 'PROJECTION_BINDING_PAYLOAD_EMPTY'
  | 'PROJECTION_BINDING_PAYLOAD_INVALID_JSON'
  | 'PROJECTION_BINDING_PAYLOAD_NOT_OBJECT'
  | 'PROJECTION_BINDING_PAYLOAD_NON_CANONICAL'
  | 'PROJECTION_BINDING_CHECKSUM_INVALID_FORMAT'
  | 'PROJECTION_BINDING_CHECKSUM_MISMATCH';

export class LegalBasisProjectionBindingPersistenceError extends Error {
  constructor(readonly code: LegalBasisProjectionBindingPersistenceErrorCode) {
    super(code);
    this.name = 'LegalBasisProjectionBindingPersistenceError';
  }
}

/**
 * Pure persistence-boundary validator. Absence is the explicit legacy/unbound
 * state; a present envelope must be a complete canonical V1 binding.
 */
export function validateLegalBasisProjectionBindingPersistenceEnvelope(
  envelope: LegalBasisProjectionBindingPersistenceEnvelopeV1 | undefined,
): LegalBasisProjectionBindingPersistenceEnvelopeV1 | undefined {
  if (envelope === undefined) return undefined;
  if (envelope.contractVersion !== LEGAL_BASIS_PROJECTION_BINDING_PERSISTENCE_CONTRACT_VERSION) {
    fail('PROJECTION_BINDING_VERSION_UNSUPPORTED');
  }
  if (envelope.canonicalPayload.trim().length === 0) {
    fail('PROJECTION_BINDING_PAYLOAD_EMPTY');
  }

  let value: unknown;
  try {
    value = JSON.parse(envelope.canonicalPayload);
  } catch {
    fail('PROJECTION_BINDING_PAYLOAD_INVALID_JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('PROJECTION_BINDING_PAYLOAD_NOT_OBJECT');
  }
  if (canonicalJsonStringify(value) !== envelope.canonicalPayload) {
    fail('PROJECTION_BINDING_PAYLOAD_NON_CANONICAL');
  }
  if (!/^[0-9a-f]{64}$/.test(envelope.checksum)) {
    fail('PROJECTION_BINDING_CHECKSUM_INVALID_FORMAT');
  }
  if (stableJsonHash(value) !== envelope.checksum) {
    fail('PROJECTION_BINDING_CHECKSUM_MISMATCH');
  }

  return Object.freeze({ ...envelope });
}

export function buildLegalBasisProjectionBindingPersistenceEnvelope(
  payload: Readonly<Record<string, unknown>>,
): LegalBasisProjectionBindingPersistenceEnvelopeV1 {
  const canonicalPayload = canonicalJsonStringify(payload);
  return Object.freeze({
    contractVersion: LEGAL_BASIS_PROJECTION_BINDING_PERSISTENCE_CONTRACT_VERSION,
    canonicalPayload,
    checksum: stableJsonHash(payload),
  });
}

function fail(code: LegalBasisProjectionBindingPersistenceErrorCode): never {
  throw new LegalBasisProjectionBindingPersistenceError(code);
}
