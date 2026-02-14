/**
 * Property 6: CAS Retry Exhaustion Davranışı (P6)
 *
 * Synthetic Load Validation — Task 9.2
 *
 * For any N > 3 paralel evaluateEscalation():
 * - ≥1 success (state güncellendi)
 * - ≥1 conflict (409 EscalationStateConflictException)
 * - escalation_state_conflict_total = rejected count
 *
 * Feature: synthetic-load-validation, Property 6: CAS Retry Exhaustion
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 6
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 6.1, 6.2, 6.3
 */

import * as fc from 'fast-check';
import { HysteresisEscalationService, HysteresisEvaluationResult } from '../../../playbook/hysteresis-escalation.service';
import { EscalationStateRepository } from '../../../playbook/escalation-state.repository';
import { EscalationState, HysteresisConfig } from '../../../playbook/escalation-hysteresis.types';
import { EscalationStateConflictException } from '../../simulation-error.types';
import { SimulationMetricsService } from '../../simulation-metrics.service';
import { SimulationFeatureFlagService } from '../../simulation-feature-flag.service';
import { MetricsSpy } from './helpers/metrics-spy';

const CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

describe('Property 6: CAS Retry Exhaustion', () => {
  let metricsService: SimulationMetricsService;
  let metricsSpy: MetricsSpy;
  let mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService>;

  beforeAll(() => {
    metricsService = new SimulationMetricsService();
    metricsSpy = new MetricsSpy(metricsService);
    metricsSpy.attach();
    mockFeatureFlag = { isSimulationEnabled: jest.fn().mockReturnValue(true) } as any;
  });

  afterAll(() => {
    metricsSpy.detach();
  });

  it('∀ N ∈ [4,10]: N parallel CAS evaluations → ≥1 success + ≥1 conflict + metric match', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 4, max: 10 }),
        async (N) => {
          metricsSpy.reset();

          // CAS contention mock — version increments on write
          let currentVersion = 1;
          let writeInProgress = false;
          const baseState: EscalationState = {
            incidentId: '',
            currentLevel: 'NONE',
            lastTransitionAt: new Date('2026-02-14T09:00:00Z').toISOString(),
            holdDownUntil: null,
            stableWindowCounter: 0,
            stableWindowStartedAt: null,
            version: 1,
          };

          const mockStateRepo: jest.Mocked<EscalationStateRepository> = {
            getState: jest.fn().mockImplementation(async (id: string) => ({
              ...baseState, incidentId: id, version: currentVersion,
            })),
            initState: jest.fn().mockImplementation(async (id: string) => ({
              ...baseState, incidentId: id, version: 1,
            })),
            saveStateWithCas: jest.fn().mockImplementation(
              async (_id: string, _patch: any, expectedVersion: number) => {
                if (expectedVersion !== currentVersion || writeInProgress) {
                  throw Object.assign(new Error('CAS conflict'), { name: 'CasConflictError' });
                }
                writeInProgress = true;
                await new Promise((r) => setTimeout(r, 1));
                currentVersion++;
                writeInProgress = false;
                return { ...baseState, version: currentVersion, currentLevel: 'L1' };
              },
            ),
            updateWithRetry: jest.fn(),
          } as any;

          mockStateRepo.updateWithRetry.mockImplementation(
            async (incidentId: string, mutate: (s: EscalationState) => Partial<EscalationState>) => {
              const MAX_RETRIES = 2;
              for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const current = await mockStateRepo.getState(incidentId);
                const patch = mutate(current!);
                try {
                  return await mockStateRepo.saveStateWithCas(incidentId, patch, current!.version);
                } catch {
                  if (attempt === MAX_RETRIES) {
                    metricsService.incEscalationStateConflict();
                    throw new EscalationStateConflictException(incidentId);
                  }
                }
              }
              throw new EscalationStateConflictException('unreachable');
            },
          );

          const service = new HysteresisEscalationService(
            mockStateRepo, metricsService, mockFeatureFlag, CONFIG,
          );

          const incidentId = `pbt-cas-${Math.random().toString(36).slice(2)}`;
          const now = new Date('2026-02-14T10:00:00Z');

          const results = await Promise.allSettled(
            Array.from({ length: N }, () => service.evaluate(incidentId, 0.9, now)),
          );

          const fulfilled = results.filter(
            (r): r is PromiseFulfilledResult<HysteresisEvaluationResult> => r.status === 'fulfilled',
          );
          const rejected = results.filter(
            (r): r is PromiseRejectedResult => r.status === 'rejected',
          );

          // Invariant 1: ≥1 success
          expect(fulfilled.length).toBeGreaterThanOrEqual(1);

          // Invariant 2: ≥1 conflict (409)
          expect(rejected.length).toBeGreaterThanOrEqual(1);

          // Invariant 3: all rejections are 409
          for (const r of rejected) {
            expect(r.reason).toBeInstanceOf(EscalationStateConflictException);
          }

          // Invariant 4: conflict metric = rejected count
          expect(metricsSpy.getCount('escalation_state_conflict_total')).toBe(rejected.length);
        },
      ),
      { numRuns: 50 },
    );
  });
});
