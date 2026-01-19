/**
 * In-Memory Rate Limit Store
 * 
 * Phase 9A - Task 2.2
 * 
 * In-memory implementation of IRateLimitStore interface.
 * Used as fallback when Redis is unavailable and for testing.
 * 
 * Extracted from SimulationRateLimitGuard for interface compliance.
 */

import { Injectable } from '@nestjs/common';
import { IClock } from '../../evidence/clock.service';
import {
  IRateLimitStore,
  IncrementResult,
  AcquireLockResult,
} from './rate-limit-store.interface';
import { SIMULATION_RATE_LIMIT_KEYS } from '../simulation-rate-limit.constants';

// ============================================================================
// Internal Store Types
// ============================================================================

interface CounterEntry {
  count: number;
  expiresAt: number;
}

interface LockEntry {
  runId: string;
  expiresAt: number;
}

interface ConcurrentEntry {
  runId: string;
  expiresAt: number;
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class InMemoryRateLimitStore implements IRateLimitStore {
  // Per-incident counters with TTL
  private readonly incidentCounters = new Map<string, CounterEntry>();
  // Concurrent run entries per tenant (Map of tenantKey -> Map of runId -> entry)
  private readonly concurrentSets = new Map<string, Map<string, ConcurrentEntry>>();
  // Daily counters per tenant
  private readonly dailyCounters = new Map<string, number>();
  // Incident locks for 409 ALREADY_RUNNING
  private readonly incidentLocks = new Map<string, LockEntry>();

  constructor(private readonly clock: IClock) {}

  // ============================================================================
  // Per-Incident Rate Limiting
  // ============================================================================

  async incrementIncidentCounter(
    tenantId: string,
    incidentId: string,
    ttlSec: number,
  ): Promise<IncrementResult> {
    const key = SIMULATION_RATE_LIMIT_KEYS.perIncident(tenantId, incidentId);
    const now = this.clock.nowMs();
    const expiresAt = now + ttlSec * 1000;

    const existing = this.incidentCounters.get(key);
    
    if (existing && existing.expiresAt > now) {
      // Key exists and not expired - increment
      existing.count++;
      const ttlRemaining = Math.ceil((existing.expiresAt - now) / 1000);
      return { count: existing.count, ttlRemaining };
    }

    // Key doesn't exist or expired - create new
    this.incidentCounters.set(key, { count: 1, expiresAt });
    return { count: 1, ttlRemaining: ttlSec };
  }

  async getIncidentCounter(
    tenantId: string,
    incidentId: string,
  ): Promise<IncrementResult | null> {
    const key = SIMULATION_RATE_LIMIT_KEYS.perIncident(tenantId, incidentId);
    const now = this.clock.nowMs();
    const entry = this.incidentCounters.get(key);

    if (!entry || entry.expiresAt <= now) {
      // Cleanup expired
      if (entry) this.incidentCounters.delete(key);
      return null;
    }

    const ttlRemaining = Math.ceil((entry.expiresAt - now) / 1000);
    return { count: entry.count, ttlRemaining };
  }

  // ============================================================================
  // Concurrent Tracking
  // ============================================================================

  async addToConcurrentSet(
    tenantId: string,
    runId: string,
    ttlSec: number,
  ): Promise<void> {
    const key = SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId);
    const now = this.clock.nowMs();
    const expiresAt = now + ttlSec * 1000;

    if (!this.concurrentSets.has(key)) {
      this.concurrentSets.set(key, new Map());
    }

    const set = this.concurrentSets.get(key)!;
    set.set(runId, { runId, expiresAt });
  }

  async removeFromConcurrentSet(
    tenantId: string,
    runId: string,
  ): Promise<void> {
    const key = SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId);
    const set = this.concurrentSets.get(key);
    
    if (set) {
      set.delete(runId);
    }
  }

  async getConcurrentCount(tenantId: string): Promise<number> {
    const key = SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId);
    const set = this.concurrentSets.get(key);
    
    if (!set) return 0;

    // Cleanup expired entries and count
    const now = this.clock.nowMs();
    let count = 0;
    
    for (const [runId, entry] of set.entries()) {
      if (entry.expiresAt <= now) {
        set.delete(runId);
      } else {
        count++;
      }
    }

    return count;
  }

  // ============================================================================
  // Daily Counters
  // ============================================================================

  async incrementDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number> {
    const key = SIMULATION_RATE_LIMIT_KEYS.daily(tenantId, utcDate);
    const current = this.dailyCounters.get(key) || 0;
    const newCount = current + 1;
    this.dailyCounters.set(key, newCount);
    return newCount;
  }

  async getDailyCounter(
    tenantId: string,
    utcDate: string,
  ): Promise<number> {
    const key = SIMULATION_RATE_LIMIT_KEYS.daily(tenantId, utcDate);
    return this.dailyCounters.get(key) || 0;
  }

  // ============================================================================
  // Incident Locks
  // ============================================================================

  async acquireIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
    ttlSec: number,
  ): Promise<AcquireLockResult> {
    const key = SIMULATION_RATE_LIMIT_KEYS.incidentLock(tenantId, incidentId);
    const now = this.clock.nowMs();
    const existing = this.incidentLocks.get(key);

    // Check if lock exists and not expired
    if (existing && existing.expiresAt > now) {
      return {
        acquired: false,
        existingRunId: existing.runId,
      };
    }

    // Acquire lock
    this.incidentLocks.set(key, {
      runId,
      expiresAt: now + ttlSec * 1000,
    });

    return { acquired: true };
  }

  async releaseIncidentLock(
    tenantId: string,
    incidentId: string,
    runId: string,
  ): Promise<boolean> {
    const key = SIMULATION_RATE_LIMIT_KEYS.incidentLock(tenantId, incidentId);
    const existing = this.incidentLocks.get(key);

    // Only release if runId matches (atomic check-and-delete)
    if (existing && existing.runId === runId) {
      this.incidentLocks.delete(key);
      return true;
    }

    return false;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    // In-memory store is always healthy
    return true;
  }

  async cleanup(): Promise<void> {
    const now = this.clock.nowMs();

    // Cleanup expired incident counters
    for (const [key, entry] of this.incidentCounters.entries()) {
      if (entry.expiresAt <= now) {
        this.incidentCounters.delete(key);
      }
    }

    // Cleanup expired incident locks
    for (const [key, lock] of this.incidentLocks.entries()) {
      if (lock.expiresAt <= now) {
        this.incidentLocks.delete(key);
      }
    }

    // Cleanup expired concurrent entries
    for (const [, set] of this.concurrentSets.entries()) {
      for (const [runId, entry] of set.entries()) {
        if (entry.expiresAt <= now) {
          set.delete(runId);
        }
      }
    }
  }

  async reset(): Promise<void> {
    this.incidentCounters.clear();
    this.concurrentSets.clear();
    this.dailyCounters.clear();
    this.incidentLocks.clear();
  }

  // ============================================================================
  // Debug Helpers
  // ============================================================================

  /**
   * Get current state for debugging/testing
   */
  getState(tenantId: string): {
    concurrent: number;
    daily: number;
    incidentCounts: Map<string, number>;
  } {
    const now = this.clock.nowMs();
    const utcDate = this.clock.nowIso().slice(0, 10);

    // Get concurrent count
    const concurrentKey = SIMULATION_RATE_LIMIT_KEYS.perTenantConcurrent(tenantId);
    const concurrentSet = this.concurrentSets.get(concurrentKey);
    let concurrent = 0;
    if (concurrentSet) {
      for (const entry of concurrentSet.values()) {
        if (entry.expiresAt > now) concurrent++;
      }
    }

    // Get daily count
    const dailyKey = SIMULATION_RATE_LIMIT_KEYS.daily(tenantId, utcDate);
    const daily = this.dailyCounters.get(dailyKey) || 0;

    // Get incident counts
    const incidentCounts = new Map<string, number>();
    for (const [key, entry] of this.incidentCounters.entries()) {
      if (key.includes(tenantId) && entry.expiresAt > now) {
        incidentCounts.set(key, entry.count);
      }
    }

    return { concurrent, daily, incidentCounts };
  }
}
