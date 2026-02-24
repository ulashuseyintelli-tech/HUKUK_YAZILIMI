/**
 * AdaptiveControlInputMapper — Stub Input Mapper
 *
 * SD-2.5 Task 1: Stub-first ControlInput mapping
 *
 * Produces deterministic stub input for shadow evaluation:
 *   sigmaZone      = 'NORMAL'  (stub — R2-AC1)
 *   complianceVerdict = true    (stub — R2-AC1)
 *   providerHealthZone = OK     (stub — K5)
 *   killSwitchActive = real     (R2-AC2)
 *   nowMs           = Date.now() at call time (R2-AC3)
 *
 * Real signal mapping (σ-zone classification, provider health) is SD-2.6 scope.
 * Adding real classification code here is FORBIDDEN until SD-2.6 (R2-AC4).
 *
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/requirements.md — R2
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/design.md — D2
 */

import type { SigmaZone } from './baseline-math';
import type { ControlInput } from './adaptive-controller.types';
import { ProviderHealthZone } from './adaptive-controller.types';

// ============================================================================
// Interface
// ============================================================================

export interface AdaptiveControlInputMapper {
  buildInput(): ControlInput;
}

// ============================================================================
// Stub Implementation (SD-2.5 — production default)
// ============================================================================

export class StubAdaptiveControlInputMapper implements AdaptiveControlInputMapper {
  constructor(
    private readonly killSwitchProvider: () => boolean,
  ) {}

  buildInput(): ControlInput {
    return Object.freeze({
      sigmaZone: 'NORMAL' as SigmaZone,
      complianceVerdict: true,
      providerHealthZone: ProviderHealthZone.OK,
      killSwitchActive: this.killSwitchProvider(),
      nowMs: Date.now(),
    });
  }
}

// ============================================================================
// Static Implementation (testing)
// ============================================================================

export class StaticAdaptiveControlInputMapper implements AdaptiveControlInputMapper {
  constructor(private readonly input: ControlInput) {}

  buildInput(): ControlInput {
    return this.input;
  }
}
