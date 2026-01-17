/**
 * Phase 4.4 - Versioned Cache Service
 * 
 * Doğru seviyede cache:
 * - Rate Provider cache (deterministik, en çok kazanç)
 * - Tariff Provider cache (deterministik, seyrek değişir)
 * - Policy softCheck cache (riskli, kısa TTL)
 * 
 * Tasarım kuralları:
 * - Versioned key: stale data korkusunu önler
 * - Dogpile prevention: singleflight pattern
 * - Negative caching: "not found" da cache'lenir
 * - Observability: hit/miss/load metrics
 * 
 * Guardrails (sessiz ölüm önleme):
 * 1. Key fingerprint: tüm etkileyen parametreler key'e girer
 * 2. Version source-of-truth: tek mekanizmadan üretilir
 * 3. Stale labeling: stale veriler metrics'e işaretlenir
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4.4
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

// ============================================================================
// CACHE TYPES
// ============================================================================

export type CacheNamespace = 
  | 'rate_provider'
  | 'tariff_provider'
  | 'policy_softcheck'
  | 'coverage_map';

export interface CacheConfig {
  namespace: CacheNamespace;
  ttlMs: number;
  maxSize: number;
  staleWhileRevalidate: boolean;
  negativeCacheTtlMs: number;
}

export interface CacheEntry<T> {
  value: T | null;  // null = negative cache
  version: string;
  createdAt: number;
  expiresAt: number;
  isNegative: boolean;
  loadTimeMs?: number | undefined;
  keyFingerprint: string;  // Guardrail 1: tam key fingerprint
  staleServedCount: number; // Guardrail 3: stale servis sayısı
}

export interface CacheStats {
  namespace: CacheNamespace;
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  avgLoadTimeMs: number;
  evictions: number;
  negativeEntries: number;
  staleHits: number;        // Guardrail 3: stale hit sayısı
  staleServedTotal: number; // Guardrail 3: toplam stale servis
}

// ============================================================================
// KEY FINGERPRINT SCHEMAS (Guardrail 1)
// ============================================================================

/**
 * Rate Provider cache key schema
 * Tüm etkileyen parametreler dahil
 */
export interface RateProviderKeyParams {
  tenantId: string;
  rateType: string;        // LEGAL_3095, TCMB_AVANS, etc.
  startDate: string;       // ISO date
  endDate: string;         // ISO date
  currency: string;        // TRY, USD, EUR
  jurisdiction?: string;   // TR, etc.
}

/**
 * Tariff Provider cache key schema
 */
export interface TariffProviderKeyParams {
  tenantId: string;
  tariffCode: string;      // ILAMSIZ, ILAMLI, etc.
  asOfDate: string;        // ISO date
  jurisdiction?: string;
}

/**
 * Policy SoftCheck cache key schema
 */
export interface PolicySoftCheckKeyParams {
  tenantId: string;
  policyVersion: string;
  requestFingerprint: string;  // hash of request params
}

/**
 * Coverage Map cache key schema
 */
export interface CoverageMapKeyParams {
  tenantId: string;
  rateType: string;
  startDate: string;
  endDate: string;
  currency: string;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const CACHE_CONFIGS: Record<CacheNamespace, CacheConfig> = {
  rate_provider: {
    namespace: 'rate_provider',
    ttlMs: 60 * 60 * 1000,        // 1 hour (rates change daily at most)
    maxSize: 1000,
    staleWhileRevalidate: true,   // Preview'da stale OK
    negativeCacheTtlMs: 5 * 60 * 1000,  // 5 min for "rate not found"
  },
  tariff_provider: {
    namespace: 'tariff_provider',
    ttlMs: 24 * 60 * 60 * 1000,   // 24 hours (tariffs change yearly)
    maxSize: 500,
    staleWhileRevalidate: true,
    negativeCacheTtlMs: 10 * 60 * 1000,
  },
  coverage_map: {
    namespace: 'coverage_map',
    ttlMs: 30 * 60 * 1000,        // 30 min (derived from rates)
    maxSize: 500,
    staleWhileRevalidate: true,
    negativeCacheTtlMs: 5 * 60 * 1000,
  },
  policy_softcheck: {
    namespace: 'policy_softcheck',
    ttlMs: 5 * 60 * 1000,         // 5 min (policy can change)
    maxSize: 200,
    staleWhileRevalidate: false,  // Policy'de stale tehlikeli
    negativeCacheTtlMs: 1 * 60 * 1000,
  },
};

// ============================================================================
// VERSIONED CACHE SERVICE
// ============================================================================

@Injectable()
export class VersionedCacheService {
  private readonly logger = new Logger(VersionedCacheService.name);
  
  // Namespace-based caches
  private caches = new Map<CacheNamespace, Map<string, CacheEntry<unknown>>>();
  
  // Stats per namespace
  private stats = new Map<CacheNamespace, {
    hits: number;
    misses: number;
    totalLoadTimeMs: number;
    loadCount: number;
    evictions: number;
    staleHits: number;        // Guardrail 3
    staleServedTotal: number; // Guardrail 3
  }>();
  
  // Singleflight: prevent dogpile
  private inflight = new Map<string, Promise<unknown>>();
  
  // Version source-of-truth (Guardrail 2)
  private versionRegistry = new Map<CacheNamespace, string>();

  constructor() {
    // Initialize caches
    for (const namespace of Object.keys(CACHE_CONFIGS) as CacheNamespace[]) {
      this.caches.set(namespace, new Map());
      this.stats.set(namespace, {
        hits: 0,
        misses: 0,
        totalLoadTimeMs: 0,
        loadCount: 0,
        evictions: 0,
        staleHits: 0,
        staleServedTotal: 0,
      });
      // Initialize version registry with default
      this.versionRegistry.set(namespace, '1.0.0');
    }
    
    // Cleanup interval
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  // ============================================================================
  // GUARDRAIL 1: KEY FINGERPRINT BUILDERS
  // ============================================================================

  /**
   * Build rate provider cache key with full fingerprint
   */
  buildRateProviderKey(params: RateProviderKeyParams): string {
    const normalized = {
      t: params.tenantId,
      r: params.rateType,
      s: params.startDate,
      e: params.endDate,
      c: params.currency,
      j: params.jurisdiction || 'TR',
    };
    return this.hashObject(normalized);
  }

  /**
   * Build tariff provider cache key with full fingerprint
   */
  buildTariffProviderKey(params: TariffProviderKeyParams): string {
    const normalized = {
      t: params.tenantId,
      c: params.tariffCode,
      d: params.asOfDate,
      j: params.jurisdiction || 'TR',
    };
    return this.hashObject(normalized);
  }

  /**
   * Build policy softcheck cache key with full fingerprint
   */
  buildPolicySoftCheckKey(params: PolicySoftCheckKeyParams): string {
    const normalized = {
      t: params.tenantId,
      v: params.policyVersion,
      f: params.requestFingerprint,
    };
    return this.hashObject(normalized);
  }

  /**
   * Build coverage map cache key with full fingerprint
   */
  buildCoverageMapKey(params: CoverageMapKeyParams): string {
    const normalized = {
      t: params.tenantId,
      r: params.rateType,
      s: params.startDate,
      e: params.endDate,
      c: params.currency,
    };
    return this.hashObject(normalized);
  }

  private hashObject(obj: Record<string, string>): string {
    const sorted = Object.keys(obj).sort().map(k => `${k}:${obj[k]}`).join('|');
    return createHash('md5').update(sorted).digest('hex').substring(0, 16);
  }

  // ============================================================================
  // GUARDRAIL 2: VERSION SOURCE-OF-TRUTH
  // ============================================================================

  /**
   * Get current version for a namespace (single source)
   */
  getCurrentVersion(namespace: CacheNamespace): string {
    return this.versionRegistry.get(namespace) || '1.0.0';
  }

  /**
   * Update version for a namespace (triggers invalidation)
   */
  updateVersion(namespace: CacheNamespace, newVersion: string): void {
    const oldVersion = this.versionRegistry.get(namespace);
    this.versionRegistry.set(namespace, newVersion);
    
    // Invalidate old version entries
    if (oldVersion && oldVersion !== newVersion) {
      this.invalidateVersion(namespace, oldVersion);
      this.logger.log(`[Cache] Version updated: ${namespace} ${oldVersion} → ${newVersion}`);
    }
  }

  /**
   * Get all current versions
   */
  getAllVersions(): Record<CacheNamespace, string> {
    const result: Partial<Record<CacheNamespace, string>> = {};
    for (const [ns, version] of this.versionRegistry.entries()) {
      result[ns] = version;
    }
    return result as Record<CacheNamespace, string>;
  }

  // ============================================================================
  // CORE CACHE OPERATIONS
  // ============================================================================

  /**
   * Get from cache
   * Guardrail 3: stale hits are tracked in metrics
   */
  get<T>(
    namespace: CacheNamespace,
    key: string,
    version: string,
  ): { hit: boolean; value?: T | undefined; stale?: boolean | undefined; keyFingerprint?: string | undefined } {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);
    
    if (!cache || !stats) {
      return { hit: false };
    }
    
    const fullKey = this.buildKey(namespace, key, version);
    const entry = cache.get(fullKey) as CacheEntry<T> | undefined;
    
    if (!entry) {
      stats.misses++;
      return { hit: false };
    }
    
    const now = Date.now();
    const isExpired = now > entry.expiresAt;
    const config = CACHE_CONFIGS[namespace];
    
    // Expired and no stale-while-revalidate
    if (isExpired && !config.staleWhileRevalidate) {
      stats.misses++;
      cache.delete(fullKey);
      return { hit: false };
    }
    
    // Hit (possibly stale)
    stats.hits++;
    
    // Guardrail 3: Track stale hits
    if (isExpired) {
      stats.staleHits++;
      entry.staleServedCount++;
      stats.staleServedTotal++;
      
      this.logger.debug(`[Cache] Stale hit: ${fullKey}`, {
        staleServedCount: entry.staleServedCount,
        expiredAt: new Date(entry.expiresAt).toISOString(),
      });
    }
    
    // Negative cache hit
    if (entry.isNegative) {
      return { 
        hit: true, 
        value: undefined, 
        stale: isExpired,
        keyFingerprint: entry.keyFingerprint,
      };
    }
    
    return { 
      hit: true, 
      value: entry.value as T, 
      stale: isExpired,
      keyFingerprint: entry.keyFingerprint,
    };
  }

  /**
   * Set in cache
   * Guardrail 1: keyFingerprint stored for debugging
   */
  set<T>(
    namespace: CacheNamespace,
    key: string,
    version: string,
    value: T | null,
    loadTimeMs?: number,
  ): void {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);
    const config = CACHE_CONFIGS[namespace];
    
    if (!cache || !stats || !config) return;
    
    // Evict if at capacity
    if (cache.size >= config.maxSize) {
      this.evictOldest(namespace);
    }
    
    const fullKey = this.buildKey(namespace, key, version);
    const isNegative = value === null;
    const ttl = isNegative ? config.negativeCacheTtlMs : config.ttlMs;
    
    const entry: CacheEntry<T> = {
      value,
      version,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      isNegative,
      loadTimeMs,
      keyFingerprint: key,  // Guardrail 1: store original key for debugging
      staleServedCount: 0,  // Guardrail 3: initialize stale counter
    };
    
    cache.set(fullKey, entry);
    
    // Update stats
    if (loadTimeMs) {
      stats.totalLoadTimeMs += loadTimeMs;
      stats.loadCount++;
    }
  }

  /**
   * Get or load with singleflight
   * Prevents dogpile: multiple concurrent requests for same key
   */
  async getOrLoad<T>(
    namespace: CacheNamespace,
    key: string,
    version: string,
    loader: () => Promise<T | null>,
  ): Promise<{ value: T | null; cached: boolean; stale: boolean; loadTimeMs?: number }> {
    // Try cache first
    const cached = this.get<T>(namespace, key, version);
    
    if (cached.hit && !cached.stale) {
      return { 
        value: cached.value ?? null, 
        cached: true, 
        stale: false,
      };
    }
    
    // Stale hit - return stale but trigger background refresh
    if (cached.hit && cached.stale) {
      // Background refresh (fire and forget)
      this.backgroundRefresh(namespace, key, version, loader);
      
      return { 
        value: cached.value ?? null, 
        cached: true, 
        stale: true,
      };
    }
    
    // Cache miss - load with singleflight
    const fullKey = this.buildKey(namespace, key, version);
    
    // Check if already loading
    const inflight = this.inflight.get(fullKey);
    if (inflight) {
      const value = await inflight as T | null;
      return { value, cached: false, stale: false };
    }
    
    // Start loading
    const loadPromise = this.load(namespace, key, version, loader);
    this.inflight.set(fullKey, loadPromise);
    
    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.inflight.delete(fullKey);
    }
  }

  /**
   * Invalidate cache entry
   */
  invalidate(namespace: CacheNamespace, key: string, version: string): void {
    const cache = this.caches.get(namespace);
    if (!cache) return;
    
    const fullKey = this.buildKey(namespace, key, version);
    cache.delete(fullKey);
    
    this.logger.debug(`[Cache] Invalidated: ${fullKey}`);
  }

  /**
   * Invalidate all entries for a namespace
   */
  invalidateNamespace(namespace: CacheNamespace): void {
    const cache = this.caches.get(namespace);
    if (!cache) return;
    
    const size = cache.size;
    cache.clear();
    
    this.logger.log(`[Cache] Namespace invalidated: ${namespace} (${size} entries)`);
  }

  /**
   * Invalidate all entries with a specific version
   */
  invalidateVersion(namespace: CacheNamespace, version: string): void {
    const cache = this.caches.get(namespace);
    if (!cache) return;
    
    let count = 0;
    for (const [key, entry] of cache.entries()) {
      if (entry.version === version) {
        cache.delete(key);
        count++;
      }
    }
    
    this.logger.log(`[Cache] Version invalidated: ${namespace}:${version} (${count} entries)`);
  }

  // ============================================================================
  // STATS & MONITORING
  // ============================================================================

  /**
   * Get cache stats for a namespace
   * Guardrail 3: includes stale metrics
   */
  getStats(namespace: CacheNamespace): CacheStats {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);
    
    if (!cache || !stats) {
      return {
        namespace,
        size: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgLoadTimeMs: 0,
        evictions: 0,
        negativeEntries: 0,
        staleHits: 0,
        staleServedTotal: 0,
      };
    }
    
    const total = stats.hits + stats.misses;
    const negativeEntries = Array.from(cache.values()).filter(e => e.isNegative).length;
    
    return {
      namespace,
      size: cache.size,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: total > 0 ? stats.hits / total : 0,
      avgLoadTimeMs: stats.loadCount > 0 ? stats.totalLoadTimeMs / stats.loadCount : 0,
      evictions: stats.evictions,
      negativeEntries,
      staleHits: stats.staleHits,
      staleServedTotal: stats.staleServedTotal,
    };
  }

  /**
   * Get all cache stats
   */
  getAllStats(): CacheStats[] {
    return (Object.keys(CACHE_CONFIGS) as CacheNamespace[]).map(ns => this.getStats(ns));
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private buildKey(namespace: CacheNamespace, key: string, version: string): string {
    return `${namespace}:${version}:${key}`;
  }

  private async load<T>(
    namespace: CacheNamespace,
    key: string,
    version: string,
    loader: () => Promise<T | null>,
  ): Promise<{ value: T | null; cached: boolean; stale: boolean; loadTimeMs: number }> {
    const startTime = Date.now();
    
    try {
      const value = await loader();
      const loadTimeMs = Date.now() - startTime;
      
      // Cache the result (including null for negative cache)
      this.set(namespace, key, version, value, loadTimeMs);
      
      return { value, cached: false, stale: false, loadTimeMs };
    } catch (error) {
      this.logger.error(`[Cache] Load error: ${namespace}:${key}`, error);
      throw error;
    }
  }

  private backgroundRefresh<T>(
    namespace: CacheNamespace,
    key: string,
    version: string,
    loader: () => Promise<T | null>,
  ): void {
    const fullKey = this.buildKey(namespace, key, version);
    
    // Don't refresh if already in flight
    if (this.inflight.has(fullKey)) return;
    
    // Fire and forget
    this.load(namespace, key, version, loader).catch(error => {
      this.logger.warn(`[Cache] Background refresh failed: ${fullKey}`, error);
    });
  }

  private evictOldest(namespace: CacheNamespace): void {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);
    
    if (!cache || !stats) return;
    
    // Find oldest entry
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    
    for (const [key, entry] of cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      cache.delete(oldestKey);
      stats.evictions++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    
    for (const [namespace, cache] of this.caches.entries()) {
      const config = CACHE_CONFIGS[namespace];
      
      for (const [key, entry] of cache.entries()) {
        // Remove expired entries (with some grace period for stale-while-revalidate)
        const gracePeriod = config.staleWhileRevalidate ? config.ttlMs : 0;
        if (now > entry.expiresAt + gracePeriod) {
          cache.delete(key);
        }
      }
    }
  }

  /**
   * Reset all caches (for testing)
   */
  reset(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    
    for (const stats of this.stats.values()) {
      stats.hits = 0;
      stats.misses = 0;
      stats.totalLoadTimeMs = 0;
      stats.loadCount = 0;
      stats.evictions = 0;
      stats.staleHits = 0;
      stats.staleServedTotal = 0;
    }
    
    this.inflight.clear();
    
    // Reset versions to default
    for (const namespace of Object.keys(CACHE_CONFIGS) as CacheNamespace[]) {
      this.versionRegistry.set(namespace, '1.0.0');
    }
  }
}
