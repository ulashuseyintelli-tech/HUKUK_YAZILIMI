/**
 * Redrive Carrier Cloner Tests - Phase 10.5 Task 4
 */

import {
  cloneCarrierForRedrive,
  wasRedriven,
  getRedriveDepth,
  getRedriveSource,
  getRedrivenBy,
} from '../redrive-carrier-cloner';
import {
  IdempotencyContextCarrierV2,
} from '../carrier-lifecycle.types';
import { IdempotencyContextCarrier } from '../../idempotency-carrier.types';
import { redriveCloneMetric, resetAllMetrics } from '../carrier-lifecycle-metrics';

describe('Redrive Carrier Cloner', () => {
  // =========================================================================
  // FIXTURES
  // =========================================================================
  
  const dlqCarrier: IdempotencyContextCarrierV2 = {
    version: 2,
    requestId: 'original-req-123',
    actionId: 'original-act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
    attemptNumber: 5,
    lastFailedAt: '2026-02-05T09:00:00.000Z',
    failureHistory: [
      { timestamp: '2026-02-05T07:00:00.000Z', errorCode: 'ERR_1', errorMessage: 'Error 1' },
      { timestamp: '2026-02-05T08:00:00.000Z', errorCode: 'ERR_2', errorMessage: 'Error 2' },
    ],
    dlqReason: 'EXHAUSTED',
    movedToDlqAt: '2026-02-05T09:30:00.000Z',
    finalAttemptNumber: 5,
  };
  
  const baseV1Carrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'v1-req-123',
    actionId: 'v1-act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
  };
  
  const redriveContext = {
    dlqName: 'manifest-dlq',
    operatorId: 'operator-001',
  };
  
  const fixedDate = new Date('2026-02-05T10:00:00.000Z');
  
  beforeEach(() => {
    resetAllMetrics();
  });
  
  // =========================================================================
  // CLONE OPERATION
  // =========================================================================
  
  describe('cloneCarrierForRedrive', () => {
    describe('new correlationId generation', () => {
      it('should generate new correlationId (requestId)', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.requestId).not.toBe(dlqCarrier.requestId);
        expect(result.newRequestId).toBe(result.carrier.requestId);
      });
      
      it('should generate new actionId', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.actionId).not.toBe(dlqCarrier.actionId);
      });
      
      it('should generate valid UUID format', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(result.carrier.requestId).toMatch(uuidRegex);
        expect(result.carrier.actionId).toMatch(uuidRegex);
      });
    });
    
    describe('parentCorrelationId linking', () => {
      it('should set parentCorrelationId to original requestId', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.parentCorrelationId).toBe('original-req-123');
        expect(result.originalCorrelationId).toBe('original-req-123');
      });
      
      it('should chain parentCorrelationId for already-redriven carrier', () => {
        const alreadyRedriven: IdempotencyContextCarrierV2 = {
          ...dlqCarrier,
          requestId: 'redriven-req-456',
          parentCorrelationId: 'original-req-123',
        };
        
        const result = cloneCarrierForRedrive(alreadyRedriven, redriveContext, fixedDate);
        
        // Should link to immediate parent, not grandparent
        expect(result.carrier.parentCorrelationId).toBe('redriven-req-456');
      });
    });
    
    describe('attemptNumber reset', () => {
      it('should reset attemptNumber to 0', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.attemptNumber).toBe(0);
      });
    });
    
    describe('tenant/user preservation', () => {
      it('should preserve actionType', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.actionType).toBe(dlqCarrier.actionType);
      });
      
      it('should preserve resourceType and resourceId', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.resourceType).toBe(dlqCarrier.resourceType);
        expect(result.carrier.resourceId).toBe(dlqCarrier.resourceId);
      });
      
      it('should preserve takeover and previousActorId', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.takeover).toBe(dlqCarrier.takeover);
        expect(result.carrier.previousActorId).toBe(dlqCarrier.previousActorId);
      });
    });
    
    describe('DLQ fields cleared', () => {
      it('should clear dlqReason', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.dlqReason).toBeUndefined();
      });
      
      it('should clear movedToDlqAt', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.movedToDlqAt).toBeUndefined();
      });
      
      it('should clear finalAttemptNumber', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.finalAttemptNumber).toBeUndefined();
      });
      
      it('should clear failureHistory', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.failureHistory).toBeUndefined();
      });
      
      it('should clear lastFailedAt', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.lastFailedAt).toBeUndefined();
      });
    });
    
    describe('redrive metadata', () => {
      it('should set redriveSource from context', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.redriveSource).toBe('manifest-dlq');
      });
      
      it('should set redrivenAt to ISO timestamp', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.redrivenAt).toBe('2026-02-05T10:00:00.000Z');
      });
      
      it('should set redrivenBy from context', () => {
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(result.carrier.redrivenBy).toBe('operator-001');
      });
      
      it('should use current time if not provided', () => {
        const before = new Date();
        const result = cloneCarrierForRedrive(dlqCarrier, redriveContext);
        const after = new Date();
        
        const timestamp = new Date(result.carrier.redrivenAt!);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });
    
    describe('V1 carrier handling', () => {
      it('should auto-upgrade V1 carrier to V2', () => {
        const result = cloneCarrierForRedrive(baseV1Carrier, redriveContext, fixedDate);
        
        expect(result.carrier.version).toBe(2);
      });
      
      it('should link to V1 carrier requestId', () => {
        const result = cloneCarrierForRedrive(baseV1Carrier, redriveContext, fixedDate);
        
        expect(result.carrier.parentCorrelationId).toBe('v1-req-123');
      });
    });
    
    describe('metrics', () => {
      it('should increment redrive clone metric', () => {
        cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
        
        expect(redriveCloneMetric.getCount({ source_dlq: 'manifest-dlq' })).toBe(1);
      });
      
      it('should track source DLQ in metric label', () => {
        const ctx = { dlqName: 'other-dlq', operatorId: 'op-1' };
        cloneCarrierForRedrive(dlqCarrier, ctx, fixedDate);
        
        expect(redriveCloneMetric.getCount({ source_dlq: 'other-dlq' })).toBe(1);
      });
    });
  });
  
  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================
  
  describe('wasRedriven', () => {
    it('should return false for carrier not redriven', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...dlqCarrier,
        parentCorrelationId: undefined,
        redrivenAt: undefined,
      };
      
      expect(wasRedriven(carrier)).toBe(false);
    });
    
    it('should return false if only parentCorrelationId is set', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...dlqCarrier,
        parentCorrelationId: 'parent-123',
        redrivenAt: undefined,
      };
      
      expect(wasRedriven(carrier)).toBe(false);
    });
    
    it('should return true for redriven carrier', () => {
      const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
      
      expect(wasRedriven(result.carrier)).toBe(true);
    });
  });
  
  describe('getRedriveDepth', () => {
    it('should return 0 for carrier not redriven', () => {
      const carrier: IdempotencyContextCarrierV2 = {
        ...dlqCarrier,
        parentCorrelationId: undefined,
      };
      
      expect(getRedriveDepth(carrier)).toBe(0);
    });
    
    it('should return 1 for redriven carrier', () => {
      const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
      
      expect(getRedriveDepth(result.carrier)).toBe(1);
    });
  });
  
  describe('getRedriveSource', () => {
    it('should return undefined for carrier not redriven', () => {
      expect(getRedriveSource(dlqCarrier)).toBeUndefined();
    });
    
    it('should return source DLQ name for redriven carrier', () => {
      const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
      
      expect(getRedriveSource(result.carrier)).toBe('manifest-dlq');
    });
  });
  
  describe('getRedrivenBy', () => {
    it('should return undefined for carrier not redriven', () => {
      expect(getRedrivenBy(dlqCarrier)).toBeUndefined();
    });
    
    it('should return operator ID for redriven carrier', () => {
      const result = cloneCarrierForRedrive(dlqCarrier, redriveContext, fixedDate);
      
      expect(getRedrivenBy(result.carrier)).toBe('operator-001');
    });
  });
});
