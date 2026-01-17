/**
 * SDK Errors - Public Exports
 */

// Error classes
export {
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

export type { ValidationError } from './sdk-error';

// Type guards
export {
  isSdkError,
  isSdkNetworkError,
  isSdkServerError,
  isSdkRateLimitError,
  isSdkAuthError,
  isSdkValidationError,
  isSdkNotFoundError,
  isSdkConfigError,
  isSdkTimeoutError,
  isSdkCancelledError,
  isRetryableError,
  isFatalError,
} from './type-guards';

// Error mapper
export {
  mapHttpStatusToError,
  mapNetworkError,
  isRetryableStatus,
} from './error-mapper';
