/**
 * Property 5: Warmup Stabilizasyon Tespiti
 *
 * Performance Characterization — Task 6.2 (CORE)
 *
 * For any latency pencere dizisi:
 * - WarmupValidator "stabil" kararı vermeli ancak ve ancak
 *   ardışık 3 pencerede p95 değişimi <%5 ve p99 değişimi <%8 olduğunda.
 * - Stabilizasyon sağlanamazsa warmup süresi 10 dk olarak raporlanmalıdır.
 *
 * **Validates: Requirements 5.2, 5.4**
 *
 * @see .kiro/specs/perf-characterization/design.md — Property 5
 */

import * as fc from 'fast-check';
import {
  WarmupValidator,
  LatencyWindow,
  WARMUP_CONSTANTS,
} from '../warmup-validator';

jest.setTimeout(120_000);

const { P95_THRESHOLD, P99_THRESHOLD, STABLE_WINDOWS_REQUIRED } = WARMUP_CONSTANTS;

/**
 * Referans implementasyon — property doğrulaması için bağımsız hesaplama.
 * WarmupValidator.checkStability ile aynı mantığı izler.
 */
function referenceCheckStability(windows: LatencyWindow[]): {
  isStable: boolean;
  stabilizedAtWindow: number | null;
} {
  if (windows.length < STABLE_WINDOWS_REQUIRED + 1) {
    return { isStable: false, stabilizedAtWindow: null };
  }

  for (let end = STABLE_WINDOWS_REQUIRED; end < windows.length; end++) {
    let allStable = true;
    for (let j = end - STABLE_WINDOWS_REQUIRED + 1; j <= end; j++) {
      const prev = windows[j - 1];
      const curr = windows[j];
      if (prev.p95Ms === 0 || prev.p99Ms === 0) {
        allStable = false;
        break;
      }
      const p95Change = Math.abs(curr.p95Ms - prev.p95Ms) / prev.p95Ms;
      const p99Change = Math.abs(curr.p99Ms - prev.p99Ms) / prev.p99Ms;
      if (p95Change >= P95_THRESHOLD || p99Change >= P99_THRESHOLD) {
        allStable = false;
        break;
      }
    }
    if (allStable) {
      return { isStable: true, stabilizedAtWindow: end };
    }
  }

  return { isStable: false, stabilizedAtWindow: null };
}

/** Latency pencere üreteci — pozitif, makul aralıkta */
const latencyWindowArb = (index: number): fc.Arbitrary<LatencyWindow> =>
  fc.record({
    p95Ms: fc.double({ min: 1, max: 1000, noNaN: true }),
    p99Ms: fc.double({ min: 1, max: 1500, noNaN: true }),
    windowIndex: fc.constant(index),
  });

/** N adet pencere dizisi üreteci */
const windowsArb = (minLen: number, maxLen: number): fc.Arbitrary<LatencyWindow[]> =>
  fc.integer({ min: minLen, max: maxLen }).chain((n) =>
    fc.tuple(...Array.from({ length: n }, (_, i) => latencyWindowArb(i))),
  );

describe('Feature: perf-characterization, Property 5: Warmup Stabilizasyon Tespiti', () => {
  it('checkStability sonucu referans implementasyon ile eşleşir', () => {
    fc.assert(
      fc.property(windowsArb(1, 25), (windows) => {
        const actual = WarmupValidator.checkStability(windows);
        const expected = referenceCheckStability(windows);
        expect(actual.isStable).toBe(expected.isStable);
        expect(actual.stabilizedAtWindow).toBe(expected.stabilizedAtWindow);
      }),
      { numRuns: 100 },
    );
  });

  it('stabil pencereler → isStable = true', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 50, max: 500, noNaN: true }),
        fc.double({ min: 50, max: 800, noNaN: true }),
        (baseP95, baseP99) => {
          // 4 pencere: hepsi birbirine çok yakın (<%1 değişim)
          const windows: LatencyWindow[] = Array.from({ length: 4 }, (_, i) => ({
            p95Ms: baseP95 * (1 + (i % 2 === 0 ? 0.001 : -0.001)),
            p99Ms: baseP99 * (1 + (i % 2 === 0 ? 0.001 : -0.001)),
            windowIndex: i,
          }));
          const result = WarmupValidator.checkStability(windows);
          expect(result.isStable).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('3 pencereden az → isStable = false (yetersiz veri)', () => {
    fc.assert(
      fc.property(windowsArb(1, 3), (windows) => {
        const result = WarmupValidator.checkStability(windows);
        expect(result.isStable).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('büyük p95 sıçraması olan pencereler → isStable = false', () => {
    // Her pencerede p95 %20 artıyor — kesinlikle stabil değil
    const windows: LatencyWindow[] = Array.from({ length: 6 }, (_, i) => ({
      p95Ms: 100 * Math.pow(1.2, i),
      p99Ms: 150, // p99 sabit
      windowIndex: i,
    }));
    const result = WarmupValidator.checkStability(windows);
    expect(result.isStable).toBe(false);
  });
});
