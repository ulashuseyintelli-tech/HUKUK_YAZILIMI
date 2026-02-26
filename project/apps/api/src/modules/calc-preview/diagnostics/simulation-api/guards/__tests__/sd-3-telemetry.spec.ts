/**
 * SD-3 D3 Task 4: Telemetry Updates — Fallback Counter + Error Code
 *
 * Validates:
 *   - guard_adaptive_input_fallback_total{field} counter (3 field values)
 *   - REAL_MAPPER_UNAVAILABLE error code in guard_adaptive_eval_errors_total
 *   - Field enum membership (only 3 values, no unknown)
 *   - Error code enum membership (4 values after D3)
 *   - Swallow isolation (metrics failure does not throw)
 *   - TS upper bound = 264
 *   - DI callback wiring (createFallbackCallback)
 *   - Fallback counter only fires on real mapper path (not stub)
 *   - P5: No tenantId in any metric label
 *
 * @see .kiro/specs/sd-3-adaptive-transition/design.md — B3, P5
 * @see .kiro/specs/sd-3-adaptive-transition/requirements.md — R5, R6
 */

import { Registry } from 'prom-client';
import { PromAdaptiveShadowMetrics } from '../adaptive-prom-metrics';
import { AdaptiveShadowEvaluator } from '../adaptive-shadow-evaluator';
import type { TenantAwareEvaluatorDeps } from '../adaptive-shadow-evaluator';
import { StubAdaptiveControlInputMapper } from '../adaptive-control-input-mapper';
import { RealAdaptiveControlInputMapper } from '../adaptive-real-input-mapper';
import type { AdaptiveSignalSource, RealMapperConfig, FallbackField } from '../adaptive-real-input-mapper';
import { AdaptiveShadowStateStore } from '../adaptive-shadow-state-store';
import { InMemoryAdaptiveShadowMetrics } from '../adaptive-shadow-metrics';
import { InMemoryAdaptiveShadowLogger } from '../adaptive-shadow-logger';
import {
  DEFAULT_ADAPTIVE_CONFIG,
  ADAPTIVE_STATES,
  ALL_OUTPUT_REASONS,
  ALL_STATE_REASONS,
} from '../adaptive-controller.types';
import { ALL_SHADOW_ERROR_CODES } from '../adaptive-shadow.types';
import type { AdaptiveTenantGate } from '../adaptive-tenant-gate';
import fc from 'fast-check';

// ============================================================================
// Helpers
// ============================================================================

const ALL_FALLBACK_FIELDS: readonly FallbackField[] = ['sigmaZone', 'complianceVerdict', 'providerHealthZone'];

const NORMAL_SIGNALS: AdaptiveSignalSource = Object.freeze({
  currentValue: 100,
  baselineEwma: 100,
  baselineSigma: 5,
  windowValues: [100, 100, 100, 100, 100],
  providerErrorRate: 0,
});

const DEFAULT_REAL_CONFIG: RealMapperConfig = Object.freeze({
  complianceThreshold: 0.95,
  providerHealth: {
    providerDegradedThreshold: 0.05,
    providerOutageThreshold: 0.2,
  },
});

function createTenantGate(opts: { enabled: boolean; canary: boolean }): AdaptiveTenantGate {
  return {
    isEnabled: () => opts.enabled,
    isCanary: () => opts.canary,
  };
}

// ============================================================================
// Fallback Counter — guard_adaptive_input_fallback_total{field}
// ============================================================================

describe('SD-3 Task 4: Telemetry Updates', () => {
  describe('Fallback Counter — guard_adaptive_input_fallback_total', () => {
    it('emitInputFallback increments counter for each field value', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      prom.emitInputFallback('sigmaZone');
      prom.emitInputFallback('complianceVerdict');
      prom.emitInputFallback('providerHealthZone');

      const metrics = await registry.getMetricsAsJSON();
      const fallbackMetric = metrics.find((m) => m.name === 'guard_adaptive_input_fallback_total');
      expect(fallbackMetric).toBeDefined();
      expect(fallbackMetric!.values).toHaveLength(3);

      for (const field of ALL_FALLBACK_FIELDS) {
        const val = fallbackMetric!.values.find((v) => v.labels.field === field);
        expect(val).toBeDefined();
        expect(val!.value).toBe(1);
      }
    });

    it('multiple increments accumulate correctly', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      prom.emitInputFallback('sigmaZone');
      prom.emitInputFallback('sigmaZone');
      prom.emitInputFallback('sigmaZone');

      const metrics = await registry.getMetricsAsJSON();
      const fallbackMetric = metrics.find((m) => m.name === 'guard_adaptive_input_fallback_total');
      const val = fallbackMetric!.values.find((v) => v.labels.field === 'sigmaZone');
      expect(val!.value).toBe(3);
    });

    it('field label only has "field" key — no tenantId (P5)', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      for (const field of ALL_FALLBACK_FIELDS) {
        prom.emitInputFallback(field);
      }

      const metrics = await registry.getMetricsAsJSON();
      const fallbackMetric = metrics.find((m) => m.name === 'guard_adaptive_input_fallback_total');
      for (const val of fallbackMetric!.values) {
        expect(Object.keys(val.labels)).toEqual(['field']);
      }
    });

    it('emitInputFallback swallows prom-client errors', () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      // Sabotage the counter
      (prom as any).inputFallbackTotal = { inc: () => { throw new Error('boom'); } };

      expect(() => prom.emitInputFallback('sigmaZone')).not.toThrow();
    });

    it('visible in /metrics scrape output', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      prom.emitInputFallback('sigmaZone');

      const scrape = await registry.metrics();
      expect(scrape).toContain('guard_adaptive_input_fallback_total');
      expect(scrape).toContain('field="sigmaZone"');
    });
  });

  // ==========================================================================
  // DI Callback Wiring — createFallbackCallback
  // ==========================================================================

  describe('DI Callback — createFallbackCallback', () => {
    it('createFallbackCallback returns a function that increments fallback counter', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      const callback = prom.createFallbackCallback();
      callback('sigmaZone');
      callback('complianceVerdict');

      const metrics = await registry.getMetricsAsJSON();
      const fallbackMetric = metrics.find((m) => m.name === 'guard_adaptive_input_fallback_total');
      expect(fallbackMetric!.values).toHaveLength(2);
    });

    it('callback wired into RealAdaptiveControlInputMapper triggers on exception', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      // Create a mapper with a signal source that throws on providerErrorRate
      const throwingSignals: AdaptiveSignalSource = {
        ...NORMAL_SIGNALS,
        get providerErrorRate(): number { throw new Error('provider error boom'); },
      };

      const mapper = new RealAdaptiveControlInputMapper(
        () => false,
        () => throwingSignals,
        DEFAULT_REAL_CONFIG,
        prom.createFallbackCallback(),
      );

      // buildInput should not throw (fail-open)
      const input = mapper.buildInput();
      expect(input.providerHealthZone).toBe('OK'); // fallback

      const metrics = await registry.getMetricsAsJSON();
      const fallbackMetric = metrics.find((m) => m.name === 'guard_adaptive_input_fallback_total');
      expect(fallbackMetric).toBeDefined();
      const phzVal = fallbackMetric!.values.find((v) => v.labels.field === 'providerHealthZone');
      expect(phzVal!.value).toBe(1);
    });
  });

  // ==========================================================================
  // REAL_MAPPER_UNAVAILABLE Error Code
  // ==========================================================================

  describe('REAL_MAPPER_UNAVAILABLE error code', () => {
    it('canary=true + realMapper=undefined → emitError(REAL_MAPPER_UNAVAILABLE)', () => {
      const metrics = new InMemoryAdaptiveShadowMetrics();
      const logger = new InMemoryAdaptiveShadowLogger();
      const stateStore = new AdaptiveShadowStateStore();

      const deps: TenantAwareEvaluatorDeps = {
        tenantGate: createTenantGate({ enabled: true, canary: true }),
        stubMapper: new StubAdaptiveControlInputMapper(() => false),
        realMapper: undefined,
        stateStore,
        config: DEFAULT_ADAPTIVE_CONFIG,
        metricsEmitter: metrics,
        logger,
      };

      const evaluator = new AdaptiveShadowEvaluator(deps);
      evaluator.evaluateIfEnabled('canary-tenant', 'SIMULATION_PREVIEW');

      // Error emitted for mapper unavailable
      expect(metrics.errors).toHaveLength(1);
      expect(metrics.errors[0]!.code).toBe('REAL_MAPPER_UNAVAILABLE');

      // Evaluation still proceeds with stub (graceful degradation)
      expect(metrics.evaluations).toHaveLength(1);
    });

    it('canary=true + realMapper=wired → no REAL_MAPPER_UNAVAILABLE error', () => {
      const metrics = new InMemoryAdaptiveShadowMetrics();
      const logger = new InMemoryAdaptiveShadowLogger();
      const stateStore = new AdaptiveShadowStateStore();

      const realMapper = new RealAdaptiveControlInputMapper(
        () => false,
        () => NORMAL_SIGNALS,
        DEFAULT_REAL_CONFIG,
        () => {},
      );

      const deps: TenantAwareEvaluatorDeps = {
        tenantGate: createTenantGate({ enabled: true, canary: true }),
        stubMapper: new StubAdaptiveControlInputMapper(() => false),
        realMapper,
        stateStore,
        config: DEFAULT_ADAPTIVE_CONFIG,
        metricsEmitter: metrics,
        logger,
      };

      const evaluator = new AdaptiveShadowEvaluator(deps);
      evaluator.evaluateIfEnabled('canary-tenant', 'SIMULATION_PREVIEW');

      expect(metrics.errors).toHaveLength(0);
      expect(metrics.evaluations).toHaveLength(1);
    });

    it('canary=false → no REAL_MAPPER_UNAVAILABLE error (non-canary uses stub by design)', () => {
      const metrics = new InMemoryAdaptiveShadowMetrics();
      const logger = new InMemoryAdaptiveShadowLogger();
      const stateStore = new AdaptiveShadowStateStore();

      const deps: TenantAwareEvaluatorDeps = {
        tenantGate: createTenantGate({ enabled: true, canary: false }),
        stubMapper: new StubAdaptiveControlInputMapper(() => false),
        realMapper: undefined,
        stateStore,
        config: DEFAULT_ADAPTIVE_CONFIG,
        metricsEmitter: metrics,
        logger,
      };

      const evaluator = new AdaptiveShadowEvaluator(deps);
      evaluator.evaluateIfEnabled('non-canary', 'SIMULATION_PREVIEW');

      expect(metrics.errors).toHaveLength(0);
    });

    it('REAL_MAPPER_UNAVAILABLE in Prom counter', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);

      prom.emitError('REAL_MAPPER_UNAVAILABLE');

      const metrics = await registry.getMetricsAsJSON();
      const errMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_errors_total');
      expect(errMetric).toBeDefined();
      const val = errMetric!.values.find((v) => v.labels.code === 'REAL_MAPPER_UNAVAILABLE');
      expect(val).toBeDefined();
      expect(val!.value).toBe(1);
    });
  });

  // ==========================================================================
  // Enum Membership Tests
  // ==========================================================================

  describe('Enum Membership', () => {
    it('fallback field values are exactly 3 (closed-set)', () => {
      expect(ALL_FALLBACK_FIELDS).toHaveLength(3);
      expect(ALL_FALLBACK_FIELDS).toContain('sigmaZone');
      expect(ALL_FALLBACK_FIELDS).toContain('complianceVerdict');
      expect(ALL_FALLBACK_FIELDS).toContain('providerHealthZone');
    });

    it('error code values are exactly 4 after D3 (closed-set)', () => {
      expect(ALL_SHADOW_ERROR_CODES).toHaveLength(4);
      expect(ALL_SHADOW_ERROR_CODES).toContain('EVALUATION_EXCEPTION');
      expect(ALL_SHADOW_ERROR_CODES).toContain('INPUT_VALIDATION_FAILED');
      expect(ALL_SHADOW_ERROR_CODES).toContain('STATE_STORE_ERROR');
      expect(ALL_SHADOW_ERROR_CODES).toContain('REAL_MAPPER_UNAVAILABLE');
    });
  });

  // ==========================================================================
  // TS Upper Bound = 264
  // ==========================================================================

  describe('TS Upper Bound', () => {
    it('maximum theoretical time series = 264', () => {
      // eval: 4 states × 2 guardModes × 4 outputReasons × 3 overrideSources = 96
      const evalCardinality = ADAPTIVE_STATES.length * 2 * ALL_OUTPUT_REASONS.length * 3;
      // transition: 4 from × 4 to × 10 stateReasons = 160
      const transCardinality = ADAPTIVE_STATES.length * ADAPTIVE_STATES.length * ALL_STATE_REASONS.length;
      // errors: 4 codes (3 original + REAL_MAPPER_UNAVAILABLE)
      const errorCardinality = ALL_SHADOW_ERROR_CODES.length;
      // eviction: 1 (reason=LRU)
      const evictionCardinality = 1;
      // fallback: 3 (field ∈ {sigmaZone, complianceVerdict, providerHealthZone})
      const fallbackCardinality = ALL_FALLBACK_FIELDS.length;

      const total = evalCardinality + transCardinality + errorCardinality + evictionCardinality + fallbackCardinality;

      expect(evalCardinality).toBe(96);
      expect(transCardinality).toBe(160);
      expect(errorCardinality).toBe(4);
      expect(evictionCardinality).toBe(1);
      expect(fallbackCardinality).toBe(3);
      expect(total).toBe(264);
    });
  });

  // ==========================================================================
  // Fallback counter only fires on real mapper path
  // ==========================================================================

  describe('Fallback counter scope', () => {
    it('stub mapper path does not trigger fallback counter', async () => {
      const registry = new Registry();
      const prom = new PromAdaptiveShadowMetrics(registry);
      const stateStore = new AdaptiveShadowStateStore();

      const deps: TenantAwareEvaluatorDeps = {
        tenantGate: createTenantGate({ enabled: true, canary: false }),
        stubMapper: new StubAdaptiveControlInputMapper(() => false),
        stateStore,
        config: DEFAULT_ADAPTIVE_CONFIG,
        metricsEmitter: prom,
        logger: new InMemoryAdaptiveShadowLogger(),
      };

      const evaluator = new AdaptiveShadowEvaluator(deps);
      evaluator.evaluateIfEnabled('non-canary', 'SIMULATION_PREVIEW');

      const metrics = await registry.getMetricsAsJSON();
      const fallbackMetric = metrics.find((m) => m.name === 'guard_adaptive_input_fallback_total');
      // No fallback counter should be emitted for stub path
      if (fallbackMetric) {
        const totalFallbacks = fallbackMetric.values.reduce((sum, v) => sum + v.value, 0);
        expect(totalFallbacks).toBe(0);
      }
    });
  });

  // ==========================================================================
  // Property: P5 — No tenantId in any metric label
  // ==========================================================================

  describe('Property: P5 — Bounded Cardinality', () => {
    it('FOR ALL metric emissions, no label value contains tenantId', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // tenantId
          (tenantId) => {
            const metrics = new InMemoryAdaptiveShadowMetrics();
            const logger = new InMemoryAdaptiveShadowLogger();
            const stateStore = new AdaptiveShadowStateStore();

            const realMapper = new RealAdaptiveControlInputMapper(
              () => false,
              () => NORMAL_SIGNALS,
              DEFAULT_REAL_CONFIG,
              () => {},
            );

            const deps: TenantAwareEvaluatorDeps = {
              tenantGate: createTenantGate({ enabled: true, canary: true }),
              stubMapper: new StubAdaptiveControlInputMapper(() => false),
              realMapper,
              stateStore,
              config: DEFAULT_ADAPTIVE_CONFIG,
              metricsEmitter: metrics,
              logger,
            };

            const evaluator = new AdaptiveShadowEvaluator(deps);
            evaluator.evaluateIfEnabled(tenantId, 'SIMULATION_PREVIEW');

            // Check eval metrics
            for (const e of metrics.evaluations) {
              const vals = [e.state, e.guardMode, e.outputReason, e.overrideSource];
              for (const v of vals) {
                expect(v).not.toBe(tenantId);
              }
            }

            // Check transition metrics
            for (const t of metrics.transitions) {
              const vals = [t.from, t.to, t.stateReason];
              for (const v of vals) {
                expect(v).not.toBe(tenantId);
              }
            }

            // Logger entries DO contain tenantId (correct — logs, not metrics)
            if (logger.entries.length > 0) {
              expect(logger.entries[0]!.tenantId).toBe(tenantId);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
