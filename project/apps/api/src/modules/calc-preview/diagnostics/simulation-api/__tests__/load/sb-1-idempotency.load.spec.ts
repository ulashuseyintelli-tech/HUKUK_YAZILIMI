/**
 * SB-1: DB UNIQUE İdempotency Testi
 *
 * Synthetic Load Validation — Task 2.1
 *
 * Aynı (incidentId, runId) ile 50 paralel promote → 1 ACCEPTED + 49 ALREADY_PROMOTED.
 * Bu senaryo CAS testi DEĞİL — PromoteService DB UNIQUE constraint kullanır.
 *
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 1
 * @see .kiro/specs/synthetic-load-validation/design.md SB-1
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
import type { ScenarioResult } from './load-test-report.types';

const CONCURRENCY = 50;
const SEED = Number(process.env.SYN_LOAD_SEED) || 1337;

describe('SB-1: DB UNIQUE İdempotency', () => {
  let promoteService: PromoteService;
  let metricsService: SimulationMetricsService;
  let metricsSpy: MetricsSpy;
  let factory: ScenarioFactory;

  // Mocks
  let mockPromoteStore: jest.Mocked<PromoteRequestStore>;
  let mockRunStore: jest.Mocked<SimulationRunStoreService>;
  let mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService>;
  let mockAudit: jest.Mocked<SimulationAuditAdapter>;
  let mockClock: IClock;

  beforeAll(async () => {
    process.env.PHASE7_ENABLED = 'false';
    factory = new ScenarioFactory(SEED);

    mockFeatureFlag = {
      isSimulationEnabled: jest.fn().mockReturnValue(true),
    } as any;

    mockRunStore = {
      findById: jest.fn().mockResolvedValue({ id: 'run-1', status: 'COMPLETED' }),
    } as any;

    mockAudit = {
      logSimulationEvent: jest.fn(),
    } as any;

    mockClock = {
      now: () => new Date('2026-02-14T10:00:00Z'),
    } as any;

    // Simulate DB UNIQUE constraint behavior:
    // First call creates, subsequent calls hit P2002 → return existing
    let claimed = false;
    const firstRecord = {
      id: 'rec-1',
      requestId: factory.createRequestId(),
      incidentId: '',
      runId: '',
      status: 'IN_PROGRESS' as const,
      resultRef: null,
      createdAt: new Date('2026-02-14T10:00:00Z'),
      updatedAt: new Date('2026-02-14T10:00:00Z'),
    };

    mockPromoteStore = {
      claimOrGet: jest.fn().mockImplementation(
        async (incidentId: string, runId: string, _requestId: string) => {
          firstRecord.incidentId = incidentId;
          firstRecord.runId = runId;
          if (!claimed) {
            claimed = true;
            return { record: { ...firstRecord }, isNew: true };
          }
          // Simulate UNIQUE violation → return existing
          return { record: { ...firstRecord }, isNew: false };
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

  it(`should produce exactly 1 ACCEPTED and ${CONCURRENCY - 1} ALREADY_PROMOTED for ${CONCURRENCY} parallel promotes`, async () => {
    const incidentId = factory.createIncidentId();
    const runId = factory.createRunId();
    const actorId = factory.createActorId();

    metricsSpy.reset();

    // Intra-scenario concurrency: Promise.all
    const results: PromoteResult[] = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        promoteService.promote(incidentId, runId, actorId),
      ),
    );

    // Doğrulama
    const accepted = results.filter((r) => r.status === 'ACCEPTED');
    const alreadyPromoted = results.filter((r) => r.status === 'ALREADY_PROMOTED');
    const errors = results.filter(
      (r) => r.status !== 'ACCEPTED' && r.status !== 'ALREADY_PROMOTED',
    );

    // Req 1.1: Tam 1 ACCEPTED + 49 ALREADY_PROMOTED
    expect(accepted).toHaveLength(1);
    expect(alreadyPromoted).toHaveLength(CONCURRENCY - 1);

    // Req 1.2: Tüm ALREADY_PROMOTED aynı requestId
    const acceptedRequestId = accepted[0].requestId;
    for (const ap of alreadyPromoted) {
      expect(ap.requestId).toBe(acceptedRequestId);
    }

    // Req 1.3: promote_success_total += 1
    expect(metricsSpy.getCount('promote_success_total')).toBe(1);

    // Req 1.4: 0 adet 500/exception
    expect(errors).toHaveLength(0);
  });

  it('should FAIL if any promote returns 500', async () => {
    // Edge case: simulate an unexpected error
    const originalClaimOrGet = mockPromoteStore.claimOrGet;
    mockPromoteStore.claimOrGet.mockRejectedValueOnce(new Error('Unexpected DB error'));

    const incidentId = factory.createIncidentId();
    const runId = factory.createRunId();
    const actorId = factory.createActorId();

    await expect(
      promoteService.promote(incidentId, runId, actorId),
    ).rejects.toThrow('Unexpected DB error');

    // Restore
    mockPromoteStore.claimOrGet = originalClaimOrGet;
  });
});

/**
 * SB-1 scenario runner — for LoadTestRunner integration
 */
export async function runSB1(
  promoteService: PromoteService,
  metricsSpy: MetricsSpy,
  factory: ScenarioFactory,
): Promise<ScenarioResult> {
  const start = Date.now();
  const errors: string[] = [];

  const incidentId = factory.createIncidentId();
  const runId = factory.createRunId();
  const actorId = factory.createActorId();

  metricsSpy.reset();

  try {
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        promoteService.promote(incidentId, runId, actorId),
      ),
    );

    const accepted = results.filter((r) => r.status === 'ACCEPTED');
    const alreadyPromoted = results.filter((r) => r.status === 'ALREADY_PROMOTED');
    const unexpected = results.filter(
      (r) => r.status !== 'ACCEPTED' && r.status !== 'ALREADY_PROMOTED',
    );

    if (accepted.length !== 1) errors.push(`Expected 1 ACCEPTED, got ${accepted.length}`);
    if (alreadyPromoted.length !== CONCURRENCY - 1) {
      errors.push(`Expected ${CONCURRENCY - 1} ALREADY_PROMOTED, got ${alreadyPromoted.length}`);
    }
    if (unexpected.length > 0) errors.push(`Unexpected results: ${unexpected.length}`);

    const successMetric = metricsSpy.getCount('promote_success_total');
    if (successMetric !== 1) errors.push(`promote_success_total: expected 1, got ${successMetric}`);

    // Check requestId consistency
    if (accepted.length === 1) {
      const reqId = accepted[0].requestId;
      const inconsistent = alreadyPromoted.filter((r) => r.requestId !== reqId);
      if (inconsistent.length > 0) {
        errors.push(`${inconsistent.length} ALREADY_PROMOTED with different requestId`);
      }
    }

    const allRequestIds = results
      .filter((r): r is Extract<PromoteResult, { requestId: string }> => 'requestId' in r)
      .map((r) => r.requestId);

    const details = {
      acceptedCount: accepted.length,
      alreadyPromotedCount: alreadyPromoted.length,
      uniqueRequestIds: new Set(allRequestIds).size,
      errorCount: unexpected.length,
    };

    return {
      scenarioId: 'SB-1',
      name: 'DB UNIQUE İdempotency',
      result: errors.length === 0 ? 'PASS' : 'FAIL',
      durationMs: Date.now() - start,
      details,
      errors,
    };
  } catch (err) {
    return {
      scenarioId: 'SB-1',
      name: 'DB UNIQUE İdempotency',
      result: 'FAIL',
      durationMs: Date.now() - start,
      details: {},
      errors: [(err as Error).message],
    };
  }
}
