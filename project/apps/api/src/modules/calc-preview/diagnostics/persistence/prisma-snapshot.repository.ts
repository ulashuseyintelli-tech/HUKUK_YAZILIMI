/**
 * Prisma Snapshot Repository
 * 
 * Phase 9B - PostgreSQL Migration
 * 
 * PostgreSQL implementation of ISnapshotRepository using Prisma ORM.
 * 
 * Key Semantics:
 * - INSERT-ONLY: Snapshots are immutable after creation
 * - Upgrade-only mutations: isBaseline, legalHold, retentionPolicy
 * - Single baseline per incident (partial unique index)
 * 
 * IMPORTANT: Baseline selection is determined exclusively by isBaseline=true.
 * snapshotKind is NOT used for baseline selection.
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/design.md - Truth Layer Contract
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma, SimulationSnapshotKind as PrismaSnapshotKind } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  ISnapshotRepository,
  Snapshot,
  SnapshotInput,
  SnapshotKind,
  EvidenceVerdict,
  ApplyLegalHoldResult,
  SetRetentionPolicyResult,
  LegalHoldStats,
  MarkArchivedInput,
  MarkArchivedResult,
  DeleteExpiredResult,
} from './snapshot-repository.interface';
import {
  EntityNotFoundError,
  BaselineAlreadyExistsError,
  DatabaseUnavailableError,
} from './truth-layer-errors';
import { RetentionPolicy } from '../evidence/retention-policy';

// ============================================================================
// Retention Policy Helpers
// ============================================================================

const RETENTION_RANK: Record<RetentionPolicy, number> = {
  STANDARD: 0,
  PROMOTED: 1,
  LEGAL_HOLD: 2,
};

const RETENTION_HOURS: Record<RetentionPolicy, number | null> = {
  STANDARD: 72,
  PROMOTED: 168, // 7 days
  LEGAL_HOLD: null, // Never expires
};

function calculateExpiresAt(createdAt: Date, policy: RetentionPolicy): Date | null {
  const hours = RETENTION_HOURS[policy];
  if (hours === null) return null;
  
  const expiresAt = new Date(createdAt);
  expiresAt.setTime(expiresAt.getTime() + hours * 60 * 60 * 1000);
  return expiresAt;
}

// ============================================================================
// Repository Implementation
// ============================================================================

@Injectable()
export class PrismaSnapshotRepository implements ISnapshotRepository {
  private readonly logger = new Logger(PrismaSnapshotRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // Create (INSERT-ONLY)
  // ==========================================================================

  /**
   * Insert new snapshot with idempotency handling
   * 
   * Phase 9B.5 Task 3: Dual-layer idempotency
   * 
   * Layer 1: PK (snapshotId) - caller retry safety
   * Layer 2: Content-based unique index (tenant, incident, runId, calcHash)
   * 
   * On P2002 (unique violation):
   * - PK conflict → fetch by snapshotId, return existing
   * - Content index conflict → fetch by content key, return existing
   * - Baseline index conflict → throw BaselineAlreadyExistsError
   * 
   * @param snapshot Snapshot data
   * @returns Created or existing snapshot (idempotent)
   * @throws BaselineAlreadyExistsError if isBaseline=true and baseline exists
   * @throws DatabaseUnavailableError if DB connection failed
   */
  async insert(snapshot: SnapshotInput): Promise<Snapshot> {
    try {
      const now = new Date();
      const retentionPolicy = snapshot.retentionPolicy ?? 'STANDARD';
      const expiresAt = calculateExpiresAt(now, retentionPolicy);

      const created = await this.prisma.simulationSnapshot.create({
        data: {
          snapshotId: snapshot.snapshotId,
          tenantId: snapshot.tenantId,
          incidentId: snapshot.incidentId,
          runId: snapshot.runId ?? null,
          snapshotKind: snapshot.snapshotKind as PrismaSnapshotKind,
          verdict: snapshot.verdict,
          driftScore: new Decimal(snapshot.driftScore.toFixed(6)),
          calcResult: snapshot.calcResult as Prisma.InputJsonValue,
          calcResultNorm: snapshot.calcResultNorm as Prisma.InputJsonValue,
          calcHash: snapshot.calcHash,
          isBaseline: snapshot.isBaseline ?? false,
          retentionPolicy: retentionPolicy,
          expiresAt: expiresAt,
          createdAt: now,
        },
      });

      return this.mapToEntity(created);
    } catch (error) {
      // Handle unique constraint violations (P2002)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.handleP2002Conflict(snapshot, error);
      }
      throw this.handlePrismaError(error, 'insert');
    }
  }

  /**
   * Handle P2002 unique constraint violation
   * 
   * Phase 9B.5 Task 3: Idempotency recovery
   * 
   * Determines which constraint was violated and fetches existing snapshot.
   * 
   * @param snapshot Original input
   * @param error Prisma P2002 error
   * @returns Existing snapshot (idempotent return)
   * @throws BaselineAlreadyExistsError if baseline constraint violated
   * @throws DatabaseUnavailableError if fetch fails or impossible state
   */
  private async handleP2002Conflict(
    snapshot: SnapshotInput,
    error: Prisma.PrismaClientKnownRequestError,
  ): Promise<Snapshot> {
    // Extract constraint target from error metadata
    const target = (error.meta?.target as string[]) ?? [];
    const targetStr = target.join(',').toLowerCase();
    
    this.logger.debug('[PrismaSnapshotRepository] P2002 conflict detected', {
      snapshotId: snapshot.snapshotId,
      target: targetStr,
      incidentId: snapshot.incidentId,
    });

    // Case 1: Primary key conflict (snapshotId)
    // This happens when caller retries with same snapshotId
    if (targetStr.includes('snapshot_id') || targetStr.includes('primary')) {
      const existing = await this.prisma.simulationSnapshot.findUnique({
        where: { snapshotId: snapshot.snapshotId },
      });
      
      if (existing) {
        this.logger.debug('[PrismaSnapshotRepository] Returning existing snapshot (PK conflict)', {
          snapshotId: snapshot.snapshotId,
        });
        return this.mapToEntity(existing);
      }
    }

    // Case 2: Content-based idempotency index conflict
    // uq_sim_snap_idempotency ON (tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash)
    // Note: PostgreSQL may return column names instead of index name in target
    if (targetStr.includes('uq_sim_snap_idempotency') || 
        targetStr.includes('idempotency') ||
        targetStr.includes('coalesce') ||
        (targetStr.includes('tenant_id') && targetStr.includes('incident_id') && targetStr.includes('calc_hash'))) {
      const existing = await this.prisma.simulationSnapshot.findFirst({
        where: {
          tenantId: snapshot.tenantId,
          incidentId: snapshot.incidentId,
          runId: snapshot.runId ?? null,
          calcHash: snapshot.calcHash,
        },
      });
      
      if (existing) {
        this.logger.debug('[PrismaSnapshotRepository] Returning existing snapshot (content conflict)', {
          existingSnapshotId: existing.snapshotId,
          requestedSnapshotId: snapshot.snapshotId,
          calcHash: snapshot.calcHash.substring(0, 8) + '...',
        });
        return this.mapToEntity(existing);
      }
    }

    // Case 3: Baseline unique constraint
    // Partial unique index on (tenant_id, incident_id) WHERE is_baseline = true
    if (snapshot.isBaseline && (targetStr.includes('baseline') || targetStr === '')) {
      // Try to find existing baseline
      const existingBaseline = await this.prisma.simulationSnapshot.findFirst({
        where: {
          tenantId: snapshot.tenantId,
          incidentId: snapshot.incidentId,
          isBaseline: true,
        },
        select: { snapshotId: true },
      });
      
      throw new BaselineAlreadyExistsError(
        snapshot.incidentId,
        existingBaseline?.snapshotId ?? 'unknown',
        snapshot.snapshotId,
      );
    }

    // Case 4: Fallback - try content-based fetch if target is empty or unknown
    // Some Prisma versions don't populate target for expression-based indexes
    if (target.length === 0 || !targetStr) {
      // First try PK
      const byPk = await this.prisma.simulationSnapshot.findUnique({
        where: { snapshotId: snapshot.snapshotId },
      });
      if (byPk) {
        this.logger.debug('[PrismaSnapshotRepository] Returning existing snapshot (fallback PK)', {
          snapshotId: snapshot.snapshotId,
        });
        return this.mapToEntity(byPk);
      }
      
      // Then try content key
      const byContent = await this.prisma.simulationSnapshot.findFirst({
        where: {
          tenantId: snapshot.tenantId,
          incidentId: snapshot.incidentId,
          runId: snapshot.runId ?? null,
          calcHash: snapshot.calcHash,
        },
      });
      if (byContent) {
        this.logger.debug('[PrismaSnapshotRepository] Returning existing snapshot (fallback content)', {
          existingSnapshotId: byContent.snapshotId,
          requestedSnapshotId: snapshot.snapshotId,
        });
        return this.mapToEntity(byContent);
      }
    }

    // Impossible state: P2002 but no existing record found
    // This should never happen - log as anomaly and throw
    this.logger.error('[PrismaSnapshotRepository] P2002 but no existing record found - anomaly', {
      snapshotId: snapshot.snapshotId,
      target: targetStr,
      tenantId: snapshot.tenantId,
      incidentId: snapshot.incidentId,
      calcHash: snapshot.calcHash.substring(0, 8) + '...',
    });
    
    throw new DatabaseUnavailableError(
      `P2002 conflict but existing record not found. This is an anomaly. ` +
      `snapshotId=${snapshot.snapshotId}, target=${targetStr}`,
    );
  }

  // ==========================================================================
  // Upgrade-Only Mutations
  // ==========================================================================

  async markAsBaseline(snapshotId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Get snapshot
        const snapshot = await tx.simulationSnapshot.findUnique({
          where: { snapshotId },
          select: { tenantId: true, incidentId: true, isBaseline: true },
        });

        if (!snapshot) {
          throw new EntityNotFoundError('SimulationSnapshot', snapshotId);
        }

        // Already baseline - idempotent
        if (snapshot.isBaseline) {
          return;
        }

        // Check if another baseline exists BEFORE trying to update
        const existingBaseline = await tx.simulationSnapshot.findFirst({
          where: {
            tenantId: snapshot.tenantId,
            incidentId: snapshot.incidentId,
            isBaseline: true,
          },
          select: { snapshotId: true },
        });

        if (existingBaseline) {
          throw new BaselineAlreadyExistsError(
            snapshot.incidentId,
            existingBaseline.snapshotId,
            snapshotId,
          );
        }

        // Safe to update now
        await tx.simulationSnapshot.update({
          where: { snapshotId },
          data: { isBaseline: true },
        });
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError || error instanceof BaselineAlreadyExistsError) {
        throw error;
      }
      throw this.handlePrismaError(error, 'markAsBaseline');
    }
  }

  async applyLegalHold(
    snapshotId: string,
    _reason?: string | undefined,
  ): Promise<ApplyLegalHoldResult> {
    try {
      const snapshot = await this.prisma.simulationSnapshot.findUnique({
        where: { snapshotId },
        select: { retentionPolicy: true },
      });

      if (!snapshot) {
        return { success: false, changed: false, error: 'SNAPSHOT_NOT_FOUND' };
      }

      // Already LEGAL_HOLD - idempotent
      if (snapshot.retentionPolicy === 'LEGAL_HOLD') {
        return { success: true, changed: false };
      }

      // Apply legal hold
      await this.prisma.simulationSnapshot.update({
        where: { snapshotId },
        data: {
          retentionPolicy: 'LEGAL_HOLD',
          expiresAt: null, // Never expires
        },
      });

      // Note: legalHoldReason field doesn't exist in current schema
      // If needed, add it to Prisma schema

      return { success: true, changed: true };
    } catch (error) {
      throw this.handlePrismaError(error, 'applyLegalHold');
    }
  }

  async setRetentionPolicy(
    snapshotId: string,
    policy: RetentionPolicy,
  ): Promise<SetRetentionPolicyResult> {
    try {
      const snapshot = await this.prisma.simulationSnapshot.findUnique({
        where: { snapshotId },
        select: { retentionPolicy: true, createdAt: true },
      });

      if (!snapshot) {
        return {
          success: false,
          changed: false,
          error: 'SNAPSHOT_NOT_FOUND',
        };
      }

      const currentPolicy = snapshot.retentionPolicy as RetentionPolicy;

      // Same policy - idempotent
      if (currentPolicy === policy) {
        const expiresAt = calculateExpiresAt(snapshot.createdAt, policy);
        return {
          success: true,
          changed: false,
          previousPolicy: currentPolicy,
          newPolicy: policy,
          newExpiresAt: expiresAt?.toISOString() ?? null,
        };
      }

      // Check for downgrade
      const currentRank = RETENTION_RANK[currentPolicy];
      const newRank = RETENTION_RANK[policy];

      if (newRank < currentRank) {
        return {
          success: false,
          changed: false,
          previousPolicy: currentPolicy,
          newPolicy: policy,
          error: 'RETENTION_DOWNGRADE_FORBIDDEN',
        };
      }

      // Upgrade policy
      const newExpiresAt = calculateExpiresAt(snapshot.createdAt, policy);

      await this.prisma.simulationSnapshot.update({
        where: { snapshotId },
        data: {
          retentionPolicy: policy,
          expiresAt: newExpiresAt,
        },
      });

      return {
        success: true,
        changed: true,
        previousPolicy: currentPolicy,
        newPolicy: policy,
        newExpiresAt: newExpiresAt?.toISOString() ?? null,
      };
    } catch (error) {
      throw this.handlePrismaError(error, 'setRetentionPolicy');
    }
  }

  // ==========================================================================
  // Query
  // ==========================================================================

  async findById(snapshotId: string): Promise<Snapshot | null> {
    try {
      const snapshot = await this.prisma.simulationSnapshot.findUnique({
        where: { snapshotId },
      });

      return snapshot ? this.mapToEntity(snapshot) : null;
    } catch (error) {
      throw this.handlePrismaError(error, 'findById');
    }
  }

  async findByIncidentId(incidentId: string): Promise<Snapshot[]> {
    try {
      const snapshots = await this.prisma.simulationSnapshot.findMany({
        where: { incidentId },
        orderBy: { createdAt: 'desc' },
      });

      return snapshots.map((s) => this.mapToEntity(s));
    } catch (error) {
      throw this.handlePrismaError(error, 'findByIncidentId');
    }
  }

  async findBaseline(incidentId: string): Promise<Snapshot | null> {
    try {
      const snapshot = await this.prisma.simulationSnapshot.findFirst({
        where: {
          incidentId,
          isBaseline: true,
        },
      });

      return snapshot ? this.mapToEntity(snapshot) : null;
    } catch (error) {
      throw this.handlePrismaError(error, 'findBaseline');
    }
  }

  async findByRunId(runId: string): Promise<Snapshot[]> {
    try {
      const snapshots = await this.prisma.simulationSnapshot.findMany({
        where: { runId },
        orderBy: { createdAt: 'desc' },
      });

      return snapshots.map((s) => this.mapToEntity(s));
    } catch (error) {
      throw this.handlePrismaError(error, 'findByRunId');
    }
  }

  async findWithLegalHold(
    tenantId?: string | undefined,
    options?: { includeArchived?: boolean | undefined } | undefined,
  ): Promise<Snapshot[]> {
    try {
      const includeArchived = options?.includeArchived ?? false;
      
      const where: Prisma.SimulationSnapshotWhereInput = {
        retentionPolicy: 'LEGAL_HOLD',
      };

      if (tenantId) {
        where.tenantId = tenantId;
      }

      // By default, exclude archived snapshots
      if (!includeArchived) {
        where.archivedAt = null;
      }

      const snapshots = await this.prisma.simulationSnapshot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return snapshots.map((s) => this.mapToEntity(s));
    } catch (error) {
      throw this.handlePrismaError(error, 'findWithLegalHold');
    }
  }

  // ==========================================================================
  // Archive Operations (Phase 10)
  // ==========================================================================

  async markArchived(
    snapshotId: string,
    input: MarkArchivedInput,
  ): Promise<MarkArchivedResult> {
    try {
      const snapshot = await this.prisma.simulationSnapshot.findUnique({
        where: { snapshotId },
        select: { 
          retentionPolicy: true, 
          isBaseline: true,
          archivedAt: true,
        },
      });

      if (!snapshot) {
        return { success: false, changed: false, error: 'SNAPSHOT_NOT_FOUND' };
      }

      // Only LEGAL_HOLD snapshots can be archived
      if (snapshot.retentionPolicy !== 'LEGAL_HOLD') {
        return { success: false, changed: false, error: 'NOT_LEGAL_HOLD' };
      }

      // Baseline snapshots cannot be archived
      if (snapshot.isBaseline) {
        return { success: false, changed: false, error: 'IS_BASELINE' };
      }

      // Already archived - idempotent
      if (snapshot.archivedAt) {
        return { 
          success: true, 
          changed: false,
          archivedAt: snapshot.archivedAt.toISOString(),
        };
      }

      // Archive the snapshot
      const now = new Date();
      await this.prisma.simulationSnapshot.update({
        where: { snapshotId },
        data: {
          archivedAt: now,
          archivedBy: input.archivedBy,
          archivedReason: input.reason ?? null,
        },
      });

      this.logger.debug('[PrismaSnapshotRepository] Snapshot archived', {
        snapshotId,
        archivedBy: input.archivedBy,
        archivedAt: now.toISOString(),
      });

      return { 
        success: true, 
        changed: true,
        archivedAt: now.toISOString(),
      };
    } catch (error) {
      throw this.handlePrismaError(error, 'markArchived');
    }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  async getLegalHoldStats(tenantId?: string | undefined): Promise<LegalHoldStats> {
    try {
      const where: Prisma.SimulationSnapshotWhereInput = {
        retentionPolicy: 'LEGAL_HOLD',
      };

      if (tenantId) {
        where.tenantId = tenantId;
      }

      // Get all legal hold snapshots
      const snapshots = await this.prisma.simulationSnapshot.findMany({
        where,
        select: {
          incidentId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Calculate stats
      const totalCount = snapshots.length;
      const byIncidentCount: Record<string, number> = {};
      let oldestHoldAt: string | null = null;
      let totalAgeDays = 0;

      const now = new Date();

      for (const snapshot of snapshots) {
        // Count by incident
        byIncidentCount[snapshot.incidentId] = (byIncidentCount[snapshot.incidentId] ?? 0) + 1;

        // Track oldest
        if (!oldestHoldAt) {
          oldestHoldAt = snapshot.createdAt.toISOString();
        }

        // Calculate age
        const ageDays = (now.getTime() - snapshot.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        totalAgeDays += ageDays;
      }

      const averageAgeDays = totalCount > 0 ? totalAgeDays / totalCount : 0;

      return {
        totalCount,
        byIncidentCount,
        oldestHoldAt,
        averageAgeDays: Math.round(averageAgeDays * 100) / 100, // 2 decimal places
      };
    } catch (error) {
      throw this.handlePrismaError(error, 'getLegalHoldStats');
    }
  }

  // ==========================================================================
  // Tenant Discovery (Phase 11 - Cleanup Orchestration)
  // ==========================================================================

  /**
   * List distinct tenant IDs from snapshots table (Phase 11)
   * 
   * Source of truth for tenant discovery in cleanup orchestration.
   * Returns tenants in deterministic order (ASC) for predictable behavior.
   * 
   * IMPORTANT: This is the ONLY source for tenant discovery in cleanup.
   * Do NOT use IncidentStore or any other source.
   */
  async listDistinctTenantIds(): Promise<string[]> {
    try {
      // Use raw query for DISTINCT with ORDER BY
      // Prisma's findMany with distinct doesn't guarantee order
      const result = await this.prisma.$queryRaw<{ tenant_id: string }[]>`
        SELECT DISTINCT tenant_id
        FROM simulation_snapshots
        ORDER BY tenant_id ASC
      `;
      
      return result.map(row => row.tenant_id);
    } catch (error) {
      throw this.handlePrismaError(error, 'listDistinctTenantIds');
    }
  }

  // ==========================================================================
  // Cleanup (Phase 11 - Single Source of Truth)
  // ==========================================================================

  /**
   * Build deletable WHERE clause - SINGLE SOURCE OF TRUTH
   * 
   * Phase 11 - DRY principle: This function is the ONLY place where
   * deletable criteria are defined. Both deleteExpired() and countDeletable()
   * MUST use this function.
   * 
   * DOKUNULMAZLAR (Untouchables) - NEVER deleted:
   * - retentionPolicy = 'LEGAL_HOLD' → never delete
   * - retentionPolicy = 'PROMOTED' → never delete
   * - isBaseline = true → never delete
   * - archivedAt IS NOT NULL → archived snapshots are hidden, not deleted
   * 
   * DELETE CRITERIA (all must be true):
   * - tenantId = tenantId (tenant isolation)
   * - expiresAt < now (expired)
   * - retentionPolicy = 'STANDARD' (not promoted/legal_hold)
   * - isBaseline = false (not baseline)
   * - archivedAt IS NULL (not archived - archive is "hide", not "delete")
   * 
   * @param tenantId Tenant ID for isolation
   * @param now Current timestamp for expiry check
   * @returns Prisma WHERE clause object
   */
  buildDeletableWhere(tenantId: string, now: Date): Prisma.SimulationSnapshotWhereInput {
    return {
      tenantId,
      expiresAt: { lt: now },
      retentionPolicy: 'STANDARD', // ONLY STANDARD - LEGAL_HOLD and PROMOTED are protected
      isBaseline: false, // ONLY non-baseline - baselines are protected
      archivedAt: null, // ONLY non-archived - archived snapshots are hidden, not deleted
    };
  }

  /**
   * Count deletable snapshots for a tenant (Phase 11 - Dry Run Support)
   * 
   * Uses buildDeletableWhere() for single source of truth.
   * This method is used for dry-run mode in cleanup orchestration.
   * 
   * @param tenantId Tenant ID
   * @param now Optional timestamp (defaults to new Date())
   * @returns Count of snapshots that would be deleted
   */
  async countDeletable(tenantId: string, now: Date = new Date()): Promise<number> {
    try {
      const where = this.buildDeletableWhere(tenantId, now);
      return await this.prisma.simulationSnapshot.count({ where });
    } catch (error) {
      throw this.handlePrismaError(error, 'countDeletable');
    }
  }

  /**
   * Delete expired snapshots for a tenant (Phase 11 - Refactored)
   * 
   * Uses buildDeletableWhere() for single source of truth.
   * 
   * DOKUNULMAZLAR (Untouchables) - NEVER deleted:
   * - retentionPolicy = 'LEGAL_HOLD' → never delete
   * - retentionPolicy = 'PROMOTED' → never delete
   * - isBaseline = true → never delete
   * - archivedAt IS NOT NULL → archived snapshots are hidden, not deleted
   * 
   * TENANT ISOLATION: Only deletes snapshots for specified tenant.
   * 
   * @param tenantId Tenant ID
   * @param now Optional timestamp (defaults to new Date())
   */
  async deleteExpired(tenantId: string, now: Date = new Date()): Promise<DeleteExpiredResult> {
    try {
      // First, count protected snapshots (for metrics)
      const protectedSnapshots = await this.prisma.simulationSnapshot.findMany({
        where: {
          tenantId,
          expiresAt: { lt: now },
          OR: [
            { retentionPolicy: 'LEGAL_HOLD' },
            { retentionPolicy: 'PROMOTED' },
            { isBaseline: true },
            { archivedAt: { not: null } }, // Archived snapshots are also protected
          ],
        },
        select: {
          retentionPolicy: true,
          isBaseline: true,
          archivedAt: true,
        },
      });
      
      // Count protected by reason
      const protectedBy = {
        legalHold: 0,
        promoted: 0,
        baseline: 0,
      };
      
      for (const snap of protectedSnapshots) {
        if (snap.retentionPolicy === 'LEGAL_HOLD') {
          protectedBy.legalHold++;
        } else if (snap.retentionPolicy === 'PROMOTED') {
          protectedBy.promoted++;
        } else if (snap.isBaseline) {
          protectedBy.baseline++;
        }
        // Note: archived snapshots with STANDARD policy are counted but not in protectedBy breakdown
        // They are implicitly protected by archivedAt: null in buildDeletableWhere
      }
      
      // Delete using single source of truth WHERE clause
      const where = this.buildDeletableWhere(tenantId, now);
      const deleteResult = await this.prisma.simulationSnapshot.deleteMany({ where });
      
      this.logger.debug('[PrismaSnapshotRepository] deleteExpired completed', {
        tenantId,
        deletedCount: deleteResult.count,
        protectedCount: protectedSnapshots.length,
        protectedBy,
      });
      
      return {
        deletedCount: deleteResult.count,
        protectedCount: protectedSnapshots.length,
        protectedBy,
      };
    } catch (error) {
      throw this.handlePrismaError(error, 'deleteExpired');
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private mapToEntity(row: {
    snapshotId: string;
    tenantId: string;
    incidentId: string;
    runId: string | null;
    snapshotKind: PrismaSnapshotKind;
    isBaseline: boolean;
    verdict: string;
    driftScore: Decimal;
    calcResult: Prisma.JsonValue;
    calcResultNorm: Prisma.JsonValue;
    calcHash: string;
    retentionPolicy: string | null;
    expiresAt: Date | null;
    archivedAt: Date | null;
    archivedBy: string | null;
    archivedReason: string | null;
    createdAt: Date;
  }): Snapshot {
    return {
      snapshotId: row.snapshotId,
      tenantId: row.tenantId,
      incidentId: row.incidentId,
      runId: row.runId ?? undefined,
      snapshotKind: row.snapshotKind as SnapshotKind,
      isBaseline: row.isBaseline,
      verdict: row.verdict as EvidenceVerdict,
      driftScore: row.driftScore.toNumber(),
      calcResult: row.calcResult,
      calcResultNorm: row.calcResultNorm,
      calcHash: row.calcHash,
      legalHold: row.retentionPolicy === 'LEGAL_HOLD',
      legalHoldReason: undefined, // Not in current schema
      retentionPolicy: (row.retentionPolicy ?? 'STANDARD') as RetentionPolicy,
      expiresAt: row.expiresAt?.toISOString(),
      archivedAt: row.archivedAt?.toISOString(),
      archivedBy: row.archivedBy ?? undefined,
      archivedReason: row.archivedReason ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private handlePrismaError(error: unknown, operation: string): never {
    // Log the error
    this.logger.error(`[PrismaSnapshotRepository] ${operation} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });

    // Check for Prisma-specific errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: Record not found
      if (error.code === 'P2025') {
        throw new EntityNotFoundError('SimulationSnapshot', 'unknown');
      }
    }

    // Connection errors
    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new DatabaseUnavailableError('PostgreSQL connection failed', error);
    }

    if (error instanceof Prisma.PrismaClientRustPanicError) {
      throw new DatabaseUnavailableError('PostgreSQL client panic', error);
    }

    // Unknown error - wrap in DatabaseUnavailableError
    throw new DatabaseUnavailableError(
      `Database operation failed: ${operation}`,
      error instanceof Error ? error : undefined,
    );
  }
}
