/**
 * P5 — Per-Tenant Isolation PBT
 *
 * Operational Guard Phase — Task 6.5
 *
 * Property:
 *   For any two distinct tenants (A, B) and for any config/signal
 *   mutation applied to tenant A, tenant B's guard decision
 *   (decision, reasonCodes, riskContextHash) remains unchanged.
 *
 * Harness:
 *   - FixedClock (deterministic time)
 *   - TenantOverrideConfigProvider (per-tenant config overrides)
 *   - InMemoryRiskSignalProvider (tenant-scoped samples)
 *   - InMemoryGuardTelemetry (event capture — verify no cross-leak)
 *
 * Validates: Requirements 9.1, 9.2
 *
 * @see .kiro/specs/operational-guard-phase/design.md — Property 5
 */

import * as fc from 'fast-check';
import { FixedClock } from '../guard-clock';
import type { GuardConfigProvider } from '../guard-config-provider';
import { InMemoryRiskSignalProvider, type RawSample } from '../risk-signal-provider';
import { GuardDecisionSnapshotFactory } from '../guard-decision-snapshot.factory';
import {
  GuardInterceptor,
  DefaultOperationResolver,
  DefaultTenantResolver,
} from '../guard-interceptor';
import { InMemoryGuardTelemetry } from '../guard-telemetry';
import {
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';
import { of } from 'rxjs';

// ============================================================================
// Constants
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

const STABLE_FRESH: RawSample[] = [
  ...freshSamples('casConflictRate', 0.01),
  ...freshSamples('dbTimeoutRate', 0.01),
  ...freshSamples('clockSkewMs', 10),
];

function mockContext(tenantId: string, operation?: string): any {
  const headers: Record<string, string> = { 'x-tenant-id': tenantId };
  if (operation) headers['x-guard-operation'] = operation;
  const request: Record<string, unknown> = { headers };
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

function mockNext() {
  return { handle: jest.fn(() => of('pipeline-result')) };
}

// ============================================================================
// MutableConfigProvider — allows per-tenant override mutation
// ============================================================================

class MutableConfigProvider implements GuardConfigProvider {
  private config: GuardConfig;

  constructor(config: GuardConfig) {
    this.config = { ...config };
  }

  getConfig(): GuardConfig {
    return this.config;
  }

  /** Mutate config for a specific tenant */
  mutateTenant(tenantId: string, override: Partial<GuardConfig['tenantOverrides'][string]>): void {
    this.config = {
      ...this.config,
      tenantOverrides: {
        ...this.config.tenantOverrides,
        [tenantId]: {
          ...this.config.tenantOverrides[tenantId],
          ...override,
        },
      },
    };
  }
}

// ============================================================================
// Arbitraries
// ============================================================================

const operationArb = fc.constantFrom<GuardOperation>(
  GuardOperation.PROMOTE,
  GuardOperation.EVALUATE,
  GuardOperation.ADMIN,
);

/** Two distinct tenant IDs */
const tenantPairArb = fc
  .tuple(
    fc.stringMatching(/^t[0-9]{1,3}$/),
    fc.stringMatching(/^t[0-9]{1,3}$/),
  )
  .filter(([a, b]) => a !== b);

/** Mutation type for tenant A */
const mutationTypeArb = fc.constantFrom(
  'killSwitchOn',
  'degradeOn',
  'thresholdDrop',
  'signalFlood',
  'signalClear',
) as fc.Arbitrary<string>;

// ============================================================================
// Property Test
// ============================================================================

describe('Feature: operational-guard-phase, Property 5: Per-tenant isolation', () => {
  it('tenant A config/signal mutation does not affect tenant B decision', () => {
    fc.assert(
      fc.property(
        tenantPairArb,
        operationArb,
        mutationTypeArb,
        ([tenantA, tenantB], operation, mutationType) => {
          // ── Setup: both tenants start with identical fresh signals ──
          const configProvider = new MutableConfigProvider(DEFAULT_GUARD_CONFIG);
          const clock = new FixedClock(NOW_MS);
          const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
          signals.addSamples(tenantA, STABLE_FRESH);
          signals.addSamples(tenantB, STABLE_FRESH);

          const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock);

          // ── Baseline: tenant B snapshot BEFORE mutation ────────────
          const snapshotB_before = factory.createSnapshot(tenantB, operation as GuardOperation);

          // ── Mutate tenant A only ──────────────────────────────────
          switch (mutationType) {
            case 'killSwitchOn':
              configProvider.mutateTenant(tenantA, { killSwitchActive: true });
              break;
            case 'degradeOn':
              configProvider.mutateTenant(tenantA, { degradeModeActive: true });
              break;
            case 'thresholdDrop':
              configProvider.mutateTenant(tenantA, {
                thresholds: {
                  casConflictRateThreshold: 0.001,
                  dbTimeoutRateThreshold: 0.001,
                  clockSkewThresholdMs: 1,
                },
              });
              break;
            case 'signalFlood':
              // Add extreme signal values for tenant A only
              signals.addSamples(tenantA, [
                ...freshSamples('casConflictRate', 999),
                ...freshSamples('dbTimeoutRate', 999),
                ...freshSamples('clockSkewMs', 99999),
              ]);
              break;
            case 'signalClear':
              // Clear all signals for tenant A
              signals.clearTenant(tenantA);
              break;
          }

          // ── Tenant B snapshot AFTER mutation ───────────────────────
          const snapshotB_after = factory.createSnapshot(tenantB, operation as GuardOperation);

          // ── Assertions: B is unaffected ────────────────────────────
          expect(snapshotB_after.decision).toBe(snapshotB_before.decision);
          expect(snapshotB_after.riskContextHash).toBe(snapshotB_before.riskContextHash);
          expect([...snapshotB_after.reasonCodes]).toEqual([...snapshotB_before.reasonCodes]);
          expect(snapshotB_after.mode).toBe(snapshotB_before.mode);
          expect(snapshotB_after.tenantId).toBe(tenantB);
          expect(snapshotB_before.tenantId).toBe(tenantB);
        },
      ),
      { numRuns: 200, seed: 20260215 },
    );
  });

  it('telemetry events do not cross-leak between tenants', () => {
    fc.assert(
      fc.property(
        tenantPairArb,
        operationArb,
        ([tenantA, tenantB], operation) => {
          const enforceConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG, globalGuardMode: 'enforce' };
          const configProvider = new MutableConfigProvider(enforceConfig);
          const clock = new FixedClock(NOW_MS);
          const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
          signals.addSamples(tenantA, STABLE_FRESH);
          signals.addSamples(tenantB, STABLE_FRESH);
          const telemetry = new InMemoryGuardTelemetry();

          const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock);
          const interceptor = new GuardInterceptor(
            factory,
            new DefaultOperationResolver(),
            new DefaultTenantResolver(),
            telemetry,
          );

          // Request for tenant A
          const ctxA = mockContext(tenantA, operation);
          try { interceptor.intercept(ctxA, mockNext()); } catch { /* BLOCK_503 */ }

          // Request for tenant B
          const ctxB = mockContext(tenantB, operation);
          try { interceptor.intercept(ctxB, mockNext()); } catch { /* BLOCK_503 */ }

          // Two events emitted
          expect(telemetry.events).toHaveLength(2);

          // Event 0 → tenant A, Event 1 → tenant B
          expect(telemetry.events[0].tenantId).toBe(tenantA);
          expect(telemetry.events[1].tenantId).toBe(tenantB);

          // No cross-leak: B event has B's tenant
          expect(telemetry.events[1].tenantId).not.toBe(tenantA);
        },
      ),
      { numRuns: 200, seed: 20260215 },
    );
  });
});
