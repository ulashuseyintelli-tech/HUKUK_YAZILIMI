/**
 * Promote Request Store (DB-backed Idempotency)
 *
 * Sprint 3 - Task 2.1
 *
 * UNIQUE constraint: (incident_id, run_id) at DB level.
 *
 * Pattern: INSERT first → catch unique violation → SELECT existing.
 * This is NOT "select then insert" (TOCTOU race).
 * Prisma upsert on unique key achieves the same atomicity.
 *
 * Phase 9 note: already DB-backed from Sprint 3.
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// ============================================================================
// Record type (mirrors Prisma model)
// ============================================================================

export interface PromoteRequestRecord {
  id: string;
  requestId: string;
  incidentId: string;
  runId: string;
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  resultRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Store
// ============================================================================

@Injectable()
export class PromoteRequestStore {
  private readonly logger = new Logger(PromoteRequestStore.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claim a promote slot for (incidentId, runId).
   *
   * Atomic: INSERT → on unique violation → return existing record.
   * No TOCTOU race: DB unique index is the arbiter.
   *
   * @returns { record, isNew } — isNew=false means idempotent replay
   */
  async claimOrGet(
    incidentId: string,
    runId: string,
    requestId: string,
  ): Promise<{ record: PromoteRequestRecord; isNew: boolean }> {
    try {
      // Attempt INSERT (claim)
      const created = await this.prisma.promoteRequest.create({
        data: {
          incidentId,
          runId,
          requestId,
          status: 'IN_PROGRESS',
        },
      });
      return { record: this.toRecord(created), isNew: true };
    } catch (err) {
      // Unique violation → SELECT existing
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' // Unique constraint violation
      ) {
        const existing = await this.prisma.promoteRequest.findUnique({
          where: {
            incidentId_runId: { incidentId, runId },
          },
        });
        if (!existing) {
          // Should not happen — race between DELETE and our SELECT
          throw new Error(`Promote request vanished for ${incidentId}:${runId}`);
        }
        this.logger.debug('[PromoteRequestStore] Idempotent hit', { incidentId, runId });
        return { record: this.toRecord(existing), isNew: false };
      }
      throw err;
    }
  }

  /**
   * Get existing record (read-only).
   */
  async get(incidentId: string, runId: string): Promise<PromoteRequestRecord | null> {
    const row = await this.prisma.promoteRequest.findUnique({
      where: {
        incidentId_runId: { incidentId, runId },
      },
    });
    return row ? this.toRecord(row) : null;
  }

  /**
   * Mark as SUCCEEDED after Phase 7 accepts.
   */
  async markSucceeded(incidentId: string, runId: string, resultRef?: string): Promise<void> {
    await this.prisma.promoteRequest.update({
      where: {
        incidentId_runId: { incidentId, runId },
      },
      data: {
        status: 'SUCCEEDED',
        ...(resultRef ? { resultRef } : {}),
      },
    });
  }

  /**
   * Mark as FAILED if Phase 7 rejects.
   */
  async markFailed(incidentId: string, runId: string): Promise<void> {
    await this.prisma.promoteRequest.update({
      where: {
        incidentId_runId: { incidentId, runId },
      },
      data: { status: 'FAILED' },
    });
  }

  private toRecord(row: any): PromoteRequestRecord {
    return {
      id: row.id,
      requestId: row.requestId,
      incidentId: row.incidentId,
      runId: row.runId,
      status: row.status,
      resultRef: row.resultRef,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
