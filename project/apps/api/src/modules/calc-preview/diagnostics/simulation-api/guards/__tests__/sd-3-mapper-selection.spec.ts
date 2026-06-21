/**
 * SD-3 D3 Task 3: Mapper Selection + Canary Isolation Tests
 *
 * Validates:
 *   - Selection matrix (4 combinations: enabled × canary)
 *   - Non-canary transition invariant (stub input → no transition)
 *   - Canary transition possible (real signals → transition occurs)
 *   - No tenant-labeled metrics
 *   - P1: Canary isolation property
 *   - P2: Stub determinism property
 *
 * Evaluator code is NOT modified — mapper selection branch already exists from SD-2.6 D2.
 *
 * @see .kiro/specs/sd-3-adaptive-transition/design.md — B4, P1, P2
 * @see .kiro/specs/sd-3-adaptive-transition/requirements.md — R1, R2, R10
 */

import { AdaptiveShadowEvaluator } from '../adaptive-shadow-evaluator';
import type { TenantAwareEvaluatorDeps } from '../adaptive-shadow-evaluator';
import { StubAdaptiveControlInputMapper } from '../adaptive-control-input-mapper';
import { RealAdaptiveControlInputMapper } from '../adaptive-real-input-mapper';
import type { AdaptiveSignalSource, RealMapperConfig } from '../adaptive-real-input-mapper';
import { AdaptiveShadowStateStore } from '../adaptive-shadow-state-store';
import { InMemoryAdaptiveShadowMetrics } from '../adaptive-shadow-metrics';
import { InMemoryAdaptiveShadowLogger } from '../adaptive-shadow-logger';
import { DEFAULT_ADAPTIVE_CONFIG } from '../adaptive-controller.types';
import type { AdaptiveTenantGate } from '../adaptive-tenant-gate';
import type { GuardOperation } from '../guard-policy-resolver.types';
import fc from 'fast-check';

// ============================================================================
// Helpers
// ============================================================================

const TEST_OPERATION: GuardOperation = 'SIMULATION_PREVIEW';

/** Signals that produce NORMAL/true/OK — same as stub output */
const NORMAL_SIGNALS: AdaptiveSignalSource = Object.freeze({
  currentValue: 100,
  baselineEwma: 100,
  baselineSigma: 5,
  windowValues: [100, 100, 100, 100, 100],
  providerErrorRate: 0,
});

/** Signals that force WARNING sigma zone → can trigger NORMAL→ELEVATED escalation */
const ELEVATED_SIGNALS: AdaptiveSignalSource = Object.freeze({
  currentValue: 200,
  baselineEwma: 100,
  baselineSigma: 5,
  windowValues: [200, 200, 200, 200, 200],
  providerErrorRate: 0,
});

const DEFAULT_REAL_CONFIG: RealMapperConfig = Object.freeze({
  complianceThreshold: 0.95,
  providerHealth: {
    providerDegradedThreshold: 0.05,
    providerOutageThreshold: 0.2,
  },
});

function createTenantGate(opts: {
  enabled: boolean;
  canary: boolean;
}): AdaptiveTenantGate {
  return {
    isEnabled: () => opts.enabled,
    isCanary: () => opts.canary,
  };
}

interface TestHarness {
  evaluator: AdaptiveShadowEvaluator;
  metrics: InMemoryAdaptiveShadowMetrics;
  logger: InMemoryAdaptiveShadowLogger;
  stateStore: AdaptiveShadowStateStore;
  stubBuildInputSpy: jest.SpyInstance;
  realBuildInputSpy: jest.SpyInstance;
}

function createHarness(opts: {
  enabled: boolean;
  canary: boolean;
  signals?: AdaptiveSignalSource;
  realMapper?: boolean;
}): TestHarness {
  const metrics = new InMemoryAdaptiveShadowMetrics();
  const logger = new InMemoryAdaptiveShadowLogger();
  const stateStore = new AdaptiveShadowStateStore();

  const stubMapper = new StubAdaptiveControlInputMapper(() => false);
  const stubBuildInputSpy = jest.spyOn(stubMapper, 'buildInput');

  const signals = opts.signals ?? NORMAL_SIGNALS;
  const fallbackCalls: string[] = [];
  const realMapper = new RealAdaptiveControlInputMapper(
    () => false,
    () => signals,
    DEFAULT_REAL_CONFIG,
    (field) => fallbackCalls.push(field),
  );
  const realBuildInputSpy = jest.spyOn(realMapper, 'buildInput');

  const deps: TenantAwareEvaluatorDeps = {
    tenantGate: createTenantGate({ enabled: opts.enabled, canary: opts.canary }),
    stubMapper,
    realMapper: opts.realMapper !== false ? realMapper : undefined,
    stateStore,
    config: DEFAULT_ADAPTIVE_CONFIG,
    metricsEmitter: metrics,
    logger,
  };

  const evaluator = new AdaptiveShadowEvaluator(deps);

  return { evaluator, metrics, logger, stateStore, stubBuildInputSpy, realBuildInputSpy };
}

// ============================================================================
// Selection Matrix (4 combinations)
// ============================================================================

describe('SD-3 Task 3: Mapper Selection + Canary Isolation', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // NEDEN BURADA fake timer var (test kolaylığı DEĞİL — belgelenmiş bir
  // flake'in regresyon korumasıdır):
  //
  // Bu spec mapper-selection mantığını dwellTimeMs=0 ile sınar. Üretim kodu
  // aynı değerlendirme akışında Date.now()'u İKİ AYRI yoldan, BAĞIMSIZ okur:
  //   1. mapper.buildInput()                → input.nowMs
  //   2. state başlatma (stateStore.getForTenant → createInitialState(Date.now()))
  //                                          → state.lastTransitionMs
  // Bu iki okuma arasında (özellikle dolu CI suite'i yükünde) duvar saati ≥1ms
  // ilerleyebilir. O zaman dwellElapsed = input.nowMs - state.lastTransitionMs < 0
  // olur ve dwellTimeMs=0 iken dwell guard (dwellElapsed < dwellTimeMs) BEKLENEN
  // geçişi ara sıra bastırır → transitions.length === 0 → testin "Canary
  // transition possible" / "transition metric labels" assertion'ları kırılır.
  // İzole koşuda iki okuma hemen hep aynı ms'e düşer (geçer); flake yalnız yük
  // altında görünür.
  //
  // Saati bilerek donduruyoruz ki her iki okuma da AYNI anı görsün
  // (dwellElapsed === 0 → guard bastırmaz). Üretimde gerçek dwellTimeMs=300_000
  // bu <1ms farkı zaten maskeler; ayrıca prod guard-interceptor varsayılan
  // NoopAdaptiveShadowEvaluator kullanır (gerçek evaluator yalnız testte) →
  // kusur uykuda. Bu yüzden burada test-only stabilizasyon yeterli.
  //
  // Altta yatan çift-Date.now() davranışı değişmedikçe (örn. evaluator tek bir
  // nowMs'i hem mapper'a hem state başlatmaya enjekte edene dek) BU SATIRLARI
  // SİLME — silmek flake'i geri getirir.
  // ─────────────────────────────────────────────────────────────────────────
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_700_000_000_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Selection Matrix (4 combinations)', () => {
    test('enabled=false, canary=false → no eval (0-work)', () => {
      const h = createHarness({ enabled: false, canary: false });

      h.evaluator.evaluateIfEnabled('tenant-1', TEST_OPERATION);

      expect(h.stubBuildInputSpy).not.toHaveBeenCalled();
      expect(h.realBuildInputSpy).not.toHaveBeenCalled();
      expect(h.metrics.evaluations).toHaveLength(0);
      expect(h.logger.entries).toHaveLength(0);
    });

    test('enabled=false, canary=true → no eval (0-work)', () => {
      // Note: isCanary=true but isEnabled=false → gate blocks before mapper selection
      const h = createHarness({ enabled: false, canary: true });

      h.evaluator.evaluateIfEnabled('tenant-1', TEST_OPERATION);

      expect(h.stubBuildInputSpy).not.toHaveBeenCalled();
      expect(h.realBuildInputSpy).not.toHaveBeenCalled();
      expect(h.metrics.evaluations).toHaveLength(0);
    });

    test('enabled=true, canary=false → stub mapper called', () => {
      const h = createHarness({ enabled: true, canary: false });

      h.evaluator.evaluateIfEnabled('tenant-1', TEST_OPERATION);

      expect(h.stubBuildInputSpy).toHaveBeenCalledTimes(1);
      expect(h.realBuildInputSpy).not.toHaveBeenCalled();
      expect(h.metrics.evaluations).toHaveLength(1);
    });

    test('enabled=true, canary=true → real mapper called', () => {
      const h = createHarness({ enabled: true, canary: true });

      h.evaluator.evaluateIfEnabled('tenant-1', TEST_OPERATION);

      expect(h.realBuildInputSpy).toHaveBeenCalledTimes(1);
      expect(h.stubBuildInputSpy).not.toHaveBeenCalled();
      expect(h.metrics.evaluations).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Graceful Degradation: realMapper=undefined → stub fallback (R1-AC4)
  // ==========================================================================

  describe('Graceful Degradation (realMapper=undefined)', () => {
    test('enabled=true, canary=true, realMapper=undefined → stub mapper used', () => {
      const h = createHarness({ enabled: true, canary: true, realMapper: false });

      h.evaluator.evaluateIfEnabled('tenant-1', TEST_OPERATION);

      expect(h.stubBuildInputSpy).toHaveBeenCalledTimes(1);
      expect(h.realBuildInputSpy).not.toHaveBeenCalled();
      expect(h.metrics.evaluations).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Non-Canary Transition Invariant (R2-AC4, R2-AC5)
  // ==========================================================================

  describe('Non-canary transition invariant', () => {
    test('enabled=true, canary=false → stub input keeps NORMAL, no transition after N evals', () => {
      const h = createHarness({ enabled: true, canary: false });

      // Run multiple evaluations — stub always produces NORMAL/true/OK
      for (let i = 0; i < 10; i++) {
        h.evaluator.evaluateIfEnabled('tenant-1', TEST_OPERATION);
      }

      expect(h.metrics.evaluations).toHaveLength(10);
      expect(h.metrics.transitions).toHaveLength(0);

      // All evaluations should show NORMAL state
      for (const eval_ of h.metrics.evaluations) {
        expect(eval_.state).toBe('NORMAL');
      }
    });
  });

  // ==========================================================================
  // Canary Transition Possible (real signals → state change)
  // ==========================================================================

  describe('Canary transition possible', () => {
    test('enabled=true, canary=true + WARNING signals → transition occurs', () => {
      const metrics = new InMemoryAdaptiveShadowMetrics();
      const logger = new InMemoryAdaptiveShadowLogger();
      const stateStore = new AdaptiveShadowStateStore();

      // Use config with dwellTimeMs=0 and consecutiveWindowsRequired=1
      // so transition happens immediately
      const fastConfig = Object.freeze({
        ...DEFAULT_ADAPTIVE_CONFIG,
        consecutiveWindowsRequired: 1,
        dwellTimeMs: 0,
      });

      const realMapper = new RealAdaptiveControlInputMapper(
        () => false,
        () => ELEVATED_SIGNALS,
        DEFAULT_REAL_CONFIG,
        () => {},
      );

      const deps: TenantAwareEvaluatorDeps = {
        tenantGate: createTenantGate({ enabled: true, canary: true }),
        stubMapper: new StubAdaptiveControlInputMapper(() => false),
        realMapper,
        stateStore,
        config: fastConfig,
        metricsEmitter: metrics,
        logger,
      };

      const evaluator = new AdaptiveShadowEvaluator(deps);

      // First eval with WARNING-level signals
      evaluator.evaluateIfEnabled('canary-1', TEST_OPERATION);

      // At least one evaluation occurred
      expect(metrics.evaluations.length).toBeGreaterThanOrEqual(1);

      // With dwellTime=0 and consecutiveWindows=1, transition should happen
      // NORMAL → ELEVATED
      expect(metrics.transitions.length).toBeGreaterThanOrEqual(1);
      expect(metrics.transitions[0]!.from).toBe('NORMAL');
      expect(metrics.transitions[0]!.to).toBe('ELEVATED');
    });
  });

  // ==========================================================================
  // No Tenant-Labeled Metrics (P5)
  // ==========================================================================

  describe('No tenant-labeled metrics', () => {
    test('metric labels do not contain tenantId', () => {
      const h = createHarness({ enabled: true, canary: true });

      h.evaluator.evaluateIfEnabled('tenant-secret-id', TEST_OPERATION);

      // Verify evaluations exist
      expect(h.metrics.evaluations).toHaveLength(1);

      // Check that no metric field contains the tenantId
      const eval_ = h.metrics.evaluations[0]!;
      const metricValues = [eval_.state, eval_.guardMode, eval_.outputReason, eval_.overrideSource];
      for (const val of metricValues) {
        expect(val).not.toContain('tenant-secret-id');
      }

      // Logger entries DO contain tenantId (that's correct — logs, not metrics)
      expect(h.logger.entries[0]!.tenantId).toBe('tenant-secret-id');
    });

    test('transition metric labels do not contain tenantId', () => {
      const metrics = new InMemoryAdaptiveShadowMetrics();
      const stateStore = new AdaptiveShadowStateStore();

      const fastConfig = Object.freeze({
        ...DEFAULT_ADAPTIVE_CONFIG,
        consecutiveWindowsRequired: 1,
        dwellTimeMs: 0,
      });

      const realMapper = new RealAdaptiveControlInputMapper(
        () => false,
        () => ELEVATED_SIGNALS,
        DEFAULT_REAL_CONFIG,
        () => {},
      );

      const deps: TenantAwareEvaluatorDeps = {
        tenantGate: createTenantGate({ enabled: true, canary: true }),
        stubMapper: new StubAdaptiveControlInputMapper(() => false),
        realMapper,
        stateStore,
        config: fastConfig,
        metricsEmitter: metrics,
        logger: new InMemoryAdaptiveShadowLogger(),
      };

      const evaluator = new AdaptiveShadowEvaluator(deps);
      evaluator.evaluateIfEnabled('tenant-secret-id', TEST_OPERATION);

      expect(metrics.transitions.length).toBeGreaterThanOrEqual(1);
      const t = metrics.transitions[0]!;
      const transitionValues = [t.from, t.to, t.stateReason];
      for (const val of transitionValues) {
        expect(val).not.toContain('tenant-secret-id');
      }
    });
  });

  // ==========================================================================
  // Property Tests
  // ==========================================================================

  describe('Property: P1 — Canary Isolation', () => {
    it('FOR ALL (enabled, canary) combinations, mapper selection is deterministic', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // enabled
          fc.boolean(), // canary
          (enabled, canary) => {
            const h = createHarness({ enabled, canary });

            h.evaluator.evaluateIfEnabled('prop-tenant', TEST_OPERATION);

            if (!enabled) {
              // Gate blocks — neither mapper called
              expect(h.stubBuildInputSpy).not.toHaveBeenCalled();
              expect(h.realBuildInputSpy).not.toHaveBeenCalled();
            } else if (canary) {
              // Canary → real mapper
              expect(h.realBuildInputSpy).toHaveBeenCalledTimes(1);
              expect(h.stubBuildInputSpy).not.toHaveBeenCalled();
            } else {
              // Non-canary → stub mapper
              expect(h.stubBuildInputSpy).toHaveBeenCalledTimes(1);
              expect(h.realBuildInputSpy).not.toHaveBeenCalled();
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Property: P2 — Stub Determinism', () => {
    it('FOR ALL non-canary evaluations, output is always NORMAL/true/OK', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // tenantId
          (tenantId) => {
            const metrics = new InMemoryAdaptiveShadowMetrics();
            const logger = new InMemoryAdaptiveShadowLogger();
            const stateStore = new AdaptiveShadowStateStore();

            const stubMapper = new StubAdaptiveControlInputMapper(() => false);
            const buildInputSpy = jest.spyOn(stubMapper, 'buildInput');

            const deps: TenantAwareEvaluatorDeps = {
              tenantGate: createTenantGate({ enabled: true, canary: false }),
              stubMapper,
              stateStore,
              config: DEFAULT_ADAPTIVE_CONFIG,
              metricsEmitter: metrics,
              logger,
            };

            const evaluator = new AdaptiveShadowEvaluator(deps);
            evaluator.evaluateIfEnabled(tenantId, TEST_OPERATION);

            // Stub mapper always called for non-canary
            expect(buildInputSpy).toHaveBeenCalledTimes(1);

            // Verify stub output produces NORMAL state, no transition
            expect(metrics.evaluations).toHaveLength(1);
            expect(metrics.evaluations[0]!.state).toBe('NORMAL');
            expect(metrics.transitions).toHaveLength(0);

            // Verify log entry shows NORMAL sigmaZone
            expect(logger.entries).toHaveLength(1);
            expect(logger.entries[0]!.sigmaZone).toBe('NORMAL');
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // ==========================================================================
  // 0-work guarantee: enabled=false → no state store access
  // ==========================================================================

  describe('0-work guarantee', () => {
    test('enabled=false → state store is never accessed', () => {
      const stateStore = new AdaptiveShadowStateStore();
      const getForTenantSpy = jest.spyOn(stateStore, 'getForTenant');
      const setForTenantSpy = jest.spyOn(stateStore, 'setForTenant');

      const deps: TenantAwareEvaluatorDeps = {
        tenantGate: createTenantGate({ enabled: false, canary: false }),
        stubMapper: new StubAdaptiveControlInputMapper(() => false),
        stateStore,
        config: DEFAULT_ADAPTIVE_CONFIG,
        metricsEmitter: new InMemoryAdaptiveShadowMetrics(),
        logger: new InMemoryAdaptiveShadowLogger(),
      };

      const evaluator = new AdaptiveShadowEvaluator(deps);

      // Call multiple times
      for (let i = 0; i < 5; i++) {
        evaluator.evaluateIfEnabled(`tenant-${i}`, TEST_OPERATION);
      }

      expect(getForTenantSpy).not.toHaveBeenCalled();
      expect(setForTenantSpy).not.toHaveBeenCalled();
    });
  });
});
