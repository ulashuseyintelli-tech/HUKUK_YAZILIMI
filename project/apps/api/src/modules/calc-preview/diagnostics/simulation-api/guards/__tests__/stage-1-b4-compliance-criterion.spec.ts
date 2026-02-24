/**
 * T-B4: Compliance Criterion — "Baseline ile Uyumlu" Formal Tanımı
 *
 * DoD:
 * - Window sayısı nasıl hesaplanıyor? (24h'de 288 window = 5dk interval)
 * - CI içinde sayma deterministic mi?
 * - Pass/fail eşiklerinde net.
 *
 * Definition: P(current_ewma ∈ [baseline_ewma - 2σ, baseline_ewma + 2σ]) ≥ 0.95
 * over trailing 24h evaluation windows.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/baseline-plan.md — §5
 */

import {
  evaluateCompliance,
  WINDOWS_PER_24H,
  SCRAPE_INTERVAL_MINUTES,
  type ComplianceResult,
} from '../baseline-math';

describe('T-B4: Compliance Criterion', () => {
  const baselineEwma = 1.0;
  const baselineSigma = 0.1;
  // CI bounds: [0.8, 1.2]

  // ========================================================================
  // Window Count Calculation
  // ========================================================================

  describe('Window count calculation', () => {
    it('24h at 5-minute intervals = 288 windows', () => {
      expect(WINDOWS_PER_24H).toBe(288);
    });

    it('scrape interval is 5 minutes', () => {
      expect(SCRAPE_INTERVAL_MINUTES).toBe(5);
    });

    it('288 windows × 5 minutes = 1440 minutes = 24 hours', () => {
      expect(WINDOWS_PER_24H * SCRAPE_INTERVAL_MINUTES).toBe(24 * 60);
    });
  });

  // ========================================================================
  // Full Compliance (all windows within CI)
  // ========================================================================

  describe('Full compliance', () => {
    it('all 288 windows within CI → compliant', () => {
      const values = Array.from({ length: 288 }, () => 1.0);
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.compliant).toBe(true);
      expect(result.windowsInCI).toBe(288);
      expect(result.totalWindows).toBe(288);
      expect(result.ratio).toBe(1.0);
    });

    it('all windows at lower CI bound → compliant', () => {
      const values = Array.from({ length: 288 }, () => 0.8); // baseline - 2σ
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.compliant).toBe(true);
    });

    it('all windows at upper CI bound → compliant', () => {
      const values = Array.from({ length: 288 }, () => 1.2); // baseline + 2σ
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.compliant).toBe(true);
    });
  });

  // ========================================================================
  // Threshold Boundary (95%)
  // ========================================================================

  describe('95% threshold boundary', () => {
    it('exactly 95% within CI → compliant', () => {
      // 288 × 0.95 = 273.6 → need 274 windows in CI (ceil)
      // Actually: 274/288 = 0.9514 ≥ 0.95 → compliant
      const inCI = 274;
      const outCI = 288 - inCI; // 14
      const values = [
        ...Array.from({ length: inCI }, () => 1.0),
        ...Array.from({ length: outCI }, () => 2.0), // outside CI
      ];
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.ratio).toBeCloseTo(274 / 288, 4);
      expect(result.compliant).toBe(true);
    });

    it('just below 95% → not compliant', () => {
      // 273/288 = 0.9479 < 0.95
      const inCI = 273;
      const outCI = 288 - inCI; // 15
      const values = [
        ...Array.from({ length: inCI }, () => 1.0),
        ...Array.from({ length: outCI }, () => 2.0),
      ];
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.ratio).toBeLessThan(0.95);
      expect(result.compliant).toBe(false);
    });

    it('≤ 14 windows outside CI is acceptable (288 - 274 = 14)', () => {
      const values = [
        ...Array.from({ length: 274 }, () => 1.0),
        ...Array.from({ length: 14 }, () => 5.0),
      ];
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.compliant).toBe(true);
    });

    it('15 windows outside CI is NOT acceptable', () => {
      const values = [
        ...Array.from({ length: 273 }, () => 1.0),
        ...Array.from({ length: 15 }, () => 5.0),
      ];
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.compliant).toBe(false);
    });
  });

  // ========================================================================
  // CI Bound Precision
  // ========================================================================

  describe('CI bound precision', () => {
    it('value exactly at lower bound (baseline - 2σ) → inside CI', () => {
      const values = [baselineEwma - 2 * baselineSigma]; // 0.8
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.windowsInCI).toBe(1);
    });

    it('value exactly at upper bound (baseline + 2σ) → inside CI', () => {
      const values = [baselineEwma + 2 * baselineSigma]; // 1.2
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.windowsInCI).toBe(1);
    });

    it('value just below lower bound → outside CI', () => {
      const values = [baselineEwma - 2 * baselineSigma - 0.000001];
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.windowsInCI).toBe(0);
    });

    it('value just above upper bound → outside CI', () => {
      const values = [baselineEwma + 2 * baselineSigma + 0.000001];
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.windowsInCI).toBe(0);
    });
  });

  // ========================================================================
  // Edge Cases
  // ========================================================================

  describe('Edge cases', () => {
    it('empty window values → not compliant', () => {
      const result = evaluateCompliance([], baselineEwma, baselineSigma);
      expect(result.compliant).toBe(false);
      expect(result.totalWindows).toBe(0);
      expect(result.ratio).toBe(0);
    });

    it('single window within CI → compliant (1/1 = 100%)', () => {
      const result = evaluateCompliance([1.0], baselineEwma, baselineSigma);
      expect(result.compliant).toBe(true);
      expect(result.ratio).toBe(1.0);
    });

    it('single window outside CI → not compliant (0/1 = 0%)', () => {
      const result = evaluateCompliance([5.0], baselineEwma, baselineSigma);
      expect(result.compliant).toBe(false);
      expect(result.ratio).toBe(0);
    });

    it('zero sigma → only exact baseline value is within CI', () => {
      const values = [1.0, 1.0, 1.001];
      const result = evaluateCompliance(values, 1.0, 0);
      // CI = [1.0, 1.0] → only exact matches
      expect(result.windowsInCI).toBe(2);
    });

    it('very large sigma → everything is within CI', () => {
      const values = [0, 100, -50, 1000];
      const result = evaluateCompliance(values, 1.0, 10000);
      expect(result.windowsInCI).toBe(4);
      expect(result.compliant).toBe(true);
    });
  });

  // ========================================================================
  // Custom Threshold
  // ========================================================================

  describe('Custom threshold', () => {
    it('threshold=0.99 requires 99% windows in CI', () => {
      const values = [
        ...Array.from({ length: 285 }, () => 1.0),
        ...Array.from({ length: 3 }, () => 5.0),
      ];
      // 285/288 = 0.9896 < 0.99
      const result = evaluateCompliance(values, baselineEwma, baselineSigma, 0.99);
      expect(result.compliant).toBe(false);
    });

    it('threshold=0.90 is more lenient', () => {
      const values = [
        ...Array.from({ length: 260 }, () => 1.0),
        ...Array.from({ length: 28 }, () => 5.0),
      ];
      // 260/288 = 0.9028 ≥ 0.90
      const result = evaluateCompliance(values, baselineEwma, baselineSigma, 0.90);
      expect(result.compliant).toBe(true);
    });

    it('default threshold is 0.95', () => {
      const values = Array.from({ length: 288 }, () => 1.0);
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.threshold).toBe(0.95);
    });
  });

  // ========================================================================
  // Determinism
  // ========================================================================

  describe('Determinism', () => {
    it('same input → same output', () => {
      const values = [1.0, 1.1, 0.9, 1.05, 0.95, 1.5, 0.5];
      const r1 = evaluateCompliance(values, baselineEwma, baselineSigma);
      const r2 = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(r1.compliant).toBe(r2.compliant);
      expect(r1.windowsInCI).toBe(r2.windowsInCI);
      expect(r1.ratio).toBe(r2.ratio);
    });
  });

  // ========================================================================
  // Result Metadata
  // ========================================================================

  describe('Result metadata', () => {
    it('should include all required fields', () => {
      const values = Array.from({ length: 10 }, () => 1.0);
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result).toHaveProperty('compliant');
      expect(result).toHaveProperty('windowsInCI');
      expect(result).toHaveProperty('totalWindows');
      expect(result).toHaveProperty('ratio');
      expect(result).toHaveProperty('threshold');
    });

    it('ratio should equal windowsInCI / totalWindows', () => {
      const values = [1.0, 1.0, 5.0]; // 2 in CI, 1 out
      const result = evaluateCompliance(values, baselineEwma, baselineSigma);
      expect(result.ratio).toBeCloseTo(result.windowsInCI / result.totalWindows, 10);
    });
  });
});
