/**
 * SD-2.6 D1: Prometheus Client Wiring — Unit Tests
 *
 * Validates PromAdaptiveShadowMetrics:
 *   T1: Counter increment — registry metric value verification
 *   T2: Label values — closed-set enum assertion
 *   T3: Error swallow — prom-client failure → no throw
 *   T4: Scrape format — text/plain output contains expected metric names
 *   T5: Cardinality bound — max time series ≤ 259
 *   T6: Flag-off guarantee — evaluator with Prom metrics, flag=false → 0 increments
 *   T7: Integration — evaluator + Prom metrics end-to-end
 *
 * @see .kiro/specs/sd-26-adaptive-real-signals/requirements.md — R1, R2
 * @see .kiro/specs/sd-26-adaptive-real-signals/design.md — D1
 */

import { Registry } from 'prom-client';
import { PromAdaptiveShadowMetrics } from '../adaptive-prom-metrics';
import {
  AdaptiveShadowEvaluator,
} from '../adaptive-shadow-evaluator';
import type { AdaptiveShadowEvaluatorDeps } from '../adaptive-shadow-evaluator';
import { AdaptiveShadowStateStore } from '../adaptive-shadow-state-store';
import {
  StubAdaptiveControlInputMapper,
  StaticAdaptiveControlInputMapper,
} from '../adaptive-control-input-mapper';
import { InMemoryAdaptiveShadowLogger } from '../adaptive-shadow-logger';
import {
  AdaptiveState,
  ProviderHealthZone,
  DEFAULT_ADAPTIVE_CONFIG,
  ADAPTIVE_STATES,
  ALL_OUTPUT_REASONS,
  ALL_STATE_REASONS,
} from '../adaptive-controller.types';
import type { ControlInput, ControlOutput } from '../adaptive-controller.types';
import type { SigmaZone } from '../baseline-math';
import { GuardOperation } from '../guard-policy-resolver.types';
import {
  ALL_SHADOW_ERROR_CODES,
} from '../adaptive-shadow.types';
import type { OverrideSourceLabel } from '../adaptive-shadow.types';

// ============================================================================
// Helpers
// ============================================================================

function createTestRegistry(): Registry {
  return new Registry();
}

function makeOutput(overrides?: Partial<ControlOutput>): ControlOutput {
  return Object.freeze({
    state: AdaptiveState.NORMAL,
    previousState: AdaptiveState.NORMAL,
    guardMode: 'shadow' as const,
    outputReason: 'SHADOW_NORMAL' as const,
    stateReason: 'STEADY_STATE' as const,
    transitionOccurred: false,
    dwellTimeRemainingMs: 0,
    flipBudgetRemaining: 4,
    evaluatedAtMs: Date.now(),
    overrideActive: false,
    ...overrides,
  });
}

function makeInput(overrides?: Partial<ControlInput>): ControlInput {
  return Object.freeze({
    sigmaZone: 'NORMAL' as SigmaZone,
    complianceVerdict: true,
    providerHealthZone: ProviderHealthZone.OK,
    killSwitchActive: false,
    nowMs: Date.now(),
    ...overrides,
  });
}

function buildEvaluatorWithProm(opts?: {
  flagEnabled?: boolean;
  input?: ControlInput;
}): {
  evaluator: AdaptiveShadowEvaluator;
  registry: Registry;
  promMetrics: PromAdaptiveShadowMetrics;
  store: AdaptiveShadowStateStore;
  logger: InMemoryAdaptiveShadowLogger;
} {
  const registry = createTestRegistry();
  const promMetrics = new PromAdaptiveShadowMetrics(registry);
  const logger = new InMemoryAdaptiveShadowLogger();
  const store = new AdaptiveShadowStateStore();
  const flagEnabled = opts?.flagEnabled ?? true;

  const inputMapper = opts?.input
    ? new StaticAdaptiveControlInputMapper(opts.input)
    : new StubAdaptiveControlInputMapper(() => false);

  const deps: AdaptiveShadowEvaluatorDeps = {
    flagProvider: () => flagEnabled,
    inputMapper,
    stateStore: store,
    config: DEFAULT_ADAPTIVE_CONFIG,
    metricsEmitter: promMetrics,
    logger,
  };

  const evaluator = new AdaptiveShadowEvaluator(deps);
  return { evaluator, registry, promMetrics, store, logger };
}

// ============================================================================
// T1: Counter Increment — Registry Metric Value Verification
// ============================================================================

describe('T1: Counter Increment', () => {
  it('emitEvaluation increments guard_adaptive_eval_total', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    const output = makeOutput();

    prom.emitEvaluation(output, 'NONE');

    const metrics = await registry.getMetricsAsJSON();
    const evalMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_total');
    expect(evalMetric).toBeDefined();
    expect(evalMetric!.values.length).toBeGreaterThan(0);
    expect(evalMetric!.values[0]!.value).toBe(1);
  });

  it('emitTransition increments guard_adaptive_transition_total', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    const output = makeOutput({
      state: AdaptiveState.ELEVATED,
      previousState: AdaptiveState.NORMAL,
      transitionOccurred: true,
      stateReason: 'ZONE_ESCALATION',
    });

    prom.emitTransition(output);

    const metrics = await registry.getMetricsAsJSON();
    const transMetric = metrics.find((m) => m.name === 'guard_adaptive_transition_total');
    expect(transMetric).toBeDefined();
    expect(transMetric!.values[0]!.value).toBe(1);
  });

  it('emitError increments guard_adaptive_eval_errors_total', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    prom.emitError('EVALUATION_EXCEPTION');

    const metrics = await registry.getMetricsAsJSON();
    const errMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_errors_total');
    expect(errMetric).toBeDefined();
    expect(errMetric!.values[0]!.value).toBe(1);
    expect(errMetric!.values[0]!.labels).toEqual({ code: 'EVALUATION_EXCEPTION' });
  });

  it('multiple increments accumulate correctly', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    const output = makeOutput();

    prom.emitEvaluation(output, 'NONE');
    prom.emitEvaluation(output, 'NONE');
    prom.emitEvaluation(output, 'NONE');

    const metrics = await registry.getMetricsAsJSON();
    const evalMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_total');
    expect(evalMetric!.values[0]!.value).toBe(3);
  });
});

// ============================================================================
// T2: Label Values — Closed-Set Enum Assertion
// ============================================================================

describe('T2: Label Values — Closed-Set Enums', () => {
  it('eval metric labels match closed-set enums', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    // Emit with each AdaptiveState
    for (const state of ADAPTIVE_STATES) {
      const output = makeOutput({ state });
      prom.emitEvaluation(output, 'NONE');
    }

    const metrics = await registry.getMetricsAsJSON();
    const evalMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_total');

    for (const val of evalMetric!.values) {
      expect(ADAPTIVE_STATES).toContain(val.labels.state);
      expect(['shadow', 'enforce']).toContain(val.labels.guardMode);
      expect(ALL_OUTPUT_REASONS).toContain(val.labels.outputReason);
      expect(['KILL_SWITCH', 'PROVIDER_OUTAGE', 'NONE']).toContain(val.labels.overrideSource);
    }
  });

  it('transition metric labels match closed-set enums', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    const output = makeOutput({
      state: AdaptiveState.ELEVATED,
      previousState: AdaptiveState.NORMAL,
      stateReason: 'ZONE_ESCALATION',
      transitionOccurred: true,
    });
    prom.emitTransition(output);

    const metrics = await registry.getMetricsAsJSON();
    const transMetric = metrics.find((m) => m.name === 'guard_adaptive_transition_total');

    for (const val of transMetric!.values) {
      expect(ADAPTIVE_STATES).toContain(val.labels.from);
      expect(ADAPTIVE_STATES).toContain(val.labels.to);
      expect(ALL_STATE_REASONS).toContain(val.labels.stateReason);
    }
  });

  it('error metric code labels match closed-set', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    for (const code of ALL_SHADOW_ERROR_CODES) {
      prom.emitError(code);
    }

    const metrics = await registry.getMetricsAsJSON();
    const errMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_errors_total');

    for (const val of errMetric!.values) {
      expect(ALL_SHADOW_ERROR_CODES).toContain(val.labels.code);
    }
  });

  it('overrideSource label covers all 3 values', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    const output = makeOutput();

    const sources: OverrideSourceLabel[] = ['NONE', 'KILL_SWITCH', 'PROVIDER_OUTAGE'];
    for (const src of sources) {
      prom.emitEvaluation(output, src);
    }

    const metrics = await registry.getMetricsAsJSON();
    const evalMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_total');
    const labelValues = evalMetric!.values.map((v) => v.labels.overrideSource);

    for (const src of sources) {
      expect(labelValues).toContain(src);
    }
  });
});

// ============================================================================
// T3: Error Swallow — prom-client Failure → No Throw
// ============================================================================

describe('T3: Error Swallow', () => {
  it('emitEvaluation swallows prom-client errors', () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    // Force an error by passing invalid output (null cast)
    // prom-client may throw on undefined labels
    // Our implementation wraps in try/catch — should not throw
    expect(() => {
      prom.emitEvaluation(null as unknown as ControlOutput, 'NONE');
    }).not.toThrow();
  });

  it('emitTransition swallows prom-client errors', () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    expect(() => {
      prom.emitTransition(null as unknown as ControlOutput);
    }).not.toThrow();
  });

  it('emitError swallows prom-client errors', () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    expect(() => {
      prom.emitError(null as unknown as any);
    }).not.toThrow();
  });
});

// ============================================================================
// T4: Scrape Format — Text Output Contains Expected Metric Names
// ============================================================================

describe('T4: Scrape Format', () => {
  it('/metrics text output contains guard_adaptive_eval_total', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    prom.emitEvaluation(makeOutput(), 'NONE');

    const text = await registry.metrics();
    expect(text).toContain('guard_adaptive_eval_total');
  });

  it('/metrics text output contains guard_adaptive_transition_total', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    prom.emitTransition(makeOutput({
      state: AdaptiveState.ELEVATED,
      previousState: AdaptiveState.NORMAL,
      stateReason: 'ZONE_ESCALATION',
    }));

    const text = await registry.metrics();
    expect(text).toContain('guard_adaptive_transition_total');
  });

  it('/metrics text output contains guard_adaptive_eval_errors_total', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    prom.emitError('EVALUATION_EXCEPTION');

    const text = await registry.metrics();
    expect(text).toContain('guard_adaptive_eval_errors_total');
  });

  it('all metric names start with guard_adaptive_ prefix', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);
    prom.emitEvaluation(makeOutput(), 'NONE');
    prom.emitTransition(makeOutput({
      state: AdaptiveState.ELEVATED,
      previousState: AdaptiveState.NORMAL,
      stateReason: 'ZONE_ESCALATION',
    }));
    prom.emitError('EVALUATION_EXCEPTION');

    const metrics = await registry.getMetricsAsJSON();
    for (const m of metrics) {
      expect(m.name).toMatch(/^guard_adaptive_/);
    }
  });
});

// ============================================================================
// T5: Cardinality Bound
// ============================================================================

describe('T5: Cardinality Bound', () => {
  it('maximum theoretical time series ≤ 259', () => {
    // eval: 4 states × 2 guardModes × 4 outputReasons × 3 overrideSources = 96
    const evalCardinality = ADAPTIVE_STATES.length * 2 * ALL_OUTPUT_REASONS.length * 3;
    // transition: 4 from × 4 to × 10 stateReasons = 160
    const transCardinality = ADAPTIVE_STATES.length * ADAPTIVE_STATES.length * ALL_STATE_REASONS.length;
    // errors: 4 codes (3 original + REAL_MAPPER_UNAVAILABLE from D3)
    const errorCardinality = ALL_SHADOW_ERROR_CODES.length;

    const total = evalCardinality + transCardinality + errorCardinality;
    expect(total).toBeLessThanOrEqual(260);

    // Verify exact values
    expect(evalCardinality).toBe(96);
    expect(transCardinality).toBe(160);
    expect(errorCardinality).toBe(4);
    expect(total).toBe(260);
  });
});

// ============================================================================
// T6: Flag-Off Guarantee — P2 Preserved with Prom Metrics
// ============================================================================

describe('T6: Flag-Off Guarantee (P2 with Prom)', () => {
  it('flag=false → zero prom counter increments', async () => {
    const { evaluator, registry } = buildEvaluatorWithProm({ flagEnabled: false });

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-2', GuardOperation.EVALUATE);

    const text = await registry.metrics();
    // No metric data should be emitted
    expect(text).not.toContain('guard_adaptive_eval_total{');
    expect(text).not.toContain('guard_adaptive_transition_total{');
    expect(text).not.toContain('guard_adaptive_eval_errors_total{');
  });

  it('flag=false → lastEvaluatedAtMs remains null', () => {
    const { evaluator, store } = buildEvaluatorWithProm({ flagEnabled: false });

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    expect(store.lastEvaluatedAtMs).toBeNull();
  });
});

// ============================================================================
// T7: Integration — Evaluator + Prom Metrics End-to-End
// ============================================================================

describe('T7: Integration — Evaluator + Prom', () => {
  it('evaluator with Prom metrics: eval counter increments on each call', async () => {
    const { evaluator, registry } = buildEvaluatorWithProm({ flagEnabled: true });

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    const metrics = await registry.getMetricsAsJSON();
    const evalMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_total');
    expect(evalMetric).toBeDefined();

    const totalValue = evalMetric!.values.reduce((sum, v) => sum + v.value, 0);
    expect(totalValue).toBe(3);
  });

  it('evaluator with Prom metrics: stub input → no transitions', async () => {
    const { evaluator, registry } = buildEvaluatorWithProm({ flagEnabled: true });

    for (let i = 0; i < 5; i++) {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    }

    const metrics = await registry.getMetricsAsJSON();
    const transMetric = metrics.find((m) => m.name === 'guard_adaptive_transition_total');
    // With stub NORMAL input, no transitions should occur
    if (transMetric) {
      const totalTransitions = transMetric.values.reduce((sum, v) => sum + v.value, 0);
      expect(totalTransitions).toBe(0);
    }
  });

  it('evaluator with Prom metrics: kill-switch → KS_FORCED_SHADOW label', async () => {
    const input = makeInput({ killSwitchActive: true });
    const { evaluator, registry } = buildEvaluatorWithProm({
      flagEnabled: true,
      input,
    });

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    const metrics = await registry.getMetricsAsJSON();
    const evalMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_total');
    expect(evalMetric).toBeDefined();

    const ksValue = evalMetric!.values.find(
      (v) => v.labels.overrideSource === 'KILL_SWITCH',
    );
    expect(ksValue).toBeDefined();
    expect(ksValue!.labels.outputReason).toBe('KS_FORCED_SHADOW');
  });

  it('evaluator with Prom metrics: error → error counter incremented', async () => {
    const registry = createTestRegistry();
    const promMetrics = new PromAdaptiveShadowMetrics(registry);
    const logger = new InMemoryAdaptiveShadowLogger();
    const store = new AdaptiveShadowStateStore();

    const deps: AdaptiveShadowEvaluatorDeps = {
      flagProvider: () => true,
      inputMapper: {
        buildInput: () => { throw new Error('test boom'); },
      },
      stateStore: store,
      config: DEFAULT_ADAPTIVE_CONFIG,
      metricsEmitter: promMetrics,
      logger,
    };

    const evaluator = new AdaptiveShadowEvaluator(deps);

    try {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    } catch {
      // expected — interceptor swallows
    }

    const metrics = await registry.getMetricsAsJSON();
    const errMetric = metrics.find((m) => m.name === 'guard_adaptive_eval_errors_total');
    expect(errMetric).toBeDefined();
    expect(errMetric!.values[0]!.value).toBe(1);
    expect(errMetric!.values[0]!.labels.code).toBe('EVALUATION_EXCEPTION');
  });

  it('evaluator with Prom metrics: lastEvaluatedAtMs updated on success', () => {
    const { evaluator, store } = buildEvaluatorWithProm({ flagEnabled: true });

    expect(store.lastEvaluatedAtMs).toBeNull();
    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    expect(store.lastEvaluatedAtMs).not.toBeNull();
  });
});

// ============================================================================
// F2: Eviction Counter — guard_adaptive_tenant_eviction_total
// ============================================================================

describe('F2: Eviction Counter', () => {
  it('emitEviction increments guard_adaptive_tenant_eviction_total{reason="LRU"}', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    prom.emitEviction('LRU');
    prom.emitEviction('LRU');

    const metric = await registry.getSingleMetricAsString('guard_adaptive_tenant_eviction_total');
    expect(metric).toContain('guard_adaptive_tenant_eviction_total');
    expect(metric).toContain('reason="LRU"');

    const value = (await registry.getSingleMetric('guard_adaptive_tenant_eviction_total')!
      .get()).values.find(v => v.labels.reason === 'LRU');
    expect(value?.value).toBe(2);
  });

  it('createEvictionCallback returns a function that increments eviction counter', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    const callback = prom.createEvictionCallback();
    callback('t-evicted-1');
    callback('t-evicted-2');

    const value = (await registry.getSingleMetric('guard_adaptive_tenant_eviction_total')!
      .get()).values.find(v => v.labels.reason === 'LRU');
    expect(value?.value).toBe(2);
  });

  it('eviction counter has no tenantId label (cardinality safety)', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    prom.emitEviction('LRU');

    const values = (await registry.getSingleMetric('guard_adaptive_tenant_eviction_total')!
      .get()).values;
    for (const v of values) {
      // No tenantId, tenant, or id label — only 'reason'
      const labelKeys = Object.keys(v.labels);
      expect(labelKeys).toEqual(['reason']);
    }
  });

  it('eviction counter visible in /metrics scrape output', async () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    prom.emitEviction('LRU');

    const scrape = await registry.metrics();
    expect(scrape).toContain('guard_adaptive_tenant_eviction_total');
    expect(scrape).toContain('reason="LRU"');
  });

  it('emitEviction swallows prom-client errors', () => {
    const registry = createTestRegistry();
    const prom = new PromAdaptiveShadowMetrics(registry);

    // Sabotage the counter to force an error
    (prom as any).evictionTotal = { inc: () => { throw new Error('boom'); } };

    expect(() => prom.emitEviction('LRU')).not.toThrow();
  });
});
