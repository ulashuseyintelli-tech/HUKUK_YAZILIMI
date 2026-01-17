/**
 * Incident Types
 * 
 * Phase 8 - Sprint 2E
 * 
 * Incident entity with baseline snapshot pointer and run summary.
 * Baseline pointer prevents "baseline deleted" scenario.
 * Run summary provides operational visibility.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { RetentionPolicy } from '../evidence/retention-policy';
import { EvidenceVerdict } from './simulation.types';

/**
 * Incident status
 */
export type IncidentStatus = 
  | 'OPEN'
  | 'INVESTIGATING'
  | 'MITIGATING'
  | 'RESOLVED'
  | 'CLOSED';

/**
 * Incident severity
 */
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Evidence status for run summary
 */
export type EvidenceStatus = 'PASSED' | 'FAILED';

/**
 * Incident run summary
 * 
 * Captures the result of a simulation run for operational visibility.
 * Answers: "What happened in the last run?"
 */
export interface IncidentRunSummary {
  /** Run ID */
  runId: string;
  /** Final verdict */
  verdict: EvidenceVerdict;
  /** Drift score (0-1) */
  driftScore: number;
  /** Evidence gate status */
  evidenceStatus: EvidenceStatus;
  /** Evidence gate failure reason (if FAILED) */
  evidenceGateReason?: string;
  /** Was the run blocked due to drift? */
  driftBlocked: boolean;
  /** Baseline snapshot ID used */
  baselineSnapshotId: string;
  /** Current snapshot ID used */
  currentSnapshotId: string;
  /** Run timestamp */
  runAt: string;
}

/**
 * Incident entity
 * 
 * Contains baseline snapshot pointer for drift comparison.
 * Baseline is auto-protected with LEGAL_HOLD on simulation start.
 */
export interface Incident {
  /** Unique incident ID */
  incidentId: string;
  /** Tenant ID */
  tenantId: string;
  /** Incident title */
  title: string;
  /** Incident description */
  description?: string;
  /** Current status */
  status: IncidentStatus;
  /** Severity level */
  severity: IncidentSeverity;
  
  /** 
   * Baseline snapshot ID for drift comparison
   * 
   * Selection priority:
   * 1. Last PROMOTED snapshot (if exists)
   * 2. Latest STANDARD snapshot (fallback)
   * 
   * Auto-protected with LEGAL_HOLD on simulation start.
   */
  baselineSnapshotId?: string;
  
  /** When baseline was set */
  baselineSetAt?: string;
  
  /** Last simulation run summary */
  lastRun?: IncidentRunSummary;
  
  /** Total number of simulation runs */
  runCount: number;
  
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

/**
 * Baseline selection result
 */
export interface BaselineSelectionResult {
  /** Selected snapshot ID (null if no snapshots available) */
  snapshotId: string | null;
  /** Selection source */
  source: 'PROMOTED' | 'STANDARD' | 'NONE';
  /** Snapshot retention policy at selection time */
  policy?: RetentionPolicy;
  /** Selection reason */
  reason: string;
}

/**
 * Baseline protection result
 */
export interface BaselineProtectionResult {
  /** Whether protection was applied */
  success: boolean;
  /** Whether policy changed (false if already LEGAL_HOLD) */
  changed: boolean;
  /** Previous policy */
  previousPolicy?: RetentionPolicy;
  /** Error if protection failed */
  error?: 'SNAPSHOT_NOT_FOUND' | 'NO_BASELINE';
  /** Error message */
  errorMessage?: string;
}

/**
 * Incident store interface
 */
export interface IIncidentStore {
  /** Get incident by ID */
  get(incidentId: string): Promise<Incident | null>;
  
  /** Save/update incident */
  save(incident: Incident): Promise<void>;
  
  /** Update baseline pointer */
  setBaseline(incidentId: string, snapshotId: string): Promise<void>;
  
  /** Clear baseline pointer */
  clearBaseline(incidentId: string): Promise<void>;
  
  /** Record a simulation run result */
  recordRun(incidentId: string, summary: IncidentRunSummary): Promise<void>;
}
