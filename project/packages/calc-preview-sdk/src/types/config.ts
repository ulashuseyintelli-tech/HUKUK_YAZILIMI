/**
 * SDK Configuration Types
 * 
 * All config is IMMUTABLE after construction.
 * @see design.md - Configuration Model
 */

import type { RegionId, RegionRoutingMode } from './region';

/**
 * Main SDK configuration.
 * Validated at construction, frozen after.
 */
export interface SdkConfig {
  /** API base URL (required, HTTPS only, no trailing slash) */
  readonly baseUrl: string;
  
  /** API key authentication */
  readonly apiKey?: string;
  
  /** Bearer token authentication (mutually exclusive with apiKey) */
  readonly bearerToken?: string;
  
  /** Per-attempt timeout in ms (default: 30000, min: 1000, max: 120000) */
  readonly timeout?: number;
  
  /** Overall deadline in ms (default: 60000) */
  readonly deadline?: number;
  
  /** Retry configuration */
  readonly retry?: RetryConfig;
  
  /** Custom headers */
  readonly headers?: Readonly<Record<string, string>>;
  
  /** Logging configuration */
  readonly logging?: LoggingConfig;
  
  // =========================================================================
  // REGION-AWARE (Phase 6C)
  // =========================================================================
  
  /** Region identifier (optional, defaults to tr-default) */
  readonly regionId?: RegionId;
  
  /** Region routing mode (only 'disabled' for now - no-op) */
  readonly regionRouting?: RegionRoutingMode;
}

/**
 * Retry configuration.
 * Exponential backoff with jitter.
 */
export interface RetryConfig {
  /** Max retry attempts (default: 3) */
  readonly maxAttempts?: number;
  
  /** Initial delay in ms (default: 100) */
  readonly initialDelayMs?: number;
  
  /** Max delay in ms (default: 5000) */
  readonly maxDelayMs?: number;
  
  /** Backoff multiplier (default: 2) */
  readonly multiplier?: number;
}

/**
 * Logging configuration.
 * PII-safe by design.
 */
export interface LoggingConfig {
  /** Enable SDK logging (default: false) */
  readonly enabled?: boolean;
  
  /** Log level (default: 'warn') */
  readonly level?: LogLevel;
  
  /** Custom logger (default: console) */
  readonly logger?: SdkLogger;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Custom logger interface.
 * Only SafeLogMeta allowed - no raw payloads.
 */
export interface SdkLogger {
  debug(message: string, meta?: SafeLogMeta): void;
  info(message: string, meta?: SafeLogMeta): void;
  warn(message: string, meta?: SafeLogMeta): void;
  error(message: string, meta?: SafeLogMeta): void;
}

/**
 * PII-safe log metadata.
 * ALLOWLIST: Only these fields can be logged.
 * NO raw payloads, NO PII fields.
 */
export interface SafeLogMeta {
  readonly traceId?: string;
  readonly requestHash?: string;
  readonly principalAmount?: number;
  readonly currency?: string;
  readonly interestType?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly caseType?: string;
  readonly debtorCount?: number;
  readonly durationMs?: number;
  readonly status?: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
  readonly attempt?: number;
  readonly retryable?: boolean;
  readonly deadline?: number;
  readonly elapsed?: number;
  readonly endpoint?: string;
  readonly regionId?: string;  // Phase 6C
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  timeout: 30_000,
  deadline: 60_000,
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5_000,
    multiplier: 2,
  },
  logging: {
    enabled: false,
    level: 'warn' as LogLevel,
  },
} as const;
