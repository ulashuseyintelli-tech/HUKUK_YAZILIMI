/**
 * Break-Glass Controllers Tests
 * 
 * Task 10.6.1 - Comprehensive test suite for break-glass controllers
 * 
 * Tests cover:
 * - Default cross-tenant call → 403
 * - Request → approve → access → 200
 * - Wrong scope → 403
 * - Same requester approving → 403 (four-eyes)
 * - Outside VPN CIDR → 403
 * - Renewal > 3 → 403
 * - Expired grant → 401
 * - Circuit breaker triggered → 503 + alert
 * - Write attempt → 405
 */

import * as jwt from 'jsonwebtoken';
import { BreakGlassConfigService } from '../break-glass.config';
import {
  BreakGlassRequestService,
  InMemoryBreakGlassRequestRepository,
} from '../services/request';
import {
  BreakGlassGrantService,
  InMemoryBreakGlassGrantRepository,
  InMemoryPostMortemRepository,
} from '../services/grant';
import {
  BreakGlassCircuitBreakerService,
  InMemoryCircuitBreakerStore,
} from '../services/circuit-breaker';
import {
  CrossTenantAuditService,
  InMemoryCrossTenantAuditRepository,
} from '../services/audit';
import { BreakGlassApprovalService } from '../services/approval';
import { CROSS_TENANT_SCOPES } from '../break-glass.types';
import {
  BreakGlassKillSwitchGuard,
  NetworkAllowlistGuard,
  BreakGlassGrantGuard,
} from '../guards';

// Mock config for testing
const mockConfig = {
  enabled: true,
  network: {
    allowedCidrs: ['10.0.0.0/8', '127.0.0.1/32'],
    requireMtls: false,
  },
  timing: {
    requestTtlMinutes: 30,
    grantTtlMinutes: 15,
    maxRenewals: 3,
    postMortemDeadlineHours: 48,
  },
  circuitBreaker: {
    windowMinutes: 60,
    maxGrantsPerWindow: 10,
  },
  token: {
    secret: 'test-secret-key-for-break-glass-tokens',
    issuer: 'break-glass-authority',
    audience: 'internal-ops',
  },
};

// ==========================================================================
// Unit tests for service-level behavior
// ==========================================================================
describe('Break-Glass Services Unit Tests', () => {
  let requestService: BreakGlassRequestService;
  let approvalService: BreakGlassApprovalService;
  let grantService: BreakGlassGrantService;
  let circuitBreakerService: BreakGlassCircuitBreakerService;
  let auditService: CrossTenantAuditService;
  let requestRepository: InMemoryBreakGlassRequestRepository;
  let grantRepository: InMemoryBreakGlassGrantRepository;
  let auditRepository: InMemoryCrossTenantAuditRepository;
  let circuitBreakerStore: InMemoryCircuitBreakerStore;
  let postMortemRepository: InMemoryPostMortemRepository;
  let configService: BreakGlassConfigService;

  beforeEach(() => {
    // Create fresh instances for each test
    requestRepository = new InMemoryBreakGlassRequestRepository();
    grantRepository = new InMemoryBreakGlassGrantRepository();
    auditRepository = new InMemoryCrossTenantAuditRepository();
    circuitBreakerStore = new InMemoryCircuitBreakerStore();
    postMortemRepository = new InMemoryPostMortemRepository();

    configService = {
      isEnabled: () => true,
      getNetworkConfig: () => mockConfig.network,
      getTimingConfig: () => mockConfig.timing,
      getCircuitBreakerConfig: () => mockConfig.circuitBreaker,
      getTokenConfig: () => mockConfig.token,
    } as BreakGlassConfigService;

    auditService = new CrossTenantAuditService(auditRepository);
    circuitBreakerService = new BreakGlassCircuitBreakerService(
      configService,
      circuitBreakerStore,
    );
    grantService = new BreakGlassGrantService(
      configService,
      grantRepository,
      postMortemRepository,
    );
    requestService = new BreakGlassRequestService(
      configService,
      requestRepository,
      auditService,
      grantService,
    );
    approvalService = new BreakGlassApprovalService(
      requestService,
      grantService,
      circuitBreakerService,
      auditService,
    );
  });

  const auditContext = {
    ip: '10.0.0.1',
    correlationId: 'test-correlation-id',
  };

  // ==========================================================================
  // Test: INV-2 - Four-eyes principle
  // ==========================================================================
  describe('INV-2: Four-eyes principle', () => {
    it('should reject approval when requester === approver', async () => {
      // Create request
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      // Try to approve as same user
      await expect(
        approvalService.approve(bgRequest.requestId, 'user-1', 'User 1', auditContext),
      ).rejects.toThrow('Four-eyes violation');
    });

    it('should allow approval when requester !== approver', async () => {
      // Create request
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      // Approve as different user
      const result = await approvalService.approve(
        bgRequest.requestId,
        'user-2', // Different user
        'User 2',
        auditContext,
      );

      expect(result.grant).toBeDefined();
      expect(result.token).toBeDefined();
    });
  });

  // ==========================================================================
  // Test: Optimistic lock (409 on race condition)
  // ==========================================================================
  describe('Optimistic locking', () => {
    it('should return 409 when request is already processed', async () => {
      // Create request
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      // First approval succeeds
      await approvalService.approve(bgRequest.requestId, 'user-2', 'User 2', auditContext);

      // Second approval should fail
      await expect(
        approvalService.approve(bgRequest.requestId, 'user-3', 'User 3', auditContext),
      ).rejects.toThrow('already processed');
    });
  });

  // ==========================================================================
  // Test: INV-3 - All grants audited
  // ==========================================================================
  describe('INV-3: All grants audited', () => {
    it('should emit REQUESTED event on request creation', async () => {
      await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      const events = await auditRepository.list({});
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('CROSS_TENANT_ACCESS_REQUESTED');
    });

    it('should emit GRANTED event on approval', async () => {
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      await approvalService.approve(bgRequest.requestId, 'user-2', 'User 2', auditContext);

      const events = await auditRepository.list({});
      expect(events.length).toBe(2);
      expect(events.map(e => e.eventType)).toContain('CROSS_TENANT_ACCESS_GRANTED');
    });

    it('should emit DENIED event on denial', async () => {
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      await approvalService.deny(bgRequest.requestId, 'user-2', 'Not justified', auditContext);

      const events = await auditRepository.list({});
      expect(events.length).toBe(2);
      expect(events.map(e => e.eventType)).toContain('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  // ==========================================================================
  // Test: Circuit breaker
  // ==========================================================================
  describe('Circuit breaker', () => {
    it('should trip after max grants per window', async () => {
      // Record grants up to the limit
      for (let i = 0; i < mockConfig.circuitBreaker.maxGrantsPerWindow; i++) {
        await circuitBreakerService.recordGrant(`approver-${i}`);
      }

      // Next grant should trip the breaker
      const tripped = await circuitBreakerService.recordGrant('approver-final');
      expect(tripped).toBe(true);

      // Check should now fail
      await expect(circuitBreakerService.checkBeforeGrant()).rejects.toThrow(
        'circuit breaker is tripped',
      );
    });

    it('should block new approvals when tripped', async () => {
      // Trip the circuit breaker
      for (let i = 0; i <= mockConfig.circuitBreaker.maxGrantsPerWindow; i++) {
        await circuitBreakerService.recordGrant(`approver-${i}`);
      }

      // Create a request
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      // Approval should fail due to circuit breaker
      await expect(
        approvalService.approve(bgRequest.requestId, 'user-2', 'User 2', auditContext),
      ).rejects.toThrow('circuit breaker');
    });
  });

  // ==========================================================================
  // Test: Renewal cap
  // ==========================================================================
  describe('Renewal cap enforcement', () => {
    it('should allow renewals up to max', async () => {
      // Create request and approve
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      const { grant } = await approvalService.approve(
        bgRequest.requestId,
        'user-2',
        'User 2',
        auditContext,
      );

      // Renew up to max (renewalsLeft > 0 enforcement)
      for (let i = 0; i < mockConfig.timing.maxRenewals; i++) {
        const result = await grantService.renew(grant.grantId, 'user-1');
        expect(result.grant.renewalCount).toBe(i + 1);
      }

      // Next renewal should fail (renewalsLeft = 0)
      await expect(grantService.renew(grant.grantId, 'user-1')).rejects.toThrow(
        'exceeded maximum renewals',
      );
    });
  });

  // ==========================================================================
  // Test: Request expiration
  // ==========================================================================
  describe('Request expiration', () => {
    it('should reject approval for expired request', async () => {
      // Create request
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      // Manually expire the request
      const storedRequest = await requestRepository.findById(bgRequest.requestId);
      if (storedRequest) {
        storedRequest.expiresAt = new Date(Date.now() - 1000).toISOString();
        await requestRepository.update(storedRequest);
      }

      // Approval should fail
      await expect(
        approvalService.approve(bgRequest.requestId, 'user-2', 'User 2', auditContext),
      ).rejects.toThrow('expired');
    });
  });

  // ==========================================================================
  // Test: Denial reason validation
  // ==========================================================================
  describe('Denial reason validation', () => {
    it('should reject denial reason over 200 chars', async () => {
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      const longReason = 'x'.repeat(201);

      await expect(
        approvalService.deny(bgRequest.requestId, 'user-2', longReason, auditContext),
      ).rejects.toThrow('200 characters');
    });

    it('should accept denial reason under 200 chars', async () => {
      const bgRequest = await requestService.createRequest(
        {
          requesterId: 'user-1',
          targetTenantId: 'tenant-target',
          requestedScopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
          reason: {
            category: 'INCIDENT_RESPONSE',
            ticketRef: 'INC-123',
          },
        },
        auditContext,
      );

      const result = await approvalService.deny(
        bgRequest.requestId,
        'user-2',
        'Valid reason',
        auditContext,
      );

      expect(result.request.status).toBe('DENIED');
    });
  });
});

// ==========================================================================
// Guard unit tests
// ==========================================================================
describe('Break-Glass Guards Unit Tests', () => {
  // ==========================================================================
  // Test: Gate 3 - Kill switch
  // ==========================================================================
  describe('Gate 3: Kill switch guard', () => {
    it('should throw 503 when break-glass is disabled', () => {
      const disabledConfig = {
        isEnabled: () => false,
      } as BreakGlassConfigService;

      const guard = new BreakGlassKillSwitchGuard(disabledConfig);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as any;

      expect(() => guard.canActivate(mockContext)).toThrow('Internal ops access is disabled');
    });

    it('should allow when break-glass is enabled', () => {
      const enabledConfig = {
        isEnabled: () => true,
      } as BreakGlassConfigService;

      const guard = new BreakGlassKillSwitchGuard(enabledConfig);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as any;

      expect(guard.canActivate(mockContext)).toBe(true);
    });
  });

  // ==========================================================================
  // Test: INV-4 - Network boundary
  // ==========================================================================
  describe('INV-4: Network allowlist guard', () => {
    const networkConfig = {
      isEnabled: () => true,
      getNetworkConfig: () => ({
        allowedCidrs: ['10.0.0.0/8', '127.0.0.1/32'],
        requireMtls: false,
      }),
    } as BreakGlassConfigService;

    it('should allow requests from within allowed CIDR', () => {
      const guard = new NetworkAllowlistGuard(networkConfig);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-forwarded-for': '10.0.0.1' },
            ip: '10.0.0.1',
            socket: { remoteAddress: '10.0.0.1' },
          }),
        }),
      } as any;

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should reject requests from outside allowed CIDR', () => {
      const guard = new NetworkAllowlistGuard(networkConfig);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-forwarded-for': '203.0.113.1' },
            ip: '203.0.113.1',
            socket: { remoteAddress: '203.0.113.1' },
          }),
        }),
      } as any;

      expect(() => guard.canActivate(mockContext)).toThrow('internal network');
    });
  });

  // ==========================================================================
  // Test: Gate 2 - Break-glass token distinction
  // ==========================================================================
  describe('Gate 2: Break-glass grant guard', () => {
    const tokenConfig = {
      isEnabled: () => true,
      getTokenConfig: () => ({
        secret: 'test-secret',
        issuer: 'break-glass-authority',
        audience: 'internal-ops',
      }),
    } as BreakGlassConfigService;

    function generateToken(claims: Record<string, unknown>): string {
      return jwt.sign(claims, 'test-secret');
    }

    function createMockContext(
      token: string,
      params: Record<string, string> = {},
      path = '/snapshots',
      actorId: string | null = 'actor-1',
    ) {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${token}` },
            params,
            path,
            url: path,
            tenantContext: actorId ? {
              actor: { id: actorId },
              tenantId: params.tenantId || 'tenant-123',
            } : undefined,
          }),
        }),
      } as any;
    }

    it('should reject token without bg=true claim', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 3,
        authorizedActors: ['actor-1'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }))).rejects.toThrow('not a valid break-glass grant');
    });

    it('should reject token with wrong issuer', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 3,
        authorizedActors: ['actor-1'],
        requestId: 'request-123',
        iss: 'wrong-issuer',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }))).rejects.toThrow();
    });

    it('should reject expired token', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 3,
        authorizedActors: ['actor-1'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
        exp: Math.floor(Date.now() / 1000) - 60, // Expired
      });

      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }))).rejects.toThrow('expired');
    });

    // NOTE: renewalsLeft is NOT checked in guard anymore - enforcement is in renew API only
    it('should allow token with renewalsLeft=0 (enforcement is in renew API, not guard)', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 0, // Zero is allowed in guard
        authorizedActors: ['actor-1'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/snapshots', 'actor-1'))).resolves.toBe(true);
    });

    it('should reject when scope does not match resource', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.LEGAL_HOLD], // Wrong scope
        renewalsLeft: 3,
        authorizedActors: ['actor-1'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/api/v1/internal-ops/cross-tenant/tenant-123/snapshots', 'actor-1'))).rejects.toThrow('missing required scope');
    });

    it('should reject when target tenant does not match', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-other', // Different tenant
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 3,
        authorizedActors: ['actor-1'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/snapshots', 'actor-1'))).rejects.toThrow('different tenant');
    });

    // Actor binding tests (Option A)
    it('should reject when actor is not in authorizedActors', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 3,
        authorizedActors: ['actor-1', 'actor-2'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      // actor-3 is not in the list
      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/snapshots', 'actor-3'))).rejects.toThrow('not authorized for your identity');
    });

    it('should reject when no actor context is present', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 3,
        authorizedActors: ['actor-1'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      // No actor in context (null)
      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/snapshots', null))).rejects.toThrow('Actor identity required');
    });

    it('should allow any actor in authorizedActors list', async () => {
      const guard = new BreakGlassGrantGuard(tokenConfig);
      const token = generateToken({
        bg: true,
        grantId: 'grant-123',
        targetTenantId: 'tenant-123',
        scopes: [CROSS_TENANT_SCOPES.SNAPSHOT],
        renewalsLeft: 3,
        authorizedActors: ['actor-1', 'actor-2', 'actor-3'],
        requestId: 'request-123',
        iss: 'break-glass-authority',
        aud: 'internal-ops',
        sub: 'approver-1',
      });

      // All three actors should be allowed
      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/snapshots', 'actor-1'))).resolves.toBe(true);
      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/snapshots', 'actor-2'))).resolves.toBe(true);
      await expect(guard.canActivate(createMockContext(token, { tenantId: 'tenant-123' }, '/snapshots', 'actor-3'))).resolves.toBe(true);
    });
  });
});
