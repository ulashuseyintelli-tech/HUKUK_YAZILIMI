/**
 * Phase 4.2 - Calc Preview Rate Limiting Service
 * 
 * Token Bucket algoritması ile tenant-based rate limiting:
 * - Burst capacity: Ani yük için
 * - Steady-state: Sürekli kullanım için
 * - Trusted bypass: Ops ve test harness için
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4.2
 */

import { Injectable, Logger } from '@nestjs/common';

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

export interface RateLimitConfig {
  // Token bucket parameters
  bucketCapacity: number;      // Max tokens (burst capacity)
  refillRate: number;          // Tokens per second (steady-state)
  refillIntervalMs: number;    // How often to refill
  
  // Tenant-specific overrides
  tenantOverrides?: Record<string, Partial<RateLimitConfig>>;
  
  // Trusted clients (bypass rate limiting)
  trustedClients?: string[];
  
  // Global limits
  globalRequestsPerMinute?: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  // Default: 20 requests burst, 5 requests/second steady
  bucketCapacity: 20,
  refillRate: 5,
  refillIntervalMs: 1000,
  
  // Tenant-specific overrides
  tenantOverrides: {
    // Premium tenants get higher limits
    // 'premium-tenant-id': { bucketCapacity: 50, refillRate: 10 },
  },
  
  // Trusted clients bypass rate limiting
  trustedClients: [
    'internal-ops',
    'test-harness',
    'health-check',
  ],
  
  // Global safety limit
  globalRequestsPerMinute: 1000,
};

// ============================================================================
// TOKEN BUCKET
// ============================================================================

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  config: RateLimitConfig;
}

// ============================================================================
// RATE LIMIT RESULT
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
  retryAfterMs?: number;
  reason?: 'BUCKET_EMPTY' | 'GLOBAL_LIMIT' | 'TENANT_BLOCKED';
}

// ============================================================================
// RATE LIMIT SERVICE
// ============================================================================

@Injectable()
export class CalcPreviewRateLimitService {
  private readonly logger = new Logger(CalcPreviewRateLimitService.name);
  
  // Tenant buckets
  private buckets = new Map<string, TokenBucket>();
  
  // Global counter (sliding window)
  private globalRequests: { timestamp: number }[] = [];
  
  // Blocked tenants (temporary)
  private blockedTenants = new Map<string, number>(); // tenantId -> unblockTime
  
  // Configuration
  private config: RateLimitConfig;

  constructor() {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG };
    
    // Cleanup interval
    setInterval(() => this.cleanup(), 60 * 1000); // Every minute
  }

  /**
   * Check if request is allowed
   * 
   * @param tenantId - Tenant identifier
   * @param clientId - Optional client identifier (for trusted bypass)
   * @returns RateLimitResult
   */
  checkLimit(tenantId: string, clientId?: string): RateLimitResult {
    // 1. Check trusted client bypass
    if (clientId && this.isTrustedClient(clientId)) {
      return {
        allowed: true,
        remaining: Infinity,
        resetAfterMs: 0,
      };
    }
    
    // 2. Check if tenant is blocked
    const blockResult = this.checkTenantBlock(tenantId);
    if (!blockResult.allowed) {
      return blockResult;
    }
    
    // 3. Check global limit
    const globalResult = this.checkGlobalLimit();
    if (!globalResult.allowed) {
      return globalResult;
    }
    
    // 4. Check tenant bucket
    return this.checkTenantBucket(tenantId);
  }

  /**
   * Consume a token (call after successful rate limit check)
   */
  consume(tenantId: string): void {
    const bucket = this.getOrCreateBucket(tenantId);
    
    // Refill first
    this.refillBucket(bucket);
    
    // Consume
    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
    }
    
    // Track global
    this.globalRequests.push({ timestamp: Date.now() });
  }

  /**
   * Block a tenant temporarily (abuse detection)
   */
  blockTenant(tenantId: string, durationMs: number, reason: string): void {
    const unblockTime = Date.now() + durationMs;
    this.blockedTenants.set(tenantId, unblockTime);
    
    this.logger.warn(`[RateLimit] Tenant blocked: ${tenantId}`, {
      reason,
      durationMs,
      unblockTime: new Date(unblockTime).toISOString(),
    });
  }

  /**
   * Unblock a tenant
   */
  unblockTenant(tenantId: string): void {
    this.blockedTenants.delete(tenantId);
    this.logger.log(`[RateLimit] Tenant unblocked: ${tenantId}`);
  }

  /**
   * Get current status for a tenant
   */
  getStatus(tenantId: string): {
    tokens: number;
    capacity: number;
    refillRate: number;
    blocked: boolean;
    blockedUntil?: string;
  } {
    const bucket = this.getOrCreateBucket(tenantId);
    this.refillBucket(bucket);
    
    const blockTime = this.blockedTenants.get(tenantId);
    const blocked = blockTime ? Date.now() < blockTime : false;
    
    return {
      tokens: Math.floor(bucket.tokens),
      capacity: bucket.config.bucketCapacity,
      refillRate: bucket.config.refillRate,
      blocked,
      blockedUntil: blocked && blockTime ? new Date(blockTime).toISOString() : undefined,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('[RateLimit] Configuration updated', config);
  }

  /**
   * Get global stats
   */
  getGlobalStats(): {
    requestsLastMinute: number;
    activeTenants: number;
    blockedTenants: number;
    globalLimit: number;
  } {
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const requestsLastMinute = this.globalRequests.filter(r => r.timestamp > oneMinuteAgo).length;
    
    return {
      requestsLastMinute,
      activeTenants: this.buckets.size,
      blockedTenants: this.blockedTenants.size,
      globalLimit: this.config.globalRequestsPerMinute || 1000,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private isTrustedClient(clientId: string): boolean {
    return this.config.trustedClients?.includes(clientId) || false;
  }

  private checkTenantBlock(tenantId: string): RateLimitResult {
    const blockTime = this.blockedTenants.get(tenantId);
    
    if (blockTime && Date.now() < blockTime) {
      const retryAfterMs = blockTime - Date.now();
      return {
        allowed: false,
        remaining: 0,
        resetAfterMs: retryAfterMs,
        retryAfterMs,
        reason: 'TENANT_BLOCKED',
      };
    }
    
    // Auto-unblock if time passed
    if (blockTime) {
      this.blockedTenants.delete(tenantId);
    }
    
    return { allowed: true, remaining: 0, resetAfterMs: 0 };
  }

  private checkGlobalLimit(): RateLimitResult {
    const limit = this.config.globalRequestsPerMinute || 1000;
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const recentRequests = this.globalRequests.filter(r => r.timestamp > oneMinuteAgo).length;
    
    if (recentRequests >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAfterMs: 60 * 1000,
        retryAfterMs: 5000, // Retry after 5 seconds
        reason: 'GLOBAL_LIMIT',
      };
    }
    
    return { allowed: true, remaining: limit - recentRequests, resetAfterMs: 0 };
  }

  private checkTenantBucket(tenantId: string): RateLimitResult {
    const bucket = this.getOrCreateBucket(tenantId);
    
    // Refill tokens
    this.refillBucket(bucket);
    
    if (bucket.tokens < 1) {
      // Calculate when next token will be available
      const tokensNeeded = 1 - bucket.tokens;
      const msPerToken = bucket.config.refillIntervalMs / bucket.config.refillRate;
      const retryAfterMs = Math.ceil(tokensNeeded * msPerToken);
      
      return {
        allowed: false,
        remaining: 0,
        resetAfterMs: retryAfterMs,
        retryAfterMs,
        reason: 'BUCKET_EMPTY',
      };
    }
    
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetAfterMs: 0,
    };
  }

  private getOrCreateBucket(tenantId: string): TokenBucket {
    let bucket = this.buckets.get(tenantId);
    
    if (!bucket) {
      // Check for tenant-specific config
      const tenantConfig = this.config.tenantOverrides?.[tenantId];
      const config = tenantConfig 
        ? { ...this.config, ...tenantConfig }
        : this.config;
      
      bucket = {
        tokens: config.bucketCapacity,
        lastRefill: Date.now(),
        config,
      };
      
      this.buckets.set(tenantId, bucket);
    }
    
    return bucket;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const intervals = Math.floor(elapsed / bucket.config.refillIntervalMs);
    
    if (intervals > 0) {
      const tokensToAdd = intervals * bucket.config.refillRate;
      bucket.tokens = Math.min(
        bucket.config.bucketCapacity,
        bucket.tokens + tokensToAdd
      );
      bucket.lastRefill = now;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    
    // Cleanup old global requests
    const oneMinuteAgo = now - 60 * 1000;
    this.globalRequests = this.globalRequests.filter(r => r.timestamp > oneMinuteAgo);
    
    // Cleanup expired blocks
    for (const [tenantId, blockTime] of this.blockedTenants.entries()) {
      if (now >= blockTime) {
        this.blockedTenants.delete(tenantId);
      }
    }
    
    // Cleanup inactive buckets (no activity for 10 minutes)
    const tenMinutesAgo = now - 10 * 60 * 1000;
    for (const [tenantId, bucket] of this.buckets.entries()) {
      if (bucket.lastRefill < tenMinutesAgo) {
        this.buckets.delete(tenantId);
      }
    }
  }

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.buckets.clear();
    this.globalRequests = [];
    this.blockedTenants.clear();
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG };
  }
}
