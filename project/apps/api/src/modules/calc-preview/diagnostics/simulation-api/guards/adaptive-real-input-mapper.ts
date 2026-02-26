/**
 * RealAdaptiveControlInputMapper — Real Signal Mapping
 *
 * SD-3 D3 Task 2: Canary-only real signal → ControlInput mapping
 *
 * Consumes:
 *   - classifySigmaZone() from baseline-math.ts (read-only)
 *   - evaluateCompliance() from baseline-math.ts (read-only)
 *   - classifyProviderHealth() from adaptive-provider-health-classifier.ts
 *
 * Error isolation (R6):
 *   Each field has independent try/catch (trySafe).
 *   Exception → stub-equivalent fallback (NORMAL/true/OK) + onFallback callback.
 *   All fields failing = stub mapper equivalent output.
 *
 * No metrics import — fallback telemetry via DI callback (onFallback).
 * No async I/O — all data from in-memory signal source.
 * Window size controlled by AdaptiveSignalSource (mapper only reads windowValues).
 *
 * Import direction:
 *   this → baseline-math.ts (read-only)
 *   this → adaptive-controller.types.ts (read-only)
 *   this → adaptive-provider-health-classifier.ts (read-only)
 *   FORBIDDEN: adaptive-controller.ts → this
 *
 * @see .kiro/specs/sd-3-adaptive-transition/design.md — B2, P6, P9
 * @see .kiro/specs/sd-3-adaptive-transition/requirements.md — R1, R6, R8
 */

import { classifySigmaZone, evaluateCompliance } from './baseline-math';
import type { SigmaZone } from './baseline-math';
import type { ControlInput } from './adaptive-controller.types';
import { ProviderHealthZone } from './adaptive-controller.types';
import type { AdaptiveControlInputMapper } from './adaptive-control-input-mapper';
import { classifyProviderHealth } from './adaptive-provider-health-classifier';
import type { ProviderHealthClassifierConfig } from './adaptive-provider-health-classifier';

// ============================================================================
// Types
// ============================================================================

/** Fallback counter increment callback — DI injected, no direct Prometheus dependency */
export type FallbackIncrementor = (field: FallbackField) => void;

/** Closed-set fallback field labels (3 values only) */
export type FallbackField = 'sigmaZone' | 'complianceVerdict' | 'providerHealthZone';

/**
 * Runtime signal source — injected from guard runtime.
 * All fields are required (precomputed, in-memory, bounded).
 * Window size is controlled by the signal source producer, not by the mapper.
 */
export interface AdaptiveSignalSource {
  /** Current metric value (EWMA input) */
  readonly currentValue: number;
  /** Baseline EWMA value */
  readonly baselineEwma: number;
  /** Baseline σ (standard deviation) */
  readonly baselineSigma: number;
  /** Compliance evaluation window values — length controlled by signal source */
  readonly windowValues: readonly number[];
  /** Provider error rate (precomputed, bounded) */
  readonly providerErrorRate: number;
}

export interface RealMapperConfig {
  /** Compliance ratio threshold. TBD, default: 0.95 */
  readonly complianceThreshold: number;
  /** Provider health classifier thresholds */
  readonly providerHealth: ProviderHealthClassifierConfig;
}

// ============================================================================
// Implementation
// ============================================================================

export class RealAdaptiveControlInputMapper implements AdaptiveControlInputMapper {
  constructor(
    private readonly killSwitchProvider: () => boolean,
    private readonly signalSource: () => AdaptiveSignalSource,
    private readonly config: RealMapperConfig,
    private readonly onFallback: FallbackIncrementor,
  ) {}

  buildInput(): ControlInput {
    const signals = this.signalSource();

    const sigmaZone = this.trySafe<SigmaZone>(
      () => classifySigmaZone(
        signals.currentValue,
        signals.baselineEwma,
        signals.baselineSigma,
      ),
      'NORMAL' as SigmaZone,
      'sigmaZone',
    );

    const complianceVerdict = this.trySafe<boolean>(
      () => evaluateCompliance(
        signals.windowValues,
        signals.baselineEwma,
        signals.baselineSigma,
        this.config.complianceThreshold,
      ).compliant,
      true,
      'complianceVerdict',
    );

    const providerHealthZone = this.trySafe<ProviderHealthZone>(
      () => classifyProviderHealth(
        signals.providerErrorRate,
        this.config.providerHealth,
      ),
      ProviderHealthZone.OK,
      'providerHealthZone',
    );

    return Object.freeze({
      sigmaZone,
      complianceVerdict,
      providerHealthZone,
      killSwitchActive: this.killSwitchProvider(),
      nowMs: Date.now(),
    });
  }

  /**
   * Independent try/catch per field — R6-AC1..AC5.
   * Exception → fallback value + onFallback callback.
   * One field's error never affects others.
   */
  private trySafe<T>(fn: () => T, fallback: T, field: FallbackField): T {
    try {
      return fn();
    } catch {
      this.onFallback(field);
      return fallback;
    }
  }
}
