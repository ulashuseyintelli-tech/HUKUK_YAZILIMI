/**
 * Phase 9C Task 2.5 - Bundle Seal Hasher
 * 
 * Pure function for computing deterministic SHA-256 hash of evidence objects.
 * 
 * CANONICAL FORMAT (per object):
 *   ${objectKey}\n${etag}\n${versionId ?? ''}\n${contentType}\n${sizeBytes.toString()}
 * 
 * Objects are joined by single '\n' character.
 * Order: objects MUST be sorted by object_key ASC before hashing.
 */

import { createHash } from 'crypto';
import type { EvidenceObjectRow, SealSnapshot } from './bundle-seal.types';

/**
 * Formats a single evidence object row into canonical string format.
 * Uses BigInt.toString() for locale-independent size_bytes serialization.
 */
export function formatObjectForHash(obj: EvidenceObjectRow): string {
  return [
    obj.object_key,
    obj.etag,
    obj.version_id ?? '',
    obj.content_type,
    obj.size_bytes.toString(), // BigInt → string (locale-independent)
  ].join('\n');
}

/**
 * Computes deterministic SHA-256 hash from evidence objects.
 * 
 * IMPORTANT: Objects MUST be pre-sorted by object_key ASC.
 * This function does NOT sort - caller is responsible for ordering.
 * 
 * @param objects - Evidence object rows, MUST be sorted by object_key ASC
 * @returns SealSnapshot with hash, objectCount, and totalSizeBytes
 */
export function computeSealSnapshot(objects: EvidenceObjectRow[]): SealSnapshot {
  // Build canonical payload
  const payload = objects.map(formatObjectForHash).join('\n');
  
  // Compute SHA-256
  const hash = createHash('sha256')
    .update(payload, 'utf8')
    .digest('hex');
  
  // Accumulate total size (bigint arithmetic)
  const totalSizeBytes = objects.reduce(
    (acc, obj) => acc + obj.size_bytes,
    BigInt(0)
  );
  
  return {
    hash,
    objectCount: objects.length,
    totalSizeBytes,
  };
}

/**
 * Computes hash for empty bundle (edge case).
 * Empty bundle has deterministic hash of empty string.
 */
export function computeEmptyBundleSnapshot(): SealSnapshot {
  const hash = createHash('sha256')
    .update('', 'utf8')
    .digest('hex');
  
  return {
    hash,
    objectCount: 0,
    totalSizeBytes: BigInt(0),
  };
}
