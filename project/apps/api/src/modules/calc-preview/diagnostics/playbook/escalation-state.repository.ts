/**
 * Escalation State Repository (PostgreSQL + CAS)
 *
 * Sprint 3 - Task 5.1
 *
 * CAS contract:
 *   UPDATE ... SET version = version + 1 WHERE version = $current
 *   Max 2 retry on version mismatch → 3rd attempt throws 409 ESCALATION_STATE_CONFLICT
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  EscalationState,
  EscalationLevel,
} from './escalation-hysteresis.types';
import {
  EscalationStateConflictException,
} from '../simulation-api/simulation-error.types';
import { SimulationMetricsService } from '../simulation-api/simulation-metrics.service';

// ============================================================================
// Constants
// ============================================================================

/** Max CAS retries before 409. Exactly 2 retries = 3 total attempts. */
const CAS_MAX_RETRIES = 2;

// ============================================================================
// Repository
// ============================================================================

@Injectable()
export class EscalationStateRepository {
  private readonly logger = new Logger(EscalationStateRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: SimulationMetricsService,
  ) {}

  /**
   * Get current escalation state for an incident.
   * Returns null if no state exists (first evaluation).
   */
  async getState(incidentId: string): Promise<EscalationState | null> {
    const row = await this.prisma.escalationStateRecord.findUnique({
      where: { incidentId },
    });
    return row ? this.toState(row) : null;
  }

  /**
   * Initialize state for a new incident (NONE level, version 1).
   */
  async initState(incidentId: string): Promise<EscalationState> {
    const row = await this.prisma.escalationStateRecord.create({
      data: {
        incidentId,
        currentLevel: 'NONE',
        version: 1,
        stableWindowCounter: 0,
      },
    });
    return this.toState(row);
  }

  /**
   * CAS update: write new state only if version matches.
   *
   * Contract:
   *   - Success: returns updated state
   *   - Version mismatch: throws (caller retries)
   *   - After CAS_MAX_RETRIES failures: 409 ESCALATION_STATE_CONFLICT
   *
   * @throws EscalationStateConflictException after max retries
   */
  async saveStateWithCas(
    incidentId: string,
    newState: Partial<EscalationState>,
    expectedVersion: number,
  ): Promise<EscalationState> {
    const result = await this.prisma.$executeRaw`
      UPDATE escalation_state
      SET current_level = ${newState.currentLevel ?? 'NONE'}::"EscalationLevelEnum",
          last_transition_at = ${newState.lastTransitionAt ? new Date(newState.lastTransitionAt) : new Date()},
          hold_down_until = ${newState.holdDownUntil ? new Date(newState.holdDownUntil) : null},
          stable_window_counter = ${newState.stableWindowCounter ?? 0},
          stable_window_started_at = ${newState.stableWindowStartedAt ? new Date(newState.stableWindowStartedAt) : null},
          version = version + 1,
          updated_at = now()
      WHERE incident_id = ${incidentId}
        AND version = ${expectedVersion}
    `;

    if (result === 0) {
      // Version mismatch — CAS failed
      throw new CasConflictError(incidentId, expectedVersion);
    }

    // Re-read to get updated state
    const updated = await this.getState(incidentId);
    if (!updated) throw new Error(`Escalation state vanished for ${incidentId}`);
    return updated;
  }

  /**
   * CAS update with retry loop.
   *
   * Exactly 2 retries (3 total attempts).
   * On final failure: audit + metric + 409.
   *
   * @param incidentId - Incident to update
   * @param mutate - Pure function that computes new state from current state
   * @throws EscalationStateConflictException after max retries
   */
  async updateWithRetry(
    incidentId: string,
    mutate: (current: EscalationState) => Partial<EscalationState>,
  ): Promise<EscalationState> {
    for (let attempt = 0; attempt <= CAS_MAX_RETRIES; attempt++) {
      const current = await this.getState(incidentId);
      if (!current) {
        // First time — init then retry
        await this.initState(incidentId);
        continue;
      }

      const patch = mutate(current);

      try {
        return await this.saveStateWithCas(incidentId, patch, current.version);
      } catch (err) {
        if (err instanceof CasConflictError) {
          this.logger.warn('[EscalationStateRepo] CAS conflict', {
            incidentId,
            attempt: attempt + 1,
            expectedVersion: current.version,
          });

          if (attempt === CAS_MAX_RETRIES) {
            // Final attempt failed — 409
            this.metrics.incEscalationStateConflict();
            throw new EscalationStateConflictException(incidentId);
          }
          // Retry: re-read state in next iteration
          continue;
        }
        throw err;
      }
    }

    // Should not reach here
    throw new EscalationStateConflictException(incidentId);
  }

  // --------------------------------------------------------------------------
  // Mapping
  // --------------------------------------------------------------------------

  private toState(row: any): EscalationState {
    return {
      incidentId: row.incidentId,
      currentLevel: row.currentLevel as EscalationLevel,
      lastTransitionAt: row.lastTransitionAt.toISOString(),
      holdDownUntil: row.holdDownUntil?.toISOString() ?? null,
      stableWindowCounter: row.stableWindowCounter,
      stableWindowStartedAt: row.stableWindowStartedAt?.toISOString() ?? null,
      version: row.version,
    };
  }
}

// ============================================================================
// Internal error (not exported — only used for retry loop control flow)
// ============================================================================

class CasConflictError extends Error {
  constructor(
    public readonly incidentId: string,
    public readonly expectedVersion: number,
  ) {
    super(`CAS conflict for ${incidentId} at version ${expectedVersion}`);
    this.name = 'CasConflictError';
  }
}
