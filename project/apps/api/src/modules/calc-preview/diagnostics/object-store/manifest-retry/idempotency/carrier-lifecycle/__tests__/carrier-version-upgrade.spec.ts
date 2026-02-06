/**
 * Carrier Version Upgrade Tests - Phase 10.5 Task 1
 */

import {
  upgradeCarrierToV2,
  ensureCarrierV2,
  needsUpgrade,
} from '../carrier-version-upgrade';
import { IdempotencyContextCarrier } from '../../idempotency-carrier.types';
import { IdempotencyContextCarrierV2, CARRIER_VERSION_V2 } from '../carrier-lifecycle.types';

describe('Carrier Version Upgrade', () => {
  // =========================================================================
  // FIXTURES
  // =========================================================================
  
  const validV1Carrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
  };
  
  const validV2Carrier: IdempotencyContextCarrierV2 = {
    version: 2,
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
    attemptNumber: 3,
    lastFailedAt: '2026-02-05T10:00:00.000Z',
  };
  
  // =========================================================================
  // upgradeCarrierToV2
  // =========================================================================
  
  describe('upgradeCarrierToV2', () => {
    describe('V1 → V2 upgrade', () => {
      it('should upgrade V1 carrier to V2', () => {
        const result = upgradeCarrierToV2(validV1Carrier);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.carrier.version).toBe(CARRIER_VERSION_V2);
        }
      });
      
      it('should preserve V1 fields in V2', () => {
        const result = upgradeCarrierToV2(validV1Carrier);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.carrier.requestId).toBe(validV1Carrier.requestId);
          expect(result.carrier.actionId).toBe(validV1Carrier.actionId);
          expect(result.carrier.actionType).toBe(validV1Carrier.actionType);
          expect(result.carrier.resourceType).toBe(validV1Carrier.resourceType);
          expect(result.carrier.resourceId).toBe(validV1Carrier.resourceId);
          expect(result.carrier.takeover).toBe(validV1Carrier.takeover);
          expect(result.carrier.previousActorId).toBe(validV1Carrier.previousActorId);
        }
      });
      
      it('should set attemptNumber to 0 on upgrade', () => {
        const result = upgradeCarrierToV2(validV1Carrier);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.carrier.attemptNumber).toBe(0);
        }
      });
      
      it('should not set optional V2 fields on upgrade', () => {
        const result = upgradeCarrierToV2(validV1Carrier);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.carrier.lastFailedAt).toBeUndefined();
          expect(result.carrier.failureHistory).toBeUndefined();
          expect(result.carrier.dlqReason).toBeUndefined();
          expect(result.carrier.movedToDlqAt).toBeUndefined();
          expect(result.carrier.parentCorrelationId).toBeUndefined();
        }
      });
      
      it('should handle V1 carrier with takeover=true', () => {
        const v1WithTakeover: IdempotencyContextCarrier = {
          ...validV1Carrier,
          takeover: true,
          previousActorId: 'prev-actor-1',
        };
        
        const result = upgradeCarrierToV2(v1WithTakeover);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.carrier.takeover).toBe(true);
          expect(result.carrier.previousActorId).toBe('prev-actor-1');
        }
      });
    });
    
    describe('V2 → V2 (no-op)', () => {
      it('should return V2 carrier as-is', () => {
        const result = upgradeCarrierToV2(validV2Carrier);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.carrier).toBe(validV2Carrier); // Same reference
        }
      });
      
      it('should preserve all V2 fields', () => {
        const result = upgradeCarrierToV2(validV2Carrier);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.carrier.attemptNumber).toBe(3);
          expect(result.carrier.lastFailedAt).toBe('2026-02-05T10:00:00.000Z');
        }
      });
    });
    
    describe('Invalid input', () => {
      it('should fail for null', () => {
        const result = upgradeCarrierToV2(null);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('NULL_INPUT');
        }
      });
      
      it('should fail for undefined', () => {
        const result = upgradeCarrierToV2(undefined);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('NULL_INPUT');
        }
      });
      
      it('should fail for non-object', () => {
        expect(upgradeCarrierToV2('string')).toEqual({
          success: false,
          reason: 'NOT_OBJECT',
        });
        
        expect(upgradeCarrierToV2(123)).toEqual({
          success: false,
          reason: 'NOT_OBJECT',
        });
        
        expect(upgradeCarrierToV2(true)).toEqual({
          success: false,
          reason: 'NOT_OBJECT',
        });
      });
      
      it('should fail for unknown version', () => {
        const unknownVersion = {
          version: 99,
          requestId: 'req-1',
          actionId: 'act-1',
        };
        
        const result = upgradeCarrierToV2(unknownVersion);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('UNKNOWN_VERSION');
        }
      });
      
      it('should fail for V1 carrier missing requestId', () => {
        const incomplete = {
          version: 1,
          actionId: 'act-1',
          actionType: 'ADMIN_RETRY',
          resourceType: 'BUNDLE',
        };
        
        const result = upgradeCarrierToV2(incomplete);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('MISSING_REQUIRED_FIELDS');
        }
      });
      
      it('should fail for V1 carrier missing actionId', () => {
        const incomplete = {
          version: 1,
          requestId: 'req-1',
          actionType: 'ADMIN_RETRY',
          resourceType: 'BUNDLE',
        };
        
        const result = upgradeCarrierToV2(incomplete);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('MISSING_REQUIRED_FIELDS');
        }
      });
      
      it('should fail for V1 carrier with empty requestId', () => {
        const incomplete = {
          version: 1,
          requestId: '',
          actionId: 'act-1',
          actionType: 'ADMIN_RETRY',
          resourceType: 'BUNDLE',
        };
        
        const result = upgradeCarrierToV2(incomplete);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('MISSING_REQUIRED_FIELDS');
        }
      });
    });
  });
  
  // =========================================================================
  // ensureCarrierV2
  // =========================================================================
  
  describe('ensureCarrierV2', () => {
    it('should return V2 carrier for valid V1 input', () => {
      const result = ensureCarrierV2(validV1Carrier);
      
      expect(result.version).toBe(2);
      expect(result.attemptNumber).toBe(0);
    });
    
    it('should return same V2 carrier for V2 input', () => {
      const result = ensureCarrierV2(validV2Carrier);
      
      expect(result).toBe(validV2Carrier);
    });
    
    it('should throw for null input', () => {
      expect(() => ensureCarrierV2(null)).toThrow('Failed to upgrade carrier to V2: NULL_INPUT');
    });
    
    it('should throw for undefined input', () => {
      expect(() => ensureCarrierV2(undefined)).toThrow('Failed to upgrade carrier to V2: NULL_INPUT');
    });
    
    it('should throw for unknown version', () => {
      const unknown = { version: 99 };
      
      expect(() => ensureCarrierV2(unknown)).toThrow('Failed to upgrade carrier to V2: UNKNOWN_VERSION');
    });
  });
  
  // =========================================================================
  // needsUpgrade
  // =========================================================================
  
  describe('needsUpgrade', () => {
    it('should return true for V1 carrier', () => {
      expect(needsUpgrade(validV1Carrier)).toBe(true);
    });
    
    it('should return false for V2 carrier', () => {
      expect(needsUpgrade(validV2Carrier)).toBe(false);
    });
    
    it('should return false for null', () => {
      expect(needsUpgrade(null)).toBe(false);
    });
    
    it('should return false for undefined', () => {
      expect(needsUpgrade(undefined)).toBe(false);
    });
    
    it('should return false for unknown version', () => {
      expect(needsUpgrade({ version: 99 })).toBe(false);
    });
  });
});
