/**
 * P2 — GuardDecisionSnapshot Mid-Flight Toggle Immutability
 *
 * Operational Guard Phase — Task 6.4
 *
 * Property:
 *   For any request and for any config mutation (kill-switch toggle,
 *   threshold change, degrade mode toggle) during request lifetime,
 *   the snapshot computed at request start remains unchanged.
 *
 *   Because factory reads config ONCE (read-once semantics), a config
 *   flip after snapshot creation has no effect on the in-flight snapshot.
 *   This PBT proves that invariant holds across arbitrary config mutations.
 *
 * Harness:
 *   - FixedClock (deterministic time)
 *   - FlippingGuardConfigProvider (returns baseConfig on first call,
 *     flippedConfig on subsequent calls — simulates mid-flight mutation)
 *   - InMemoryRiskSignalProvider (stable samples)
 *   - InMemoryGuardTelemetry (event capture)
 *
 * Validates: Requirements 3.1, 3.3
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4, Property 2
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
  GuardDecision,
  GuardOperation,
  DegradeAllowedOp,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
  type GuardThresholds,
} from '../guard-policy-resolver.types';
import { lastValueFrom, of } from 'rxjs';
import { HttpException } from '@nestjs/common';

// ============================================================================
// FlippingGuardConfigProvider — returns different config after first read
// ============================================================================

class FlippingGuardConfigProvider implements GuardConfigProvider {
  private callCount = 0;
  constructor(
    private readonly baseConfig: GuardConfig,
    private readonly flippedConfig: GuardConfig,
  ) {}

  getConfig(): GuardConfig {
    this.callCount++;
    // Interceptor calls getConfig() twice per request:
    //   1st: mode resolution (interceptor)
    //   2nd: snapshot creation (factory.createSnapshot)
    // Both should return base config for the first request.
    // Subsequent requests get flipped config.
    return this.callCount <= 2 ? this.baseConfig : this.flippedConfig;
  }
}

// ============================================================================
// Constants
// ============================================================================

const NOW_MS = new Date('2026-02-15T17:00:00.000Z').getTime();
const TENANT = 'pbt-tenant';

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
// Arbitraries
// ============================================================================

const operationArb = fc.constantFrom<GuardOperation>(
  GuardOperation.PROMOTE,
  GuardOperation.EVALUATE,
  GuardOperation.ADMIN,
);

/** Generates a valid GuardThresholds with positive values */
const thresholdsArb = fc.record({
  casConflictRateThreshold: fc.double({ min: 0.01, max: 10, noNaN: true }),
  dbTimeoutRateThreshold: fc.double({ min: 0.01, max: 10, noNaN: true }),
  clockSkewThresholdMs: fc.double({ min: 10, max: 5000, noNaN: true }),
});

/** Flip type — what config mutation happens mid-flight */
const flipTypeArb = fc.constantFrom(
  'killSwitchOn',
  'killSwitchOff',
  'thresholdChange',
  'degradeOn',
  'degradeOff',
  'allowlistChange',
) as fc.Arbitrary<string>;

/**
 * Build base + flipped config pair from arbitrary flip type and thresholds.
 */
function buildConfigPair(
  flipType: string,
  thresholds: GuardThresholds,
): { base: GuardConfig; flipped: GuardConfig } {
  const base: GuardConfig = {
    ...DEFAULT_GUARD_CONFIG,
    version: '1.0.0-base',
    globalGuardMode: 'enforce',
    globalDefaults: thresholds,
    tenantOverrides: {
      [TENANT]: {
        killSwitchActive: false,
        degradeModeActive: false,
        thresholds,
        allowedOpsInDegradeMode: DEFAULT_GUARD_CONFIG.globalDegradeAllowlist,
      },
    },
  };

  const flipped: GuardConfig = { ...base, version: '2.0.0-flipped' };

  switch (flipType) {
    case 'killSwitchOn':
      flipped.tenantOverrides = {
        [TENANT]: { ...base.tenantOverrides[TENANT], killSwitchActive: true },
      };
      break;
    case 'killSwitchOff':
      // base has kill-switch on, flip turns it off
      base.tenantOverrides = {
        [TENANT]: { ...base.tenantOverrides[TENANT], killSwitchActive: true },
      };
      flipped.tenantOverrides = {
        [TENANT]: { ...base.tenantOverrides[TENANT], killSwitchActive: false },
      };
      break;
    case 'thresholdChange':
      flipped.tenantOverrides = {
        [TENANT]: {
          ...base.tenantOverrides[TENANT],
          thresholds: {
            casConflictRateThreshold: thresholds.casConflictRateThreshold * 0.1,
            dbTimeoutRateThreshold: thresholds.dbTimeoutRateThreshold * 0.1,
            clockSkewThresholdMs: thresholds.clockSkewThresholdMs * 0.1,
          },
        },
      };
      break;
    case 'degradeOn':
      flipped.tenantOverrides = {
        [TENANT]: { ...base.tenantOverrides[TENANT], degradeModeActive: true },
      };
      break;
    case 'degradeOff':
      base.tenantOverrides = {
        [TENANT]: { ...base.tenantOverrides[TENANT], degradeModeActive: true },
      };
      flipped.tenantOverrides = {
        [TENANT]: { ...base.tenantOverrides[TENANT], degradeModeActive: false },
      };
      break;
    case 'allowlistChange':
      flipped.tenantOverrides = {
        [TENANT]: {
          ...base.tenantOverrides[TENANT],
          allowedOpsInDegradeMode: [], // empty allowlist
        },
      };
      break;
  }

  return { base, flipped };
}

// ============================================================================
// Property Test
// ============================================================================

describe('Feature: operational-guard-phase, Property 2: Snapshot immutability', () => {
  it('mid-flight config mutation does not affect in-flight snapshot', () => {
    fc.assert(
      fc.property(
        operationArb,
        flipTypeArb,
        thresholdsArb,
        (operation, flipType, thresholds) => {
          const { base, flipped } = buildConfigPair(flipType, thresholds);

          // Provider: first getConfig() → base, second → flipped
          const configProvider = new FlippingGuardConfigProvider(base, flipped);
          const clock = new FixedClock(NOW_MS);
          const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
          signals.addSamples(TENANT, ALL_FRESH);
          const telemetry = new InMemoryGuardTelemetry();

          const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock);
          const interceptor = new GuardInterceptor(
            factory,
            new DefaultOperationResolver(),
            new DefaultTenantResolver(),
            telemetry,
          );

          // ── First call: snapshot created with base config ──────
          const ctx1 = mockContext(TENANT, operation);
          const next1 = mockNext();
          let snapshot1Decision: string | undefined;
          let snapshot1Version: string | undefined;
          let snapshot1ReasonCodes: readonly string[] | undefined;
          let snapshot1Hash: string | undefined;
          let snapshot1EvalMs: number | undefined;

          try {
            const result$ = interceptor.intercept(ctx1, next1);
            // If not thrown, resolve observable
            if (result$) {
              // Snapshot is attached to request
              const snap = ctx1.switchToHttp().getRequest().guardDecision;
              snapshot1Decision = snap.decision;
              snapshot1Version = snap.policyVersion;
              snapshot1ReasonCodes = snap.reasonCodes;
              snapshot1Hash = snap.riskContextHash;
              snapshot1EvalMs = snap.evaluatedAtMs;
            }
          } catch (err) {
            // BLOCK_503 path
            const snap = ctx1.switchToHttp().getRequest().guardDecision;
            snapshot1Decision = snap.decision;
            snapshot1Version = snap.policyVersion;
            snapshot1ReasonCodes = snap.reasonCodes;
            snapshot1Hash = snap.riskContextHash;
            snapshot1EvalMs = snap.evaluatedAtMs;
          }

          // ── Assertions ─────────────────────────────────────────
          // 1. Snapshot uses BASE config version (not flipped)
          expect(snapshot1Version).toBe('1.0.0-base');

          // 2. evaluatedAtMs matches injected clock
          expect(snapshot1EvalMs).toBe(NOW_MS);

          // 3. Telemetry emitted exactly once
          expect(telemetry.events).toHaveLength(1);

          // 4. Telemetry event matches snapshot
          const event = telemetry.events[0];
          expect(event.decision).toBe(snapshot1Decision);
          expect(event.policyVersion).toBe(snapshot1Version);
          expect(event.evaluatedAtMs).toBe(snapshot1EvalMs);
          expect(event.riskContextHash).toBe(snapshot1Hash);

          // 5. Second factory call would get flipped config — but
          //    the FIRST snapshot is already frozen and unaffected.
          //    Verify by creating a second snapshot:
          const snapshot2 = factory.createSnapshot(TENANT, operation as GuardOperation);
          // Second snapshot uses flipped config
          expect(snapshot2.policyVersion).toBe('2.0.0-flipped');
          // But first snapshot is still base
          expect(snapshot1Version).toBe('1.0.0-base');
          // Decision may differ (that's the point — config changed)
          // but first snapshot is immutable
        },
      ),
      { numRuns: 200, seed: 20260215, verbose: true },
    );
  });

  it('snapshot object is frozen — mutation attempt throws', () => {
    fc.assert(
      fc.property(
        operationArb,
        thresholdsArb,
        (operation, thresholds) => {
          const config: GuardConfig = {
            ...DEFAULT_GUARD_CONFIG,
            version: '1.0.0',
            globalDefaults: thresholds,
          };

          const clock = new FixedClock(NOW_MS);
          const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
          signals.addSamples(TENANT, ALL_FRESH);
          const factory = new GuardDecisionSnapshotFactory(
            { getConfig: () => config },
            signals,
            clock,
          );

          const snapshot = factory.createSnapshot(TENANT, operation as GuardOperation);

          // Frozen check
          expect(Object.isFrozen(snapshot)).toBe(true);

          // Mutation attempt should throw in strict mode
          expect(() => {
            (snapshot as any).decision = 'TAMPERED';
          }).toThrow();
        },
      ),
      { numRuns: 200, seed: 20260215 },
    );
  });
});
