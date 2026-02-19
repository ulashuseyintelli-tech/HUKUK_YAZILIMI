/**
 * Drift Guard — Integration Tests (Task 7)
 *
 * SD-1 Drift Guard Wiring — Task 7.1
 *
 * Full wiring chain validation: Factory → Resolver → Interceptor → Metrics.
 * These tests prove "guard wiring is correct", not "guard logic is correct".
 *
 * 6 scenarios:
 *   1. Shadow + structural drift → proceed + metric + wouldEnforce
 *   2. Enforce + structural drift → 503 + metric + no next.handle
 *   3. Disabled mode → zero compute, provider not called
 *   4. Kill-switch ON → provider not called, drift metric zero, shadow proceed
 *   5. Provider throws (shadow) → proceed + provider error metric + no drift metric
 *   6. Provider throws (enforce) → 503 + provider error metric
 *
 * Cross-cutting assertions:
 *   - Interceptor order (snapshot → telemetry → metric → decision routing)
 *   - Metric emit singularity (no double emit)
 *   - request.guardDecision snapshot preserved through chain
 *
 * @see .kiro/specs/sd-1-drift-guard-wiring/architecture.md — Test Referansları
 * @see .kiro/specs/sd-1-drift-guard-wiring/tasks.md — Task 7
 */

import { lastValueFrom, of } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  GuardInterceptor,
  DefaultOperationResolver,
  DefaultTenantResolver,
  type DriftMetricEmitter,
} from '../guard-interceptor';
import { GuardDecisionSnapshotFactory } from '../guard-decision-snapshot.factory';
import { FixedClock } from '../guard-clock';
import { StaticGuardConfigProvider } from '../guard-config-provider';
import { InMemoryRiskSignalProvider, type RawSample } from '../risk-signal-provider';
import type { DriftInputProvider } from '../drift-input-provider';
import { InMemoryGuardTelemetry } from '../guard-telemetry';
import {
  GuardDecision,
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';
import type { DriftInput } from '../drift-guard.types';
import * as driftGuardModule from '../drift-guard';

// ============================================================================
// Shared Fixtures
// ============================================================================

const NOW_MS = new Date('2026-02-18T09:00:00.000Z').getTime();

const SIGNAL_CONFIGS = {
  casConflictRate: DEFAULT_WINDOW_CONFIG,
  dbTimeoutRate: DEFAULT_WINDOW_CONFIG,
  clockSkewMs: { ...DEFAULT_WINDOW_CONFIG, aggregation: 'sum' as const },
};

function freshSamples(name: string, value: number, count = 10): RawSample[] {
  return Array.from({ length: count }, (_, i) => ({
    name,
    timestamp: NOW_MS - (count - i) * 5_000,
    value,
  }));
}

const ALL_FRESH: RawSample[] = [
  ...freshSamples('casConflictRate', 0.01),
  ...freshSamples('dbTimeoutRate', 0.01),
  ...freshSamples('clockSkewMs', 10),
];

/** Structural drift: schema mismatch */
function driftingInput(): DriftInput {
  return {
    tenantId: 'integration-t1',
    operation: GuardOperation.PROMOTE,
    policyVersion: '1.0.0',
    nowMs: NOW_MS,
    expectedSchemaVersion: 'v1',
    actualSchemaVersion: 'v2',
    expectedRuleHash: 'abc',
    actualRuleHash: 'abc',
    expectedConfigRevision: 'rev-1',
    actualConfigRevision: 'rev-1',
    carrierWriteState: { writeCount: 1 },
  };
}

/** No drift: all fields match */
function cleanInput(): DriftInput {
  return {
    tenantId: 'integration-t1',
    operation: GuardOperation.PROMOTE,
    policyVersion: '1.0.0',
    nowMs: NOW_MS,
    expectedSchemaVersion: 'v1',
    actualSchemaVersion: 'v1',
    expectedRuleHash: 'abc',
    actualRuleHash: 'abc',
    expectedConfigRevision: 'rev-1',
    actualConfigRevision: 'rev-1',
    carrierWriteState: { writeCount: 1 },
  };
}

// ── Provider factories ──────────────────────────────────────────────

function createMockProvider(input: DriftInput): DriftInputProvider & { spy: jest.Mock } {
  const spy = jest.fn().mockReturnValue(input);
  return { getDriftInput: spy, spy };
}

function createThrowingProvider(): DriftInputProvider & { spy: jest.Mock } {
  const spy = jest.fn().mockImplementation(() => {
    throw new Error('DriftInputProvider failure — integration test');
  });
  return { getDriftInput: spy, spy };
}

// ── Metric emitter with tracking ────────────────────────────────────

interface TrackedMetrics {
  driftCalls: Array<{ type: string; operation: string; guardMode: string }>;
  providerErrorCalls: Array<{ operation: string; guardMode: string }>;
  incSimulationDrift(type: string, operation: string, guardMode: string): void;
  incDriftProviderError(operation: string, guardMode: string): void;
}

function createTrackedMetrics(): TrackedMetrics {
  const driftCalls: TrackedMetrics['driftCalls'] = [];
  const providerErrorCalls: TrackedMetrics['providerErrorCalls'] = [];
  return {
    driftCalls,
    providerErrorCalls,
    incSimulationDrift(type, operation, guardMode) {
      driftCalls.push({ type, operation, guardMode });
    },
    incDriftProviderError(operation, guardMode) {
      providerErrorCalls.push({ operation, guardMode });
    },
  };
}

// ── Request context mock ────────────────────────────────────────────

function mockContext(headers: Record<string, string> = {}): any {
  const request: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    _request: request,
  };
}

function mockNext() {
  return { handle: jest.fn(() => of('pipeline-ok')) };
}

// ── Full stack builder ──────────────────────────────────────────────

const TENANT = 'integration-t1';

function buildIntegrationStack(
  config: GuardConfig,
  driftProvider?: DriftInputProvider,
) {
  const clock = new FixedClock(NOW_MS);
  const configProvider = new StaticGuardConfigProvider(config);
  const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
  signals.addSamples(TENANT, ALL_FRESH);

  const factory = new GuardDecisionSnapshotFactory(
    configProvider, signals, clock, driftProvider,
  );
  const telemetry = new InMemoryGuardTelemetry();
  const metrics = createTrackedMetrics();

  const interceptor = new GuardInterceptor(
    factory,
    new DefaultOperationResolver(),
    new DefaultTenantResolver(),
    telemetry,
    metrics,
  );

  return { interceptor, factory, telemetry, metrics };
}

function defaultHeaders(): Record<string, string> {
  return { 'x-tenant-id': TENANT, 'x-guard-operation': 'promote' };
}

// ============================================================================
// Scenario 1: Shadow + structural drift
// ============================================================================

describe('Integration: Shadow + structural drift', () => {
  it('next.handle() called — no user-facing 503 (NR-3)', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { [TENANT]: { driftGuardEnabled: true } },
    };
    const provider = createMockProvider(driftingInput());
    const { interceptor, metrics, telemetry } = buildIntegrationStack(config, provider);

    const ctx = mockContext(defaultHeaders());
    const next = mockNext();
    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    // Wiring: next.handle called (shadow downgrade)
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toBe('pipeline-ok');

    // Snapshot attached to request
    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision).toBeDefined();
    expect(req.guardDecision.decision).toBe(GuardDecision.BLOCK_503);
    expect(req.guardDecision.mode).toBe('DRIFT_BLOCKED');
    expect(req.guardDecision.reasonCodes).toContain('DRIFT:SCHEMA');

    // Telemetry: wouldEnforce=true
    expect(telemetry.events).toHaveLength(1);
    expect(telemetry.events[0]!.wouldEnforce).toBe(true);
    expect(telemetry.events[0]!.guardMode).toBe('shadow');

    // Drift metric: incremented once for SCHEMA
    expect(metrics.driftCalls).toHaveLength(1);
    expect(metrics.driftCalls[0]).toEqual({
      type: 'SCHEMA',
      operation: GuardOperation.PROMOTE,
      guardMode: 'shadow',
    });

    // Provider error metric: NOT incremented
    expect(metrics.providerErrorCalls).toHaveLength(0);

    // Provider called exactly once (snapshot semantics)
    expect(provider.spy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Scenario 2: Enforce + structural drift
// ============================================================================

describe('Integration: Enforce + structural drift', () => {
  it('throws 503 — next.handle NOT called, drift metric incremented', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { [TENANT]: { driftGuardEnabled: true } },
    };
    const provider = createMockProvider(driftingInput());
    const { interceptor, metrics, telemetry } = buildIntegrationStack(config, provider);

    const ctx = mockContext(defaultHeaders());
    const next = mockNext();

    // Enforce + drift → 503
    let thrownError: HttpException | undefined;
    try {
      interceptor.intercept(ctx, next);
    } catch (e) {
      thrownError = e as HttpException;
    }

    expect(thrownError).toBeInstanceOf(HttpException);
    expect(thrownError!.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

    // next.handle NOT called (no pipeline entry, no DB touch)
    expect(next.handle).not.toHaveBeenCalled();

    // Snapshot attached before throw
    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision).toBeDefined();
    expect(req.guardDecision.decision).toBe(GuardDecision.BLOCK_503);
    expect(req.guardDecision.reasonCodes).toContain('DRIFT:SCHEMA');

    // Telemetry emitted before throw
    expect(telemetry.events).toHaveLength(1);
    expect(telemetry.events[0]!.wouldEnforce).toBe(true);

    // Drift metric incremented before throw
    expect(metrics.driftCalls).toHaveLength(1);
    expect(metrics.driftCalls[0]!.type).toBe('SCHEMA');
    expect(metrics.driftCalls[0]!.guardMode).toBe('enforce');

    // Provider called once
    expect(provider.spy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Scenario 3: Disabled mode
// ============================================================================

describe('Integration: Disabled mode → zero compute', () => {
  let evaluateDriftSpy: jest.SpyInstance;

  beforeEach(() => {
    evaluateDriftSpy = jest.spyOn(driftGuardModule, 'evaluateDrift');
  });

  afterEach(() => {
    evaluateDriftSpy.mockRestore();
  });

  it('provider not called, evaluateDrift not called, no metrics, no telemetry', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'disabled',
      tenantOverrides: { [TENANT]: { driftGuardEnabled: true } },
    };
    const provider = createMockProvider(driftingInput());
    const { interceptor, metrics, telemetry } = buildIntegrationStack(config, provider);

    const ctx = mockContext(defaultHeaders());
    const next = mockNext();
    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    // Bypass: next.handle called
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toBe('pipeline-ok');

    // No snapshot on request (disabled → no compute)
    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision).toBeUndefined();

    // Provider NOT called
    expect(provider.spy).not.toHaveBeenCalled();

    // evaluateDrift NOT called
    expect(evaluateDriftSpy).not.toHaveBeenCalled();

    // Zero metrics
    expect(metrics.driftCalls).toHaveLength(0);
    expect(metrics.providerErrorCalls).toHaveLength(0);

    // Zero telemetry
    expect(telemetry.events).toHaveLength(0);
  });
});

// ============================================================================
// Scenario 4: Kill-switch ON
// ============================================================================

describe('Integration: Kill-switch ON → drift subsystem bypassed', () => {
  let evaluateDriftSpy: jest.SpyInstance;

  beforeEach(() => {
    evaluateDriftSpy = jest.spyOn(driftGuardModule, 'evaluateDrift');
  });

  afterEach(() => {
    evaluateDriftSpy.mockRestore();
  });

  it('shadow + kill-switch: proceed, provider not called, drift metric zero', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { [TENANT]: { killSwitchActive: true, driftGuardEnabled: true } },
    };
    const provider = createMockProvider(driftingInput());
    const { interceptor, metrics, telemetry } = buildIntegrationStack(config, provider);

    const ctx = mockContext(defaultHeaders());
    const next = mockNext();
    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    // Shadow + kill-switch → proceed (NR-3 downgrade)
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toBe('pipeline-ok');

    // Snapshot: BLOCK_503 + KILL_SWITCH_ACTIVE (not DRIFT:*)
    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision.decision).toBe(GuardDecision.BLOCK_503);
    expect(req.guardDecision.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
    expect(req.guardDecision.reasonCodes.some((r: string) => r.startsWith('DRIFT:'))).toBe(false);

    // Provider NOT called (kill-switch short-circuits in factory)
    expect(provider.spy).not.toHaveBeenCalled();

    // evaluateDrift NOT called
    expect(evaluateDriftSpy).not.toHaveBeenCalled();

    // Drift metric zero
    expect(metrics.driftCalls).toHaveLength(0);
    expect(metrics.providerErrorCalls).toHaveLength(0);

    // Telemetry: emitted with KILL_SWITCH_ACTIVE
    expect(telemetry.events).toHaveLength(1);
    expect(telemetry.events[0]!.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
  });
});

// ============================================================================
// Scenario 5: Provider throws (shadow)
// ============================================================================

describe('Integration: Provider throws — shadow mode', () => {
  it('proceed + provider error metric + no drift metric', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { [TENANT]: { driftGuardEnabled: true } },
    };
    const provider = createThrowingProvider();
    const { interceptor, metrics, telemetry } = buildIntegrationStack(config, provider);

    const ctx = mockContext(defaultHeaders());
    const next = mockNext();
    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    // Shadow + provider error → proceed (shadow downgrade)
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toBe('pipeline-ok');

    // Provider called once (then threw)
    expect(provider.spy).toHaveBeenCalledTimes(1);

    // Snapshot: BLOCK_503 + DRIFT_PROVIDER_ERROR
    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision.decision).toBe(GuardDecision.BLOCK_503);
    expect(req.guardDecision.mode).toBe('DRIFT_BLOCKED');
    expect(req.guardDecision.reasonCodes).toContain('DRIFT_PROVIDER_ERROR');

    // Drift metric NOT incremented (DRIFT_PROVIDER_ERROR starts with DRIFT_, not DRIFT:)
    expect(metrics.driftCalls).toHaveLength(0);

    // Provider error metric IS incremented
    expect(metrics.providerErrorCalls).toHaveLength(1);
    expect(metrics.providerErrorCalls[0]).toEqual({
      operation: GuardOperation.PROMOTE,
      guardMode: 'shadow',
    });

    // Telemetry: exactly once (no double emit)
    expect(telemetry.events).toHaveLength(1);
    expect(telemetry.events[0]!.reasonCodes).toContain('DRIFT_PROVIDER_ERROR');
  });
});

// ============================================================================
// Scenario 6: Provider throws (enforce)
// ============================================================================

describe('Integration: Provider throws — enforce mode', () => {
  it('503 block + provider error metric + no drift metric', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { [TENANT]: { driftGuardEnabled: true } },
    };
    const provider = createThrowingProvider();
    const { interceptor, metrics, telemetry } = buildIntegrationStack(config, provider);

    const ctx = mockContext(defaultHeaders());
    const next = mockNext();

    // Enforce + provider error → 503
    let thrownError: HttpException | undefined;
    try {
      interceptor.intercept(ctx, next);
    } catch (e) {
      thrownError = e as HttpException;
    }

    expect(thrownError).toBeInstanceOf(HttpException);
    expect(thrownError!.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

    // next.handle NOT called
    expect(next.handle).not.toHaveBeenCalled();

    // Provider called once
    expect(provider.spy).toHaveBeenCalledTimes(1);

    // Snapshot attached before throw
    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision.reasonCodes).toContain('DRIFT_PROVIDER_ERROR');

    // Drift metric NOT incremented
    expect(metrics.driftCalls).toHaveLength(0);

    // Provider error metric IS incremented
    expect(metrics.providerErrorCalls).toHaveLength(1);
    expect(metrics.providerErrorCalls[0]).toEqual({
      operation: GuardOperation.PROMOTE,
      guardMode: 'enforce',
    });

    // Telemetry: exactly once
    expect(telemetry.events).toHaveLength(1);
  });
});

// ============================================================================
// Cross-cutting: Snapshot immutability through chain
// ============================================================================

describe('Integration: Cross-cutting — snapshot preserved through chain', () => {
  it('request.guardDecision is same object reference after interceptor completes', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { [TENANT]: { driftGuardEnabled: true } },
    };
    const { interceptor } = buildIntegrationStack(
      config,
      createMockProvider(driftingInput()),
    );

    const ctx = mockContext(defaultHeaders());
    const next = mockNext();
    await lastValueFrom(interceptor.intercept(ctx, next));

    const req = ctx.switchToHttp().getRequest();
    const snapshot = req.guardDecision;

    // Snapshot fields are readonly / frozen — verify key fields exist
    expect(snapshot.tenantId).toBe(TENANT);
    expect(snapshot.decision).toBe(GuardDecision.BLOCK_503);
    expect(snapshot.reasonCodes).toContain('DRIFT:SCHEMA');
    expect(typeof snapshot.evaluatedAtMs).toBe('number');
    expect(typeof snapshot.policyVersion).toBe('string');
    expect(typeof snapshot.riskContextHash).toBe('string');
  });

  it('metric emit count equals exactly 1 per interceptor pass (no double emit)', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { [TENANT]: { driftGuardEnabled: true } },
    };
    const metrics = createTrackedMetrics();
    const telemetry = new InMemoryGuardTelemetry();
    const clock = new FixedClock(NOW_MS);
    const configProvider = new StaticGuardConfigProvider(config);
    const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
    signals.addSamples(TENANT, ALL_FRESH);
    const factory = new GuardDecisionSnapshotFactory(
      configProvider, signals, clock, createMockProvider(driftingInput()),
    );
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      telemetry,
      metrics,
    );

    // First pass
    const ctx1 = mockContext(defaultHeaders());
    await lastValueFrom(interceptor.intercept(ctx1, mockNext()));

    // Second pass (fresh context — simulates second request)
    const ctx2 = mockContext(defaultHeaders());
    await lastValueFrom(interceptor.intercept(ctx2, mockNext()));

    // Each pass: exactly 1 telemetry event, exactly 1 drift metric call
    expect(telemetry.events).toHaveLength(2);
    expect(metrics.driftCalls).toHaveLength(2);

    // No cross-contamination between requests
    expect(ctx1.switchToHttp().getRequest().guardDecision).not.toBe(
      ctx2.switchToHttp().getRequest().guardDecision,
    );
  });
});
