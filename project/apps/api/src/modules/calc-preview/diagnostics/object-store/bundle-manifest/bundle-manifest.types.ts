/**
 * Phase 9C Task 3 - Bundle Manifest Types
 * 
 * Schema v1.0.0 for sealed evidence bundle manifest.
 * 
 * RULES:
 * - Only SEALED bundles have manifests
 * - All timestamps ISO 8601 UTC (Z suffix)
 * - All bigints as strings
 * - Objects sorted by objectKey ASC
 * - Canonical JSON (sorted keys, no whitespace)
 */

/** Manifest schema version */
export const MANIFEST_VERSION = '1.0.0' as const;

/** Supported signature algorithms (Phase 10/11) */
export type SignatureAlgorithm = 'ed25519' | 'rsa-pss-sha256';

/** Manifest signature (null until Phase 10/11) */
export interface ManifestSignature {
  alg: SignatureAlgorithm;
  keyId: string;
  sig: string;  // base64
}

/** Storage metadata */
export interface ManifestStorage {
  provider: 's3';
  bucket: string;
  region?: string;
}

/** Object entry in manifest */
export interface ManifestObjectV1 {
  objectKey: string;
  etag: string;
  versionId: string | null;
  contentType: string;
  sizeBytes: string;        // bigint as string
  createdAt: string;        // ISO 8601 UTC
}

/** Bundle manifest v1.0.0 */
export interface BundleManifestV1 {
  version: typeof MANIFEST_VERSION;
  
  // Identity
  bundleId: string;
  tenantId: string;
  incidentId: string;
  
  // State (Task 3 scope: SEALED only)
  state: 'SEALED';
  sealedHash: string;       // SHA-256 from bundle-seal.hasher
  sealedAt: string;         // ISO 8601 UTC
  sealRunId: string;        // from bundle_seal_events
  createdAt: string;        // ISO 8601 UTC
  
  // Objects (sorted by objectKey ASC)
  objects: ManifestObjectV1[];
  
  // Computed totals
  objectCount: number;
  totalSizeBytes: string;   // bigint as string
  
  // Integrity
  manifestHash: string;     // SHA-256 of canonical JSON (excluding this field)
  
  // Signature (null until Phase 10/11)
  signature: ManifestSignature | null;
  
  // Storage metadata
  storage: ManifestStorage;
}

/** Manifest without manifestHash (for hash computation) */
export type ManifestWithoutHash = Omit<BundleManifestV1, 'manifestHash'>;

/** Verification result */
export interface ManifestVerificationResult {
  valid: boolean;
  manifestHashValid: boolean;
  sealedHashValid: boolean;
  objectsValid?: boolean;   // Only if S3 verification requested
  errors: string[];
}

/** Manifest build options */
export interface ManifestBuildOptions {
  storage: ManifestStorage;
}

/** Manifest write result */
export interface ManifestWriteResult {
  success: boolean;
  key: string;
  alreadyExists?: boolean;
  error?: string;
}

/** Manifest read result */
export interface ManifestReadResult {
  success: boolean;
  manifest?: BundleManifestV1;
  error?: 'NOT_FOUND' | 'PARSE_ERROR' | 'INVALID_VERSION' | 'UNKNOWN';
  errorMessage?: string;
}
