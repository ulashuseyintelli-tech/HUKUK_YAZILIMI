/**
 * Snapshot Comparison Utils - Drift Score
 * 
 * Phase 8 - Sprint 2B (Refactored)
 * 
 * SINGLE SOURCE OF TRUTH for drift calculation.
 * Calculates drift between two evidence snapshots.
 * Used by promote flow to detect if conditions changed significantly.
 * 
 * Formula:
 *   For each common metric:
 *     rel = abs(new - old) / max(eps, abs(old))
 *     weighted = rel * weight
 *   driftScore = sqrt(sum(weighted^2) / sum(weight^2))
 * 
 * Determinism guarantees:
 * - topContributors sorted: weightedContribution DESC, metric ASC (tie-break)
 * - commonMetrics, missingInBaseline, missingInCurrent: sorted ASC
 * - NaN/Infinity protection via Number.isFinite checks
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { EvidenceSnapshot, EvidenceMetricType } from '../diagnostics.types';

/**
 * Drift weights per metric type
 * Higher weight = more impact on drift score
 */
export const DRIFT_WEIGHTS: Record<EvidenceMetricType, number> = {
  error_rate: 2.0,
  slo_burn_rate: 2.0,
  latency_p99: 1.0,
  latency_p95: 1.0,
  saturation_cpu: 0.5,
  queue_depth: 0.5,
};

/**
 * Drift threshold for blocking promote
 * driftScore >= DRIFT_THRESHOLD → block
 */
export const DRIFT_THRESHOLD = 0.15;

/**
 * Epsilon for division (prevents divide by zero)
 * Fixed constant for determinism
 */
const EPS = 1e-9;

/**
 * Per-metric drift detail with full explainability
 */
export interface MetricDrift {
  metric: EvidenceMetricType;
  baselineValue: number;
  currentValue: number;
  relativeDrift: number;        // abs(new-old)/max(eps, old)
  weightedContribution: number; // relativeDrift * weight
  weight: number;
}

/**
 * Drift comparison result - SINGLE SOURCE OF TRUTH
 * Engine should use this directly without re-processing
 */
export interface DriftResult {
  /** Calculated drift score (0 to 1+) */
  driftScore: number;
  
  /** Whether drift exceeds threshold (>= DRIFT_THRESHOLD) */
  shouldBlock: boolean;
  
  /** Flag for no comparable metrics */
  noComparableMetrics: boolean;
  
  /** Metrics present in both snapshots (sorted ASC) */
  commonMetrics: EvidenceMetricType[];
  
  /** Metrics in current but not in baseline (sorted ASC) */
  missingInBaseline: EvidenceMetricType[];
  
  /** Metrics in baseline but not in current (sorted ASC) */
  missingInCurrent: EvidenceMetricType[];
  
  /** 
   * Per-metric drift details with explainability
   * Sorted: weightedContribution DESC, metric ASC (tie-break)
   */
  topContributors: MetricDrift[];
}

/**
 * Calculate drift between two snapshots
 * 
 * SINGLE SOURCE OF TRUTH - Engine should use this directly
 * 
 * @param baseline - Original snapshot (e.g., from simulation)
 * @param current - Fresh snapshot (e.g., at promote time)
 * @returns DriftResult with score, explainability, and all details
 */
export function calculateDrift(
  baseline: EvidenceSnapshot,
  current: EvidenceSnapshot,
): DriftResult {
  // Build metric maps
  const baselineMetrics = new Map<EvidenceMetricType, number>();
  const currentMetrics = new Map<EvidenceMetricType, number>();

  for (const point of baseline.points) {
    baselineMetrics.set(point.metric, point.value);
  }

  for (const point of current.points) {
    currentMetrics.set(point.metric, point.value);
  }

  // Find common and missing metrics
  const allMetrics = new Set<EvidenceMetricType>([
    ...baselineMetrics.keys(),
    ...currentMetrics.keys(),
  ]);

  const commonMetrics: EvidenceMetricType[] = [];
  const missingInBaseline: EvidenceMetricType[] = [];
  const missingInCurrent: EvidenceMetricType[] = [];

  for (const metric of allMetrics) {
    const inBaseline = baselineMetrics.has(metric);
    const inCurrent = currentMetrics.has(metric);
    
    if (inBaseline && inCurrent) {
      commonMetrics.push(metric);
    } else if (inCurrent && !inBaseline) {
      missingInBaseline.push(metric);
    } else if (inBaseline && !inCurrent) {
      missingInCurrent.push(metric);
    }
  }

  // Sort for determinism (ASC)
  commonMetrics.sort();
  missingInBaseline.sort();
  missingInCurrent.sort();

  // Edge case: no common metrics
  if (commonMetrics.length === 0) {
    return {
      driftScore: 1.0, // Max drift
      shouldBlock: true,
      noComparableMetrics: true,
      commonMetrics: [],
      missingInBaseline,
      missingInCurrent,
      topContributors: [], // No contributors when no common metrics
    };
  }

  // Calculate drift for each common metric
  const topContributors: MetricDrift[] = [];
  let sumWeightedSquared = 0;
  let sumWeightSquared = 0;

  for (const metric of commonMetrics) {
    const baselineValue = baselineMetrics.get(metric)!;
    const currentValue = currentMetrics.get(metric)!;
    const weight = DRIFT_WEIGHTS[metric] ?? 1.0;

    // Relative drift: abs(new - old) / max(eps, abs(old))
    const relativeDrift = Math.abs(currentValue - baselineValue) / Math.max(EPS, Math.abs(baselineValue));
    
    // Weighted contribution with NaN/Infinity protection
    let weightedContribution = relativeDrift * weight;
    if (!Number.isFinite(weightedContribution)) {
      weightedContribution = 0; // Protect hash stability
    }

    topContributors.push({
      metric,
      baselineValue,
      currentValue,
      relativeDrift: Number.isFinite(relativeDrift) ? relativeDrift : 0,
      weightedContribution,
      weight,
    });

    sumWeightedSquared += weightedContribution * weightedContribution;
    sumWeightSquared += weight * weight;
  }

  // Sort topContributors: weightedContribution DESC, metric ASC (tie-break)
  topContributors.sort((a, b) => {
    const diff = b.weightedContribution - a.weightedContribution;
    if (diff !== 0) return diff;
    return a.metric.localeCompare(b.metric); // Deterministic tie-break
  });

  // driftScore = sqrt(sum(weighted^2) / sum(weight^2))
  let driftScore = Math.sqrt(sumWeightedSquared / sumWeightSquared);
  if (!Number.isFinite(driftScore)) {
    driftScore = 1.0; // Protect against edge cases
  }

  return {
    driftScore,
    shouldBlock: driftScore >= DRIFT_THRESHOLD,
    noComparableMetrics: false,
    commonMetrics,
    missingInBaseline,
    missingInCurrent,
    topContributors,
  };
}

/**
 * Check if drift blocks promote
 * 
 * @param driftResult - Result from calculateDrift
 * @returns true if promote should be blocked
 */
export function shouldBlockPromote(driftResult: DriftResult): boolean {
  return driftResult.shouldBlock || driftResult.noComparableMetrics;
}

/**
 * Create drift summary for API response
 */
export function createDriftSummary(driftResult: DriftResult): {
  driftScore: number;
  blocked: boolean;
  reason?: string;
  suggestion?: string;
  topContributors?: Array<{ metric: string; contribution: number }>;
} {
  if (driftResult.noComparableMetrics) {
    return {
      driftScore: driftResult.driftScore,
      blocked: true,
      reason: 'NO_COMPARABLE_METRICS',
      suggestion: 'RESIMULATE',
    };
  }

  if (driftResult.shouldBlock) {
    return {
      driftScore: driftResult.driftScore,
      blocked: true,
      reason: 'DRIFT_TOO_HIGH',
      suggestion: 'RESIMULATE',
      topContributors: driftResult.topContributors.slice(0, 3).map(c => ({
        metric: c.metric,
        contribution: c.weightedContribution,
      })),
    };
  }

  return {
    driftScore: driftResult.driftScore,
    blocked: false,
  };
}

/**
 * Round drift score for deterministic comparison
 * Use this when hashing or comparing drift scores
 */
export function roundDriftScore(score: number, precision: number = 6): number {
  const factor = Math.pow(10, precision);
  return Math.round(score * factor) / factor;
}
