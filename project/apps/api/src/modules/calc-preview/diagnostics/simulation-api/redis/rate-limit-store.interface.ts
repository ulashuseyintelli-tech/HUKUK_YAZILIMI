/**
 * Rate Limit Store Interface
 * 
 * Phase 9A - Task 2.1
 * 
 * Interface for rate limit storage operations.
 * Both Redis and in-memory adapters implement this interface.
 * 
 * Key Design Decisions:
 * - Per-incident: INCR + TTL=60s; >1 => 429
 * - Concurrent: Set membership (runId) + SCARD > 5 => 429
 * - Daily: UTC day key; >100 => 429
 * - Incident lock: SET NX EX for 409 ALREADY_RUNNING
 */

// ============================================================================
// Result Types
// ============================================================================

export interface IncrementResult {
  /** Current count after increment */
  count: number;
  /** Remaining TTL in seconds (-1 if no TTL, -2 if key doesn't exist) */
  ttlRemaining: number;
}

export interface AcquireLockResult {
  /** Whether lock was acquired */
  acquired: boolean;
  /** Existing runId if lock was not acquired */
  existingRunId?: string | undefined;
}

// ============================================================================
// Rate Limit Store Interface
// ============================================================================

/**
 * Rate limit store interface - implemented by both Redis and in-memory adapters
 */
export interface IRateLimitStore {
  // ============================================================================
  // Per-Incident Rate Limiting
  // ============================================================================

  /**
   * Increment per-incident counter with TTL
   * 
   * Redis equivalent: INCR + EXPIRE (atomic via MULTI/EXEC)
   * 
   * @param tenantId - Tenant identifier
   * @param incidentId - Incident identifier
   * @param ttlSec - TTL in seconds (default: 60)
   * @returns Current count and remaining TTL
   */
  incrementIncidentCounter(
    tenantId: string,
    incidentId: string,
    ttlSec: number,
  ): Promise<IncrementResult>;

  /**
   * Get current per-incident counter value
   * 
   * @param tenantId - Tenant identifier
   * @param incidentId - Incident identifier
   * @returns Current count and TTL, or null if not exists/expired
   */
  getIncidentCounter(
    tenantId: string,
    incidentId: string,
  ): Promise<IncrementResult | null>;

  // ============================================================================
  // Concurrent Tracking (Set Membership)
  // ============================================================================

  /**
   * Add runId to tenant's concurrent set
   * 
   * Redis equivalent: ZADD with expiry score for automatic cleanup
   * 
   * @param tenantId - Tenant identifier
   * @param runId - Run identifier to add
   * @param ttlSec - TTL in seconds for crash recovery
   */
  addToConcurrentSet(
    tenantId: string,
    runId: string,
    ttlSec: number,
  ): Promise<void>;

  /**
   * Remove runId from tenant's concurrent set
   * 
   * Redis equivalent: ZREM
   * 
   * @param tenantId - Tenant identifier
   * @param runId - Run identifier to remove
   */
  removeFromConcurrentSet(
    tenantId: string,
    runId: string,
  ): Promise<void>;

  /**
   * Get count of active concurrent runs for tenant
   * 
   * Redis equivalent: ZCARD (after cleanup of expired entries)
   * 
   * @param tenantId - Tenant identifier
   * @returns Number of active concurrent runs
   */
  getConcurrentCount(tenantId: string): Promise<number>;

  // ============================================================================
  // Daily Counters
  // ============================================================================

  /**
   * Increment daily counter for tenant
   * 
   * Redis equivalent: INCR with 25h TTL
   * 
   * @param tenantId - Tenant identifier
   * @param utcDate - UTC date string (yyyy-mm-dd)
   * @returns New count after increment
   */
  incrementDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number>;

  /**
   * Get current daily counter value
   * 
   * @param tenantId - Tenant identifier
   * @param utcDate - UTC date string (yyyy-mm-dd)
   * @returns Current count (0 if not exists)
   */
  getDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number>;

  // ============================================================================
  // Incident Locks (409 ALREADY_RUNNING)
  // ============================================================================

  /**
   * Acquire incident lock for simulation
   * 
   * Redis equivalent: SET NX EX (atomic acquire)
   * 
   * @param tenantId - Tenant identifier
   * @param incidentId - Incident identifier
   * @param runId - Run identifier to set as lock value
   * @param ttlSec - Lock TTL in seconds for crash recovery
   * @returns Whether lock was acquired, and existing runId if not
   */
  acquireIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
    ttlSec: number,
  ): Promise<AcquireLockResult>;

  /**
   * Release incident lock
   * 
   * Redis equivalent: Lua script for atomic check-and-delete
   * Only releases if runId matches (prevents releasing other's lock)
   * 
   * @param tenantId - Tenant identifier
   * @param incidentId - Incident identifier
   * @param runId - Run identifier (must match lock value)
   * @returns Whether lock was released
   */
  releaseIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<boolean>;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Health check - verify store is operational
   * 
   * @returns true if healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Cleanup expired entries (for in-memory implementation)
   * Redis handles this automatically via TTL
   */
  cleanup(): Promise<void>;

  /**
   * Reset all state (for testing)
   */
  reset(): Promise<void>;
}

// ============================================================================
// Metrics Interface
// ============================================================================

export interface IRateLimitMetrics {
  /**
   * Record operation latency
   */
  recordLatency(operation: string, durationMs: number, success: boolean): void;

  /**
   * Increment error counter
   */
  recordError(operation: string, errorType: string): void;

  /**
   * Record failover activation
   */
  recordFailover(activated: boolean): void;

  /**
   * Record circuit breaker state change
   */
  recordCircuitBreakerState(state: 'OPEN' | 'CLOSED' | 'HALF_OPEN'): void;
}
