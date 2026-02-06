/**
 * Manifest Admin Auth Guard Tests
 * 
 * Phase 10.2 - Task 4.1
 */

import { ExecutionContext } from '@nestjs/common';
import {
  ManifestAdminAuthGuard,
  MockManifestAdminFeatureFlagService,
  RequestWithUser,
} from '../manifest-admin-auth.guard';

describe('ManifestAdminAuthGuard', () => {
  let guard: ManifestAdminAuthGuard;
  let mockFeatureFlag: MockManifestAdminFeatureFlagService;

  const createMockContext = (user?: { id: string; roles?: string[] }): ExecutionContext => {
    const request: Partial<RequestWithUser> = {
      path: '/admin/manifest/dlq/123/resolve',
      method: 'POST',
      user: user as any,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    mockFeatureFlag = new MockManifestAdminFeatureFlagService();
    guard = new ManifestAdminAuthGuard(mockFeatureFlag);
  });

  describe('break-glass check', () => {
    it('should deny access when break-glass is closed', () => {
      mockFeatureFlag.setOpen(false);
      const context = createMockContext({ id: 'user-1', roles: ['ops_admin'] });

      expect(() => guard.canActivate(context)).toThrow();
      
      try {
        guard.canActivate(context);
      } catch (error: any) {
        expect(error.status).toBe(403);
        expect(error.response.code).toBe('BREAK_GLASS_CLOSED');
      }
    });

    it('should allow access when break-glass is open', () => {
      mockFeatureFlag.setOpen(true);
      const context = createMockContext({ id: 'user-1', roles: ['ops_admin'] });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('authentication check', () => {
    beforeEach(() => {
      mockFeatureFlag.setOpen(true);
    });

    it('should deny access when no user context', () => {
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow();
      
      try {
        guard.canActivate(context);
      } catch (error: any) {
        expect(error.status).toBe(401);
        expect(error.response.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('role check', () => {
    beforeEach(() => {
      mockFeatureFlag.setOpen(true);
    });

    it('should deny access when user lacks ops_admin role', () => {
      const context = createMockContext({ id: 'user-1', roles: ['user'] });

      expect(() => guard.canActivate(context)).toThrow();
      
      try {
        guard.canActivate(context);
      } catch (error: any) {
        expect(error.status).toBe(403);
        expect(error.response.code).toBe('INSUFFICIENT_ROLE');
      }
    });

    it('should deny access when user has no roles', () => {
      const context = createMockContext({ id: 'user-1', roles: [] });

      expect(() => guard.canActivate(context)).toThrow();
      
      try {
        guard.canActivate(context);
      } catch (error: any) {
        expect(error.status).toBe(403);
        expect(error.response.code).toBe('INSUFFICIENT_ROLE');
      }
    });

    it('should allow access when user has ops_admin role', () => {
      const context = createMockContext({ id: 'user-1', roles: ['ops_admin'] });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has ops_admin among other roles', () => {
      const context = createMockContext({ id: 'user-1', roles: ['user', 'ops_admin', 'viewer'] });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('response format', () => {
    it('should return BREAK_GLASS_CLOSED with correct format', () => {
      mockFeatureFlag.setOpen(false);
      const context = createMockContext({ id: 'user-1', roles: ['ops_admin'] });

      try {
        guard.canActivate(context);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.response).toEqual({
          code: 'BREAK_GLASS_CLOSED',
          message: 'Admin access is currently disabled',
        });
      }
    });
  });
});
