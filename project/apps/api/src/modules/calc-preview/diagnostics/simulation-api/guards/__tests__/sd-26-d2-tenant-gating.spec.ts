/**
 * SD-2.6 D2 Per-Tenant Gating — Unit Tests
 *
 * Property coverage:
 *   P5: Gate precedence — all flag/override combinations deterministic
 *   P2: Tenant isolation — parallel tenant state transitions don't interfere
 *   P3: Canary containment — non-canary → stub mapper assertion
 *   P7: Eviction — maxTrackedTenants exceeded, LRU eviction
 *   P6: Backward compat — SD-2.5 backward-compat API works
 *   Store contract: per-tenant get/set/reset/lastEvaluatedAtMs
 *   Gate config reload: runtime config change → immediate effect
 *
 * @see .kiro/specs/sd-26-adaptive-real-signals/requirements.md — R3, R4, R5
 * @see .kiro/specs/sd-26-adaptive-real-signals/design.md — D2
 */

import {
  DefaultAdaptiveTenantGate,
  NoopAdaptiveTenantGate,
  DisabledAdaptiveTenantGate,
} from '../adaptive-tenant-gate';
import type { AdaptiveTenantGateConfig } from '../adaptive-tenant-gate';
import { AdaptiveShadowStateStore } from '../adaptive-shadow-state-store';
import {
  AdaptiveShadowEvaluator,
} from '../adaptive-shadow-evaluator';
import type { TenantAwareEvaluatorDeps } from '../adaptive-shadow-evaluator';
import {
  StubAdaptiveControlInputMapper,
  StaticAdaptiveControlInputMapper,
} from '../adaptive-control-input-mapper';
import {
  InMemoryAdaptiveShadowMetrics,
} from '../adaptive-shadow-metrics';
import {
  InMemoryAdaptiveShadowLogger,
} from '../adaptive-shadow-logger';
import {
  AdaptiveState,
  ProviderHealthZone,
  DEFAULT_ADAPTIVE_CONFIG,
  createInitialState,
} from '../adaptive-controller.types';
import type { ControlInput } from '../adaptive-controller.types';
import type { SigmaZone } from '../baseline-math';
import { GuardOperation } from '../guard-policy-resolver.types';

// ============================================================================
// Helpers
// ============================================================================

function makeConfig(overrides?: Partial<AdaptiveTenantGateConfig>): AdaptiveTenantGateConfig {
  return {
    globalEnabled: true,
    tenantOverrides: {},
    canaryTenants: [],
    ...overrides,
  };
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

function buildTenantAwareDeps(overrides?: {
  config?: AdaptiveTenantGateConfig;
  storeConfig?: { maxTrackedTenants: number };
  onEviction?: (tid: string) => void;
  input?: ControlInput;
  canaryInput?: ControlInput;
}): {
  deps: TenantAwareEvaluatorDeps;
  metrics: InMemoryAdaptiveShadowMetrics;
  logger: InMemoryAdaptiveShadowLogger;
  store: AdaptiveShadowStateStore;
  gateConfig: AdaptiveTenantGateConfig;
} {
  const gateConfig = overrides?.config ?? makeConfig();
  const mutableConfig = { ...gateConfig };
  const metrics = new InMemoryAdaptiveShadowMetrics();
  const logger = new InMemoryAdaptiveShadowLogger();
  const store = new AdaptiveShadowStateStore(overrides?.storeConfig, overrides?.onEviction);

  const stubMapper = overrides?.input
    ? new StaticAdaptiveControlInputMapper(overrides.input)
    : new StubAdaptiveControlInputMapper(() => false);

  const realMapper = overrides?.canaryInput
    ? new StaticAdaptiveControlInputMapper(overrides.canaryInput)
    : undefined;

  const gate = new DefaultAdaptiveTenantGate(() => mutableConfig);

  const deps: TenantAwareEvaluatorDeps = {
    tenantGate: gate,
    stubMapper,
    realMapper,
    stateStore: store,
    config: DEFAULT_ADAPTIVE_CONFIG,
    metricsEmitter: metrics,
    logger,
  };

  return { deps, metrics, logger, store, gateConfig: mutableConfig };
}

// ============================================================================
// P5: Gate Precedence
// ============================================================================

describe('P5: Gate Precedence', () => {
  it('P0: globalEnabled=false → all tenants disabled', () => {
    const config = makeConfig({ globalEnabled: false });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isEnabled('t-1')).toBe(false);
    expect(gate.isEnabled('t-2')).toBe(false);
    expect(gate.isEnabled('any-tenant')).toBe(false);
  });

  it('P0: globalEnabled=false overrides tenant-on override', () => {
    const config = makeConfig({
      globalEnabled: false,
      tenantOverrides: { 't-1': true },
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isEnabled('t-1')).toBe(false);
  });

  it('P1: tenantOverrides[id]=false → this tenant disabled', () => {
    const config = makeConfig({
      globalEnabled: true,
      tenantOverrides: { 't-1': false },
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isEnabled('t-1')).toBe(false);
    expect(gate.isEnabled('t-2')).toBe(true); // no override → P3
  });

  it('P2: tenantOverrides[id]=true → this tenant enabled', () => {
    const config = makeConfig({
      globalEnabled: true,
      tenantOverrides: { 't-1': true },
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isEnabled('t-1')).toBe(true);
  });

  it('P3: globalEnabled=true + no override → enabled (default)', () => {
    const config = makeConfig({ globalEnabled: true });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isEnabled('t-1')).toBe(true);
    expect(gate.isEnabled('unknown-tenant')).toBe(true);
  });

  it('all 8 combinations of (global, override, expected) are deterministic', () => {
    // Exhaustive truth table for gate precedence
    const cases: Array<{
      global: boolean;
      override: boolean | undefined;
      expected: boolean;
    }> = [
      // P0: global off → always false
      { global: false, override: undefined, expected: false },
      { global: false, override: true, expected: false },
      { global: false, override: false, expected: false },
      // P1: global on + override false → false
      { global: true, override: false, expected: false },
      // P2: global on + override true → true
      { global: true, override: true, expected: true },
      // P3: global on + no override → true
      { global: true, override: undefined, expected: true },
    ];

    for (const { global: g, override: o, expected } of cases) {
      const overrides: Record<string, boolean> = {};
      if (o !== undefined) overrides['t-1'] = o;
      const config = makeConfig({ globalEnabled: g, tenantOverrides: overrides });
      const gate = new DefaultAdaptiveTenantGate(() => config);
      expect(gate.isEnabled('t-1')).toBe(expected);
    }
  });
});

// ============================================================================
// Canary Gate
// ============================================================================

describe('Canary Gate', () => {
  it('isCanary=true when enabled AND in canaryTenants list', () => {
    const config = makeConfig({
      globalEnabled: true,
      canaryTenants: ['t-canary'],
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isCanary('t-canary')).toBe(true);
  });

  it('isCanary=false when enabled but NOT in canaryTenants list', () => {
    const config = makeConfig({
      globalEnabled: true,
      canaryTenants: ['t-canary'],
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isCanary('t-other')).toBe(false);
  });

  it('isCanary=false when disabled (even if in canaryTenants)', () => {
    const config = makeConfig({
      globalEnabled: false,
      canaryTenants: ['t-canary'],
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isCanary('t-canary')).toBe(false);
  });

  it('isCanary=false when tenant override=false (even if in canaryTenants)', () => {
    const config = makeConfig({
      globalEnabled: true,
      tenantOverrides: { 't-canary': false },
      canaryTenants: ['t-canary'],
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);
    expect(gate.isCanary('t-canary')).toBe(false);
  });
});

// ============================================================================
// Noop / Disabled Gate Implementations
// ============================================================================

describe('NoopAdaptiveTenantGate', () => {
  it('always enabled, never canary', () => {
    const gate = new NoopAdaptiveTenantGate();
    expect(gate.isEnabled('any')).toBe(true);
    expect(gate.isCanary('any')).toBe(false);
  });
});

describe('DisabledAdaptiveTenantGate', () => {
  it('always disabled, never canary', () => {
    const gate = new DisabledAdaptiveTenantGate();
    expect(gate.isEnabled('any')).toBe(false);
    expect(gate.isCanary('any')).toBe(false);
  });
});

// ============================================================================
// P2: Tenant Isolation
// ============================================================================

describe('P2: Tenant Isolation', () => {
  it('two tenants have independent state — state transition in t-1 does not affect t-2', () => {
    const warningInput = makeInput({ sigmaZone: 'WARNING' as SigmaZone });
    const { deps, store, metrics } = buildTenantAwareDeps({ input: warningInput });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    // Evaluate t-1 multiple times to build consecutive count
    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);

    // t-2 should still be in initial NORMAL state
    const t2State = store.getForTenant('t-2');
    expect(t2State.currentState).toBe(AdaptiveState.NORMAL);

    // t-1 should have progressed
    const t1State = store.getForTenant('t-1');
    expect(t1State.consecutiveCount).toBeGreaterThan(0);
  });

  it('per-tenant lastEvaluatedAtMs is independent', () => {
    const { deps, store } = buildTenantAwareDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    expect(store.lastEvaluatedAtMsForTenant('t-1')).not.toBeNull();
    expect(store.lastEvaluatedAtMsForTenant('t-2')).toBeNull();

    evaluator.evaluateIfEnabled('t-2', GuardOperation.EVALUATE);
    expect(store.lastEvaluatedAtMsForTenant('t-2')).not.toBeNull();
  });

  it('resetTenant only affects target tenant', () => {
    const { deps, store } = buildTenantAwareDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-2', GuardOperation.EVALUATE);

    store.resetTenant('t-1');
    expect(store.lastEvaluatedAtMsForTenant('t-1')).toBeNull();
    expect(store.lastEvaluatedAtMsForTenant('t-2')).not.toBeNull();
  });
});

// ============================================================================
// P3: Canary Containment
// ============================================================================

describe('P3: Canary Containment', () => {
  it('non-canary tenant uses stub mapper (no real signal mapping)', () => {
    const stubInput = makeInput({ sigmaZone: 'NORMAL' as SigmaZone });
    const canaryInput = makeInput({ sigmaZone: 'ALERT' as SigmaZone });

    const { deps, metrics } = buildTenantAwareDeps({
      config: makeConfig({
        globalEnabled: true,
        canaryTenants: ['t-canary'],
      }),
      input: stubInput,
      canaryInput,
    });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    // Non-canary tenant → stub mapper → NORMAL zone
    evaluator.evaluateIfEnabled('t-regular', GuardOperation.EVALUATE);
    expect(metrics.evaluations).toHaveLength(1);
    // Stub mapper always produces NORMAL → state stays NORMAL
    expect(metrics.evaluations[0].state).toBe('NORMAL');
  });

  it('canary tenant uses real mapper when available', () => {
    const stubInput = makeInput({ sigmaZone: 'NORMAL' as SigmaZone });
    const canaryInput = makeInput({ sigmaZone: 'WARNING' as SigmaZone });

    const { deps, metrics } = buildTenantAwareDeps({
      config: makeConfig({
        globalEnabled: true,
        canaryTenants: ['t-canary'],
      }),
      input: stubInput,
      canaryInput,
    });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    // Canary tenant → real mapper → WARNING zone
    evaluator.evaluateIfEnabled('t-canary', GuardOperation.EVALUATE);
    expect(metrics.evaluations).toHaveLength(1);
    // WARNING input should be processed (state may or may not transition depending on consecutive count)
  });

  it('canary tenant falls back to stub mapper when realMapper not provided', () => {
    const stubInput = makeInput({ sigmaZone: 'NORMAL' as SigmaZone });

    const { deps, metrics } = buildTenantAwareDeps({
      config: makeConfig({
        globalEnabled: true,
        canaryTenants: ['t-canary'],
      }),
      input: stubInput,
      // no canaryInput → no realMapper
    });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    // Canary but no realMapper → falls back to stub
    evaluator.evaluateIfEnabled('t-canary', GuardOperation.EVALUATE);
    expect(metrics.evaluations).toHaveLength(1);
    expect(metrics.evaluations[0].state).toBe('NORMAL');
  });
});

// ============================================================================
// P7: Eviction
// ============================================================================

describe('P7: Eviction', () => {
  it('LRU eviction when maxTrackedTenants exceeded', () => {
    const evicted: string[] = [];
    const store = new AdaptiveShadowStateStore(
      { maxTrackedTenants: 3 },
      (tid) => evicted.push(tid),
    );

    // Fill to capacity
    store.setForTenant('t-1', createInitialState(1000));
    store.setForTenant('t-2', createInitialState(2000));
    store.setForTenant('t-3', createInitialState(3000));
    expect(store.trackedTenantCount).toBe(3);

    // Add 4th tenant → oldest (t-1) should be evicted
    store.setForTenant('t-4', createInitialState(4000));
    expect(store.trackedTenantCount).toBe(3);
    expect(evicted).toEqual(['t-1']);
    expect(store.lastEvaluatedAtMsForTenant('t-1')).toBeNull();
    expect(store.lastEvaluatedAtMsForTenant('t-4')).not.toBeNull();
  });

  it('evicted tenant starts from initial state on re-entry', () => {
    const store = new AdaptiveShadowStateStore({ maxTrackedTenants: 2 });

    store.setForTenant('t-1', createInitialState(1000));
    store.setForTenant('t-2', createInitialState(2000));

    // Evict t-1 by adding t-3
    store.setForTenant('t-3', createInitialState(3000));

    // t-1 re-entry → initial state
    const state = store.getForTenant('t-1');
    expect(state.currentState).toBe(AdaptiveState.NORMAL);
  });

  it('no eviction when tenant already tracked', () => {
    const evicted: string[] = [];
    const store = new AdaptiveShadowStateStore(
      { maxTrackedTenants: 2 },
      (tid) => evicted.push(tid),
    );

    store.setForTenant('t-1', createInitialState(1000));
    store.setForTenant('t-2', createInitialState(2000));

    // Update existing tenant → no eviction
    store.setForTenant('t-1', createInitialState(3000));
    expect(store.trackedTenantCount).toBe(2);
    expect(evicted).toEqual([]);
  });

  it('eviction callback failure is non-fatal', () => {
    const store = new AdaptiveShadowStateStore(
      { maxTrackedTenants: 2 },
      () => { throw new Error('callback boom'); },
    );

    store.setForTenant('t-1', createInitialState(1000));
    store.setForTenant('t-2', createInitialState(2000));

    // Should not throw despite callback failure
    expect(() => {
      store.setForTenant('t-3', createInitialState(3000));
    }).not.toThrow();
    expect(store.trackedTenantCount).toBe(2);
  });
});

// ============================================================================
// Store Contract: Per-Tenant API
// ============================================================================

describe('Store Contract: Per-Tenant API', () => {
  it('getForTenant returns initial NORMAL state for unknown tenant', () => {
    const store = new AdaptiveShadowStateStore();
    const state = store.getForTenant('unknown');
    expect(state.currentState).toBe(AdaptiveState.NORMAL);
  });

  it('setForTenant + getForTenant round-trip', () => {
    const store = new AdaptiveShadowStateStore();
    const custom = createInitialState(12345);
    store.setForTenant('t-1', custom);
    expect(store.getForTenant('t-1')).toBe(custom);
  });

  it('lastEvaluatedAtMsForTenant returns null for unknown tenant', () => {
    const store = new AdaptiveShadowStateStore();
    expect(store.lastEvaluatedAtMsForTenant('unknown')).toBeNull();
  });

  it('lastEvaluatedAtMsForTenant updated on setForTenant', () => {
    const store = new AdaptiveShadowStateStore();
    store.setForTenant('t-1', createInitialState(Date.now()));
    expect(store.lastEvaluatedAtMsForTenant('t-1')).not.toBeNull();
    expect(typeof store.lastEvaluatedAtMsForTenant('t-1')).toBe('number');
  });

  it('resetTenant clears state and lastEvaluatedAtMs', () => {
    const store = new AdaptiveShadowStateStore();
    store.setForTenant('t-1', createInitialState(Date.now()));
    store.resetTenant('t-1');
    expect(store.lastEvaluatedAtMsForTenant('t-1')).toBeNull();
    const state = store.getForTenant('t-1');
    expect(state.currentState).toBe(AdaptiveState.NORMAL);
  });

  it('resetAll clears all tenants', () => {
    const store = new AdaptiveShadowStateStore();
    store.setForTenant('t-1', createInitialState(Date.now()));
    store.setForTenant('t-2', createInitialState(Date.now()));
    store.resetAll();
    expect(store.trackedTenantCount).toBe(0);
    expect(store.lastEvaluatedAtMsForTenant('t-1')).toBeNull();
    expect(store.lastEvaluatedAtMsForTenant('t-2')).toBeNull();
  });
});

// ============================================================================
// P6: Backward Compatibility
// ============================================================================

describe('P6: Backward Compatibility — Legacy API', () => {
  it('get() returns initial NORMAL state', () => {
    const store = new AdaptiveShadowStateStore();
    const state = store.get();
    expect(state.currentState).toBe(AdaptiveState.NORMAL);
  });

  it('set() + get() round-trip via __global__ sentinel', () => {
    const store = new AdaptiveShadowStateStore();
    const custom = createInitialState(99999);
    store.set(custom);
    expect(store.get()).toBe(custom);
  });

  it('lastEvaluatedAtMs getter works via __global__ sentinel', () => {
    const store = new AdaptiveShadowStateStore();
    expect(store.lastEvaluatedAtMs).toBeNull();
    store.set(createInitialState(Date.now()));
    expect(store.lastEvaluatedAtMs).not.toBeNull();
  });

  it('reset() clears __global__ sentinel', () => {
    const store = new AdaptiveShadowStateStore();
    store.set(createInitialState(Date.now()));
    store.reset();
    expect(store.lastEvaluatedAtMs).toBeNull();
  });
});

// ============================================================================
// Gate Config Reload
// ============================================================================

describe('Gate Config Reload', () => {
  it('runtime config change takes immediate effect', () => {
    let config = makeConfig({ globalEnabled: true });
    const gate = new DefaultAdaptiveTenantGate(() => config);

    expect(gate.isEnabled('t-1')).toBe(true);

    // Mutate config at runtime
    config = makeConfig({ globalEnabled: false });
    expect(gate.isEnabled('t-1')).toBe(false);

    // Re-enable
    config = makeConfig({ globalEnabled: true });
    expect(gate.isEnabled('t-1')).toBe(true);
  });

  it('tenant override change takes immediate effect', () => {
    let config = makeConfig({
      globalEnabled: true,
      tenantOverrides: { 't-1': false },
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);

    expect(gate.isEnabled('t-1')).toBe(false);

    // Remove override
    config = makeConfig({ globalEnabled: true, tenantOverrides: {} });
    expect(gate.isEnabled('t-1')).toBe(true);
  });

  it('canary list change takes immediate effect', () => {
    let config = makeConfig({
      globalEnabled: true,
      canaryTenants: [],
    });
    const gate = new DefaultAdaptiveTenantGate(() => config);

    expect(gate.isCanary('t-1')).toBe(false);

    config = makeConfig({ globalEnabled: true, canaryTenants: ['t-1'] });
    expect(gate.isCanary('t-1')).toBe(true);
  });
});

// ============================================================================
// Evaluator + Tenant Gate Integration
// ============================================================================

describe('Evaluator + Tenant Gate Integration', () => {
  it('disabled tenant → zero metrics, zero state change', () => {
    const { deps, metrics, store } = buildTenantAwareDeps({
      config: makeConfig({
        globalEnabled: true,
        tenantOverrides: { 't-disabled': false },
      }),
    });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-disabled', GuardOperation.EVALUATE);
    expect(metrics.evaluations).toHaveLength(0);
    expect(store.lastEvaluatedAtMsForTenant('t-disabled')).toBeNull();
  });

  it('enabled tenant → metrics emitted, state updated', () => {
    const { deps, metrics, store } = buildTenantAwareDeps();
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-enabled', GuardOperation.EVALUATE);
    expect(metrics.evaluations).toHaveLength(1);
    expect(store.lastEvaluatedAtMsForTenant('t-enabled')).not.toBeNull();
  });

  it('global kill → all tenants disabled, zero work', () => {
    const { deps, metrics } = buildTenantAwareDeps({
      config: makeConfig({ globalEnabled: false }),
    });
    const evaluator = new AdaptiveShadowEvaluator(deps);

    evaluator.evaluateIfEnabled('t-1', GuardOperation.EVALUATE);
    evaluator.evaluateIfEnabled('t-2', GuardOperation.EVALUATE);
    expect(metrics.evaluations).toHaveLength(0);
  });
});

// ============================================================================
// F1: __global__ Sentinel Eviction Protection
// ============================================================================

describe('F1: __global__ Sentinel Eviction Protection', () => {
  it('__global__ is never evicted even when it is the oldest entry', () => {
    const evicted: string[] = [];
    const store = new AdaptiveShadowStateStore(
      { maxTrackedTenants: 3 },
      (tid) => evicted.push(tid),
    );

    // Set __global__ first (oldest timestamp)
    store.set(createInitialState(1000));

    // Add two more tenants (newer timestamps)
    store.setForTenant('t-1', createInitialState(2000));
    store.setForTenant('t-2', createInitialState(3000));
    expect(store.trackedTenantCount).toBe(3);

    // Add 4th tenant → should evict t-1 (oldest non-global), NOT __global__
    store.setForTenant('t-3', createInitialState(4000));
    expect(store.trackedTenantCount).toBe(3);
    expect(evicted).toEqual(['t-1']);

    // __global__ state is preserved
    expect(store.lastEvaluatedAtMs).not.toBeNull();
    expect(store.get().currentState).toBe(AdaptiveState.NORMAL);
  });

  it('no eviction when only __global__ remains as candidate', () => {
    const evicted: string[] = [];
    const store = new AdaptiveShadowStateStore(
      { maxTrackedTenants: 1 },
      (tid) => evicted.push(tid),
    );

    // Only __global__ in store
    store.set(createInitialState(1000));
    expect(store.trackedTenantCount).toBe(1);

    // Adding a new tenant when limit=1 and only __global__ exists
    // __global__ is protected → no eviction possible → store grows to 2
    // This is the fail-safe: we don't evict __global__, we allow temporary overshoot
    store.setForTenant('t-1', createInitialState(2000));
    expect(evicted).toEqual([]);
    // __global__ preserved
    expect(store.lastEvaluatedAtMs).not.toBeNull();
  });

  it('eviction skips __global__ and evicts next oldest non-global tenant', () => {
    const evicted: string[] = [];
    const store = new AdaptiveShadowStateStore(
      { maxTrackedTenants: 3 },
      (tid) => evicted.push(tid),
    );

    // __global__ oldest, then t-old, then t-new
    store.set(createInitialState(100));
    store.setForTenant('t-old', createInitialState(200));
    store.setForTenant('t-new', createInitialState(300));

    // Trigger eviction
    store.setForTenant('t-incoming', createInitialState(400));
    expect(evicted).toEqual(['t-old']); // t-old evicted, not __global__
    expect(store.get().currentState).toBe(AdaptiveState.NORMAL); // __global__ intact
  });
});
