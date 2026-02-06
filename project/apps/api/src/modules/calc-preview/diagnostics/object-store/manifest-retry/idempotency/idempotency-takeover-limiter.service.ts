/**
 * Idempotency Takeover Rate Limiter
 * 
 * Phase 10.3 - PR-5
 * 
 * Prevents abuse of takeover mechanism by rate limiting per actor.
 * 
 * RATIONALE:
 * - Takeover is a safety mechanism for stuck actions
 * - Excessive takeovers indicate either:
 *   a) System issues (lease too short, slow handlers)
 *   b) Abuse (intentional lease expiration)
 * - Rate limiting protects against (b) while allowing (a) to surface as alerts
 * 
 * ALGORITHM:
 * - Sliding window counter per actor
 * - Default: max 5 takeovers per 5 minutes per actor
 * - Exceeding limit → 429 Too Many Requests
 */

import { Injectable, Logger } from '@nestjs/common';

// ============================================================================
// Configuration
// ============================================================================

export interface TakeoverLimiterConfig {
  /** Maximum takeovers allowed per window */
  maxTakeovers: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Cleanup interval for expired entries */
  cleanupIntervalMs: number;
}

export const DEFAULT_TAKEOVER_LIMITER_CONFIG: TakeoverLimiterConfig = {
  maxTakeovers: 5,
  windowMs: 5 * 60 * 1000, // 5 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

// ============================================================================
// Types
// ============================================================================

interface TakeoverRecord {
  timestamps: number[];
}

export interface TakeoverLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  retryAfterMs?: number;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class IdempotencyTakeoverLimiterService {
  private readonly logger = new Logger(IdempotencyTakeoverLimiterService.name);
  private readonly config: TakeoverLimiterConfig;
  private readonly records: Map<string, TakeoverRecord> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<TakeoverLimiterConfig>) {
    this.config = { ...DEFAULT_TAKEOVER_LIMITER_CONFIG, ...config };
  }

  /**
   * Start cleanup timer.
   */
  onModuleInit(): void {
    this.startCleanupTimer();
  }

  /**
   * Stop cleanup timer.
   */
  onModuleDestroy(): void {
    this.stopCleanupTimer();
  }

  /**
   * Check if takeover is allowed for actor.
   * If allowed, records the takeover.
   */
  checkAndRecord(actorId: string): TakeoverLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create record
    let record = this.records.get(actorId);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(actorId, record);
    }

    // Filter to current window
    record.timestamps = record.timestamps.filter(ts => ts > windowStart);

    // Check limit
    if (record.timestamps.length >= this.config.maxTakeovers) {
      // Calculate retry-after based on oldest timestamp in window
      const oldestInWindow = Math.min(...record.timestamps);
      const retryAfterMs = oldestInWindow + this.config.windowMs - now;

      this.logger.warn(
        `[TakeoverLimiter] Rate limit exceeded: actor=${actorId}, count=${record.timestamps.length}, limit=${this.config.maxTakeovers}`,
      );

      return {
        allowed: false,
        currentCount: record.timestamps.length,
        limit: this.config.maxTakeovers,
        retryAfterMs: Math.max(0, retryAfterMs),
      };
    }

    // Record takeover
    record.timestamps.push(now);

    return {
      allowed: true,
      currentCount: record.timestamps.length,
      limit: this.config.maxTakeovers,
    };
  }

  /**
   * Get current takeover count for actor (without recording).
   */
  getCount(actorId: string): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const record = this.records.get(actorId);
    
    if (!record) return 0;
    
    return record.timestamps.filter(ts => ts > windowStart).length;
  }

  /**
   * Get all actors with takeovers in current window.
   */
  getActiveActors(): Map<string, number> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const result = new Map<string, number>();

    for (const [actorId, record] of this.records.entries()) {
      const count = record.timestamps.filter(ts => ts > windowStart).length;
      if (count > 0) {
        result.set(actorId, count);
      }
    }

    return result;
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleaned = 0;

    for (const [actorId, record] of this.records.entries()) {
      // Filter timestamps
      record.timestamps = record.timestamps.filter(ts => ts > windowStart);
      
      // Remove empty records
      if (record.timestamps.length === 0) {
        this.records.delete(actorId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`[TakeoverLimiter] Cleaned ${cleaned} expired records`);
    }
  }

  // ==========================================================================
  // Testing
  // ==========================================================================

  /**
   * Reset all records (for testing).
   */
  reset(): void {
    this.records.clear();
  }
}
