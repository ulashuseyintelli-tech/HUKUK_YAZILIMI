/**
 * Dataset Generator — M2 Block-Rate Controlled Runs
 *
 * Stripe-based block placement + bounded jitter ile deterministik dataset üretimi.
 * P8a (global ±%2 tolerans) ve P8b (dağılım adaleti — pencere bazında ±%10) garantisi sağlar.
 *
 * @see .kiro/specs/perf-characterization/design.md — Karar M2-4
 * @see Requirements 15.1, 15.2, 15.3, 15.5, 15.6
 */

// ============================================================================
// PRNG — mulberry32 (simulated-measure.ts ile aynı)
// ============================================================================

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Types
// ============================================================================

export interface DatasetGeneratorConfig {
  seed: number;
  driftThreshold: number;
  targetBlockRate: number;
  recordCount: number;
}

export interface DatasetRecord {
  id: string;
  expectedBlock: boolean;
}

export interface DatasetMetadata {
  schemaVersion: string;
  seed: number;
  driftThreshold: number;
  targetBlockRate: number;
  computedBlockRate: number;
  recordCount: number;
  createdAt: string;
}

export interface BlockRateDataset {
  metadata: DatasetMetadata;
  records: DatasetRecord[];
}

// ============================================================================
// Distribution Fairness Check (P8b)
// ============================================================================

export interface DistributionFairnessResult {
  fair: boolean;
  worstWindowBlockRate: number;
  worstWindowDeviationPct: number;
  /** Hangi pencere en kötü sapmayı gösterdi (0-indexed) */
  worstWindowIndex: number;
}

/**
 * Her `windowSize`'lık pencerede block rate'in hedefin ±toleranceAbsolute içinde
 * olup olmadığını kontrol eder.
 *
 * Özel durumlar:
 * - targetBlockRate === 0: tüm pencereler 0 block olmalı (trivially passes)
 * - targetBlockRate === 1: tüm pencereler full block olmalı (trivially passes)
 * - recordCount < windowSize: tek pencere olarak değerlendirilir
 */
export function checkDistributionFairness(
  records: DatasetRecord[],
  targetBlockRate: number,
  windowSize: number = 100,
  toleranceAbsolute: number = 0.10,
): DistributionFairnessResult {
  const n = records.length;
  if (n === 0) {
    return { fair: true, worstWindowBlockRate: 0, worstWindowDeviationPct: 0, worstWindowIndex: -1 };
  }

  const lowerBound = Math.max(0, targetBlockRate - toleranceAbsolute);
  const upperBound = Math.min(1, targetBlockRate + toleranceAbsolute);

  let worstDeviation = 0;
  let worstRate = targetBlockRate;
  let worstIdx = 0;
  let fair = true;

  // Tam pencereler üzerinde iterasyon (kalan < windowSize atlanır)
  const windowCount = Math.max(1, Math.floor(n / windowSize));
  const effectiveWindowSize = n < windowSize ? n : windowSize;

  for (let w = 0; w < windowCount; w++) {
    const start = w * effectiveWindowSize;
    const end = Math.min(start + effectiveWindowSize, n);
    const wSize = end - start;

    let blockCount = 0;
    for (let i = start; i < end; i++) {
      if (records[i].expectedBlock) blockCount++;
    }

    const windowRate = blockCount / wSize;
    const deviation = Math.abs(windowRate - targetBlockRate);

    if (deviation > worstDeviation) {
      worstDeviation = deviation;
      worstRate = windowRate;
      worstIdx = w;
    }

    if (windowRate < lowerBound || windowRate > upperBound) {
      fair = false;
    }
  }

  return {
    fair,
    worstWindowBlockRate: worstRate,
    worstWindowDeviationPct: worstDeviation,
    worstWindowIndex: worstIdx,
  };
}

// ============================================================================
// Global Tolerance Check (P8a)
// ============================================================================

/**
 * abs(computedBlockRate - targetBlockRate) <= tolerancePercent / 100
 */
export function checkGlobalTolerance(
  computedBlockRate: number,
  targetBlockRate: number,
  tolerancePercent: number = 2,
): boolean {
  return Math.abs(computedBlockRate - targetBlockRate) <= tolerancePercent / 100;
}

// ============================================================================
// Dataset Generator — Stripe-based placement + bounded jitter
// ============================================================================

/**
 * Deterministik dataset üretir.
 *
 * Algoritma (Karar M2-4):
 * 1. blockCount = round(recordCount × targetBlockRate)
 * 2. Stripe placement: her block pozisyonu = floor(i × stride) + jitter
 *    - stride = recordCount / blockCount
 *    - jitter = floor((rng() - 0.5) × stride × 0.5)  → ±%25 kayma
 * 3. Collision handling: jitter sonrası çakışan pozisyonlar varsa, boş slotlardan doldur
 * 4. Record üretimi: blockPositions set'ine göre expectedBlock atanır
 */
export function generateDataset(config: DatasetGeneratorConfig): BlockRateDataset {
  const { seed, driftThreshold, targetBlockRate, recordCount } = config;
  const rng = mulberry32(seed);

  const blockCount = Math.round(recordCount * targetBlockRate);
  const blockPositions = new Set<number>();

  if (blockCount > 0 && blockCount < recordCount) {
    const stride = recordCount / blockCount;

    // Stripe placement with bounded jitter
    for (let i = 0; i < blockCount; i++) {
      const basePos = Math.floor(i * stride);
      const jitter = Math.floor((rng() - 0.5) * stride * 0.5);
      const pos = Math.max(0, Math.min(recordCount - 1, basePos + jitter));
      blockPositions.add(pos);
    }

    // Collision fill: eksik block'ları dağıtılmış şekilde doldur
    // Baştan doldurmak yerine boş slotları topla ve eşit aralıklarla seç
    const missing = blockCount - blockPositions.size;
    if (missing > 0) {
      const emptySlots: number[] = [];
      for (let i = 0; i < recordCount; i++) {
        if (!blockPositions.has(i)) emptySlots.push(i);
      }
      // Boş slotlardan eşit aralıklarla seç (dağılım adaletini koru)
      const fillStride = emptySlots.length / missing;
      for (let i = 0; i < missing; i++) {
        const idx = Math.min(Math.floor(i * fillStride), emptySlots.length - 1);
        blockPositions.add(emptySlots[idx]);
      }
    }
  } else if (blockCount >= recordCount) {
    // %100 veya üzeri — tümü block
    for (let i = 0; i < recordCount; i++) blockPositions.add(i);
  }
  // blockCount === 0 → hiçbir pozisyon block değil

  // Record'ları üret
  const records: DatasetRecord[] = new Array(recordCount);
  for (let i = 0; i < recordCount; i++) {
    records[i] = {
      id: `perf_${seed}_${i}`,
      expectedBlock: blockPositions.has(i),
    };
  }

  const computedBlockRate = blockPositions.size / recordCount;

  return {
    metadata: {
      schemaVersion: '1.0',
      seed,
      driftThreshold,
      targetBlockRate,
      computedBlockRate,
      recordCount,
      createdAt: new Date().toISOString(),
    },
    records,
  };
}
