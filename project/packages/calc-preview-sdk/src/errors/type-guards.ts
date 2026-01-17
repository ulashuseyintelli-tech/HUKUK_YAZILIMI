/**
 * Error Type Guards
 * 
 * Runtime type checking for SDK errors.
 */

import {
  SdkError,
  SdkNetworkError,
  SdkServerError,
  SdkRateLimitError,
  SdkAuthError,
  SdkValidationError,
  SdkNotFoundError,
  SdkConfigError,
  SdkTimeoutError,
  SdkCancelledError,
} from './sdk-error';

/**
 * Check if error is any SdkError.
 */
export function isSdkError(e: unknown): e is SdkError {
  return e instanceof SdkError;
}

/**
 * Check if error is SdkNetworkError.
 */
export function isSdkNetworkError(e: unknown): e is SdkNetworkError {
  return e instanceof SdkNetworkError;
}

/**
 * Check if error is SdkServerError.
 */
export function isSdkServerError(e: unknown): e is SdkServerError {
  return e instanceof SdkServerError;
}

/**
 * Check if error is SdkRateLimitError.
 */
export function isSdkRateLimitError(e: unknown): e is SdkRateLimitError {
  return e instanceof SdkRateLimitError;
}

/**
 * Check if error is SdkAuthError.
 */
export function isSdkAuthError(e: unknown): e is SdkAuthError {
  return e instanceof SdkAuthError;
}

/**
 * Check if error is SdkValidationError.
 */
export function isSdkValidationError(e: unknown): e is SdkValidationError {
  return e instanceof SdkValidationError;
}

/**
 * Check if error is SdkNotFoundError.
 */
export function isSdkNotFoundError(e: unknown): e is SdkNotFoundError {
  return e instanceof SdkNotFoundError;
}

/**
 * Check if error is SdkConfigError.
 */
export function isSdkConfigError(e: unknown): e is SdkConfigError {
  return e instanceof SdkConfigError;
}

/**
 * Check if error is SdkTimeoutError.
 */
export function isSdkTimeoutError(e: unknown): e is SdkTimeoutError {
  return e instanceof SdkTimeoutError;
}

/**
 * Check if error is SdkCancelledError.
 */
export function isSdkCancelledError(e: unknown): e is SdkCancelledError {
  return e instanceof SdkCancelledError;
}

/**
 * Check if error is retryable.
 * Works with any error type.
 */
export function isRetryableError(e: unknown): boolean {
  if (!isSdkError(e)) return false;
  return e.retryable;
}

/**
 * Check if error is fatal (SDK unusable).
 */
export function isFatalError(e: unknown): boolean {
  return isSdkConfigError(e);
}
