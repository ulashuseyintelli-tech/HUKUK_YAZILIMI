/**
 * Property 3: Concurrent Escalation Hysteresis ve Cooldown Koruması (P3)
 *
 * Synthetic Load Validation — Task 3.3
 *
 * For any incident seti ve metrik değerleri:
 * - Hysteresis band içi metrik → ESCALATE dönmemeli
 * - holdDownUntil süresi dolmamış → yeniden ESCALATE tetiklenmemeli
 *
 * Feature: synthetic-load-validation, Property 3: Concurrent Escalation Hysteresis
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 3
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 2.2, 2.3
 */

import * as fc from 'fast-check';
import { evaluateEscalation } from '../../../playbook/escalation-hysteresis';
import { EscalationState, HysteresisConfig } from '../../../playbook/escalation-hysteresis.types';

const CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

describe('Property 3: Hysteresis + Cooldown Koruması', () => {
  it('∀ metric ∈ [deescalate, escalate]: hysteresis band → never ESCALATE', () => {
    fc.assert(
      fc.property(
        // metric in hysteresis band: [0.4, 0.8]
        fc.double({ min: CONFIG.deescalateThreshold, max: CONFIG.escalateThreshold, noNaN: true }),
        // current level
        fc.constantFrom('NONE' as const, 'L1' as const, 'L2' as const, 'L3' as const),
        (metricValue, currentLevel) => {
          const state: EscalationState = {
            incidentId: 'pbt-inc',
            currentLevel,
            lastTransitionAt: new Date('2026-02-14T09:00:00Z').toISOString(),
            holdDownUntil: null,
            stableWindowCounter: 0,
            stableWindowStartedAt: null,
            version: 1,
          };
          const now = new Date('2026-02-14T10:00:00Z');

          const decision = evaluateEscalation(state, metricValue, CONFIG, now);

          // Invariant: hysteresis band → never ESCALATE
          expect(decision.action).not.toBe('ESCALATE');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('∀ holdDown active + metric > threshold: cooldown → HOLD, not ESCALATE', () => {
    fc.assert(
      fc.property(
        // metric above threshold
        fc.double({ min: 0.81, max: 1.0, noNaN: true }),
        // current level (not L3 — L3 can't escalate anyway)
        fc.constantFrom('NONE' as const, 'L1' as const, 'L2' as const),
        // minutes until holdDown expires (1-60)
        fc.integer({ min: 1, max: 60 }),
        (metricValue, currentLevel, minutesRemaining) => {
          const now = new Date('2026-02-14T10:00:00Z');
          const holdDownUntil = new Date(now.getTime() + minutesRemaining * 60_000).toISOString();

          const state: EscalationState = {
            incidentId: 'pbt-inc',
            currentLevel,
            lastTransitionAt: new Date('2026-02-14T09:00:00Z').toISOString(),
            holdDownUntil,
            stableWindowCounter: 0,
            stableWindowStartedAt: null,
            version: 1,
          };

          const decision = evaluateEscalation(state, metricValue, CONFIG, now);

          // Invariant: cooldown active → HOLD (not ESCALATE)
          expect(decision.action).toBe('HOLD');
          expect(decision.reason).toBe('COOLDOWN_ACTIVE');
        },
      ),
      { numRuns: 50 },
    );
  });
});
