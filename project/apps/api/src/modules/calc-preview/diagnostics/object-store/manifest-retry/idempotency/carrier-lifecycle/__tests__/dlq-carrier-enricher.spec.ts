/**
 * DLQ Carrier Enricher Tests - Phase 10.5 Task 3
 */

import {
  enrichCarrierForDlq,
  isInDlq,
  getDlqReason,
  getTimeInDlq,
} from '../dlq-carrier-enricher';
import {
  IdempotencyContextCarrierV2,
  DlqReason,
} from '../carrier-lifecycle.types';
import { IdempotencyContextCarrier } from '../../idempotency-carrier.types';
import { dlqEnrichmentMetric, resetAllMetrics } from '../carrier-lifecycle-metrics';

describe('DLQ Carrier Enricher', () => {
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
    attemptNumber: 3,
    lastFailedAt: '2026-02-05T09:00:00.000Z',
    failureHistory: [
      { timestamp: '2026-02-05T07:00:00.000Z', errorCode: 'ERR_1', errorMessage: 'Error 1' },
      { timestamp: '2026-02-05T08:00:00.000Z', errorCode: 'ERR_2', errorMessage: 'Error 2' },
      { timestamp: '2026-02-05T09:00:00.000Z', errorCode: 'ERR_3', errorMessage: 'Error 3' },
    ],
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
  
  const fixedDate = new Date('2026-02-05T10:00:00.000Z');
  
  beforeEach(() => {
    resetAllMetrics();
  });
  
  // =========================================================================
  // ENRICHMENT
  // =========================================================================
  
  describe('enrichCarrierForDlq', () => {
    describe('EXHAUSTED reason', () => {
      it('should set dlqReason to EXHAUSTED', () => {
        const result = enrichCarrierForDlq(baseV2Carrier, 'EXHAUSTED', fixedDate);
        
        expect(result.carrier.dlqReason).toBe('EXHAUSTED');
        expect(result.reason).toBe('EXHAUSTED');
      });
      
      it('should set movedToDlqAt to ISO timestamp', () => {
        const result = enrichCarrierForDlq(baseV2Carrier, 'EXHAUSTED', fixedDate);
        
        expect(result.carrier.movedToDlqAt).toBe('2026-02-05T10:00:00.000Z');
      });
      
      it('should preserve finalAttemptNumber', () => {
        const result = enrichCarrierForDlq(baseV2Carrier, 'EXHAUSTED', fixedDate);
        
        expect(result.carrier.finalAttemptNumber).toBe(3);
        expect(result.finalAttemptNumber).toBe(3);
      });
    });
    
    describe('POISON reason', () => {
      it('should set dlqReason to POISON', () => {
        const result = enrichCarrierForDlq(baseV2Carrier, 'POISON', fixedDate);
        
        expect(result.carrier.dlqReason).toBe('POISON');
        expect(result.reason).toBe('POISON');
      });
      
      it('should preserve all other fields', () => {
        const result = enrichCarrierForDlq(baseV2Carrier, 'POISON', fixedDate);
        
        expect(result.carrier.attemptNumber).toBe(3);
        expect(result.carrier.failureHistory).toHaveLength(3);
        expect(result.carrier.lastFailedAt).toBe('2026-02-05T09:00:00.000Z');
      });
    });
    
    describe('MANUAL reason', () => {
      it('should set dlqReason to MANUAL', () => {
        const result = enrichCarrierForDlq(baseV2Carrier, 'MANUAL', fixedDate);
        
        expect(result.carrier.dlqReason).toBe('MANUAL');
        expect(result.reason).toBe('MANUAL');
      });
    });
    
    describe('correlation preservation', () => {
      it('should preserve correlationId unchanged', () => {
        const result = enrichCarrierForDlq(baseV2Carrier, 'EXHAUSTED', fixedDate);
        
        expect(result.carrier.requestId).toBe(baseV2Carrier.requestId);
        expect(result.carrier.actionId).toBe(baseV2Carrier.actionId);
      });
      
      it('should preserve parentCorrelationId if present', () => {
        const carrier: IdempotencyContextCarrierV2 = {
          ...baseV2Carrier,
          parentCorrelationId: 'parent-123',
        };
        
        const result = enrichCarrierForDlq(carrier, 'EXHAUSTED', fixedDate);
        
        expect(result.carrier.parentCorrelationId).toBe('parent-123');
      });
    });
    
    describe('V1 carrier auto-upgrade', () => {
      it('should auto-upgrade V1 carrier to V2', () => {
        const result = enrichCarrierForDlq(baseV1Carrier, 'EXHAUSTED', fixedDate);
        
        expect(result.carrier.version).toBe(2);
        expect(result.carrier.dlqReason).toBe('EXHAUSTED');
      });
      
      it('should set finalAttemptNumber to 0 for V1 carrier', () => {
        const result = enrichCarrierForDlq(baseV1Carrier, 'EXHAUSTED', fixedDate);
        
        // V1 defaults to attemptNumber=0
        expect(result.carrier.finalAttemptNumber).toBe(0);
        expect(result.finalAttemptNumber).toBe(0);
      });
    });
    
    describe('timestamp handling', () => {
      it('should use current time if not provided', () => {
        const before = new Date();
        const result = enrichCarrierForDlq(baseV2Carrier, 'EXHAUSTED');
        const after = new Date();
        
        const timestamp = new Date(result.carrier.movedToDlqAt!);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });
    
    describe('metrics', () => {
      it('should increment DLQ enrichment metric for EXHAUSTED', () => {
        enrichCarrierForDlq(baseV2Carrier, 'EXHAUSTED', fixedDate);
        
        expect(dlqEnrichmentMetric.getCount({ reason: 'EXHAUSTED' })).toBe(1);
      });
      
      it('should increment DLQ enrichment metric for POISON', () => {
        enrichCarrierForDlq(baseV2Carrier, 'POISON', fixedDate);
        
        expect(dlqEnrichmentMetric.getCount({ reason: 'POISON' })).toBe(1);
      });
      
      it('should increment DLQ enrichment metric for MANUAL', () => {
        enrichCarrierForDlq(baseV2Carrier, 'MANUAL', fixedDate);
        
        expect(dlqEnrichmentMetric.getCount({ reason: 'MANUAL' })).toBe(1);
      });
    });
  });
  
  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================
  
  describe('isInDlq', () => {
    it('should return false for carrier not in DLQ', () => {
      expect(isInDlq(baseV2Carrier)).toBe(false);
    });
    
    it('should return false if only dlqReason is set', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        dlqReason: 'EXHAUSTED',
      };
      
      expect(isInDlq(carrier)).toBe(false);
    });
    
    it('should return false if only movedToDlqAt is set', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        movedToDlqAt: '2026-02-05T10:00:00.000Z',
      };
      
      expect(isInDlq(carrier)).toBe(false);
    });
    
    it('should return true if both dlqReason and movedToDlqAt are set', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        dlqReason: 'EXHAUSTED',
        movedToDlqAt: '2026-02-05T10:00:00.000Z',
      };
      
      expect(isInDlq(carrier)).toBe(true);
    });
  });
  
  describe('getDlqReason', () => {
    it('should return undefined for carrier not in DLQ', () => {
      expect(getDlqReason(baseV2Carrier)).toBeUndefined();
    });
    
    it('should return reason for carrier in DLQ', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        dlqReason: 'POISON',
      };
      
      expect(getDlqReason(carrier)).toBe('POISON');
    });
  });
  
  describe('getTimeInDlq', () => {
    it('should return undefined for carrier not in DLQ', () => {
      expect(getTimeInDlq(baseV2Carrier)).toBeUndefined();
    });
    
    it('should return time in milliseconds', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        dlqReason: 'EXHAUSTED',
        movedToDlqAt: '2026-02-05T09:00:00.000Z',
      };
      
      const now = new Date('2026-02-05T10:00:00.000Z');
      const timeInDlq = getTimeInDlq(carrier, now);
      
      // 1 hour = 3600000 ms
      expect(timeInDlq).toBe(3600000);
    });
    
    it('should use current time if not provided', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...baseV2Carrier,
        dlqReason: 'EXHAUSTED',
        movedToDlqAt: new Date().toISOString(),
      };
      
      const timeInDlq = getTimeInDlq(carrier);
      
      // Should be very small (just created)
      expect(timeInDlq).toBeLessThan(1000);
    });
  });
});
