/**
 * Error Mapper
 * 
 * Maps HTTP responses and errors to typed SdkErrors.
 * @see design.md - Error Taxonomy
 */

import {
  SdkError,
  SdkNetworkError,
  SdkServerError,
  SdkRateLimitError,
  SdkAuthError,
  SdkValidationError,
  SdkNotFoundError,
} from './sdk-error';

/**
 * HTTP status codes that are retryable.
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Map HTTP status to SdkError.
 */
export function mapHttpStatusToError(
  status: number,
  body?: unknown,
): SdkError {
  const message = extractErrorMessage(body) ?? `HTTP ${status}`;
  
  // Auth errors
  if (status === 401) {
    return new SdkAuthError('Authentication required', { httpStatus: status });
  }
  if (status === 403) {
    return new SdkAuthError('Access denied', { httpStatus: status });
  }
  
  // Not found
  if (status === 404) {
    return new SdkNotFoundError('Resource not found');
  }
  
  // Validation error
  if (status === 400) {
    const validationErrors = extractValidationErrors(body);
    return new SdkValidationError(message, {
      httpStatus: status,
      ...(validationErrors !== undefined ? { validationErrors } : {}),
    });
  }
  
  // Rate limit
  if (status === 429) {
    const retryAfterMs = extractRetryAfter(body);
    return new SdkRateLimitError('Rate limit exceeded', {
      httpStatus: status,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
  }
  
  // Server errors (5xx)
  if (status >= 500 && status < 600) {
    return new SdkServerError(message, { httpStatus: status });
  }
  
  // Unknown client error
  if (status >= 400 && status < 500) {
    return new SdkValidationError(message, { httpStatus: status });
  }
  
  // Fallback
  return new SdkServerError(`Unexpected status: ${status}`, { httpStatus: status });
}

/**
 * Map fetch/network error to SdkError.
 */
export function mapNetworkError(error: Error): SdkError {
  // AbortError is handled separately (SdkCancelledError)
  if (error.name === 'AbortError') {
    // Let caller handle this
    throw error;
  }
  
  // Timeout
  if (error.name === 'TimeoutError') {
    return new SdkNetworkError('Request timed out', { cause: error });
  }
  
  // Network errors
  const message = error.message || 'Network error';
  return new SdkNetworkError(message, { cause: error });
}

/**
 * Check if HTTP status is retryable.
 */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Extract error message from response body.
 * Sanitizes to avoid PII leakage.
 */
function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  
  const obj = body as Record<string, unknown>;
  
  // Common error message fields
  if (typeof obj['message'] === 'string') {
    return sanitizeErrorMessage(obj['message']);
  }
  if (typeof obj['error'] === 'string') {
    return sanitizeErrorMessage(obj['error']);
  }
  if (typeof obj['error'] === 'object' && obj['error'] !== null) {
    const errorObj = obj['error'] as Record<string, unknown>;
    if (typeof errorObj['message'] === 'string') {
      return sanitizeErrorMessage(errorObj['message']);
    }
  }
  
  return undefined;
}

/**
 * Extract validation errors from response body.
 */
function extractValidationErrors(body: unknown): { field: string; message: string; code?: string }[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  
  const obj = body as Record<string, unknown>;
  
  if (Array.isArray(obj['errors'])) {
    return obj['errors']
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map(e => {
        const code = typeof e['code'] === 'string' ? e['code'] : undefined;
        return {
          field: String(e['field'] ?? 'unknown'),
          message: sanitizeErrorMessage(String(e['message'] ?? 'Validation error')),
          ...(code !== undefined ? { code } : {}),
        };
      });
  }
  
  return undefined;
}

/**
 * Extract retry-after from response body or headers.
 */
function extractRetryAfter(body: unknown): number | undefined {
  if (!body || typeof body !== 'object') return undefined;
  
  const obj = body as Record<string, unknown>;
  
  if (typeof obj['retryAfter'] === 'number') {
    return obj['retryAfter'] * 1000; // Convert seconds to ms
  }
  if (typeof obj['retryAfterMs'] === 'number') {
    return obj['retryAfterMs'];
  }
  
  return undefined;
}

/**
 * Sanitize error message to remove potential PII.
 * Generic messages only.
 */
function sanitizeErrorMessage(message: string): string {
  // Truncate long messages
  if (message.length > 200) {
    return message.substring(0, 200) + '...';
  }
  return message;
}
