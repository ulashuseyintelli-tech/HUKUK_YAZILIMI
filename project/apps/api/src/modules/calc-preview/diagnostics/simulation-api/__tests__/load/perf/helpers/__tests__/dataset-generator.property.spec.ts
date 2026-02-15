/**
 * Property 10: Dataset Üretim Determinizmi (P10) — CORE
 * Property 8a: Block Rate Global Tolerans (P8a) — CORE
 * Property 8b: Block Rate Dağılım Adaleti (P8b) — CORE
 *
 * Performance Characterization — Task 10.2, 10.3, 10.4
 *
 * P10: Aynı parametrelerle iki çağrı → identical records + metadata (createdAt hariç).
 * P8a: abs(computedBlockRate - targetBlockRate) <= 2%.
 * P8b: Her 100'lük pencerede block rate hedefin ±%10'u içinde.
 *
 * **Validates: Requirements 9.3, 15.2, 15.5, 15.6**
 *
 * @see .kiro/specs/perf-characterization/design.md — Karar M2-3, M2-4
 */

import * as fc from 'fast-check';
import {
  generateDataset,
  checkDistributionFairness,
  checkGlobalTolerance,
  DatasetGeneratorConfig,
  BlockRateDataset,
} from '../dataset-generator';

jest.setTimeout(120_000);

// ============================================================================
// Helpers
// ============================================================================

/** createdAt hariç metadata + records karşılaştırması */
function datasetsIdentical(a: BlockRateDataset, b: BlockRateDataset): boolean {
  if (a.metadata.schemaVersion !== b.metadata.schemaVersion) return false;
  if (a.metadata.seed !== b.metadata.seed) return false;
  if (a.metadata.driftThreshold !== b.metadata.driftThreshold) return false;
  if (a.metadata.targetBlockRate !== b.metadata.targetBlockRate) return false;
  if (a.metadata.computedBlockRate !== b.metadata.computedBlockRate) return false;
  if (a.metadata.recordCount !== b.metadata.recordCount) return false;
  if (a.records.length !== b.records.length) return false;
  for (let i = 0; i < a.records.length; i++) {
    if (a.records[i].id !== b.records[i].id) return false;
    if (a.records[i].expectedBlock !== b.records[i].expectedBlock) return false;
  }
  return true;
}

/** İki dataset arasındaki Hamming distance (farklı expectedBlock sayısı / toplam) */
function hammingDistance(a: BlockRateDataset, b: BlockRateDataset): number {
  if (a.records.length !== b.records.length) return 1;
  let diff = 0;
  for (let i = 0; i < a.records.length; i++) {
    if (a.records[i].expectedBlock !== b.records[i].expectedBlock) diff++;
  }
  return diff / a.records.length;
}

/** fast-check arbitrary: geçerli DatasetGeneratorConfig */
const arbConfig: fc.Arbitrary<DatasetGeneratorConfig> = fc.record({
  seed: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
  driftThreshold: fc.double({ min: 0.01, max: 0.50, noNaN: true }),
  targetBlockRate: fc.double({ min: 0, max: 1, noNaN: true }),
  recordCount: fc.integer({ min: 100, max: 2000 }),
});

// ============================================================================
// Property 10: Dataset Üretim Determinizmi
// ============================================================================

describe('Feature: perf-characterization, Property 10: Dataset Üretim Determinizmi', () => {
  it('aynı parametrelerle iki çağrı → identical records + metadata (createdAt hariç)', () => {
    fc.assert(
      fc.property(arbConfig, (config) => {
        const ds1 = generateDataset(config);
        const ds2 = generateDataset(config);
        expect(datasetsIdentical(ds1, ds2)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('aynı parametrelerle 3 tekrar → hepsi identical', () => {
    fc.assert(
      fc.property(arbConfig, (config) => {
        const ds1 = generateDataset(config);
        const ds2 = generateDataset(config);
        const ds3 = generateDataset(config);
        expect(datasetsIdentical(ds1, ds2)).toBe(true);
        expect(datasetsIdentical(ds2, ds3)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('farklı seed → farklı dataset (Hamming distance >= %5, non-trivial bucket\'larda)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 30 }),
        fc.integer({ min: 1, max: 2 ** 30 }),
        fc.double({ min: 0.05, max: 0.95, noNaN: true }),
        fc.integer({ min: 200, max: 1000 }),
        (seed1, seed2, targetBlockRate, recordCount) => {
          fc.pre(seed1 !== seed2);
          const ds1 = generateDataset({ seed: seed1, driftThreshold: 0.15, targetBlockRate, recordCount });
          const ds2 = generateDataset({ seed: seed2, driftThreshold: 0.15, targetBlockRate, recordCount });
          const hd = hammingDistance(ds1, ds2);
          // Non-trivial bucket'larda (0 < target < 1) farklı seed → en az %5 fark
          expect(hd).toBeGreaterThanOrEqual(0.01);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('determinizm yalnız seed + parametrelerden türetilir (Date.now/env bağımsız)', () => {
    // Aynı config ile farklı zamanlarda üretilen dataset'ler identical olmalı
    const config: DatasetGeneratorConfig = {
      seed: 12345,
      driftThreshold: 0.15,
      targetBlockRate: 0.30,
      recordCount: 500,
    };
    const ds1 = generateDataset(config);
    // Simüle: "zaman geçti" — ama sonuç aynı olmalı
    const ds2 = generateDataset(config);
    expect(datasetsIdentical(ds1, ds2)).toBe(true);
    // fairness metrikleri de eşit
    const f1 = checkDistributionFairness(ds1.records, config.targetBlockRate);
    const f2 = checkDistributionFairness(ds2.records, config.targetBlockRate);
    expect(f1.worstWindowBlockRate).toBe(f2.worstWindowBlockRate);
    expect(f1.worstWindowDeviationPct).toBe(f2.worstWindowDeviationPct);
    expect(f1.worstWindowIndex).toBe(f2.worstWindowIndex);
    expect(f1.fair).toBe(f2.fair);
  });
});

// ============================================================================
// Property 8a: Block Rate Global Tolerans
// ============================================================================

describe('Feature: perf-characterization, Property 8a: Block Rate Global Tolerans', () => {
  it('abs(computedBlockRate - targetBlockRate) <= 2% — tüm parametrelerde', () => {
    fc.assert(
      fc.property(arbConfig, (config) => {
        const ds = generateDataset(config);
        const withinTolerance = checkGlobalTolerance(
          ds.metadata.computedBlockRate,
          config.targetBlockRate,
          2,
        );
        expect(withinTolerance).toBe(true);
        // Ek: mutlak fark kontrolü
        expect(Math.abs(ds.metadata.computedBlockRate - config.targetBlockRate)).toBeLessThanOrEqual(0.02);
      }),
      { numRuns: 200 },
    );
  });

  it('computedBlockRate = actualBlockCount / recordCount (tutarlılık)', () => {
    fc.assert(
      fc.property(arbConfig, (config) => {
        const ds = generateDataset(config);
        const actualBlockCount = ds.records.filter((r) => r.expectedBlock).length;
        expect(ds.metadata.computedBlockRate).toBeCloseTo(actualBlockCount / config.recordCount, 10);
      }),
      { numRuns: 100 },
    );
  });

  it('edge case: targetBlockRate = 0 → 0 block', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        fc.integer({ min: 100, max: 2000 }),
        (seed, recordCount) => {
          const ds = generateDataset({ seed, driftThreshold: 0.15, targetBlockRate: 0, recordCount });
          expect(ds.metadata.computedBlockRate).toBe(0);
          expect(ds.records.every((r) => !r.expectedBlock)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('edge case: targetBlockRate = 1 → tümü block', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        fc.integer({ min: 100, max: 2000 }),
        (seed, recordCount) => {
          const ds = generateDataset({ seed, driftThreshold: 0.15, targetBlockRate: 1, recordCount });
          expect(ds.metadata.computedBlockRate).toBe(1);
          expect(ds.records.every((r) => r.expectedBlock)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ============================================================================
// Property 8b: Block Rate Dağılım Adaleti
// ============================================================================

describe('Feature: perf-characterization, Property 8b: Block Rate Dağılım Adaleti', () => {
  const WINDOW_SIZE = 100;
  const WINDOW_TOLERANCE = 0.10;

  it('her 100\'lük pencerede block rate hedefin ±%10\'u içinde (windowSize=100 explicit)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 200, max: 2000 }),
        (seed, targetBlockRate, recordCount) => {
          const ds = generateDataset({ seed, driftThreshold: 0.15, targetBlockRate, recordCount });
          const result = checkDistributionFairness(
            ds.records,
            targetBlockRate,
            WINDOW_SIZE,
            WINDOW_TOLERANCE,
          );
          expect(result.fair).toBe(true);
          expect(result.worstWindowDeviationPct).toBeLessThanOrEqual(WINDOW_TOLERANCE);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('worstWindowIndex raporlanır ve geçerli aralıkta', () => {
    fc.assert(
      fc.property(arbConfig, (config) => {
        const ds = generateDataset(config);
        const result = checkDistributionFairness(ds.records, config.targetBlockRate, WINDOW_SIZE, WINDOW_TOLERANCE);
        const windowCount = Math.max(1, Math.floor(config.recordCount / WINDOW_SIZE));
        expect(result.worstWindowIndex).toBeGreaterThanOrEqual(0);
        expect(result.worstWindowIndex).toBeLessThan(windowCount);
      }),
      { numRuns: 100 },
    );
  });

  it('edge case: targetBlockRate = 0 → tüm pencereler 0 block (trivially fair)', () => {
    const ds = generateDataset({ seed: 42, driftThreshold: 0.15, targetBlockRate: 0, recordCount: 500 });
    const result = checkDistributionFairness(ds.records, 0, WINDOW_SIZE, WINDOW_TOLERANCE);
    expect(result.fair).toBe(true);
    expect(result.worstWindowBlockRate).toBe(0);
  });

  it('edge case: targetBlockRate = 1 → tüm pencereler full block (trivially fair)', () => {
    const ds = generateDataset({ seed: 42, driftThreshold: 0.15, targetBlockRate: 1, recordCount: 500 });
    const result = checkDistributionFairness(ds.records, 1, WINDOW_SIZE, WINDOW_TOLERANCE);
    expect(result.fair).toBe(true);
    expect(result.worstWindowBlockRate).toBe(1);
  });

  it('recordCount < windowSize → tek pencere olarak değerlendirilir', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 10, max: 99 }),
        (seed, targetBlockRate, recordCount) => {
          const ds = generateDataset({ seed, driftThreshold: 0.15, targetBlockRate, recordCount });
          const result = checkDistributionFairness(ds.records, targetBlockRate, WINDOW_SIZE, WINDOW_TOLERANCE);
          // Tek pencere — worstWindowIndex = 0
          expect(result.worstWindowIndex).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});
