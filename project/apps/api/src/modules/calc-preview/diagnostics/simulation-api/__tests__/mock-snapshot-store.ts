/**
 * Mock Snapshot Store for Tests
 * 
 * Phase 9B.5 - Test Support
 * 
 * In-memory implementation of ISnapshotStore for unit tests.
 * This replaces direct InMemorySnapshotStore usage in tests.
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import {
  ISnapshotStore,
  SimulationSnapshot,
  CreateSnapshotInput,
  ApplyLegalHoldResult,
  SetRetentionPolicyResult,
  LegalHoldStats,
  MarkArchivedInput,
  MarkArchivedResult,
  DeleteExpiredResult,
} from '../../persistence/snapshot-store.interface';
import { RetentionPolicy, isTransitionAllowed } from '../../evidence/retention-policy';
import { IClock } from '../../evidence/clock.service';

/**
 * Mock Snapshot Store for testing
 * 
 * Implements ISnapshotStore interface with in-memory storage.
 * Suitable for unit tests that don't need PostgreSQL.
 */
export class MockSnapshotStore implements ISnapshotStore {
  private readonly snapshots = new Map<string, SimulationSnapshot>();

  constructor(private readonly clock: IClock) {}

  // ============================================================================
  // TenantId Validation (Test Safety)
  // ============================================================================

  /**
   * Validate tenantId is provided
   * 
   * This catches "tenantId forgotten" bugs at test time.
   * 
   * @throws Error if tenantId is missing or empty
   */
  private validateTenantId(tenantId: string, methodName: string): void {
    if (!tenantId) {
      throw new Error(`tenantId is required for ${methodName}()`);
    }
  }

  async createSnapshot(input: CreateSnapshotInput): Promise<SimulationSnapshot> {
    this.validateTenantId(input.tenantId, 'createSnapshot');
    const now = this.clock.nowIso();
    
    const snapshot: SimulationSnapshot = {
      snapshotId: input.snapshotId,
      tenantId: input.tenantId,
      incidentId: input.incidentId,
      runId: input.runId,
      snapshotKind: input.snapshotKind,
      isBaseline: input.isBaseline ?? false,
      verdict: input.verdict,
      driftScore: input.driftScore,
      calcResult: input.calcResult,
      calcResultNorm: input.calcResultNorm,
      calcHash: input.calcHash,
      legalHold: false,
      legalHoldReason: undefined,
      retentionPolicy: input.retentionPolicy ?? 'STANDARD',
      expiresAt: this.calculateExpiresAt(input.retentionPolicy ?? 'STANDARD', now),
      createdAt: now,
    };

    this.snapshots.set(input.snapshotId, snapshot);
    return snapshot;
  }

  async promoteToBaseline(tenantId: string, snapshotId: string): Promise<void> {
    this.validateTenantId(tenantId, 'promoteToBaseline');
    
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    
    // Tenant isolation: treat mismatch as not found (security)
    if (snapshot.tenantId !== tenantId) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    
    snapshot.isBaseline = true;
  }

  async findBaseline(tenantId: string, incidentId: string): Promise<SimulationSnapshot | null> {
    this.validateTenantId(tenantId, 'findBaseline');
    
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.tenantId === tenantId && 
          snapshot.incidentId === incidentId && 
          snapshot.isBaseline) {
        return snapshot;
      }
    }
    return null;
  }

  async applyLegalHold(
    tenantId: string,
    snapshotId: string,
    reason?: string | undefined,
  ): Promise<ApplyLegalHoldResult> {
    this.validateTenantId(tenantId, 'applyLegalHold');
    
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    // Tenant isolation: treat mismatch as not found (security)
    if (snapshot.tenantId !== tenantId) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    if (snapshot.legalHold) {
      return {
        success: true,
        changed: false,
        previousPolicy: snapshot.retentionPolicy,
        newPolicy: 'LEGAL_HOLD',
      };
    }

    const previousPolicy = snapshot.retentionPolicy;
    snapshot.legalHold = true;
    snapshot.legalHoldReason = reason;
    snapshot.retentionPolicy = 'LEGAL_HOLD';
    snapshot.expiresAt = undefined;

    return {
      success: true,
      changed: true,
      previousPolicy,
      newPolicy: 'LEGAL_HOLD',
    };
  }

  async setRetentionPolicy(
    tenantId: string,
    snapshotId: string,
    policy: RetentionPolicy,
  ): Promise<SetRetentionPolicyResult> {
    this.validateTenantId(tenantId, 'setRetentionPolicy');
    
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    // Tenant isolation: treat mismatch as not found (security)
    if (snapshot.tenantId !== tenantId) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    const previousPolicy = snapshot.retentionPolicy;
    
    if (!isTransitionAllowed(previousPolicy, policy)) {
      return {
        success: false,
        changed: false,
        previousPolicy,
        error: 'RETENTION_DOWNGRADE_FORBIDDEN',
      };
    }

    if (previousPolicy === policy) {
      return {
        success: true,
        changed: false,
        previousPolicy,
        newPolicy: policy,
      };
    }

    snapshot.retentionPolicy = policy;
    snapshot.expiresAt = this.calculateExpiresAt(policy, snapshot.createdAt);

    if (policy === 'LEGAL_HOLD') {
      snapshot.legalHold = true;
    }

    return {
      success: true,
      changed: true,
      previousPolicy,
      newPolicy: policy,
      newExpiresAt: snapshot.expiresAt ?? null,
    };
  }

  async findById(snapshotId: string): Promise<SimulationSnapshot | null> {
    return this.snapshots.get(snapshotId) ?? null;
  }

  async findByIncidentId(tenantId: string, incidentId: string): Promise<SimulationSnapshot[]> {
    this.validateTenantId(tenantId, 'findByIncidentId');
    
    const results: SimulationSnapshot[] = [];
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.tenantId === tenantId && snapshot.incidentId === incidentId) {
        results.push(snapshot);
      }
    }
    // Sort by createdAt DESC
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByRunId(tenantId: string, runId: string): Promise<SimulationSnapshot[]> {
    this.validateTenantId(tenantId, 'findByRunId');
    
    const results: SimulationSnapshot[] = [];
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.tenantId === tenantId && snapshot.runId === runId) {
        results.push(snapshot);
      }
    }
    return results;
  }

  async findWithLegalHold(tenantId: string): Promise<SimulationSnapshot[]> {
    this.validateTenantId(tenantId, 'findWithLegalHold');
    
    const results: SimulationSnapshot[] = [];
    for (const snapshot of this.snapshots.values()) {
      // Phase 10: Exclude archived snapshots by default
      if (snapshot.tenantId === tenantId && snapshot.legalHold && !snapshot.archivedAt) {
        results.push(snapshot);
      }
    }
    return results;
  }

  async markArchived(
    tenantId: string,
    snapshotId: string,
    input: MarkArchivedInput,
  ): Promise<MarkArchivedResult> {
    this.validateTenantId(tenantId, 'markArchived');
    
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    // Tenant isolation: treat mismatch as not found (security)
    if (snapshot.tenantId !== tenantId) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
      };
    }

    // Only LEGAL_HOLD snapshots can be archived
    if (snapshot.retentionPolicy !== 'LEGAL_HOLD') {
      return {
        success: false,
        changed: false,
        error: 'NOT_LEGAL_HOLD',
      };
    }

    // Baseline snapshots cannot be archived
    if (snapshot.isBaseline) {
      return {
        success: false,
        changed: false,
        error: 'IS_BASELINE',
      };
    }

    // Idempotent: already archived
    if (snapshot.archivedAt) {
      return {
        success: true,
        changed: false,
        archivedAt: snapshot.archivedAt,
      };
    }

    // Archive the snapshot
    const archivedAt = this.clock.nowIso();
    snapshot.archivedAt = archivedAt;
    snapshot.archivedBy = input.archivedBy;
    snapshot.archivedReason = input.reason;

    return {
      success: true,
      changed: true,
      archivedAt,
    };
  }

  async getLegalHoldStats(tenantId: string): Promise<LegalHoldStats> {
    this.validateTenantId(tenantId, 'getLegalHoldStats');
    
    const legalHoldSnapshots: SimulationSnapshot[] = [];
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.tenantId === tenantId && snapshot.legalHold) {
        legalHoldSnapshots.push(snapshot);
      }
    }

    const byIncidentCount: Record<string, number> = {};
    let oldestHoldAt: string | null = null;
    let totalAgeDays = 0;
    const now = this.clock.now();

    for (const snapshot of legalHoldSnapshots) {
      byIncidentCount[snapshot.incidentId] = (byIncidentCount[snapshot.incidentId] || 0) + 1;
      
      if (!oldestHoldAt || snapshot.createdAt < oldestHoldAt) {
        oldestHoldAt = snapshot.createdAt;
      }

      const createdAt = new Date(snapshot.createdAt);
      const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      totalAgeDays += ageDays;
    }

    return {
      totalCount: legalHoldSnapshots.length,
      byIncidentCount,
      oldestHoldAt,
      averageAgeDays: legalHoldSnapshots.length > 0 ? totalAgeDays / legalHoldSnapshots.length : 0,
    };
  }

  // ============================================================================
  // Test Helpers (not part of ISnapshotStore)
  // ============================================================================

  /**
   * Clear all snapshots (for test cleanup)
   */
  clear(): void {
    this.snapshots.clear();
  }

  /**
   * Get all snapshots (for test assertions)
   */
  getAll(): SimulationSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  /**
   * Delete expired snapshots (Phase 10 - Hardened)
   * 
   * DOKUNULMAZLAR (Untouchables) - NEVER deleted:
   * - retentionPolicy = 'LEGAL_HOLD' → never delete
   * - retentionPolicy = 'PROMOTED' → never delete
   * - isBaseline = true → never delete
   */
  async deleteExpired(tenantId: string): Promise<DeleteExpiredResult> {
    this.validateTenantId(tenantId, 'deleteExpired');
    
    const now = this.clock.now();
    let deletedCount = 0;
    const protectedBy = {
      legalHold: 0,
      promoted: 0,
      baseline: 0,
    };

    for (const [id, snapshot] of this.snapshots.entries()) {
      // Tenant isolation
      if (snapshot.tenantId !== tenantId) {
        continue;
      }
      
      // Check if expired
      if (!snapshot.expiresAt || new Date(snapshot.expiresAt) >= now) {
        continue;
      }
      
      // DOKUNULMAZLAR - never delete
      if (snapshot.retentionPolicy === 'LEGAL_HOLD') {
        protectedBy.legalHold++;
        continue;
      }
      if (snapshot.retentionPolicy === 'PROMOTED') {
        protectedBy.promoted++;
        continue;
      }
      if (snapshot.isBaseline) {
        protectedBy.baseline++;
        continue;
      }
      
      // Safe to delete - STANDARD, non-baseline, expired
      this.snapshots.delete(id);
      deletedCount++;
    }

    return {
      deletedCount,
      protectedCount: protectedBy.legalHold + protectedBy.promoted + protectedBy.baseline,
      protectedBy,
    };
  }

  private calculateExpiresAt(policy: RetentionPolicy, createdAt: string): string | undefined {
    if (policy === 'LEGAL_HOLD') {
      return undefined;
    }

    const created = new Date(createdAt);
    const hours = policy === 'PROMOTED' ? 168 : 72; // 7 days for PROMOTED, 3 days for STANDARD
    const expiresAt = new Date(created.getTime() + hours * 60 * 60 * 1000);
    return expiresAt.toISOString();
  }
}
