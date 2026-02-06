/**
 * Manifest Retry Worker Configuration
 * 
 * Phase 10 - Task 10.1.6
 * 
 * Configuration for the retry worker service.
 * 
 * LOCKED VALUES - See PHASE-10-WORKER-ARCHITECTURE.md Section 11-12
 * 
 * @see .kiro/specs/phase-10-retry-signature/PHASE-10-WORKER-ARCHITECTURE.md
 */

export interface ManifestRetryWorkerConfig {
  /** 
   * Poll interval when no jobs available (ms)
   * LOCKED: 5000ms - prevents busy loop, gives DB breathing room
   */
  pollIntervalMs: number;
  
  /** 
   * Lease duration for claimed jobs (ms)
   * LOCKED: 60000ms (60s) - Option A (Simple), no heartbeat
   * MUST: Manifest write attempt MUST NOT exceed this duration
   */
  leaseMs: number;
  
  /**
   * Hard timeout for object store write operations (ms)
   * LOCKED: 30000ms (30s) - MUST be less than leaseMs
   * Provides 30s safety margin before lease expiry
   */
  writeTimeoutMs: number;
  
  /** 
   * Maximum concurrent workers
   * LOCKED: 1 for Phase 10.1 (single-thread worker)
   * Future: May increase to 3 in Phase 10.3 after stability proven
   */
  maxConcurrentWorkers: number;
  
  /** Worker instance ID prefix */
  instanceIdPrefix: string;
  
  /** Enable circuit breaker */
  circuitBreakerEnabled: boolean;
  
  /** Circuit breaker failure threshold */
  circuitBreakerFailureThreshold: number;
  
  /** Circuit breaker reset timeout (ms) */
  circuitBreakerResetMs: number;
  
  /** Enable metrics emission */
  metricsEnabled: boolean;
  
  /** Graceful shutdown timeout (ms) */
  shutdownTimeoutMs: number;
}

/**
 * Default worker configuration (LOCKED values)
 * 
 * MUST NOT change without architecture review:
 * - pollIntervalMs: 5000 (busy loop prevention)
 * - leaseMs: 60000 (Option A - no heartbeat)
 * - writeTimeoutMs: 30000 (hard timeout, MUST < leaseMs)
 * - maxConcurrentWorkers: 1 (Phase 10.1 single-thread)
 * - circuitBreakerFailureThreshold: 5
 * - circuitBreakerResetMs: 60000
 */
export const DEFAULT_WORKER_CONFIG: ManifestRetryWorkerConfig = {
  // LOCKED: Polling & Backpressure (Section 12)
  pollIntervalMs: 5_000,           // 5 seconds - MUST NOT reduce
  
  // LOCKED: Lease Semantics (Section 11 - Option A)
  leaseMs: 60_000,                 // 60 seconds - no heartbeat
  
  // LOCKED: Hard Timeout (Section 11.5)
  writeTimeoutMs: 30_000,          // 30 seconds - MUST < leaseMs
  
  // LOCKED: Phase 10.1 single-thread
  maxConcurrentWorkers: 1,         // Start with 1, may increase in Phase 10.3
  
  instanceIdPrefix: 'worker',
  
  // LOCKED: Circuit Breaker (Section 4)
  circuitBreakerEnabled: true,
  circuitBreakerFailureThreshold: 5,
  circuitBreakerResetMs: 60_000,   // 60 seconds
  
  metricsEnabled: true,
  shutdownTimeoutMs: 30_000,       // 30 seconds
};

/**
 * Generate unique worker instance ID
 */
export function generateWorkerId(prefix: string = 'worker'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

