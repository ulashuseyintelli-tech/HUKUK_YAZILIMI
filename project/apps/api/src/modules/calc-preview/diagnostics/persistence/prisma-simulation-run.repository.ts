/**
 * Prisma Simulation Run Repository
 * 
 * Phase 9B - PostgreSQL Migration
 * 
 * PostgreSQL implementation of ISimulationRunRepository using Prisma ORM.
 * 
 * Invariant Enforcement:
 * - upsert(): Immutable field protection
 * - updateStatus(): Status monotonicity (rank check)
 * - setCurrentSnapshot(): Run + Snapshot existence, incident/tenant mismatch check
 * - setBaselineSnapshot(): Above + run status COMPLETED check
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/design.md - Truth Layer Contract
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma, SimulationRunStatus as PrismaRunStatus } from '@prisma/client';
import {
  ISimulationRunRepository,
  SimulationRun,
  SimulationRunInput,
  SimulationRunStatus,
  PaginatedRunsResult,
  ListRunsOptions,
} from './simulation-run-repository.interface';
import {
  EntityNotFoundError,
  ImmutableFieldViolationError,
  StatusMonotonicityViolationError,
  IncidentMismatchError,
  TenantMismatchError,
  RunNotCompletedError,
  DatabaseUnavailableError,
  STATUS_RANK,
} from './truth-layer-errors';

// ============================================================================
// Immutable Fields Definition
// ============================================================================

const IMMUTABLE_FIELDS: (keyof SimulationRunInput)[] = [
  'runId',
  'tenantId',
  'incidentId',
  'scenarioId',
  'seed',
  'simulationVersion',
  'engineVersion',
  'startedAt',
];

// ============================================================================
// Repository Implementation
// ============================================================================

@Injectable()
export class PrismaSimulationRunRepository implements ISimulationRunRepository {
  private readonly logger = new Logger(PrismaSimulationRunRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // Create/Update
  // ==========================================================================

  async upsert(run: SimulationRunInput): Promise<SimulationRun> {
    try {
      // Check if run exists
      const existing = await this.prisma.simulationRun.findUnique({
        where: { runId: run.runId },
      });

      if (existing) {
        // Verify immutable fields match
        this.verifyImmutableFields(run, this.mapToEntity(existing));

        // Update only mutable fields
        const updated = await this.prisma.simulationRun.update({
          where: { runId: run.runId },
          data: {
            status: run.status as PrismaRunStatus,
            finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
            errorCode: run.errorCode ?? null,
            errorMessage: run.errorMessage ?? null,
          },
        });

        return this.mapToEntity(updated);
      }

      // Create new run
      const created = await this.prisma.simulationRun.create({
        data: {
          runId: run.runId,
          tenantId: run.tenantId,
          incidentId: run.incidentId,
          scenarioId: run.scenarioId,
          seed: run.seed,
          simulationVersion: run.simulationVersion,
          engineVersion: run.engineVersion ?? null,
          status: run.status as PrismaRunStatus,
          startedAt: new Date(run.startedAt),
          finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
          errorCode: run.errorCode ?? null,
          errorMessage: run.errorMessage ?? null,
        },
      });

      return this.mapToEntity(created);
    } catch (error) {
      // Re-throw domain errors
      if (error instanceof ImmutableFieldViolationError) {
        throw error;
      }
      throw this.handlePrismaError(error, 'upsert');
    }
  }

  async updateStatus(
    runId: string,
    status: SimulationRunStatus,
    finishedAt?: string | undefined,
  ): Promise<void> {
    try {
      const existing = await this.prisma.simulationRun.findUnique({
        where: { runId },
        select: { status: true },
      });

      if (!existing) {
        throw new EntityNotFoundError('SimulationRun', runId);
      }

      // Check status monotonicity
      const currentRank = STATUS_RANK[existing.status] ?? -1;
      const newRank = STATUS_RANK[status] ?? -1;

      if (newRank < currentRank) {
        throw new StatusMonotonicityViolationError(runId, existing.status, status);
      }

      // Terminal states cannot transition to each other
      if (currentRank === 2 && newRank === 2 && existing.status !== status) {
        throw new StatusMonotonicityViolationError(runId, existing.status, status);
      }

      await this.prisma.simulationRun.update({
        where: { runId },
        data: {
          status: status as PrismaRunStatus,
          ...(finishedAt !== undefined && { finishedAt: new Date(finishedAt) }),
        },
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError || error instanceof StatusMonotonicityViolationError) {
        throw error;
      }
      throw this.handlePrismaError(error, 'updateStatus');
    }
  }

  // ==========================================================================
  // Snapshot Links
  // ==========================================================================

  async setCurrentSnapshot(runId: string, snapshotId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Get run
        const run = await tx.simulationRun.findUnique({
          where: { runId },
          select: { tenantId: true, incidentId: true },
        });

        if (!run) {
          throw new EntityNotFoundError('SimulationRun', runId);
        }

        // Get snapshot
        const snapshot = await tx.simulationSnapshot.findUnique({
          where: { snapshotId },
          select: { tenantId: true, incidentId: true },
        });

        if (!snapshot) {
          throw new EntityNotFoundError('SimulationSnapshot', snapshotId);
        }

        // Check tenant match
        if (snapshot.tenantId !== run.tenantId) {
          throw new TenantMismatchError(runId, run.tenantId, snapshotId, snapshot.tenantId);
        }

        // Check incident match
        if (snapshot.incidentId !== run.incidentId) {
          throw new IncidentMismatchError(runId, run.incidentId, snapshotId, snapshot.incidentId);
        }

        // Update run
        await tx.simulationRun.update({
          where: { runId },
          data: { currentSnapshotId: snapshotId },
        });
      });
    } catch (error) {
      if (
        error instanceof EntityNotFoundError ||
        error instanceof TenantMismatchError ||
        error instanceof IncidentMismatchError
      ) {
        throw error;
      }
      throw this.handlePrismaError(error, 'setCurrentSnapshot');
    }
  }

  async setBaselineSnapshot(runId: string, snapshotId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Get run with status
        const run = await tx.simulationRun.findUnique({
          where: { runId },
          select: { tenantId: true, incidentId: true, status: true },
        });

        if (!run) {
          throw new EntityNotFoundError('SimulationRun', runId);
        }

        // Check run status is COMPLETED
        if (run.status !== 'COMPLETED') {
          throw new RunNotCompletedError(runId, run.status);
        }

        // Get snapshot
        const snapshot = await tx.simulationSnapshot.findUnique({
          where: { snapshotId },
          select: { tenantId: true, incidentId: true },
        });

        if (!snapshot) {
          throw new EntityNotFoundError('SimulationSnapshot', snapshotId);
        }

        // Check tenant match
        if (snapshot.tenantId !== run.tenantId) {
          throw new TenantMismatchError(runId, run.tenantId, snapshotId, snapshot.tenantId);
        }

        // Check incident match
        if (snapshot.incidentId !== run.incidentId) {
          throw new IncidentMismatchError(runId, run.incidentId, snapshotId, snapshot.incidentId);
        }

        // Update run
        await tx.simulationRun.update({
          where: { runId },
          data: { baselineSnapshotId: snapshotId },
        });
      });
    } catch (error) {
      if (
        error instanceof EntityNotFoundError ||
        error instanceof TenantMismatchError ||
        error instanceof IncidentMismatchError ||
        error instanceof RunNotCompletedError
      ) {
        throw error;
      }
      throw this.handlePrismaError(error, 'setBaselineSnapshot');
    }
  }

  // ==========================================================================
  // Query
  // ==========================================================================

  async findById(runId: string): Promise<SimulationRun | null> {
    try {
      const run = await this.prisma.simulationRun.findUnique({
        where: { runId },
      });

      return run ? this.mapToEntity(run) : null;
    } catch (error) {
      throw this.handlePrismaError(error, 'findById');
    }
  }

  async findByIncidentId(
    incidentId: string,
    options?: ListRunsOptions | undefined,
  ): Promise<PaginatedRunsResult> {
    try {
      const limit = options?.limit ?? 20;
      const cursor = options?.cursor;

      const runs = await this.prisma.simulationRun.findMany({
        where: { incidentId },
        orderBy: { startedAt: 'desc' },
        take: limit + 1, // Fetch one extra to determine hasMore
        ...(cursor && {
          cursor: { runId: cursor },
          skip: 1, // Skip the cursor itself
        }),
      });

      const hasMore = runs.length > limit;
      const resultRuns = runs.slice(0, limit);

      return {
        runs: resultRuns.map((r) => this.mapToEntity(r)),
        nextCursor: hasMore ? resultRuns[resultRuns.length - 1]?.runId : undefined,
        hasMore,
      };
    } catch (error) {
      throw this.handlePrismaError(error, 'findByIncidentId');
    }
  }

  async findLatestByIncidentId(incidentId: string): Promise<SimulationRun | null> {
    try {
      const run = await this.prisma.simulationRun.findFirst({
        where: { incidentId },
        orderBy: { startedAt: 'desc' },
      });

      return run ? this.mapToEntity(run) : null;
    } catch (error) {
      throw this.handlePrismaError(error, 'findLatestByIncidentId');
    }
  }

  // ==========================================================================
  // Count
  // ==========================================================================

  async countByIncidentId(incidentId: string): Promise<number> {
    try {
      return await this.prisma.simulationRun.count({
        where: { incidentId },
      });
    } catch (error) {
      throw this.handlePrismaError(error, 'countByIncidentId');
    }
  }

  async countByTenantId(tenantId: string, date?: string | undefined): Promise<number> {
    try {
      const where: Prisma.SimulationRunWhereInput = { tenantId };

      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        where.startedAt = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }

      return await this.prisma.simulationRun.count({ where });
    } catch (error) {
      throw this.handlePrismaError(error, 'countByTenantId');
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private verifyImmutableFields(input: SimulationRunInput, existing: SimulationRun): void {
    for (const field of IMMUTABLE_FIELDS) {
      const inputValue = input[field];
      const existingValue = existing[field];

      // Skip undefined values in input (not attempting to change)
      if (inputValue === undefined) continue;

      // Compare values
      if (inputValue !== existingValue) {
        throw new ImmutableFieldViolationError(
          'SimulationRun',
          input.runId,
          field,
          existingValue,
          inputValue,
        );
      }
    }
  }

  private mapToEntity(row: {
    runId: string;
    tenantId: string;
    incidentId: string;
    scenarioId: string;
    seed: number;
    simulationVersion: string;
    engineVersion: string | null;
    status: PrismaRunStatus;
    startedAt: Date;
    finishedAt: Date | null;
    currentSnapshotId: string | null;
    baselineSnapshotId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }): SimulationRun {
    return {
      runId: row.runId,
      tenantId: row.tenantId,
      incidentId: row.incidentId,
      scenarioId: row.scenarioId,
      seed: row.seed,
      simulationVersion: row.simulationVersion,
      engineVersion: row.engineVersion ?? undefined,
      status: row.status as SimulationRunStatus,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString(),
      currentSnapshotId: row.currentSnapshotId ?? undefined,
      baselineSnapshotId: row.baselineSnapshotId ?? undefined,
      errorCode: row.errorCode ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
    };
  }

  private handlePrismaError(error: unknown, operation: string): never {
    // Log the error
    this.logger.error(`[PrismaSimulationRunRepository] ${operation} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });

    // Check for Prisma-specific errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: Record not found
      if (error.code === 'P2025') {
        throw new EntityNotFoundError('SimulationRun', 'unknown');
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
