import { createHash } from 'node:crypto';
import type { LegalApplicationComponentType } from './contracts';

export const SOURCE_VERSION_SET_IDENTITY_VERSION = 'RCV-SOURCE-SET/v1' as const;
export const BUCKET_CONTEXT_IDENTITY_VERSION = 'RCV-BCTX/v1' as const;

const CONTROL_OR_UNPAIRED_SURROGATE = /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u;

export interface CanonicalIdentityField {
  readonly tag: string;
  readonly value: string;
}

export interface SourceVersionIdentityInput {
  readonly sourceReference: string;
  readonly sourceVersion: string;
}

export interface BucketContextIdentityInput {
  readonly componentType: LegalApplicationComponentType;
  readonly componentCode: string;
  readonly currency: string;
  readonly minorUnit: number;
  readonly legalBasisRef: string;
  readonly effectiveContextRef: string;
  readonly interestRuleRef?: string;
  readonly priorityPolicyRef: string;
  readonly priorityPolicyVersion: string;
  readonly priorityRank: number;
  readonly liabilityContextRef: string;
}

function uint32(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('CANONICAL_IDENTITY_LENGTH_OUT_OF_RANGE');
  }
  const result = Buffer.allocUnsafe(4);
  result.writeUInt32BE(value, 0);
  return result;
}

function canonicalUtf8(value: string, field: string): Buffer {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`CANONICAL_IDENTITY_NONBLANK_REQUIRED:${field}`);
  }
  if (CONTROL_OR_UNPAIRED_SURROGATE.test(value)) {
    throw new Error(`CANONICAL_IDENTITY_UNSAFE_TEXT:${field}`);
  }
  return Buffer.from(value.normalize('NFC'), 'utf8');
}

/**
 * Ambiguity-safe identity encoding: fixed contract order, tagged fields and uint32
 * byte lengths over NFC UTF-8 bytes. The version/domain separator is hashed separately.
 */
export function encodeCanonicalIdentityFields(
  fields: readonly CanonicalIdentityField[],
): Buffer {
  const seen = new Set<string>();
  const encoded: Buffer[] = [uint32(fields.length)];
  for (const field of fields) {
    if (seen.has(field.tag)) {
      throw new Error(`CANONICAL_IDENTITY_DUPLICATE_TAG:${field.tag}`);
    }
    seen.add(field.tag);
    const tag = canonicalUtf8(field.tag, 'tag');
    const value = canonicalUtf8(field.value, field.tag);
    encoded.push(uint32(tag.length), tag, uint32(value.length), value);
  }
  return Buffer.concat(encoded);
}

function domainSeparatedHash(domain: string, payload: Buffer): string {
  return createHash('sha256')
    .update(canonicalUtf8(domain, 'domain'))
    .update(Buffer.from([0]))
    .update(payload)
    .digest('hex');
}

function canonicalInteger(value: number, field: string): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`CANONICAL_IDENTITY_INTEGER_REQUIRED:${field}`);
  }
  return value.toString();
}

function compareUtf8(left: string, right: string): number {
  return Buffer.from(left.normalize('NFC'), 'utf8').compare(
    Buffer.from(right.normalize('NFC'), 'utf8'),
  );
}

export function computeSourceVersionSetHash(
  sources: readonly SourceVersionIdentityInput[],
): string {
  if (sources.length === 0) {
    throw new Error('SOURCE_VERSION_SET_EMPTY');
  }

  const sorted = [...sources].sort(
    (left, right) =>
      compareUtf8(left.sourceReference, right.sourceReference) ||
      compareUtf8(left.sourceVersion, right.sourceVersion),
  );
  const seenReferences = new Set<string>();
  const encodedEntries: Buffer[] = [uint32(sorted.length)];
  for (const source of sorted) {
    const normalizedReference = source.sourceReference.normalize('NFC');
    if (seenReferences.has(normalizedReference)) {
      throw new Error('SOURCE_VERSION_REFERENCE_DUPLICATE');
    }
    seenReferences.add(normalizedReference);
    const encoded = encodeCanonicalIdentityFields([
      { tag: 'sourceReference', value: source.sourceReference },
      { tag: 'sourceVersion', value: source.sourceVersion },
    ]);
    encodedEntries.push(uint32(encoded.length), encoded);
  }
  return domainSeparatedHash(
    SOURCE_VERSION_SET_IDENTITY_VERSION,
    Buffer.concat(encodedEntries),
  );
}

export function sortSourceVersionSet<T extends SourceVersionIdentityInput>(
  sources: readonly T[],
): readonly T[] {
  return Object.freeze(
    [...sources].sort(
      (left, right) =>
        compareUtf8(left.sourceReference, right.sourceReference) ||
        compareUtf8(left.sourceVersion, right.sourceVersion),
    ),
  );
}

export function computeBucketContextKey(input: BucketContextIdentityInput): string {
  const digest = domainSeparatedHash(
    BUCKET_CONTEXT_IDENTITY_VERSION,
    encodeCanonicalIdentityFields([
      { tag: 'componentType', value: input.componentType },
      { tag: 'componentCode', value: input.componentCode },
      { tag: 'currency', value: input.currency },
      { tag: 'minorUnit', value: canonicalInteger(input.minorUnit, 'minorUnit') },
      { tag: 'legalBasisRef', value: input.legalBasisRef },
      { tag: 'effectiveContextRef', value: input.effectiveContextRef },
      { tag: 'interestRuleRef', value: input.interestRuleRef ?? 'ABSENT' },
      { tag: 'priorityPolicyRef', value: input.priorityPolicyRef },
      { tag: 'priorityPolicyVersion', value: input.priorityPolicyVersion },
      { tag: 'priorityRank', value: canonicalInteger(input.priorityRank, 'priorityRank') },
      { tag: 'liabilityContextRef', value: input.liabilityContextRef },
    ]),
  );
  return `bctx:v1:sha256:${digest}`;
}
