/**
 * Phase 9C Task 2.5 - Bundle Seal Types
 * 
 * Type definitions for evidence bundle sealing operations.
 */

/** Raw DB row from evidence_objects table */
export interface EvidenceObjectRow {
  object_key: string;
  etag: string;
  version_id: string | null;
  content_type: string;
  size_bytes: bigint;
}

/** Raw DB row from evidence_bundles table */
export interface EvidenceBundleRow {
  bundle_id: string;
  tenant_id: string;
  incident_id: string;
  state: 'OPEN' | 'SEALED';
  sealed_hash: string | null;
  sealed_at: Date | null;
  created_at: Date;
}

/** Raw DB row from bundle_seal_events table */
export interface BundleSealEventRow {
  id: string;
  bundle_id: string;
  run_id: string;
  hash: string;
  object_count: number;
  total_size_bytes: bigint;
  created_at: Date;
}

/** Computed seal snapshot from objects */
export interface SealSnapshot {
  hash: string;           // SHA-256 hex (64 chars)
  objectCount: number;
  totalSizeBytes: bigint;
}

/** Successful seal result */
export interface SealResult {
  bundleId: string;
  sealedHash: string;
  objectCount: number;
  totalSizeBytes: string;  // String for JSON serialization (bigint)
  sealedAt: Date;
}

/** Worker batch seal result */
export interface BatchSealResult {
  sealed: boolean;
  bundleId?: string;
  reason?: 'no_candidate' | 'sealed' | 'error';
  result?: SealResult;
  error?: string;
}

/** Bundle seal configuration */
export interface BundleSealConfig {
  /** Grace period before bundle can be sealed (ms). Default: 5 minutes */
  gracePeriodMs: number;
}

export const DEFAULT_SEAL_CONFIG: BundleSealConfig = {
  gracePeriodMs: 5 * 60 * 1000, // 5 minutes
};
