/**
 * SB-2: Escalation Flood Testi (Service-Level)
 *
 * Synthetic Load Validation — Task 3.1
 *
 * 100 farklı incident için paralel evaluateEscalation() çağrısı.
 * HTTP burst değil — doğrudan service-level çağrı (cron/background job simülasyonu).
 *
 * @see .kiro/specs/synthetic-load-validation/requirements.md Req 2
 * @see .kiro/specs/synthetic-load-validation/design.md SB-2
 */

import { HysteresisEscalationService } from '../../../playbook/hysteresis-escalation.service';
import { EscalationStateRepository } from '../../../playbook/escalation-state.repository';
import { EscalationState, HysteresisConfig } from '../../../playbook/escalation-hysteresis.types';
import { SimulationMetricsService } from '../../simulation-metrics.service';
import { SimulationFeatureFlagService } from '../../simulation-feature-flag.service';
import { MetricsSpy } from './helpers/metrics-spy';
import { ScenarioFactory } from './helpers/scenario-factory';

const FLOOD_COUNT = 100;
const SEED = Number(process.env.SYN_LOAD_SEED) || 1337;

/** Metric value above escalation threshold → ESCALATE */
const METRIC_ABOVE_THRESHOLD = 0.9;

/** Metric value inside hysteresis band → HOLD (premature escalation check) */
const METRIC_IN_BAND = 0.6;

const TEST_CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

describe('SB-2: Escalation Flood', () => {
  let hysteresisService: HysteresisEscalationService;
  let metricsService: SimulationMetricsService;
  let metricsSpy: MetricsSpy;
  let factory: ScenarioFactory;
  let mockFeatureFlag: jest.Mocked<SimulationFeatureFlagService>;

  beforeAll(() => {
    factory = new ScenarioFactory(SEED);

    mockFeatureFlag = {
      isSimulationEnabled: jest.fn().mockReturnValue(true),
    } as any;

    metricsService = new SimulationMetricsService();
    metricsSpy = new MetricsSpy(metricsService);
    metricsSpy.attach();
  });

  afterAll(() => {
    metricsSpy.detach();
  });

  /**
   * Create a mock state repo where each incident has independent state.
   * No CAS contention since each incident is different.
   */
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
          const updated: EscalationState = {
            ...current,
            ...newState,
            version: current.version + 1,
          };
          states.set(incidentId, updated);
          return updated;
        },
      ),
      updateWithRetry: jest.fn().mockImplementation(
        async (incidentId: string, mutate: (current: EscalationState) => Partial<EscalationState>) => {
          let current = states.get(incidentId);
          if (!current) {
            current = await (createMockStateRepo() as any).initState(incidentId);
            // Re-init in our map
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
          const updated: EscalationState = {
            ...current,
            ...patch,
            version: current.version + 1,
          };
          states.set(incidentId, updated);
          return updated;
        },
      ),
    } as any;
  }

  it(`should handle ${FLOOD_COUNT} parallel escalation evaluations deterministically`, async () => {
    const mockStateRepo = createMockStateRepo();
    hysteresisService = new HysteresisEscalationService(
      mockStateRepo,
      metricsService,
      mockFeatureFlag,
      TEST_CONFIG,
    );

    const incidentIds = factory.createBulkIncidentIds(FLOOD_COUNT);
    const now = new Date('2026-02-14T10:00:00Z');

    metricsSpy.reset();

    // Req 2.1: Paralel evaluateEscalation() — farklı incident'lar
    const results = await Promise.all(
      incidentIds.map((id) =>
        hysteresisService.evaluate(id, METRIC_ABOVE_THRESHOLD, now),
      ),
    );

    // All should produce consistent decisions (ESCALATE since metric > threshold)
    for (const result of results) {
      expect(result.decision.action).toBe('ESCALATE');
      expect(result.newLevel).toBe('L1');
      expect(result.transitioned).toBe(true);
    }

    // Req 2.4: escalation_churn_total artışı tutarlı
    const churnCount = metricsSpy.getCount('escalation_churn_total');
    const transitionedCount = results.filter((r) => r.transitioned).length;
    expect(churnCount).toBe(transitionedCount);
  });

  it('should not produce premature escalation in hysteresis band', async () => {
    const mockStateRepo = createMockStateRepo();
    hysteresisService = new HysteresisEscalationService(
      mockStateRepo,
      metricsService,
      mockFeatureFlag,
      TEST_CONFIG,
    );

    const incidentIds = factory.createBulkIncidentIds(FLOOD_COUNT);
    const now = new Date('2026-02-14T10:00:00Z');

    // Req 2.2: Hysteresis band içinde premature escalation yok
    const results = await Promise.all(
      incidentIds.map((id) =>
        hysteresisService.evaluate(id, METRIC_IN_BAND, now),
      ),
    );

    for (const result of results) {
      // In hysteresis band → should NOT escalate
      expect(result.decision.action).not.toBe('ESCALATE');
    }
  });

  it('should respect cooldown — no re-escalation during holdDown', async () => {
    const mockStateRepo = createMockStateRepo();
    hysteresisService = new HysteresisEscalationService(
      mockStateRepo,
      metricsService,
      mockFeatureFlag,
      TEST_CONFIG,
    );

    const incidentId = factory.createIncidentId();
    const now = new Date('2026-02-14T10:00:00Z');

    // First evaluation → ESCALATE
    const first = await hysteresisService.evaluate(incidentId, METRIC_ABOVE_THRESHOLD, now);
    expect(first.decision.action).toBe('ESCALATE');

    // Req 2.3: Cooldown ihlali yok — holdDownUntil süresi dolmadan yeniden ESCALATE yok
    const duringCooldown = new Date('2026-02-14T10:05:00Z'); // 5 min later, still in 15 min cooldown
    const second = await hysteresisService.evaluate(incidentId, METRIC_ABOVE_THRESHOLD, duringCooldown);
    expect(second.decision.action).toBe('HOLD');
    expect(second.decision.reason).toBe('COOLDOWN_ACTIVE');
  });
});
