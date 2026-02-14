/**
 * Property 1: Concurrent Promote Idempotency (P1)
 *
 * Synthetic Load Validation — Task 2.2
 *
 * For any (incidentId, runId) çifti ve herhangi bir N (N ≥ 2) paralel promote çağrısı:
 * - Tam 1 ACCEPTED + (N-1) ALREADY_PROMOTED
 * - Tüm ALREADY_PROMOTED aynı requestId
 * - promote_success_total += 1
 *
 * Feature: synthetic-load-validation, Property 1: Concurrent Promote Idempotency
 *
 * @see .kiro/specs/synthetic-load-validation/design.md Property 1
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 1.1, 1.2, 1.3
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

describe('Property 1: Concurrent Promote Idempotency', () => {
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

  it('∀ N ∈ [2,50]: N parallel promotes → exactly 1 ACCEPTED + (N-1) ALREADY_PROMOTED', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 50 }),
        async (N) => {
          // Fresh mock per iteration — isolated state
          let claimed = false;
          const firstRequestId = `req-${Math.random().toString(36).slice(2)}`;
          const firstRecord = {
            id: 'rec-1',
            requestId: firstRequestId,
            incidentId: 'inc-test',
            runId: 'run-test',
            status: 'IN_PROGRESS' as const,
            resultRef: null,
            createdAt: new Date('2026-02-14T10:00:00Z'),
            updatedAt: new Date('2026-02-14T10:00:00Z'),
          };

          const mockPromoteStore: jest.Mocked<PromoteRequestStore> = {
            claimOrGet: jest.fn().mockImplementation(async () => {
              if (!claimed) {
                claimed = true;
                return { record: { ...firstRecord }, isNew: true };
              }
              return { record: { ...firstRecord }, isNew: false };
            }),
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
            mockFeatureFlag,
            mockPromoteStore,
            mockRunStore,
            metricsService,
            mockAudit,
            mockClock,
          );

          metricsSpy.reset();

          const results: PromoteResult[] = await Promise.all(
            Array.from({ length: N }, () =>
              promoteService.promote('inc-test', 'run-test', 'actor-pbt'),
            ),
          );

          const accepted = results.filter((r) => r.status === 'ACCEPTED');
          const alreadyPromoted = results.filter((r) => r.status === 'ALREADY_PROMOTED');
          const errors = results.filter(
            (r) => r.status !== 'ACCEPTED' && r.status !== 'ALREADY_PROMOTED',
          );

          // Invariant 1: exactly 1 ACCEPTED
          expect(accepted).toHaveLength(1);

          // Invariant 2: exactly N-1 ALREADY_PROMOTED
          expect(alreadyPromoted).toHaveLength(N - 1);

          // Invariant 3: all ALREADY_PROMOTED share same requestId
          const acceptedReqId = accepted[0].requestId;
          for (const ap of alreadyPromoted) {
            expect(ap.requestId).toBe(acceptedReqId);
          }

          // Invariant 4: promote_success_total += 1
          expect(metricsSpy.getCount('promote_success_total')).toBe(1);

          // Invariant 5: 0 unexpected errors
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});
