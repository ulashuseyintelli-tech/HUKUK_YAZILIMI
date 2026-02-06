/**
 * Retry Carrier Mutator Tests - Phase 10.5 Task 2
 */

import {
  mutateCarrierForRetry,
  hasFailureHistory,
  getFailureCount,
} from '../retry-carrier-mutator';
import {
  IdempotencyContextCarrierV2,
  MAX_FAILURE_HISTORY_SIZE,
  MAX_ERROR_MESSAGE_LENGTH,
} from '../carrier-lifecycle.types';
import { IdempotencyContextCarrier } from '../../idempotency-carrier.types';
import { retryMutationMetric, resetAllMetrics } from '../carrier-lifecycle-metrics';

describe('Retry Carrier Mutator', () => {
  // =========================================================================
  // FIXTURES
  // =========================================================================
  
  const baseV2Carrier: IdempotencyContextCarrierV2 = {
    version: 2,
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
    attemptNumber: 0,
  };
  
  const baseV1Carrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
  };
  
  const testFailure = {
    code: 'ECONNREFUSED',
    message: 'Connection refused to host',
  };
  
  const fixedDate = new Date('2026-02-05T10:00:00.000Z');
  
  beforeEach(() => {
    resetAllMetrics();
  });
  
  // =========================================================================
  // BASIC MUTATION
  // =========================================================================
  
  describe('mutateCarrierForRetry', () => {
    describe('attemptNumber increment', () => {
      it('should increment attemptNumber from 0 to 1', () => {
        const result = mutateCarrierForRetry(baseV2Carrier, testFailure, fixedDate);
        
        expect(result.previousAttemptNumber).toBe(0);
        expect(result.newAttemptNumber).toBe(1);
        expect(result.carrier.attemptNumber).toBe(1);
      });
      
      it('should increment attemptNumber from 5 to 6', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 5,
        };
        
        const result = mutateCarrierForRetry(carrier, testFailure, fixedDate);
        
        expect(result.previousAttemptNumber).toBe(5);
        expect(result.newAttemptNumber).toBe(6);
        expect(result.carrier.attemptNumber).toBe(6);
      });
    });
    
    describe('lastFailedAt timestamp', () => {
      it('should set lastFailedAt to ISO timestamp', () => {
        const result = mutateCarrierForRetry(baseV2Carrier, testFailure, fixedDate);
        
        expect(result.carrier.lastFailedAt).toBe('2026-02-05T10:00:00.000Z');
      });
      
      it('should use current time if not provided', () => {
        const before = new Date();
        const result = mutateCarrierForRetry(baseV2Carrier, testFailure);
        const after = new Date();
        
        const timestamp = new Date(result.carrier.lastFailedAt!);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });
    
    describe('failureHistory append', () => {
      it('should create failureHistory if not exists', () => {
        const result = mutateCarrierForRetry(baseV2Carrier, testFailure, fixedDate);
        
        expect(result.carrier.failureHistory).toHaveLength(1);
        expect(result.carrier.failureHistory![0]).toEqual({
          timestamp: '2026-02-05T10:00:00.000Z',
          errorCode: 'ECONNREFUSED',
          errorMessage: 'Connection refused to host',
        });
      });
      
      it('should append to existing failureHistory', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 1,
          failureHistory: [
            { timestamp: '2026-02-05T09:00:00.000Z', errorCode: 'ETIMEDOUT', errorMessage: 'Timeout' },
          ],
        };
        
        const result = mutateCarrierForRetry(carrier, testFailure, fixedDate);
        
        expect(result.carrier.failureHistory).toHaveLength(2);
        expect(result.carrier.failureHistory![0].errorCode).toBe('ETIMEDOUT');
        expect(result.carrier.failureHistory![1].errorCode).toBe('ECONNREFUSED');
      });
      
      it('should handle empty error code', () => {
        const result = mutateCarrierForRetry(
          baseV2Carrier,
          { code: '', message: 'Error' },
          fixedDate,
        );
        
        expect(result.carrier.failureHistory![0].errorCode).toBe('UNKNOWN');
      });
      
      it('should handle undefined error code', () => {
        const result = mutateCarrierForRetry(
          baseV2Carrier,
          { code: undefined as any, message: 'Error' },
          fixedDate,
        );
        
        expect(result.carrier.failureHistory![0].errorCode).toBe('UNKNOWN');
      });
    });
    
    describe('error message truncation', () => {
      it('should preserve short messages', () => {
        const result = mutateCarrierForRetry(
          baseV2Carrier,
          { code: 'ERR', message: 'Short message' },
          fixedDate,
        );
        
        expect(result.carrier.failureHistory![0].errorMessage).toBe('Short message');
      });
      
      it('should truncate messages exceeding max length', () => {
        const longMessage = 'A'.repeat(300);
        const result = mutateCarrierForRetry(
          baseV2Carrier,
          { code: 'ERR', message: longMessage },
          fixedDate,
        );
        
        const truncated = result.carrier.failureHistory![0].errorMessage;
        expect(truncated.length).toBe(MAX_ERROR_MESSAGE_LENGTH);
        expect(truncated.endsWith('...')).toBe(true);
      });
      
      it('should handle null message', () => {
        const result = mutateCarrierForRetry(
          baseV2Carrier,
          { code: 'ERR', message: null as any },
          fixedDate,
        );
        
        expect(result.carrier.failureHistory![0].errorMessage).toBe('');
      });
      
      it('should handle undefined message', () => {
        const result = mutateCarrierForRetry(
          baseV2Carrier,
          { code: 'ERR', message: undefined as any },
          fixedDate,
        );
        
        expect(result.carrier.failureHistory![0].errorMessage).toBe('');
      });
    });
    
    describe('failureHistory hard cap', () => {
      it('should not cap when under limit', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 5,
          failureHistory: Array(5).fill(null).map((_, i) => ({
            timestamp: `2026-02-05T0${i}:00:00.000Z`,
            errorCode: `ERR_${i}`,
            errorMessage: `Error ${i}`,
          })),
        };
        
        const result = mutateCarrierForRetry(carrier, testFailure, fixedDate);
        
        expect(result.carrier.failureHistory).toHaveLength(6);
        expect(result.historyCapped).toBe(false);
      });
      
      it('should cap at MAX_FAILURE_HISTORY_SIZE', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: MAX_FAILURE_HISTORY_SIZE,
          failureHistory: Array(MAX_FAILURE_HISTORY_SIZE).fill(null).map((_, i) => ({
            timestamp: `2026-02-05T0${i}:00:00.000Z`,
            errorCode: `ERR_${i}`,
            errorMessage: `Error ${i}`,
          })),
        };
        
        const result = mutateCarrierForRetry(carrier, testFailure, fixedDate);
        
        expect(result.carrier.failureHistory).toHaveLength(MAX_FAILURE_HISTORY_SIZE);
        expect(result.historyCapped).toBe(true);
      });
      
      it('should drop oldest entries when capped (FIFO)', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: MAX_FAILURE_HISTORY_SIZE,
          failureHistory: Array(MAX_FAILURE_HISTORY_SIZE).fill(null).map((_, i) => ({
            timestamp: `2026-02-05T0${i}:00:00.000Z`,
            errorCode: `ERR_${i}`,
            errorMessage: `Error ${i}`,
          })),
        };
        
        const result = mutateCarrierForRetry(carrier, testFailure, fixedDate);
        
        // First entry should be ERR_1 (ERR_0 dropped)
        expect(result.carrier.failureHistory![0].errorCode).toBe('ERR_1');
        // Last entry should be the new one
        expect(result.carrier.failureHistory![MAX_FAILURE_HISTORY_SIZE - 1].errorCode).toBe('ECONNREFUSED');
      });
    });
    
    describe('correlation preservation', () => {
      it('should preserve all correlation fields', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          parentCorrelationId: 'parent-123',
        };
        
        const result = mutateCarrierForRetry(carrier, testFailure, fixedDate);
        
        expect(result.carrier.requestId).toBe(carrier.requestId);
        expect(result.carrier.actionId).toBe(carrier.actionId);
        expect(result.carrier.parentCorrelationId).toBe('parent-123');
      });
      
      it('should preserve all V1 fields', () => {
        const result = mutateCarrierForRetry(baseV2Carrier, testFailure, fixedDate);
        
        expect(result.carrier.actionType).toBe(baseV2Carrier.actionType);
        expect(result.carrier.resourceType).toBe(baseV2Carrier.resourceType);
        expect(result.carrier.resourceId).toBe(baseV2Carrier.resourceId);
        expect(result.carrier.takeover).toBe(baseV2Carrier.takeover);
        expect(result.carrier.previousActorId).toBe(baseV2Carrier.previousActorId);
      });
    });
    
    describe('V1 carrier auto-upgrade', () => {
      it('should auto-upgrade V1 carrier to V2', () => {
        const result = mutateCarrierForRetry(baseV1Carrier, testFailure, fixedDate);
        
        expect(result.carrier.version).toBe(2);
        expect(result.previousAttemptNumber).toBe(0); // V1 defaults to 0
        expect(result.newAttemptNumber).toBe(1);
      });
      
      it('should preserve V1 fields after upgrade', () => {
        const result = mutateCarrierForRetry(baseV1Carrier, testFailure, fixedDate);
        
        expect(result.carrier.requestId).toBe(baseV1Carrier.requestId);
        expect(result.carrier.actionId).toBe(baseV1Carrier.actionId);
      });
    });
    
    describe('metrics', () => {
      it('should increment retry mutation metric with path label', () => {
        mutateCarrierForRetry(baseV2Carrier, testFailure, fixedDate);
        
        expect(retryMutationMetric.getCount({ path: 'retry' })).toBe(1);
      });
      
      it('should not use attempt_number label (cardinality protection)', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 4,
        };
        
        mutateCarrierForRetry(carrier, testFailure, fixedDate);
        
        // All mutations go to same path=retry bucket
        expect(retryMutationMetric.getCount({ path: 'retry' })).toBe(1);
      });
    });
  });
  
  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================
  
  describe('hasFailureHistory', () => {
    it('should return false for carrier without history', () => {
      expect(hasFailureHistory(baseV2Carrier)).toBe(false);
    });
    
    it('should return false for empty history', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        failureHistory: [],
      };
      
      expect(hasFailureHistory(carrier)).toBe(false);
    });
    
    it('should return true for carrier with history', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        failureHistory: [
          { timestamp: '2026-02-05T10:00:00.000Z', errorCode: 'ERR', errorMessage: 'Error' },
        ],
      };
      
      expect(hasFailureHistory(carrier)).toBe(true);
    });
  });
  
  describe('getFailureCount', () => {
    it('should return 0 for carrier without history', () => {
      expect(getFailureCount(baseV2Carrier)).toBe(0);
    });
    
    it('should return correct count', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        failureHistory: [
          { timestamp: '2026-02-05T09:00:00.000Z', errorCode: 'ERR_1', errorMessage: 'Error 1' },
          { timestamp: '2026-02-05T10:00:00.000Z', errorCode: 'ERR_2', errorMessage: 'Error 2' },
        ],
      };
      
      expect(getFailureCount(carrier)).toBe(2);
    });
  });
});
