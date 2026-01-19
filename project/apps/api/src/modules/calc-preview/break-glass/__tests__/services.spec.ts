/**
 * Break-Glass Services Tests
 * 
 * Tests for:
 * - CrossTenantAuditService (INV-3: All grants audited)
 * - BreakGlassCircuitBreakerService
 * - BreakGlassGrantService
 * - BreakGlassRequestService
 * - BreakGlassApprovalService (INV-2: Four-eyes enforced)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  CrossTenantAuditService,
  InMemoryCrossTenantAuditRepository,
  CROSS_TENANT_AUDIT_REPOSITORY,
  AuditContext,
} from '../services/audit';
import {
  BreakGlassCircuitBreakerService,
  InMemoryCircuitBreakerStore,
  CircuitBreakerTrippedException,
} from '../services/circuit-breaker';
import {
  BreakGlassGrantService,
  InMemoryBreakGlassGrantRepository,
  InMemoryPostMortemRepository,
  BREAK_GLASS_GRANT_REPOSITORY,
  POST_MORTEM_REPOSITORY,
  RenewalCapExceededException,
} from '../services/grant';
import {
  BreakGlassRequestService,
  InMemoryBreakGlassRequestRepository,
  BREAK_GLASS_REQUEST_REPOSITORY,
  InvalidReasonException,
} from '../services/request';
import {
  BreakGlassApprovalService,
  FourEyesViolationException,
  RequestAlreadyProcessedException,
} from '../services/approval';
import { BreakGlassConfigService } from '../break-glass.config';
import { BreakGlassRequest, BreakGlassReason } from '../break-glass.types';

describe('Break-Glass Services', () => {
  // Shared test context
  const testContext: AuditContext = {
    ip: '10.0.0.1',
    userAgent: 'test-agent',
    correlationId: randomUUID(),
  };

  const validReason: BreakGlassReason = {
    category: 'INCIDENT_RESPONSE',
    ticketRef: 'INC-123',
    description: 'Test incident',
  };

  describe('CrossTenantAuditService', () => {
    let auditService: CrossTenantAuditService;
    let auditRepository: InMemoryCrossTenantAuditRepository;

    beforeEach(async () => {
      auditRepository = new InMemoryCrossTenantAuditRepository();
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CrossTenantAuditService,
          {
            provide: CROSS_TENANT_AUDIT_REPOSITORY,
            useValue: auditRepository,
          },
        ],
      }).compile();

      auditService = module.get<CrossTenantAuditService>(CrossTenantAuditService);
    });

    afterEach(() => {
      auditRepository._clearForTesting();
    });

    it('should emit REQUESTED event', async () => {
      const request: BreakGlassRequest = {
        requestId: randomUUID(),
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'PENDING',
      };

      await auditService.emitRequested({ request, context: testContext });

      const events = await auditRepository.list({ requestId: request.requestId });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('CROSS_TENANT_ACCESS_REQUESTED');
      expect(events[0].requesterId).toBe('user-1');
      expect(events[0].targetTenantId).toBe('tenant-1');
    });

    it('should emit GRANTED event with grant details', async () => {
      const request: BreakGlassRequest = {
        requestId: randomUUID(),
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'APPROVED',
      };

      const grant = {
        grantId: randomUUID(),
        requestId: request.requestId,
        approverId: 'approver-1',
        targetTenantId: 'tenant-1',
        grantedScopes: ['cross_tenant_read:snapshot'],
        grantedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        renewalCount: 0,
        maxRenewals: 3,
        isActive: true,
      };

      await auditService.emitGranted({ request, grant, context: testContext });

      const events = await auditRepository.list({ grantId: grant.grantId });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('CROSS_TENANT_ACCESS_GRANTED');
      expect(events[0].approverId).toBe('approver-1');
    });

    it('should emit DENIED event', async () => {
      const request: BreakGlassRequest = {
        requestId: randomUUID(),
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'DENIED',
      };

      await auditService.emitDenied({
        request,
        denialReason: 'Not justified',
        context: testContext,
      });

      const events = await auditRepository.list({ requestId: request.requestId });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('CROSS_TENANT_ACCESS_DENIED');
      expect(events[0].outcome).toBe('DENIED');
    });
  });

  describe('BreakGlassCircuitBreakerService', () => {
    let circuitBreakerService: BreakGlassCircuitBreakerService;
    let circuitBreakerStore: InMemoryCircuitBreakerStore;
    let configService: BreakGlassConfigService;

    beforeEach(async () => {
      circuitBreakerStore = new InMemoryCircuitBreakerStore();
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BreakGlassCircuitBreakerService,
          BreakGlassConfigService,
          {
            provide: InMemoryCircuitBreakerStore,
            useValue: circuitBreakerStore,
          },
        ],
      }).compile();

      circuitBreakerService = module.get<BreakGlassCircuitBreakerService>(BreakGlassCircuitBreakerService);
      configService = module.get<BreakGlassConfigService>(BreakGlassConfigService);
    });

    afterEach(() => {
      circuitBreakerStore._clearForTesting();
    });

    it('should allow grants when not tripped', async () => {
      await expect(circuitBreakerService.checkBeforeGrant()).resolves.not.toThrow();
    });

    it('should block grants when tripped', async () => {
      await circuitBreakerStore.trip('test-user');
      
      await expect(circuitBreakerService.checkBeforeGrant())
        .rejects.toThrow(CircuitBreakerTrippedException);
    });

    it('should trip after threshold grants', async () => {
      const threshold = configService.getCircuitBreakerConfig().maxGrantsPerWindow;
      
      // Record grants up to threshold
      for (let i = 0; i < threshold; i++) {
        const tripped = await circuitBreakerService.recordGrant(`user-${i}`);
        if (i < threshold - 1) {
          expect(tripped).toBe(false);
        } else {
          expect(tripped).toBe(true);
        }
      }

      // Should now be tripped
      expect(await circuitBreakerService.isTripped()).toBe(true);
    });

    it('should return state with threshold', async () => {
      const state = await circuitBreakerService.getState();
      
      expect(state.isTripped).toBe(false);
      expect(state.threshold).toBe(configService.getCircuitBreakerConfig().maxGrantsPerWindow);
    });
  });

  describe('BreakGlassGrantService', () => {
    let grantService: BreakGlassGrantService;
    let grantRepository: InMemoryBreakGlassGrantRepository;
    let postMortemRepository: InMemoryPostMortemRepository;

    beforeEach(async () => {
      grantRepository = new InMemoryBreakGlassGrantRepository();
      postMortemRepository = new InMemoryPostMortemRepository();
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BreakGlassGrantService,
          BreakGlassConfigService,
          {
            provide: BREAK_GLASS_GRANT_REPOSITORY,
            useValue: grantRepository,
          },
          {
            provide: POST_MORTEM_REPOSITORY,
            useValue: postMortemRepository,
          },
        ],
      }).compile();

      grantService = module.get<BreakGlassGrantService>(BreakGlassGrantService);
    });

    afterEach(() => {
      grantRepository._clearForTesting();
      postMortemRepository._clearForTesting();
    });

    it('should issue grant with token', async () => {
      const request: BreakGlassRequest = {
        requestId: randomUUID(),
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'APPROVED',
      };

      const { grant, token } = await grantService.issue(request, 'approver-1');

      expect(grant.grantId).toBeDefined();
      expect(grant.requestId).toBe(request.requestId);
      expect(grant.approverId).toBe('approver-1');
      expect(grant.isActive).toBe(true);
      expect(grant.renewalCount).toBe(0);
      expect(token).toBeDefined();
    });

    it('should renew grant up to max renewals', async () => {
      const request: BreakGlassRequest = {
        requestId: randomUUID(),
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'APPROVED',
      };

      const { grant } = await grantService.issue(request, 'approver-1');

      // Renew 3 times (max)
      for (let i = 0; i < 3; i++) {
        const { grant: renewed } = await grantService.renew(grant.grantId, 'INC-123');
        expect(renewed.renewalCount).toBe(i + 1);
      }

      // 4th renewal should fail
      await expect(grantService.renew(grant.grantId, 'INC-123'))
        .rejects.toThrow(RenewalCapExceededException);
    });

    it('should check grant active status with cache', async () => {
      const request: BreakGlassRequest = {
        requestId: randomUUID(),
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'APPROVED',
      };

      const { grant } = await grantService.issue(request, 'approver-1');

      // Should be active
      expect(await grantService.isGrantActive(grant.grantId)).toBe(true);

      // Revoke
      await grantService.revoke(grant.grantId, 'test-user', 'manual', 'Test revocation');

      // Should be inactive
      expect(await grantService.isGrantActive(grant.grantId)).toBe(false);
    });

    it('should return false for non-existent grant (fail-closed)', async () => {
      expect(await grantService.isGrantActive('non-existent')).toBe(false);
    });
  });

  describe('BreakGlassRequestService', () => {
    let requestService: BreakGlassRequestService;
    let requestRepository: InMemoryBreakGlassRequestRepository;

    beforeEach(async () => {
      requestRepository = new InMemoryBreakGlassRequestRepository();
      const auditRepository = new InMemoryCrossTenantAuditRepository();
      const grantRepository = new InMemoryBreakGlassGrantRepository();
      const postMortemRepository = new InMemoryPostMortemRepository();
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BreakGlassRequestService,
          BreakGlassConfigService,
          {
            provide: BREAK_GLASS_REQUEST_REPOSITORY,
            useValue: requestRepository,
          },
          {
            provide: CrossTenantAuditService,
            useFactory: () => new CrossTenantAuditService(auditRepository),
          },
          {
            provide: BreakGlassGrantService,
            useFactory: (config: BreakGlassConfigService) => 
              new BreakGlassGrantService(config, grantRepository, postMortemRepository),
            inject: [BreakGlassConfigService],
          },
        ],
      }).compile();

      requestService = module.get<BreakGlassRequestService>(BreakGlassRequestService);
    });

    afterEach(() => {
      requestRepository._clearForTesting();
    });

    it('should create request with valid reason', async () => {
      const request = await requestService.createRequest({
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
      }, testContext);

      expect(request.requestId).toBeDefined();
      expect(request.status).toBe('PENDING');
      expect(request.requesterId).toBe('user-1');
    });

    it('should reject invalid reason', async () => {
      await expect(requestService.createRequest({
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: {
          category: 'INCIDENT_RESPONSE',
          ticketRef: '', // Invalid: empty
        },
      }, testContext)).rejects.toThrow(InvalidReasonException);
    });

    it('should reject invalid scope', async () => {
      await expect(requestService.createRequest({
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['invalid_scope'],
        reason: validReason,
      }, testContext)).rejects.toThrow();
    });
  });

  describe('BreakGlassApprovalService', () => {
    let approvalService: BreakGlassApprovalService;
    let requestService: BreakGlassRequestService;
    let requestRepository: InMemoryBreakGlassRequestRepository;

    beforeEach(async () => {
      requestRepository = new InMemoryBreakGlassRequestRepository();
      const auditRepository = new InMemoryCrossTenantAuditRepository();
      const grantRepository = new InMemoryBreakGlassGrantRepository();
      const postMortemRepository = new InMemoryPostMortemRepository();
      const circuitBreakerStore = new InMemoryCircuitBreakerStore();
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BreakGlassApprovalService,
          BreakGlassConfigService,
          {
            provide: BREAK_GLASS_REQUEST_REPOSITORY,
            useValue: requestRepository,
          },
          {
            provide: CROSS_TENANT_AUDIT_REPOSITORY,
            useValue: auditRepository,
          },
          {
            provide: BREAK_GLASS_GRANT_REPOSITORY,
            useValue: grantRepository,
          },
          {
            provide: POST_MORTEM_REPOSITORY,
            useValue: postMortemRepository,
          },
          {
            provide: InMemoryCircuitBreakerStore,
            useValue: circuitBreakerStore,
          },
          CrossTenantAuditService,
          BreakGlassCircuitBreakerService,
          BreakGlassGrantService,
          BreakGlassRequestService,
        ],
      }).compile();

      approvalService = module.get<BreakGlassApprovalService>(BreakGlassApprovalService);
      requestService = module.get<BreakGlassRequestService>(BreakGlassRequestService);
    });

    afterEach(() => {
      requestRepository._clearForTesting();
    });

    it('should approve request and issue grant', async () => {
      // Create request
      const request = await requestService.createRequest({
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
      }, testContext);

      // Approve by different user
      const result = await approvalService.approve(
        request.requestId,
        'approver-1', // Different from requester
        'Approver Name',
        testContext,
      );

      expect(result.grant).toBeDefined();
      expect(result.grant.approverId).toBe('approver-1');
      expect(result.token).toBeDefined();
    });

    it('should reject four-eyes violation (INV-2)', async () => {
      // Create request
      const request = await requestService.createRequest({
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
      }, testContext);

      // Try to approve by same user
      await expect(approvalService.approve(
        request.requestId,
        'user-1', // Same as requester - VIOLATION
        'User Name',
        testContext,
      )).rejects.toThrow(FourEyesViolationException);
    });

    it('should reject already processed request (409)', async () => {
      // Create request
      const request = await requestService.createRequest({
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
      }, testContext);

      // Approve first time
      await approvalService.approve(
        request.requestId,
        'approver-1',
        'Approver Name',
        testContext,
      );

      // Try to approve again
      await expect(approvalService.approve(
        request.requestId,
        'approver-2',
        'Another Approver',
        testContext,
      )).rejects.toThrow(RequestAlreadyProcessedException);
    });

    it('should deny request with reason', async () => {
      // Create request
      const request = await requestService.createRequest({
        requesterId: 'user-1',
        targetTenantId: 'tenant-1',
        requestedScopes: ['cross_tenant_read:snapshot'],
        reason: validReason,
      }, testContext);

      // Deny
      const result = await approvalService.deny(
        request.requestId,
        'approver-1',
        'Not justified',
        testContext,
      );

      expect(result.request.status).toBe('DENIED');
      expect(result.denialReason).toBe('Not justified');
    });
  });
});
