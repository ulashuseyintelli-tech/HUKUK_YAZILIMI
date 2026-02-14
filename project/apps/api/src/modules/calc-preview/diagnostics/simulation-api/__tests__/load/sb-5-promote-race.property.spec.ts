/**
 * Property 5: Promote-Promote Race Bağımsızlığı (P5)
 *
 * Synthetic Load Validation — Task 7.2
 *
 * For any incidentId ve N farklı runId:
 * - N paralel promote → N bağımsız sonuç (her biri ACCEPTED veya DRIFT_DETECTED)
 * - promote_success_total = ACCEPTED sayısı
 *
 * Feature: synthetic-load-validation, Property 5: Promote-Promote Race Bağımsızlığı
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 5
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 5.1, 5.2
 */

import * as fc from 'fast-check';
import { PromoteService, PromoteResult } from '../../promote.service';
import { PromoteRequestStore } from '../../promote-request.store';
import { SimulationMetricsService } from '../../simulation-metrics.service';
import { SimulationAuditAdapter } from '../../simulation-audit.adapter';
import { SimulationRunStoreService } from '../../simulation-run-store.service';
import { SimulationFeatureFlagService } from '../../simulation-feature-flag.service';
import { IClock } from '../../../evidence/clock.service';
import { MetricsSpy } from './helpers/metrics-spy';

describe('Property 5: Promote-Promote Race Bağımsızlığı', () => {
  let metricsService: SimulationMetricsService;
  let metricsSpy: MetricsSpy;

  beforeAll(() => {
    metricsService = new SimulationMetricsService();
    metricsSpy = new MetricsSpy(metricsService);
    metricsSpy.attach();
  });

  afterAll(() => {
    metricsSpy.detach();
  });

  it('∀ N ∈ [2,20]: N different runs for same incident → N independent ACCEPTED results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        async (N) => {
          // Fresh mock per iteration
          const claimed = new Set<string>();
          const mockPromoteStore: jest.Mocked<PromoteRequestStore> = {
            claimOrGet: jest.fn().mockImplementation(
              async (incidentId: string, runId: string, requestId: string) => {
                const key = `${incidentId}:${runId}`;
                if (claimed.has(key)) {
                  return {
                    record: {
                      id: `rec-${key}`, requestId: `existing-${key}`,
                      incidentId, runId, status: 'IN_PROGRESS' as const,
                      resultRef: null,
                      createdAt: new Date('2026-02-14T10:00:00Z'),
                      updatedAt: new Date('2026-02-14T10:00:00Z'),
                    },
                    isNew: false,
                  };
                }
                claimed.add(key);
                return {
                  record: {
                    id: `rec-${key}`, requestId, incidentId, runId,
                    status: 'IN_PROGRESS' as const, resultRef: null,
                    createdAt: new Date('2026-02-14T10:00:00Z'),
                    updatedAt: new Date('2026-02-14T10:00:00Z'),
                  },
                  isNew: true,
                };
              },
            ),
            markSucceeded: jest.fn().mockResolvedValue(undefined),
            markFailed: jest.fn().mockResolvedValue(undefined),
          } as any;

          const mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService> = {
            isSimulationEnabled: jest.fn().mockReturnValue(true),
          } as any;
          const mockRunStore: jest.Mocked<SimulationRunStoreService> = {
            findById: jest.fn().mockResolvedValue({ id: 'run-1', status: 'COMPLETED' }),
          } as any;
          const mockAudit: jest.Mocked<SimulationAuditAdapter> = {
            logSimulationEvent: jest.fn(),
          } as any;
          const mockClock: IClock = {
            now: () => new Date('2026-02-14T10:00:00Z'),
          } as any;

          const promoteService = new PromoteService(
            mockFeatureFlag, mockPromoteStore, mockRunStore,
            metricsService, mockAudit, mockClock,
          );

          metricsSpy.reset();

          const incidentId = `pbt-inc-${Math.random().toString(36).slice(2)}`;
          const runIds = Array.from({ length: N }, (_, i) => `pbt-run-${i}-${Math.random().toString(36).slice(2)}`);

          const results: PromoteResult[] = await Promise.all(
            runIds.map((runId) => promoteService.promote(incidentId, runId, 'actor-pbt')),
          );

          // Invariant 1: N results, all ACCEPTED (different runs = different records)
          expect(results).toHaveLength(N);
          for (const r of results) {
            expect(r.status).toBe('ACCEPTED');
          }

          // Invariant 2: promote_success_total = N
          expect(metricsSpy.getCount('promote_success_total')).toBe(N);

          // Invariant 3: all requestIds unique
          const reqIds = results
            .filter((r): r is Extract<PromoteResult, { requestId: string }> => 'requestId' in r)
            .map((r) => r.requestId);
          expect(new Set(reqIds).size).toBe(N);
        },
      ),
      { numRuns: 50 },
    );
  });
});
