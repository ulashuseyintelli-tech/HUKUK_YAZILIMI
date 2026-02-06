/**
 * Manifest Admin Guards
 * 
 * Phase 10.2 - Admin endpoint protection
 */

export {
  ManifestAdminAuthGuard,
  ManifestAdminFeatureFlagService,
  MockManifestAdminFeatureFlagService,
  IManifestAdminFeatureFlagService,
  ManifestAdminAuthConfig,
  DEFAULT_MANIFEST_ADMIN_AUTH_CONFIG,
  AuthUser,
  RequestWithUser,
} from './manifest-admin-auth.guard';

export {
  ManifestAdminRateLimiter,
  ManifestAdminRateLimitGuard,
  RateLimit,
  RateLimitType,
  RateLimitConfig,
  RateLimitResult,
  DEFAULT_RATE_LIMIT_CONFIG,
  RATE_LIMIT_TYPE_KEY,
} from './manifest-admin-rate-limiter.service';
