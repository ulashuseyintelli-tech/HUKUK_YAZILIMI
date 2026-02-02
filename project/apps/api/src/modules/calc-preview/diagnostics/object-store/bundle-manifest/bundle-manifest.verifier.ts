/**
 * Phase 9C Task 3 - Manifest Verifier
 * 
 * Verifies manifest integrity:
 * 1. manifestHash - envelope integrity
 * 2. sealedHash - content integrity (using bundle-seal.hasher)
 */

import { verifyManifestHash } from './bundle-manifest.hasher';
import { computeSealSnapshot } from '../bundle-seal/bundle-seal.hasher';
import type { BundleManifestV1, ManifestVerificationResult } from './bundle-manifest.types';
import type { EvidenceObjectRow } from '../bundle-seal/bundle-seal.types';

/**
 * Verifies manifest integrity.
 * 
 * Checks:
 * 1. manifestHash matches computed hash
 * 2. sealedHash matches computed hash from objects
 * 
 * @param manifest - Manifest to verify
 * @returns Verification result
 */
export function verifyManifest(manifest: BundleManifestV1): ManifestVerificationResult {
  const errors: string[] = [];
  
  // 1. Verify manifestHash
  const manifestHashValid = verifyManifestHash(manifest);
  if (!manifestHashValid) {
    errors.push('manifestHash does not match computed hash');
  }
  
  // 2. Verify sealedHash
  const sealedHashValid = verifySealedHash(manifest);
  if (!sealedHashValid) {
    errors.push('sealedHash does not match computed hash from objects');
  }
  
  return {
    valid: manifestHashValid && sealedHashValid,
    manifestHashValid,
    sealedHashValid,
    errors,
  };
}

/**
 * Verifies sealedHash matches computed hash from objects.
 * 
 * Uses bundle-seal.hasher for consistency with seal process.
 */
function verifySealedHash(manifest: BundleManifestV1): boolean {
  // Convert manifest objects to EvidenceObjectRow format
  const objects: EvidenceObjectRow[] = manifest.objects.map(obj => ({
    object_key: obj.objectKey,
    etag: obj.etag,
    version_id: obj.versionId,
    content_type: obj.contentType,
    size_bytes: BigInt(obj.sizeBytes),
  }));
  
  // Compute hash using same hasher as seal process
  const snapshot = computeSealSnapshot(objects);
  
  return snapshot.hash === manifest.sealedHash;
}

/**
 * Detailed verification with individual object checks.
 * 
 * @param manifest - Manifest to verify
 * @returns Detailed verification result
 */
export function verifyManifestDetailed(manifest: BundleManifestV1): {
  manifestHashValid: boolean;
  sealedHashValid: boolean;
  objectCountValid: boolean;
  totalSizeBytesValid: boolean;
  objectsOrderValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // 1. Verify manifestHash
  const manifestHashValid = verifyManifestHash(manifest);
  if (!manifestHashValid) {
    errors.push('manifestHash mismatch');
  }
  
  // 2. Verify sealedHash
  const sealedHashValid = verifySealedHash(manifest);
  if (!sealedHashValid) {
    errors.push('sealedHash mismatch');
  }
  
  // 3. Verify objectCount
  const objectCountValid = manifest.objectCount === manifest.objects.length;
  if (!objectCountValid) {
    errors.push(`objectCount mismatch: ${manifest.objectCount} vs ${manifest.objects.length}`);
  }
  
  // 4. Verify totalSizeBytes
  const computedSize = manifest.objects.reduce(
    (acc, obj) => acc + BigInt(obj.sizeBytes),
    BigInt(0)
  );
  const totalSizeBytesValid = manifest.totalSizeBytes === computedSize.toString();
  if (!totalSizeBytesValid) {
    errors.push(`totalSizeBytes mismatch: ${manifest.totalSizeBytes} vs ${computedSize}`);
  }
  
  // 5. Verify objects are sorted by objectKey
  const objectsOrderValid = isObjectsSorted(manifest.objects);
  if (!objectsOrderValid) {
    errors.push('objects are not sorted by objectKey ASC');
  }
  
  return {
    manifestHashValid,
    sealedHashValid,
    objectCountValid,
    totalSizeBytesValid,
    objectsOrderValid,
    errors,
  };
}

/**
 * Checks if objects array is sorted by objectKey ASC.
 */
function isObjectsSorted(objects: BundleManifestV1['objects']): boolean {
  for (let i = 1; i < objects.length; i++) {
    if (objects[i].objectKey < objects[i - 1].objectKey) {
      return false;
    }
  }
  return true;
}
