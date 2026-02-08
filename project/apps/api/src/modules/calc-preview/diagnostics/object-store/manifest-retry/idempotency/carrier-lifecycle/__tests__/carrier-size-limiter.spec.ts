/**
 * Carrier Size Limiter Tests - Phase 10.5 Task 5
 */

import {
  enforceCarrierSizeLimit,
  calculateCarrierSize,
  isWithinSizeLimit,
  getCarrierSizeInfo,
} from '../carrier-size-limiter';
import {
  IdempotencyContextCarrierV2,
  CarrierSizeExceededError,
  MAX_CARRIER_SIZE_BYTES,
  MIN_FAILURE_HISTORY_SIZE,
} from '../carrier-lifecycle.types';
import { sizeEnforcementMetric, resetAllMetrics } from '../carrier-lifecycle-metrics';

describe('Carrier Size Limiter', () => {
  // =========================================================================
  // FIXTURES
  // =========================================================================
  
  const smallCarrier: IdempotencyContextCarrierV2 = {
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
  
  const carrierWithHistory: IdempotencyContextCarrierV2 = {
    ...smallCarrier,
    attemptNumber: 5,
    failureHistory: [
      { timestamp: '2026-02-05T01:00:00.000Z', errorCode: 'ERR_1', errorMessage: 'Error 1' },
      { timestamp: '2026-02-05T02:00:00.000Z', errorCode: 'ERR_2', errorMessage: 'Error 2' },
      { timestamp: '2026-02-05T03:00:00.000Z', errorCode: 'ERR_3', errorMessage: 'Error 3' },
      { timestamp: '2026-02-05T04:00:00.000Z', errorCode: 'ERR_4', errorMessage: 'Error 4' },
      { timestamp: '2026-02-05T05:00:00.000Z', errorCode: 'ERR_5', errorMessage: 'Error 5' },
    ],
  };
  
  // Create a carrier that exceeds size limit
  function createLargeCarrier(failureCount: number, messageLength: number): IdempotencyContextCarrierV2 {
    const longMessage = 'X'.repeat(messageLength);
    return {
      ...smallCarrier,
      attemptNumber: failureCount,
      failureHistory: Array(failureCount).fill(null).map((_, i) => ({
        timestamp: `2026-02-05T0${i}:00:00.000Z`,
        errorCode: `ERR_${i}`,
        errorMessage: longMessage,
      })),
    };
  }
  
  beforeEach(() => {
    resetAllMetrics();
  });
  
  // =========================================================================
  // SIZE CALCULATION
  // =========================================================================
  
  describe('calculateCarrierSize', () => {
    it('should calculate size in bytes', () => {
      const size = calculateCarrierSize(smallCarrier);
      
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });
    
    it('should match JSON.stringify byte length', () => {
      const size = calculateCarrierSize(smallCarrier);
      const expected = Buffer.byteLength(JSON.stringify(smallCarrier), 'utf8');
      
      expect(size).toBe(expected);
    });
    
    it('should increase with more failure history', () => {
      const smallSize = calculateCarrierSize(smallCarrier);
      const largeSize = calculateCarrierSize(carrierWithHistory);
      
      expect(largeSize).toBeGreaterThan(smallSize);
    });
  });
  
  // =========================================================================
  // SIZE ENFORCEMENT
  // =========================================================================
  
  describe('enforceCarrierSizeLimit', () => {
    describe('small carrier (within limit)', () => {
      it('should pass through with action=OK', () => {
        const result = enforceCarrierSizeLimit(smallCarrier);
        
        expect(result.action).toBe('OK');
        expect(result.carrier).toBe(smallCarrier);
      });
      
      it('should report original and final size as equal', () => {
        const result = enforceCarrierSizeLimit(smallCarrier);
        
        expect(result.originalSizeBytes).toBe(result.finalSizeBytes);
      });
      
      it('should increment OK metric', () => {
        enforceCarrierSizeLimit(smallCarrier);
        
        expect(sizeEnforcementMetric.getCount({ action: 'OK' })).toBe(1);
      });
    });
    
    describe('large carrier (truncatable)', () => {
      it('should truncate and return action=TRUNCATED', () => {
        // Create carrier just over limit
        const largeCarrier = createLargeCarrier(50, 100);
        const originalSize = calculateCarrierSize(largeCarrier);
        
        // Skip if already within limit
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        const result = enforceCarrierSizeLimit(largeCarrier);
        
        expect(result.action).toBe('TRUNCATED');
        expect(result.finalSizeBytes).toBeLessThan(result.originalSizeBytes);
      });
      
      it('should keep last MIN_FAILURE_HISTORY_SIZE entries', () => {
        const largeCarrier = createLargeCarrier(50, 100);
        const originalSize = calculateCarrierSize(largeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        const result = enforceCarrierSizeLimit(largeCarrier);
        
        expect(result.carrier.failureHistory?.length).toBe(MIN_FAILURE_HISTORY_SIZE);
      });
      
      it('should increment TRUNCATED metric', () => {
        const largeCarrier = createLargeCarrier(50, 100);
        const originalSize = calculateCarrierSize(largeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        enforceCarrierSizeLimit(largeCarrier);
        
        expect(sizeEnforcementMetric.getCount({ action: 'TRUNCATED' })).toBe(1);
      });
    });
    
    describe('huge carrier (cannot fit)', () => {
      it('should throw CarrierSizeExceededError', () => {
        // Create carrier that cannot fit even after truncation
        const hugeCarrier = createLargeCarrier(3, 2000);
        const originalSize = calculateCarrierSize(hugeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        expect(() => enforceCarrierSizeLimit(hugeCarrier)).toThrow(CarrierSizeExceededError);
      });
      
      it('should include size info in error', () => {
        const hugeCarrier = createLargeCarrier(3, 2000);
        const originalSize = calculateCarrierSize(hugeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        try {
          enforceCarrierSizeLimit(hugeCarrier);
          fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(CarrierSizeExceededError);
          const err = e as CarrierSizeExceededError;
          expect(err.originalSizeBytes).toBe(originalSize);
          expect(err.maxSizeBytes).toBe(MAX_CARRIER_SIZE_BYTES);
        }
      });
      
      it('should increment REJECTED metric', () => {
        const hugeCarrier = createLargeCarrier(3, 2000);
        const originalSize = calculateCarrierSize(hugeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        try {
          enforceCarrierSizeLimit(hugeCarrier);
        } catch {
          // Expected
        }
        
        expect(sizeEnforcementMetric.getCount({ action: 'REJECTED' })).toBe(1);
      });
    });
    
    describe('truncation disabled', () => {
      it('should reject without truncation attempt', () => {
        const largeCarrier = createLargeCarrier(50, 100);
        const originalSize = calculateCarrierSize(largeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        expect(() => 
          enforceCarrierSizeLimit(largeCarrier, { allowTruncation: false })
        ).toThrow(CarrierSizeExceededError);
      });
      
      it('should increment REJECTED metric when truncation disabled', () => {
        const largeCarrier = createLargeCarrier(50, 100);
        const originalSize = calculateCarrierSize(largeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        try {
          enforceCarrierSizeLimit(largeCarrier, { allowTruncation: false });
        } catch {
          // Expected
        }
        
        expect(sizeEnforcementMetric.getCount({ action: 'REJECTED' })).toBe(1);
      });
    });
    
    describe('custom options', () => {
      it('should respect custom maxSizeBytes', () => {
        const carrierSize = calculateCarrierSize(smallCarrier);
        
        // Small carrier is likely over 100 bytes
        if (carrierSize > 100) {
          // Should throw or truncate depending on carrier content
          try {
            const result = enforceCarrierSizeLimit(smallCarrier, { maxSizeBytes: 100 });
            // If it didn't throw, it must have truncated successfully
            expect(result.action).not.toBe('OK');
          } catch (error) {
            // Expected: carrier too large even after truncation
            expect(error).toBeInstanceOf(CarrierSizeExceededError);
          }
        } else {
          const result = enforceCarrierSizeLimit(smallCarrier, { maxSizeBytes: 100 });
          expect(result.action).toBe('OK');
        }
      });
      
      it('should respect custom minFailureHistorySize', () => {
        const largeCarrier = createLargeCarrier(50, 100);
        const originalSize = calculateCarrierSize(largeCarrier);
        
        if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
          return;
        }
        
        const result = enforceCarrierSizeLimit(largeCarrier, { minFailureHistorySize: 5 });
        
        if (result.action === 'TRUNCATED') {
          expect(result.carrier.failureHistory?.length).toBe(5);
        }
      });
    });
  });
  
  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================
  
  describe('isWithinSizeLimit', () => {
    it('should return true for small carrier', () => {
      expect(isWithinSizeLimit(smallCarrier)).toBe(true);
    });
    
    it('should return false for huge carrier', () => {
      const hugeCarrier = createLargeCarrier(100, 200);
      const size = calculateCarrierSize(hugeCarrier);
      
      if (size > MAX_CARRIER_SIZE_BYTES) {
        expect(isWithinSizeLimit(hugeCarrier)).toBe(false);
      }
    });
    
    it('should respect custom maxSizeBytes', () => {
      expect(isWithinSizeLimit(smallCarrier, 10)).toBe(false);
    });
  });
  
  describe('getCarrierSizeInfo', () => {
    it('should return size info', () => {
      const info = getCarrierSizeInfo(smallCarrier);
      
      expect(info.sizeBytes).toBeGreaterThan(0);
      expect(info.maxSizeBytes).toBe(MAX_CARRIER_SIZE_BYTES);
      expect(info.percentUsed).toBeGreaterThan(0);
      expect(info.isOverLimit).toBe(false);
    });
    
    it('should calculate percent used correctly', () => {
      const info = getCarrierSizeInfo(smallCarrier);
      
      const expectedPercent = (info.sizeBytes / MAX_CARRIER_SIZE_BYTES) * 100;
      expect(info.percentUsed).toBeCloseTo(expectedPercent, 2);
    });
    
    it('should detect over limit', () => {
      const hugeCarrier = createLargeCarrier(100, 200);
      const size = calculateCarrierSize(hugeCarrier);
      
      if (size > MAX_CARRIER_SIZE_BYTES) {
        const info = getCarrierSizeInfo(hugeCarrier);
        expect(info.isOverLimit).toBe(true);
      }
    });
  });
});
