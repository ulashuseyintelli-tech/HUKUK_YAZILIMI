/**
 * Simulation API DTOs
 * 
 * Sprint 2F - Request/Response types for simulation endpoints
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 */

import { EvidenceVerdict } from '../simulation/simulation.types';
import { EvidenceStatus } from '../simulation/incident.types';

// ============================================================================
// Simulate Endpoint DTOs
// ============================================================================

export interface SimulateRequestDto {
  /** Optional scenario ID (default: 'default') */
  scenarioId?: string;
  /** Optional seed for deterministic simulation */
  seed?: number;
}

export interface SimulateResponseDto {
  /** Unique run identifier */
  runId: string;
  /** Simulation verdict */
  verdict: EvidenceVerdict;
  /** Drift score (0-1) */
  driftScore: number;
  /** Evidence gate status */
  evidenceStatus: EvidenceStatus;
  /** Whether drift blocked the simulation */
  driftBlocked: boolean;
  /** Evidence gate failure reason (if blocked) */
  evidenceGateReason?: string | undefined;
}

// ============================================================================
// Run List Endpoint DTOs
// ============================================================================

export type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface RunSummaryDto {
  /** Unique run identifier */
  runId: string;
  /** Scenario ID used */
  scenarioId: string;
  /** Seed used */
  seed: number;
  /** Simulation verdict */
  verdict: EvidenceVerdict;
  /** Drift score (0-1) */
  driftScore: number;
  /** Run creation timestamp (ISO 8601) */
  createdAt: string;
  /** Run status */
  status: RunStatus;
}

export interface PaginationDto {
  /** Number of items per page */
  limit: number;
  /** Current cursor (if paginated) */
  cursor?: string | undefined;
  /** Next page cursor (if more items) */
  nextCursor?: string | undefined;
  /** Whether more items exist */
  hasMore: boolean;
}

export interface RunListResponseDto {
  /** List of run summaries (newest first) */
  runs: RunSummaryDto[];
  /** Pagination info */
  pagination: PaginationDto;
}

// ============================================================================
// Latest Run Endpoint DTOs
// ============================================================================

export interface LatestRunResponseDto {
  /** Latest run summary or null if no runs */
  latestRun: RunSummaryDto | null;
}

// ============================================================================
// Run Detail Endpoint DTOs
// ============================================================================

export interface RunDetailResponseDto extends RunSummaryDto {
  /** Incident ID */
  incidentId: string;
  /** Tenant ID */
  tenantId: string;
  /** Evidence status */
  evidenceStatus: EvidenceStatus;
  /** Evidence gate failure reason */
  evidenceGateReason?: string | undefined;
  /** Whether drift blocked */
  driftBlocked: boolean;
  /** Baseline snapshot ID */
  baselineSnapshotId: string;
  /** Current snapshot ID */
  currentSnapshotId: string;
}

// ============================================================================
// Evidence Bundle Endpoint DTOs
// ============================================================================

export interface ExportBundleResponseDto {
  /** Unique bundle identifier */
  bundleId: string;
  /** Content hash for integrity verification */
  contentHash: string;
}

export interface BundleMetaDto {
  /** Bundle ID */
  bundleId: string;
  /** Export timestamp (ISO 8601) */
  exportedAt: string;
  /** Actor who exported */
  exportedBy: string;
  /** Format version */
  formatVersion: string;
}

export interface BundleResponseDto {
  /** Bundle metadata */
  meta: BundleMetaDto;
  /** Bundle payload (evidence chain, snapshots, etc.) */
  payload: unknown;
  /** Content hash */
  contentHash: string;
}

export interface VerifyBundleResponseDto {
  /** Whether verification passed */
  ok: boolean;
  /** Expected hash (from bundle) */
  expectedHash: string;
  /** Actual computed hash */
  actualHash: string;
}

// ============================================================================
// Legal Hold Endpoint DTOs
// ============================================================================

/**
 * Legal Hold Entry DTO
 * 
 * Minimal response - no calcResult, no tenantId (caller already knows their tenant).
 * isBaseline included for UI to show "cannot archive" state.
 */
export interface LegalHoldEntryDto {
  /** Snapshot ID */
  snapshotId: string;
  /** Incident ID */
  incidentId: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Hold reason */
  reason: string;
  /** Whether archived */
  archived: boolean;
  /** Whether this is the baseline snapshot (cannot be archived) */
  isBaseline: boolean;
}

export interface LegalHoldListResponseDto {
  /** List of legal hold entries */
  holds: LegalHoldEntryDto[];
  /** Total count */
  totalCount: number;
}

export interface ArchiveResponseDto {
  /** Whether archive succeeded */
  archived: boolean;
  /** Whether state changed (false if already archived) */
  changed: boolean;
  /** When snapshot was archived (ISO 8601) - Phase 10 */
  archivedAt?: string | undefined;
}

export interface LegalHoldStatsResponseDto {
  /** Total LEGAL_HOLD count */
  totalCount: number;
  /** Count by incident */
  byIncidentCount: Record<string, number>;
  /** Oldest hold timestamp (ISO 8601) or null */
  oldestHoldAt: string | null;
  /** Average age in days */
  averageAgeDays: number;
}
