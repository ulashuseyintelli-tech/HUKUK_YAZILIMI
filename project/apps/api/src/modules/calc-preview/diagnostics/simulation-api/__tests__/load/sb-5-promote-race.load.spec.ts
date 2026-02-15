/**
 * SB-5: Promote-Promote Race (Aynı Incident, Farklı Run'lar)
 *
 * Synthetic Load Validation — Task 7.1
 *
 * Aynı incidentId, 10 farklı runId ile paralel promote.
 * Farklı run'lar farklı satırlar → UNIQUE constraint ile çözülmüş.
 *
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 5
 * @see .kiro/specs/synthetic-load-validation/design.md SB-5
 */

import { PromoteService, PromoteResult } from '../../promote.service';
import { PromoteRequestStore } from '../../promote-request.store';
import { SimulationMetricsService } from '../../simulation-metrics.service';
import { SimulationAuditAdapter } from '../../simulation-audit.adapter';
import { SimulationRunStoreService } from '../../simulation-run-store.service';
import { SimulationFeatureFlagService } from '../../simulation-feature-flag.service';
import { IClock } from '../../../evidence/clock.service';
import { MetricsSpy } from './helpers/metrics-spy';
import { ScenarioFactory } from './helpers/scenario-factory';

const RACE_CONCURRENCY = 10;
const SEED = Number(process.env.SYN_LOAD_SEED) || 1337;

describe('SB-5: Promote-Promote Race', () => {
  let promoteService: PromoteService;
  let metricsService: SimulationMetricsService;
  let metricsSpy: MetricsSpy;
  let factory: ScenarioFactory;

  beforeAll(() => {
    process.env.PHASE7_ENABLED = 'false';
    factory = new ScenarioFactory(SEED);

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

    // Each (incidentId, runId) pair is independent — all should be isNew=true
    const claimed = new Set<string>();
    const mockPromoteStore: jest.Mocked<PromoteRequestStore> = {
      claimOrGet: jest.fn().mockImplementation(
        async (incidentId: string, runId: string, requestId: string) => {
          const key = `${incidentId}:${runId}`;
          if (claimed.has(key)) {
            return {
              record: {
                id: `rec-${key}`,
                requestId: `existing-${key}`,
                incidentId,
                runId,
                status: 'IN_PROGRESS' as const,
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
              id: `rec-${key}`,
              requestId,
              incidentId,
              runId,
              status: 'IN_PROGRESS' as const,
              resultRef: null,
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

    metricsService = new SimulationMetricsService();
    metricsSpy = new MetricsSpy(metricsService);
    metricsSpy.attach();

    promoteService = new PromoteService(
      mockFeatureFlag,
      mockPromoteStore,
      mockRunStore,
      metricsService,
      mockAudit,
      mockClock,
      { getSnapshot: jest.fn().mockResolvedValue(null) } as any,
    );
  });

  afterAll(() => {
    metricsSpy.detach();
  });

  it(`should produce ${RACE_CONCURRENCY} independent results for same incident, different runs`, async () => {
    const incidentId = factory.createIncidentId();
    const runIds = factory.createBulkRunIds(RACE_CONCURRENCY);
    const actorId = factory.createActorId();

    metricsSpy.reset();

    // Req 5.1: Paralel promote — aynı incident, farklı run'lar
    const results: PromoteResult[] = await Promise.all(
      runIds.map((runId) =>
        promoteService.promote(incidentId, runId, actorId),
      ),
    );

    // Each (incidentId, runId) pair should produce independent result
    for (const result of results) {
      expect(['ACCEPTED', 'DRIFT_DETECTED']).toContain(result.status);
    }

    // Req 5.2: promote_success_total artışı tutarlı
    const acceptedCount = results.filter((r) => r.status === 'ACCEPTED').length;
    expect(metricsSpy.getCount('promote_success_total')).toBe(acceptedCount);

    // Req 5.3: 0 adet 500
    // (If any threw, Promise.all would have rejected — reaching here means no 500)
    expect(results).toHaveLength(RACE_CONCURRENCY);
  });

  it('should produce unique requestIds for each run', async () => {
    const incidentId = factory.createIncidentId();
    const runIds = factory.createBulkRunIds(RACE_CONCURRENCY);
    const actorId = factory.createActorId();

    const results = await Promise.all(
      runIds.map((runId) =>
        promoteService.promote(incidentId, runId, actorId),
      ),
    );

    // Each result should have a unique requestId (different runs = different records)
    const requestIds = results
      .filter((r): r is Extract<PromoteResult, { requestId: string }> => 'requestId' in r)
      .map((r) => r.requestId);
    const uniqueIds = new Set(requestIds);
    expect(uniqueIds.size).toBe(RACE_CONCURRENCY);
  });
});
