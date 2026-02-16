/**
 * P6 PBT — Sinyal Staleness Fail-Closed
 *
 * Guard Canary Rollout — Task 5.2
 *
 * Property:
 *   For any stale signal → resolver NEVER returns ALLOW.
 *   Stale signals must always trigger a protective decision
 *   (HOLD, DEGRADE, or BLOCK_503 — never ALLOW).
 *
 * 200 iterations, seed=20260216
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — 7.1, 7.2, 7.3
 */

import * as fc from 'fast-check';
import { FixedClock } from '../guard-clock';
import { StaticGuardConfigProvider } from '../guard-config-provider';
import { InMemoryRiskSignalProvider, type RawSample } from '../risk-signal-provider';
import { GuardDecisionSnapshotFactory } from '../guard-decision-snapshot.factory';
import {
  GuardDecision,
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';

const NOW_MS = new Date('2026-02-16T10:00:00.000Z').getTime();

const SIGNAL_CONFIGS = {
  casConflictRate: DEFAULT_WINDOW_CONFIG,
  dbTimeoutRate: DEFAULT_WINDOW_CONFIG,
  clockSkewMs: { ...DEFAULT_WINDOW_CONFIG, aggregation: 'sum' as const },
};

function freshSamples(name: string, value: number, count = 10): RawSample[] {
  return Array.from({ length: count }, (_, i) => ({
    name, timestamp: NOW_MS - (count - i) * 5_000, value,
  }));
}

function staleSamples(name: string, value: number, count = 10): RawSample[] {
  return Array.from({ length: count }, (_, i) => ({
    name, timestamp: NOW_MS - 120_000 - i * 5_000, value,
  }));
}

const operationArb = fc.constantFrom<GuardOperation>(
  GuardOperation.PROMOTE,
  GuardOperation.EVALUATE,
  GuardOperation.ADMIN,
);

const tenantArb = fc.stringMatching(/^t[0-9]{1,3}$/);

/** Which signal(s) are stale — at least one must be stale */
const stalePatternArb = fc.constantFrom(
  'cas_stale',
  'db_stale',
  'clock_stale',
  'cas_db_stale',
  'all_stale',
) as fc.Arbitrary<string>;

/** Signal value — low (safe) values to ensure staleness is the trigger */
const signalValueArb = fc.double({ min: 0.001, max: 0.1, noNaN: true });

function buildSamples(
  pattern: string,
  value: number,
): RawSample[] {
  const fresh = (name: string) => freshSamples(name, value);
  const stale = (name: string) => staleSamples(name, value);

  switch (pattern) {
    case 'cas_stale':
      return [...stale('casConflictRate'), ...fresh('dbTimeoutRate'), ...fresh('clockSkewMs')];
    case 'db_stale':
      return [...fresh('casConflictRate'), ...stale('dbTimeoutRate'), ...fresh('clockSkewMs')];
    case 'clock_stale':
      return [...fresh('casConflictRate'), ...fresh('dbTimeoutRate'), ...stale('clockSkewMs')];
    case 'cas_db_stale':
      return [...stale('casConflictRate'), ...stale('dbTimeoutRate'), ...fresh('clockSkewMs')];
    case 'all_stale':
      return [...stale('casConflictRate'), ...stale('dbTimeoutRate'), ...stale('clockSkewMs')];
    default:
      return [...stale('casConflictRate'), ...fresh('dbTimeoutRate'), ...fresh('clockSkewMs')];
  }
}

describe('P6 PBT: Staleness fail-closed', () => {
  it('stale signal → resolver NEVER returns ALLOW', () => {
    fc.assert(
      fc.property(
        tenantArb,
        operationArb,
        stalePatternArb,
        signalValueArb,
        (tenantId, operation, pattern, value) => {
          const config: GuardConfig = {
            ...DEFAULT_GUARD_CONFIG,
            globalGuardMode: 'enforce',
          };
          const clock = new FixedClock(NOW_MS);
          const configProvider = new StaticGuardConfigProvider(config);
          const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
          signals.addSamples(tenantId, buildSamples(pattern, value));

          const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock);
          const snapshot = factory.createSnapshot(tenantId, operation);

          // Property: stale signal → NEVER ALLOW
          expect(snapshot.decision).not.toBe(GuardDecision.ALLOW);

          // Must be one of the protective decisions
          expect([
            GuardDecision.HOLD,
            GuardDecision.DEGRADE,
            GuardDecision.BLOCK_503,
          ]).toContain(snapshot.decision);

          // Reason codes should mention staleness or missing
          const hasStaleReason = snapshot.reasonCodes.some(
            (r) => r.includes('STALE') || r.includes('MISSING') || r.includes('INSUFFICIENT'),
          );
          expect(hasStaleReason).toBe(true);
        },
      ),
      { numRuns: 200, seed: 20260216 },
    );
  });
});
