/**
 * Guard Canary Rollout — Unit Tests
 *
 * Tasks 1.2, 2.2, 3.2 combined
 *
 * Test categories:
 *   1. GuardMode config schema (Task 1.2)
 *      - resolveTenantConfig guardMode merge
 *      - isValidGuardMode validation (NR-4)
 *      - Default guardMode = 'disabled' (NR-5)
 *
 *   2. Interceptor mode branching (Task 2.2)
 *      - disabled: zero compute, no snapshot, no telemetry (NR-2)
 *      - shadow: full compute, zero enforcement (NR-3)
 *      - enforce: mevcut davranış (regresyon)
 *      - shadow: req.guardDecision attached (NR-6)
 *
 *   3. Shadow telemetry (Task 3.2)
 *      - guardMode field in telemetry event
 *      - wouldEnforce derived from same snapshot (NR-1)
 *
 * @see .kiro/specs/guard-canary-rollout/requirements.md
 * @see .kiro/specs/guard-canary-rollout/design.md
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
  VALID_GUARD_MODES,
  isValidGuardMode,
  resolveTenantConfig,
  type GuardConfig,
  type GuardMode,
} from '../guard-policy-resolver.types';
import { InMemoryGuardTelemetry } from '../guard-telemetry';

// ============================================================================
// Helpers
// ============================================================================

const NOW_MS = new Date('2026-02-16T10:00:00.000Z').getTime();

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

function buildWithMode(
  guardMode: GuardMode,
  telemetry: InMemoryGuardTelemetry,
  configOverride?: Partial<GuardConfig>,
  tenantSamples?: Record<string, RawSample[]>,
) {
  const config: GuardConfig = {
    ...DEFAULT_GUARD_CONFIG,
    globalGuardMode: guardMode,
    ...configOverride,
  };
  const clock = new FixedClock(NOW_MS);
  const configProvider = new StaticGuardConfigProvider(config);
  const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
  if (tenantSamples) {
    for (const [tid, samples] of Object.entries(tenantSamples)) {
      signals.addSamples(tid, samples);
    }
  }
  const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock);
  const interceptor = new GuardInterceptor(
    factory,
    new DefaultOperationResolver(),
    new DefaultTenantResolver(),
    telemetry,
  );
  return { interceptor, signals };
}

// ============================================================================
// 1. GuardMode Config Schema (Task 1.2)
// ============================================================================

describe('GuardMode config schema', () => {
  describe('isValidGuardMode (NR-4)', () => {
    it.each(['enforce', 'shadow', 'disabled'] as const)(
      '%s → true',
      (mode) => expect(isValidGuardMode(mode)).toBe(true),
    );

    it.each(['unknown', 'ENFORCE', 'Shadow', '', 'active', 'off'])(
      '"%s" → false (unknown rejected)',
      (mode) => expect(isValidGuardMode(mode)).toBe(false),
    );
  });

  describe('VALID_GUARD_MODES', () => {
    it('contains exactly 3 modes', () => {
      expect(VALID_GUARD_MODES).toHaveLength(3);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(VALID_GUARD_MODES)).toBe(true);
    });
  });

  describe('resolveTenantConfig guardMode merge', () => {
    it('no override → uses globalGuardMode', () => {
      const config: GuardConfig = { ...DEFAULT_GUARD_CONFIG, globalGuardMode: 'shadow' };
      const tc = resolveTenantConfig('any-tenant', config);
      expect(tc.guardMode).toBe('shadow');
    });

    it('tenant override → overrides globalGuardMode', () => {
      const config: GuardConfig = {
        ...DEFAULT_GUARD_CONFIG,
        globalGuardMode: 'disabled',
        tenantOverrides: { t1: { guardMode: 'enforce' } },
      };
      const tc = resolveTenantConfig('t1', config);
      expect(tc.guardMode).toBe('enforce');
    });

    it('tenant override without guardMode → falls back to globalGuardMode', () => {
      const config: GuardConfig = {
        ...DEFAULT_GUARD_CONFIG,
        globalGuardMode: 'shadow',
        tenantOverrides: { t1: { killSwitchActive: true } },
      };
      const tc = resolveTenantConfig('t1', config);
      expect(tc.guardMode).toBe('shadow');
    });

    it('default config → guardMode = disabled (NR-5)', () => {
      const tc = resolveTenantConfig('any', DEFAULT_GUARD_CONFIG);
      expect(tc.guardMode).toBe('disabled');
    });
  });

  describe('DEFAULT_GUARD_CONFIG', () => {
    it('globalGuardMode = disabled', () => {
      expect(DEFAULT_GUARD_CONFIG.globalGuardMode).toBe('disabled');
    });
  });
});

// ============================================================================
// 2. Interceptor Mode Branching (Task 2.2)
// ============================================================================

describe('Interceptor mode branching', () => {
  // ── NR-2: disabled = zero compute ──────────────────────────────
  describe('disabled mode (NR-2)', () => {
    it('next.handle() called (bypass)', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('disabled', tel, undefined, { default: ALL_FRESH });
      const next = mockNext();
      interceptor.intercept(mockContext(), next);
      expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('no snapshot created — req.guardDecision undefined', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('disabled', tel, undefined, { default: ALL_FRESH });
      const ctx = mockContext();
      interceptor.intercept(ctx, mockNext());
      expect(ctx.switchToHttp().getRequest().guardDecision).toBeUndefined();
    });

    it('no telemetry emitted', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('disabled', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events).toHaveLength(0);
    });

    it('disabled + kill-switch tenant → still bypasses (disabled wins)', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('disabled', tel, {
        tenantOverrides: { t1: { killSwitchActive: true, guardMode: 'disabled' } },
      }, { t1: ALL_FRESH });
      const next = mockNext();
      interceptor.intercept(mockContext({ 'x-tenant-id': 't1' }), next);
      expect(next.handle).toHaveBeenCalledTimes(1);
      expect(tel.events).toHaveLength(0);
    });
  });

  // ── NR-3: shadow = full compute, zero enforcement ──────────────
  describe('shadow mode (NR-3)', () => {
    it('ALLOW → next.handle() called', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      const next = mockNext();
      interceptor.intercept(mockContext(), next);
      expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('BLOCK_503 decision → next.handle() called (no throw)', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, {
        tenantOverrides: { t1: { killSwitchActive: true } },
      }, { t1: ALL_FRESH });
      const next = mockNext();
      // Should NOT throw — shadow mode
      expect(() => interceptor.intercept(
        mockContext({ 'x-tenant-id': 't1' }),
        next,
      )).not.toThrow();
      expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('HOLD decision → next.handle() called (no short-circuit)', () => {
      const tel = new InMemoryGuardTelemetry();
      // No samples → insufficient → HOLD decision
      const { interceptor } = buildWithMode('shadow', tel);
      const next = mockNext();
      interceptor.intercept(mockContext(), next);
      expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('req.guardDecision attached (NR-6)', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      const ctx = mockContext();
      interceptor.intercept(ctx, mockNext());
      const snap = ctx.switchToHttp().getRequest().guardDecision;
      expect(snap).toBeDefined();
      expect(snap.decision).toBe(GuardDecision.ALLOW);
      expect(Object.isFrozen(snap)).toBe(true);
    });

    it('telemetry emitted with guardMode=shadow', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events).toHaveLength(1);
      expect(tel.events[0].guardMode).toBe('shadow');
    });

    it('shadow response is pipeline result (unchanged)', async () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      const result$ = interceptor.intercept(mockContext(), mockNext());
      const body = await lastValueFrom(result$);
      expect(body).toBe('pipeline-result');
    });
  });

  // ── enforce: mevcut davranış (regresyon) ───────────────────────
  describe('enforce mode (regresyon)', () => {
    it('BLOCK_503 → throws HttpException 503', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, {
        tenantOverrides: { t1: { killSwitchActive: true } },
      }, { t1: ALL_FRESH });
      expect(() => interceptor.intercept(
        mockContext({ 'x-tenant-id': 't1' }),
        mockNext(),
      )).toThrow(HttpException);
    });

    it('HOLD → next.handle NOT called', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel);
      const next = mockNext();
      interceptor.intercept(mockContext(), next);
      expect(next.handle).not.toHaveBeenCalled();
    });

    it('ALLOW → next.handle called', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, undefined, { default: ALL_FRESH });
      const next = mockNext();
      interceptor.intercept(mockContext(), next);
      expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('telemetry emitted with guardMode=enforce', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events).toHaveLength(1);
      expect(tel.events[0].guardMode).toBe('enforce');
    });
  });

  // ── Per-tenant mode override ───────────────────────────────────
  describe('per-tenant mode override', () => {
    it('global=disabled, tenant=enforce → tenant enforces', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('disabled', tel, {
        tenantOverrides: { t1: { guardMode: 'enforce', killSwitchActive: true } },
      }, { t1: ALL_FRESH });
      expect(() => interceptor.intercept(
        mockContext({ 'x-tenant-id': 't1' }),
        mockNext(),
      )).toThrow(HttpException);
    });

    it('global=enforce, tenant=shadow → tenant shadows', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, {
        tenantOverrides: { t1: { guardMode: 'shadow', killSwitchActive: true } },
      }, { t1: ALL_FRESH });
      const next = mockNext();
      expect(() => interceptor.intercept(
        mockContext({ 'x-tenant-id': 't1' }),
        next,
      )).not.toThrow();
      expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('global=shadow, tenant=disabled → tenant disabled', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, {
        tenantOverrides: { t1: { guardMode: 'disabled' } },
      }, { t1: ALL_FRESH });
      const ctx = mockContext({ 'x-tenant-id': 't1' });
      interceptor.intercept(ctx, mockNext());
      expect(ctx.switchToHttp().getRequest().guardDecision).toBeUndefined();
      expect(tel.events).toHaveLength(0);
    });
  });
});


// ============================================================================
// 3. Shadow Telemetry (Task 3.2)
// ============================================================================

describe('Shadow telemetry', () => {
  describe('guardMode field', () => {
    it('shadow → event.guardMode = "shadow"', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events[0].guardMode).toBe('shadow');
    });

    it('enforce → event.guardMode = "enforce"', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events[0].guardMode).toBe('enforce');
    });

    it('disabled → no event emitted', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('disabled', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events).toHaveLength(0);
    });
  });

  describe('wouldEnforce (NR-1: same snapshot, no second eval)', () => {
    it('shadow + BLOCK_503 → wouldEnforce = true', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, {
        tenantOverrides: { t1: { killSwitchActive: true } },
      }, { t1: ALL_FRESH });
      interceptor.intercept(mockContext({ 'x-tenant-id': 't1' }), mockNext());
      expect(tel.events[0].wouldEnforce).toBe(true);
      expect(tel.events[0].decision).toBe(GuardDecision.BLOCK_503);
    });

    it('shadow + HOLD → wouldEnforce = true', () => {
      const tel = new InMemoryGuardTelemetry();
      // No samples → insufficient → HOLD
      const { interceptor } = buildWithMode('shadow', tel);
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events[0].wouldEnforce).toBe(true);
      expect(tel.events[0].decision).toBe(GuardDecision.HOLD);
    });

    it('shadow + ALLOW → wouldEnforce = false', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events[0].wouldEnforce).toBe(false);
      expect(tel.events[0].decision).toBe(GuardDecision.ALLOW);
    });

    it('shadow + DEGRADE → wouldEnforce = false', () => {
      const tel = new InMemoryGuardTelemetry();
      const staleCas: RawSample[] = Array.from({ length: 10 }, (_, i) => ({
        name: 'casConflictRate',
        timestamp: NOW_MS - 120_000 - i * 5_000,
        value: 0.01,
      }));
      const { interceptor } = buildWithMode('shadow', tel, undefined, {
        default: [
          ...staleCas,
          ...freshSamples('dbTimeoutRate', 0.01),
          ...freshSamples('clockSkewMs', 10),
        ],
      });
      interceptor.intercept(mockContext(), mockNext()); // promote + stale → DEGRADE
      expect(tel.events[0].wouldEnforce).toBe(false);
      expect(tel.events[0].decision).toBe(GuardDecision.DEGRADE);
    });

    it('enforce + BLOCK_503 → wouldEnforce = true', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, {
        tenantOverrides: { t1: { killSwitchActive: true } },
      }, { t1: ALL_FRESH });
      try {
        interceptor.intercept(mockContext({ 'x-tenant-id': 't1' }), mockNext());
      } catch { /* expected 503 */ }
      expect(tel.events[0].wouldEnforce).toBe(true);
    });

    it('enforce + ALLOW → wouldEnforce = false', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events[0].wouldEnforce).toBe(false);
    });

    it('wouldEnforce derived from same snapshot — no second eval', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, {
        tenantOverrides: { t1: { killSwitchActive: true } },
      }, { t1: ALL_FRESH });
      const ctx = mockContext({ 'x-tenant-id': 't1' });
      interceptor.intercept(ctx, mockNext());

      const snap = ctx.switchToHttp().getRequest().guardDecision;
      const event = tel.events[0];

      // wouldEnforce matches snapshot decision
      const expectedWouldEnforce =
        snap.decision === GuardDecision.BLOCK_503 ||
        snap.decision === GuardDecision.HOLD;
      expect(event.wouldEnforce).toBe(expectedWouldEnforce);
      // Same snapshot data
      expect(event.decision).toBe(snap.decision);
      expect(event.riskContextHash).toBe(snap.riskContextHash);
      expect(event.evaluatedAtMs).toBe(snap.evaluatedAtMs);
    });
  });

  describe('snapshotDurationMs (A7 latency source)', () => {
    it('shadow mode → snapshotDurationMs is a non-negative number', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events[0].snapshotDurationMs).toBeGreaterThanOrEqual(0);
      expect(typeof tel.events[0].snapshotDurationMs).toBe('number');
    });

    it('enforce mode → snapshotDurationMs is a non-negative number', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('enforce', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events[0].snapshotDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('disabled mode → no event, no snapshotDurationMs', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('disabled', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      expect(tel.events).toHaveLength(0);
    });

    it('snapshotDurationMs measures only snapshot compute (not downstream)', () => {
      const tel = new InMemoryGuardTelemetry();
      const { interceptor } = buildWithMode('shadow', tel, undefined, { default: ALL_FRESH });
      interceptor.intercept(mockContext(), mockNext());
      // Snapshot compute should be sub-millisecond in test (no I/O)
      expect(tel.events[0].snapshotDurationMs).toBeLessThan(100);
    });
  });
});
