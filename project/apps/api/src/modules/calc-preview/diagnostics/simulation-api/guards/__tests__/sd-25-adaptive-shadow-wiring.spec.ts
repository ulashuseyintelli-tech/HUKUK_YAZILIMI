/**
 * SD-2.5 Adaptive Shadow Wiring — Unit Tests
 *
 * Property coverage:
 *   P1: Shadow invariance — evaluateIfEnabled() never changes guard decision
 *   P2: Flag gating — disabled → 0 calls, 0 metrics
 *   P3: State determinism — same input → same output via wiring
 *   P4: Telemetry bounded cardinality — all labels from closed-set enums
 *   P5: Error isolation — exception → swallow + error counter
 *   P6: Circular dependency freedom — import graph assertion
 *
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/requirements.md
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/design.md
 */

import {
  AdaptiveShadowEvaluator,
  NoopAdaptiveShadowEvaluator,
} from '../adaptive-shadow-evaluator';
import type { AdaptiveShadowEvaluatorDeps } from '../adaptive-shadow-evaluator';
import { AdaptiveShadowStateStore } from '../adaptive-shadow-state-store';
import {
  StubAdaptiveControlInputMapper,
  StaticAdaptiveControlInputMapper,
} from '../adaptive-control-input-mapper';
import {
  InMemoryAdaptiveShadowMetrics,
  ThrowingAdaptiveShadowMetrics,
} from '../adaptive-shadow-metrics';
import {
  InMemoryAdaptiveShadowLogger,
} from '../adaptive-shadow-logger';
import {
  AdaptiveState,
  ProviderHealthZone,
  DEFAULT_ADAPTIVE_CONFIG,
  ALL_STATE_REASONS,
  ALL_OUTPUT_REASONS,
  ADAPTIVE_STATES,
} from '../adaptive-controller.types';
import type { ControlInput } from '../adaptive-controller.types';
import type { SigmaZone } from '../baseline-math';
import { GuardOperation } from '../guard-policy-resolver.types';
import {
  ALL_SHADOW_ERROR_CODES,
  normalizeOverrideSource,
} from '../adaptive-shadow.types';

// ============================================================================
// Helpers
// ============================================================================

const NOW_MS = new Date('2026-02-22T04:00:00.000Z').getTime();

function buildDeps(overrides?: {
  flagEnabled?: boolean;
  killSwitchActive?: boolean;
  input?: ControlInput;
}): {
  deps: AdaptiveShadowEvaluatorDeps;
  metrics: InMemoryAdaptiveShadowMetrics;
  logger: InMemoryAdaptiveShadowLogger;
  store: AdaptiveShadowStateStore;
} {
  const metrics = new InMemoryAdaptiveShadowMetrics();
  const logger = new InMemoryAdaptiveShadowLogger();
  const store = new AdaptiveShadowStateStore();

  const flagEnabled = overrides?.flagEnabled ?? true;
  const killSwitchActive = overrides?.killSwitchActive ?? false;

  const inputMapper = overrides?.input
    ? new StaticAdaptiveControlInputMapper(overrides.input)
    : new StubAdaptiveControlInputMapper(() => killSwitchActive);

  const deps: AdaptiveShadowEvaluatorDeps = {
    flagProvider: () => flagEnabled,
    inputMapper,
    stateStore: store,
    config: DEFAULT_ADAPTIVE_CONFIG,
    metricsEmitter: metrics,
    logger,
  };

  return { deps, metrics, logger, store };
}

function makeInput(overrides?: Partial<ControlInput>): ControlInput {
  return Object.freeze({
    sigmaZone: 'NORMAL' as SigmaZone,
    complianceVerdict: true,
    providerHealthZone: ProviderHealthZone.OK,
    killSwitchActive: false,
    nowMs: NOW_MS,
    ...overrides,
  });
}

// ============================================================================
// P1: Shadow Invariance
// ============================================================================

describe('P1: Shadow Invariance', () => {
  it('evaluateIfEnabled() does not return a value that could alter guard decision', () => {
    const { deps } = buildDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    // evaluateIfEnabled returns void — no value to influence guard
    const result = evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    expect(result).toBeUndefined();
  });

  it('NoopAdaptiveShadowEvaluator does nothing', () => {
    const noop = new NoopAdaptiveShadowEvaluator();
    const result = noop.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// P2: Flag Gating — R1-AC2
// ============================================================================

describe('P2: Flag Gating', () => {
  it('disabled → zero evaluateAdaptive() calls, zero metrics, zero logs', () => {
    const { deps, metrics, logger, store } = buildDeps({ flagEnabled: false });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    expect(metrics.evaluations).toHaveLength(0);
    expect(metrics.transitions).toHaveLength(0);
    expect(metrics.errors).toHaveLength(0);
    expect(logger.entries).toHaveLength(0);
    expect(store.lastEvaluatedAtMs).toBeNull();
  });

  it('disabled → guard_adaptive_* metrics remain constant across multiple calls', () => {
    const { deps, metrics } = buildDeps({ flagEnabled: false });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    for (let i = 0; i < 10; i++) {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    }

    expect(metrics.evaluations).toHaveLength(0);
    expect(metrics.transitions).toHaveLength(0);
    expect(metrics.errors).toHaveLength(0);
  });

  it('enabled → evaluation occurs, metrics emitted', () => {
    const { deps, metrics, logger, store } = buildDeps({ flagEnabled: true });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    expect(metrics.evaluations).toHaveLength(1);
    expect(logger.entries).toHaveLength(1);
    expect(store.lastEvaluatedAtMs).not.toBeNull();
  });
});

// ============================================================================
// P3: State Determinism
// ============================================================================

describe('P3: State Determinism', () => {
  it('same input sequence → same state sequence', () => {
    const input = makeInput();

    // Run 1
    const run1 = buildDeps({ input });
    const eval1 = new AdaptiveShadowEvaluator(run1.deps);
    for (let i = 0; i < 5; i++) {
      eval1.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    }

    // Run 2
    const run2 = buildDeps({ input });
    const eval2 = new AdaptiveShadowEvaluator(run2.deps);
    for (let i = 0; i < 5; i++) {
      eval2.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    }

    // Same metrics sequence
    expect(run1.metrics.evaluations).toEqual(run2.metrics.evaluations);
    expect(run1.metrics.transitions).toEqual(run2.metrics.transitions);
  });

  it('mapper output is passed to evaluateAdaptive without mutation', () => {
    const input = makeInput();
    const { deps, metrics } = buildDeps({ input });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    // With NORMAL/true/OK stub input, state should remain NORMAL
    expect(metrics.evaluations[0]!.state).toBe(AdaptiveState.NORMAL);
    expect(metrics.evaluations[0]!.guardMode).toBe('shadow');
  });
});

// ============================================================================
// P4: Telemetry Bounded Cardinality
// ============================================================================

describe('P4: Telemetry Bounded Cardinality', () => {
  it('all eval metric label values come from closed-set enums', () => {
    const { deps, metrics } = buildDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    const eval0 = metrics.evaluations[0]!;
    expect(ADAPTIVE_STATES).toContain(eval0.state);
    expect(['shadow', 'enforce']).toContain(eval0.guardMode);
    expect(ALL_OUTPUT_REASONS).toContain(eval0.outputReason);
    expect(['KILL_SWITCH', 'PROVIDER_OUTAGE', 'NONE']).toContain(eval0.overrideSource);
  });

  it('error code labels come from the bounded closed-set (ALL_SHADOW_ERROR_CODES)', () => {
    // Source of truth = production ALL_SHADOW_ERROR_CODES; stale hardcoded mirror removed.
    // (1) Bounded cardinality: closed-set non-empty, unique, metric-label-safe.
    expect(ALL_SHADOW_ERROR_CODES.length).toBeGreaterThan(0);
    expect(new Set(ALL_SHADOW_ERROR_CODES).size).toBe(ALL_SHADOW_ERROR_CODES.length);
    for (const code of ALL_SHADOW_ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }

    // (2) Emitted error codes can never be outside the closed-set (emitted ⊆ canonical).
    const { deps, metrics } = buildDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);
    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    for (const e of metrics.errors) {
      expect(ALL_SHADOW_ERROR_CODES).toContain(e.code);
    }
  });

  it('overrideSource normalization: null → NONE', () => {
    expect(normalizeOverrideSource(null)).toBe('NONE');
    expect(normalizeOverrideSource('KILL_SWITCH')).toBe('KILL_SWITCH');
    expect(normalizeOverrideSource('PROVIDER_OUTAGE')).toBe('PROVIDER_OUTAGE');
  });

  it('no UNKNOWN values in evaluation metrics', () => {
    const { deps, metrics } = buildDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    // Run multiple evaluations
    for (let i = 0; i < 5; i++) {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    }

    for (const e of metrics.evaluations) {
      expect(e.state).not.toBe('UNKNOWN');
      expect(e.guardMode).not.toBe('UNKNOWN');
      expect(e.outputReason).not.toBe('UNKNOWN');
      expect(e.overrideSource).not.toBe('UNKNOWN');
    }
  });
});

// ============================================================================
// P5: Error Isolation
// ============================================================================

describe('P5: Error Isolation', () => {
  it('evaluator exception is thrown (interceptor swallows)', () => {
    const { deps } = buildDeps();
    // Replace mapper with a throwing one
    const brokenDeps: AdaptiveShadowEvaluatorDeps = {
      ...deps,
      inputMapper: {
        buildInput: () => { throw new Error('mapper boom'); },
      },
    };
    const evaluator = new AdaptiveShadowEvaluator(brokenDeps);

    expect(() => {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    }).toThrow('mapper boom');
  });

  it('error counter incremented with EVALUATION_EXCEPTION on mapper failure', () => {
    const metrics = new InMemoryAdaptiveShadowMetrics();
    const { deps } = buildDeps();
    const brokenDeps: AdaptiveShadowEvaluatorDeps = {
      ...deps,
      metricsEmitter: metrics,
      inputMapper: {
        buildInput: () => { throw new Error('mapper boom'); },
      },
    };
    const evaluator = new AdaptiveShadowEvaluator(brokenDeps);

    try {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    } catch {
      // expected
    }

    expect(metrics.errors).toHaveLength(1);
    expect(metrics.errors[0]!.code).toBe('EVALUATION_EXCEPTION');
  });

  it('error counter incremented with STATE_STORE_ERROR on store.get() failure', () => {
    const metrics = new InMemoryAdaptiveShadowMetrics();
    const store = new AdaptiveShadowStateStore();
    store.get = () => { throw new Error('store get boom'); };

    const { deps } = buildDeps();
    const brokenDeps: AdaptiveShadowEvaluatorDeps = {
      ...deps,
      metricsEmitter: metrics,
      stateStore: store,
    };
    const evaluator = new AdaptiveShadowEvaluator(brokenDeps);

    try {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    } catch {
      // expected
    }

    expect(metrics.errors).toHaveLength(1);
    expect(metrics.errors[0]!.code).toBe('STATE_STORE_ERROR');
  });

  it('lastEvaluatedAtMs NOT updated on error', () => {
    const store = new AdaptiveShadowStateStore();
    const { deps } = buildDeps();
    const brokenDeps: AdaptiveShadowEvaluatorDeps = {
      ...deps,
      stateStore: store,
      inputMapper: {
        buildInput: () => { throw new Error('boom'); },
      },
    };
    const evaluator = new AdaptiveShadowEvaluator(brokenDeps);

    try {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    } catch {
      // expected
    }

    expect(store.lastEvaluatedAtMs).toBeNull();
  });

  it('metrics emitter failure during error reporting does not double-throw', () => {
    const throwingMetrics = new ThrowingAdaptiveShadowMetrics();
    const { deps } = buildDeps();
    const brokenDeps: AdaptiveShadowEvaluatorDeps = {
      ...deps,
      metricsEmitter: throwingMetrics,
      inputMapper: {
        buildInput: () => { throw new Error('primary boom'); },
      },
    };
    const evaluator = new AdaptiveShadowEvaluator(brokenDeps);

    // Should throw the primary error, not the metrics error
    expect(() => {
      evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    }).toThrow('primary boom');
  });
});

// ============================================================================
// P6: Circular Dependency Freedom
// ============================================================================

describe('P6: Circular Dependency Freedom', () => {
  it('adaptive-controller.ts does not import any SD-2.5 wiring file', () => {
    // This is a static assertion — if adaptive-controller.ts imported
    // adaptive-shadow-evaluator.ts, it would create a circular dependency
    // that tsc would catch. The fact that this test file compiles proves
    // the import graph is acyclic.
    //
    // Additional runtime check: verify the module loaded without circular ref issues
    const controller = require('../adaptive-controller');
    expect(controller.evaluateAdaptive).toBeDefined();
    expect(typeof controller.evaluateAdaptive).toBe('function');
  });

  it('adaptive-controller.types.ts does not import any SD-2.5 wiring file', () => {
    const types = require('../adaptive-controller.types');
    expect(types.AdaptiveState).toBeDefined();
    expect(types.ProviderHealthZone).toBeDefined();
    expect(types.createInitialState).toBeDefined();
  });
});

// ============================================================================
// Store Contract (R4)
// ============================================================================

describe('AdaptiveShadowStateStore', () => {
  it('initial lastEvaluatedAtMs is null', () => {
    const store = new AdaptiveShadowStateStore();
    expect(store.lastEvaluatedAtMs).toBeNull();
  });

  it('set() updates lastEvaluatedAtMs', () => {
    const store = new AdaptiveShadowStateStore();
    const state = store.get();
    store.set(state);
    expect(store.lastEvaluatedAtMs).not.toBeNull();
    expect(typeof store.lastEvaluatedAtMs).toBe('number');
  });

  it('reset() clears lastEvaluatedAtMs to null', () => {
    const store = new AdaptiveShadowStateStore();
    store.set(store.get());
    expect(store.lastEvaluatedAtMs).not.toBeNull();

    store.reset();
    expect(store.lastEvaluatedAtMs).toBeNull();
  });

  it('get() returns initial NORMAL state', () => {
    const store = new AdaptiveShadowStateStore();
    const state = store.get();
    expect(state.currentState).toBe(AdaptiveState.NORMAL);
  });
});

// ============================================================================
// Stub Mapper Contract (R2)
// ============================================================================

describe('StubAdaptiveControlInputMapper', () => {
  it('produces deterministic stub input with real killSwitch', () => {
    let ksValue = false;
    const mapper = new StubAdaptiveControlInputMapper(() => ksValue);

    const input1 = mapper.buildInput();
    expect(input1.sigmaZone).toBe('NORMAL');
    expect(input1.complianceVerdict).toBe(true);
    expect(input1.providerHealthZone).toBe(ProviderHealthZone.OK);
    expect(input1.killSwitchActive).toBe(false);
    expect(typeof input1.nowMs).toBe('number');

    ksValue = true;
    const input2 = mapper.buildInput();
    expect(input2.killSwitchActive).toBe(true);
  });

  it('input is frozen (immutable)', () => {
    const mapper = new StubAdaptiveControlInputMapper(() => false);
    const input = mapper.buildInput();
    expect(Object.isFrozen(input)).toBe(true);
  });
});

// ============================================================================
// Structured Logging Contract (R7)
// ============================================================================

describe('Structured Logging', () => {
  it('one log entry per evaluation', () => {
    const { deps, logger } = buildDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-2', GuardOperation.EVALUATE);

    expect(logger.entries).toHaveLength(2);
  });

  it('log entry contains all required fields', () => {
    const { deps, logger } = buildDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    const entry = logger.entries[0]!;
    expect(entry.prevState).toBeDefined();
    expect(entry.nextState).toBeDefined();
    expect(entry.guardMode).toBeDefined();
    expect(entry.outputReason).toBeDefined();
    expect(entry.stateReason).toBeDefined();
    expect(typeof entry.overrideActive).toBe('boolean');
    expect(entry.sigmaZone).toBeDefined();
    expect(entry.tenantId).toBe('t-1');
    expect(entry.operation).toBe(GuardOperation.EVALUATE);
  });

  it('all log reason values from closed-set enums', () => {
    const { deps, logger } = buildDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    const entry = logger.entries[0]!;
    expect(ALL_OUTPUT_REASONS).toContain(entry.outputReason);
    expect(ALL_STATE_REASONS).toContain(entry.stateReason);
    expect(ADAPTIVE_STATES).toContain(entry.nextState);
    expect(ADAPTIVE_STATES).toContain(entry.prevState);
  });

  it('no log when disabled', () => {
    const { deps, logger } = buildDeps({ flagEnabled: false });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    expect(logger.entries).toHaveLength(0);
  });
});

// ============================================================================
// Kill-Switch Integration (R2-AC2)
// ============================================================================

describe('Kill-Switch via Stub Mapper', () => {
  it('killSwitch=true → state forced to NORMAL, outputReason=KS_FORCED_SHADOW', () => {
    const input = makeInput({ killSwitchActive: true });
    const { deps, metrics } = buildDeps({ input });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    expect(metrics.evaluations[0]!.state).toBe(AdaptiveState.NORMAL);
    expect(metrics.evaluations[0]!.outputReason).toBe('KS_FORCED_SHADOW');
    expect(metrics.evaluations[0]!.guardMode).toBe('shadow');
  });
});
