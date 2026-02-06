/**
 * Carrier Lifecycle Types Tests - Phase 10.5 Task 1
 */

import {
  IdempotencyContextCarrierV2,
  FailureEntry,
  DlqReason,
  CarrierSizeExceededError,
  CARRIER_VERSION_V2,
  MAX_CARRIER_SIZE_BYTES,
  MAX_FAILURE_HISTORY_SIZE,
  MAX_ERROR_MESSAGE_LENGTH,
  MIN_FAILURE_HISTORY_SIZE,
  isCarrierV1,
  isCarrierV2,
  isValidCarrier,
} from '../carrier-lifecycle.types';
import { IdempotencyContextCarrier } from '../../idempotency-carrier.types';

describe('Carrier Lifecycle Types', () => {
  // =========================================================================
  // CONSTANTS
  // =========================================================================
  
  describe('Constants', () => {
    it('should have correct V2 version', () => {
      expect(CARRIER_VERSION_V2).toBe(2);
    });
    
    it('should have 4KB max carrier size', () => {
      expect(MAX_CARRIER_SIZE_BYTES).toBe(4096);
    });
    
    it('should have max 10 failure history entries', () => {
      expect(MAX_FAILURE_HISTORY_SIZE).toBe(10);
    });
    
    it('should have max 200 char error message', () => {
      expect(MAX_ERROR_MESSAGE_LENGTH).toBe(200);
    });
    
    it('should keep min 3 failure entries on truncation', () => {
      expect(MIN_FAILURE_HISTORY_SIZE).toBe(3);
    });
  });
  
  // =========================================================================
  // TYPE GUARDS
  // =========================================================================
  
  describe('isCarrierV1', () => {
    it('should return true for V1 carrier', () => {
      const v1: IdempotencyContextCarrier = {
        version: 1,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-1',
        takeover: false,
        previousActorId: null,
      };
      
      expect(isCarrierV1(v1)).toBe(true);
    });
    
    it('should return false for V2 carrier', () => {
      const v2: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-1',
        takeover: false,
        previousActorId: null,
        attemptNumber: 0,
      };
      
      expect(isCarrierV1(v2)).toBe(false);
    });
    
    it('should return false for null', () => {
      expect(isCarrierV1(null)).toBe(false);
    });
    
    it('should return false for undefined', () => {
      expect(isCarrierV1(undefined)).toBe(false);
    });
    
    it('should return false for non-object', () => {
      expect(isCarrierV1('string')).toBe(false);
      expect(isCarrierV1(123)).toBe(false);
    });
  });
  
  describe('isCarrierV2', () => {
    it('should return true for V2 carrier', () => {
      const v2: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-1',
        takeover: false,
        previousActorId: null,
        attemptNumber: 0,
      };
      
      expect(isCarrierV2(v2)).toBe(true);
    });
    
    it('should return false for V1 carrier', () => {
      const v1: IdempotencyContextCarrier = {
        version: 1,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-1',
        takeover: false,
        previousActorId: null,
      };
      
      expect(isCarrierV2(v1)).toBe(false);
    });
    
    it('should return false for null', () => {
      expect(isCarrierV2(null)).toBe(false);
    });
    
    it('should return false for undefined', () => {
      expect(isCarrierV2(undefined)).toBe(false);
    });
  });
  
  describe('isValidCarrier', () => {
    it('should return true for V1 carrier', () => {
      const v1: IdempotencyContextCarrier = {
        version: 1,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: null,
        takeover: false,
        previousActorId: null,
      };
      
      expect(isValidCarrier(v1)).toBe(true);
    });
    
    it('should return true for V2 carrier', () => {
      const v2: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: null,
        takeover: false,
        previousActorId: null,
        attemptNumber: 0,
      };
      
      expect(isValidCarrier(v2)).toBe(true);
    });
    
    it('should return false for unknown version', () => {
      const unknown = {
        version: 99,
        requestId: 'req-1',
      };
      
      expect(isValidCarrier(unknown)).toBe(false);
    });
    
    it('should return false for invalid input', () => {
      expect(isValidCarrier(null)).toBe(false);
      expect(isValidCarrier(undefined)).toBe(false);
      expect(isValidCarrier('string')).toBe(false);
      expect(isValidCarrier({})).toBe(false);
    });
  });
  
  // =========================================================================
  // CARRIER SIZE EXCEEDED ERROR
  // =========================================================================
  
  describe('CarrierSizeExceededError', () => {
    it('should create error with correct message', () => {
      const error = new CarrierSizeExceededError(5000, 4096);
      
      expect(error.name).toBe('CarrierSizeExceededError');
      expect(error.originalSizeBytes).toBe(5000);
      expect(error.maxSizeBytes).toBe(4096);
      expect(error.message).toContain('5000');
      expect(error.message).toContain('4096');
    });
    
    it('should be instanceof Error', () => {
      const error = new CarrierSizeExceededError(5000, 4096);
      
      expect(error).toBeInstanceOf(Error);
    });
  });
  
  // =========================================================================
  // V2 CARRIER STRUCTURE
  // =========================================================================
  
  describe('IdempotencyContextCarrierV2 structure', () => {
    it('should allow minimal V2 carrier', () => {
      const v2: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: null,
        takeover: false,
        previousActorId: null,
        attemptNumber: 0,
      };
      
      expect(v2.version).toBe(2);
      expect(v2.attemptNumber).toBe(0);
    });
    
    it('should allow V2 carrier with retry tracking', () => {
      const v2: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-1',
        takeover: false,
        previousActorId: null,
        attemptNumber: 3,
        lastFailedAt: '2026-02-05T10:00:00.000Z',
        failureHistory: [
          { timestamp: '2026-02-05T09:00:00.000Z', errorCode: 'ECONNREFUSED', errorMessage: 'Connection refused' },
          { timestamp: '2026-02-05T09:30:00.000Z', errorCode: 'ETIMEDOUT', errorMessage: 'Timeout' },
        ],
      };
      
      expect(v2.attemptNumber).toBe(3);
      expect(v2.lastFailedAt).toBe('2026-02-05T10:00:00.000Z');
      expect(v2.failureHistory).toHaveLength(2);
    });
    
    it('should allow V2 carrier with DLQ tracking', () => {
      const v2: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-1',
        actionId: 'act-1',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-1',
        takeover: false,
        previousActorId: null,
        attemptNumber: 5,
        dlqReason: 'EXHAUSTED',
        movedToDlqAt: '2026-02-05T12:00:00.000Z',
        finalAttemptNumber: 5,
      };
      
      expect(v2.dlqReason).toBe('EXHAUSTED');
      expect(v2.movedToDlqAt).toBe('2026-02-05T12:00:00.000Z');
      expect(v2.finalAttemptNumber).toBe(5);
    });
    
    it('should allow V2 carrier with redrive tracking', () => {
      const v2: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-new',
        actionId: 'act-new',
        actionType: 'DLQ_REDRIVE',
        resourceType: 'DLQ_ENTRY',
        resourceId: 'dlq-1',
        takeover: false,
        previousActorId: null,
        attemptNumber: 0,
        parentCorrelationId: 'act-original',
        redriveSource: 'manifest-dlq',
        redrivenAt: '2026-02-05T14:00:00.000Z',
        redrivenBy: 'operator-123',
      };
      
      expect(v2.parentCorrelationId).toBe('act-original');
      expect(v2.redriveSource).toBe('manifest-dlq');
      expect(v2.redrivenBy).toBe('operator-123');
    });
  });
  
  // =========================================================================
  // DLQ REASON
  // =========================================================================
  
  describe('DlqReason', () => {
    it('should accept EXHAUSTED', () => {
      const reason: DlqReason = 'EXHAUSTED';
      expect(reason).toBe('EXHAUSTED');
    });
    
    it('should accept POISON', () => {
      const reason: DlqReason = 'POISON';
      expect(reason).toBe('POISON');
    });
    
    it('should accept MANUAL', () => {
      const reason: DlqReason = 'MANUAL';
      expect(reason).toBe('MANUAL');
    });
  });
  
  // =========================================================================
  // FAILURE ENTRY
  // =========================================================================
  
  describe('FailureEntry', () => {
    it('should have required fields', () => {
      const entry: FailureEntry = {
        timestamp: '2026-02-05T10:00:00.000Z',
        errorCode: 'ECONNREFUSED',
        errorMessage: 'Connection refused',
      };
      
      expect(entry.timestamp).toBe('2026-02-05T10:00:00.000Z');
      expect(entry.errorCode).toBe('ECONNREFUSED');
      expect(entry.errorMessage).toBe('Connection refused');
    });
  });
});
