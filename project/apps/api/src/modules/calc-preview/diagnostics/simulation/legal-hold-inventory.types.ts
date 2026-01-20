/**
 * Legal Hold Inventory Types
 * 
 * Phase 8 - Sprint 2E
 * 
 * Types for legal hold inventory management.
 * Provides visibility into LEGAL_HOLD snapshot accumulation.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

/**
 * Legal hold entry
 * 
 * Phase 10: Added archive metadata fields (archivedAt, archivedBy, archivedReason)
 */
export interface LegalHoldEntry {
  /** Snapshot ID */
  snapshotId: string;
  /** Incident ID */
  incidentId: string;
  /** Tenant ID */
  tenantId: string;
  /** When LEGAL_HOLD was applied */
  appliedAt: string;
  /** Age in days since LEGAL_HOLD applied */
  ageDays: number;
  /** Whether this is the current baseline for the incident */
  isBaseline: boolean;
  /** Whether this snapshot is archived */
  archived: boolean;
  /** When snapshot was archived (Phase 10 - DB-backed) */
  archivedAt?: string | undefined;
  /** Who archived the snapshot (Phase 10 - DB-backed) */
  archivedBy?: string | undefined;
  /** Reason for archiving (Phase 10 - DB-backed) */
  archivedReason?: string | undefined;
}

/**
 * Legal hold statistics
 */
export interface LegalHoldStats {
  /** Total LEGAL_HOLD snapshots */
  totalCount: number;
  /** Count by incident */
  byIncident: Record<string, number>;
  /** Oldest LEGAL_HOLD timestamp */
  oldestHoldAt: string | null;
  /** Average age in days */
  averageAgeDays: number;
  /** Incidents exceeding threshold */
  incidentsExceedingThreshold: string[];
}

/**
 * Legal hold inventory options
 */
export interface LegalHoldInventoryOptions {
  /** Alert threshold per incident (default: 5) */
  alertThreshold?: number;
  /** Include archived entries (default: false) */
  includeArchived?: boolean;
}

/**
 * Archive legal hold result
 * 
 * Phase 10: Added archivedAt field for DB-backed archive state
 */
export interface ArchiveLegalHoldResult {
  /** Whether archive succeeded */
  success: boolean;
  /** Whether snapshot was actually archived (false if already archived) */
  changed: boolean;
  /** When snapshot was archived (ISO 8601) - Phase 10 */
  archivedAt?: string | undefined;
  /** Error code if failed */
  error?: 'SNAPSHOT_NOT_FOUND' | 'NOT_LEGAL_HOLD' | 'IS_BASELINE';
  /** Error message */
  errorMessage?: string;
}

/**
 * Default alert threshold per incident
 */
export const DEFAULT_LEGAL_HOLD_THRESHOLD = 5;
