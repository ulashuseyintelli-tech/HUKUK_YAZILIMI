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
      // Check for unique constraint violation (baseline already exists)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint violation
          // For partial unique index on (tenant_id, incident_id) WHERE is_baseline = true
          // This happens when trying to insert a second baseline for same incident
          if (snapshot.isBaseline) {
            throw new BaselineAlreadyExistsError(
              snapshot.incidentId,
              'existing', // We don't know the existing ID without another query
              snapshot.snapshotId,
            );
          }
        }
      }
      throw this.handlePrismaError(error, 'insert');
    }
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

  async findWithLegalHold(tenantId?: string | undefined): Promise<Snapshot[]> {
    try {
      const where: Prisma.SimulationSnapshotWhereInput = {
        retentionPolicy: 'LEGAL_HOLD',
      };

      if (tenantId) {
        where.tenantId = tenantId;
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
