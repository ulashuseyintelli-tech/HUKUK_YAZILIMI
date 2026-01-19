/**
 * Redis Rate Limit Store - Public API
 * 
 * Phase 9A - Redis Migration for Operational Layer
 */

// Configuration
export {
  RedisConfig,
  RedisPoolConfig,
  Phase9AConfig,
  DEFAULT_REDIS_CONFIG,
  DEFAULT_POOL_CONFIG,
  parsePhase9AConfig,
  validatePhase9AConfig,
  ConfigValidationResult,
} from './redis-config';

// Interfaces
export {
  IRateLimitStore,
  IRateLimitMetrics,
  IncrementResult,
  AcquireLockResult,
} from './rate-limit-store.interface';

// Implementations
export { InMemoryRateLimitStore } from './in-memory-rate-limit-store';
export { RedisRateLimitStore } from './redis-rate-limit-store';
export {
  FailoverHandler,
  FailoverState,
  FailoverStatus,
  FailoverConfig,
  DEFAULT_FAILOVER_CONFIG,
} from './failover-handler';

// Metrics
export {
  RateLimitMetrics,
  NoOpRateLimitMetrics,
  MetricsSnapshot,
  LatencyBucket,
} from './rate-limit-metrics';
