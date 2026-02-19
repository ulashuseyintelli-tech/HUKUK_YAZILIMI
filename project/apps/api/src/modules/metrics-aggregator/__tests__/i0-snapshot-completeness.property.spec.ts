/**
 * Property 7: I0 Snapshot Completeness
 *
 * Feature: i0-metrics-runway
 * Validates: Requirements 2.2, 7.1, 7.2
 *
 * Invariant: After any synthetic traffic sequence (varying number of
 * drift events, provider errors, and HTTP requests), the /metrics output
 * MUST contain all I0 metric declarations (HELP + TYPE) and correct
 * data lines for every metric that was incremented.
 *
 * This property test uses fast-check to generate random traffic patterns
 * and verifies the snapshot is always complete.
 *
 * Deterministic: seed=42, 100 runs.
 *
 * @see .kiro/specs/i0-metrics-runway/tasks.md — Task 12.B.2
 */

import * as fc from 'fast-check';
import { Registry } from 'prom-client';
import { SimulationMetricsService } from '../../calc-preview/diagnostics/simulation-api/simulation-metrics.service';

// DriftType enum values (SD-1 closed set)
const driftTypeArb = fc.constantFrom('CARRIER_WRITE', 'CONFIG', 'RULESET', 'SCHEMA');
const operationArb = fc.constantFrom('calcPreview', 'interestCalc', 'feeCalc');
const guardModeArb = fc.constantFrom('shadow', 'enforce');

// Traffic pattern: random mix of drift events and provider errors
const trafficPatternArb = fc.record({
  driftCount: fc.integer({ min: 0, max: 5 }),
  providerErrorCount: fc.integer({ min: 0, max: 3 }),
  killSwitchActive: fc.boolean(),
});

describe('Feature: i0-metrics-runway — Property 7: I0 Snapshot Completeness', () => {
  it('after any traffic pattern, /metrics MUST contain all I0 HELP/TYPE declarations', async () => {
    await fc.assert(
      fc.asyncProperty(
        trafficPatternArb,
        driftTypeArb,
        operationArb,
        guardModeArb,
        async (traffic, driftType, operation, guardMode) => {
          const registry = new Registry();
          const service = new SimulationMetricsService(registry);

          // Generate traffic
          for (let i = 0; i < traffic.driftCount; i++) {
            service.incSimulationDrift(driftType, operation, guardMode);
          }
          for (let i = 0; i < traffic.providerErrorCount; i++) {
            service.incDriftProviderError(operation, guardMode);
          }
          service.setKillSwitchState('tenant-test', operation, traffic.killSwitchActive);

          // Capture snapshot
          const snapshot = await registry.metrics();

          // INVARIANT 1: All I0 metrics MUST have HELP + TYPE declarations
          const requiredMetrics = [
            { name: 'simulation_drift_total', type: 'counter' },
            { name: 'drift_provider_errors_total', type: 'counter' },
            { name: 'kill_switch_state', type: 'gauge' },
          ];

          for (const metric of requiredMetrics) {
            expect(snapshot).toContain(`# HELP ${metric.name}`);
            expect(snapshot).toContain(`# TYPE ${metric.name} ${metric.type}`);
          }

          // INVARIANT 2: If drift events were generated, data lines MUST exist
          if (traffic.driftCount > 0) {
            expect(snapshot).toMatch(
              new RegExp(`simulation_drift_total\\{type="${driftType}".*\\}\\s+${traffic.driftCount}`),
            );
          }

          // INVARIANT 3: If provider errors were generated, data lines MUST exist
          if (traffic.providerErrorCount > 0) {
            expect(snapshot).toMatch(
              new RegExp(`drift_provider_errors_total\\{.*\\}\\s+${traffic.providerErrorCount}`),
            );
          }

          // INVARIANT 4: kill_switch_state always has a data line (set was called)
          const expectedValue = traffic.killSwitchActive ? 1 : 0;
          expect(snapshot).toMatch(
            new RegExp(`kill_switch_state\\{.*\\}\\s+${expectedValue}`),
          );

          // INVARIANT 5: Gating isolation — drift events don't leak into provider errors
          if (traffic.driftCount > 0 && traffic.providerErrorCount === 0) {
            const providerLines = snapshot.split('\n').filter(
              l => l.startsWith('drift_provider_errors_total{'),
            );
            expect(providerLines).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });
});
