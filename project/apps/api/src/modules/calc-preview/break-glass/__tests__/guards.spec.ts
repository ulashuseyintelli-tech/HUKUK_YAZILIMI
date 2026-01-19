/**
 * Break-Glass Guards Tests
 * 
 * Tests for Gate 2, Gate 3, and security invariants.
 */

import { ExecutionContext, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { BreakGlassKillSwitchGuard } from '../guards/kill-switch.guard';
import { NetworkAllowlistGuard } from '../guards/network-allowlist.guard';
import { InternalOpsGuard, BreakGlassApproverGuard } from '../guards/internal-ops.guard';
import { BreakGlassGrantGuard } from '../guards/break-glass-grant.guard';
import { BreakGlassConfigService, DEFAULT_BREAK_GLASS_CONFIG } from '../break-glass.config';

describe('BreakGlassKillSwitchGuard (Gate 3)', () => {
  const createMockConfig = (enabled: boolean) => ({
    isEnabled: () => enabled,
    get: () => ({ ...DEFAULT_BREAK_GLASS_CONFIG, enabled }),
  } as unknown as BreakGlassConfigService);

  const createMockContext = () => ({
    switchToHttp: () => ({
      getRequest: () => ({}),
    }),
  } as ExecutionContext);

  it('should allow request when enabled', () => {
    const guard = new BreakGlassKillSwitchGuard(createMockConfig(true));
    expect(guard.canActivate(createMockContext())).toBe(true);
  });

  it('should reject with 503 when disabled (Gate 3)', () => {
    const guard = new BreakGlassKillSwitchGuard(createMockConfig(false));
    
    expect(() => guard.canActivate(createMockContext())).toThrow(ServiceUnavailableException);
    
    try {
      guard.canActivate(createMockContext());
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse();
      expect(response).toHaveProperty('error', 'BREAK_GLASS_DISABLED');
    }
  });
});

describe('NetworkAllowlistGuard', () => {
  const createMockConfig = (cidrs: string[]) => ({
    getNetworkConfig: () => ({ allowedCidrs: cidrs, requireMtls: false }),
  } as unknown as BreakGlassConfigService);

  const createMockContext = (ip: string, headers: Record<string, string> = {}) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        headers,
        connection: { remoteAddress: ip },
      }),
    }),
  } as ExecutionContext);

  it('should allow IP in CIDR range', () => {
    const guard = new NetworkAllowlistGuard(createMockConfig(['10.0.0.0/8']));
    expect(guard.canActivate(createMockContext('10.1.2.3'))).toBe(true);
  });

  it('should allow localhost', () => {
    const guard = new NetworkAllowlistGuard(createMockConfig(['127.0.0.1/32']));
    expect(guard.canActivate(createMockContext('127.0.0.1'))).toBe(true);
  });

  it('should reject IP outside CIDR range', () => {
    const guard = new NetworkAllowlistGuard(createMockConfig(['10.0.0.0/8']));
    
    expect(() => guard.canActivate(createMockContext('192.168.1.1'))).toThrow(ForbiddenException);
    
    try {
      guard.canActivate(createMockContext('192.168.1.1'));
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse();
      expect(response).toHaveProperty('error', 'NETWORK_RESTRICTED');
    }
  });

  it('should use X-Forwarded-For header when present', () => {
    const guard = new NetworkAllowlistGuard(createMockConfig(['10.0.0.0/8']));
    
    // Request from proxy with internal client
    expect(guard.canActivate(createMockContext('1.2.3.4', {
      'x-forwarded-for': '10.1.2.3, 1.2.3.4',
    }))).toBe(true);
    
    // Request from proxy with external client
    expect(() => guard.canActivate(createMockContext('10.0.0.1', {
      'x-forwarded-for': '192.168.1.1',
    }))).toThrow(ForbiddenException);
  });

  it('should handle IPv6 localhost', () => {
    const guard = new NetworkAllowlistGuard(createMockConfig(['127.0.0.1/32']));
    expect(guard.canActivate(createMockContext('::1'))).toBe(true);
  });
});

describe('InternalOpsGuard', () => {
  const createMockContext = (roles: string[]) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        tenantContext: {
          scopes: roles.map(r => `role:${r}`),
          actor: { id: 'user-1' },
        },
        user: { roles },
      }),
    }),
  } as ExecutionContext);

  it('should allow user with internal_ops role', () => {
    const guard = new InternalOpsGuard();
    expect(guard.canActivate(createMockContext(['internal_ops']))).toBe(true);
  });

  it('should reject user without internal_ops role', () => {
    const guard = new InternalOpsGuard();
    
    expect(() => guard.canActivate(createMockContext(['user']))).toThrow(ForbiddenException);
    
    try {
      guard.canActivate(createMockContext(['user']));
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toHaveProperty('error', 'INSUFFICIENT_ROLE');
    }
  });
});

describe('BreakGlassApproverGuard', () => {
  const createMockContext = (roles: string[]) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        tenantContext: {
          scopes: roles.map(r => `role:${r}`),
          actor: { id: 'user-1' },
        },
        user: { roles },
      }),
    }),
  } as ExecutionContext);

  it('should allow ops_lead', () => {
    const guard = new BreakGlassApproverGuard();
    expect(guard.canActivate(createMockContext(['ops_lead']))).toBe(true);
  });

  it('should allow security', () => {
    const guard = new BreakGlassApproverGuard();
    expect(guard.canActivate(createMockContext(['security']))).toBe(true);
  });

  it('should allow admin', () => {
    const guard = new BreakGlassApproverGuard();
    expect(guard.canActivate(createMockContext(['admin']))).toBe(true);
  });

  it('should reject internal_ops without approver role', () => {
    const guard = new BreakGlassApproverGuard();
    expect(() => guard.canActivate(createMockContext(['internal_ops']))).toThrow(ForbiddenException);
  });
});

describe('BreakGlassGrantGuard (Gate 2)', () => {
  const TEST_SECRET = 'test-secret-for-break-glass-tokens';
  
  const createMockConfig = () => ({
    getTokenConfig: () => ({
      issuer: 'break-glass-authority',
      audience: 'internal-ops',
      secret: TEST_SECRET,
    }),
  } as unknown as BreakGlassConfigService);

  const createValidToken = (overrides: Partial<any> = {}) => {
    const claims = {
      bg: true,
      grantId: 'grant-123',
      targetTenantId: 'tenant-abc',
      scopes: ['cross_tenant_read:snapshot'],
      renewalsLeft: 3,
      authorizedActors: ['actor-1'],
      requesterId: 'requester-1',
      approverId: 'approver-1',
      requestId: 'request-123',
      iss: 'break-glass-authority',
      aud: 'internal-ops',
      sub: 'approver-1',
      ...overrides,
    };
    return jwt.sign(claims, TEST_SECRET, { expiresIn: '15m' });
  };

  const createMockContext = (
    token: string | null,
    params: Record<string, string> = {},
    path = '/snapshots',
    actorId: string | null = 'actor-1',
  ) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { authorization: `Bearer ${token}` } : {},
        params,
        path,
        url: path,
        tenantContext: actorId ? {
          actor: { id: actorId },
          tenantId: params.tenantId || 'tenant-abc',
        } : undefined,
      }),
    }),
  } as ExecutionContext);

  it('should allow valid break-glass token with authorized actor', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken({ authorizedActors: ['actor-1'] });
    
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-1'))).resolves.toBe(true);
  });

  it('should reject missing token', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    
    await expect(guard.canActivate(createMockContext(null))).rejects.toThrow(UnauthorizedException);
  });

  it('should reject token without bg=true claim (Gate 2)', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken({ bg: false });
    
    await expect(guard.canActivate(createMockContext(token))).rejects.toThrow(ForbiddenException);
    
    try {
      await guard.canActivate(createMockContext(token));
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toHaveProperty('error', 'NOT_BREAK_GLASS_TOKEN');
    }
  });

  it('should reject token with wrong issuer (Gate 2)', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    // Create token with wrong issuer
    const claims = {
      bg: true,
      grantId: 'grant-123',
      targetTenantId: 'tenant-abc',
      scopes: ['cross_tenant_read:snapshot'],
      renewalsLeft: 3,
      authorizedActors: ['actor-1'],
      iss: 'https://auth.example.com', // user JWT issuer, not break-glass
      aud: 'internal-ops',
      sub: 'user-1',
    };
    const token = jwt.sign(claims, TEST_SECRET);
    
    await expect(guard.canActivate(createMockContext(token))).rejects.toThrow(UnauthorizedException);
  });

  it('should reject expired token', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = jwt.sign({
      bg: true,
      grantId: 'grant-123',
      targetTenantId: 'tenant-abc',
      scopes: ['cross_tenant_read:snapshot'],
      renewalsLeft: 3,
      authorizedActors: ['actor-1'],
      iss: 'break-glass-authority',
      aud: 'internal-ops',
      sub: 'approver-1',
    }, TEST_SECRET, { expiresIn: '-1h' }); // expired
    
    await expect(guard.canActivate(createMockContext(token))).rejects.toThrow(UnauthorizedException);
    
    try {
      await guard.canActivate(createMockContext(token));
    } catch (error) {
      const response = (error as UnauthorizedException).getResponse();
      expect(response).toHaveProperty('error', 'BREAK_GLASS_TOKEN_EXPIRED');
    }
  });

  it('should reject tenant mismatch', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken({ targetTenantId: 'tenant-abc' });
    
    // Request for different tenant
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-xyz' }, '/snapshots', 'actor-1'))).rejects.toThrow(ForbiddenException);
    
    try {
      await guard.canActivate(createMockContext(token, { tenantId: 'tenant-xyz' }, '/snapshots', 'actor-1'));
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toHaveProperty('error', 'TENANT_MISMATCH');
    }
  });

  it('should reject wrong scope', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken({ scopes: ['cross_tenant_read:legal_hold'] });
    
    // Request for snapshots but grant is for legal_hold
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-1'))).rejects.toThrow(ForbiddenException);
    
    try {
      await guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-1'));
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toHaveProperty('error', 'INSUFFICIENT_SCOPE');
    }
  });

  // Actor binding tests (Option A)
  it('should reject when actor is not in authorizedActors', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken({ authorizedActors: ['actor-1', 'actor-2'] });
    
    // Actor-3 is not in the list
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-3'))).rejects.toThrow(ForbiddenException);
    
    try {
      await guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-3'));
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toHaveProperty('error', 'TOKEN_NOT_AUTHORIZED_FOR_ACTOR');
    }
  });

  it('should reject when no actor context is present', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken();
    
    // No actor in context (null)
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', null))).rejects.toThrow(ForbiddenException);
    
    try {
      await guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', null));
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toHaveProperty('error', 'MISSING_ACTOR_CONTEXT');
    }
  });

  it('should allow any actor in authorizedActors list', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken({ authorizedActors: ['actor-1', 'actor-2', 'actor-3'] });
    
    // All three actors should be allowed
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-1'))).resolves.toBe(true);
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-2'))).resolves.toBe(true);
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-3'))).resolves.toBe(true);
  });

  // NOTE: renewalsLeft is NOT checked in guard anymore - enforcement is in renew API only
  it('should allow token with renewalsLeft=0 (enforcement is in renew API, not guard)', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    const token = createValidToken({ renewalsLeft: 0 });
    
    // Should be allowed - renewalsLeft is informational only in guard
    await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-abc' }, '/snapshots', 'actor-1'))).resolves.toBe(true);
  });

  it('should reject user JWT even with bg claim added (Gate 2 - issuer check)', async () => {
    const guard = new BreakGlassGrantGuard(createMockConfig());
    
    // Simulate attacker adding bg=true to a user JWT
    const userJwtWithBgClaim = jwt.sign({
      bg: true, // attacker adds this
      sub: 'user-123',
      tenantId: 'tenant-abc',
      iss: 'https://auth.example.com', // but issuer is still user JWT issuer
      aud: 'calc-preview-api',
    }, TEST_SECRET);
    
    // Should be rejected because issuer doesn't match
    await expect(guard.canActivate(createMockContext(userJwtWithBgClaim))).rejects.toThrow(UnauthorizedException);
  });
});
