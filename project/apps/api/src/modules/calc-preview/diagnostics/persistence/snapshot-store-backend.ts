/**
 * Snapshot Store Backend Configuration
 * 
 * Phase 9B.5 - Task 2: Production Safety Gate
 * 
 * CRITICAL: This module enforces that InMemory backend CANNOT be used
 * in production or staging environments.
 * 
 * Threat Model:
 * - InMemory fallback → "snapshot yazıldı sanırsın, aslında RAM'de uçtu"
 * - Multi-instance deployment → her pod kendi RAM'inde farklı gerçeklik
 * - Cleanup + legal hold + baseline akışları anlamını kaybeder
 * 
 * Rules:
 * - Rule 1 (Hard Fail): production/staging + inmemory → StartupConfigurationError
 * - Rule 2 (Default): production/staging + undefined → postgres
 * - Rule 3 (Explicit): development + inmemory → allowed (explicit opt-in)
 * - Rule 4 (Test): test → whatever test harness chooses
 * 
 * @see .kiro/specs/phase-9b5-snapshot-store-cutover/tasks.md Task 2
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Application environment
 */
export type AppEnvironment = 'production' | 'staging' | 'development' | 'test';

/**
 * Snapshot store backend type
 */
export type SnapshotStoreBackend = 'postgres' | 'inmemory';

/**
 * Environment configuration for backend resolution
 */
export interface BackendEnvironment {
  APP_ENV?: string | undefined;
  SNAPSHOT_STORE_BACKEND?: string | undefined;
  [key: string]: string | undefined;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Thrown when startup configuration is invalid.
 * 
 * This error prevents the application from starting with dangerous configuration.
 * The message includes actionable guidance for fixing the issue.
 */
export class StartupConfigurationError extends Error {
  readonly code = 'STARTUP_CONFIGURATION_ERROR';
  
  constructor(message: string) {
    super(message);
    this.name = 'StartupConfigurationError';
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Environments where InMemory is FORBIDDEN
 */
const DURABLE_ENVIRONMENTS: ReadonlySet<AppEnvironment> = new Set([
  'production',
  'staging',
]);

/**
 * Valid APP_ENV values
 */
const VALID_ENVIRONMENTS: ReadonlySet<string> = new Set([
  'production',
  'staging',
  'development',
  'test',
]);

/**
 * Valid SNAPSHOT_STORE_BACKEND values
 */
const VALID_BACKENDS: ReadonlySet<string> = new Set([
  'postgres',
  'inmemory',
]);

// ============================================================================
// Backend Resolution
// ============================================================================

/**
 * Resolve snapshot store backend from environment variables.
 * 
 * This is a PURE function - no side effects, deterministic output.
 * 
 * @param env Environment variables (defaults to process.env)
 * @returns Resolved backend ('postgres' | 'inmemory')
 * @throws StartupConfigurationError if configuration is invalid
 * 
 * @example
 * // Production with postgres (explicit)
 * resolveSnapshotStoreBackend({ APP_ENV: 'production', SNAPSHOT_STORE_BACKEND: 'postgres' })
 * // → 'postgres'
 * 
 * @example
 * // Production with default (postgres)
 * resolveSnapshotStoreBackend({ APP_ENV: 'production' })
 * // → 'postgres'
 * 
 * @example
 * // Production with inmemory (THROWS)
 * resolveSnapshotStoreBackend({ APP_ENV: 'production', SNAPSHOT_STORE_BACKEND: 'inmemory' })
 * // → throws StartupConfigurationError
 * 
 * @example
 * // Development with inmemory (allowed)
 * resolveSnapshotStoreBackend({ APP_ENV: 'development', SNAPSHOT_STORE_BACKEND: 'inmemory' })
 * // → 'inmemory'
 */
export function resolveSnapshotStoreBackend(
  env: BackendEnvironment = process.env,
): SnapshotStoreBackend {
  const appEnv = normalizeAppEnv(env.APP_ENV);
  const backend = normalizeBackend(env.SNAPSHOT_STORE_BACKEND, appEnv);
  
  // Rule 1: Hard fail if durable environment + inmemory
  if (isDurableEnvironment(appEnv) && backend === 'inmemory') {
    throw new StartupConfigurationError(
      `Invalid SNAPSHOT_STORE_BACKEND=inmemory for APP_ENV=${appEnv}. ` +
      `InMemory backend is FORBIDDEN in ${appEnv} environment. ` +
      `Use SNAPSHOT_STORE_BACKEND=postgres or set APP_ENV=development/test. ` +
      `Reason: InMemory causes data loss on restart, inconsistent state across pods, ` +
      `and breaks legal hold/baseline/retention guarantees.`,
    );
  }
  
  return backend;
}

/**
 * Get human-readable description of resolved backend for logging.
 * 
 * @param backend Resolved backend
 * @param appEnv Application environment
 * @returns Log message
 */
export function getBackendLogMessage(
  backend: SnapshotStoreBackend,
  appEnv: AppEnvironment,
): string {
  const durableNote = isDurableEnvironment(appEnv)
    ? ' (durable environment - inmemory forbidden)'
    : '';
  
  return `SnapshotStore backend=${backend} (APP_ENV=${appEnv})${durableNote}`;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if environment is durable (production/staging)
 */
export function isDurableEnvironment(appEnv: AppEnvironment): boolean {
  return DURABLE_ENVIRONMENTS.has(appEnv);
}

/**
 * Validate and normalize APP_ENV
 */
function normalizeAppEnv(value: string | undefined): AppEnvironment {
  if (!value || value.trim() === '') {
    // Default to development if not specified
    return 'development';
  }
  
  const normalized = value.toLowerCase().trim();
  
  if (!VALID_ENVIRONMENTS.has(normalized)) {
    throw new StartupConfigurationError(
      `Invalid APP_ENV="${value}". ` +
      `Valid values: ${Array.from(VALID_ENVIRONMENTS).join(', ')}`,
    );
  }
  
  return normalized as AppEnvironment;
}

/**
 * Validate and normalize SNAPSHOT_STORE_BACKEND
 */
function normalizeBackend(
  value: string | undefined,
  appEnv: AppEnvironment,
): SnapshotStoreBackend {
  // Rule 2: Default to postgres for durable environments
  // Rule 3: Default to postgres for development (explicit opt-in for inmemory)
  // Rule 4: Default to inmemory for test (convenience)
  if (!value || value.trim() === '') {
    if (appEnv === 'test') {
      return 'inmemory';
    }
    return 'postgres';
  }
  
  const normalized = value.toLowerCase().trim();
  
  if (!VALID_BACKENDS.has(normalized)) {
    throw new StartupConfigurationError(
      `Invalid SNAPSHOT_STORE_BACKEND="${value}". ` +
      `Valid values: ${Array.from(VALID_BACKENDS).join(', ')}`,
    );
  }
  
  return normalized as SnapshotStoreBackend;
}

// ============================================================================
// Defense-in-Depth Guard
// ============================================================================

/**
 * Guard to be called in InMemorySnapshotStore constructor.
 * 
 * This is a defense-in-depth measure. The primary gate is in TruthLayerModule,
 * but this guard catches any direct instantiation attempts.
 * 
 * @throws StartupConfigurationError if called in durable environment
 */
export function assertInMemoryAllowed(
  env: BackendEnvironment = process.env,
): void {
  const appEnv = normalizeAppEnv(env.APP_ENV);
  
  if (isDurableEnvironment(appEnv)) {
    throw new StartupConfigurationError(
      `InMemorySnapshotStore instantiation FORBIDDEN in APP_ENV=${appEnv}. ` +
      `This is a defense-in-depth check. ` +
      `InMemory backend should never be instantiated in production/staging.`,
    );
  }
}
