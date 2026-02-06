/**
 * Manifest Error Classifier Tests
 * 
 * Phase 10 - Task 10.1.1
 * 
 * Core regression tests for error classification.
 * These tests are the "safety core" of Phase 10.
 * 
 * @see .kiro/specs/phase-10-retry-signature/design.md
 */

import {
  classifyError,
  ManifestErrorCode,
  ManifestErrorClassifier,
} from '../manifest-error-classifier';

describe('ManifestErrorClassifier', () => {
  // ==========================================================================
  // DONE_NOOP: Write-once already exists (idempotent success)
  // ==========================================================================
  
  describe('DONE_NOOP: Write-once already exists', () => {
    it('should classify PreconditionFailed (412) as DONE_NOOP', () => {
      const error = {
        code: 'PreconditionFailed',
        $metadata: { httpStatusCode: 412 },
        message: 'At least one of the pre-conditions you specified did not hold',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DONE_NOOP');
      expect(result.errorCode).toBe(ManifestErrorCode.WRITE_ONCE_ALREADY_EXISTS);
    });
    
    it('should classify HTTP 412 as DONE_NOOP', () => {
      const error = {
        $metadata: { httpStatusCode: 412 },
        message: 'Precondition failed',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DONE_NOOP');
      expect(result.errorCode).toBe(ManifestErrorCode.WRITE_ONCE_ALREADY_EXISTS);
    });
    
    it('should classify "already exists" message as DONE_NOOP', () => {
      const error = {
        message: 'Object already exists in bucket',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DONE_NOOP');
      expect(result.errorCode).toBe(ManifestErrorCode.WRITE_ONCE_ALREADY_EXISTS);
    });
    
    it('should classify "key exists" message as DONE_NOOP', () => {
      const error = {
        message: 'The specified key exists',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DONE_NOOP');
      expect(result.errorCode).toBe(ManifestErrorCode.WRITE_ONCE_ALREADY_EXISTS);
    });
  });
  
  // ==========================================================================
  // RETRY: Timeout errors
  // ==========================================================================
  
  describe('RETRY: Timeout errors', () => {
    it('should classify ETIMEDOUT as RETRY with S3_TIMEOUT', () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Connection timed out',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_TIMEOUT);
    });
    
    it('should classify ESOCKETTIMEDOUT as RETRY', () => {
      const error = {
        code: 'ESOCKETTIMEDOUT',
        message: 'Socket timed out',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_TIMEOUT);
    });
    
    it('should classify timeout message as RETRY', () => {
      const error = {
        message: 'Request timeout after 30000ms',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_TIMEOUT);
    });
  });
  
  // ==========================================================================
  // RETRY: Connection reset errors
  // ==========================================================================
  
  describe('RETRY: Connection reset errors', () => {
    it('should classify ECONNRESET as RETRY with S3_CONNECTION_RESET', () => {
      const error = {
        code: 'ECONNRESET',
        message: 'Connection reset by peer',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_CONNECTION_RESET);
    });
    
    it('should classify "socket hang up" as RETRY', () => {
      const error = {
        message: 'socket hang up',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_CONNECTION_RESET);
    });
    
    it('should classify ECONNREFUSED as RETRY', () => {
      const error = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_CONNECTION_RESET);
    });
  });
  
  // ==========================================================================
  // RETRY: Throttling (429, SlowDown)
  // ==========================================================================
  
  describe('RETRY: Throttling errors', () => {
    it('should classify HTTP 429 as RETRY with S3_THROTTLED', () => {
      const error = {
        $metadata: { httpStatusCode: 429 },
        message: 'Too Many Requests',
        retryAfter: 30,
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_THROTTLED);
      expect(result.retryAfterMs).toBe(30_000);
    });
    
    it('should classify SlowDown as RETRY with S3_THROTTLED', () => {
      const error = {
        code: 'SlowDown',
        Code: 'SlowDown',
        message: 'Please reduce your request rate',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_THROTTLED);
      expect(result.retryAfterMs).toBe(60_000);
    });
    
    it('should use default retryAfter when not provided', () => {
      const error = {
        $metadata: { httpStatusCode: 429 },
        message: 'Rate limited',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.retryAfterMs).toBe(60_000); // default 60s
    });
  });
  
  // ==========================================================================
  // RETRY: 5xx server errors
  // ==========================================================================
  
  describe('RETRY: 5xx server errors', () => {
    it('should classify HTTP 500 as RETRY with S3_5XX', () => {
      const error = {
        $metadata: { httpStatusCode: 500 },
        message: 'Internal Server Error',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_5XX);
    });
    
    it('should classify HTTP 502 as RETRY', () => {
      const error = {
        $metadata: { httpStatusCode: 502 },
        message: 'Bad Gateway',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_5XX);
    });
    
    it('should classify HTTP 503 as RETRY', () => {
      const error = {
        $metadata: { httpStatusCode: 503 },
        message: 'Service Unavailable',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_5XX);
    });
    
    it('should classify HTTP 504 as RETRY with S3_TIMEOUT (Gateway Timeout)', () => {
      const error = {
        $metadata: { httpStatusCode: 504 },
        message: 'Gateway Timeout',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      // 504 Gateway Timeout is classified as timeout, not generic 5xx
      expect(result.errorCode).toBe(ManifestErrorCode.S3_TIMEOUT);
    });
    
    it('should classify InternalError code as RETRY', () => {
      const error = {
        code: 'InternalError',
        message: 'We encountered an internal error',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_5XX);
    });
  });
  
  // ==========================================================================
  // DLQ: Access denied (403)
  // ==========================================================================
  
  describe('DLQ: Access denied errors', () => {
    it('should classify HTTP 403 as DLQ with S3_ACCESS_DENIED', () => {
      const error = {
        $metadata: { httpStatusCode: 403 },
        message: 'Access Denied',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_ACCESS_DENIED);
    });
    
    it('should classify AccessDenied code as DLQ', () => {
      const error = {
        code: 'AccessDenied',
        message: 'Access Denied',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_ACCESS_DENIED);
    });
    
    it('should classify InvalidAccessKeyId as DLQ', () => {
      const error = {
        code: 'InvalidAccessKeyId',
        message: 'The AWS Access Key Id you provided does not exist',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_ACCESS_DENIED);
    });
    
    it('should classify SignatureDoesNotMatch as DLQ', () => {
      const error = {
        code: 'SignatureDoesNotMatch',
        message: 'The request signature we calculated does not match',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_ACCESS_DENIED);
    });
  });
  
  // ==========================================================================
  // DLQ: Bucket not found
  // ==========================================================================
  
  describe('DLQ: Bucket not found errors', () => {
    it('should classify NoSuchBucket as DLQ with S3_NO_SUCH_BUCKET', () => {
      const error = {
        code: 'NoSuchBucket',
        message: 'The specified bucket does not exist',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_NO_SUCH_BUCKET);
    });
  });
  
  // ==========================================================================
  // DLQ: Invalid object/key
  // ==========================================================================
  
  describe('DLQ: Invalid object errors', () => {
    it('should classify InvalidObjectKey as DLQ with S3_INVALID_OBJECT', () => {
      const error = {
        code: 'InvalidObjectKey',
        message: 'Object key is invalid',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_INVALID_OBJECT);
    });
    
    it('should classify KeyTooLong as DLQ', () => {
      const error = {
        code: 'KeyTooLong',
        message: 'Your key is too long',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.S3_INVALID_OBJECT);
    });
  });
  
  // ==========================================================================
  // DLQ: Serialization errors
  // ==========================================================================
  
  describe('DLQ: Serialization errors', () => {
    it('should classify SyntaxError as DLQ with SERIALIZATION_ERROR', () => {
      const error = new SyntaxError('Unexpected token');
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.SERIALIZATION_ERROR);
    });
    
    it('should classify circular structure error as DLQ', () => {
      const error = new TypeError('Converting circular structure to JSON');
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.SERIALIZATION_ERROR);
    });
    
    it('should classify JSON stringify error as DLQ', () => {
      const error = {
        message: 'Failed to stringify JSON payload',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.SERIALIZATION_ERROR);
    });
  });
  
  // ==========================================================================
  // UNKNOWN: Guardrail behavior
  // ==========================================================================
  
  describe('UNKNOWN: Guardrail behavior', () => {
    it('should RETRY unknown error on attempt=0', () => {
      const error = {
        code: 'SomeUnknownError',
        message: 'Something unexpected happened',
      };
      
      const result = classifyError(error, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.UNKNOWN);
      expect(result.reason).toContain('retrying once');
    });
    
    it('should DLQ unknown error on attempt>=1', () => {
      const error = {
        code: 'SomeUnknownError',
        message: 'Something unexpected happened',
      };
      
      const result = classifyError(error, 1);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.UNKNOWN);
      expect(result.reason).toContain('investigation');
    });
    
    it('should DLQ unknown error on attempt=5', () => {
      const error = {
        code: 'SomeUnknownError',
        message: 'Something unexpected happened',
      };
      
      const result = classifyError(error, 5);
      
      expect(result.decision).toBe('DLQ');
      expect(result.errorCode).toBe(ManifestErrorCode.UNKNOWN);
    });
  });
  
  // ==========================================================================
  // Edge cases
  // ==========================================================================
  
  describe('Edge cases', () => {
    it('should handle null error', () => {
      const result = classifyError(null, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.UNKNOWN);
    });
    
    it('should handle undefined error', () => {
      const result = classifyError(undefined, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.UNKNOWN);
    });
    
    it('should handle string error', () => {
      const result = classifyError('Something went wrong', 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.UNKNOWN);
    });
    
    it('should handle empty object error', () => {
      const result = classifyError({}, 0);
      
      expect(result.decision).toBe('RETRY');
      expect(result.errorCode).toBe(ManifestErrorCode.UNKNOWN);
    });
    
    it('should default attemptCount to 0', () => {
      const error = {
        code: 'SomeUnknownError',
        message: 'Unknown',
      };
      
      // Call without attemptCount
      const result = classifyError(error);
      
      expect(result.decision).toBe('RETRY');
    });
  });
  
  // ==========================================================================
  // Helper function exports
  // ==========================================================================
  
  describe('Helper function exports', () => {
    it('should export isAlreadyExistsError', () => {
      expect(ManifestErrorClassifier.isAlreadyExistsError({ code: 'PreconditionFailed' })).toBe(true);
      expect(ManifestErrorClassifier.isAlreadyExistsError({ code: 'SomeOther' })).toBe(false);
    });
    
    it('should export isTimeoutError', () => {
      expect(ManifestErrorClassifier.isTimeoutError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(ManifestErrorClassifier.isTimeoutError({ code: 'SomeOther' })).toBe(false);
    });
    
    it('should export is5xxError', () => {
      expect(ManifestErrorClassifier.is5xxError({ $metadata: { httpStatusCode: 500 } })).toBe(true);
      expect(ManifestErrorClassifier.is5xxError({ $metadata: { httpStatusCode: 200 } })).toBe(false);
    });
    
    it('should export isAccessDeniedError', () => {
      expect(ManifestErrorClassifier.isAccessDeniedError({ code: 'AccessDenied' })).toBe(true);
      expect(ManifestErrorClassifier.isAccessDeniedError({ code: 'SomeOther' })).toBe(false);
    });
  });
});
