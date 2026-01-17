/**
 * Diagnostics RBAC Guard - Unit Tests
 * 
 * Phase 7A - Sprint 1
 * 
 * Tests:
 * - Anonymous access rejection (401)
 * - tenant-admin cross-tenant rejection (403)
 * - internal-ops all-tenant access
 * - Tenant context extraction
 */

import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { DiagnosticsRBACGuard } from '../guards/diagnostics-rbac.guard';

describe('DiagnosticsRBACGuard', () => {
  let guard: DiagnosticsRBACGuard;

  beforeEach(() => {
    guard = new DiagnosticsRBACGuard();
  });

  // Helper to create mock execution context
  const createMockContext = (headers: Record<string, string>, query: Record<string, string> = {}): ExecutionContext => {
    const request = {
      headers,
      query,
      params: {},
      path: '/calc/diagnostics/health',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  describe('Anonymous Access', () => {
    it('should reject request without authentication headers', () => {
      const context = createMockContext({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject request with missing tenant ID', () => {
      const context = createMockContext({
        'x-user-id': 'user-123',
        'x-user-role': 'tenant-admin',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject request with missing user ID', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-role': 'tenant-admin',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject request with missing role', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-123',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('Invalid Role', () => {
    it('should reject request with invalid role', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-123',
        'x-user-role': 'invalid-role',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('tenant-admin Role', () => {
    it('should allow access to own tenant', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-123',
        'x-user-role': 'tenant-admin',
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject access to other tenant via query param', () => {
      const context = createMockContext(
        {
          'x-tenant-id': 'tenant-123',
          'x-user-id': 'user-123',
          'x-user-role': 'tenant-admin',
        },
        { tenantId: 'other-tenant' },
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should reject access to other tenant via header', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-123',
        'x-user-role': 'tenant-admin',
        'x-target-tenant-id': 'other-tenant',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should ignore query param and use auth tenant (tenant-admin cannot override)', () => {
      // Even if query param matches auth tenant, the logic should work
      const context = createMockContext(
        {
          'x-tenant-id': 'tenant-123',
          'x-user-id': 'user-123',
          'x-user-role': 'tenant-admin',
        },
        { tenantId: 'tenant-123' }, // Same tenant - should be allowed
      );

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('internal-ops Role', () => {
    it('should allow access to own tenant', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-123',
        'x-user-role': 'internal-ops',
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access to other tenant via query param (internal-ops CAN override)', () => {
      const context = createMockContext(
        {
          'x-tenant-id': 'tenant-123',
          'x-user-id': 'user-123',
          'x-user-role': 'internal-ops',
        },
        { tenantId: 'other-tenant' },
      );

      expect(guard.canActivate(context)).toBe(true);
      
      // Verify the effective tenant is the requested one
      const request = context.switchToHttp().getRequest();
      expect((request as any).tenantContext.tenantId).toBe('other-tenant');
    });

    it('should allow access to other tenant via header (internal-ops CAN override)', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-123',
        'x-user-role': 'internal-ops',
        'x-target-tenant-id': 'other-tenant',
      });

      expect(guard.canActivate(context)).toBe(true);
      
      // Verify the effective tenant is the requested one
      const request = context.switchToHttp().getRequest();
      expect((request as any).tenantContext.tenantId).toBe('other-tenant');
    });
  });

  describe('system Role', () => {
    it('should allow access to any tenant', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'system',
        'x-user-role': 'system',
      });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('Tenant Context Attachment', () => {
    it('should attach tenant context to request', () => {
      const request = {
        headers: {
          'x-tenant-id': 'tenant-123',
          'x-user-id': 'user-123',
          'x-user-role': 'tenant-admin',
          'user-agent': 'test-agent',
        },
        query: {},
        params: {},
        path: '/calc/diagnostics/health',
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext;

      guard.canActivate(context);

      expect((request as any).tenantContext).toEqual({
        tenantId: 'tenant-123',
        userId: 'user-123',
        role: 'tenant-admin',
        clientIp: '192.168.1.1',
        userAgent: 'test-agent',
      });
    });
  });
});
