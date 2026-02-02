/**
 * Phase 9C Task 3 - Manifest Hash Computation
 * 
 * Computes SHA-256 hash of canonical JSON manifest.
 * 
 * RULE: manifestHash field is excluded from hash computation.
 */

import { createHash } from 'crypto';
import { canonicalStringify } from './bundle-manifest.canonical';
import type { BundleManifestV1, ManifestWithoutHash } from './bundle-manifest.types';

/**
 * Computes manifestHash for a manifest.
 * 
 * Process:
 * 1. Remove manifestHash field (if present)
 * 2. Canonical JSON serialize
 * 3. SHA-256 → hex
 * 
 * @param manifest - Manifest object (with or without manifestHash)
 * @returns SHA-256 hex string (64 chars)
 */
export function computeManifestHash(
  manifest: BundleManifestV1 | ManifestWithoutHash
): string {
  // Remove manifestHash if present
  const { manifestHash, ...withoutHash } = manifest as BundleManifestV1;
  
  // Canonical JSON
  const canonical = canonicalStringify(withoutHash);
  
  // SHA-256
  return createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
}

/**
 * Verifies manifestHash matches computed hash.
 * 
 * @param manifest - Manifest with manifestHash
 * @returns true if hash matches
 */
export function verifyManifestHash(manifest: BundleManifestV1): boolean {
  const computed = computeManifestHash(manifest);
  return computed === manifest.manifestHash;
}

/**
 * Adds manifestHash to a manifest without hash.
 * 
 * @param manifest - Manifest without manifestHash
 * @returns Complete manifest with manifestHash
 */
export function addManifestHash(manifest: ManifestWithoutHash): BundleManifestV1 {
  const hash = computeManifestHash(manifest);
  return {
    ...manifest,
    manifestHash: hash,
  };
}
