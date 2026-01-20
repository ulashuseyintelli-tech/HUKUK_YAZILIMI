/**
 * Snapshot Store Service
 * 
 * Phase 9B.5 - Snapshot Store Interface Cutover
 * 
 * Implements ISnapshotStore interface.
 * Thin orchestration layer over ISnapshotRepository.
 * NO business logic - all invariants enforced in repository layer.
 * 
 * LOCKED RULES:
 * - calcHash MUST be provided by caller (calculated in determinism.ts ONLY)
 * - calcResultNorm MUST be provided by caller
 * - No hash calculation in this service
 * - No Map, no in-memory storage
 * - tenantId required on all queries (security barrier)
 * 
 * Responsibilities:
 * - Delegation to repository
 * - Input validation (calcHash required)
 * - Tenant isolation enforcement
 * - Metrics emission
 * - Logging
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  ISnapshotRepository,
  Snapshot,
  SnapshotInput,
  ApplyLegalHoldResult as RepoApplyLegalHoldResult,
  SetRetentionPolicyResult as RepoSetRetentionPolicyResult,
  LegalHoldStats as RepoLegalHoldStats,
} from './snapshot-repository.interface';
import {
  ISnapshotStore,
  SimulationSnapshot,
  CreateSnapshotInput,
  ApplyLegalHoldResult,
  SetRetentionPolicyResult,
  LegalHoldStats,
  SnapshotKind,
  EvidenceVerdict,
} from './snapshot-store.interface';
import { RetentionPolicy } from '../evidence/retention-policy';

// ============================================================================
// Injection Token (Repository)
// ============================================================================

export const SNAPSHOT_REPOSITORY = Symbol('SNAPSHOT_REPOSITORY');

// ============================================================================
// Validation Error
// ============================================================================

export class SnapshotValidationError extends Error {
  readonly code = 'SNAPSHOT_VALIDATION_ERROR';
  
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

// ============================================================================
// Metrics Interface
// ============================================================================

interface IMetricsEmitter {
  increment(metric: string, tags?: Record<string, string>): void;
  timing(metric: string, durationMs: number, tags?: Record<string, string>): void;
}

class NoOpMetricsEmitter implements IMetricsEmitter {
  increment(_metric: string, _tags?: Record<string, string>): void {}
  timing(_metric: string, _durationMs: number, _tags?: Record<string, string>): void {}
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class SnapshotStoreService implements ISnapshotStore {
  private readonly logger = new Logger(SnapshotStoreService.name);
  private readonly metrics: IMetricsEmitter;

  constructor(
    @Inject(SNAPSHOT_REPOSITORY)
    private readonly repository: ISnapshotRepository,
    metrics?: IMetricsEmitter,
  ) {
    this.metrics = metrics ?? new NoOpMetricsEmitter();
  }

  // ==========================================================================
  // Create
  // ==========================================================================

  /**
   * Create a new snapshot
   * 
   * LOCKED: calcHash and calcResultNorm are REQUIRED.
   * This service does NOT calculate hashes - that's determinism.ts's job.
   * 
   * @throws SnapshotValidationError if calcHash or calcResultNorm missing
   * @throws BaselineAlreadyExistsError if isBaseline=true and baseline exists
   */
  async createSnapshot(input: CreateSnapshotInput): Promise<SimulationSnapshot> {
    const start = Date.now();
    
    // Validate required fields
    this.validateInput(input);
    
    try {
      const repoInput: SnapshotInput = {
        snapshotId: input.snapshotId,
        tenantId: input.tenantId,
        incidentId: input.incidentId,
        runId: input.runId,
        snapshotKind: input.snapshotKind,
        verdict: input.verdict,
        driftScore: input.driftScore,
        calcResult: input.calcResult,
        calcResultNorm: input.calcResultNorm,
        calcHash: input.calcHash,
        isBaseline: input.isBaseline,
        retentionPolicy: input.retentionPolicy,
      };
      
      const snapshot = await this.repository.insert(repoInput);
      
      this.metrics.increment('truth_layer_snapshot_created', {
        kind: input.snapshotKind,
        verdict: input.verdict,
        tenantId: input.tenantId,
      });
      this.metrics.timing('truth_layer_snapshot_create_latency_ms', Date.now() - start);
      
      this.logger.debug('[SnapshotStore] Snapshot created', {
        snapshotId: snapshot.snapshotId,
        incidentId: snapshot.incidentId,
        tenantId: snapshot.tenantId,
        calcHash: snapshot.calcHash.substring(0, 8) + '...',
      });
      
      return this.mapToSimulationSnapshot(snapshot);
    } catch (error) {
      this.metrics.increment('truth_layer_snapshot_create_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  // ==========================================================================
  // Baseline
  // ==========================================================================

  /**
   * Promote snapshot to baseline
   * 
   * Idempotent - no error if already baseline.
   * 
   * TENANT ISOLATION: Returns void (not found) if tenant mismatch.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param snapshotId Snapshot ID
   * @throws EntityNotFoundError if snapshot not found OR tenant mismatch
   * @throws BaselineAlreadyExistsError if another baseline exists
   */
  async promoteToBaseline(tenantId: string, snapshotId: string): Promise<void> {
    const start = Date.now();
    
    try {
      // Verify tenant before mutation
      const snapshot = await this.repository.findById(snapshotId);
      if (!snapshot || snapshot.tenantId !== tenantId) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }
      
      await this.repository.markAsBaseline(snapshotId);
      
      this.metrics.increment('truth_layer_snapshot_promoted');
      this.metrics.timing('truth_layer_promote_latency_ms', Date.now() - start);
      
      this.logger.debug('[SnapshotStore] Snapshot promoted to baseline', {
        tenantId,
        snapshotId,
      });
    } catch (error) {
      this.metrics.increment('truth_layer_promote_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Find baseline snapshot for tenant+incident
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param incidentId Incident ID
   * @returns Baseline snapshot or null
   */
  async findBaseline(tenantId: string, incidentId: string): Promise<SimulationSnapshot | null> {
    const snapshot = await this.repository.findBaseline(incidentId);
    
    if (!snapshot) {
      return null;
    }
    
    // Verify tenant isolation
    if (snapshot.tenantId !== tenantId) {
      this.logger.warn('[SnapshotStore] Tenant mismatch on findBaseline', {
        requestedTenantId: tenantId,
        actualTenantId: snapshot.tenantId,
        incidentId,
      });
      return null;
    }
    
    return this.mapToSimulationSnapshot(snapshot);
  }

  // ==========================================================================
  // Legal Hold & Retention (Upgrade-Only)
  // ==========================================================================

  /**
   * Apply legal hold to snapshot
   * 
   * Idempotent - no error if already has legal hold.
   * 
   * TENANT ISOLATION: Returns SNAPSHOT_NOT_FOUND if tenant mismatch.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param snapshotId Snapshot ID
   * @param reason Optional reason for legal hold
   */
  async applyLegalHold(
    tenantId: string,
    snapshotId: string,
    reason?: string | undefined,
  ): Promise<ApplyLegalHoldResult> {
    const start = Date.now();
    
    try {
      // Verify tenant before mutation
      const snapshot = await this.repository.findById(snapshotId);
      if (!snapshot || snapshot.tenantId !== tenantId) {
        return {
          success: false,
          changed: false,
          error: 'SNAPSHOT_NOT_FOUND',
        };
      }
      
      const result = await this.repository.applyLegalHold(snapshotId, reason);
      
      if (result.success && result.changed) {
        this.metrics.increment('truth_layer_legal_hold_applied');
      }
      this.metrics.timing('truth_layer_legal_hold_latency_ms', Date.now() - start);
      
      this.logger.debug('[SnapshotStore] Legal hold applied', {
        tenantId,
        snapshotId,
        changed: result.changed,
      });
      
      return this.mapApplyLegalHoldResult(result);
    } catch (error) {
      this.metrics.increment('truth_layer_legal_hold_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Set retention policy for snapshot
   * 
   * Upgrade-only: STANDARD → PROMOTED → LEGAL_HOLD
   * 
   * TENANT ISOLATION: Returns SNAPSHOT_NOT_FOUND if tenant mismatch.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param snapshotId Snapshot ID
   * @param policy New retention policy
   */
  async setRetentionPolicy(
    tenantId: string,
    snapshotId: string,
    policy: RetentionPolicy,
  ): Promise<SetRetentionPolicyResult> {
    const start = Date.now();
    
    try {
      // Verify tenant before mutation
      const snapshot = await this.repository.findById(snapshotId);
      if (!snapshot || snapshot.tenantId !== tenantId) {
        return {
          success: false,
          changed: false,
          error: 'SNAPSHOT_NOT_FOUND',
        };
      }
      
      const result = await this.repository.setRetentionPolicy(snapshotId, policy);
      
      if (result.success && result.changed) {
        this.metrics.increment('truth_layer_retention_policy_changed', {
          from: result.previousPolicy ?? 'unknown',
          to: policy,
        });
      }
      this.metrics.timing('truth_layer_retention_policy_latency_ms', Date.now() - start);
      
      this.logger.debug('[SnapshotStore] Retention policy set', {
        tenantId,
        snapshotId,
        policy,
        changed: result.changed,
      });
      
      return this.mapSetRetentionPolicyResult(result);
    } catch (error) {
      this.metrics.increment('truth_layer_retention_policy_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  // ==========================================================================
  // Queries (Tenant-Aware)
  // ==========================================================================

  /**
   * Find snapshot by ID
   */
  async findById(snapshotId: string): Promise<SimulationSnapshot | null> {
    const snapshot = await this.repository.findById(snapshotId);
    return snapshot ? this.mapToSimulationSnapshot(snapshot) : null;
  }

  /**
   * Find snapshots by tenant+incident
   * 
   * Results ordered by createdAt DESC (newest first).
   */
  async findByIncidentId(tenantId: string, incidentId: string): Promise<SimulationSnapshot[]> {
    // Repository doesn't have tenant filter yet, so we filter in app layer
    // TODO: Add tenantId filter to repository in Phase 9B.5
    const snapshots = await this.repository.findByIncidentId(incidentId);
    
    return snapshots
      .filter(s => s.tenantId === tenantId)
      .map(s => this.mapToSimulationSnapshot(s));
  }

  /**
   * Find snapshots by tenant+run
   */
  async findByRunId(tenantId: string, runId: string): Promise<SimulationSnapshot[]> {
    // Repository doesn't have tenant filter yet, so we filter in app layer
    // TODO: Add tenantId filter to repository in Phase 9B.5
    const snapshots = await this.repository.findByRunId(runId);
    
    return snapshots
      .filter(s => s.tenantId === tenantId)
      .map(s => this.mapToSimulationSnapshot(s));
  }

  /**
   * Find snapshots with legal hold
   */
  async findWithLegalHold(tenantId: string): Promise<SimulationSnapshot[]> {
    const snapshots = await this.repository.findWithLegalHold(tenantId);
    return snapshots.map(s => this.mapToSimulationSnapshot(s));
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get legal hold statistics
   */
  async getLegalHoldStats(tenantId: string): Promise<LegalHoldStats> {
    const stats = await this.repository.getLegalHoldStats(tenantId);
    return this.mapLegalHoldStats(stats);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private validateInput(input: CreateSnapshotInput): void {
    // calcHash is REQUIRED - must be calculated in determinism.ts
    if (!input.calcHash || input.calcHash.trim() === '') {
      throw new SnapshotValidationError(
        'calcHash',
        'calcHash is required. It must be calculated using canonicalHash() from determinism.ts.',
      );
    }
    
    // calcResultNorm is REQUIRED
    if (input.calcResultNorm === undefined || input.calcResultNorm === null) {
      throw new SnapshotValidationError(
        'calcResultNorm',
        'calcResultNorm is required. It must be the normalized calculation result.',
      );
    }
    
    // Validate hash format (SHA256 = 64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(input.calcHash)) {
      throw new SnapshotValidationError(
        'calcHash',
        `calcHash must be a valid SHA256 hash (64 hex characters). Got: ${input.calcHash.substring(0, 20)}...`,
      );
    }
    
    // Validate driftScore range
    if (input.driftScore < 0 || input.driftScore > 1) {
      throw new SnapshotValidationError(
        'driftScore',
        `driftScore must be between 0 and 1. Got: ${input.driftScore}`,
      );
    }
    
    // Validate tenantId
    if (!input.tenantId || input.tenantId.trim() === '') {
      throw new SnapshotValidationError(
        'tenantId',
        'tenantId is required.',
      );
    }
    
    // Validate incidentId
    if (!input.incidentId || input.incidentId.trim() === '') {
      throw new SnapshotValidationError(
        'incidentId',
        'incidentId is required.',
      );
    }
  }

  private mapToSimulationSnapshot(snapshot: Snapshot): SimulationSnapshot {
    return {
      snapshotId: snapshot.snapshotId,
      tenantId: snapshot.tenantId,
      incidentId: snapshot.incidentId,
      runId: snapshot.runId,
      snapshotKind: snapshot.snapshotKind as SnapshotKind,
      isBaseline: snapshot.isBaseline,
      verdict: snapshot.verdict as EvidenceVerdict,
      driftScore: snapshot.driftScore,
      calcResult: snapshot.calcResult,
      calcResultNorm: snapshot.calcResultNorm,
      calcHash: snapshot.calcHash,
      legalHold: snapshot.legalHold,
      legalHoldReason: snapshot.legalHoldReason,
      retentionPolicy: snapshot.retentionPolicy,
      expiresAt: snapshot.expiresAt,
      createdAt: snapshot.createdAt,
    };
  }

  private mapApplyLegalHoldResult(result: RepoApplyLegalHoldResult): ApplyLegalHoldResult {
    return {
      success: result.success,
      changed: result.changed,
      error: result.error,
    };
  }

  private mapSetRetentionPolicyResult(result: RepoSetRetentionPolicyResult): SetRetentionPolicyResult {
    return {
      success: result.success,
      changed: result.changed,
      previousPolicy: result.previousPolicy,
      newPolicy: result.newPolicy,
      newExpiresAt: result.newExpiresAt,
      error: result.error,
    };
  }

  private mapLegalHoldStats(stats: RepoLegalHoldStats): LegalHoldStats {
    return {
      totalCount: stats.totalCount,
      byIncidentCount: stats.byIncidentCount,
      oldestHoldAt: stats.oldestHoldAt,
      averageAgeDays: stats.averageAgeDays,
    };
  }
}
