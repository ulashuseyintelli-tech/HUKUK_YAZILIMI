/**
 * GuardTelemetry — Unit Tests
 *
 * Operational Guard Phase — Task 6.0T
 *
 * Test categories:
 *   1. Emit-once guarantee — emitDecision called exactly 1 time per intercept
 *   2. Best-effort swallow — telemetry throw does not mask guard decision
 *   3. Event shape — all GuardTelemetryEvent fields match snapshot
 *   4. Decision coverage — HOLD, BLOCK_503, ALLOW, DEGRADE all emit
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4.6
 * @see .kiro/specs/operational-guard-phase/requirements.md — R4, R5
 */

import { lastValueFrom, of } from 'rxjs';
import { HttpException } from '@nestjs/common';
import {
  GuardInterceptor,
  DefaultOperationResolver,
  DefaultTenantResolver,
} from '../guard-interceptor';
import { GuardDecisionSnapshotFactory } from '../guard-decision-snapshot.factory';
import { FixedClock } from '../guard-clock';
import { StaticGuardConfigProvider } from '../guard-config-provider';
import { InMemoryRiskSignalProvider, type RawSample } from '../risk-signal-provider';
import {
  GuardDecision,
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';
import {
  InMemoryGuardTelemetry,
  ThrowingGuardTelemetry,
} from '../guard-telemetry';

// ============================================================================
// Helpers (same pattern as guard-interceptor.spec.ts)
// ============================================================================

const NOW_MS = new Date('2026-02-15T17:00:00.000Z').getTime();

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

function staleSamples(name: string, value: number, count = 10): RawSample[] {
  return Array.from({ length: count }, (_, i) => ({
    name,
    timestamp: NOW_MS - 120_000 - i * 5_000,
    value,
  }));
}

const ALL_FRESH: RawSample[] = [
  ...freshSamples('casConflictRate', 0.01),
  ...freshSamples('dbTimeoutRate', 0.01),
  ...freshSamples('clockSkewMs', 10),
];

function mockContext(
  headers: Record<string, string> = {},
  props: Record<string, unknown> = {},
): any {
  const request: Record<string, unknown> = { headers, ...props };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    _request: request,
  };
}

function mockNext() {
  return { handle: jest.fn(() => of('pipeline-result')) };
}

/** Default enforce config — mevcut testler enforce modda çalışır */
const ENFORCE_GUARD_CONFIG: GuardConfig = {
  ...DEFAULT_GUARD_CONFIG,
  globalGuardMode: 'enforce',
};

function buildInterceptorWithTelemetry(
  telemetry: InMemoryGuardTelemetry | ThrowingGuardTelemetry,
  configOverride?: GuardConfig,
  tenantSamples?: Record<string, RawSample[]>,
) {
  const clock = new FixedClock(NOW_MS);
  const effectiveConfig: GuardConfig = configOverride
    ? { ...configOverride, globalGuardMode: 'enforce' }
    : ENFORCE_GUARD_CONFIG;
  const config = new StaticGuardConfigProvider(effectiveConfig);
  const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
  if (tenantSamples) {
    for (const [tid, samples] of Object.entries(tenantSamples)) {
      signals.addSamples(tid, samples);
    }
  }
  const factory = new GuardDecisionSnapshotFactory(config, signals, clock);
  const interceptor = new GuardInterceptor(
    factory,
    new DefaultOperationResolver(),
    new DefaultTenantResolver(),
    telemetry,
  );
  return { interceptor, signals };
}

// ============================================================================
// 1. Emit-once: ALLOW
// ============================================================================

describe('Telemetry emit — ALLOW path', () => {
  it('emitDecision called exactly 1 time', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: ALL_FRESH,
    });
    interceptor.intercept(mockContext(), mockNext());
    expect(tel.events).toHaveLength(1);
  });

  it('event.decision === ALLOW', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: ALL_FRESH,
    });
    interceptor.intercept(mockContext(), mockNext());
    expect(tel.events[0].decision).toBe(GuardDecision.ALLOW);
  });
});

// ============================================================================
// 2. Emit-once: BLOCK_503
// ============================================================================

describe('Telemetry emit — BLOCK_503 path', () => {
  const killConfig: GuardConfig = {
    ...DEFAULT_GUARD_CONFIG,
    version: '6.0.0',
    tenantOverrides: { t1: { killSwitchActive: true } },
  };

  it('emitDecision called exactly 1 time (before throw)', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, killConfig, {
      t1: ALL_FRESH,
    });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    try {
      interceptor.intercept(ctx, mockNext());
    } catch {
      // expected 503
    }
    expect(tel.events).toHaveLength(1);
  });

  it('event.decision === BLOCK_503', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, killConfig, {
      t1: ALL_FRESH,
    });
    try {
      interceptor.intercept(mockContext({ 'x-tenant-id': 't1' }), mockNext());
    } catch {
      // expected
    }
    expect(tel.events[0].decision).toBe(GuardDecision.BLOCK_503);
  });
});

// ============================================================================
// 3. Emit-once: HOLD
// ============================================================================

describe('Telemetry emit — HOLD path', () => {
  it('emitDecision called exactly 1 time (no samples → insufficient → HOLD)', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel);
    interceptor.intercept(mockContext(), mockNext());
    expect(tel.events).toHaveLength(1);
    expect(tel.events[0].decision).toBe(GuardDecision.HOLD);
  });

  it('HOLD via degrade forced → emitDecision 1 time with mode', () => {
    const tel = new InMemoryGuardTelemetry();
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { degradeModeActive: true } },
    };
    const { interceptor } = buildInterceptorWithTelemetry(tel, config, {
      t1: ALL_FRESH,
    });
    interceptor.intercept(mockContext({ 'x-tenant-id': 't1' }), mockNext());
    expect(tel.events).toHaveLength(1);
    expect(tel.events[0].decision).toBe(GuardDecision.HOLD);
    expect(tel.events[0].mode).toBe('DEGRADE_FORCED_HOLD');
  });
});

// ============================================================================
// 4. Emit-once: DEGRADE pass-through
// ============================================================================

describe('Telemetry emit — DEGRADE path', () => {
  it('emitDecision called exactly 1 time', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: [
        ...staleSamples('casConflictRate', 0.01),
        ...freshSamples('dbTimeoutRate', 0.01),
        ...freshSamples('clockSkewMs', 10),
      ],
    });
    // promote + stale → DEGRADE
    interceptor.intercept(mockContext(), mockNext());
    expect(tel.events).toHaveLength(1);
    expect(tel.events[0].decision).toBe(GuardDecision.DEGRADE);
  });
});

// ============================================================================
// 5. Best-effort swallow — telemetry throw does NOT mask guard decision
// ============================================================================

describe('Telemetry throw — best-effort swallow', () => {
  it('HOLD: telemetry throws → request still returns HOLD', async () => {
    const tel = new ThrowingGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel);
    const ctx = mockContext();
    const result$ = interceptor.intercept(ctx, mockNext());
    const body = await lastValueFrom(result$) as any;
    expect(body.held).toBe(true);
    expect(body.decision).toBe('HOLD');
  });

  it('BLOCK_503: telemetry throws → still throws 503', () => {
    const tel = new ThrowingGuardTelemetry();
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { killSwitchActive: true } },
    };
    const { interceptor } = buildInterceptorWithTelemetry(tel, config, {
      t1: ALL_FRESH,
    });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    expect(() => interceptor.intercept(ctx, mockNext())).toThrow(HttpException);
  });

  it('ALLOW: telemetry throws → next.handle() still called', () => {
    const tel = new ThrowingGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: ALL_FRESH,
    });
    const next = mockNext();
    interceptor.intercept(mockContext(), next);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 6. Event shape — all fields match snapshot
// ============================================================================

describe('Telemetry event shape', () => {
  it('event contains all GuardTelemetryEvent fields', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: ALL_FRESH,
    });
    interceptor.intercept(mockContext(), mockNext());

    const event = tel.events[0];
    expect(event).toEqual(
      expect.objectContaining({
        tenantId: expect.any(String),
        operation: expect.any(String),
        decision: expect.any(String),
        policyVersion: expect.any(String),
        evaluatedAtMs: expect.any(Number),
        riskContextHash: expect.any(String),
        reasonCodes: expect.any(Array),
        guardMode: expect.any(String),
        wouldEnforce: expect.any(Boolean),
      }),
    );
    // mode can be null or string
    expect('mode' in event).toBe(true);
  });

  it('event.reasonCodes matches snapshot.reasonCodes', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: ALL_FRESH,
    });
    const ctx = mockContext();
    interceptor.intercept(ctx, mockNext());

    const snapshot = ctx.switchToHttp().getRequest().guardDecision;
    const event = tel.events[0];
    expect(event.reasonCodes).toBe(snapshot.reasonCodes); // reference equality
  });

  it('event.evaluatedAtMs === NOW_MS', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: ALL_FRESH,
    });
    interceptor.intercept(mockContext(), mockNext());
    expect(tel.events[0].evaluatedAtMs).toBe(NOW_MS);
  });

  it('event.tenantId matches resolved tenant', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      'my-tenant': ALL_FRESH,
    });
    interceptor.intercept(
      mockContext({ 'x-tenant-id': 'my-tenant' }),
      mockNext(),
    );
    expect(tel.events[0].tenantId).toBe('my-tenant');
  });

  it('event.operation matches resolved operation', () => {
    const tel = new InMemoryGuardTelemetry();
    const { interceptor } = buildInterceptorWithTelemetry(tel, undefined, {
      default: ALL_FRESH,
    });
    interceptor.intercept(
      mockContext({ 'x-guard-operation': 'evaluate' }),
      mockNext(),
    );
    expect(tel.events[0].operation).toBe(GuardOperation.EVALUATE);
  });
});
