/**
 * Phase 9C Task 2.5 - Bundle Seal Errors Tests
 */

import {
  BundleLockedError,
  BundleNotFoundError,
  BundleAlreadySealedError,
  WriteOnceViolationError,
  TenantMismatchError,
  InvalidStateTransitionError,
  DuplicateBundleError,
  mapPrismaError,
  isBundleSealError,
} from '../bundle-seal.errors';

describe('BundleSealErrors', () => {
  describe('BundleLockedError', () => {
    it('should have correct properties', () => {
      const error = new BundleLockedError('bundle-123');

      expect(error.httpStatus).toBe(423);
      expect(error.errorCode).toBe('BUNDLE_LOCKED');
      expect(error.message).toContain('bundle-123');
      expect(error.name).toBe('BundleLockedError');
    });
  });

  describe('BundleNotFoundError', () => {
    it('should have correct properties', () => {
      const error = new BundleNotFoundError('bundle-456');

      expect(error.httpStatus).toBe(404);
      expect(error.errorCode).toBe('BUNDLE_NOT_FOUND');
      expect(error.message).toContain('bundle-456');
    });
  });

  describe('BundleAlreadySealedError', () => {
    it('should have correct properties', () => {
      const sealedAt = new Date('2026-02-02T12:00:00Z');
      const error = new BundleAlreadySealedError(
        'bundle-789',
        'hash123',
        sealedAt
      );

      expect(error.httpStatus).toBe(409);
      expect(error.errorCode).toBe('BUNDLE_ALREADY_SEALED');
      expect(error.sealedHash).toBe('hash123');
      expect(error.sealedAt).toBe(sealedAt);
    });
  });

  describe('WriteOnceViolationError', () => {
    it('should have correct properties', () => {
      const error = new WriteOnceViolationError('bundle-abc');

      expect(error.httpStatus).toBe(409);
      expect(error.errorCode).toBe('WRITE_ONCE_VIOLATION');
    });
  });

  describe('TenantMismatchError', () => {
    it('should have correct properties', () => {
      const error = new TenantMismatchError('tenant t1 does not match t2');

      expect(error.httpStatus).toBe(403);
      expect(error.errorCode).toBe('TENANT_MISMATCH');
    });
  });

  describe('InvalidStateTransitionError', () => {
    it('should have correct properties', () => {
      const error = new InvalidStateTransitionError('bundle-xyz', 'OPEN', 'SEALED');

      expect(error.httpStatus).toBe(409);
      expect(error.errorCode).toBe('INVALID_STATE_TRANSITION');
      expect(error.message).toContain('OPEN');
      expect(error.message).toContain('SEALED');
    });
  });

  describe('DuplicateBundleError', () => {
    it('should have correct properties', () => {
      const error = new DuplicateBundleError('tenant-1', 'incident-1');

      expect(error.httpStatus).toBe(409);
      expect(error.errorCode).toBe('DUPLICATE_BUNDLE');
      expect(error.message).toContain('tenant-1');
      expect(error.message).toContain('incident-1');
    });
  });

  describe('isBundleSealError', () => {
    it('should return true for BundleSealError instances', () => {
      expect(isBundleSealError(new BundleLockedError('id'))).toBe(true);
      expect(isBundleSealError(new BundleNotFoundError('id'))).toBe(true);
      expect(isBundleSealError(new BundleAlreadySealedError('id', 'h', new Date()))).toBe(true);
    });

    it('should return false for non-BundleSealError', () => {
      expect(isBundleSealError(new Error('generic'))).toBe(false);
      expect(isBundleSealError(null)).toBe(false);
      expect(isBundleSealError(undefined)).toBe(false);
      expect(isBundleSealError('string')).toBe(false);
    });
  });

  describe('mapPrismaError', () => {
    const bundleId = 'test-bundle-id';

    it('should map 55P03 to BundleLockedError', () => {
      const prismaError = { code: '55P03', message: 'lock not available' };
      const result = mapPrismaError(prismaError, bundleId);

      expect(result).toBeInstanceOf(BundleLockedError);
      expect((result as BundleLockedError).httpStatus).toBe(423);
    });

    it('should map 23503 to BundleNotFoundError', () => {
      const prismaError = { code: '23503', message: 'bundle_not_found: xyz' };
      const result = mapPrismaError(prismaError, bundleId);

      expect(result).toBeInstanceOf(BundleNotFoundError);
    });

    it('should map 45000 to WriteOnceViolationError', () => {
      const prismaError = { code: '45000', message: 'sealed_bundle_write_forbidden' };
      const result = mapPrismaError(prismaError, bundleId);

      expect(result).toBeInstanceOf(WriteOnceViolationError);
    });

    it('should map 45001 to TenantMismatchError', () => {
      const prismaError = { code: '45001', message: 'tenant_mismatch: t1 vs t2' };
      const result = mapPrismaError(prismaError, bundleId);

      expect(result).toBeInstanceOf(TenantMismatchError);
    });

    it('should map 45002 to InvalidStateTransitionError', () => {
      const prismaError = { code: '45002', message: 'seal_event_requires_sealed_bundle' };
      const result = mapPrismaError(prismaError, bundleId);

      expect(result).toBeInstanceOf(InvalidStateTransitionError);
    });

    it('should return original error for unknown codes', () => {
      const originalError = new Error('unknown error');
      const result = mapPrismaError(originalError, bundleId);

      expect(result).toBe(originalError);
    });

    it('should handle error with meta.code', () => {
      const prismaError = { meta: { code: '55P03' }, message: 'lock error' };
      const result = mapPrismaError(prismaError, bundleId);

      expect(result).toBeInstanceOf(BundleLockedError);
    });

    it('should extract SQLSTATE from message pattern', () => {
      const prismaError = { message: 'error SQLSTATE[45000] sealed bundle' };
      const result = mapPrismaError(prismaError, bundleId);

      expect(result).toBeInstanceOf(WriteOnceViolationError);
    });
  });
});
