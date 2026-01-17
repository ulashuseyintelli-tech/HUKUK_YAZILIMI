/**
 * SDK Constants
 * 
 * Single source of truth for header names, paths, etc.
 */

/**
 * HTTP Header names.
 * Consistent across SDK.
 */
export const HEADER_NAMES = {
  /** Idempotency key for replay safety */
  IDEMPOTENCY_KEY: 'X-Idempotency-Key',
  
  /** Request hash for deduplication */
  REQUEST_HASH: 'X-Request-Hash',
  
  /** Trace ID from backend */
  TRACE_ID: 'X-Trace-Id',
  
  /** Replay indicator from backend */
  REPLAY: 'X-Replay',
  
  /** SDK version */
  SDK_VERSION: 'X-SDK-Version',
  
  /** Request ID for correlation */
  REQUEST_ID: 'X-Request-Id',
} as const;

/**
 * API paths.
 */
export const API_PATHS = {
  /** Preview endpoint */
  PREVIEW: '/calc/preview/light',
  
  /** Single trace endpoint */
  TRACE: '/calc/trace',
  
  /** Trace list endpoint */
  TRACES: '/calc/traces',
} as const;

/**
 * Validation limits.
 */
export const LIMITS = {
  /** Minimum timeout (ms) */
  MIN_TIMEOUT: 1_000,
  
  /** Maximum timeout (ms) */
  MAX_TIMEOUT: 120_000,
  
  /** Default timeout (ms) */
  DEFAULT_TIMEOUT: 30_000,
  
  /** Default deadline (ms) */
  DEFAULT_DEADLINE: 60_000,
  
  /** Maximum trace list limit */
  MAX_TRACE_LIST_LIMIT: 100,
  
  /** Default trace list limit */
  DEFAULT_TRACE_LIST_LIMIT: 20,
} as const;

/**
 * PII fields that must NEVER be logged.
 */
export const PII_FIELDS = new Set([
  'debtorName',
  'debtorNames',
  'tckn',
  'tcKimlikNo',
  'address',
  'addresses',
  'phone',
  'phoneNumber',
  'email',
  'emailAddress',
  'iban',
  'bankAccount',
  'idNumber',
  'passportNumber',
  'driverLicense',
]);
