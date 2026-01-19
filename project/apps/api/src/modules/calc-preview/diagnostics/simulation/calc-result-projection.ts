/**
 * CalcResult Projection Utilities
 * 
 * Phase 9B.5 - Single Source of Truth
 * 
 * Projection functions to extract views from calcResult.
 * calcResult is the SINGLE SOURCE OF TRUTH for calculation data.
 * 
 * RULE: points[] is NOT stored separately - it's derived from calcResult.
 * This prevents drift between calcResult and points.
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { EvidencePoint, EvidenceMetricType } from '../diagnostics.types';

// ============================================================================
// Types
// ============================================================================

/**
 * CalcResult structure (what's stored in SimulationSnapshot.calcResult)
 * 
 * This can be:
 * - EvidenceSnapshot (legacy format with points[])
 * - SimulationOutput (full simulation output)
 * - Any other calculation result
 */
export interface CalcResultWithPoints {
  points?: EvidencePoint[];
  baselineSnapshot?: { points?: EvidencePoint[] };
  currentSnapshot?: { points?: EvidencePoint[] };
}

/**
 * Extracted points result
 */
export interface ExtractedPoints {
  /** Points extracted from calcResult (empty if not available) */
  points: EvidencePoint[];
  /** Source of extraction */
  source: 'direct' | 'baseline' | 'current' | 'none';
}

// ============================================================================
// Projection Functions
// ============================================================================

/**
 * Extract points from calcResult
 * 
 * This is the ONLY way to get points from a SimulationSnapshot.
 * Do NOT add points[] field to SimulationSnapshot interface.
 * 
 * Extraction priority:
 * 1. Direct points[] on calcResult
 * 2. currentSnapshot.points[] (for SimulationOutput)
 * 3. baselineSnapshot.points[] (fallback)
 * 4. Empty array (no points available)
 * 
 * @param calcResult The calcResult from SimulationSnapshot
 * @returns ExtractedPoints with points and source
 */
export function extractPoints(calcResult: unknown): ExtractedPoints {
  if (!calcResult || typeof calcResult !== 'object') {
    return { points: [], source: 'none' };
  }

  const result = calcResult as CalcResultWithPoints;

  // Priority 1: Direct points[]
  if (Array.isArray(result.points) && result.points.length > 0) {
    return {
      points: validateAndSortPoints(result.points),
      source: 'direct',
    };
  }

  // Priority 2: currentSnapshot.points[]
  if (result.currentSnapshot?.points && Array.isArray(result.currentSnapshot.points)) {
    return {
      points: validateAndSortPoints(result.currentSnapshot.points),
      source: 'current',
    };
  }

  // Priority 3: baselineSnapshot.points[]
  if (result.baselineSnapshot?.points && Array.isArray(result.baselineSnapshot.points)) {
    return {
      points: validateAndSortPoints(result.baselineSnapshot.points),
      source: 'baseline',
    };
  }

  // No points found
  return { points: [], source: 'none' };
}

/**
 * Extract points for baseline snapshot from calcResult
 * 
 * @param calcResult The calcResult from SimulationSnapshot
 * @returns EvidencePoint[] (empty if not available)
 */
export function extractBaselinePoints(calcResult: unknown): EvidencePoint[] {
  if (!calcResult || typeof calcResult !== 'object') {
    return [];
  }

  const result = calcResult as CalcResultWithPoints;

  // Direct points[] (if this IS the baseline)
  if (Array.isArray(result.points) && result.points.length > 0) {
    return validateAndSortPoints(result.points);
  }

  // baselineSnapshot.points[]
  if (result.baselineSnapshot?.points && Array.isArray(result.baselineSnapshot.points)) {
    return validateAndSortPoints(result.baselineSnapshot.points);
  }

  return [];
}

/**
 * Extract points for current snapshot from calcResult
 * 
 * @param calcResult The calcResult from SimulationSnapshot
 * @returns EvidencePoint[] (empty if not available)
 */
export function extractCurrentPoints(calcResult: unknown): EvidencePoint[] {
  if (!calcResult || typeof calcResult !== 'object') {
    return [];
  }

  const result = calcResult as CalcResultWithPoints;

  // Direct points[] (if this IS the current)
  if (Array.isArray(result.points) && result.points.length > 0) {
    return validateAndSortPoints(result.points);
  }

  // currentSnapshot.points[]
  if (result.currentSnapshot?.points && Array.isArray(result.currentSnapshot.points)) {
    return validateAndSortPoints(result.currentSnapshot.points);
  }

  return [];
}

/**
 * Get metric names from calcResult
 * 
 * Useful for drift explainability without full point extraction.
 * 
 * @param calcResult The calcResult from SimulationSnapshot
 * @returns Array of metric names
 */
export function extractMetricNames(calcResult: unknown): EvidenceMetricType[] {
  const { points } = extractPoints(calcResult);
  return points.map(p => p.metric);
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Validate and sort points for deterministic ordering
 */
function validateAndSortPoints(points: unknown[]): EvidencePoint[] {
  const validPoints: EvidencePoint[] = [];

  for (const point of points) {
    if (isValidEvidencePoint(point)) {
      validPoints.push(point);
    }
  }

  // Sort by metric name for deterministic ordering
  return validPoints.sort((a, b) => a.metric.localeCompare(b.metric));
}

/**
 * Type guard for EvidencePoint
 */
function isValidEvidencePoint(value: unknown): value is EvidencePoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const point = value as Record<string, unknown>;

  return (
    typeof point.metric === 'string' &&
    typeof point.value === 'number' &&
    typeof point.unit === 'string' &&
    typeof point.windowSec === 'number' &&
    typeof point.confidence === 'number' &&
    typeof point.freshnessSec === 'number' &&
    typeof point.source === 'string' &&
    typeof point.timestamp === 'string'
  );
}
