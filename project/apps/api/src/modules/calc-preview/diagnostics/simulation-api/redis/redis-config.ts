/**
 * Redis Configuration Module
 * 
 * Phase 9A - Task 1.2
 * 
 * Configuration for Redis connection with connection pooling settings.
 * Supports both production Redis and local development.
 */

// ============================================================================
// Configuration Interface
// ============================================================================

export interface RedisConfig {
  /** Redis connection URL (redis://host:port) */
  url: string;
  /** Connection password (optional) */
  password?: string | undefined;
  /** Database index (default: 0) */
  database: number;
  /** Key prefix for namespacing */
  keyPrefix: string;
  /** Enable TLS (for production) */
  tls: boolean;
}

export interface RedisPoolConfig {
  /** Minimum connections to maintain (default: 5) */
  minConnections: number;
  /** Maximum connections allowed (default: 20) */
  maxConnections: number;
  /** Idle connection timeout in ms (default: 30000) */
  idleTimeoutMs: number;
  /** Acquire connection timeout in ms (default: 100) */
  acquireTimeoutMs: number;
  /** Health check interval in ms (default: 10000) */
  healthCheckIntervalMs: number;
}

export interface Phase9AConfig {
  /** Enable Redis for rate limiting (feature flag) */
  redisEnabled: boolean;
  /** Enable fallback to in-memory when Redis fails */
  fallbackEnabled: boolean;
  /** Redis connection config */
  redis: RedisConfig;
  /** Connection pool config */
  pool: RedisPoolConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  url: 'redis://localhost:6379',
  database: 0,
  keyPrefix: 'hukuk:simulation:',
  tls: false,
};

export const DEFAULT_POOL_CONFIG: RedisPoolConfig = {
  minConnections: 5,
  maxConnections: 20,
  idleTimeoutMs: 30_000,
  acquireTimeoutMs: 100,
  healthCheckIntervalMs: 10_000,
};

// ============================================================================
// Environment Variable Parsing
// ============================================================================

/**
 * Parse Phase 9A configuration from environment variables
 */
export function parsePhase9AConfig(): Phase9AConfig {
  return {
    redisEnabled: process.env.PHASE9_REDIS_ENABLED === 'true',
    fallbackEnabled: process.env.PHASE9_REDIS_FALLBACK !== 'false', // Default: true
    redis: parseRedisConfig(),
    pool: parsePoolConfig(),
  };
}

function parseRedisConfig(): RedisConfig {
  return {
    url: process.env.REDIS_URL || DEFAULT_REDIS_CONFIG.url,
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DATABASE || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || DEFAULT_REDIS_CONFIG.keyPrefix,
    tls: process.env.REDIS_TLS === 'true',
  };
}

function parsePoolConfig(): RedisPoolConfig {
  return {
    minConnections: parseInt(
      process.env.REDIS_POOL_MIN || String(DEFAULT_POOL_CONFIG.minConnections),
      10,
    ),
    maxConnections: parseInt(
      process.env.REDIS_POOL_MAX || String(DEFAULT_POOL_CONFIG.maxConnections),
      10,
    ),
    idleTimeoutMs: parseInt(
      process.env.REDIS_POOL_IDLE_TIMEOUT_MS || String(DEFAULT_POOL_CONFIG.idleTimeoutMs),
      10,
    ),
    acquireTimeoutMs: parseInt(
      process.env.REDIS_POOL_ACQUIRE_TIMEOUT_MS || String(DEFAULT_POOL_CONFIG.acquireTimeoutMs),
      10,
    ),
    healthCheckIntervalMs: parseInt(
      process.env.REDIS_POOL_HEALTH_CHECK_MS || String(DEFAULT_POOL_CONFIG.healthCheckIntervalMs),
      10,
    ),
  };
}

// ============================================================================
// Validation
// ============================================================================

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate Phase 9A configuration
 */
export function validatePhase9AConfig(config: Phase9AConfig): ConfigValidationResult {
  const errors: string[] = [];

  // Redis URL validation
  if (config.redisEnabled) {
    if (!config.redis.url) {
      errors.push('REDIS_URL is required when PHASE9_REDIS_ENABLED=true');
    } else if (!config.redis.url.startsWith('redis://') && !config.redis.url.startsWith('rediss://')) {
      errors.push('REDIS_URL must start with redis:// or rediss://');
    }
  }

  // Pool config validation
  if (config.pool.minConnections < 1) {
    errors.push('REDIS_POOL_MIN must be at least 1');
  }
  if (config.pool.maxConnections < config.pool.minConnections) {
    errors.push('REDIS_POOL_MAX must be >= REDIS_POOL_MIN');
  }
  if (config.pool.acquireTimeoutMs < 10) {
    errors.push('REDIS_POOL_ACQUIRE_TIMEOUT_MS must be at least 10ms');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
