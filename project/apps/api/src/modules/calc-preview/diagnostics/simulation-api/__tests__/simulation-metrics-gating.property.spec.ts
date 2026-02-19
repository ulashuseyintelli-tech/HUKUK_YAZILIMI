/**
 * Property 2: Metric Gating — Provider Error Ayrımı
 * Property 4: Structural Drift Gating
 *
 * Feature: i0-metrics-runway
 * Validates: Requirements 4.1, 4.2, 4.3
 *
 * fast-check invariants:
 * - DRIFT_PROVIDER_ERROR → drift_provider_errors_total increments, simulation_drift_total does NOT
 * - DRIFT:* prefix → simulation_drift_total increments, drift_provider_errors_total does NOT
 *
 * Deterministic: seed fixed, runtime bounded.
 */

import * as fc from 'fast-check';
import { Registry } from 'prom-client';
import { SimulationMetricsService } from '../simulation-metrics.service';

// Bounded label arbitraries (cardinality-safe)
const operationArb = fc.constantFrom('calcPreview', 'interestCalc', 'feeCalc', 'summary');
const guardModeArb = fc.constantFrom('shadow', 'enforce', 'disabled');
// DriftType enum values — SD-1 closed set (drift-guard.types.ts)
// Interceptor slices 'DRIFT:' prefix → service receives enum value directly
const driftTypeArb = fc.constantFrom(
  'CARRIER_WRITE',
  'CONFIG',
  'RULESET',
  'SCHEMA',
);

describe('Feature: i0-metrics-runway — Property 2: Metric Gating — Provider Error Ayrımı', () => {
  it('DRIFT_PROVIDER_ERROR should increment drift_provider_errors_total but NOT simulation_drift_total', async () => {
    await fc.assert(
      fc.asyncProperty(operationArb, guardModeArb, async (operation, guardMode) => {
        const registry = new Registry();
        const service = new SimulationMetricsService(registry);

        service.incDriftProviderError(operation, guardMode);

        // drift_provider_errors_total MUST have incremented
        const errorMetric = await registry.getSingleMetric('drift_provider_errors_total');
        const errorValues = (await errorMetric!.get()).values;
        expect(errorValues.length).toBeGreaterThan(0);
        expect(errorValues[0].value).toBe(1);

        // simulation_drift_total MUST NOT have incremented
        const driftMetric = await registry.getSingleMetric('simulation_drift_total');
        const driftValues = (await driftMetric!.get()).values;
        expect(driftValues).toHaveLength(0);
      }),
      { numRuns: 100, seed: 42 },
    );
  });
});

describe('Feature: i0-metrics-runway — Property 4: Structural Drift Gating', () => {
  it('DRIFT:* prefix should increment simulation_drift_total but NOT drift_provider_errors_total', async () => {
    await fc.assert(
      fc.asyncProperty(driftTypeArb, operationArb, guardModeArb, async (type, operation, guardMode) => {
        const registry = new Registry();
        const service = new SimulationMetricsService(registry);

        service.incSimulationDrift(type, operation, guardMode);

        // simulation_drift_total MUST have incremented
        const driftMetric = await registry.getSingleMetric('simulation_drift_total');
        const driftValues = (await driftMetric!.get()).values;
        expect(driftValues.length).toBeGreaterThan(0);
        expect(driftValues[0].value).toBe(1);

        // drift_provider_errors_total MUST NOT have incremented
        const errorMetric = await registry.getSingleMetric('drift_provider_errors_total');
        const errorValues = (await errorMetric!.get()).values;
        expect(errorValues).toHaveLength(0);
      }),
      { numRuns: 100, seed: 42 },
    );
  });
});


// ============================================================================
// Property 6: DriftType Label Whitelist Enforcement (A2)
// ============================================================================

/** Arbitrary that generates values OUTSIDE the DriftType enum */
const invalidDriftTypeArb = fc.constantFrom(
  'DRIFT:FIELD_MISMATCH',
  'DRIFT:AMOUNT_DELTA',
  'FIELD_MISMATCH',
  'AMOUNT_DELTA',
  'UNKNOWN_TYPE',
  'rate_divergence',
  '',
);

describe('Feature: i0-metrics-runway — Property 6: DriftType Label Whitelist Enforcement', () => {
  it('type ∉ DriftType enum → simulation_drift_total MUST NOT increment (runtime guard)', async () => {
    await fc.assert(
      fc.asyncProperty(invalidDriftTypeArb, operationArb, guardModeArb, async (type, operation, guardMode) => {
        const registry = new Registry();
        const service = new SimulationMetricsService(registry);

        // Call with invalid type — should be silently rejected
        service.incSimulationDrift(type, operation, guardMode);

        // simulation_drift_total MUST NOT have any values
        const driftMetric = await registry.getSingleMetric('simulation_drift_total');
        const driftValues = (await driftMetric!.get()).values;
        expect(driftValues).toHaveLength(0);
      }),
      { numRuns: 100, seed: 42 },
    );
  });

  it('type ∈ DriftType enum → simulation_drift_total MUST increment', async () => {
    await fc.assert(
      fc.asyncProperty(driftTypeArb, operationArb, guardModeArb, async (type, operation, guardMode) => {
        const registry = new Registry();
        const service = new SimulationMetricsService(registry);

        service.incSimulationDrift(type, operation, guardMode);

        const driftMetric = await registry.getSingleMetric('simulation_drift_total');
        const driftValues = (await driftMetric!.get()).values;
        expect(driftValues.length).toBeGreaterThan(0);
        expect(driftValues[0].value).toBe(1);
        // Verify the type label is exactly what was passed
        expect(driftValues[0].labels).toMatchObject({ type });
      }),
      { numRuns: 100, seed: 42 },
    );
  });
});
