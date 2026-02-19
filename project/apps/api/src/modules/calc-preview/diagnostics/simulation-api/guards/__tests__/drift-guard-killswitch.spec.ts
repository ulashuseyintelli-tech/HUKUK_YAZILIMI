/**
 * Drift Guard — Kill-switch Short-Circuit + Provider Failure + Disabled Mode
 *
 * SD-1 Drift Guard Wiring — Task 4.11, 4.9, 4.10
 *
 * Task 4.11: Kill-switch ON → drift subsystem completely invisible
 *   4-spy assertion: provider(0), evaluateDrift(0), metrics(0), telemetry(0 drift fields)
 *
 * Task 4.9: Provider failure → DRIFT_PROVIDER_ERROR semantics
 *   Shadow: proceed + no drift metric (provider error is not drift)
 *   Enforce: proceed + no drift metric (provider error caught, P2+ continues)
 *
 * Task 4.10: Disabled mode → pre-SD-1 identical behavior
 *   Provider NOT invoked, evaluateDrift NOT called, zero side effects
 *
 * @see .kiro/specs/sd-1-drift-guard-wiring/design.md — D2.2, FG-2
 */

import { lastValueFrom, of } from 'rxjs';
import { HttpException } from '@nestjs/common';
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
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';
import type { DriftInput } from '../drift-guard.types';
import * as driftGuardModule from '../drift-guard';

// ============================================================================
// Helpers
// ============================================================================

const NOW_MS = new Date('2026-02-16T12:00:00.000Z').getTime();

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

/** DriftInput that would trigger SCHEMA drift */
function driftingInput(): DriftInput {
  return {
    tenantId: 't1',
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

function mockContext(headers: Record<string, string> = {}): any {
  const request: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    _request: request,
  };
}

function mockNext() {
  return { handle: jest.fn(() => of('pipeline-result')) };
}

/** Spy-able drift input provider */
function createSpyProvider(input: DriftInput): DriftInputProvider & { spy: jest.Mock } {
  const spy = jest.fn().mockReturnValue(input);
  return {
    getDriftInput: spy,
    spy,
  };
}

/** Throwing drift input provider */
function createThrowingProvider(): DriftInputProvider & { spy: jest.Mock } {
  const spy = jest.fn().mockImplementation(() => {
    throw new Error('Provider failure — simulated');
  });
  return {
    getDriftInput: spy,
    spy,
  };
}

/** Spy drift metric emitter */
function createSpyMetrics(): DriftMetricEmitter & { spy: jest.Mock; providerErrorSpy: jest.Mock } {
  const spy = jest.fn();
  const providerErrorSpy = jest.fn();
  return {
    incSimulationDrift: spy,
    incDriftProviderError: providerErrorSpy,
    spy,
    providerErrorSpy,
  };
}

function buildFullStack(
  config: GuardConfig,
  driftProvider?: DriftInputProvider,
) {
  const clock = new FixedClock(NOW_MS);
  const configProvider = new StaticGuardConfigProvider(config);
  const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
  signals.addSamples('t1', ALL_FRESH);
  const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock, driftProvider);
  const telemetry = new InMemoryGuardTelemetry();
  const metrics = createSpyMetrics();
  const interceptor = new GuardInterceptor(
    factory,
    new DefaultOperationResolver(),
    new DefaultTenantResolver(),
    telemetry,
    metrics,
  );
  return { interceptor, factory, telemetry, metrics };
}

// ============================================================================
// Task 4.11: Kill-switch ON → drift subsystem completely invisible
// ============================================================================

describe('Task 4.11: Kill-switch ON → drift subsystem invisible', () => {
  let evaluateDriftSpy: jest.SpyInstance;

  beforeEach(() => {
    evaluateDriftSpy = jest.spyOn(driftGuardModule, 'evaluateDrift');
  });

  afterEach(() => {
    evaluateDriftSpy.mockRestore();
  });

  it('shadow + kill-switch ON: 4-spy all zero (provider, evaluateDrift, metrics, telemetry-drift)', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { killSwitchActive: true, driftGuardEnabled: true } },
    };
    const provider = createSpyProvider(driftingInput());
    const { interceptor, telemetry, metrics } = buildFullStack(config, provider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    // 1. Provider NOT called (kill-switch short-circuits in factory)
    expect(provider.spy).not.toHaveBeenCalled();

    // 2. evaluateDrift NOT called (no driftInput passed to resolver)
    expect(evaluateDriftSpy).not.toHaveBeenCalled();

    // 3. Drift metric NOT incremented (no DRIFT:* in reasonCodes)
    expect(metrics.spy).not.toHaveBeenCalled();

    // 4. Telemetry emitted but NO drift fields (KILL_SWITCH_ACTIVE only)
    expect(telemetry.events).toHaveLength(1);
    const event = telemetry.events[0]!;
    expect(event.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
    expect(event.reasonCodes.some((r) => r.startsWith('DRIFT:'))).toBe(false);
  });

  it('enforce + kill-switch ON: 4-spy all zero', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { killSwitchActive: true, driftGuardEnabled: true } },
    };
    const provider = createSpyProvider(driftingInput());
    const { interceptor, metrics } = buildFullStack(config, provider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    // Enforce + kill-switch → 503 throw
    try {
      interceptor.intercept(ctx, mockNext());
    } catch {
      // expected
    }

    expect(provider.spy).not.toHaveBeenCalled();
    expect(evaluateDriftSpy).not.toHaveBeenCalled();
    expect(metrics.spy).not.toHaveBeenCalled();
  });

  it('kill-switch ON + provider would throw → provider NOT called (no latent exception)', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { killSwitchActive: true, driftGuardEnabled: true } },
    };
    const throwingProvider = createThrowingProvider();
    const { interceptor } = buildFullStack(config, throwingProvider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    // Should NOT throw — provider is never called
    await expect(
      lastValueFrom(interceptor.intercept(ctx, mockNext())),
    ).resolves.toBe('pipeline-result');

    expect(throwingProvider.spy).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Task 4.9: Provider failure semantics
// ============================================================================

describe('Task 4.9: Provider failure → DRIFT_PROVIDER_ERROR (fail-closed)', () => {
  it('shadow + provider throws → pipeline proceeds (next.handle called)', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const throwingProvider = createThrowingProvider();
    const { interceptor, metrics } = buildFullStack(config, throwingProvider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();
    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    // Shadow + provider error → proceed (shadow downgrade)
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toBe('pipeline-result');

    // Provider was called once
    expect(throwingProvider.spy).toHaveBeenCalledTimes(1);

    // reasonCodes includes DRIFT_PROVIDER_ERROR
    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision).toBeDefined();
    expect(req.guardDecision.reasonCodes).toContain('DRIFT_PROVIDER_ERROR');
    expect(req.guardDecision.mode).toBe('DRIFT_BLOCKED');

    // Drift metric NOT incremented (provider error is not drift — DRIFT_PROVIDER_ERROR doesn't start with 'DRIFT:')
    expect(metrics.spy).not.toHaveBeenCalled();

    // Provider error metric IS incremented
    expect(metrics.providerErrorSpy).toHaveBeenCalledTimes(1);
    expect(metrics.providerErrorSpy).toHaveBeenCalledWith(GuardOperation.PROMOTE, 'shadow');
  });

  it('enforce + provider throws → 503 block (next.handle NOT called)', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const throwingProvider = createThrowingProvider();
    const { interceptor, metrics } = buildFullStack(config, throwingProvider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();

    // Enforce + provider error → 503 block
    expect(() => interceptor.intercept(ctx, next)).toThrow(HttpException);
    expect(next.handle).not.toHaveBeenCalled();

    // Provider was called once
    expect(throwingProvider.spy).toHaveBeenCalledTimes(1);

    // Drift metric NOT incremented
    expect(metrics.spy).not.toHaveBeenCalled();

    // Provider error metric IS incremented
    expect(metrics.providerErrorSpy).toHaveBeenCalledTimes(1);
    expect(metrics.providerErrorSpy).toHaveBeenCalledWith(GuardOperation.PROMOTE, 'enforce');
  });

  it('provider throws + request.guardDecision already set → no double emit', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const throwingProvider = createThrowingProvider();
    const { interceptor, telemetry } = buildFullStack(config, throwingProvider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();
    await lastValueFrom(interceptor.intercept(ctx, next));

    // Telemetry emitted exactly once
    expect(telemetry.events).toHaveLength(1);
    expect(telemetry.events[0]!.reasonCodes).toContain('DRIFT_PROVIDER_ERROR');
  });
});

// ============================================================================
// Task 4.10: Disabled mode → pre-SD-1 identical behavior
// ============================================================================

describe('Task 4.10: Disabled mode → zero drift compute (e2e)', () => {
  let evaluateDriftSpy: jest.SpyInstance;

  beforeEach(() => {
    evaluateDriftSpy = jest.spyOn(driftGuardModule, 'evaluateDrift');
  });

  afterEach(() => {
    evaluateDriftSpy.mockRestore();
  });

  it('disabled + driftGuardEnabled=true + provider registered: 4-spy all zero', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'disabled',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const provider = createSpyProvider(driftingInput());
    const { interceptor, telemetry, metrics } = buildFullStack(config, provider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();
    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    // Disabled → bypass entirely
    expect(result).toBe('pipeline-result');
    expect(next.handle).toHaveBeenCalledTimes(1);

    // 4-spy all zero
    expect(provider.spy).not.toHaveBeenCalled();
    expect(evaluateDriftSpy).not.toHaveBeenCalled();
    expect(metrics.spy).not.toHaveBeenCalled();
    expect(telemetry.events).toHaveLength(0); // disabled → no telemetry at all
  });

  it('disabled + driftGuardEnabled=true + throwing provider: provider NOT called (no latent exception)', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'disabled',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const throwingProvider = createThrowingProvider();
    const { interceptor } = buildFullStack(config, throwingProvider);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await expect(
      lastValueFrom(interceptor.intercept(ctx, mockNext())),
    ).resolves.toBe('pipeline-result');

    expect(throwingProvider.spy).not.toHaveBeenCalled();
  });

  it('disabled + driftGuardEnabled=false: no guardDecision on request', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'disabled',
    };
    const stack = buildFullStack(config);

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(stack.interceptor.intercept(ctx, mockNext()));

    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision).toBeUndefined();
  });
});
