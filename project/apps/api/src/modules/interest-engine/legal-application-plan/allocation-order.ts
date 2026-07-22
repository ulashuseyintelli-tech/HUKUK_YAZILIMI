import type {
  LegalApplicationComponentType,
} from './contracts';
import type { BucketContextKey } from './primitives';

export type LegalApplicationComponentRank = 10 | 20 | 30 | 40;

/** Closed TBK100 component order. `undefined` is a fail-closed invariant signal. */
export function legalApplicationComponentRank(
  componentType: LegalApplicationComponentType,
): LegalApplicationComponentRank | undefined {
  switch (componentType) {
    case 'COST':
      return 10;
    case 'ANCILLARY':
      return 20;
    case 'ACCRUED_INTEREST':
      return 30;
    case 'PRINCIPAL':
      return 40;
    default:
      return undefined;
  }
}

/** Locale-free unsigned byte ordering with shorter common-prefix values first. */
export function compareUnsignedByteSequences(
  left: Readonly<Uint8Array>,
  right: Readonly<Uint8Array>,
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftByte = left[index];
    const rightByte = right[index];
    if (leftByte !== rightByte) {
      return leftByte < rightByte ? -1 : 1;
    }
  }

  if (left.length === right.length) {
    return 0;
  }
  return left.length < right.length ? -1 : 1;
}

export function compareBucketContextKeysUtf8(
  left: BucketContextKey,
  right: BucketContextKey,
): number {
  return compareUnsignedByteSequences(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}
