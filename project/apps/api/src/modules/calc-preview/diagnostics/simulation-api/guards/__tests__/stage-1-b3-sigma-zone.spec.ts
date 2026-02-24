/**
 * T-B3: σ-Zone Sınıflandırma Tests
 *
 * DoD:
 * - EWMA, µ±1σ / ±2σ / ±3σ / >3σ bölgelerine doğru düşüyor mu?
 * - Bölge değişiminde hysteresis kuralı doğru uygulanıyor mu (2 window üst üste)?
 * - Boundary değerlerinde off-by-one yok.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/baseline-plan.md — §6
 */

import {
  classifySigmaZone,
  classifyWithHysteresis,
  type SigmaZone,
} from '../baseline-math';

describe('T-B3: Sigma Zone Classification', () => {
  const baseline = 1.0;
  const sigma = 0.1;

  // ========================================================================
  // Basic Zone Classification
  // ========================================================================

  describe('Zone boundaries', () => {
    it('exact baseline → NORMAL', () => {
      expect(classifySigmaZone(1.0, baseline, sigma)).toBe('NORMAL');
    });

    it('within ±1σ → NORMAL', () => {
      expect(classifySigmaZone(1.05, baseline, sigma)).toBe('NORMAL');
      expect(classifySigmaZone(0.95, baseline, sigma)).toBe('NORMAL');
    });

    it('exactly at +1σ boundary → NORMAL (≤ 1σ) [integer sigma avoids float drift]', () => {
      // Use σ=1 to avoid IEEE 754 boundary issues with 0.1
      expect(classifySigmaZone(2.0, 1.0, 1.0)).toBe('NORMAL');
    });

    it('exactly at -1σ boundary → NORMAL (≤ 1σ) [integer sigma]', () => {
      expect(classifySigmaZone(0.0, 1.0, 1.0)).toBe('NORMAL');
    });

    it('just above +1σ → WARNING', () => {
      expect(classifySigmaZone(1.100001, baseline, sigma)).toBe('WARNING');
    });

    it('just below -1σ → WARNING', () => {
      expect(classifySigmaZone(0.899999, baseline, sigma)).toBe('WARNING');
    });

    it('within 1σ–2σ → WARNING', () => {
      expect(classifySigmaZone(1.15, baseline, sigma)).toBe('WARNING');
      expect(classifySigmaZone(0.85, baseline, sigma)).toBe('WARNING');
    });

    it('exactly at +2σ boundary → WARNING (≤ 2σ)', () => {
      expect(classifySigmaZone(1.2, baseline, sigma)).toBe('WARNING');
    });

    it('just above +2σ → ALERT', () => {
      expect(classifySigmaZone(1.200001, baseline, sigma)).toBe('ALERT');
    });

    it('within 2σ–3σ → ALERT', () => {
      expect(classifySigmaZone(1.25, baseline, sigma)).toBe('ALERT');
      expect(classifySigmaZone(0.75, baseline, sigma)).toBe('ALERT');
    });

    it('exactly at +3σ boundary → ALERT (≤ 3σ) [integer sigma]', () => {
      // Use σ=1 to avoid IEEE 754 boundary issues
      expect(classifySigmaZone(4.0, 1.0, 1.0)).toBe('ALERT');
    });

    it('just above +3σ → SPIKE', () => {
      expect(classifySigmaZone(1.300001, baseline, sigma)).toBe('SPIKE');
    });

    it('far above 3σ → SPIKE', () => {
      expect(classifySigmaZone(2.0, baseline, sigma)).toBe('SPIKE');
      expect(classifySigmaZone(0.0, baseline, sigma)).toBe('SPIKE');
    });
  });

  // ========================================================================
  // Symmetry (positive and negative deviations)
  // ========================================================================

  describe('Symmetry', () => {
    it('positive and negative deviations should classify identically', () => {
      // Use integer sigma to avoid IEEE 754 boundary asymmetry
      const intBaseline = 10;
      const intSigma = 1;
      const offsets = [0.5, 1.5, 2.5, 3.5];
      for (const offset of offsets) {
        const above = classifySigmaZone(intBaseline + offset, intBaseline, intSigma);
        const below = classifySigmaZone(intBaseline - offset, intBaseline, intSigma);
        expect(above).toBe(below);
      }
    });
  });

  // ========================================================================
  // Zero Sigma Edge Case
  // ========================================================================

  describe('Zero sigma', () => {
    it('exact match with zero sigma → NORMAL', () => {
      expect(classifySigmaZone(1.0, 1.0, 0)).toBe('NORMAL');
    });

    it('any deviation with zero sigma → SPIKE', () => {
      expect(classifySigmaZone(1.001, 1.0, 0)).toBe('SPIKE');
      expect(classifySigmaZone(0.999, 1.0, 0)).toBe('SPIKE');
    });
  });

  // ========================================================================
  // Off-by-One Boundary Tests
  // ========================================================================

  describe('Off-by-one boundary precision', () => {
    const precisionSigma = 1.0; // σ=1 for easy boundary math

    it('value = baseline + 1.0000000 × σ → NORMAL (≤ 1σ)', () => {
      expect(classifySigmaZone(1.0, 0.0, precisionSigma)).toBe('NORMAL');
    });

    it('value = baseline + 2.0000000 × σ → WARNING (≤ 2σ)', () => {
      expect(classifySigmaZone(2.0, 0.0, precisionSigma)).toBe('WARNING');
    });

    it('value = baseline + 3.0000000 × σ → ALERT (≤ 3σ)', () => {
      expect(classifySigmaZone(3.0, 0.0, precisionSigma)).toBe('ALERT');
    });

    it('value = baseline + 3.0000001 × σ → SPIKE (> 3σ)', () => {
      expect(classifySigmaZone(3.0000001, 0.0, precisionSigma)).toBe('SPIKE');
    });
  });

  // ========================================================================
  // Hysteresis — Zone Transition Requires Consecutive Windows
  // ========================================================================

  describe('Hysteresis classification', () => {
    it('empty history → NORMAL (default)', () => {
      expect(classifyWithHysteresis([], 2)).toBe('NORMAL');
    });

    it('single entry (below required consecutive) → returns that entry', () => {
      expect(classifyWithHysteresis(['WARNING'], 2)).toBe('WARNING');
    });

    it('2 consecutive WARNING with required=2 → WARNING', () => {
      expect(classifyWithHysteresis(['NORMAL', 'WARNING', 'WARNING'], 2)).toBe('WARNING');
    });

    it('1 WARNING then NORMAL (not consecutive) → falls back', () => {
      const history: SigmaZone[] = ['NORMAL', 'NORMAL', 'WARNING', 'NORMAL'];
      const result = classifyWithHysteresis(history, 2);
      // Latest is NORMAL with only 1 consecutive → check previous stable
      // NORMAL had 2 consecutive before → NORMAL
      expect(result).toBe('NORMAL');
    });

    it('3 consecutive ALERT with required=2 → ALERT', () => {
      const history: SigmaZone[] = ['NORMAL', 'ALERT', 'ALERT', 'ALERT'];
      expect(classifyWithHysteresis(history, 2)).toBe('ALERT');
    });

    it('alternating zones should not transition (flapping prevention)', () => {
      const history: SigmaZone[] = ['NORMAL', 'WARNING', 'NORMAL', 'WARNING', 'NORMAL'];
      // Latest is NORMAL with 1 consecutive → not enough
      // Previous NORMAL had 1 consecutive → not enough
      // Falls back to NORMAL (default)
      const result = classifyWithHysteresis(history, 2);
      expect(result).toBe('NORMAL');
    });

    it('required=1 should always return latest zone', () => {
      expect(classifyWithHysteresis(['NORMAL', 'SPIKE'], 1)).toBe('SPIKE');
      expect(classifyWithHysteresis(['SPIKE', 'NORMAL'], 1)).toBe('NORMAL');
    });

    it('long stable period followed by brief spike → stays stable', () => {
      const history: SigmaZone[] = [
        ...Array.from({ length: 10 }, (): SigmaZone => 'NORMAL'),
        'SPIKE',
      ];
      // SPIKE has only 1 consecutive, required=2 → not enough
      // Previous NORMAL had 10 consecutive → NORMAL
      const result = classifyWithHysteresis(history, 2);
      expect(result).toBe('NORMAL');
    });

    it('sustained zone change should eventually transition', () => {
      const history: SigmaZone[] = [
        ...Array.from({ length: 5 }, (): SigmaZone => 'NORMAL'),
        ...Array.from({ length: 3 }, (): SigmaZone => 'ALERT'),
      ];
      expect(classifyWithHysteresis(history, 2)).toBe('ALERT');
      expect(classifyWithHysteresis(history, 3)).toBe('ALERT');
    });
  });

  // ========================================================================
  // Zone Ordering (severity)
  // ========================================================================

  describe('Zone severity ordering', () => {
    const zones: SigmaZone[] = ['NORMAL', 'WARNING', 'ALERT', 'SPIKE'];

    it('increasing deviation should produce non-decreasing severity', () => {
      const deviations = [0, 0.5, 1.5, 2.5, 3.5];
      const results = deviations.map(d => classifySigmaZone(baseline + d * sigma, baseline, sigma));

      for (let i = 1; i < results.length; i++) {
        const prevIdx = zones.indexOf(results[i - 1]);
        const currIdx = zones.indexOf(results[i]);
        expect(currIdx).toBeGreaterThanOrEqual(prevIdx);
      }
    });
  });
});
