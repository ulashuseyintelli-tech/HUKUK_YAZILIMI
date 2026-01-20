/**
 * Incident Store Interface
 * 
 * Production Alerting System - Sprint 1
 * 
 * Contract for incident storage with atomic operations.
 * 
 * Key invariants:
 * - Same alertKey → same active incident (no duplicates)
 * - resolve() removes active mapping
 * - correlationId index maintained
 * - createOrGetActive is ATOMIC
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 * @see Requirements 12.2, 13.1, 16.1
 */

import {
  AlertCategory,
  AlertSeverity,
  AlertType,
  IncidentStatus,
  ResolutionReason,
  TenantScope,
} from '../types/alerting.types';

// ============================================================================
// INCIDENT MODEL
// ============================================================================

/**
 * Incident kind - distinguishes regular incidents from global outages
 */
export type IncidentKind = 'INCIDENT' | 'GLOBAL_OUTAGE';

/**
 * Incident model for store
 */
export interface Incident {
  /** Unique incident ID */
  incidentId: string;
  /** Alert key (dedupe key) */
  alertKey: string;
  /** Correlation ID */
  correlationId: string;
  /** Alert type */
  alertType: AlertType;
  /** Alert category */
  category: AlertCategory;
  /** Alert severity */
  severity: AlertSeverity;
  /** Tenant scope */
  tenantScope: TenantScope;
  /** Tenant ID (single_tenant only) */
  tenantId?: string | undefined;
  /** Incident status */
  status: IncidentStatus;
  /** Created timestamp (ISO 8601) */
  createdAt: string;
  /** Updated timestamp (ISO 8601) */
  updatedAt: string;
  /** Resolved timestamp (ISO 8601) */
  resolvedAt?: string | undefined;
  /** Resolution details */
  resolution?: IncidentResolution | undefined;
  /** Aggregated alert count */
  alertCount: number;
  /** Last alert timestamp (ISO 8601) */
  lastAlertAt: string;
  /** Source component */
  component: string;
  /** Incident kind (for global outage filtering) */
  kind: IncidentKind;
}

/**
 * Incident resolution details
 */
export interface IncidentResolution {
  /** Resolution reason */
  reason: ResolutionReason;
  /** Root cause hint */
  rootCauseHint?: string | undefined;
  /** Resolved by (actor ID) */
  resolvedBy?: string | undefined;
  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for createOrGetActive
 */
export interface CreateOrGetActiveInput {
  /** Alert key (dedupe key) */
  alertKey: string;
  /** Correlation ID */
  correlationId: string;
  /** Current time in milliseconds */
  nowMs: number;
  /** Initial incident data (used only if creating new) */
  initial: {
    alertType: AlertType;
    category: AlertCategory;
    severity: AlertSeverity;
    tenantScope: TenantScope;
    tenantId?: string;
    component: string;
    kind?: IncidentKind;
  };
}

/**
 * Result of createOrGetActive
 */
export interface CreateOrGetActiveResult {
  /** The incident (existing or newly created) */
  incident: Incident;
  /** True if a new incident was created */
  created: boolean;
}

/**
 * Input for resolve
 */
export interface ResolveInput {
  /** Current time in milliseconds */
  nowMs: number;
  /** Resolution reason */
  reason: ResolutionReason;
  /** Resolved by (actor ID) */
  resolvedBy?: string;
  /** Root cause hint */
  rootCauseHint?: string;
}

/**
 * Input for appendAlert
 */
export interface AppendAlertInput {
  /** Current time in milliseconds */
  nowMs: number;
  /** Alert ID being appended */
  alertId: string;
}

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Incident Store Interface
 * 
 * Implementations:
 * - InMemoryIncidentStore (dev/test)
 * - RedisIncidentStore (production)
 */
export interface IIncidentStore {
  /**
   * Create a new incident or get existing active incident for alertKey
   * 
   * ATOMIC: Must guarantee only one active incident per alertKey
   * even under concurrent calls.
   * 
   * @param input - Creation input
   * @returns Result with incident and created flag
   */
  createOrGetActive(input: CreateOrGetActiveInput): Promise<CreateOrGetActiveResult>;

  /**
   * Get incident by ID
   * 
   * @param incidentId - Incident ID
   * @returns Incident or null if not found
   */
  get(incidentId: string): Promise<Incident | null>;

  /**
   * Find active incident by alert key
   * 
   * @param alertKey - Alert key
   * @returns Active incident or null
   */
  findActiveByAlertKey(alertKey: string): Promise<Incident | null>;

  /**
   * Find incidents by correlation ID
   * 
   * @param correlationId - Correlation ID
   * @returns Array of related incidents
   */
  findByCorrelationId(correlationId: string): Promise<Incident[]>;

  /**
   * Resolve an incident
   * 
   * - Sets status to RESOLVED
   * - Sets resolvedAt timestamp
   * - Calculates durationMs
   * - REMOVES active:{alertKey} mapping
   * 
   * @param incidentId - Incident ID
   * @param input - Resolution input
   * @returns Updated incident
   * @throws StoreNotFoundError if incident not found
   */
  resolve(incidentId: string, input: ResolveInput): Promise<Incident>;

  /**
   * Append an alert to an incident
   * 
   * - Increments alertCount
   * - Updates lastAlertAt
   * - Updates updatedAt
   * 
   * @param incidentId - Incident ID
   * @param input - Append input
   * @returns Updated incident
   * @throws StoreNotFoundError if incident not found
   */
  appendAlert(incidentId: string, input: AppendAlertInput): Promise<Incident>;

  /**
   * List active global outage incidents
   * 
   * Returns incidents where:
   * - status = OPEN
   * - kind = GLOBAL_OUTAGE
   * 
   * @returns Array of active global outage incidents
   */
  listActiveGlobalOutages(): Promise<Incident[]>;
}

/**
 * DI token for incident store
 */
export const INCIDENT_STORE = Symbol('INCIDENT_STORE');
