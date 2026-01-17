/**
 * Scoped Key Builder
 * 
 * Single source of truth for key format.
 * Format: r:{regionId}:t:{tenantId}:{namespace}:{key}
 */

import type {
  RegionId,
  TenantScope,
  ArtifactNamespace,
  ScopedKeyOptions,
  ScopedKeyComponents,
} from './region.types';
import {
  DEFAULT_REGION,
  ARTIFACT_NAMESPACES,
  SCOPED_KEY_PATTERN,
  REGION_ID_PATTERN,
  KEY_PREFIXES,
} from './region.constants';

/**
 * Build a scoped key.
 * 
 * @example
 * buildScopedKey({ tenantId: '123', namespace: 'cache', key: 'rate:v5' })
 * // => 'r:tr-default:t:123:cache:rate:v5'
 */
export function buildScopedKey(options: ScopedKeyOptions): string {
  const regionId = options.regionId ?? DEFAULT_REGION;
  
  return [
    `${KEY_PREFIXES.REGION}:${regionId}`,
    `${KEY_PREFIXES.TENANT}:${options.tenantId}`,
    options.namespace,
    options.key,
  ].join(':');
}

/**
 * Parse a scoped key back to components.
 * Returns null if key format is invalid.
 * 
 * @example
 * parseScopedKey('r:tr-default:t:123:cache:rate:v5')
 * // => { regionId: 'tr-default', tenantId: '123', namespace: 'cache', key: 'rate:v5' }
 */
export function parseScopedKey(key: string): ScopedKeyComponents | null {
  const match = key.match(SCOPED_KEY_PATTERN);
  if (!match) return null;

  const [, regionId, tenantId, namespace, artifactKey] = match;
  
  if (!regionId || !tenantId || !namespace || !artifactKey) {
    return null;
  }

  // Validate namespace
  if (!isValidNamespace(namespace)) {
    return null;
  }

  return {
    regionId,
    tenantId,
    namespace: namespace as ArtifactNamespace,
    key: artifactKey,
  };
}

/**
 * Validate a scoped key format.
 */
export function isValidScopedKey(key: string): boolean {
  return parseScopedKey(key) !== null;
}

/**
 * Validate a region ID format.
 */
export function isValidRegionId(regionId: string): boolean {
  return REGION_ID_PATTERN.test(regionId);
}

/**
 * Validate an artifact namespace.
 */
export function isValidNamespace(namespace: string): namespace is ArtifactNamespace {
  return ARTIFACT_NAMESPACES.includes(namespace as ArtifactNamespace);
}

// ============================================================================
// NAMESPACE-SPECIFIC BUILDERS
// ============================================================================

/**
 * Build a cache key.
 * 
 * @example
 * buildCacheKey({ regionId: 'tr-default', tenantId: '123' }, 'rate:v5:2024-01-15')
 * // => 'r:tr-default:t:123:cache:rate:v5:2024-01-15'
 */
export function buildCacheKey(scope: TenantScope, cacheKey: string): string {
  return buildScopedKey({
    regionId: scope.regionId,
    tenantId: scope.tenantId,
    namespace: 'cache',
    key: cacheKey,
  });
}

/**
 * Build a circuit breaker key.
 * 
 * @example
 * buildBreakerKey({ regionId: 'tr-default', tenantId: '123' }, 'rate_provider')
 * // => 'r:tr-default:t:123:cb:rate_provider'
 */
export function buildBreakerKey(scope: TenantScope, dependency: string): string {
  return buildScopedKey({
    regionId: scope.regionId,
    tenantId: scope.tenantId,
    namespace: 'cb',
    key: dependency,
  });
}

/**
 * Build a rate limit key.
 * 
 * @example
 * buildRateLimitKey({ regionId: 'tr-default', tenantId: '123' }, 'calc_preview')
 * // => 'r:tr-default:t:123:rl:calc_preview'
 */
export function buildRateLimitKey(scope: TenantScope, endpoint: string): string {
  return buildScopedKey({
    regionId: scope.regionId,
    tenantId: scope.tenantId,
    namespace: 'rl',
    key: endpoint,
  });
}

/**
 * Build a trace key.
 * 
 * @example
 * buildTraceKey({ regionId: 'tr-default', tenantId: '123' }, 'abc-123')
 * // => 'r:tr-default:t:123:trace:abc-123'
 */
export function buildTraceKey(scope: TenantScope, traceId: string): string {
  return buildScopedKey({
    regionId: scope.regionId,
    tenantId: scope.tenantId,
    namespace: 'trace',
    key: traceId,
  });
}

/**
 * Build a lock key.
 * 
 * @example
 * buildLockKey({ regionId: 'tr-default', tenantId: '123' }, 'case:456')
 * // => 'r:tr-default:t:123:lock:case:456'
 */
export function buildLockKey(scope: TenantScope, resource: string): string {
  return buildScopedKey({
    regionId: scope.regionId,
    tenantId: scope.tenantId,
    namespace: 'lock',
    key: resource,
  });
}

/**
 * Build a session key.
 * 
 * @example
 * buildSessionKey({ regionId: 'tr-default', tenantId: '123' }, 'user:789')
 * // => 'r:tr-default:t:123:session:user:789'
 */
export function buildSessionKey(scope: TenantScope, sessionId: string): string {
  return buildScopedKey({
    regionId: scope.regionId,
    tenantId: scope.tenantId,
    namespace: 'session',
    key: sessionId,
  });
}

// ============================================================================
// SCOPE HELPERS
// ============================================================================

/**
 * Create a tenant scope with default region.
 */
export function createTenantScope(tenantId: string, regionId?: RegionId): TenantScope {
  return {
    regionId: regionId ?? DEFAULT_REGION,
    tenantId,
  };
}

/**
 * Format tenant scope as string.
 * Used for logging and display.
 */
export function formatTenantScope(scope: TenantScope): string {
  return `${scope.regionId}/${scope.tenantId}`;
}
