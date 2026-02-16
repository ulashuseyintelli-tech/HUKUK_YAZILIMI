/**
 * P4 PBT — Degrade Allowlist Enforcement
 *
 * Guard Canary Rollout — Task 5.3
 *
 * Property:
 *   For any DEGRADE mode + operation:
 *     - allowlisted operation → DEGRADE (pass-through)
 *     - non-allowlisted operation → HOLD (blocked)
 *
 * 200 iterations, seed=20260216
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — 5.1, 5.3, 5.4
 */

import * as fc from 'fast-check';
import { FixedClock } from '../guard-clock';
import { StaticGuardConfigProvider } from '../guard-config-provider';
import { InMemoryRiskSignalProvider, type RawSample } from '../risk-signal-provider';
import { GuardDecisionSnapshotFactory } from '../guard-decision-snapshot.factory';
import {
  GuardDecision,
  GuardOperation,
  DegradeAllowedOp,
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

const ALL_FRESH: RawSample[] = [
  ...freshSamples('casConflictRate', 0.01),
  ...freshSamples('dbTimeoutRate', 0.01),
  ...freshSamples('clockSkewMs', 10),
];

const operationArb = fc.constantFrom<GuardOperation>(
  GuardOperation.PROMOTE,
  GuardOperation.EVALUATE,
  GuardOperation.ADMIN,
);

const tenantArb = fc.stringMatching(/^t[0-9]{1,3}$/);

/** Allowlist subset — arbitrary combination of DegradeAllowedOp */
const allowlistArb = fc.subarray([
  DegradeAllowedOp.ADMIN_READ,
  DegradeAllowedOp.HEALTH_CHECK,
  DegradeAllowedOp.METRICS_SCRAPE,
]);

/**
 * Determine if an operation is allowed given the allowlist.
 * Mirrors isDegradeAllowed logic:
 *   ADMIN → allowed if ADMIN_READ in allowlist
 *   PROMOTE/EVALUATE → never allowed
 */
function isAllowed(op: GuardOperation, allowlist: DegradeAllowedOp[]): boolean {
  if (op === GuardOperation.ADMIN) {
    return allowlist.includes(DegradeAllowedOp.ADMIN_READ);
  }
  return false; // PROMOTE/EVALUATE never allowed in degrade
}

describe('P4 PBT: Degrade allowlist enforcement', () => {
  it('degrade mode: allowlisted → ALLOW (DEGRADE_ALLOWED), non-allowlisted → HOLD', () => {
    fc.assert(
      fc.property(
        tenantArb,
        operationArb,
        allowlistArb,
        (tenantId, operation, allowlist) => {
          const config: GuardConfig = {
            ...DEFAULT_GUARD_CONFIG,
            globalGuardMode: 'enforce',
            tenantOverrides: {
              [tenantId]: {
                degradeModeActive: true,
                allowedOpsInDegradeMode: allowlist,
              },
            },
          };

          const clock = new FixedClock(NOW_MS);
          const configProvider = new StaticGuardConfigProvider(config);
          const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
          signals.addSamples(tenantId, ALL_FRESH);

          const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock);
          const snapshot = factory.createSnapshot(tenantId, operation);

          if (isAllowed(operation, allowlist)) {
            // Allowlisted → ALLOW with DEGRADE_ALLOWED mode
            expect(snapshot.decision).toBe(GuardDecision.ALLOW);
            expect(snapshot.mode).toBe('DEGRADE_ALLOWED');
          } else {
            // Non-allowlisted → HOLD with DEGRADE_FORCED_HOLD mode
            expect(snapshot.decision).toBe(GuardDecision.HOLD);
            expect(snapshot.mode).toBe('DEGRADE_FORCED_HOLD');
          }

          // Reason codes should include DEGRADE_MODE_ACTIVE
          expect(snapshot.reasonCodes).toContain('DEGRADE_MODE_ACTIVE');
        },
      ),
      { numRuns: 200, seed: 20260216 },
    );
  });
});
