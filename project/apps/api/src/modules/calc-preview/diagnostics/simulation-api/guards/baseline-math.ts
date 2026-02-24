/**
 * Baseline Math Module — EWMA, σ-zone classification, window validity, compliance criterion
 *
 * Pure, deterministic functions for Stage-1 baseline computation.
 * No Date.now(), no randomness, no side effects.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/baseline-plan.md
 */

// ============================================================================
// Constants
// ============================================================================

/** Default EWMA smoothing factor (α=0.1 → effective window ~20 data points) */
export const DEFAULT_ALPHA = 0.1;

/** Scrape interval in minutes (Prometheus default) */
export const SCRAPE_INTERVAL_MINUTES = 5;

/** Evaluation windows in 24h at 5-minute intervals */
export const WINDOWS_PER_24H = (24 * 60) / SCRAPE_INTERVAL_MINUTES; // 288

/** Minimum data points for a valid baseline window */
export const MIN_DATA_POINTS = 100;

/** High-volume tenant threshold (promotes/day) */
export const HIGH_VOLUME_THRESHOLD = 500;

/** Low-volume tenant threshold (promotes/day) */
export const LOW_VOLUME_THRESHOLD = 50;

// ============================================================================
// Types
// ============================================================================

export interface EwmaResult {
  readonly value: number;
  readonly sigma: number;
  readonly sampleCount: number;
}

export type SigmaZone = 'NORMAL' | 'WARNING' | 'ALERT' | 'SPIKE';

export type WindowInvalidReason =
  | 'INFRA_INCIDENT'
  | 'CONFIG_CHANGE'
  | 'KILL_SWITCH_ACTIVATION'
  | 'INSUFFICIENT_DATA'
  | 'SCRAPE_GAP';

export interface WindowValidityResult {
  readonly valid: boolean;
  readonly reason: WindowInvalidReason | null;
  readonly dataPoints: number;
  readonly requiredMinimumHours: number;
  readonly actualHours: number;
}

export interface ComplianceResult {
  readonly compliant: boolean;
  readonly windowsInCI: number;
  readonly totalWindows: number;
  readonly ratio: number;
  readonly threshold: number;
}

export type TenantVolumeClass = 'HIGH' | 'LOW' | 'MEDIUM';

export type SegmentationPhase = 'GLOBAL' | 'PER_TENANT' | 'CANARY_ONLY';

export interface TenantSegmentationResult {
  readonly phase: SegmentationPhase;
  readonly tenantId: string;
  readonly volumeClass: TenantVolumeClass;
  readonly isOutlier: boolean;
  readonly deviationSigma: number;
}

// ============================================================================
// EWMA Computation (T-B1)
// ============================================================================

/**
 * Compute EWMA over a series of values.
 * Deterministic: same input → same output.
 *
 * @param values - Ordered time series values
 * @param alpha - Smoothing factor (0 < α ≤ 1). Default 0.1
 * @returns EWMA value and standard deviation (σ)
 */
export function computeEwma(values: readonly number[], alpha: number = DEFAULT_ALPHA): EwmaResult {
  if (values.length === 0) {
    return { value: 0, sigma: 0, sampleCount: 0 };
  }

  if (values.length === 1) {
    return { value: values[0], sigma: 0, sampleCount: 1 };
  }

  // Initialize EWMA with first value
  let ewma = values[0];

  // Collect all EWMA values for σ computation
  const ewmaValues: number[] = [ewma];

  for (let i = 1; i < values.length; i++) {
    ewma = alpha * values[i] + (1 - alpha) * ewma;
    ewmaValues.push(ewma);
  }

  // Compute σ (standard deviation of residuals: actual - ewma)
  const residuals = values.map((v, i) => v - ewmaValues[i]);
  const meanResidual = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const variance = residuals.reduce((sum, r) => sum + (r - meanResidual) ** 2, 0) / residuals.length;
  const sigma = Math.sqrt(variance);

  return { value: ewma, sigma, sampleCount: values.length };
}

// ============================================================================
// σ-Zone Classification (T-B3)
// ============================================================================

/**
 * Classify a value into a sigma zone relative to EWMA baseline.
 *
 * NORMAL:  |deviation| ≤ 1σ
 * WARNING: 1σ < |deviation| ≤ 2σ
 * ALERT:   2σ < |deviation| ≤ 3σ
 * SPIKE:   |deviation| > 3σ
 */
export function classifySigmaZone(
  currentValue: number,
  baselineEwma: number,
  sigma: number,
): SigmaZone {
  if (sigma === 0) {
    // Zero variance: any deviation is a spike, exact match is normal
    return currentValue === baselineEwma ? 'NORMAL' : 'SPIKE';
  }

  const deviation = Math.abs(currentValue - baselineEwma);
  const sigmaMultiple = deviation / sigma;

  if (sigmaMultiple <= 1) return 'NORMAL';
  if (sigmaMultiple <= 2) return 'WARNING';
  if (sigmaMultiple <= 3) return 'ALERT';
  return 'SPIKE';
}

/**
 * Classify with hysteresis: require N consecutive windows in a zone
 * before transitioning. Prevents flapping between zones.
 *
 * @param zoneHistory - Recent zone classifications (newest last)
 * @param requiredConsecutive - Number of consecutive windows required
 * @returns Stable zone (last confirmed zone that met the consecutive requirement)
 */
export function classifyWithHysteresis(
  zoneHistory: readonly SigmaZone[],
  requiredConsecutive: number,
): SigmaZone {
  if (zoneHistory.length === 0) return 'NORMAL';
  if (zoneHistory.length < requiredConsecutive) return zoneHistory[zoneHistory.length - 1];

  // Check from the end: find the latest zone that has N consecutive occurrences
  const latest = zoneHistory[zoneHistory.length - 1];
  let consecutiveCount = 0;

  for (let i = zoneHistory.length - 1; i >= 0; i--) {
    if (zoneHistory[i] === latest) {
      consecutiveCount++;
      if (consecutiveCount >= requiredConsecutive) return latest;
    } else {
      break;
    }
  }

  // Not enough consecutive — return the previous stable zone
  // Walk backwards to find the last zone that had enough consecutive
  for (let i = zoneHistory.length - consecutiveCount - 1; i >= 0; i--) {
    const zone = zoneHistory[i];
    let count = 0;
    for (let j = i; j >= 0; j--) {
      if (zoneHistory[j] === zone) count++;
      else break;
    }
    if (count >= requiredConsecutive) return zone;
  }

  return 'NORMAL'; // fallback
}

// ============================================================================
// Window Validity (T-B2)
// ============================================================================

/**
 * Determine minimum required observation window based on tenant volume.
 */
export function classifyTenantVolume(promotesPerDay: number): TenantVolumeClass {
  if (promotesPerDay >= HIGH_VOLUME_THRESHOLD) return 'HIGH';
  if (promotesPerDay <= LOW_VOLUME_THRESHOLD) return 'LOW';
  return 'MEDIUM';
}

/**
 * Get required minimum window hours for a tenant volume class.
 */
export function getRequiredWindowHours(volumeClass: TenantVolumeClass): number {
  switch (volumeClass) {
    case 'HIGH': return 72;
    case 'MEDIUM': return 72;
    case 'LOW': return 168;
  }
}

/**
 * Validate an observation window.
 *
 * @param dataPoints - Number of data points collected
 * @param actualHours - Actual observation duration in hours
 * @param volumeClass - Tenant volume classification
 * @param hasInfraIncident - Whether an infra incident occurred during window
 * @param hasConfigChange - Whether guard config changed during window
 * @param hasKillSwitch - Whether kill-switch was activated during window
 * @param maxScrapeGapMinutes - Largest gap between consecutive scrapes (minutes)
 */
export function validateWindow(
  dataPoints: number,
  actualHours: number,
  volumeClass: TenantVolumeClass,
  hasInfraIncident: boolean,
  hasConfigChange: boolean,
  hasKillSwitch: boolean,
  maxScrapeGapMinutes: number = 0,
): WindowValidityResult {
  const requiredHours = getRequiredWindowHours(volumeClass);

  if (hasInfraIncident) {
    return { valid: false, reason: 'INFRA_INCIDENT', dataPoints, requiredMinimumHours: requiredHours, actualHours };
  }
  if (hasConfigChange) {
    return { valid: false, reason: 'CONFIG_CHANGE', dataPoints, requiredMinimumHours: requiredHours, actualHours };
  }
  if (hasKillSwitch) {
    return { valid: false, reason: 'KILL_SWITCH_ACTIVATION', dataPoints, requiredMinimumHours: requiredHours, actualHours };
  }
  if (maxScrapeGapMinutes > 15) {
    return { valid: false, reason: 'SCRAPE_GAP', dataPoints, requiredMinimumHours: requiredHours, actualHours };
  }
  if (dataPoints < MIN_DATA_POINTS) {
    return { valid: false, reason: 'INSUFFICIENT_DATA', dataPoints, requiredMinimumHours: requiredHours, actualHours };
  }
  if (actualHours < requiredHours) {
    return { valid: false, reason: 'INSUFFICIENT_DATA', dataPoints, requiredMinimumHours: requiredHours, actualHours };
  }

  return { valid: true, reason: null, dataPoints, requiredMinimumHours: requiredHours, actualHours };
}

// ============================================================================
// Compliance Criterion (T-B4) — "Baseline ile uyumlu" formal tanımı
// ============================================================================

/**
 * Evaluate whether current metrics are "statistically consistent with baseline".
 *
 * Definition: P(current_ewma ∈ [baseline_ewma - 2σ, baseline_ewma + 2σ]) ≥ 0.95
 * over trailing 24h evaluation windows.
 *
 * @param windowValues - Array of metric values for each 5-minute evaluation window (trailing 24h)
 * @param baselineEwma - Baseline EWMA value
 * @param baselineSigma - Baseline standard deviation (σ)
 * @param threshold - Required ratio of windows within CI (default 0.95)
 * @returns Compliance result
 */
export function evaluateCompliance(
  windowValues: readonly number[],
  baselineEwma: number,
  baselineSigma: number,
  threshold: number = 0.95,
): ComplianceResult {
  if (windowValues.length === 0) {
    return { compliant: false, windowsInCI: 0, totalWindows: 0, ratio: 0, threshold };
  }

  const lowerBound = baselineEwma - 2 * baselineSigma;
  const upperBound = baselineEwma + 2 * baselineSigma;

  const windowsInCI = windowValues.filter(v => v >= lowerBound && v <= upperBound).length;
  const ratio = windowsInCI / windowValues.length;

  return {
    compliant: ratio >= threshold,
    windowsInCI,
    totalWindows: windowValues.length,
    ratio,
    threshold,
  };
}

// ============================================================================
// Tenant Segmentation (T-B5)
// ============================================================================

/**
 * Determine segmentation phase based on rollout state.
 */
export function determineSegmentationPhase(
  guardMode: 'shadow' | 'enforce',
  hasCanaryTenants: boolean,
): SegmentationPhase {
  if (guardMode === 'shadow' && !hasCanaryTenants) return 'GLOBAL';
  if (guardMode === 'shadow' && hasCanaryTenants) return 'PER_TENANT';
  if (guardMode === 'enforce' && hasCanaryTenants) return 'CANARY_ONLY';
  return 'PER_TENANT'; // enforce + no canary = full per-tenant
}

/**
 * Evaluate a tenant's drift rate against the global baseline.
 * Flag as outlier if deviation > 3σ from global mean.
 */
export function evaluateTenantSegmentation(
  tenantId: string,
  tenantDriftRate: number,
  globalMean: number,
  globalSigma: number,
  promotesPerDay: number,
  phase: SegmentationPhase,
): TenantSegmentationResult {
  const volumeClass = classifyTenantVolume(promotesPerDay);
  const deviation = globalSigma > 0
    ? Math.abs(tenantDriftRate - globalMean) / globalSigma
    : (tenantDriftRate === globalMean ? 0 : Infinity);

  return {
    phase,
    tenantId,
    volumeClass,
    isOutlier: deviation > 3,
    deviationSigma: deviation,
  };
}
