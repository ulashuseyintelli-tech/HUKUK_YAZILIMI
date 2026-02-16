/**
 * RiskSignalProvider — Tenant-scoped raw sample provider
 *
 * Operational Guard Phase — Task 4
 *
 * SignalWindowEngine is tenant-agnostic; this provider handles
 * tenant-scoped sample filtering before feeding the engine.
 *
 * Real implementation (Task 6+) will read from DB/cache.
 * For Task 4, InMemoryRiskSignalProvider is used for testing.
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4
 */

import type { SignalName } from './guard-policy-resolver.types';
import type { SignalInput } from './signal-window-engine';

// ============================================================================
// Interface
// ============================================================================

/** Raw timestamped sample */
export interface RawSample {
  readonly name: string;
  readonly timestamp: number;
  readonly value: number;
}

/**
 * Provides tenant-scoped signal inputs for the guard engine.
 * Implementations must filter samples by tenant before returning.
 */
export interface RiskSignalProvider {
  /**
   * Get signal inputs for a specific tenant.
   * Returns SignalInput[] ready for SignalWindowEngine.computeRiskContext().
   *
   * @param tenantId - Tenant to fetch samples for
   * @param nowMs - Current time (for window boundary hints)
   */
  getSignalInputs(tenantId: string, nowMs: number): SignalInput[];
}

// ============================================================================
// In-Memory Implementation (Test)
// ============================================================================

/**
 * In-memory signal provider for testing.
 * Stores samples per tenant, returns SignalInput[] with configured WindowConfig.
 */
export class InMemoryRiskSignalProvider implements RiskSignalProvider {
  private readonly store = new Map<string, RawSample[]>();
  private readonly signalConfigs: Map<string, SignalInput['config']>;

  constructor(
    signalConfigs: Record<SignalName, SignalInput['config']>,
  ) {
    this.signalConfigs = new Map(Object.entries(signalConfigs));
  }

  /** Add samples for a tenant */
  addSamples(tenantId: string, samples: RawSample[]): void {
    const existing = this.store.get(tenantId) ?? [];
    this.store.set(tenantId, [...existing, ...samples]);
  }

  /** Clear all samples for a tenant */
  clearTenant(tenantId: string): void {
    this.store.delete(tenantId);
  }

  getSignalInputs(tenantId: string, _nowMs: number): SignalInput[] {
    const samples = this.store.get(tenantId) ?? [];
    const inputs: SignalInput[] = [];

    for (const [name, config] of this.signalConfigs) {
      inputs.push({
        name,
        samples: samples.filter(s => s.name === name),
        config,
      });
    }

    return inputs;
  }
}
