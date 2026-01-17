/**
 * Region Module
 * 
 * Region-aware naming and scoping.
 * Phase 6C: Naming only, no routing.
 */

// Types
export type {
  RegionId,
  TenantScope,
  ArtifactNamespace,
  ArtifactScope,
  ScopedKeyComponents,
  ScopedKeyOptions,
  RegionMeta,
} from './region.types';

// Constants
export {
  DEFAULT_REGION,
  KNOWN_REGIONS,
  ARTIFACT_NAMESPACES,
  REGION_ID_PATTERN,
  SCOPED_KEY_PATTERN,
  KEY_PREFIXES,
} from './region.constants';

// Key builders
export {
  buildScopedKey,
  parseScopedKey,
  isValidScopedKey,
  isValidRegionId,
  isValidNamespace,
  buildCacheKey,
  buildBreakerKey,
  buildRateLimitKey,
  buildTraceKey,
  buildLockKey,
  buildSessionKey,
  createTenantScope,
  formatTenantScope,
} from './scoped-key';
