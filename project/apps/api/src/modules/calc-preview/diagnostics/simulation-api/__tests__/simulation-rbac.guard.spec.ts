/**
 * Simulation RBAC Guard - Property & Unit Tests
 * 
 * Sprint 2F - Task 2.2, 2.3
 * 
 * Property Tests:
 * - Property 8: RBAC Tenant Isolation (tenant-admin can only access own tenant)
 * - Property 9: Internal-Ops Cross-Tenant Access (internal-ops can access any tenant)
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as fc from 'fast-check';
import { SimulationRBACGuard } from '../guards/simulation-rbac.guard';
import { ForbiddenTenantScopeException } from '../simulation-error.types';

describe('SimulationRBACGuard', () => {
  let guard: SimulationRBACGuard;

  beforeEach(() => {
    guard = new SimulationRBACGuard();
  });

  // ============================================================================
  // Test Helpers
  // ============================================================================

  const createMockContext = (
    headers: Record<string, string>,
    query: Record<string, string> = {},
  ): ExecutionContext => {
    const request = {
      headers,
      query,
      params: {},
      path: '/incidents/inc-1/simulate',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  // ============================================================================
  // Property 8: RBAC Tenant Isolation
  // **Validates: Requirements 4.1, 4.2**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 8: RBAC Tenant Isolation', () => {
    it('tenant-admin can ONLY access own tenant (validateTenantAccess)', () => {
      fc.assert(
        fc.property(
          fc.record({
            userTenantId: fc.uuid(),
            resourceTenantId: fc.uuid(),
          }),
          ({ userTenantId, resourceTenantId }) => {
            const allowed = guard.validateTenantAccess(
              userTenantId,
              resourceTenantId,
              'tenant-admin',
            );
            
            // tenant-admin: access allowed IFF tenants match
            expect(allowed).toBe(userTenantId === resourceTenantId);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('tenant-admin cross-tenant override via query param is FORBIDDEN', () => {
      fc.assert(
        fc.property(
          fc.record({
            ownTenantId: fc.uuid(),
            otherTenantId: fc.uuid(),
            userId: fc.uuid(),
          }).filter(({ ownTenantId, otherTenantId }) => ownTenantId !== otherTenantId),
          ({ ownTenantId, otherTenantId, userId }) => {
            const context = createMockContext(
              {
                'x-tenant-id': ownTenantId,
                'x-user-id': userId,
                'x-user-role': 'tenant-admin',
              },
              { tenantId: otherTenantId }, // Attempt to override
            );

            expect(() => guard.canActivate(context)).toThrow(ForbiddenTenantScopeException);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('tenant-admin cross-tenant override via header is FORBIDDEN', () => {
      fc.assert(
        fc.property(
          fc.record({
            ownTenantId: fc.uuid(),
            otherTenantId: fc.uuid(),
            userId: fc.uuid(),
          }).filter(({ ownTenantId, otherTenantId }) => ownTenantId !== otherTenantId),
          ({ ownTenantId, otherTenantId, userId }) => {
            const context = createMockContext({
              'x-tenant-id': ownTenantId,
              'x-user-id': userId,
              'x-user-role': 'tenant-admin',
              'x-target-tenant-id': otherTenantId, // Attempt to override via header
            });

            expect(() => guard.canActivate(context)).toThrow(ForbiddenTenantScopeException);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('tenant-admin accessing own tenant is ALLOWED', () => {
      fc.assert(
        fc.property(
          fc.record({
            tenantId: fc.uuid(),
            userId: fc.uuid(),
          }),
          ({ tenantId, userId }) => {
            const context = createMockContext({
              'x-tenant-id': tenantId,
              'x-user-id': userId,
              'x-user-role': 'tenant-admin',
            });

            expect(guard.canActivate(context)).toBe(true);
            
            // Verify context is attached correctly
            const request = context.switchToHttp().getRequest() as any;
            expect(request.simulationTenantContext.tenantId).toBe(tenantId);
            expect(request.simulationTenantContext.role).toBe('tenant-admin');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================================
  // Property 9: Internal-Ops Cross-Tenant Access
  // **Validates: Requirements 4.3**
  // ============================================================================

  describe('Feature: simulation-api-2f, Property 9: Internal-Ops Cross-Tenant Access', () => {
    it('internal-ops can access ANY tenant (validateTenantAccess)', () => {
      fc.assert(
        fc.property(
          fc.record({
            userTenantId: fc.uuid(),
            resourceTenantId: fc.uuid(),
          }),
          ({ userTenantId, resourceTenantId }) => {
            const allowed = guard.validateTenantAccess(
              userTenantId,
              resourceTenantId,
              'internal-ops',
            );
            
            // internal-ops: ALWAYS allowed regardless of tenant
            expect(allowed).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('internal-ops can override tenant via query param', () => {
      fc.assert(
        fc.property(
          fc.record({
            authTenantId: fc.uuid(),
            targetTenantId: fc.uuid(),
            userId: fc.uuid(),
          }),
          ({ authTenantId, targetTenantId, userId }) => {
            const context = createMockContext(
              {
                'x-tenant-id': authTenantId,
                'x-user-id': userId,
                'x-user-role': 'internal-ops',
              },
              { tenantId: targetTenantId },
            );

            expect(guard.canActivate(context)).toBe(true);
            
            // Verify effective tenant is the target tenant
            const request = context.switchToHttp().getRequest() as any;
            expect(request.simulationTenantContext.tenantId).toBe(targetTenantId);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('internal-ops can override tenant via header', () => {
      fc.assert(
        fc.property(
          fc.record({
            authTenantId: fc.uuid(),
            targetTenantId: fc.uuid(),
            userId: fc.uuid(),
          }),
          ({ authTenantId, targetTenantId, userId }) => {
            const context = createMockContext({
              'x-tenant-id': authTenantId,
              'x-user-id': userId,
              'x-user-role': 'internal-ops',
              'x-target-tenant-id': targetTenantId,
            });

            expect(guard.canActivate(context)).toBe(true);
            
            // Verify effective tenant is the target tenant
            const request = context.switchToHttp().getRequest() as any;
            expect(request.simulationTenantContext.tenantId).toBe(targetTenantId);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('internal-ops without override uses auth tenant', () => {
      fc.assert(
        fc.property(
          fc.record({
            tenantId: fc.uuid(),
            userId: fc.uuid(),
          }),
          ({ tenantId, userId }) => {
            const context = createMockContext({
              'x-tenant-id': tenantId,
              'x-user-id': userId,
              'x-user-role': 'internal-ops',
            });

            expect(guard.canActivate(context)).toBe(true);
            
            // Verify effective tenant is auth tenant
            const request = context.switchToHttp().getRequest() as any;
            expect(request.simulationTenantContext.tenantId).toBe(tenantId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================================
  // Unit Tests - Edge Cases
  // ============================================================================

  describe('Authentication Edge Cases', () => {
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

    it('should reject request with invalid role', () => {
      const context = createMockContext({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-123',
        'x-user-role': 'invalid-role',
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenTenantScopeException);
    });
  });

  describe('Tenant Context Attachment', () => {
    it('should attach complete tenant context to request', () => {
      const request = {
        headers: {
          'x-tenant-id': 'tenant-123',
          'x-user-id': 'user-456',
          'x-user-role': 'tenant-admin',
          'user-agent': 'test-agent/1.0',
        },
        query: {},
        params: {},
        path: '/incidents/inc-1/simulate',
        ip: '192.168.1.100',
        socket: { remoteAddress: '192.168.1.100' },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext;

      guard.canActivate(context);

      expect((request as any).simulationTenantContext).toEqual({
        tenantId: 'tenant-123',
        userId: 'user-456',
        role: 'tenant-admin',
        clientIp: '192.168.1.100',
        userAgent: 'test-agent/1.0',
      });
    });
  });

  describe('Query Param Priority', () => {
    it('query param takes priority over header for internal-ops', () => {
      const context = createMockContext(
        {
          'x-tenant-id': 'auth-tenant',
          'x-user-id': 'user-123',
          'x-user-role': 'internal-ops',
          'x-target-tenant-id': 'header-tenant',
        },
        { tenantId: 'query-tenant' },
      );

      guard.canActivate(context);
      
      const request = context.switchToHttp().getRequest() as any;
      expect(request.simulationTenantContext.tenantId).toBe('query-tenant');
    });
  });
});
