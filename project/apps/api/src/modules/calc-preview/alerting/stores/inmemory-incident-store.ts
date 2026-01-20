/**
 * In-Memory Incident Store
 * 
 * Production Alerting System - Sprint 1
 * 
 * In-memory implementation for development and testing.
 * Uses per-alertKey mutex for atomic createOrGetActive.
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 */

import { IncidentStatus } from '../types/alerting.types';
import { makeIncidentId } from '../core/keys';
import { StoreNotFoundError } from '../errors/alerting.errors';
import {
  IIncidentStore,
  Incident,
  CreateOrGetActiveInput,
  CreateOrGetActiveResult,
  ResolveInput,
  AppendAlertInput,
} from './incident-store.interface';

/**
 * In-Memory Incident Store
 * 
 * Data structures:
 * - byId: Map<incidentId, Incident>
 * - activeByAlertKey: Map<alertKey, incidentId>
 * - byCorrelationId: Map<correlationId, Set<incidentId>>
 * - globalOutageIndex: Set<incidentId> (for fast listActiveGlobalOutages)
 * - locks: Map<alertKey, Promise<void>> (per-key mutex)
 */
export class InMemoryIncidentStore implements IIncidentStore {
  private byId = new Map<string, Incident>();
  private activeByAlertKey = new Map<string, string>();
  private byCorrelationId = new Map<string, Set<string>>();
  private globalOutageIndex = new Set<string>();
  
  // Per-alertKey mutex for atomic createOrGetActive
  private locks = new Map<string, Promise<void>>();

  /**
   * Acquire lock for alertKey
   * Returns a release function
   */
  private async acquireLock(alertKey: string): Promise<() => void> {
    // Wait for any existing lock
    const existingLock = this.locks.get(alertKey);
    if (existingLock) {
      await existingLock;
    }

    // Create new lock
    let releaseFn: () => void;
    const newLock = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    this.locks.set(alertKey, newLock);

    return () => {
      releaseFn();
      // Clean up lock from map after release
      if (this.locks.get(alertKey) === newLock) {
        this.locks.delete(alertKey);
      }
    };
  }

  async createOrGetActive(input: CreateOrGetActiveInput): Promise<CreateOrGetActiveResult> {
    const { alertKey, correlationId, nowMs, initial } = input;
    
    // Acquire per-alertKey lock for atomicity
    const release = await this.acquireLock(alertKey);
    
    try {
      // Check if active incident exists
      const existingId = this.activeByAlertKey.get(alertKey);
      if (existingId) {
        const existing = this.byId.get(existingId);
        if (existing && existing.status === IncidentStatus.Open) {
          return { incident: { ...existing }, created: false };
        }
      }

      // Create new incident
      const incidentId = makeIncidentId({ alertKey, timestampMs: nowMs });
      const nowIso = new Date(nowMs).toISOString();
      
      const incident: Incident = {
        incidentId,
        alertKey,
        correlationId,
        alertType: initial.alertType,
        category: initial.category,
        severity: initial.severity,
        tenantScope: initial.tenantScope,
        tenantId: initial.tenantId,
        status: IncidentStatus.Open,
        createdAt: nowIso,
        updatedAt: nowIso,
        alertCount: 1,
        lastAlertAt: nowIso,
        component: initial.component,
        kind: initial.kind ?? 'INCIDENT',
      };

      // Store incident
      this.byId.set(incidentId, incident);
      
      // Update active index
      this.activeByAlertKey.set(alertKey, incidentId);
      
      // Update correlation index
      let corrSet = this.byCorrelationId.get(correlationId);
      if (!corrSet) {
        corrSet = new Set();
        this.byCorrelationId.set(correlationId, corrSet);
      }
      corrSet.add(incidentId);

      // Update global outage index if applicable
      if (incident.kind === 'GLOBAL_OUTAGE') {
        this.globalOutageIndex.add(incidentId);
      }

      return { incident: { ...incident }, created: true };
    } finally {
      release();
    }
  }

  async get(incidentId: string): Promise<Incident | null> {
    const incident = this.byId.get(incidentId);
    return incident ? { ...incident } : null;
  }

  async findActiveByAlertKey(alertKey: string): Promise<Incident | null> {
    const incidentId = this.activeByAlertKey.get(alertKey);
    if (!incidentId) return null;
    
    const incident = this.byId.get(incidentId);
    if (!incident || incident.status !== IncidentStatus.Open) {
      return null;
    }
    
    return { ...incident };
  }

  async findByCorrelationId(correlationId: string): Promise<Incident[]> {
    const incidentIds = this.byCorrelationId.get(correlationId);
    if (!incidentIds) return [];
    
    const incidents: Incident[] = [];
    for (const id of incidentIds) {
      const incident = this.byId.get(id);
      if (incident) {
        incidents.push({ ...incident });
      }
    }
    
    return incidents;
  }

  async resolve(incidentId: string, input: ResolveInput): Promise<Incident> {
    const incident = this.byId.get(incidentId);
    if (!incident) {
      throw new StoreNotFoundError('InMemoryIncidentStore', incidentId);
    }

    const { nowMs, reason, resolvedBy, rootCauseHint } = input;
    const nowIso = new Date(nowMs).toISOString();
    const createdAtMs = new Date(incident.createdAt).getTime();
    const durationMs = nowMs - createdAtMs;

    // Update incident
    incident.status = IncidentStatus.Resolved;
    incident.resolvedAt = nowIso;
    incident.updatedAt = nowIso;
    incident.resolution = {
      reason,
      resolvedBy,
      rootCauseHint,
      durationMs,
    };

    // CRITICAL: Remove from active index
    if (this.activeByAlertKey.get(incident.alertKey) === incidentId) {
      this.activeByAlertKey.delete(incident.alertKey);
    }

    // Remove from global outage index if applicable
    if (incident.kind === 'GLOBAL_OUTAGE') {
      this.globalOutageIndex.delete(incidentId);
    }

    return { ...incident };
  }

  async appendAlert(incidentId: string, input: AppendAlertInput): Promise<Incident> {
    const incident = this.byId.get(incidentId);
    if (!incident) {
      throw new StoreNotFoundError('InMemoryIncidentStore', incidentId);
    }

    const { nowMs } = input;
    const nowIso = new Date(nowMs).toISOString();

    // Update incident
    incident.alertCount += 1;
    incident.lastAlertAt = nowIso;
    incident.updatedAt = nowIso;

    return { ...incident };
  }

  async listActiveGlobalOutages(): Promise<Incident[]> {
    const incidents: Incident[] = [];
    
    for (const incidentId of this.globalOutageIndex) {
      const incident = this.byId.get(incidentId);
      if (incident && incident.status === IncidentStatus.Open) {
        incidents.push({ ...incident });
      }
    }
    
    return incidents;
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Clear all data (for testing)
   * @internal
   */
  _clearForTesting(): void {
    this.byId.clear();
    this.activeByAlertKey.clear();
    this.byCorrelationId.clear();
    this.globalOutageIndex.clear();
    this.locks.clear();
  }

  /**
   * Get store stats (for testing)
   * @internal
   */
  _getStats(): {
    totalIncidents: number;
    activeIncidents: number;
    correlationGroups: number;
    activeGlobalOutages: number;
  } {
    return {
      totalIncidents: this.byId.size,
      activeIncidents: this.activeByAlertKey.size,
      correlationGroups: this.byCorrelationId.size,
      activeGlobalOutages: this.globalOutageIndex.size,
    };
  }
}
