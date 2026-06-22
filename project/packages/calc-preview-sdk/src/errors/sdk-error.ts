/**
 * SDK Error Hierarchy
 * 
 * Typed errors with retryable flag.
 * @see design.md - Error Taxonomy
 */

/**
 * Base SDK error.
 * All SDK errors extend this.
 */
export abstract class SdkError extends Error {
  abstract readonly errorCode: string;
  abstract readonly retryable: boolean;
  readonly httpStatus?: number;
  override readonly cause?: Error;

  constructor(message: string, options?: { httpStatus?: number; cause?: Error }) {
    super(message);
    this.name = this.constructor.name;
    if (options?.httpStatus !== undefined) {
      this.httpStatus = options.httpStatus;
    }
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ============================================================================
// RETRYABLE ERRORS
// ============================================================================

/**
 * Network error (connection refused, timeout, DNS failure).
 * Retryable: YES
 */
export class SdkNetworkError extends SdkError {
  readonly errorCode = 'NETWORK_ERROR' as const;
  readonly retryable = true as const;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Server error (5xx).
 * Retryable: YES
 */
export class SdkServerError extends SdkError {
  readonly errorCode = 'SERVER_ERROR' as const;
  readonly retryable = true as const;

  constructor(message: string, options?: { httpStatus?: number; cause?: Error }) {
    super(message, options);
  }
}

/**
 * Rate limit error (429).
 * Retryable: YES (after delay)
 */
export class SdkRateLimitError extends SdkError {
  readonly errorCode = 'RATE_LIMITED' as const;
  readonly retryable = true as const;
  readonly retryAfterMs?: number;

  constructor(message: string, options?: { httpStatus?: number; retryAfterMs?: number }) {
    super(message, { httpStatus: options?.httpStatus ?? 429 });
    if (options?.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
  }
}

// ============================================================================
// NON-RETRYABLE ERRORS
// ============================================================================

/**
 * Authentication error (401, 403).
 * Retryable: NO
 */
export class SdkAuthError extends SdkError {
  readonly errorCode = 'AUTH_ERROR' as const;
  readonly retryable = false as const;

  constructor(message: string, options?: { httpStatus?: number }) {
    super(message, options);
  }
}

/**
 * Validation error (400).
 * Retryable: NO (fix request first)
 */
export class SdkValidationError extends SdkError {
  readonly errorCode = 'VALIDATION_ERROR' as const;
  readonly retryable = false as const;
  readonly validationErrors?: readonly ValidationError[];

  constructor(message: string, options?: { httpStatus?: number; validationErrors?: ValidationError[] }) {
    super(message, { httpStatus: options?.httpStatus ?? 400 });
    if (options?.validationErrors !== undefined) {
      this.validationErrors = options.validationErrors;
    }
  }
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code?: string;
}

/**
 * Not found error (404).
 * Retryable: NO
 */
export class SdkNotFoundError extends SdkError {
  readonly errorCode = 'NOT_FOUND' as const;
  readonly retryable = false as const;
  readonly resourceType?: string;
  readonly resourceId?: string;

  constructor(message: string, options?: { resourceType?: string; resourceId?: string }) {
    super(message, { httpStatus: 404 });
    if (options?.resourceType !== undefined) {
      this.resourceType = options.resourceType;
    }
    if (options?.resourceId !== undefined) {
      this.resourceId = options.resourceId;
    }
  }
}

// ============================================================================
// FATAL ERRORS
// ============================================================================

/**
 * Configuration error.
 * Retryable: NO (SDK instance broken)
 */
export class SdkConfigError extends SdkError {
  readonly errorCode = 'CONFIG_ERROR' as const;
  readonly retryable = false as const;
  readonly configField?: string;

  constructor(message: string, options?: { configField?: string }) {
    super(message);
    if (options?.configField !== undefined) {
      this.configField = options.configField;
    }
  }
}

/**
 * Timeout error (deadline exceeded).
 * Retryable: NO (deadline already passed)
 */
export class SdkTimeoutError extends SdkError {
  readonly errorCode = 'TIMEOUT' as const;
  readonly retryable = false as const;
  readonly elapsedMs: number;
  readonly deadlineMs: number;

  constructor(message: string, options: { elapsedMs: number; deadlineMs: number }) {
    super(message);
    this.elapsedMs = options.elapsedMs;
    this.deadlineMs = options.deadlineMs;
  }
}

/**
 * Cancelled error (AbortSignal triggered).
 * Retryable: NO (consumer cancelled)
 */
export class SdkCancelledError extends SdkError {
  readonly errorCode = 'CANCELLED' as const;
  readonly retryable = false as const;

  constructor(message: string = 'Request cancelled') {
    super(message);
  }
}
