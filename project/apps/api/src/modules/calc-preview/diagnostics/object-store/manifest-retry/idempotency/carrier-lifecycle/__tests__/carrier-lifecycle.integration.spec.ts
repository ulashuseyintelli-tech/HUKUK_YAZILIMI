/**
 * Carrier Lifecycle Integration Tests - Phase 10.5 Task 9
 * 
 * Tests full carrier lifecycle across Retry, DLQ, and Redrive paths.
 */

import {
  mutateCarrierForRetry,
  enrichCarrierForDlq,
  cloneCarrierForRedrive,
  enforceCarrierSizeLimit,
  IdempotencyContextCarrierV2,
  MAX_FAILURE_HISTORY_SIZE,
  resetAllMetrics,
} from '../index';
import { IdempotencyContextCarrier } from '../../idempotency-carrier.types';

describe('Carrier Lifecycle Integration', () => {
  // =========================================================================
  // FIXTURES
  // =========================================================================
  
  const initialV1Carrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'initial-req-001',
    actionId: 'initial-act-001',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-001',
    takeover: false,
    previousActorId: null,
  };
  
  const initialV2Carrier: IdempotencyContextCarrierV2 = {
    version: 2,
    requestId: 'initial-req-002',
    actionId: 'initial-act-002',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-002',
    takeover: false,
    previousActorId: null,
    attemptNumber: 0,
  };
  
  const redriveContext = {
    dlqName: 'manifest-dlq',
    operatorId: 'operator-001',
  };
  
  beforeEach(() => {
    resetAllMetrics();
  });
  
  // =========================================================================
  // FULL LIFECYCLE TESTS
  // =========================================================================
  
  describe('Job success → no carrier mutation', () => {
    it('should not modify carrier on success', () => {
      // Success path: carrier passes through unchanged
      const result = enforceCarrierSizeLimit(initialV2Carrier);
      
      expect(result.action).toBe('OK');
      expect(result.carrier.attemptNumber).toBe(0);
      expect(result.carrier.failureHistory).toBeUndefined();
    });
  });
  
  describe('Job fail → retry → carrier mutated', () => {
    it('should mutate carrier on retry', () => {
      const failure = { code: 'ECONNREFUSED', message: 'Connection refused' };
      
      // First failure
      const result1 = mutateCarrierForRetry(initialV2Carrier, failure);
      expect(result1.carrier.attemptNumber).toBe(1);
      expect(result1.carrier.failureHistory).toHaveLength(1);
      
      // Second failure
      const result2 = mutateCarrierForRetry(result1.carrier, failure);
      expect(result2.carrier.attemptNumber).toBe(2);
      expect(result2.carrier.failureHistory).toHaveLength(2);
      
      // Correlation preserved
      expect(result2.carrier.requestId).toBe(initialV2Carrier.requestId);
    });
    
    it('should upgrade V1 carrier on first retry', () => {
      const failure = { code: 'ETIMEDOUT', message: 'Timeout' };
      
      const result = mutateCarrierForRetry(initialV1Carrier, failure);
      
      expect(result.carrier.version).toBe(2);
      expect(result.carrier.attemptNumber).toBe(1);
      expect(result.carrier.requestId).toBe(initialV1Carrier.requestId);
    });
  });
  
  describe('Job fail → exhaust → DLQ → carrier enriched', () => {
    it('should enrich carrier when moved to DLQ', () => {
      const failure = { code: 'ECONNREFUSED', message: 'Connection refused' };
      
      // Simulate 3 retries
      let carrier = initialV2Carrier;
      for (let i = 0; i < 3; i++) {
        const result = mutateCarrierForRetry(carrier, failure);
        carrier = result.carrier;
      }
      
      expect(carrier.attemptNumber).toBe(3);
      
      // Move to DLQ
      const dlqResult = enrichCarrierForDlq(carrier, 'EXHAUSTED');
      
      expect(dlqResult.carrier.dlqReason).toBe('EXHAUSTED');
      expect(dlqResult.carrier.finalAttemptNumber).toBe(3);
      expect(dlqResult.carrier.movedToDlqAt).toBeDefined();
      
      // Correlation preserved
      expect(dlqResult.carrier.requestId).toBe(initialV2Carrier.requestId);
    });
    
    it('should preserve failure history in DLQ', () => {
      const failure = { code: 'ERR', message: 'Error' };
      
      let carrier = initialV2Carrier;
      for (let i = 0; i < 3; i++) {
        const result = mutateCarrierForRetry(carrier, failure);
        carrier = result.carrier;
      }
      
      const dlqResult = enrichCarrierForDlq(carrier, 'EXHAUSTED');
      
      expect(dlqResult.carrier.failureHistory).toHaveLength(3);
    });
  });
  
  describe('DLQ → redrive → carrier cloned', () => {
    it('should clone carrier with new correlationId on redrive', () => {
      const failure = { code: 'ERR', message: 'Error' };
      
      // Build up to DLQ
      let carrier = initialV2Carrier;
      for (let i = 0; i < 3; i++) {
        const result = mutateCarrierForRetry(carrier, failure);
        carrier = result.carrier;
      }
      const dlqCarrier = enrichCarrierForDlq(carrier, 'EXHAUSTED').carrier;
      
      // Redrive
      const redriveResult = cloneCarrierForRedrive(dlqCarrier, redriveContext);
      
      // New correlationId
      expect(redriveResult.carrier.requestId).not.toBe(dlqCarrier.requestId);
      
      // Parent link
      expect(redriveResult.carrier.parentCorrelationId).toBe(dlqCarrier.requestId);
      
      // Reset state
      expect(redriveResult.carrier.attemptNumber).toBe(0);
      expect(redriveResult.carrier.dlqReason).toBeUndefined();
      expect(redriveResult.carrier.failureHistory).toBeUndefined();
      
      // Redrive metadata
      expect(redriveResult.carrier.redriveSource).toBe('manifest-dlq');
      expect(redriveResult.carrier.redrivenBy).toBe('operator-001');
    });
  });
  
  describe('Full cycle with size limits', () => {
    it('should enforce size limits throughout lifecycle', () => {
      const failure = { code: 'ERR', message: 'A'.repeat(200) };
      
      // Build up failures
      let carrier = initialV2Carrier;
      for (let i = 0; i < MAX_FAILURE_HISTORY_SIZE + 5; i++) {
        const result = mutateCarrierForRetry(carrier, failure);
        carrier = result.carrier;
      }
      
      // Should be capped at MAX_FAILURE_HISTORY_SIZE
      expect(carrier.failureHistory?.length).toBe(MAX_FAILURE_HISTORY_SIZE);
      
      // Size limit check
      const sizeResult = enforceCarrierSizeLimit(carrier);
      expect(['OK', 'TRUNCATED']).toContain(sizeResult.action);
    });
  });
  
  describe('Correlation chain traceable', () => {
    it('should maintain traceable chain through multiple redrives', () => {
      const failure = { code: 'ERR', message: 'Error' };
      
      // First lifecycle
      let carrier1 = initialV2Carrier;
      carrier1 = mutateCarrierForRetry(carrier1, failure).carrier;
      carrier1 = enrichCarrierForDlq(carrier1, 'EXHAUSTED').carrier;
      
      // First redrive
      const redrive1 = cloneCarrierForRedrive(carrier1, redriveContext);
      expect(redrive1.carrier.parentCorrelationId).toBe(initialV2Carrier.requestId);
      
      // Second lifecycle (redriven job fails again)
      let carrier2 = redrive1.carrier;
      carrier2 = mutateCarrierForRetry(carrier2, failure).carrier;
      carrier2 = enrichCarrierForDlq(carrier2, 'EXHAUSTED').carrier;
      
      // Second redrive
      const redrive2 = cloneCarrierForRedrive(carrier2, redriveContext);
      
      // Chain: redrive2 → redrive1 → initial
      expect(redrive2.carrier.parentCorrelationId).toBe(redrive1.carrier.requestId);
      
      // Can trace back to original
      expect(redrive1.carrier.parentCorrelationId).toBe(initialV2Carrier.requestId);
    });
  });
  
  describe('POISON DLQ reason', () => {
    it('should move directly to DLQ without retry', () => {
      // POISON = unprocessable, no retry
      const dlqResult = enrichCarrierForDlq(initialV2Carrier, 'POISON');
      
      expect(dlqResult.carrier.dlqReason).toBe('POISON');
      expect(dlqResult.carrier.attemptNumber).toBe(0); // No retries
      expect(dlqResult.carrier.finalAttemptNumber).toBe(0);
    });
  });
  
  describe('MANUAL DLQ reason', () => {
    it('should record operator-triggered move', () => {
      const failure = { code: 'ERR', message: 'Error' };
      
      // Some retries happened
      let carrier = initialV2Carrier;
      carrier = mutateCarrierForRetry(carrier, failure).carrier;
      carrier = mutateCarrierForRetry(carrier, failure).carrier;
      
      // Operator manually moves to DLQ
      const dlqResult = enrichCarrierForDlq(carrier, 'MANUAL');
      
      expect(dlqResult.carrier.dlqReason).toBe('MANUAL');
      expect(dlqResult.carrier.finalAttemptNumber).toBe(2);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle null/undefined carrier gracefully', () => {
      // ensureCarrierV2 should handle this
      expect(() => mutateCarrierForRetry(null, { code: 'ERR', message: 'Error' }))
        .toThrow();
    });
    
    it('should handle empty failure message', () => {
      const result = mutateCarrierForRetry(initialV2Carrier, { code: 'ERR', message: '' });
      
      expect(result.carrier.failureHistory?.[0].errorMessage).toBe('');
    });
  });
});
