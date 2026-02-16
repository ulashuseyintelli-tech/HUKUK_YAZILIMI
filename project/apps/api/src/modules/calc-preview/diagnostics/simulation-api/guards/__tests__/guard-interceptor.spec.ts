/**
 * GuardInterceptor — Unit Tests
 *
 * Operational Guard Phase — Task 4.2 (revised: Task 5 checkpoint gaps)
 *
 * Test categories:
 * 1. Snapshot attachment — req.guardDecision is set and frozen
 * 2. BLOCK_503 enforcement — 503 thrown, no pipeline entry, enriched payload
 * 3. HOLD short-circuit — 200 + deterministic body, next.handle NOT called
 * 4. ALLOW pass-through — next.handle() called
 * 5. DEGRADE pass-through — next.handle() called (allowlisted ops only)
 * 6. Payload consistency — all payloads share core fields
 * 7. Operation resolver — header-based + fallback
 * 8. Tenant resolver — header/property + fallback
 * 9. DB touch invariant — BLOCK_503 and HOLD never call downstream
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R3, R4, R5
 */

import { lastValueFrom } from 'rxjs';
import { of } from 'rxjs';
import { HttpException } from '@nestjs/common';
import {
  GuardInterceptor,
  DefaultOperationResolver,
  DefaultTenantResolver,
  type Block503Payload,
  type HoldPayload,
  type GuardResponseCore,
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

// ============================================================================
// Helpers
// ============================================================================

const NOW_MS = new Date('2026-02-15T17:00:00.000Z').getTime();

const SIGNAL_CONFIGS = {
  casConflictRate: DEFAULT_WINDOW_CONFIG,
  dbTimeoutRate: DEFAULT_WINDOW_CONFIG,
  clockSkewMs: { ...DEFAULT_WINDOW_CONFIG, aggregation: 'sum' as const },
};

function freshSamples(name: string, value: number, count: number = 10): RawSample[] {
  const samples: RawSample[] = [];
  for (let i = 0; i < count; i++) {
    samples.push({ name, timestamp: NOW_MS - (count - i) * 5_000, value });
  }
  return samples;
}

function staleSamples(name: string, value: number, count: number = 10): RawSample[] {
  const samples: RawSample[] = [];
  for (let i = 0; i < count; i++) {
    samples.push({ name, timestamp: NOW_MS - 120_000 - i * 5_000, value });
  }
  return samples;
}

function buildFactory(configOverride?: GuardConfig, tenantSamples?: Record<string, RawSample[]>) {
  const clock = new FixedClock(NOW_MS);
  const config = new StaticGuardConfigProvider(configOverride ?? DEFAULT_GUARD_CONFIG);
  const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
  if (tenantSamples) {
    for (const [tid, samples] of Object.entries(tenantSamples)) {
      signals.addSamples(tid, samples);
    }
  }
  return { factory: new GuardDecisionSnapshotFactory(config, signals, clock), signals };
}

const ALL_FRESH_SAMPLES: RawSample[] = [
  ...freshSamples('casConflictRate', 0.01),
  ...freshSamples('dbTimeoutRate', 0.01),
  ...freshSamples('clockSkewMs', 10),
];

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

/** Default enforce config — mevcut testler enforce modda çalışır (canary rollout öncesi davranış) */
const ENFORCE_GUARD_CONFIG: GuardConfig = {
  ...DEFAULT_GUARD_CONFIG,
  globalGuardMode: 'enforce',
};

function buildInterceptor(configOverride?: GuardConfig, tenantSamples?: Record<string, RawSample[]>) {
  const effectiveConfig: GuardConfig = configOverride
    ? { ...configOverride, globalGuardMode: 'enforce' }
    : ENFORCE_GUARD_CONFIG;
  const { factory, signals } = buildFactory(effectiveConfig, tenantSamples);
  const interceptor = new GuardInterceptor(factory, new DefaultOperationResolver(), new DefaultTenantResolver());
  return { interceptor, signals };
}

// ============================================================================
// 1. Snapshot attachment
// ============================================================================

describe('Snapshot attachment', () => {
  it('attaches guardDecision to request', () => {
    const { interceptor } = buildInterceptor(undefined, { default: ALL_FRESH_SAMPLES });
    const ctx = mockContext();
    interceptor.intercept(ctx, mockNext());
    expect(ctx.switchToHttp().getRequest().guardDecision).toBeDefined();
    expect(ctx.switchToHttp().getRequest().guardDecision.decision).toBe(GuardDecision.ALLOW);
  });

  it('attached snapshot is frozen', () => {
    const { interceptor } = buildInterceptor(undefined, { default: ALL_FRESH_SAMPLES });
    const ctx = mockContext();
    interceptor.intercept(ctx, mockNext());
    expect(Object.isFrozen(ctx.switchToHttp().getRequest().guardDecision)).toBe(true);
  });
});

// ============================================================================
// 2. BLOCK_503 enforcement
// ============================================================================

describe('BLOCK_503 enforcement', () => {
  const killConfig: GuardConfig = {
    ...DEFAULT_GUARD_CONFIG,
    version: '5.0.0',
    tenantOverrides: { t1: { killSwitchActive: true } },
  };

  it('kill-switch → throws HttpException 503', () => {
    const { interceptor } = buildInterceptor(killConfig, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    expect(() => interceptor.intercept(ctx, mockNext())).toThrow(HttpException);
  });

  it('BLOCK_503 → next.handle() NOT called (no DB touch)', () => {
    const { interceptor } = buildInterceptor(killConfig, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    const next = mockNext();
    try { interceptor.intercept(ctx, next); } catch { /* expected */ }
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('BLOCK_503 attaches snapshot to request before throwing', () => {
    const { interceptor } = buildInterceptor(killConfig, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    try { interceptor.intercept(ctx, mockNext()); } catch { /* expected */ }
    expect(ctx.switchToHttp().getRequest().guardDecision.decision).toBe(GuardDecision.BLOCK_503);
  });

  it('503 payload has enriched core fields (tenantId, riskContextHash, operation)', () => {
    const { interceptor } = buildInterceptor(killConfig, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    try {
      interceptor.intercept(ctx, mockNext());
      fail('Expected HttpException');
    } catch (err) {
      const body = (err as HttpException).getResponse() as Block503Payload;
      expect(body.statusCode).toBe(503);
      expect(body.error).toBe('SERVICE_UNAVAILABLE');
      expect(body.tenantId).toBe('t1');
      expect(body.operation).toBe(GuardOperation.PROMOTE); // default fallback
      expect(body.policyVersion).toBe('5.0.0');
      expect(body.evaluatedAtMs).toBe(NOW_MS);
      expect(body.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
      expect(body.riskContextHash).toBeDefined();
      expect(typeof body.riskContextHash).toBe('string');
      expect(body.riskContextHash.length).toBe(16);
    }
  });
});

// ============================================================================
// 3. HOLD short-circuit
// ============================================================================

describe('HOLD short-circuit', () => {
  it('no samples → HOLD, next.handle NOT called', () => {
    const { interceptor } = buildInterceptor(); // no samples → insufficient → HOLD
    const ctx = mockContext();
    const next = mockNext();
    interceptor.intercept(ctx, next);
    expect(ctx.switchToHttp().getRequest().guardDecision.decision).toBe(GuardDecision.HOLD);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('HOLD returns Observable with deterministic HoldPayload', async () => {
    const { interceptor } = buildInterceptor();
    const ctx = mockContext();
    const result$ = interceptor.intercept(ctx, mockNext());
    const body = await lastValueFrom(result$) as HoldPayload;
    expect(body.statusCode).toBe(200);
    expect(body.held).toBe(true);
    expect(body.decision).toBe('HOLD');
    expect(body.tenantId).toBe('default');
    expect(body.policyVersion).toBe(DEFAULT_GUARD_CONFIG.version);
    expect(body.evaluatedAtMs).toBe(NOW_MS);
    expect(body.riskContextHash).toBeDefined();
    expect(body.reasonCodes.length).toBeGreaterThan(0);
  });

  it('stale signal + evaluate → HOLD, next.handle NOT called', () => {
    const { interceptor } = buildInterceptor(undefined, {
      default: [
        ...staleSamples('casConflictRate', 0.01),
        ...freshSamples('dbTimeoutRate', 0.01),
        ...freshSamples('clockSkewMs', 10),
      ],
    });
    const ctx = mockContext({ 'x-guard-operation': 'evaluate' });
    const next = mockNext();
    interceptor.intercept(ctx, next);
    expect(ctx.switchToHttp().getRequest().guardDecision.decision).toBe(GuardDecision.HOLD);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('degrade mode + PROMOTE → HOLD, next.handle NOT called', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { degradeModeActive: true } },
    };
    const { interceptor } = buildInterceptor(config, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    const next = mockNext();
    interceptor.intercept(ctx, next);
    expect(ctx.switchToHttp().getRequest().guardDecision.decision).toBe(GuardDecision.HOLD);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('HOLD payload has mode field', async () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { degradeModeActive: true } },
    };
    const { interceptor } = buildInterceptor(config, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    const result$ = interceptor.intercept(ctx, mockNext());
    const body = await lastValueFrom(result$) as HoldPayload;
    expect(body.mode).toBe('DEGRADE_FORCED_HOLD');
  });
});

// ============================================================================
// 4. ALLOW pass-through
// ============================================================================

describe('ALLOW pass-through', () => {
  it('ALLOW → next.handle() called', () => {
    const { interceptor } = buildInterceptor(undefined, { default: ALL_FRESH_SAMPLES });
    const ctx = mockContext();
    const next = mockNext();
    interceptor.intercept(ctx, next);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 5. DEGRADE pass-through
// ============================================================================

describe('DEGRADE pass-through', () => {
  it('stale + promote → DEGRADE, next.handle() called (allowlisted path)', () => {
    const { interceptor } = buildInterceptor(undefined, {
      default: [
        ...staleSamples('casConflictRate', 0.01),
        ...freshSamples('dbTimeoutRate', 0.01),
        ...freshSamples('clockSkewMs', 10),
      ],
    });
    // promote + stale → DEGRADE (not HOLD, because only evaluate → HOLD on stale)
    const ctx = mockContext(); // default op = promote
    const next = mockNext();
    interceptor.intercept(ctx, next);
    expect(ctx.switchToHttp().getRequest().guardDecision.decision).toBe(GuardDecision.DEGRADE);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 6. Payload consistency — all payloads share core fields
// ============================================================================

describe('Payload consistency', () => {
  const CORE_FIELDS: (keyof GuardResponseCore)[] = [
    'decision', 'tenantId', 'operation', 'policyVersion',
    'evaluatedAtMs', 'reasonCodes', 'riskContextHash',
  ];

  it('BLOCK_503 payload has all core fields', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { killSwitchActive: true } },
    };
    const { interceptor } = buildInterceptor(config, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    try {
      interceptor.intercept(ctx, mockNext());
    } catch (err) {
      const body = (err as HttpException).getResponse() as Block503Payload;
      for (const field of CORE_FIELDS) {
        expect(body).toHaveProperty(field);
      }
    }
  });

  it('HOLD payload has all core fields', async () => {
    const { interceptor } = buildInterceptor();
    const ctx = mockContext();
    const result$ = interceptor.intercept(ctx, mockNext());
    const body = await lastValueFrom(result$) as HoldPayload;
    for (const field of CORE_FIELDS) {
      expect(body).toHaveProperty(field);
    }
  });
});

// ============================================================================
// 7. Operation resolver
// ============================================================================

describe('DefaultOperationResolver', () => {
  const resolver = new DefaultOperationResolver();

  it('reads x-guard-operation header', () => {
    expect(resolver.resolve(mockContext({ 'x-guard-operation': 'evaluate' }))).toBe(GuardOperation.EVALUATE);
  });

  it('reads admin operation from header', () => {
    expect(resolver.resolve(mockContext({ 'x-guard-operation': 'admin' }))).toBe(GuardOperation.ADMIN);
  });

  it('falls back to PROMOTE for invalid header', () => {
    expect(resolver.resolve(mockContext({ 'x-guard-operation': 'invalid' }))).toBe(GuardOperation.PROMOTE);
  });

  it('falls back to PROMOTE when no header', () => {
    expect(resolver.resolve(mockContext())).toBe(GuardOperation.PROMOTE);
  });
});

// ============================================================================
// 8. Tenant resolver
// ============================================================================

describe('DefaultTenantResolver', () => {
  const resolver = new DefaultTenantResolver();

  it('reads x-tenant-id header', () => {
    expect(resolver.resolve(mockContext({ 'x-tenant-id': 'tenant-abc' }))).toBe('tenant-abc');
  });

  it('reads tenantId property from request', () => {
    expect(resolver.resolve(mockContext({}, { tenantId: 'tenant-prop' }))).toBe('tenant-prop');
  });

  it('property takes precedence over header', () => {
    expect(resolver.resolve(mockContext({ 'x-tenant-id': 'from-header' }, { tenantId: 'from-prop' }))).toBe('from-prop');
  });

  it('falls back to "default" when nothing set', () => {
    expect(resolver.resolve(mockContext())).toBe('default');
  });
});

// ============================================================================
// 9. DB touch invariant — BLOCK_503 and HOLD never call downstream
// ============================================================================

describe('DB touch invariant', () => {
  it('BLOCK_503: next.handle NOT called', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { killSwitchActive: true } },
    };
    const { interceptor } = buildInterceptor(config, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    const next = mockNext();
    try { interceptor.intercept(ctx, next); } catch { /* expected */ }
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('HOLD (insufficient): next.handle NOT called', () => {
    const { interceptor } = buildInterceptor();
    const next = mockNext();
    interceptor.intercept(mockContext(), next);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('HOLD (stale + evaluate): next.handle NOT called', () => {
    const { interceptor } = buildInterceptor(undefined, {
      default: [
        ...staleSamples('casConflictRate', 0.01),
        ...freshSamples('dbTimeoutRate', 0.01),
        ...freshSamples('clockSkewMs', 10),
      ],
    });
    const ctx = mockContext({ 'x-guard-operation': 'evaluate' });
    const next = mockNext();
    interceptor.intercept(ctx, next);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('HOLD (degrade forced): next.handle NOT called', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { degradeModeActive: true } },
    };
    const { interceptor } = buildInterceptor(config, { t1: ALL_FRESH_SAMPLES });
    const ctx = mockContext({ 'x-tenant-id': 't1' });
    const next = mockNext();
    interceptor.intercept(ctx, next);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('ALLOW: next.handle IS called', () => {
    const { interceptor } = buildInterceptor(undefined, { default: ALL_FRESH_SAMPLES });
    const next = mockNext();
    interceptor.intercept(mockContext(), next);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('DEGRADE (pass-through): next.handle IS called', () => {
    const { interceptor } = buildInterceptor(undefined, {
      default: [
        ...staleSamples('casConflictRate', 0.01),
        ...freshSamples('dbTimeoutRate', 0.01),
        ...freshSamples('clockSkewMs', 10),
      ],
    });
    const next = mockNext();
    interceptor.intercept(mockContext(), next); // promote + stale → DEGRADE
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
