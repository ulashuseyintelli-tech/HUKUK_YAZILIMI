/**
 * Simulation Rate Limit Guard
 * 
 * Sprint 2F - Task 3.1
 * 
 * RED LINE #2: Rate-limit determinism + singular behavior
 * - per-incident: INCR + TTL=60s; >1 => 429
 * - concurrent: set membership (runId) + SCARD > 5 => 429
 * - daily: UTC day key; >100 => 429
 * - All use IClock for deterministic testing
 * 
 * Check Order (reject fast before expensive checks):
 * 1. Concurrent limit (SCARD) - immediate reject
 * 2. Per-incident minute limit (GET counter)
 * 3. Daily limit (GET counter)
 * 
 * RED LINE #3: "already running" 409 must work correctly
 * - Same incident concurrent simulate calls use lock/flag
 * - Single winner, others get 409
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { IClock } from '../../evidence/clock.service';
import {
  SIMULATION_RATE_LIMITS,
  SIMULATION_RATE_LIMIT_KEYS,
  getUtcDateString,
  RateLimitType,
} from '../simulation-rate-limit.constants';
import {
  TooManySimulationsException,
} from '../simulation-error.types';
import { ISimulationClock } from '../../simulation/simulation.types';

// ============================================================================
// Types
// ============================================================================

export interface AcquireResult {
  acquired: boolean;
  reason?: RateLimitType | 'ALREADY_RUNNING';
  retryAfterSec?: number;
  runId?: string;
}

export interface SimulationRateLimitRequest extends Request {
  simulationTenantContext?: {
    tenantId: string;
    userId: string;
    role: string;
  };
  rateLimitInfo?: {
    runId: string;
    tenantId: string;
    incidentId: string;
  };
}

// ============================================================================
// In-Memory Store (Redis-compatible interface for MVP)
// ============================================================================

interface InMemoryStore {
  // Per-incident counters with TTL
  incidentCounters: Map<string, { count: number; expiresAt: number }>;
  // Concurrent run sets per tenant
  concurrentSets: Map<string, Set<string>>;
  // Daily counters per tenant
  dailyCounters: Map<string, number>;
  // Incident locks for 409 ALREADY_RUNNING
  incidentLocks: Map<string, { runId: string; expiresAt: number }>;
  // Run leases for crash recovery
  runLeases: Map<string, number>; // runId -> expiresAt
}

// ============================================================================
// Guard Implementation
// ============================================================================

@Injectable()
export class SimulationRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(SimulationRateLimitGuard.name);
  private readonly store: InMemoryStore;
  private clock: IClock;

  constructor(clock?: IClock) {
    this.clock = clock || this.createDefaultClock();
    this.store = {
      incidentCounters: new Map(),
      concurrentSets: new Map(),
      dailyCounters: new Map(),
      incidentLocks: new Map(),
      runLeases: new Map(),
    };
  }

  private createDefaultClock(): IClock {
    return {
      now: () => new Date(),
      nowMs: () => Date.now(),
      nowIso: () => new Date().toISOString(),
      ageInSeconds: (timestamp: string | Date) => {
        const then = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        return Math.floor((Date.now() - then.getTime()) / 1000);
      },
      isOlderThan: (timestamp: string | Date, thresholdSec: number) => {
        const then = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        return Math.floor((Date.now() - then.getTime()) / 1000) > thresholdSec;
      },
    };
  }

  /**
   * Guard entry point - checks rate limits before allowing request
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SimulationRateLimitRequest>();
    
    // Only apply to POST /simulate endpoints
    if (request.method !== 'POST' || !request.path.includes('/simulate')) {
      return true;
    }

    const tenantId = this.extractTenantId(request);
    const incidentId = this.extractIncidentId(request);

    if (!tenantId || !incidentId) {
      return true; // Let controller handle missing params
    }

    // Cleanup expired entries
    this.cleanupExpired();

    // Check order: concurrent → incident → daily
    // 1. Concurrent limit
    const concurrentCount = this.getConcurrentCount(tenantId);
    if (concurrentCount >= SIMULATION_RATE_LIMITS.perTenantConcurrent) {
      this.logger.warn('[SimulationRateLimit] Concurrent limit exceeded', {
        tenantId,
        current: concurrentCount,
        limit: SIMULATION_RATE_LIMITS.perTenantConcurrent,
      });
      throw new TooManySimulationsException('concurrent');
    }

    // 2. Per-incident minute limit
    const incidentCount = this.getIncidentCount(tenantId, incidentId);
    if (incidentCount >= SIMULATION_RATE_LIMITS.perIncident) {
      const retryAfter = this.getIncidentRetryAfter(tenantId, incidentId);
      this.logger.warn('[SimulationRateLimit] Per-incident limit exceeded', {
        tenantId,
        incidentId,
        retryAfterSec: retryAfter,
      });
      throw new TooManySimulationsException('incident', retryAfter);
    }

    // 3. Daily limit
    const dailyCount = this.getDailyCount(tenantId);
    if (dailyCount >= SIMULATION_RATE_LIMITS.daily) {
      this.logger.warn('[SimulationRateLimit] Daily limit exceeded', {
        tenantId,
        current: dailyCount,
        limit: SIMULATION_RATE_LIMITS.daily,
      });
      throw new TooManySimulationsException('daily');
    }

    return true;
  }

  /**
   * Acquire token for simulation run
   * Called by controller before starting simulation
   * 
   * @returns AcquireResult with acquired=true and runId if successful
   */
  async acquireToken(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<AcquireResult> {
    this.cleanupExpired();
    const now = this.clock.nowMs();

    // 1. Check concurrent limit (SCARD)
    const concurrentCount = this.getConcurrentCount(tenantId);
    if (concurrentCount >= SIMULATION_RATE_LIMITS.perTenantConcurrent) {
      return {
        acquired: false,
        reason: 'concurrent',
      };
    }

    // 2. Check incident lock (409 ALREADY_RUNNING)
    const lockKey = SIMULATION_RATE_LIMIT_KEYS.incidentLock(tenantId, incidentId);
    const existingLock = this.store.incidentLocks.get(lockKey);
    if (existingLock && existingLock.expiresAt > now) {
      return {
        acquired: false,
        reason: 'ALREADY_RUNNING',
        runId: existingLock.runId,
      };
    }

    // 3. Check per-incident minute limit
    const incidentCount = this.getIncidentCount(tenantId, incidentId);
    if (incidentCount >= SIMULATION_RATE_LIMITS.perIncident) {
      const retryAfter = this.getIncidentRetryAfter(tenantId, incidentId);
      return {
        acquired: false,
        reason: 'incident',
        retryAfterSec: retryAfter,
      };
    }

    // 4. Check daily limit
    const dailyCount = this.getDailyCount(tenantId);
    if (dailyCount >= SIMULATION_RATE_LIMITS.daily) {
      return {
        acquired: false,
        reason: 'daily',
      };
    }

    // All checks passed - acquire tokens atomically
    // a. Add to concurrent set
    const concurrentKey = SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId);
    if (!this.store.concurrentSets.has(concurrentKey)) {
      this.store.concurrentSets.set(concurrentKey, new Set());
    }
    this.store.concurrentSets.get(concurrentKey)!.add(runId);

    // b. Increment incident counter with TTL
    const incidentKey = SIMULATION_RATE_LIMIT_KEYS.perIncident(tenantId, incidentId);
    const ttlMs = SIMULATION_RATE_LIMITS.perIncidentTtlSec * 1000;
    this.store.incidentCounters.set(incidentKey, {
      count: incidentCount + 1,
      expiresAt: now + ttlMs,
    });

    // c. Increment daily counter
    const dailyKey = this.getDailyKey(tenantId);
    this.store.dailyCounters.set(dailyKey, dailyCount + 1);

    // d. Set incident lock
    const leaseTtlMs = SIMULATION_RATE_LIMITS.leaseTtlMs;
    this.store.incidentLocks.set(lockKey, {
      runId,
      expiresAt: now + leaseTtlMs,
    });

    // e. Set run lease
    const leaseKey = SIMULATION_RATE_LIMIT_KEYS.runLease(runId);
    this.store.runLeases.set(leaseKey, now + leaseTtlMs);

    this.logger.debug('[SimulationRateLimit] Token acquired', {
      tenantId,
      incidentId,
      runId,
      concurrentCount: concurrentCount + 1,
      dailyCount: dailyCount + 1,
    });

    return {
      acquired: true,
      runId,
    };
  }

  /**
   * Release token after simulation completes (success or failure)
   * MUST be called in finally block
   */
  async releaseToken(tenantId: string, incidentId: string, runId: string): Promise<void> {
    // Remove from concurrent set
    const concurrentKey = SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId);
    const concurrentSet = this.store.concurrentSets.get(concurrentKey);
    if (concurrentSet) {
      concurrentSet.delete(runId);
    }

    // Remove incident lock
    const lockKey = SIMULATION_RATE_LIMIT_KEYS.incidentLock(tenantId, incidentId);
    const lock = this.store.incidentLocks.get(lockKey);
    if (lock && lock.runId === runId) {
      this.store.incidentLocks.delete(lockKey);
    }

    // Remove run lease
    const leaseKey = SIMULATION_RATE_LIMIT_KEYS.runLease(runId);
    this.store.runLeases.delete(leaseKey);

    this.logger.debug('[SimulationRateLimit] Token released', {
      tenantId,
      incidentId,
      runId,
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getConcurrentCount(tenantId: string): number {
    const key = SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId);
    const set = this.store.concurrentSets.get(key);
    return set ? set.size : 0;
  }

  private getIncidentCount(tenantId: string, incidentId: string): number {
    const key = SIMULATION_RATE_LIMIT_KEYS.perIncident(tenantId, incidentId);
    const entry = this.store.incidentCounters.get(key);
    if (!entry) return 0;
    
    const now = this.clock.nowMs();
    if (entry.expiresAt <= now) {
      this.store.incidentCounters.delete(key);
      return 0;
    }
    return entry.count;
  }

  private getIncidentRetryAfter(tenantId: string, incidentId: string): number {
    const key = SIMULATION_RATE_LIMIT_KEYS.perIncident(tenantId, incidentId);
    const entry = this.store.incidentCounters.get(key);
    if (!entry) return 0;
    
    const now = this.clock.nowMs();
    const remainingMs = entry.expiresAt - now;
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  private getDailyCount(tenantId: string): number {
    const key = this.getDailyKey(tenantId);
    return this.store.dailyCounters.get(key) || 0;
  }

  private getDailyKey(tenantId: string): string {
    // Create ISimulationClock adapter from IClock
    const simulationClock: ISimulationClock = {
      now: () => this.clock.now(),
      advanceSeconds: () => {}, // Not used for key generation
      reset: () => {}, // Not used for key generation
    };
    const utcDate = getUtcDateString(simulationClock);
    return SIMULATION_RATE_LIMIT_KEYS.daily(tenantId, utcDate);
  }

  private cleanupExpired(): void {
    const now = this.clock.nowMs();

    // Cleanup expired incident counters
    for (const [key, entry] of this.store.incidentCounters.entries()) {
      if (entry.expiresAt <= now) {
        this.store.incidentCounters.delete(key);
      }
    }

    // Cleanup expired incident locks
    for (const [key, lock] of this.store.incidentLocks.entries()) {
      if (lock.expiresAt <= now) {
        this.store.incidentLocks.delete(key);
      }
    }

    // Cleanup expired run leases
    for (const [key, expiresAt] of this.store.runLeases.entries()) {
      if (expiresAt <= now) {
        this.store.runLeases.delete(key);
      }
    }
  }

  private extractTenantId(request: SimulationRateLimitRequest): string | undefined {
    return request.simulationTenantContext?.tenantId ||
           (request.headers['x-tenant-id'] as string);
  }

  private extractIncidentId(request: SimulationRateLimitRequest): string | undefined {
    // Extract from path: /incidents/:id/simulate
    const match = request.path.match(/\/incidents\/([^/]+)\/simulate/);
    return match ? match[1] : undefined;
  }

  // ============================================================================
  // Testing Helpers
  // ============================================================================

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.store.incidentCounters.clear();
    this.store.concurrentSets.clear();
    this.store.dailyCounters.clear();
    this.store.incidentLocks.clear();
    this.store.runLeases.clear();
  }

  /**
   * Set clock (for testing)
   */
  setClock(clock: IClock): void {
    this.clock = clock;
  }

  /**
   * Get current state (for testing/debugging)
   */
  getState(tenantId: string): {
    concurrent: number;
    daily: number;
    incidentCounts: Map<string, number>;
  } {
    const concurrent = this.getConcurrentCount(tenantId);
    const daily = this.getDailyCount(tenantId);
    
    const incidentCounts = new Map<string, number>();
    for (const [key, entry] of this.store.incidentCounters.entries()) {
      if (key.includes(tenantId) && entry.expiresAt > this.clock.nowMs()) {
        incidentCounts.set(key, entry.count);
      }
    }

    return { concurrent, daily, incidentCounts };
  }
}
