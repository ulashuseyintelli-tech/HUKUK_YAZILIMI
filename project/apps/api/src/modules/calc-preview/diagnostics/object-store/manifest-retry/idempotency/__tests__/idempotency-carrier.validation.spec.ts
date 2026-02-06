/**
 * Idempotency Carrier Validation Tests
 * 
 * Phase 10.4 - PR-10.4.1 (P0)
 * 
 * Tests validateCarrier() per ADR-008 validation rules.
 */

import {
  validateCarrier,
  isValidCarrier,
  getDropReasonDescription,
} from '../idempotency-carrier.validation';
import { CARRIER_VERSION } from '../idempotency-carrier.types';

describe('validateCarrier', () => {
  // Valid carrier fixture
  const validCarrier = {
    version: 1 as const,
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
  };

  describe('MALFORMED cases', () => {
    it('should reject null', () => {
      const result = validateCarrier(null);
      expect(result).toEqual({ valid: false, reason: 'MALFORMED' });
    });

    it('should reject undefined', () => {
      const result = validateCarrier(undefined);
      expect(result).toEqual({ valid: false, reason: 'MALFORMED' });
    });

    it('should reject non-object (string)', () => {
      const result = validateCarrier('not-an-object');
      expect(result).toEqual({ valid: false, reason: 'MALFORMED' });
    });

    it('should reject non-object (number)', () => {
      const result = validateCarrier(42);
      expect(result).toEqual({ valid: false, reason: 'MALFORMED' });
    });

    it('should reject non-object (boolean)', () => {
      const result = validateCarrier(true);
      expect(result).toEqual({ valid: false, reason: 'MALFORMED' });
    });

    it('should reject array', () => {
      const result = validateCarrier([1, 2, 3]);
      expect(result).toEqual({ valid: false, reason: 'MALFORMED' });
    });
  });

  describe('VERSION_MISMATCH cases', () => {
    it('should reject version 0', () => {
      const result = validateCarrier({ ...validCarrier, version: 0 });
      expect(result).toEqual({ valid: false, reason: 'VERSION_MISMATCH' });
    });

    it('should reject version 2', () => {
      const result = validateCarrier({ ...validCarrier, version: 2 });
      expect(result).toEqual({ valid: false, reason: 'VERSION_MISMATCH' });
    });

    it('should reject version as string "1"', () => {
      const result = validateCarrier({ ...validCarrier, version: '1' });
      expect(result).toEqual({ valid: false, reason: 'VERSION_MISMATCH' });
    });

    it('should reject missing version', () => {
      const { version, ...noVersion } = validCarrier;
      const result = validateCarrier(noVersion);
      expect(result).toEqual({ valid: false, reason: 'VERSION_MISMATCH' });
    });

    it('should reject null version', () => {
      const result = validateCarrier({ ...validCarrier, version: null });
      expect(result).toEqual({ valid: false, reason: 'VERSION_MISMATCH' });
    });
  });

  describe('MISSING_REQUIRED cases', () => {
    it('should reject missing requestId', () => {
      const { requestId, ...noRequestId } = validCarrier;
      const result = validateCarrier(noRequestId);
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject empty requestId', () => {
      const result = validateCarrier({ ...validCarrier, requestId: '' });
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject null requestId', () => {
      const result = validateCarrier({ ...validCarrier, requestId: null });
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject missing actionId', () => {
      const { actionId, ...noActionId } = validCarrier;
      const result = validateCarrier(noActionId);
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject empty actionId', () => {
      const result = validateCarrier({ ...validCarrier, actionId: '' });
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject missing actionType', () => {
      const { actionType, ...noActionType } = validCarrier;
      const result = validateCarrier(noActionType);
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject empty actionType', () => {
      const result = validateCarrier({ ...validCarrier, actionType: '' });
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject missing resourceType', () => {
      const { resourceType, ...noResourceType } = validCarrier;
      const result = validateCarrier(noResourceType);
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject empty resourceType', () => {
      const result = validateCarrier({ ...validCarrier, resourceType: '' });
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });

    it('should reject number as requestId', () => {
      const result = validateCarrier({ ...validCarrier, requestId: 123 });
      expect(result).toEqual({ valid: false, reason: 'MISSING_REQUIRED' });
    });
  });

  describe('TYPE_ERROR cases', () => {
    it('should reject resourceId as number', () => {
      const result = validateCarrier({ ...validCarrier, resourceId: 123 });
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });

    it('should reject resourceId as boolean', () => {
      const result = validateCarrier({ ...validCarrier, resourceId: true });
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });

    it('should reject resourceId as object', () => {
      const result = validateCarrier({ ...validCarrier, resourceId: {} });
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });

    it('should reject takeover as string', () => {
      const result = validateCarrier({ ...validCarrier, takeover: 'true' });
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });

    it('should reject takeover as number', () => {
      const result = validateCarrier({ ...validCarrier, takeover: 1 });
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });

    it('should reject missing takeover', () => {
      const { takeover, ...noTakeover } = validCarrier;
      const result = validateCarrier(noTakeover);
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });

    it('should reject previousActorId as number', () => {
      const result = validateCarrier({ ...validCarrier, previousActorId: 123 });
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });

    it('should reject previousActorId as boolean', () => {
      const result = validateCarrier({ ...validCarrier, previousActorId: true });
      expect(result).toEqual({ valid: false, reason: 'TYPE_ERROR' });
    });
  });

  describe('Valid carrier cases', () => {
    it('should accept valid carrier with all fields', () => {
      const result = validateCarrier(validCarrier);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.context).toEqual({
          requestId: 'req-123',
          actionId: 'act-456',
          actionType: 'ADMIN_RETRY',
          resourceType: 'BUNDLE',
          resourceId: 'bundle-789',
          takeover: false,
          previousActorId: null,
        });
      }
    });

    it('should accept carrier with null resourceId', () => {
      const result = validateCarrier({ ...validCarrier, resourceId: null });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.context.resourceId).toBeNull();
      }
    });

    it('should accept carrier with takeover=true', () => {
      const result = validateCarrier({
        ...validCarrier,
        takeover: true,
        previousActorId: 'prev-actor',
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.context.takeover).toBe(true);
        expect(result.context.previousActorId).toBe('prev-actor');
      }
    });

    it('should accept carrier with null previousActorId', () => {
      const result = validateCarrier({ ...validCarrier, previousActorId: null });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.context.previousActorId).toBeNull();
      }
    });

    it('should ignore extra fields (forward compatibility)', () => {
      const carrierWithExtra = {
        ...validCarrier,
        futureField: 'some-value',
        anotherFuture: 42,
        nested: { deep: true },
      };
      const result = validateCarrier(carrierWithExtra);
      expect(result.valid).toBe(true);
      if (result.valid) {
        // Extra fields should not appear in context
        expect(result.context).toEqual({
          requestId: 'req-123',
          actionId: 'act-456',
          actionType: 'ADMIN_RETRY',
          resourceType: 'BUNDLE',
          resourceId: 'bundle-789',
          takeover: false,
          previousActorId: null,
        });
      }
    });
  });
});

describe('isValidCarrier', () => {
  it('should return true for valid carrier', () => {
    const carrier = {
      version: 1,
      requestId: 'req-1',
      actionId: 'act-1',
      actionType: 'TEST',
      resourceType: 'TEST',
      resourceId: null,
      takeover: false,
      previousActorId: null,
    };
    expect(isValidCarrier(carrier)).toBe(true);
  });

  it('should return false for invalid carrier', () => {
    expect(isValidCarrier(null)).toBe(false);
    expect(isValidCarrier({ version: 2 })).toBe(false);
  });
});

describe('getDropReasonDescription', () => {
  it('should return description for MALFORMED', () => {
    expect(getDropReasonDescription('MALFORMED')).toContain('null');
  });

  it('should return description for VERSION_MISMATCH', () => {
    expect(getDropReasonDescription('VERSION_MISMATCH')).toContain('version');
  });

  it('should return description for MISSING_REQUIRED', () => {
    expect(getDropReasonDescription('MISSING_REQUIRED')).toContain('Required');
  });

  it('should return description for TYPE_ERROR', () => {
    expect(getDropReasonDescription('TYPE_ERROR')).toContain('type');
  });
});

describe('CARRIER_VERSION constant', () => {
  it('should be 1', () => {
    expect(CARRIER_VERSION).toBe(1);
  });
});
