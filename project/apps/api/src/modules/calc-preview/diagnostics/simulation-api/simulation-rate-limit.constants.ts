/**
 * Simulation Rate Limit Constants
 * 
 * Sprint 2F - Single source of truth for rate limiting
 * 
 * Rate-limit algorithms are "best-effort guard" (operational brake, not strict SLA).
 */

import { ISimulationClock } from '../simulation/simulation.types';

// ============================================================================
// Rate Limit Values
// ============================================================================

export const SIMULATION_RATE_LIMITS = {
  /** Max simulations per incident per minute */
  perIncident: 1,
  /** Max concurrent simulations per tenant */
  perTenantConcurrent: 5,
  /** Max simulations per tenant per day */
  daily: 100,
  /** Lease TTL for crash recovery (ms) */
  leaseTtlMs: 5 * 60 * 1000, // 5 minutes
  /** Per-incident key TTL (seconds) */
  perIncidentTtlSec: 60,
} as const;

// ============================================================================
// Rate Limit Key Builders
// ============================================================================

export const SIMULATION_RATE_LIMIT_KEYS = {
  /**
   * Per-incident minute limit key
   * TTL=60s, INCR counter, >1 => 429
   * 
   * @example rate:simulation:incident:tenant-123:inc-456:m
   */
  perIncident: (tenantId: string, incidentId: string): string =>
    `rate:simulation:incident:${tenantId}:${incidentId}:m`,

  /**
   * Per-tenant concurrent limit key (Set)
   * SADD/SREM runId membership, SCARD > 5 => 429
   * 
   * @example rate:simulation:tenant:tenant-123:concurrent
   */
  perTenantConcurrent: (tenantId: string): string =>
    `rate:simulation:tenant:${tenantId}:concurrent`,

  /**
   * Daily limit key (UTC timezone)
   * INCR counter, >100 => 429
   * 
   * @example rate:simulation:tenant:tenant-123:daily:2024-01-15
   */
  daily: (tenantId: string, utcDate: string): string =>
    `rate:simulation:tenant:${tenantId}:daily:${utcDate}`,

  /**
   * Run lease key for crash recovery
   * TTL=5min, existence indicates run is active
   * 
   * @example rate:simulation:run:run-789:lease
   */
  runLease: (runId: string): string =>
    `rate:simulation:run:${runId}:lease`,

  /**
   * Incident simulation lock key for 409 ALREADY_RUNNING
   * Used to prevent concurrent simulations on same incident
   * 
   * @example rate:simulation:incident:tenant-123:inc-456:lock
   */
  incidentLock: (tenantId: string, incidentId: string): string =>
    `rate:simulation:incident:${tenantId}:${incidentId}:lock`,
} as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get UTC date string for daily key (yyyy-mm-dd)
 * Uses IClock for deterministic testing
 */
export function getUtcDateString(clock: ISimulationClock): string {
  const now = clock.now();
  return now.toISOString().slice(0, 10); // yyyy-mm-dd
}

/**
 * Rate limit type for error responses
 */
export type RateLimitType = 'concurrent' | 'incident' | 'daily';

/**
 * Result of rate limit check
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  limitType?: RateLimitType;
  retryAfterSec?: number;
  currentCount?: number;
  limit?: number;
}
