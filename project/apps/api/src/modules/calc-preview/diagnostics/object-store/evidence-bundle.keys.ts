/**
 * Evidence Bundle Key Builders
 * 
 * Phase 9C - Task 1: Object Model & Keyspace
 * 
 * Single source of truth for S3 key generation.
 * All key construction MUST go through these functions.
 * 
 * RULES:
 * - No string concatenation for keys outside this file
 * - All segments validated for path traversal attacks
 * - Deterministic: same input → same key
 * 
 * @see .kiro/specs/phase-9c-object-storage-migration/PHASE-9C-IMPLEMENTATION-CHECKLIST.md
 */

import { InvalidObjectKeyError } from './object-store.interface';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default key prefix for bundle storage.
 * Can be overridden via BUNDLE_KEY_PREFIX env var.
 */
export const DEFAULT_BUNDLE_KEY_PREFIX = 'tenants';

/**
 * Bundle item types (exhaustive list)
 */
export const BUNDLE_ITEM_TYPES = [
  'calc-result',
  'calc-result-norm',
  'request',
  'response',
  'trace',
  'meta',
] as const;

export type BundleItemType = typeof BUNDLE_ITEM_TYPES[number];

// ============================================================================
// Validation
// ============================================================================

/**
 * Patterns that indicate unsafe key segments.
 * 
 * Security: Prevents path traversal, injection, and keyspace pollution.
 */
const UNSAFE_SEGMENT_PATTERNS: readonly RegExp[] = [
  /\.\./,              // Path traversal (parent directory)
  /\/\//,              // Double slash (path confusion)
  /\//,                // Slash in segment (keyspace pollution)
  /\\/,                // Backslash (Windows path)
  /\x00/,              // Null byte (C string termination attack)
  /[\r\n]/,            // Newlines (header injection)
  /^\.$/,              // Single dot (current directory)
  /%2f/i,              // URL-encoded forward slash
  /%5c/i,              // URL-encoded backslash
  /%2e/i,              // URL-encoded dot (for %2e%2e traversal)
  /%00/,               // URL-encoded null byte
];

/**
 * Maximum segment length (S3 key max is 1024, we limit segments)
 */
const MAX_SEGMENT_LENGTH = 128;

/**
 * Allowed characters in key segments (strict allowlist)
 * Only alphanumeric, hyphen, underscore
 */
const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate a single key segment for safety.
 * 
 * @param segment - The segment to validate
 * @param fieldName - Field name for error messages
 * @throws InvalidObjectKeyError if segment is unsafe
 */
export function validateKeySegment(segment: string, fieldName: string): void {
  // Empty check
  if (segment === undefined || segment === null) {
    throw new InvalidObjectKeyError(
      `${fieldName} is required`,
      fieldName,
      'SEGMENT_REQUIRED',
    );
  }
  
  // Type check
  if (typeof segment !== 'string') {
    throw new InvalidObjectKeyError(
      `${fieldName} must be a string`,
      fieldName,
      'SEGMENT_TYPE_INVALID',
    );
  }
  
  // Trim and empty check
  const trimmed = segment.trim();
  if (trimmed === '' || trimmed.length === 0) {
    throw new InvalidObjectKeyError(
      `${fieldName} cannot be empty or whitespace`,
      fieldName,
      'SEGMENT_EMPTY',
    );
  }
  
  // Whitespace in segment (not just leading/trailing)
  if (segment !== trimmed || /\s/.test(segment)) {
    throw new InvalidObjectKeyError(
      `${fieldName} cannot contain whitespace`,
      fieldName,
      'SEGMENT_WHITESPACE',
    );
  }
  
  // Length check
  if (segment.length > MAX_SEGMENT_LENGTH) {
    throw new InvalidObjectKeyError(
      `${fieldName} exceeds maximum length of ${MAX_SEGMENT_LENGTH}`,
      fieldName,
      'SEGMENT_TOO_LONG',
    );
  }
  
  // Unsafe pattern check
  for (const pattern of UNSAFE_SEGMENT_PATTERNS) {
    if (pattern.test(segment)) {
      throw new InvalidObjectKeyError(
        `${fieldName} contains unsafe characters (pattern: ${pattern.source})`,
        fieldName,
        'SEGMENT_UNSAFE_PATTERN',
      );
    }
  }
  
  // Strict allowlist check
  if (!SAFE_SEGMENT_PATTERN.test(segment)) {
    throw new InvalidObjectKeyError(
      `${fieldName} contains invalid characters. Only alphanumeric, hyphen, and underscore allowed.`,
      fieldName,
      'SEGMENT_INVALID_CHARS',
    );
  }
}

/**
 * Validate item type is in allowed list.
 * 
 * @param itemType - The item type to validate
 * @throws InvalidObjectKeyError if item type is invalid
 */
export function validateItemType(itemType: string): asserts itemType is BundleItemType {
  if (!BUNDLE_ITEM_TYPES.includes(itemType as BundleItemType)) {
    throw new InvalidObjectKeyError(
      `Invalid item type: ${itemType}. Allowed: ${BUNDLE_ITEM_TYPES.join(', ')}`,
      'itemType',
      'INVALID_ITEM_TYPE',
    );
  }
}

// ============================================================================
// Key Builders
// ============================================================================

/**
 * Build the root key for a bundle (directory-like prefix).
 * 
 * Format: `{prefix}/{tenantId}/incidents/{incidentId}/snapshots/{snapshotId}`
 * 
 * @param tenantId - Tenant identifier
 * @param incidentId - Incident identifier
 * @param snapshotId - Snapshot identifier
 * @param keyPrefix - Optional key prefix (default: 'tenants')
 * @returns Root key path (no trailing slash)
 */
export function buildBundleRootKey(
  tenantId: string,
  incidentId: string,
  snapshotId: string,
  keyPrefix: string = DEFAULT_BUNDLE_KEY_PREFIX,
): string {
  // Validate all segments
  validateKeySegment(keyPrefix, 'keyPrefix');
  validateKeySegment(tenantId, 'tenantId');
  validateKeySegment(incidentId, 'incidentId');
  validateKeySegment(snapshotId, 'snapshotId');
  
  return `${keyPrefix}/${tenantId}/incidents/${incidentId}/snapshots/${snapshotId}`;
}

/**
 * Build the manifest key for a bundle.
 * 
 * Format: `{root}/manifest.json`
 * 
 * @param tenantId - Tenant identifier
 * @param incidentId - Incident identifier
 * @param snapshotId - Snapshot identifier
 * @param keyPrefix - Optional key prefix (default: 'tenants')
 * @returns Full manifest key
 */
export function buildManifestKey(
  tenantId: string,
  incidentId: string,
  snapshotId: string,
  keyPrefix: string = DEFAULT_BUNDLE_KEY_PREFIX,
): string {
  const root = buildBundleRootKey(tenantId, incidentId, snapshotId, keyPrefix);
  return `${root}/manifest.json`;
}

/**
 * Build an item key for a bundle.
 * 
 * Format: `{root}/items/{itemType}.json`
 * 
 * @param tenantId - Tenant identifier
 * @param incidentId - Incident identifier
 * @param snapshotId - Snapshot identifier
 * @param itemType - Item type (must be in BUNDLE_ITEM_TYPES)
 * @param keyPrefix - Optional key prefix (default: 'tenants')
 * @returns Full item key
 */
export function buildItemKey(
  tenantId: string,
  incidentId: string,
  snapshotId: string,
  itemType: BundleItemType,
  keyPrefix: string = DEFAULT_BUNDLE_KEY_PREFIX,
): string {
  // Validate item type
  validateItemType(itemType);
  
  const root = buildBundleRootKey(tenantId, incidentId, snapshotId, keyPrefix);
  return `${root}/items/${itemType}.json`;
}

/**
 * Parse a manifest key to extract identifiers.
 * 
 * @param key - Full manifest key
 * @returns Parsed identifiers or null if invalid format
 */
export function parseManifestKey(key: string): {
  keyPrefix: string;
  tenantId: string;
  incidentId: string;
  snapshotId: string;
} | null {
  // Expected format: {prefix}/{tenantId}/incidents/{incidentId}/snapshots/{snapshotId}/manifest.json
  const pattern = /^([^/]+)\/([^/]+)\/incidents\/([^/]+)\/snapshots\/([^/]+)\/manifest\.json$/;
  const match = key.match(pattern);
  
  if (!match) {
    return null;
  }
  
  return {
    keyPrefix: match[1],
    tenantId: match[2],
    incidentId: match[3],
    snapshotId: match[4],
  };
}

/**
 * Parse an item key to extract identifiers and item type.
 * 
 * @param key - Full item key
 * @returns Parsed identifiers and item type or null if invalid format
 */
export function parseItemKey(key: string): {
  keyPrefix: string;
  tenantId: string;
  incidentId: string;
  snapshotId: string;
  itemType: BundleItemType;
} | null {
  // Expected format: {prefix}/{tenantId}/incidents/{incidentId}/snapshots/{snapshotId}/items/{itemType}.json
  const pattern = /^([^/]+)\/([^/]+)\/incidents\/([^/]+)\/snapshots\/([^/]+)\/items\/([^/]+)\.json$/;
  const match = key.match(pattern);
  
  if (!match) {
    return null;
  }
  
  const itemType = match[5];
  if (!BUNDLE_ITEM_TYPES.includes(itemType as BundleItemType)) {
    return null;
  }
  
  return {
    keyPrefix: match[1],
    tenantId: match[2],
    incidentId: match[3],
    snapshotId: match[4],
    itemType: itemType as BundleItemType,
  };
}

/**
 * Build list prefix for all bundles of a tenant.
 * 
 * Format: `{prefix}/{tenantId}/`
 * 
 * @param tenantId - Tenant identifier
 * @param keyPrefix - Optional key prefix (default: 'tenants')
 * @returns Prefix for listing
 */
export function buildTenantListPrefix(
  tenantId: string,
  keyPrefix: string = DEFAULT_BUNDLE_KEY_PREFIX,
): string {
  validateKeySegment(keyPrefix, 'keyPrefix');
  validateKeySegment(tenantId, 'tenantId');
  
  return `${keyPrefix}/${tenantId}/`;
}

/**
 * Build list prefix for all bundles of an incident.
 * 
 * Format: `{prefix}/{tenantId}/incidents/{incidentId}/`
 * 
 * @param tenantId - Tenant identifier
 * @param incidentId - Incident identifier
 * @param keyPrefix - Optional key prefix (default: 'tenants')
 * @returns Prefix for listing
 */
export function buildIncidentListPrefix(
  tenantId: string,
  incidentId: string,
  keyPrefix: string = DEFAULT_BUNDLE_KEY_PREFIX,
): string {
  validateKeySegment(keyPrefix, 'keyPrefix');
  validateKeySegment(tenantId, 'tenantId');
  validateKeySegment(incidentId, 'incidentId');
  
  return `${keyPrefix}/${tenantId}/incidents/${incidentId}/`;
}
