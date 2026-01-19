/**
 * TenantContextGuard Tests
 * 
 * Verifies that the guard properly:
 * - Injects tenant context into requests
 * - Rejects invalid/missing auth
 * - Works with decorators
 */

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TenantContextGuard, TenantCtx, TenantId } from '../tenant-context.guard';
import { TenantContextResolver } from '../tenant-context.resolver';
import { TenantContext } from '../tenant-context.types';

describe('TenantContextGuard', () => {
  let guard: TenantContextGuard;
  let resolver: TenantContextResolver;

  beforeEach(() => {
    process.env.INTERNAL_HMAC_SECRET = 'test-secret-32-characters-long!!';
    resolver = new TenantContextResolver();
    guard = new TenantContextGuard(resolver);
  });

  afterEach(() => {
    delete process.env.INTERNAL_HMAC_SECRET;
  });

  const createMockContext = (request: Record<string, unknown>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  describe('canActivate', () => {
    it('should allow request with valid JWT and attach tenant context', () => {
      const request: Record<string, unknown> = {
        headers: {},
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const context = createMockContext(request);
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.tenantContext).toBeDefined();
      expect((request.tenantContext as TenantContext).tenantId).toBe('tenant-abc');
    });

    it('should reject request without auth', () => {
      const request: Record<string, unknown> = {
        headers: {},
      };

      const context = createMockContext(request);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject request with invalid JWT', () => {
      const request: Record<string, unknown> = {
        headers: {},
        user: {
          sub: 'user-123',
          // missing tenantId
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const context = createMockContext(request);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject request with expired JWT', () => {
      const request: Record<string, unknown> = {
        headers: {},
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) - 3600, // expired
        },
      };

      const context = createMockContext(request);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should include error code in exception', () => {
      const request: Record<string, unknown> = {
        headers: {},
        user: {
          sub: 'user-123',
          // missing tenantId
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const context = createMockContext(request);

      try {
        guard.canActivate(context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const response = (error as UnauthorizedException).getResponse();
        expect(response).toHaveProperty('error', 'MISSING_TENANT_CLAIM');
      }
    });
  });
});

describe('TenantCtx Decorator', () => {
  // Note: Testing NestJS decorators directly is complex due to internal metadata handling.
  // These decorators are better tested via integration tests with actual controllers.
  // The core functionality is tested via TenantContextGuard tests above.
  
  it('should be defined', () => {
    expect(TenantCtx).toBeDefined();
  });
});

describe('TenantId Decorator', () => {
  // Note: Testing NestJS decorators directly is complex due to internal metadata handling.
  // These decorators are better tested via integration tests with actual controllers.
  
  it('should be defined', () => {
    expect(TenantId).toBeDefined();
  });
});
