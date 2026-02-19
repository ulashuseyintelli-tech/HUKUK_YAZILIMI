/**
 * GuardDecisionSnapshotFactory — Composition Root
 *
 * Operational Guard Phase — Task 4
 *
 * Orchestrates: config fetch → signal fetch → engine compute → policy resolve → freeze.
 * Single entry point for snapshot creation.
 *
 * No Date.now() — clock is injected.
 * No direct DB access — providers are injected.
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4
 * @see .kiro/specs/operational-guard-phase/requirements.md — R3
 */

import type { GuardClock } from './guard-clock';
import type { GuardConfigProvider } from './guard-config-provider';
import type { DriftInputProvider } from './drift-input-provider';
import type { RiskSignalProvider } from './risk-signal-provider';
import type {
  GuardConfig,
  GuardDecisionSnapshot,
  GuardOperation,
} from './guard-policy-resolver.types';
import { resolveTenantConfig } from './guard-policy-resolver.types';
import { resolveGuardPolicy } from './guard-policy-resolver';
import { SignalWindowEngine } from './signal-window-engine';

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates frozen GuardDecisionSnapshot instances.
 *
 * Lifecycle: one factory instance per application.
 * Each createSnapshot() call produces one immutable snapshot.
 *
 * Determinism guarantee:
 *   same (tenantId, operation, config, samples, nowMs) → same snapshot
 */
export class GuardDecisionSnapshotFactory {
  private readonly engine: SignalWindowEngine;

  constructor(
    private readonly configProvider: GuardConfigProvider,
    private readonly signalProvider: RiskSignalProvider,
    private readonly clock: GuardClock,
    private readonly driftInputProvider?: DriftInputProvider,
  ) {
    this.engine = new SignalWindowEngine();
  }

  /**
   * Expose config for guard mode resolution.
   * Interceptor needs config to determine guardMode before snapshot creation.
   */
  getConfig(): GuardConfig {
    return this.configProvider.getConfig();
  }

  /**
   * Create a frozen GuardDecisionSnapshot.
   *
   * Steps:
   *   1. Read clock (nowMs)
   *   2. Read config (snapshot semantics — read once)
   *   3. Fetch tenant signal inputs
   *   4. Compute risk context via SignalWindowEngine
   *   5. Resolve guard policy (pure function)
   *   6. Return frozen snapshot
   *
   * @param tenantId - Tenant identifier
   * @param operation - Pipeline operation
   * @returns Frozen GuardDecisionSnapshot
   */
  createSnapshot(
    tenantId: string,
    operation: GuardOperation,
  ): GuardDecisionSnapshot {
    const nowMs = this.clock.nowMs();
    const config = this.configProvider.getConfig();
    const signalInputs = this.signalProvider.getSignalInputs(tenantId, nowMs);
    const riskContext = this.engine.computeRiskContext(signalInputs, nowMs);

    // SD-1: Fetch drift input only when ALL conditions met:
    //   1. driftGuardEnabled=true
    //   2. kill-switch NOT active (D2.2: no provider IO when kill-switch ON)
    //   3. provider exists
    // Provider exception → fail-closed (DRIFT_PROVIDER_ERROR — D2.1, R5.5, R5.6).
    const tenantConfig = resolveTenantConfig(tenantId, config);
    let driftInput: ReturnType<DriftInputProvider['getDriftInput']> | undefined;
    let driftProviderError = false;

    if (
      tenantConfig.driftGuardEnabled &&
      !tenantConfig.killSwitchActive &&
      this.driftInputProvider
    ) {
      try {
        driftInput = this.driftInputProvider.getDriftInput(tenantId, operation, nowMs);
      } catch {
        // Provider failure → fail-closed: treat as drift (DRIFT_PROVIDER_ERROR).
        // Shadow: interceptor proceeds (next.handle), Enforce: BLOCK_503.
        driftProviderError = true;
      }
    }

    return resolveGuardPolicy(tenantId, operation, riskContext, config, nowMs, driftInput, driftProviderError);
  }
}
