/**
 * SD-3 D3 Task 2 — RealAdaptiveControlInputMapper Tests
 *
 * Dual testing: unit tests + property-based tests.
 *
 * Deliverables:
 *   1. Mapper input source clarity (all fields required)
 *   2. sigma=0 test result
 *   3. complianceWindowSize "signal source controls" compliance (test)
 *   4. Fail-open fallback (P6)
 *   5. Object.freeze immutability (P9)
 *   6. Golden test: same signals → same ControlInput
 *
 * @see .kiro/specs/sd-3-adaptive-transition/design.md — B2, P6, P9
 * @see .kiro/specs/sd-3-adaptive-transition/requirements.md — R1, R6, R8
 */

import * as fc from 'fast-check';
import { RealAdaptiveControlInputMapper, FallbackField } from '../adaptive-real-input-mapper';
import type { AdaptiveSignalSource, RealMapperConfig } from '../adaptive-real-input-mapper';
import { ProviderHealthZone } from '../adaptive-controller.types';

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_CONFIG: RealMapperConfig = {
  complianceThreshold: 0.95,
  providerHealth: {
    providerDegradedThreshold: 0.05,
    providerOutageThreshold: 0.20,
  },
};

const NORMAL_SIGNALS: AdaptiveSignalSource = {
  currentValue: 100,
  baselineEwma: 100,
  baselineSigma: 10,
  windowValues: [98, 99, 100, 101, 102],
  providerErrorRate: 0.01,
};

function createMapper(
  overrides: {
    killSwitch?: boolean;
    signals?: AdaptiveSignalSource;
    config?: RealMapperConfig;
    onFallback?: (field: FallbackField) => void;
  } = {},
): RealAdaptiveControlInputMapper {
  return new RealAdaptiveControlInputMapper(
    () => overrides.killSwitch ?? false,
    () => overrides.signals ?? NORMAL_SIGNALS,
    overrides.config ?? DEFAULT_CONFIG,
    overrides.onFallback ?? (() => {}),
  );
}

// ============================================================================
// Unit Tests — Normal Path
// ============================================================================

describe('RealAdaptiveControlInputMapper — Unit Tests', () => {
  describe('normal path', () => {
    it('produces correct ControlInput from normal signals', () => {
      const mapper = createMapper();
      const input = mapper.buildInput();

      expect(input.sigmaZone).toBe('NORMAL');
      expect(input.complianceVerdict).toBe(true);
      expect(input.providerHealthZone).toBe(ProviderHealthZone.OK);
      expect(input.killSwitchActive).toBe(false);
      expect(typeof input.nowMs).toBe('number');
    });

    it('golden test: same signals → same ControlInput (except nowMs)', () => {
      const mapper = createMapper();
      const input1 = mapper.buildInput();
      const input2 = mapper.buildInput();

      expect(input1.sigmaZone).toBe(input2.sigmaZone);
      expect(input1.complianceVerdict).toBe(input2.complianceVerdict);
      expect(input1.providerHealthZone).toBe(input2.providerHealthZone);
      expect(input1.killSwitchActive).toBe(input2.killSwitchActive);
    });

    it('killSwitch=true propagates to ControlInput', () => {
      const mapper = createMapper({ killSwitch: true });
      expect(mapper.buildInput().killSwitchActive).toBe(true);
    });
  });

  describe('sigma=0 edge case', () => {
    it('sigma=0, currentValue === baselineEwma → NORMAL', () => {
      const signals: AdaptiveSignalSource = {
        ...NORMAL_SIGNALS,
        currentValue: 100,
        baselineEwma: 100,
        baselineSigma: 0,
      };
      const mapper = createMapper({ signals });
      expect(mapper.buildInput().sigmaZone).toBe('NORMAL');
    });

    it('sigma=0, currentValue !== baselineEwma → SPIKE', () => {
      const signals: AdaptiveSignalSource = {
        ...NORMAL_SIGNALS,
        currentValue: 101,
        baselineEwma: 100,
        baselineSigma: 0,
      };
      const mapper = createMapper({ signals });
      expect(mapper.buildInput().sigmaZone).toBe('SPIKE');
    });
  });

  describe('compliance window — signal source controls size', () => {
    it('empty windowValues → compliant=false (evaluateCompliance returns false for empty)', () => {
      const signals: AdaptiveSignalSource = {
        ...NORMAL_SIGNALS,
        windowValues: [],
      };
      const mapper = createMapper({ signals });
      // evaluateCompliance returns { compliant: false } for empty window
      expect(mapper.buildInput().complianceVerdict).toBe(false);
    });

    it('large windowValues array — mapper does not truncate', () => {
      const largeWindow = Array.from({ length: 1000 }, (_, i) => 100 + (i % 3));
      const signals: AdaptiveSignalSource = {
        ...NORMAL_SIGNALS,
        windowValues: largeWindow,
      };
      const mapper = createMapper({ signals });
      const input = mapper.buildInput();
      // All values within 2σ of baseline → compliant
      expect(input.complianceVerdict).toBe(true);
    });

    it('windowValues with outliers → non-compliant', () => {
      // All values far outside 2σ band
      const signals: AdaptiveSignalSource = {
        ...NORMAL_SIGNALS,
        baselineEwma: 100,
        baselineSigma: 1,
        windowValues: [200, 300, 400, 500, 600],
      };
      const mapper = createMapper({ signals });
      expect(mapper.buildInput().complianceVerdict).toBe(false);
    });
  });

  describe('provider health classification', () => {
    it('low error rate → OK', () => {
      const mapper = createMapper({
        signals: { ...NORMAL_SIGNALS, providerErrorRate: 0.01 },
      });
      expect(mapper.buildInput().providerHealthZone).toBe(ProviderHealthZone.OK);
    });

    it('mid error rate → DEGRADED', () => {
      const mapper = createMapper({
        signals: { ...NORMAL_SIGNALS, providerErrorRate: 0.10 },
      });
      expect(mapper.buildInput().providerHealthZone).toBe(ProviderHealthZone.DEGRADED);
    });

    it('high error rate → OUTAGE', () => {
      const mapper = createMapper({
        signals: { ...NORMAL_SIGNALS, providerErrorRate: 0.50 },
      });
      expect(mapper.buildInput().providerHealthZone).toBe(ProviderHealthZone.OUTAGE);
    });
  });
});


// ============================================================================
// Unit Tests — Fallback Paths
// ============================================================================

describe('RealAdaptiveControlInputMapper — Fallback Paths', () => {
  it('classifySigmaZone throws → fallback NORMAL + onFallback called', () => {
    const fallbacks: FallbackField[] = [];
    // sigma = NaN will cause classifySigmaZone to produce NaN comparisons
    // but won't throw. We need to mock the module to force a throw.
    // Instead, use a signal source that throws during property access.
    const throwingSource: AdaptiveSignalSource = {
      get currentValue(): number { throw new Error('signal error'); },
      baselineEwma: 100,
      baselineSigma: 10,
      windowValues: [100],
      providerErrorRate: 0.01,
    };

    const mapper = new RealAdaptiveControlInputMapper(
      () => false,
      () => throwingSource,
      DEFAULT_CONFIG,
      (field) => fallbacks.push(field),
    );

    const input = mapper.buildInput();
    expect(input.sigmaZone).toBe('NORMAL');
    expect(fallbacks).toContain('sigmaZone');
    // Other fields should still work
    expect(input.providerHealthZone).toBe(ProviderHealthZone.OK);
  });

  it('evaluateCompliance throws → fallback true + onFallback called', () => {
    const fallbacks: FallbackField[] = [];
    const throwingSource: AdaptiveSignalSource = {
      currentValue: 100,
      baselineEwma: 100,
      baselineSigma: 10,
      get windowValues(): readonly number[] { throw new Error('window error'); },
      providerErrorRate: 0.01,
    };

    const mapper = new RealAdaptiveControlInputMapper(
      () => false,
      () => throwingSource,
      DEFAULT_CONFIG,
      (field) => fallbacks.push(field),
    );

    const input = mapper.buildInput();
    expect(input.complianceVerdict).toBe(true);
    expect(fallbacks).toContain('complianceVerdict');
    // sigmaZone should still work (currentValue is fine)
    expect(input.sigmaZone).toBe('NORMAL');
  });

  it('classifyProviderHealth throws → fallback OK + onFallback called', () => {
    const fallbacks: FallbackField[] = [];
    const throwingSource: AdaptiveSignalSource = {
      currentValue: 100,
      baselineEwma: 100,
      baselineSigma: 10,
      windowValues: [100],
      get providerErrorRate(): number { throw new Error('provider error'); },
    };

    const mapper = new RealAdaptiveControlInputMapper(
      () => false,
      () => throwingSource,
      DEFAULT_CONFIG,
      (field) => fallbacks.push(field),
    );

    const input = mapper.buildInput();
    expect(input.providerHealthZone).toBe(ProviderHealthZone.OK);
    expect(fallbacks).toContain('providerHealthZone');
  });

  it('all fields throw → stub-equivalent output + all 3 fallbacks', () => {
    const fallbacks: FallbackField[] = [];
    const allThrowingSource: AdaptiveSignalSource = {
      get currentValue(): number { throw new Error('cv'); },
      get baselineEwma(): number { throw new Error('ewma'); },
      get baselineSigma(): number { throw new Error('sigma'); },
      get windowValues(): readonly number[] { throw new Error('window'); },
      get providerErrorRate(): number { throw new Error('provider'); },
    };

    const mapper = new RealAdaptiveControlInputMapper(
      () => false,
      () => allThrowingSource,
      DEFAULT_CONFIG,
      (field) => fallbacks.push(field),
    );

    const input = mapper.buildInput();
    expect(input.sigmaZone).toBe('NORMAL');
    expect(input.complianceVerdict).toBe(true);
    expect(input.providerHealthZone).toBe(ProviderHealthZone.OK);
    expect(fallbacks).toEqual(['sigmaZone', 'complianceVerdict', 'providerHealthZone']);
  });

  it('field isolation: one field error does not affect others', () => {
    const fallbacks: FallbackField[] = [];
    // Only providerErrorRate throws
    const partialThrowSource: AdaptiveSignalSource = {
      currentValue: 120,
      baselineEwma: 100,
      baselineSigma: 10,
      windowValues: [98, 99, 100, 101, 102],
      get providerErrorRate(): number { throw new Error('provider'); },
    };

    const mapper = new RealAdaptiveControlInputMapper(
      () => false,
      () => partialThrowSource,
      DEFAULT_CONFIG,
      (field) => fallbacks.push(field),
    );

    const input = mapper.buildInput();
    // sigmaZone should reflect real calculation (120 is 2σ from 100)
    expect(input.sigmaZone).toBe('WARNING');
    expect(input.complianceVerdict).toBe(true);
    // Only providerHealthZone falls back
    expect(input.providerHealthZone).toBe(ProviderHealthZone.OK);
    expect(fallbacks).toEqual(['providerHealthZone']);
  });
});


// ============================================================================
// Property-Based Tests — P6: Fail-Open Fallback
// ============================================================================

describe('Feature: sd-3-adaptive-transition, Property 6: Fail-Open Fallback', () => {
  /**
   * P6: FOR ALL exception scenarios, RealAdaptiveControlInputMapper
   * falls back to stub-equivalent values (NORMAL/true/OK) and calls
   * onFallback with the correct field label.
   */

  // Arbitrary: which fields should throw
  const throwMask = fc.record({
    currentValue: fc.boolean(),
    windowValues: fc.boolean(),
    providerErrorRate: fc.boolean(),
  });

  it('any combination of field errors → fallback values are stub-equivalent', () => {
    fc.assert(
      fc.property(throwMask, (mask) => {
        const fallbacks: FallbackField[] = [];

        const source: AdaptiveSignalSource = {
          get currentValue(): number {
            if (mask.currentValue) throw new Error('cv');
            return 100;
          },
          baselineEwma: 100,
          baselineSigma: 10,
          get windowValues(): readonly number[] {
            if (mask.windowValues) throw new Error('wv');
            return [98, 99, 100, 101, 102];
          },
          get providerErrorRate(): number {
            if (mask.providerErrorRate) throw new Error('pe');
            return 0.01;
          },
        };

        const mapper = new RealAdaptiveControlInputMapper(
          () => false,
          () => source,
          DEFAULT_CONFIG,
          (field) => fallbacks.push(field),
        );

        const input = mapper.buildInput();

        // Fallback fields should have stub-equivalent values
        if (mask.currentValue) {
          expect(input.sigmaZone).toBe('NORMAL');
          expect(fallbacks).toContain('sigmaZone');
        }
        if (mask.windowValues) {
          expect(input.complianceVerdict).toBe(true);
          expect(fallbacks).toContain('complianceVerdict');
        }
        if (mask.providerErrorRate) {
          expect(input.providerHealthZone).toBe(ProviderHealthZone.OK);
          expect(fallbacks).toContain('providerHealthZone');
        }

        // Non-throwing fields should NOT trigger fallback
        const throwCount = [mask.currentValue, mask.windowValues, mask.providerErrorRate]
          .filter(Boolean).length;
        expect(fallbacks.length).toBe(throwCount);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property-Based Tests — P9: ControlInput Immutability
// ============================================================================

describe('Feature: sd-3-adaptive-transition, Property 9: ControlInput Immutability', () => {
  /**
   * P9: FOR ALL buildInput() calls, the returned ControlInput is frozen.
   */

  const signalArb = fc.record({
    currentValue: fc.double({ min: 0, max: 1000, noNaN: true }),
    baselineEwma: fc.double({ min: 0, max: 1000, noNaN: true }),
    baselineSigma: fc.double({ min: 0, max: 100, noNaN: true }),
    windowValues: fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 0, maxLength: 20 }),
    providerErrorRate: fc.double({ min: -1, max: 2, noNaN: true }),
  });

  it('buildInput() always returns a frozen object', () => {
    fc.assert(
      fc.property(signalArb, (signals) => {
        const mapper = new RealAdaptiveControlInputMapper(
          () => false,
          () => signals,
          DEFAULT_CONFIG,
          () => {},
        );

        const input = mapper.buildInput();
        expect(Object.isFrozen(input)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('frozen object rejects mutation attempts', () => {
    const mapper = createMapper();
    const input = mapper.buildInput();

    expect(() => {
      (input as any).sigmaZone = 'SPIKE';
    }).toThrow();
  });
});
