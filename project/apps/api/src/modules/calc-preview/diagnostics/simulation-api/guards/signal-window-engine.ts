/**
 * SignalWindowEngine — Windowed Signal Computation Engine
 *
 * Operational Guard Phase — Task 2
 *
 * Deterministic: same samples + config + nowMs → same output.
 * No Date.now() — nowMs is always injected from caller.
 *
 * Rounding policy: all aggregate outputs use RATE_PRECISION (1e-6)
 * to prevent cross-platform float drift.
 *
 * Window boundary: [windowStart, nowMs] inclusive-inclusive.
 *
 * All timestamps are ms (number), no ISO strings in engine layer.
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D3
 * @see .kiro/specs/operational-guard-phase/requirements.md — R2
 */

import {
  SignalStatus,
  type WindowConfig,
  type WindowedSignal,
  type RiskContextSnapshot,
} from './guard-policy-resolver.types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Precision multiplier for rounding all aggregate outputs.
 * Prevents cross-platform float drift in rate and sum calculations.
 */
const PRECISION_FACTOR = 1_000_000; // 1e6 → 6 decimal places

// ============================================================================
// Signal Input
// ============================================================================

/** Input for a single signal computation */
export interface SignalInput {
  readonly name: string;
  readonly samples: ReadonlyArray<{ readonly timestamp: number; readonly value: number }>;
  readonly config: WindowConfig;
}

// ============================================================================
// SignalWindowEngine
// ============================================================================

export class SignalWindowEngine {
  /**
   * Compute a single windowed signal.
   *
   * @param name - Signal name (e.g. 'casConflictRate')
   * @param samples - Raw timestamped samples (caller pre-filters by tenant)
   * @param config - Window configuration
   * @param nowMs - Current time in ms (injected, never Date.now())
   */
  computeSignal(
    name: string,
    samples: ReadonlyArray<{ readonly timestamp: number; readonly value: number }>,
    config: WindowConfig,
    nowMs: number,
  ): WindowedSignal {
    const windowStartMs = nowMs - config.windowSizeSeconds * 1000;

    // Filter: [windowStart, nowMs] inclusive-inclusive
    const windowSamples = samples.filter(
      (s) => s.timestamp >= windowStartMs && s.timestamp <= nowMs,
    );

    const sampleCount = windowSamples.length;
    const lastSampleAtMs =
      sampleCount > 0
        ? Math.max(...windowSamples.map((s) => s.timestamp))
        : null;

    // ── INSUFFICIENT: below minSampleCount ──────────────────────────
    if (sampleCount < config.minSampleCount) {
      return {
        name,
        value: 0,
        status: SignalStatus.INSUFFICIENT,
        sampleCount,
        windowParams: config,
        computedAtMs: nowMs,
        lastSampleAtMs,
      };
    }

    // ── STALENESS check ─────────────────────────────────────────────
    // lastSampleAtMs is guaranteed non-null here (sampleCount >= minSampleCount > 0)
    const stalenessSeconds = (nowMs - lastSampleAtMs!) / 1000;
    const isStale = stalenessSeconds > config.stalenessThresholdSeconds;

    const value = this.aggregate(windowSamples, config);

    if (isStale) {
      return {
        name,
        value,
        status: SignalStatus.STALE,
        sampleCount,
        windowParams: config,
        computedAtMs: nowMs,
        lastSampleAtMs,
      };
    }

    // ── FRESH ───────────────────────────────────────────────────────
    return {
      name,
      value,
      status: SignalStatus.FRESH,
      sampleCount,
      windowParams: config,
      computedAtMs: nowMs,
      lastSampleAtMs,
    };
  }

  /**
   * Compute all signals → produce RiskContextSnapshot.
   *
   * @param signalInputs - Array of signal inputs
   * @param nowMs - Current time in ms (injected)
   */
  computeRiskContext(
    signalInputs: readonly SignalInput[],
    nowMs: number,
  ): RiskContextSnapshot {
    const signals: Record<string, WindowedSignal> = {};
    let anyStale = false;
    let anyInsufficient = false;

    for (const input of signalInputs) {
      const signal = this.computeSignal(
        input.name,
        input.samples,
        input.config,
        nowMs,
      );
      signals[input.name] = signal;
      if (signal.status === SignalStatus.STALE) anyStale = true;
      if (signal.status === SignalStatus.INSUFFICIENT) anyInsufficient = true;
    }

    return {
      timestampMs: nowMs,
      signals,
      anyStale,
      anyInsufficient,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // Private
  // ══════════════════════════════════════════════════════════════════

  /**
   * Aggregate samples with deterministic rounding.
   * Rounding applied to ALL outputs (sum and rate) to prevent float drift.
   */
  private aggregate(
    samples: ReadonlyArray<{ readonly timestamp: number; readonly value: number }>,
    config: WindowConfig,
  ): number {
    const total = samples.reduce((sum, s) => sum + s.value, 0);

    if (config.aggregation === 'sum') {
      return this.round(total);
    }

    // rate = total / windowSizeSeconds
    return this.round(total / config.windowSizeSeconds);
  }

  /** Round to 6 decimal places — deterministic across platforms */
  private round(value: number): number {
    return Math.round(value * PRECISION_FACTOR) / PRECISION_FACTOR;
  }
}
