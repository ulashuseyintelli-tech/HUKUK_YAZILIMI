/**
 * Hysteresis Escalation Service
 *
 * Sprint 3 - Task 5.3
 *
 * DB-backed escalation with hysteresis state machine.
 * Wraps: evaluateEscalation (pure) + EscalationStateRepository (CAS) + metrics.
 *
 * Flow:
 *   getState → evaluateEscalation → applyDecision → saveStateWithCas (retry)
 *
 * CAS conflict: re-read + re-evaluate (idempotent — same metric → same decision).
 * Feature flag: disabled → no new escalations, timers frozen.
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §4
 */

import { Injectable, Logger } from '@nestjs/common';
import { EscalationStateRepository } from './escalation-state.repository';
import { evaluateEscalation } from './escalation-hysteresis';
import {
  EscalationState,
  EscalationLevel,
  EscalationDecision,
  HysteresisConfig,
} from './escalation-hysteresis.types';
import { SimulationMetricsService } from '../simulation-api/simulation-metrics.service';
import { SimulationFeatureFlagService } from '../simulation-api/simulation-feature-flag.service';
import { enforceGuardDecision } from '../simulation-api/guards/guard-enforcement';
import { GuardOperation, type GuardDecisionSnapshot } from '../simulation-api/guards/guard-policy-resolver.types';

// ============================================================================
// Default config (overridable via constructor)
// ============================================================================

const DEFAULT_HYSTERESIS_CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

// ============================================================================
// Result type
// ============================================================================

export interface HysteresisEvaluationResult {
  decision: EscalationDecision;
  previousLevel: EscalationLevel;
  newLevel: EscalationLevel;
  incidentId: string;
  transitioned: boolean;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class HysteresisEscalationService {
  private readonly logger = new Logger(HysteresisEscalationService.name);

  constructor(
    private readonly stateRepo: EscalationStateRepository,
    private readonly metrics: SimulationMetricsService,
    private readonly featureFlag: SimulationFeatureFlagService,
    private readonly config: HysteresisConfig = DEFAULT_HYSTERESIS_CONFIG,
  ) {}

  /**
   * Evaluate escalation for an incident with a new metric reading.
   *
   * CAS-safe: on conflict, re-reads state and re-evaluates (deterministic).
   * Feature flag: disabled → returns HOLD without touching DB.
   */
  async evaluate(
    incidentId: string,
    metricValue: number,
    now: Date = new Date(),
    guardSnapshot?: GuardDecisionSnapshot,
  ): Promise<HysteresisEvaluationResult> {
    // Guard enforcement (defense-in-depth — interceptor already short-circuits)
    const guardCheck = enforceGuardDecision(guardSnapshot, GuardOperation.EVALUATE);
    if (!guardCheck.allowed) {
      this.logger.debug('[HysteresisEscalation] Guard blocked', { reason: guardCheck.reason });
      try { this.metrics.incGuardHold(guardCheck.reason ?? 'UNKNOWN'); } catch { /* best-effort */ }
      return {
        decision: { action: 'HOLD', reason: 'GUARD_BLOCKED' },
        previousLevel: 'NONE',
        newLevel: 'NONE',
        incidentId,
        transitioned: false,
      };
    }

    // Feature flag check — disabled → freeze
    if (!this.featureFlag.isSimulationEnabled()) {
      this.logger.debug('[HysteresisEscalation] Feature flag disabled, returning HOLD');
      return {
        decision: { action: 'HOLD', reason: 'FEATURE_DISABLED' },
        previousLevel: 'NONE',
        newLevel: 'NONE',
        incidentId,
        transitioned: false,
      };
    }

    // Capture decision from mutate callback (last evaluation wins on CAS retry)
    let capturedDecision: EscalationDecision = { action: 'HOLD' };
    let capturedPreviousLevel: EscalationLevel = 'NONE';

    const newState = await this.stateRepo.updateWithRetry(
      incidentId,
      (currentState: EscalationState) => {
        const decision = evaluateEscalation(currentState, metricValue, this.config, now);
        capturedDecision = decision;
        capturedPreviousLevel = currentState.currentLevel;
        return this.applyDecision(currentState, decision, now);
      },
    );

    const transitioned =
      capturedDecision.action === 'ESCALATE' ||
      capturedDecision.action === 'DEESCALATE';

    // Metrics: churn on level transition (best-effort — MI-1)
    if (transitioned) {
      const direction = capturedDecision.action === 'ESCALATE' ? 'up' : 'down';
      try { this.metrics.incEscalationChurn(incidentId, direction); } catch { /* best-effort */ }

      this.logger.log('[HysteresisEscalation] Level transition', {
        incidentId,
        from: capturedPreviousLevel,
        to: newState.currentLevel,
        direction,
      });
    }

    return {
      decision: capturedDecision,
      previousLevel: capturedPreviousLevel,
      newLevel: newState.currentLevel,
      incidentId,
      transitioned,
    };
  }

  // --------------------------------------------------------------------------
  // Apply decision to state (returns Partial<EscalationState> for CAS write)
  // --------------------------------------------------------------------------

  private applyDecision(
    current: EscalationState,
    decision: EscalationDecision,
    now: Date,
  ): Partial<EscalationState> {
    switch (decision.action) {
      case 'ESCALATE':
      case 'DEESCALATE':
        return {
          currentLevel: decision.newLevel!,
          lastTransitionAt: now.toISOString(),
          holdDownUntil: decision.holdDownUntil ?? null,
          stableWindowCounter: 0,
          stableWindowStartedAt: null,
        };

      case 'ACCUMULATE':
        return {
          currentLevel: current.currentLevel,
          stableWindowCounter: decision.stableWindowCounter ?? current.stableWindowCounter,
          stableWindowStartedAt: decision.stableWindowStartedAt ?? current.stableWindowStartedAt,
        };

      case 'HOLD':
        if (decision.resetStableWindow) {
          return {
            currentLevel: current.currentLevel,
            stableWindowCounter: 0,
            stableWindowStartedAt: null,
          };
        }
        return {
          currentLevel: current.currentLevel,
        };
    }
  }
}
