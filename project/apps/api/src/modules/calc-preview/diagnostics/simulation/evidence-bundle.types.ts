/**
 * Evidence Bundle Types
 * 
 * Phase 8 - Sprint 2E
 * 
 * Types for evidence bundle export.
 * Bundle provides audit trail and traceability for simulation runs.
 * 
 * RULE: contentHash is computed from payload only (not metadata)
 * This ensures same content = same hash regardless of export time/actor.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { EvidenceChain, EvidenceVerdict } from './simulation.types';
import { StoredSnapshot } from '../evidence/snapshot-store.types';
import { RetentionPolicy } from '../evidence/retention-policy';
import { MetricDrift } from '../evidence/drift-utils';
import { AuditActor } from '../evidence/snapshot-audit.types';

/**
 * Evidence bundle payload (content that is hashed)
 * 
 * RULE: Only this content is included in contentHash.
 * Metadata (exportedAt, exportedBy, bundleId) is NOT hashed.
 */
export interface EvidenceBundlePayload {
  /** Incident ID */
  incidentId: string;
  /** Run ID */
  runId: string;
  /** Evidence chain from simulation */
  evidenceChain: EvidenceChain;
  /** Baseline snapshot (full data) */
  baselineSnapshot: StoredSnapshot;
  /** Current snapshot (full data) */
  currentSnapshot: StoredSnapshot;
  /** Drift explainability */
  driftExplainability: DriftExplainability;
  /** Retention state at export time */
  retentionState: RetentionState;
}

/**
 * Drift explainability details
 */
export interface DriftExplainability {
  /** Top contributors to drift (sorted by weightedContribution DESC) */
  topContributors: MetricDrift[];
  /** Metrics missing in baseline */
  missingInBaseline: string[];
  /** Metrics missing in current */
  missingInCurrent: string[];
  /** Common metrics between baseline and current */
  commonMetrics: string[];
  /** Overall drift score */
  driftScore: number;
  /** Whether drift blocked the run */
  driftBlocked: boolean;
}

/**
 * Retention state at export time
 */
export interface RetentionState {
  /** Baseline snapshot policy */
  baselinePolicy: RetentionPolicy;
  /** Current snapshot policy */
  currentPolicy: RetentionPolicy;
  /** Whether baseline is protected (LEGAL_HOLD) */
  baselineProtected: boolean;
  /** Whether current is protected (LEGAL_HOLD) */
  currentProtected: boolean;
}

/**
 * Evidence bundle metadata (NOT included in contentHash)
 */
export interface EvidenceBundleMeta {
  /** Unique bundle ID */
  bundleId: string;
  /** Export timestamp */
  exportedAt: string;
  /** Actor who exported */
  exportedBy: AuditActor;
  /** Bundle format version */
  formatVersion: string;
}

/**
 * Complete evidence bundle
 */
export interface EvidenceBundle {
  /** Metadata (not hashed) */
  meta: EvidenceBundleMeta;
  /** Payload (hashed) */
  payload: EvidenceBundlePayload;
  /** SHA256 hash of canonical payload (for integrity verification) */
  contentHash: string;
}

/**
 * Evidence bundle export options
 */
export interface ExportBundleOptions {
  /** Actor performing export */
  actor?: AuditActor;
  /** Include full snapshot data (default: true) */
  includeSnapshots?: boolean;
}

/**
 * Evidence bundle export result
 */
export interface ExportBundleResult {
  /** Whether export succeeded */
  success: boolean;
  /** Exported bundle (if success) */
  bundle?: EvidenceBundle;
  /** Error code (if failed) */
  error?: 'INCIDENT_NOT_FOUND' | 'NO_RUN_DATA' | 'SNAPSHOT_NOT_FOUND';
  /** Error message */
  errorMessage?: string;
}

/**
 * Bundle format version
 */
export const BUNDLE_FORMAT_VERSION = '1.0.0';
