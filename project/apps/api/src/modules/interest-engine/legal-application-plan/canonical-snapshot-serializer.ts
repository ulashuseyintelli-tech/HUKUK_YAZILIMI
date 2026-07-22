import { createHash } from 'node:crypto';
import type { StrictJsonValue } from './strict-json-parser';
import { SNAPSHOT_SERIALIZATION_VERSION } from './primitives';

const DOMAIN_SEPARATOR = Buffer.concat([
  Buffer.from(SNAPSHOT_SERIALIZATION_VERSION, 'utf8'),
  Buffer.from([0]),
]);

function compareCanonicalKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

/** Domain-local RCV-CAS/v1 serializer. Arrays remain in their supplied semantic order. */
export function serializeCanonicalJson(value: StrictJsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeCanonicalJson(entry)).join(',')}]`;
  }

  const objectValue = value as Readonly<Record<string, StrictJsonValue>>;
  const members = Object.keys(objectValue)
    .sort(compareCanonicalKeys)
    .map((key) => `${JSON.stringify(key)}:${serializeCanonicalJson(objectValue[key])}`);

  return `{${members.join(',')}}`;
}

export function computeCanonicalSnapshotHash(canonicalEnvelopeBytes: Buffer): string {
  return createHash('sha256')
    .update(DOMAIN_SEPARATOR)
    .update(canonicalEnvelopeBytes)
    .digest('hex');
}

export function canonicalSnapshotRefForHash(snapshotHash: string): string {
  return `rcv-app-snapshot:v1:sha256:${snapshotHash}`;
}
