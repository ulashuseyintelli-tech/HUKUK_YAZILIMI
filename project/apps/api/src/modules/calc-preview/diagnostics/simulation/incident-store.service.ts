/**
 * In-Memory Incident Store
 * 
 * Phase 8 - Sprint 2E
 * 
 * InMemory implementation of IIncidentStore.
 * Production adapter (DB) can be added later with same interface.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { Incident, IIncidentStore, IncidentRunSummary } from './incident.types';
import { IClock } from '../evidence/clock.service';

@Injectable()
export class InMemoryIncidentStore implements IIncidentStore {
  private readonly logger = new Logger(InMemoryIncidentStore.name);
  private readonly store: Map<string, Incident> = new Map();

  constructor(private readonly clock: IClock) {}

  async get(incidentId: string): Promise<Incident | null> {
    return this.store.get(incidentId) || null;
  }

  async save(incident: Incident): Promise<void> {
    const now = this.clock.now().toISOString();
    
    // Set timestamps
    if (!incident.createdAt) {
      incident.createdAt = now;
    }
    incident.updatedAt = now;
    
    // Initialize runCount if not set
    if (incident.runCount === undefined) {
      incident.runCount = 0;
    }

    this.store.set(incident.incidentId, incident);

    this.logger.debug('[IncidentStore] Incident saved', {
      incidentId: incident.incidentId,
      status: incident.status,
      hasBaseline: !!incident.baselineSnapshotId,
      runCount: incident.runCount,
    });
  }

  async setBaseline(incidentId: string, snapshotId: string): Promise<void> {
    const incident = this.store.get(incidentId);
    
    if (!incident) {
      this.logger.warn('[IncidentStore] setBaseline: incident not found', {
        incidentId,
      });
      return;
    }

    const now = this.clock.now().toISOString();
    incident.baselineSnapshotId = snapshotId;
    incident.baselineSetAt = now;
    incident.updatedAt = now;

    this.logger.debug('[IncidentStore] Baseline set', {
      incidentId,
      snapshotId,
    });
  }

  async clearBaseline(incidentId: string): Promise<void> {
    const incident = this.store.get(incidentId);
    
    if (!incident) {
      this.logger.warn('[IncidentStore] clearBaseline: incident not found', {
        incidentId,
      });
      return;
    }

    const now = this.clock.now().toISOString();
    delete incident.baselineSnapshotId;
    delete incident.baselineSetAt;
    incident.updatedAt = now;

    this.logger.debug('[IncidentStore] Baseline cleared', {
      incidentId,
    });
  }

  /**
   * Record a simulation run result
   * 
   * Updates lastRun and increments runCount.
   */
  async recordRun(incidentId: string, summary: IncidentRunSummary): Promise<void> {
    const incident = this.store.get(incidentId);
    
    if (!incident) {
      this.logger.warn('[IncidentStore] recordRun: incident not found', {
        incidentId,
      });
      return;
    }

    const now = this.clock.now().toISOString();
    incident.lastRun = summary;
    incident.runCount = (incident.runCount || 0) + 1;
    incident.updatedAt = now;

    this.logger.debug('[IncidentStore] Run recorded', {
      incidentId,
      runId: summary.runId,
      verdict: summary.verdict,
      runCount: incident.runCount,
    });
  }

  /**
   * Create a new incident (convenience method)
   */
  async create(params: {
    incidentId: string;
    tenantId: string;
    title: string;
    description?: string;
    severity: Incident['severity'];
  }): Promise<Incident> {
    const now = this.clock.now().toISOString();
    
    const incident: Incident = {
      incidentId: params.incidentId,
      tenantId: params.tenantId,
      title: params.title,
      status: 'OPEN',
      severity: params.severity,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Only add description if provided
    if (params.description !== undefined) {
      incident.description = params.description;
    }

    await this.save(incident);
    return incident;
  }

  /**
   * List incidents by tenant (for testing)
   */
  async listByTenant(tenantId: string): Promise<Incident[]> {
    const results: Incident[] = [];
    
    for (const incident of this.store.values()) {
      if (incident.tenantId === tenantId) {
        results.push(incident);
      }
    }

    // Sort by createdAt DESC
    results.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return results;
  }

  /**
   * Clear all incidents (for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get store size (for testing)
   */
  size(): number {
    return this.store.size;
  }
}
