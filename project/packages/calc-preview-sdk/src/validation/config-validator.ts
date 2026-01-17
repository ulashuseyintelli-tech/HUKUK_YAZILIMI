/**
 * Config Validator
 * 
 * Validates SDK configuration at construction.
 * Invalid config → SdkConfigError
 */

import type { SdkConfig, RetryConfig, LogLevel } from '../types/config';
import { DEFAULT_CONFIG } from '../types/config';
import { isValidRegionId, DEFAULT_REGION } from '../types/region';
import type { RegionId, RegionRoutingMode } from '../types/region';
import { SdkConfigError } from '../errors/sdk-error';
import { LIMITS } from '../constants';

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ConfigValidationError[];
}

export interface ConfigValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validate SDK config.
 * Returns validation result without throwing.
 */
export function validateConfig(config: SdkConfig): ValidationResult {
  const errors: ConfigValidationError[] = [];

  // baseUrl required
  if (!config.baseUrl) {
    errors.push({ field: 'baseUrl', message: 'baseUrl is required' });
  } else {
    // HTTPS only
    try {
      const url = new URL(config.baseUrl);
      if (url.protocol !== 'https:') {
        errors.push({ field: 'baseUrl', message: 'baseUrl must use HTTPS' });
      }
      // No trailing slash
      if (config.baseUrl.endsWith('/')) {
        errors.push({ field: 'baseUrl', message: 'baseUrl must not end with /' });
      }
    } catch {
      errors.push({ field: 'baseUrl', message: 'baseUrl must be a valid URL' });
    }
  }

  // Auth: apiKey XOR bearerToken
  if (config.apiKey && config.bearerToken) {
    errors.push({ 
      field: 'auth', 
      message: 'Cannot use both apiKey and bearerToken' 
    });
  }
  if (!config.apiKey && !config.bearerToken) {
    errors.push({ 
      field: 'auth', 
      message: 'Either apiKey or bearerToken is required' 
    });
  }

  // Timeout range
  const timeout = config.timeout ?? DEFAULT_CONFIG.timeout;
  if (timeout < LIMITS.MIN_TIMEOUT || timeout > LIMITS.MAX_TIMEOUT) {
    errors.push({ 
      field: 'timeout', 
      message: `timeout must be between ${LIMITS.MIN_TIMEOUT} and ${LIMITS.MAX_TIMEOUT}` 
    });
  }

  // Deadline > timeout
  const deadline = config.deadline ?? DEFAULT_CONFIG.deadline;
  if (deadline <= timeout) {
    errors.push({ 
      field: 'deadline', 
      message: 'deadline must be greater than timeout' 
    });
  }

  // Retry config
  if (config.retry) {
    const retryErrors = validateRetryConfig(config.retry);
    errors.push(...retryErrors);
  }

  // Region validation (Phase 6C)
  if (config.regionId && !isValidRegionId(config.regionId)) {
    errors.push({
      field: 'regionId',
      message: 'regionId must match format: xx-location-N or xx-default',
    });
  }

  // Region routing (only 'disabled' allowed)
  if (config.regionRouting && config.regionRouting !== 'disabled') {
    errors.push({
      field: 'regionRouting',
      message: 'regionRouting only supports "disabled" in v0.1',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate retry config.
 */
function validateRetryConfig(retry: RetryConfig): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (retry.maxAttempts !== undefined && retry.maxAttempts < 1) {
    errors.push({ 
      field: 'retry.maxAttempts', 
      message: 'maxAttempts must be at least 1' 
    });
  }

  if (retry.initialDelayMs !== undefined && retry.initialDelayMs < 0) {
    errors.push({ 
      field: 'retry.initialDelayMs', 
      message: 'initialDelayMs must be non-negative' 
    });
  }

  if (retry.maxDelayMs !== undefined && retry.maxDelayMs < 0) {
    errors.push({ 
      field: 'retry.maxDelayMs', 
      message: 'maxDelayMs must be non-negative' 
    });
  }

  if (retry.multiplier !== undefined && retry.multiplier < 1) {
    errors.push({ 
      field: 'retry.multiplier', 
      message: 'multiplier must be at least 1' 
    });
  }

  return errors;
}

/**
 * Validate and throw if invalid.
 */
export function validateConfigOrThrow(config: SdkConfig): void {
  const result = validateConfig(config);
  
  if (!result.valid) {
    const firstError = result.errors[0];
    const configField = firstError?.field;
    throw new SdkConfigError(
      firstError?.message ?? 'Invalid configuration',
      configField ? { configField } : undefined
    );
  }
}

/**
 * Normalized config type.
 */
export interface NormalizedConfig {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  readonly bearerToken: string | undefined;
  readonly timeout: number;
  readonly deadline: number;
  readonly retry: Readonly<Required<RetryConfig>>;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly logging: {
    readonly enabled: boolean;
    readonly level: LogLevel;
  } | undefined;
  // Region-aware (Phase 6C)
  readonly regionId: RegionId;
  readonly regionRouting: RegionRoutingMode;
}

/**
 * Normalize config with defaults.
 * Returns frozen config object.
 */
export function normalizeConfig(config: SdkConfig): NormalizedConfig {
  const normalized: NormalizedConfig = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    bearerToken: config.bearerToken,
    timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    deadline: config.deadline ?? DEFAULT_CONFIG.deadline,
    retry: {
      maxAttempts: config.retry?.maxAttempts ?? DEFAULT_CONFIG.retry.maxAttempts,
      initialDelayMs: config.retry?.initialDelayMs ?? DEFAULT_CONFIG.retry.initialDelayMs,
      maxDelayMs: config.retry?.maxDelayMs ?? DEFAULT_CONFIG.retry.maxDelayMs,
      multiplier: config.retry?.multiplier ?? DEFAULT_CONFIG.retry.multiplier,
    },
    headers: config.headers,
    logging: config.logging ? {
      enabled: config.logging.enabled ?? DEFAULT_CONFIG.logging.enabled,
      level: config.logging.level ?? DEFAULT_CONFIG.logging.level,
    } : undefined,
    // Region-aware (Phase 6C)
    regionId: config.regionId ?? DEFAULT_REGION,
    regionRouting: config.regionRouting ?? 'disabled',
  };

  // Freeze to ensure immutability
  return Object.freeze(normalized);
}
