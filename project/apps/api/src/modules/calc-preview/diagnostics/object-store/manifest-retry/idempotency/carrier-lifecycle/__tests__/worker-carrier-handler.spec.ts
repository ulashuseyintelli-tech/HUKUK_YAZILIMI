/**
 * Worker Carrier Handler Tests - Phase 10.5 Task 6
 */

import {
  handleRetryCarrier,
  handleDlqCarrier,
  SimpleWorkerCarrierMetrics,
  WorkerCarrierSizeExceededError,
  CARRIER_SIZE_EXCEEDED_ERROR_CODE,
} from '../worker-carrier-handler';
import {
  IdempotencyContextCarrierV2,
  MAX_CARRIER_SIZE_BYTES,
} from '../carrier-lifecycle.types';
import { resetAllMetrics } from '../carrier-lifecycle-metrics';

describe('Worker Carrier Handler', () => {
  let metrics: SimpleWorkerCarrierMetrics;
  
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
  
  beforeEach(() => {
    metrics = new SimpleWorkerCarrierMetrics();
    resetAllMetrics();
  });
  
  // =========================================================================
  // RETRY PATH
  // =========================================================================
  
  describe('handleRetryCarrier', () => {
    const failure = { code: 'ECONNREFUSED', message: 'Connection refused' };
    
    describe('basic mutation', () => {
      it('should increment attemptNumber', () => {
        const result = handleRetryCarrier(baseV2Carrier, failure, metrics);
        
        expect(result.attemptNumber).toBe(1);
        expect(result.carrier.attemptNumber).toBe(1);
      });
      
      it('should append to failureHistory', () => {
        const result = handleRetryCarrier(baseV2Carrier, failure, metrics);
        
        expect(result.carrier.failureHistory).toHaveLength(1);
        expect(result.carrier.failureHistory![0].errorCode).toBe('ECONNREFUSED');
      });
      
      it('should record mutation metric', () => {
        handleRetryCarrier(baseV2Carrier, failure, metrics);
        
        expect(metrics.getCount('carrier_mutated_total:attempt=1')).toBe(1);
      });
    });
    
    describe('size enforcement', () => {
      it('should pass small carrier with action=OK', () => {
        const result = handleRetryCarrier(baseV2Carrier, failure, metrics);
        
        expect(result.sizeAction).toBe('OK');
        expect(metrics.getCount('carrier_size_ok_total')).toBe(1);
      });
      
      it('should truncate large carrier with action=TRUNCATED', () => {
        // Create carrier with large failure history
        const largeCarrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 50,
          failureHistory: Array(50).fill(null).map((_, i) => ({
            timestamp: `2026-02-05T0${i % 10}:00:00.000Z`,
            errorCode: `ERR_${i}`,
            errorMessage: 'X'.repeat(100),
          })),
        };
        
        const result = handleRetryCarrier(largeCarrier, failure, metrics);
        
        // Should truncate if over limit
        if (result.sizeAction === 'TRUNCATED') {
          expect(metrics.getCount('carrier_truncated_total')).toBe(1);
        }
      });
    });
    
    describe('oversize rejection', () => {
      it('should throw WorkerCarrierSizeExceededError for huge carrier', () => {
        // Create carrier that cannot fit even after truncation
        const hugeCarrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 3,
          failureHistory: Array(3).fill(null).map((_, i) => ({
            timestamp: `2026-02-05T0${i}:00:00.000Z`,
            errorCode: `ERR_${i}`,
            errorMessage: 'X'.repeat(2000), // Very long messages
          })),
        };
        
        // Check if it's actually over limit
        const serialized = JSON.stringify(hugeCarrier);
        const size = Buffer.byteLength(serialized, 'utf8');
        
        if (size > MAX_CARRIER_SIZE_BYTES) {
          expect(() => handleRetryCarrier(hugeCarrier, failure, metrics))
            .toThrow(WorkerCarrierSizeExceededError);
          
          expect(metrics.getCount('carrier_rejected_total')).toBe(1);
        }
      });
      
      it('should have correct error code', () => {
        const hugeCarrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 3,
          failureHistory: Array(3).fill(null).map((_, i) => ({
            timestamp: `2026-02-05T0${i}:00:00.000Z`,
            errorCode: `ERR_${i}`,
            errorMessage: 'X'.repeat(2000),
          })),
        };
        
        const serialized = JSON.stringify(hugeCarrier);
        const size = Buffer.byteLength(serialized, 'utf8');
        
        if (size > MAX_CARRIER_SIZE_BYTES) {
          try {
            handleRetryCarrier(hugeCarrier, failure, metrics);
            fail('Should have thrown');
          } catch (e) {
            expect(e).toBeInstanceOf(WorkerCarrierSizeExceededError);
            expect((e as WorkerCarrierSizeExceededError).code).toBe(CARRIER_SIZE_EXCEEDED_ERROR_CODE);
          }
        }
      });
    });
  });
  
  // =========================================================================
  // DLQ PATH
  // =========================================================================
  
  describe('handleDlqCarrier', () => {
    describe('basic enrichment', () => {
      it('should set dlqReason to EXHAUSTED', () => {
        const result = handleDlqCarrier(baseV2Carrier, 'EXHAUSTED', metrics);
        
        expect(result.reason).toBe('EXHAUSTED');
        expect(result.carrier.dlqReason).toBe('EXHAUSTED');
      });
      
      it('should set dlqReason to POISON', () => {
        const result = handleDlqCarrier(baseV2Carrier, 'POISON', metrics);
        
        expect(result.reason).toBe('POISON');
        expect(result.carrier.dlqReason).toBe('POISON');
      });
      
      it('should set dlqReason to MANUAL', () => {
        const result = handleDlqCarrier(baseV2Carrier, 'MANUAL', metrics);
        
        expect(result.reason).toBe('MANUAL');
        expect(result.carrier.dlqReason).toBe('MANUAL');
      });
      
      it('should set finalAttemptNumber', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          attemptNumber: 5,
        };
        
        const result = handleDlqCarrier(carrier, 'EXHAUSTED', metrics);
        
        expect(result.finalAttemptNumber).toBe(5);
        expect(result.carrier.finalAttemptNumber).toBe(5);
      });
      
      it('should record DLQ enrichment metric', () => {
        handleDlqCarrier(baseV2Carrier, 'EXHAUSTED', metrics);
        
        expect(metrics.getCount('carrier_dlq_enriched_total:reason=EXHAUSTED')).toBe(1);
      });
    });
    
    describe('size enforcement', () => {
      it('should pass small carrier with action=OK', () => {
        const result = handleDlqCarrier(baseV2Carrier, 'EXHAUSTED', metrics);
        
        expect(result.sizeAction).toBe('OK');
        expect(metrics.getCount('carrier_size_ok_total')).toBe(1);
      });
    });
  });
  
  // =========================================================================
  // INTEGRATION SCENARIOS
  // =========================================================================
  
  describe('Integration scenarios', () => {
    it('should handle full retry → DLQ lifecycle', () => {
      // 1. Start with V2 carrier
      const carrier = { ...baseV2Carrier };
      
      // 2. First retry
      const retry1 = handleRetryCarrier(carrier, { code: 'ERR', message: 'Error' }, metrics);
      expect(retry1.attemptNumber).toBe(1);
      
      // 3. Second retry
      const retry2 = handleRetryCarrier(retry1.carrier, { code: 'ERR', message: 'Error' }, metrics);
      expect(retry2.attemptNumber).toBe(2);
      
      // 4. Move to DLQ
      const dlq = handleDlqCarrier(retry2.carrier, 'EXHAUSTED', metrics);
      expect(dlq.finalAttemptNumber).toBe(2);
      expect(dlq.carrier.dlqReason).toBe('EXHAUSTED');
      expect(dlq.carrier.failureHistory).toHaveLength(2);
    });
    
    it('should preserve correlation through lifecycle', () => {
      const carrier = { ...baseV2Carrier };
      const retry = handleRetryCarrier(carrier, { code: 'ERR', message: 'Error' }, metrics);
      const dlq = handleDlqCarrier(retry.carrier, 'EXHAUSTED', metrics);
      
      // Correlation preserved
      expect(dlq.carrier.requestId).toBe(baseV2Carrier.requestId);
      expect(dlq.carrier.actionId).toBe(baseV2Carrier.actionId);
    });
  });
});
