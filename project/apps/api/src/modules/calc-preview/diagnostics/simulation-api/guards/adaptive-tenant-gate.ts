/**
 * AdaptiveTenantGate — Per-Tenant Gating for Adaptive Shadow Evaluation
 *
 * SD-2.6 D2 Task 2.1: Per-tenant gating with allowlist model
 *
 * Precedence chain (P5):
 *   P0: globalEnabled=false           → false (all tenants off — global kill)
 *   P1: tenantOverrides[id]=false     → false (this tenant off)
 *   P2: tenantOverrides[id]=true      → true  (this tenant on)
 *   P3: globalEnabled=true + no override → true (default — current behavior)
 *
 * Canary check:
 *   isCanary(tenantId) = isEnabled(tenantId) && canaryTenants.includes(tenantId)
 *
 * Config is passed by reference — runtime changes take immediate effect (R3-AC4).
 * No restart required.
 *
 * @see .kiro/specs/sd-26-adaptive-real-signals/requirements.md — R3, R4
 * @see .kiro/specs/sd-26-adaptive-real-signals/design.md — D2
 */

// ============================================================================
// Config
// ============================================================================

export interface AdaptiveTenantGateConfig {
  /** Global adaptive shadow enabled flag (adaptive_shadow_enabled) */
  readonly globalEnabled: boolean;
  /** Per-tenant overrides: tenantId → enabled/disabled */
  readonly tenantOverrides: Readonly<Record<string, boolean>>;
  /** Canary tenant subset — only these get real signal mapping */
  readonly canaryTenants: readonly string[];
}

// ============================================================================
// Interface
// ============================================================================

export interface AdaptiveTenantGate {
  /** Check if adaptive shadow evaluation is enabled for this tenant */
  isEnabled(tenantId: string): boolean;
  /** Check if this tenant is in the canary subset (enabled + in canaryTenants list) */
  isCanary(tenantId: string): boolean;
}

// ============================================================================
// Default Implementation — Pure Allowlist
// ============================================================================

export class DefaultAdaptiveTenantGate implements AdaptiveTenantGate {
  constructor(private readonly configProvider: () => AdaptiveTenantGateConfig) {}

  isEnabled(tenantId: string): boolean {
    const config = this.configProvider();

    // P0: global kill — all tenants off
    if (!config.globalEnabled) {
      return false;
    }

    // P1/P2: per-tenant override (explicit true/false)
    const override = config.tenantOverrides[tenantId];
    if (override !== undefined) {
      return override;
    }

    // P3: global on + no override → enabled (current SD-2.5 behavior)
    return true;
  }

  isCanary(tenantId: string): boolean {
    return this.isEnabled(tenantId) && this.configProvider().canaryTenants.includes(tenantId);
  }
}

// ============================================================================
// Noop Implementation — Testing (always enabled, never canary)
// ============================================================================

export class NoopAdaptiveTenantGate implements AdaptiveTenantGate {
  isEnabled(_tenantId: string): boolean {
    return true;
  }

  isCanary(_tenantId: string): boolean {
    return false;
  }
}

// ============================================================================
// Disabled Implementation — Testing (always disabled)
// ============================================================================

export class DisabledAdaptiveTenantGate implements AdaptiveTenantGate {
  isEnabled(_tenantId: string): boolean {
    return false;
  }

  isCanary(_tenantId: string): boolean {
    return false;
  }
}
