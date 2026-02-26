/**
 * AdaptiveShadowStateStore — Per-Tenant In-Memory State Store
 *
 * SD-2.6 D2 Task 2.2: Per-tenant keying with backward-compat wrapper
 *
 * Contract:
 *   Per-tenant API (SD-2.6):
 *     - getForTenant(tenantId): returns tenant's AdaptiveInternalState
 *     - setForTenant(tenantId, state): persists tenant state + updates lastEvaluatedAtMs
 *     - resetTenant(tenantId): resets single tenant state
 *     - resetAll(): clears all tenant states
 *     - lastEvaluatedAtMsForTenant(tenantId): per-tenant timestamp
 *
 *   Backward-compat API (SD-2.5 — delegates to '__global__' sentinel):
 *     - get(): getForTenant('__global__')
 *     - set(state): setForTenant('__global__', state)
 *     - reset(): resetTenant('__global__')
 *     - lastEvaluatedAtMs: lastEvaluatedAtMsForTenant('__global__')
 *
 *   LRU eviction:
 *     - maxTrackedTenants config (default: 1000)
 *     - Evicts oldest lastEvaluatedAtMs when limit reached
 *     - guard_adaptive_tenant_eviction_total counter on eviction
 *
 * @see .kiro/specs/sd-26-adaptive-real-signals/requirements.md — R5
 * @see .kiro/specs/sd-26-adaptive-real-signals/design.md — D2
 */

import {
  type AdaptiveInternalState,
  createInitialState,
} from './adaptive-controller.types';

// ============================================================================
// Eviction Callback
// ============================================================================

/** Callback invoked on LRU eviction — for metrics emission */
export type EvictionCallback = (evictedTenantId: string) => void;

// ============================================================================
// Config
// ============================================================================

export interface AdaptiveShadowStateStoreConfig {
  /** Maximum tracked tenants before LRU eviction (default: 1000) */
  readonly maxTrackedTenants: number;
}

const DEFAULT_STATE_STORE_CONFIG: AdaptiveShadowStateStoreConfig = {
  maxTrackedTenants: 1000,
};

/** Sentinel key for backward-compat global API */
const GLOBAL_TENANT_KEY = '__global__';

// ============================================================================
// Implementation
// ============================================================================

export class AdaptiveShadowStateStore {
  private readonly states = new Map<string, AdaptiveInternalState>();
  private readonly lastEvalTimes = new Map<string, number>();
  private readonly config: AdaptiveShadowStateStoreConfig;
  private readonly onEviction: EvictionCallback | null;

  constructor(
    config?: Partial<AdaptiveShadowStateStoreConfig>,
    onEviction?: EvictionCallback,
  ) {
    this.config = { ...DEFAULT_STATE_STORE_CONFIG, ...config };
    this.onEviction = onEviction ?? null;
  }

  // ── Per-Tenant API (SD-2.6) ─────────────────────────────────────

  getForTenant(tenantId: string): AdaptiveInternalState {
    return this.states.get(tenantId) ?? createInitialState(Date.now());
  }

  setForTenant(tenantId: string, nextState: AdaptiveInternalState): void {
    this.evictIfNeeded(tenantId);
    this.states.set(tenantId, nextState);
    this.lastEvalTimes.set(tenantId, Date.now());
  }

  lastEvaluatedAtMsForTenant(tenantId: string): number | null {
    return this.lastEvalTimes.get(tenantId) ?? null;
  }

  resetTenant(tenantId: string): void {
    this.states.delete(tenantId);
    this.lastEvalTimes.delete(tenantId);
  }

  resetAll(): void {
    this.states.clear();
    this.lastEvalTimes.clear();
  }

  /** Current number of tracked tenants */
  get trackedTenantCount(): number {
    return this.states.size;
  }

  // ── Backward-Compat API (SD-2.5 — delegates to '__global__') ───

  get(): AdaptiveInternalState {
    return this.getForTenant(GLOBAL_TENANT_KEY);
  }

  set(nextState: AdaptiveInternalState): void {
    this.setForTenant(GLOBAL_TENANT_KEY, nextState);
  }

  get lastEvaluatedAtMs(): number | null {
    return this.lastEvaluatedAtMsForTenant(GLOBAL_TENANT_KEY);
  }

  reset(): void {
    this.resetTenant(GLOBAL_TENANT_KEY);
  }

  // ── LRU Eviction ────────────────────────────────────────────────

  private evictIfNeeded(incomingTenantId: string): void {
    // Don't evict if tenant already tracked or under limit
    if (this.states.has(incomingTenantId)) return;
    if (this.states.size < this.config.maxTrackedTenants) return;

    // Find oldest lastEvaluatedAtMs — skip __global__ sentinel (F1 fix)
    let oldestTenant: string | null = null;
    let oldestMs = Infinity;
    for (const [tid, ms] of this.lastEvalTimes) {
      if (tid === GLOBAL_TENANT_KEY) continue; // F1: never evict legacy sentinel
      if (ms < oldestMs) {
        oldestMs = ms;
        oldestTenant = tid;
      }
    }

    // F1 fail-safe: if no evictable candidate found (only __global__ left), skip
    if (!oldestTenant) return;

    this.states.delete(oldestTenant);
    this.lastEvalTimes.delete(oldestTenant);
    if (this.onEviction) {
      try {
        this.onEviction(oldestTenant);
      } catch {
        // best-effort: eviction callback failure is non-fatal
      }
    }
  }
}
