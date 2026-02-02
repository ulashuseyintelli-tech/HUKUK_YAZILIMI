/**
 * Phase 9C Task 3 - Manifest Key Builder
 * 
 * Key format: bundles/{bundleId}/manifest.json
 * 
 * RULE: bundleId is the anchor. Tenant/incident not in path.
 */

/** Default prefix for bundle storage */
export const BUNDLE_MANIFEST_PREFIX = 'bundles';

/** UUID v4 pattern for validation */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates bundleId format (UUID v4).
 * 
 * @param bundleId - Bundle ID to validate
 * @throws Error if invalid format
 */
export function validateBundleId(bundleId: string): void {
  if (!bundleId || typeof bundleId !== 'string') {
    throw new Error('bundleId is required');
  }
  
  if (!UUID_PATTERN.test(bundleId)) {
    throw new Error(`Invalid bundleId format: ${bundleId}. Expected UUID v4.`);
  }
}

/**
 * Builds manifest key for a bundle.
 * 
 * Format: bundles/{bundleId}/manifest.json
 * 
 * @param bundleId - Bundle UUID
 * @param prefix - Optional prefix (default: 'bundles')
 * @returns S3 key for manifest
 */
export function buildManifestKey(
  bundleId: string,
  prefix: string = BUNDLE_MANIFEST_PREFIX
): string {
  validateBundleId(bundleId);
  return `${prefix}/${bundleId}/manifest.json`;
}

/**
 * Parses manifest key to extract bundleId.
 * 
 * @param key - S3 key
 * @returns bundleId or null if invalid format
 */
export function parseManifestKey(key: string): string | null {
  const pattern = /^([^/]+)\/([0-9a-f-]+)\/manifest\.json$/i;
  const match = key.match(pattern);
  
  if (!match) {
    return null;
  }
  
  const bundleId = match[2];
  
  // Validate UUID format
  if (!UUID_PATTERN.test(bundleId)) {
    return null;
  }
  
  return bundleId;
}

/**
 * Builds list prefix for all manifests.
 * 
 * @param prefix - Optional prefix (default: 'bundles')
 * @returns Prefix for listing all manifests
 */
export function buildManifestListPrefix(
  prefix: string = BUNDLE_MANIFEST_PREFIX
): string {
  return `${prefix}/`;
}
