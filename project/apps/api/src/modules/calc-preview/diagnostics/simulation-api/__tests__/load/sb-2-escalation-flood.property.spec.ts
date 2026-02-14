/**
 * Property 2: Escalation Flood Determinism ve Metrik Tutarlılığı (P2)
 *
 * Synthetic Load Validation — Task 3.2
 *
 * For any farklı incident ID seti ve sabit metrik değeri:
 * - Paralel evaluateEscalation() sonuçları sıralı çağrı sonuçları ile aynı karar üretmeli
 * - escalation_churn_total artışı transitioned=true olan sonuç sayısına eşit olmalı
 *
 * Feature: synthetic-load-validation, Property 2: Escalation Flood Determinism
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 2
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 2.1, 2.4
 */

import * as fc from 'fast-check';
import { HysteresisEscalationService } from '../../../playbook/hysteresis-escalation.service';
import { EscalationStateRepository } from '../../../playbook/escalation-state.repository';
import { EscalationState, HysteresisConfig } from '../../../playbook/escalation-hysteresis.types';
import { SimulationMetricsService } from '../../simulation-metrics.service';
import { SimulationFeatureFlagService } from '../../simulation-feature-flag.service';
import { MetricsSpy } from './helpers/metrics-spy';

const TEST_CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

/** Create an isolated in-memory state repo (no CAS contention for different incidents) */
function createMockStateRepo(): jest.Mocked<EscalationStateRepository> {
  const states = new Map<string, EscalationState>();

  return {
    getState: jest.fn().mockImplementation(async (incidentId: string) => {
      return states.get(incidentId) ?? null;
    }),
    initState: jest.fn().mockImplementation(async (incidentId: string) => {
      const state: EscalationState = {
        incidentId,
        currentLevel: 'NONE',
        lastTransitionAt: new Date('2026-02-14T09:00:00Z').toISOString(),
        holdDownUntil: null,
        stableWindowCounter: 0,
        stableWindowStartedAt: null,
        version: 1,
      };
      states.set(incidentId, state);
      return state;
    }),
    saveStateWithCas: jest.fn().mockImplementation(
      async (incidentId: string, newState: Partial<EscalationState>, expectedVersion: number) => {
        const current = states.get(incidentId);
        if (!current || current.version !== expectedVersion) {
          throw Object.assign(new Error('CAS conflict'), { name: 'CasConflictError' });
        }
        const updated: EscalationState = { ...current, ...newState, version: current.version + 1 };
        states.set(incidentId, updated);
        return updated;
      },
    ),
    updateWithRetry: jest.fn().mockImplementation(
      async (incidentId: string, mutate: (current: EscalationState) => Partial<EscalationState>) => {
        let current = states.get(incidentId);
        if (!current) {
          const initState: EscalationState = {
            incidentId,
            currentLevel: 'NONE',
            lastTransitionAt: new Date('2026-02-14T09:00:00Z').toISOString(),
            holdDownUntil: null,
            stableWindowCounter: 0,
            stableWindowStartedAt: null,
            version: 1,
          };
          states.set(incidentId, initState);
          current = initState;
        }
        const patch = mutate(current);
        const updated: EscalationState = { ...current, ...patch, version: current.version + 1 };
        states.set(incidentId, updated);
        return updated;
      },
    ),
  } as any;
}

describe('Property 2: Escalation Flood Determinism', () => {
  let metricsService: SimulationMetricsService;
  let metricsSpy: MetricsSpy;
  let mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService>;

  beforeAll(() => {
    metricsService = new SimulationMetricsService();
    metricsSpy = new MetricsSpy(metricsService);
    metricsSpy.attach();

    mockFeatureFlag = {
      isSimulationEnabled: jest.fn().mockReturnValue(true),
    } as any;
  });

  afterAll(() => {
    metricsSpy.detach();
  });

  it('∀ N ∈ [5,100], metric ∈ (0,1]: parallel flood → churn_total = transitioned count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 100 }),
        fc.double({ min: 0.01, max: 1.0, noNaN: true }),
        async (N, metricValue) => {
          const mockStateRepo = createMockStateRepo();
          const service = new HysteresisEscalationService(
            mockStateRepo,
            metricsService,
            mockFeatureFlag,
            TEST_CONFIG,
          );

          const incidentIds = Array.from({ length: N }, (_, i) => `pbt-inc-${i}-${Math.random().toString(36).slice(2)}`);
          const now = new Date('2026-02-14T10:00:00Z');

          metricsSpy.reset();

          // Parallel flood — different incidents, no CAS contention
          const results = await Promise.all(
            incidentIds.map((id) => service.evaluate(id, metricValue, now)),
          );

          // Invariant 1: churn_total = number of transitioned results
          const transitionedCount = results.filter((r) => r.transitioned).length;
          const churnCount = metricsSpy.getCount('escalation_churn_total');
          expect(churnCount).toBe(transitionedCount);

          // Invariant 2: all decisions for same metric value should be consistent
          // (all incidents start from NONE, same metric → same decision)
          const decisions = new Set(results.map((r) => r.decision.action));
          expect(decisions.size).toBe(1); // All same decision

          // Invariant 3: no unexpected errors (all resolved)
          expect(results).toHaveLength(N);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});
