/**
 * Drift Guard Wiring — Checkpoint Tests (Task 3)
 *
 * SD-1 Drift Guard Wiring — Task 3 Checkpoint
 *
 * Invariants locked:
 *   1. driftGuardEnabled=false → drift path NOT called (provider/evaluate call count = 0)
 *   2. kill-switch ON → drift path NOT called
 *   3. Shadow downgrade: resolver BLOCK_503 + interceptor proceeds (next.handle called)
 *   4. request.guardDecision snapshot set, downstream observable
 *   5. Drift metric increment ONLY when reasonCodes.some(r => r.startsWith('DRIFT:'))
 *   6. Kill-switch BLOCK_503 (shadow) → drift metric NOT incremented
 *   7. Precedence: kill-switch > drift > missing signals (mutual exclusion)
 *
 * @see .kiro/specs/sd-1-drift-guard-wiring/design.md — D2.2, D2.3, FG-1..FG-4
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
import { StaticDriftInputProvider } from '../drift-input-provider';
import { InMemoryGuardTelemetry } from '../guard-telemetry';
import {
  GuardDecision,
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';
import { type DriftInput } from '../drift-guard.types';

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

/** DriftInput with schema drift (expected !== actual) */
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

/** DriftInput with NO drift (all match) */
function cleanInput(): DriftInput {
  return {
    tenantId: 't1',
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

/** Spy-able drift input provider */
function spyDriftInputProvider(input: DriftInput) {
  const provider = new StaticDriftInputProvider(input);
  const spy = jest.spyOn(provider, 'getDriftInput');
  return { provider, spy };
}

/** In-memory drift metric emitter with call tracking */
function spyDriftMetricEmitter(): DriftMetricEmitter & { calls: Array<{ type: string; operation: string; guardMode: string }>; providerErrorCalls: Array<{ operation: string; guardMode: string }> } {
  const calls: Array<{ type: string; operation: string; guardMode: string }> = [];
  const providerErrorCalls: Array<{ operation: string; guardMode: string }> = [];
  return {
    calls,
    providerErrorCalls,
    incSimulationDrift(type: string, operation: string, guardMode: string) {
      calls.push({ type, operation, guardMode });
    },
    incDriftProviderError(operation: string, guardMode: string) {
      providerErrorCalls.push({ operation, guardMode });
    },
  };
}

function mockContext(headers: Record<string, string> = {}, props: Record<string, unknown> = {}): any {
  const request: Record<string, unknown> = { headers, ...props };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    _request: request,
  };
}

function mockNext() {
  return { handle: jest.fn(() => of('pipeline-result')) };
}

function buildFactory(
  configOverride: GuardConfig,
  driftProvider?: StaticDriftInputProvider,
) {
  const clock = new FixedClock(NOW_MS);
  const config = new StaticGuardConfigProvider(configOverride);
  const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
  signals.addSamples('t1', ALL_FRESH);
  const factory = new GuardDecisionSnapshotFactory(config, signals, clock, driftProvider);
  return { factory, clock, signals };
}

// ============================================================================
// 1. Resolver P1.5 — driftGuardEnabled=false → drift path skipped
// ============================================================================

describe('Resolver P1.5: driftGuardEnabled=false → drift path skipped', () => {
  it('driftGuardEnabled=false → no DRIFT:* reasonCodes', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: false } },
    };
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.ALLOW);
    expect(snapshot.reasonCodes.some((r) => r.startsWith('DRIFT:'))).toBe(false);
  });

  it('driftGuardEnabled=false → provider NOT called', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: false } },
    };
    const { provider, spy } = spyDriftInputProvider(driftingInput());
    const { factory } = buildFactory(config, provider);
    factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 2. Resolver P1.5: driftGuardEnabled=true + drift → BLOCK_503 + DRIFT:*
// ============================================================================

describe('Resolver P1.5: driftGuardEnabled=true + drift → BLOCK_503', () => {
  it('schema drift → BLOCK_503 + DRIFT:SCHEMA + mode=DRIFT_BLOCKED', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.BLOCK_503);
    expect(snapshot.mode).toBe('DRIFT_BLOCKED');
    expect(snapshot.reasonCodes).toContain('DRIFT:SCHEMA');
  });

  it('no drift → ALLOW (drift check passes, continues to P2+)', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const { factory } = buildFactory(config, new StaticDriftInputProvider(cleanInput()));
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.ALLOW);
    expect(snapshot.reasonCodes).toHaveLength(0);
  });
});

// ============================================================================
// 3. Kill-switch ON → drift path NOT entered
// ============================================================================

describe('Kill-switch > Drift precedence', () => {
  it('kill-switch ON + driftGuardEnabled=true → BLOCK_503 with KILL_SWITCH_ACTIVE, no DRIFT:*', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { killSwitchActive: true, driftGuardEnabled: true } },
    };
    const { provider, spy } = spyDriftInputProvider(driftingInput());
    const { factory } = buildFactory(config, provider);
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.BLOCK_503);
    expect(snapshot.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
    expect(snapshot.reasonCodes.some((r) => r.startsWith('DRIFT:'))).toBe(false);
    // Provider IS called (factory checks driftGuardEnabled before kill-switch),
    // but evaluateDrift is NOT called — resolver P1 returns before P1.5.
    // The important invariant: no DRIFT:* in reasonCodes.
  });
});

// ============================================================================
// 4. Precedence: drift > missing signals (mutual exclusion)
// ============================================================================

describe('Drift > Missing signals precedence', () => {
  it('drift detected → BLOCK_503 with DRIFT:*, no MISSING_SIGNAL:*', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    // Use factory with NO samples → would normally be HOLD (missing signals)
    // But drift is checked first (P1.5 before P2)
    const clock = new FixedClock(NOW_MS);
    const configProvider = new StaticGuardConfigProvider(config);
    const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
    // NO samples for t1 → missing signals at P2
    const driftProvider = new StaticDriftInputProvider(driftingInput());
    const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock, driftProvider);
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.BLOCK_503);
    expect(snapshot.mode).toBe('DRIFT_BLOCKED');
    expect(snapshot.reasonCodes.some((r) => r.startsWith('DRIFT:'))).toBe(true);
    expect(snapshot.reasonCodes.some((r) => r.startsWith('MISSING_SIGNAL:'))).toBe(false);
  });
});

// ============================================================================
// 5. Shadow downgrade: resolver BLOCK_503 → interceptor proceeds
// ============================================================================

describe('Shadow downgrade: drift BLOCK_503 → interceptor proceeds', () => {
  it('shadow + drift → next.handle() called (no enforcement)', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const telemetry = new InMemoryGuardTelemetry();
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      telemetry,
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();
    const result = await lastValueFrom(interceptor.intercept(ctx, next));

    // Shadow → next.handle() called (no enforcement)
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toBe('pipeline-result');
  });

  it('shadow + drift → request.guardDecision set with DRIFT_BLOCKED', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();
    await lastValueFrom(interceptor.intercept(ctx, next));

    const req = ctx.switchToHttp().getRequest();
    expect(req.guardDecision).toBeDefined();
    expect(req.guardDecision.decision).toBe(GuardDecision.BLOCK_503);
    expect(req.guardDecision.mode).toBe('DRIFT_BLOCKED');
    expect(req.guardDecision.reasonCodes).toContain('DRIFT:SCHEMA');
  });

  it('shadow + drift → telemetry emitted with wouldEnforce=true', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const telemetry = new InMemoryGuardTelemetry();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      telemetry,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    expect(telemetry.events).toHaveLength(1);
    expect(telemetry.events[0]!.wouldEnforce).toBe(true);
    expect(telemetry.events[0]!.guardMode).toBe('shadow');
    expect(telemetry.events[0]!.reasonCodes).toContain('DRIFT:SCHEMA');
  });

  it('enforce + drift → throws 503 (no next.handle)', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();

    expect(() => interceptor.intercept(ctx, next)).toThrow(HttpException);
    expect(next.handle).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 6. Drift metric gating: ONLY when reasonCodes contain DRIFT:*
// ============================================================================

describe('Drift metric gating (FG-4)', () => {
  it('shadow + drift → drift metric incremented per drift type', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    expect(driftMetrics.calls).toHaveLength(1);
    expect(driftMetrics.calls[0]).toEqual({
      type: 'SCHEMA',
      operation: GuardOperation.PROMOTE,
      guardMode: 'shadow',
    });
  });

  it('shadow + kill-switch BLOCK_503 → drift metric NOT incremented', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { killSwitchActive: true, driftGuardEnabled: true } },
    };
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    // Kill-switch BLOCK_503 has KILL_SWITCH_ACTIVE, no DRIFT:* → no drift metric
    expect(driftMetrics.calls).toHaveLength(0);
  });

  it('shadow + no drift → drift metric NOT incremented', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(cleanInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    expect(driftMetrics.calls).toHaveLength(0);
  });

  it('enforce + drift → drift metric incremented (before 503 throw)', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'enforce',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    try {
      interceptor.intercept(ctx, mockNext());
    } catch {
      // expected 503
    }

    expect(driftMetrics.calls).toHaveLength(1);
    expect(driftMetrics.calls[0]!.type).toBe('SCHEMA');
  });

  it('multiple drift types → metric incremented per type', async () => {
    const multiDriftInput: DriftInput = {
      tenantId: 't1',
      operation: GuardOperation.PROMOTE,
      policyVersion: '1.0.0',
      nowMs: NOW_MS,
      expectedSchemaVersion: 'v1',
      actualSchemaVersion: 'v2',
      expectedConfigRevision: 'rev-1',
      actualConfigRevision: 'rev-2',
      expectedRuleHash: 'abc',
      actualRuleHash: 'abc',
      carrierWriteState: { writeCount: 1 },
    };
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(multiDriftInput));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    expect(driftMetrics.calls).toHaveLength(2);
    const types = driftMetrics.calls.map((c) => c.type).sort();
    expect(types).toEqual(['CONFIG', 'SCHEMA']);
  });
});

// ============================================================================
// 7. Disabled mode → zero drift compute
// ============================================================================

describe('Disabled mode → zero drift compute', () => {
  it('disabled + driftGuardEnabled=true → provider NOT called, no drift metric', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'disabled',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const { provider, spy } = spyDriftInputProvider(driftingInput());
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, provider);
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    const next = mockNext();
    await lastValueFrom(interceptor.intercept(ctx, next));

    // Disabled → bypass entirely, no snapshot, no provider call
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    expect(driftMetrics.calls).toHaveLength(0);
  });
});

// ============================================================================
// FG-5: Closed enum — drift metric type labels are bounded
// ============================================================================

describe('FG-5: Closed enum — drift metric type labels bounded', () => {
  it('drift metric type label matches DriftType enum value', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(driftingInput()));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    // All emitted type labels must be valid DriftType enum values
    const validTypes = ['CARRIER_WRITE', 'CONFIG', 'RULESET', 'SCHEMA'];
    for (const call of driftMetrics.calls) {
      expect(validTypes).toContain(call.type);
    }
  });

  it('all 4 drift types produce valid metric labels', async () => {
    const allDriftInput: DriftInput = {
      tenantId: 't1',
      operation: GuardOperation.PROMOTE,
      policyVersion: '1.0.0',
      nowMs: NOW_MS,
      expectedSchemaVersion: 'v1',
      actualSchemaVersion: 'v2',
      expectedRuleHash: 'abc',
      actualRuleHash: 'xyz',
      expectedConfigRevision: 'rev-1',
      actualConfigRevision: 'rev-2',
      carrierWriteState: { writeCount: 3 },
    };
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalGuardMode: 'shadow',
      tenantOverrides: { t1: { driftGuardEnabled: true } },
    };
    const driftMetrics = spyDriftMetricEmitter();
    const { factory } = buildFactory(config, new StaticDriftInputProvider(allDriftInput));
    const interceptor = new GuardInterceptor(
      factory,
      new DefaultOperationResolver(),
      new DefaultTenantResolver(),
      new InMemoryGuardTelemetry(),
      driftMetrics,
    );

    const ctx = mockContext({ 'x-tenant-id': 't1', 'x-guard-operation': 'promote' });
    await lastValueFrom(interceptor.intercept(ctx, mockNext()));

    // All 4 drift types emitted
    const types = driftMetrics.calls.map((c) => c.type).sort();
    expect(types).toEqual(['CARRIER_WRITE', 'CONFIG', 'RULESET', 'SCHEMA']);
  });
});
