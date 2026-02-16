/**
 * GuardConfigProvider — Guard configuration source
 *
 * Operational Guard Phase — Task 4
 *
 * Abstracts config retrieval for DI and testability.
 * Real implementation (Task 6+) may read from DB, env, or config service.
 * For Task 4, StaticGuardConfigProvider is used for testing.
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4
 */

import {
  DEFAULT_GUARD_CONFIG,
  type GuardConfig,
} from './guard-policy-resolver.types';

// ============================================================================
// Interface
// ============================================================================

/**
 * Provides guard configuration.
 * Config is read ONCE per request (snapshot semantics).
 * Mid-flight config changes do not affect in-flight requests.
 */
export interface GuardConfigProvider {
  /** Get current guard config (immutable snapshot) */
  getConfig(): GuardConfig;
}

// ============================================================================
// Static Implementation (Test / Default)
// ============================================================================

/**
 * Static config provider — returns a fixed config.
 * Useful for testing and as a safe default.
 */
export class StaticGuardConfigProvider implements GuardConfigProvider {
  constructor(private readonly config: GuardConfig = DEFAULT_GUARD_CONFIG) {}

  getConfig(): GuardConfig {
    return this.config;
  }
}
