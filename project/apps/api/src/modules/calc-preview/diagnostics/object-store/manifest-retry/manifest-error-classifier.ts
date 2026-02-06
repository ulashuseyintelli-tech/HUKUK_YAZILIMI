/**
 * Manifest Error Classifier
 * 
 * Phase 10 - Task 10.1.1
 * 
 * Classifies S3/MinIO errors into three decisions:
 * - DONE_NOOP: Object already exists (idempotent success)
 * - RETRY: Transient error, schedule retry with backoff
 * - DLQ: Permanent error, move to dead-letter queue
 * 
 * LOCKED CONTRACT - See design.md for classification table
 * 
 * @see .kiro/specs/phase-10-retry-signature/design.md
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Classifier Decision
 * DONE_NOOP: Object already exists (write-once idempotent success)
 * RETRY: Transient error, schedule retry with backoff
 * DLQ: Permanent error, move to dead-letter queue
 */
export type ClassifierDecision = 'DONE_NOOP' | 'RETRY' | 'DLQ';

/**
 * Error codes for metrics (low cardinality, stable)
 */
export enum ManifestErrorCode {
  S3_TIMEOUT = 'S3_TIMEOUT',
  S3_THROTTLED = 'S3_THROTTLED',
  S3_5XX = 'S3_5XX',
  S3_CONNECTION_RESET = 'S3_CONNECTION_RESET',
  S3_DNS = 'S3_DNS',
  S3_ACCESS_DENIED = 'S3_ACCESS_DENIED',
  S3_NO_SUCH_BUCKET = 'S3_NO_SUCH_BUCKET',
  S3_INVALID_OBJECT = 'S3_INVALID_OBJECT',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  WRITE_ONCE_ALREADY_EXISTS = 'WRITE_ONCE_ALREADY_EXISTS',
  UNKNOWN = 'UNKNOWN',
}

export interface ClassifiedError {
  decision: ClassifierDecision;
  errorCode: ManifestErrorCode;
  retryAfterMs?: number;
  reason: string;
}

// ============================================================================
// Error Detection Helpers
// ============================================================================

interface ErrorLike {
  name?: string;
  message?: string;
  code?: string;
  $metadata?: { httpStatusCode?: number };
  Code?: string;
  statusCode?: number;
  retryAfter?: number;
}

function getErrorCode(error: ErrorLike): string | undefined {
  if (!error) return undefined;
  return error.code || error.Code;
}

function getHttpStatus(error: ErrorLike): number | undefined {
  if (!error) return undefined;
  return error.$metadata?.httpStatusCode || error.statusCode;
}

function getErrorMessage(error: ErrorLike): string {
  if (!error) return '';
  return error.message || String(error);
}

// ============================================================================
// Classification Logic
// ============================================================================

/**
 * Check if error indicates object already exists (write-once idempotent case)
 */
function isAlreadyExistsError(error: ErrorLike): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  const status = getHttpStatus(error);
  
  // PreconditionFailed (412) with If-None-Match
  if (status === 412) return true;
  if (code === 'PreconditionFailed') return true;
  
  // S3 specific codes
  if (code === 'BucketAlreadyExists') return true;
  if (code === 'BucketAlreadyOwnedByYou') return true;
  
  // Message patterns
  if (message.includes('already exists')) return true;
  if (message.includes('precondition failed')) return true;
  if (message.includes('key exists')) return true;
  
  return false;
}

/**
 * Check if error is a timeout
 */
function isTimeoutError(error: ErrorLike): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  const status = getHttpStatus(error);
  
  // HTTP 504 Gateway Timeout
  if (status === 504) return true;
  
  // Phase 10.1.6: AbortError from AbortController timeout
  if (isAbortError(error)) return true;
  
  if (code === 'ETIMEDOUT') return true;
  if (code === 'ESOCKETTIMEDOUT') return true;
  if (code === 'TimeoutError') return true;
  if (code === 'RequestTimeout') return true;
  if (code === 'ABORT_ERROR') return true;  // From MinioObjectStoreClient.mapError
  
  if (message.includes('timeout')) return true;
  if (message.includes('timed out')) return true;
  
  return false;
}

/**
 * Phase 10.1.6: Check if error is an AbortError from AbortController
 * 
 * AbortError detection must be robust:
 * - Node.js Error with name='AbortError'
 * - DOMException with name='AbortError' (browser/Node 18+)
 * - AWS SDK v3 wrapped abort errors
 * 
 * @see PHASE-10-WORKER-ARCHITECTURE.md Section 11.5
 */
function isAbortError(error: ErrorLike): boolean {
  if (!error) return false;
  
  // Check error.name directly
  const name = error.name;
  if (name === 'AbortError') return true;
  
  // Check error code (from MinioObjectStoreClient.mapError)
  const code = getErrorCode(error);
  if (code === 'ABORT_ERROR') return true;
  
  // Check message for abort indicators
  const message = getErrorMessage(error).toLowerCase();
  if (message.includes('aborted') && message.includes('timeout')) return true;
  if (message.includes('abort') && message.includes('signal')) return true;
  
  return false;
}

/**
 * Check if error is a connection reset
 */
function isConnectionResetError(error: ErrorLike): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  
  if (code === 'ECONNRESET') return true;
  if (code === 'ECONNREFUSED') return true;
  if (code === 'EPIPE') return true;
  if (code === 'ENOTCONN') return true;
  
  if (message.includes('socket hang up')) return true;
  if (message.includes('connection reset')) return true;
  if (message.includes('connection refused')) return true;
  
  return false;
}

/**
 * Check if error is a DNS failure
 */
function isDnsError(error: ErrorLike): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  
  if (code === 'ENOTFOUND') return true;
  if (code === 'EAI_AGAIN') return true;
  
  if (message.includes('getaddrinfo')) return true;
  if (message.includes('dns')) return true;
  
  return false;
}

/**
 * Check if error is throttling (429 or SlowDown)
 */
function isThrottlingError(error: ErrorLike): { throttled: boolean; retryAfterMs?: number } {
  const code = getErrorCode(error);
  const status = getHttpStatus(error);
  
  if (status === 429) {
    return { throttled: true, retryAfterMs: (error.retryAfter || 60) * 1000 };
  }
  
  if (code === 'SlowDown') {
    return { throttled: true, retryAfterMs: 60_000 };
  }
  
  if (code === 'Throttling' || code === 'ThrottlingException') {
    return { throttled: true, retryAfterMs: 30_000 };
  }
  
  return { throttled: false };
}

/**
 * Check if error is a 5xx server error
 */
function is5xxError(error: ErrorLike): boolean {
  const status = getHttpStatus(error);
  const code = getErrorCode(error);
  
  if (status && status >= 500 && status < 600) return true;
  
  if (code === 'InternalError') return true;
  if (code === 'ServiceUnavailable') return true;
  if (code === 'BadGateway') return true;
  
  return false;
}

/**
 * Check if error is access denied (403)
 */
function isAccessDeniedError(error: ErrorLike): boolean {
  const code = getErrorCode(error);
  const status = getHttpStatus(error);
  
  if (status === 403) return true;
  if (status === 401) return true;
  
  if (code === 'AccessDenied') return true;
  if (code === 'InvalidAccessKeyId') return true;
  if (code === 'SignatureDoesNotMatch') return true;
  if (code === 'ExpiredToken') return true;
  if (code === 'InvalidToken') return true;
  
  return false;
}

/**
 * Check if error is bucket not found
 */
function isBucketNotFoundError(error: ErrorLike): boolean {
  const code = getErrorCode(error);
  
  if (code === 'NoSuchBucket') return true;
  if (code === 'BucketNotFound') return true;
  
  return false;
}

/**
 * Check if error is invalid object/key
 */
function isInvalidObjectError(error: ErrorLike): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  
  if (code === 'InvalidObjectKey') return true;
  if (code === 'InvalidKey') return true;
  if (code === 'KeyTooLong') return true;
  if (code === 'InvalidArgument') return true;
  
  if (message.includes('invalid key')) return true;
  if (message.includes('invalid object')) return true;
  
  return false;
}

/**
 * Check if error is serialization error
 */
function isSerializationError(error: ErrorLike): boolean {
  if (!error) return false;
  const name = error.name;
  const message = getErrorMessage(error).toLowerCase();
  
  if (name === 'SyntaxError') return true;
  if (name === 'TypeError' && message.includes('circular')) return true;
  
  if (message.includes('json')) return true;
  if (message.includes('serialize')) return true;
  if (message.includes('stringify')) return true;
  if (message.includes('circular structure')) return true;
  
  return false;
}

// ============================================================================
// Main Classifier Function
// ============================================================================

/**
 * Classify an error into a decision for the retry pipeline
 * 
 * @param error - The error to classify
 * @param attemptCount - Current attempt count (0-based)
 * @returns ClassifiedError with decision, errorCode, and reason
 */
export function classifyError(error: unknown, attemptCount: number = 0): ClassifiedError {
  const errorLike = error as ErrorLike;
  
  // 1. DONE_NOOP: Object already exists (idempotent success)
  if (isAlreadyExistsError(errorLike)) {
    return {
      decision: 'DONE_NOOP',
      errorCode: ManifestErrorCode.WRITE_ONCE_ALREADY_EXISTS,
      reason: 'Object already exists (write-once idempotent success)',
    };
  }
  
  // 2. RETRY: Timeout
  if (isTimeoutError(errorLike)) {
    return {
      decision: 'RETRY',
      errorCode: ManifestErrorCode.S3_TIMEOUT,
      reason: 'Request timeout - transient network issue',
    };
  }
  
  // 3. RETRY: Connection reset
  if (isConnectionResetError(errorLike)) {
    return {
      decision: 'RETRY',
      errorCode: ManifestErrorCode.S3_CONNECTION_RESET,
      reason: 'Connection reset - transient network issue',
    };
  }
  
  // 4. RETRY: DNS failure
  if (isDnsError(errorLike)) {
    return {
      decision: 'RETRY',
      errorCode: ManifestErrorCode.S3_DNS,
      reason: 'DNS resolution failure - transient network issue',
    };
  }
  
  // 5. RETRY: Throttling (429, SlowDown)
  const throttleResult = isThrottlingError(errorLike);
  if (throttleResult.throttled) {
    return {
      decision: 'RETRY',
      errorCode: ManifestErrorCode.S3_THROTTLED,
      ...(throttleResult.retryAfterMs !== undefined && { retryAfterMs: throttleResult.retryAfterMs }),
      reason: 'Rate limited - backoff and retry',
    };
  }
  
  // 6. RETRY: 5xx server error
  if (is5xxError(errorLike)) {
    return {
      decision: 'RETRY',
      errorCode: ManifestErrorCode.S3_5XX,
      reason: 'Server error (5xx) - transient provider issue',
    };
  }
  
  // 7. DLQ: Access denied (403, 401)
  if (isAccessDeniedError(errorLike)) {
    return {
      decision: 'DLQ',
      errorCode: ManifestErrorCode.S3_ACCESS_DENIED,
      reason: 'Access denied - check IAM credentials and bucket policy',
    };
  }
  
  // 8. DLQ: Bucket not found
  if (isBucketNotFoundError(errorLike)) {
    return {
      decision: 'DLQ',
      errorCode: ManifestErrorCode.S3_NO_SUCH_BUCKET,
      reason: 'Bucket not found - check configuration',
    };
  }
  
  // 9. DLQ: Invalid object/key
  if (isInvalidObjectError(errorLike)) {
    return {
      decision: 'DLQ',
      errorCode: ManifestErrorCode.S3_INVALID_OBJECT,
      reason: 'Invalid object key - check key format',
    };
  }
  
  // 10. DLQ: Serialization error
  if (isSerializationError(errorLike)) {
    return {
      decision: 'DLQ',
      errorCode: ManifestErrorCode.SERIALIZATION_ERROR,
      reason: 'Serialization error - code bug, investigate',
    };
  }
  
  // 11. UNKNOWN: Guardrail
  // attempt=0 → RETRY (give one chance)
  // attempt>=1 → DLQ (prevent infinite retry)
  if (attemptCount === 0) {
    return {
      decision: 'RETRY',
      errorCode: ManifestErrorCode.UNKNOWN,
      reason: 'Unknown error - retrying once before DLQ',
    };
  }
  
  return {
    decision: 'DLQ',
    errorCode: ManifestErrorCode.UNKNOWN,
    reason: 'Unknown error after retry - moving to DLQ for investigation',
  };
}

// ============================================================================
// Exports
// ============================================================================

export const ManifestErrorClassifier = {
  classifyError,
  isAlreadyExistsError,
  isTimeoutError,
  isAbortError,
  isConnectionResetError,
  isDnsError,
  isThrottlingError,
  is5xxError,
  isAccessDeniedError,
  isBucketNotFoundError,
  isInvalidObjectError,
  isSerializationError,
};
