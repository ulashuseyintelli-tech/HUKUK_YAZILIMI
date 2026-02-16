/**
 * S1 PBT — Shadow Mode Zero Enforcement
 *
 * Guard Canary Rollout — Task 5.1
 *
 * Property:
 *   For any decision (BLOCK_503/HOLD/DEGRADE/ALLOW) + guardMode='shadow',
 *   next.handle() is ALWAYS called and HttpException is NEVER thrown.
 *
 * 200 iterations, seed=20260216
 *
 * @see .kiro/specs/guard-canary-rollout/requirements.md — 4.1, 4.2
 */

import * as fc from 'fast-check';
import { of } from 'rxjs';
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
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';
import { InMemoryGuardTelemetry } from '../guard-telemetry';

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

function mockContext(tenantId: string, operation?: string): any {
  const headers: Record<string, string> = { 'x-tenant-id': tenantId };
  if (operation) headers['x-guard-operation'] = operation;
  const request: Record<string, unknown> = { headers };
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

function mockNext() {
  return { handle: jest.fn(() => of('pipeline-result')) };
}

// Arbitrary: config scenario that produces different decisions
const scenarioArb = fc.constantFrom(
  'allow',        // fresh signals, no kill-switch, no degrade
  'block_503',    // kill-switch active
  'hold_insuf',   // no samples → insufficient
  'hold_stale',   // stale + evaluate → HOLD
  'hold_degrade', // degrade + promote → HOLD
  'degrade',      // stale + promote → DEGRADE
) as fc.Arbitrary<string>;

const operationArb = fc.constantFrom<GuardOperation>(
  GuardOperation.PROMOTE,
  GuardOperation.EVALUATE,
  GuardOperation.ADMIN,
);

const tenantArb = fc.stringMatching(/^t[0-9]{1,3}$/);

function buildScenario(scenario: string, tenantId: string, operation: GuardOperation) {
  let config: GuardConfig;
  let samples: RawSample[] = [];

  const allFresh = [
    ...freshSamples('casConflictRate', 0.01),
    ...freshSamples('dbTimeoutRate', 0.01),
    ...freshSamples('clockSkewMs', 10),
  ];

  switch (scenario) {
    case 'allow':
      config = { ...DEFAULT_GUARD_CONFIG, globalGuardMode: 'shadow' };
      samples = allFresh;
      break;
    case 'block_503':
      config = {
        ...DEFAULT_GUARD_CONFIG,
        globalGuardMode: 'shadow',
        tenantOverrides: { [tenantId]: { killSwitchActive: true } },
      };
      samples = allFresh;
      break;
    case 'hold_insuf':
      config = { ...DEFAULT_GUARD_CONFIG, globalGuardMode: 'shadow' };
      samples = []; // no samples → insufficient → HOLD
      break;
    case 'hold_stale':
      config = { ...DEFAULT_GUARD_CONFIG, globalGuardMode: 'shadow' };
      samples = [
        ...staleSamples('casConflictRate', 0.01),
        ...staleSamples('dbTimeoutRate', 0.01),
        ...staleSamples('clockSkewMs', 10),
      ];
      break;
    case 'hold_degrade':
      config = {
        ...DEFAULT_GUARD_CONFIG,
        globalGuardMode: 'shadow',
        tenantOverrides: { [tenantId]: { degradeModeActive: true } },
      };
      samples = allFresh;
      break;
    case 'degrade':
    default:
      config = { ...DEFAULT_GUARD_CONFIG, globalGuardMode: 'shadow' };
      samples = [
        ...staleSamples('casConflictRate', 0.01),
        ...freshSamples('dbTimeoutRate', 0.01),
        ...freshSamples('clockSkewMs', 10),
      ];
      break;
  }

  return { config, samples };
}

describe('S1 PBT: Shadow mode zero enforcement', () => {
  it('shadow mode: next.handle() ALWAYS called, HttpException NEVER thrown', () => {
    fc.assert(
      fc.property(
        scenarioArb,
        tenantArb,
        operationArb,
        (scenario, tenantId, operation) => {
          const { config, samples } = buildScenario(scenario, tenantId, operation);
          const tel = new InMemoryGuardTelemetry();
          const clock = new FixedClock(NOW_MS);
          const configProvider = new StaticGuardConfigProvider(config);
          const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
          if (samples.length > 0) signals.addSamples(tenantId, samples);

          const factory = new GuardDecisionSnapshotFactory(configProvider, signals, clock);
          const interceptor = new GuardInterceptor(
            factory,
            new DefaultOperationResolver(),
            new DefaultTenantResolver(),
            tel,
          );

          const ctx = mockContext(tenantId, operation);
          const next = mockNext();

          // Shadow mode: NEVER throws
          let threw = false;
          try {
            interceptor.intercept(ctx, next);
          } catch (err) {
            if (err instanceof HttpException) threw = true;
          }

          // Property 1: HttpException NEVER thrown in shadow mode
          expect(threw).toBe(false);

          // Property 2: next.handle() ALWAYS called
          expect(next.handle).toHaveBeenCalledTimes(1);

          // Property 3: telemetry emitted (shadow = full compute)
          expect(tel.events).toHaveLength(1);
          expect(tel.events[0].guardMode).toBe('shadow');
        },
      ),
      { numRuns: 200, seed: 20260216 },
    );
  });
});
