/**
 * Playbook Contract Tests
 * 
 * Phase 7B - Sprint 3 - Task 3.9
 * 
 * Endpoint kontratı (request/response) kırılmasın.
 * Type assertions ile response shape doğrulama.
 * 
 * 10+ Contract Test:
 * 1. /evaluate response shape
 * 2. /run returns executionId
 * 3. /executions/{id} status lifecycle
 * 4. /leases filters
 * 5. /playbooks list shape
 * 6. /playbooks/{id} detail shape
 * 7. /health response shape
 * 8. /audit response shape
 * 9. State change response contract
 * 10. Error response contract
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PlaybookService } from '../playbook.service';
import { PlaybookRegistry } from '../playbook-registry.service';
import { PlaybookMatcher } from '../playbook-matcher.service';
import { ActionExecutor } from '../action-executor.service';
import { ActionPolicyGuard } from '../action-policy-guard.service';
import { ActionLeaseManager } from '../action-lease-manager.service';
import { PlaybookAuditService } from '../playbook-audit.service';
import { PlaybookMetricsService } from '../playbook-metrics.service';
import { NotificationService } from '../notification.service';
import { EscalationService } from '../escalation.service';
import { DiagnosticsIncidentService } from '../../diagnostics-incident.service';
import { PlaybookYAMLValidator } from '../playbook-yaml-validator.service';
import { Playbook } from '../playbook.types';
import { DiagnosticsIncident } from '../../diagnostics.types';
import {
  EvaluateResponse,
  RunResponse,
  PlaybookListResponse,
  PlaybookDetailResponse,
  PlaybookStateResponse,
  HealthResponse,
  LeaseResponse,
  AcknowledgeResponse,
  ResolveResponse,
} from '../playbook-controller.types';

describe('Playbook Contract Tests', () => {
  let playbookService: PlaybookService;
  let registry: PlaybookRegistry;
  let leaseManager: ActionLeaseManager;
  let incidentService: DiagnosticsIncidentService;

  const testPlaybook: Playbook = {
    id: 'contract-test-playbook',
    name: 'Contract Test Playbook',
    version: '1.0.0',
    description: 'Playbook for contract tests',
    dryRun: false,
    priority: 100,
    match: {
      incidentType: 'SLO_BREACH',
      severity: ['WARNING'],
      tenantScope: '*',
    },
    actions: [
      {
        id: 'notify-ops',
        type: 'notification',
        channel: 'console',
        template: 'slo_breach_alert',
        recipients: ['ops-team'],
      },
      {
        id: 'extend-cache',
        type: 'auto_action',
        action: 'extend_cache_ttl',
        params: { namespace: 'rate-provider', multiplier: 2 },
        safetyPolicy: {
          maxTtlMs: 3600000,
          maxMultiplier: 5,
          allowedNamespaces: ['rate-provider'],
          allowedRoles: ['system'],
          cooldownMs: 60000,
        },
        lease: {
          durationMs: 300000,
          autoRollback: true,
          rollbackAction: 'restore_cache_ttl',
        },
      },
    ],
  };

  const createTestIncident = (tenantId: string): DiagnosticsIncident => ({
    id: `incident-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    type: 'SLO_BREACH',
    severity: 'WARNING',
    status: 'ONGOING',
    title: 'SLO Breach Detected',
    description: 'P95 latency exceeded threshold',
    recommendation: 'Check downstream services',
    startedAt: new Date().toISOString(),
    evidence: {
      source: 'metrics',
      metric: 'p95_latency_ms',
      value: 1500,
      threshold: 1000,
      timestamp: new Date().toISOString(),
    },
    tenantId,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaybookYAMLValidator,
        PlaybookRegistry,
        PlaybookMatcher,
        ActionPolicyGuard,
        ActionLeaseManager,
        PlaybookAuditService,
        PlaybookMetricsService,
        NotificationService,
        EscalationService,
        DiagnosticsIncidentService,
        {
          provide: ActionExecutor,
          useFactory: () => ({
            execute: jest.fn().mockResolvedValue({
              executionId: 'mock-exec-id',
              playbookId: 'test',
              playbookVersion: '1.0.0',
              incidentId: 'test',
              tenantId: 'test',
              triggeredAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              dryRun: true,
              result: 'SUCCESS',
              actionResults: [],
            }),
          }),
        },
        PlaybookService,
      ],
    }).compile();

    playbookService = module.get<PlaybookService>(PlaybookService);
    registry = module.get<PlaybookRegistry>(PlaybookRegistry);
    leaseManager = module.get<ActionLeaseManager>(ActionLeaseManager);
    incidentService = module.get<DiagnosticsIncidentService>(DiagnosticsIncidentService);

    // Clear and setup
    registry.clear();
    leaseManager.clear();
    incidentService.clear();
    playbookService.clear();
    registry.registerPlaybook(testPlaybook);
  });

  // ==========================================================================
  // CONTRACT 1: /evaluate response shape
  // ==========================================================================
  describe('Contract 1: EvaluateResponse shape', () => {
    it('should return correct EvaluateResponse structure', async () => {
      const incident = createTestIncident('tenant-contract-1');
      incidentService['incidents'].set(incident.id, incident);

      const result = await playbookService.evaluatePlaybook(
        testPlaybook.id,
        incident.id,
        incident.tenantId,
      );

      // Type assertion
      const response: EvaluateResponse = result;

      // Required fields
      expect(response).toHaveProperty('playbookId');
      expect(response).toHaveProperty('incidentId');
      expect(response).toHaveProperty('matched');
      expect(response).toHaveProperty('matchScore');
      expect(response).toHaveProperty('matchedCriteria');
      expect(response).toHaveProperty('plannedActions');
      expect(response).toHaveProperty('wouldBlock');
      expect(response).toHaveProperty('estimatedDuration');
      expect(response).toHaveProperty('estimatedNotifications');

      // Type checks
      expect(typeof response.playbookId).toBe('string');
      expect(typeof response.incidentId).toBe('string');
      expect(typeof response.matched).toBe('boolean');
      expect(typeof response.matchScore).toBe('number');
      expect(Array.isArray(response.plannedActions)).toBe(true);
      expect(typeof response.wouldBlock.blocked).toBe('boolean');
      expect(Array.isArray(response.wouldBlock.reasons)).toBe(true);
    });

    it('should include matchedCriteria breakdown', async () => {
      const incident = createTestIncident('tenant-contract-1');
      incidentService['incidents'].set(incident.id, incident);

      const result = await playbookService.evaluatePlaybook(
        testPlaybook.id,
        incident.id,
        incident.tenantId,
      );

      expect(result.matchedCriteria).toHaveProperty('incidentType');
      expect(result.matchedCriteria).toHaveProperty('severity');
      expect(result.matchedCriteria).toHaveProperty('tenantScope');
    });

    it('should include plannedAction structure', async () => {
      const incident = createTestIncident('tenant-contract-1');
      incidentService['incidents'].set(incident.id, incident);

      const result = await playbookService.evaluatePlaybook(
        testPlaybook.id,
        incident.id,
        incident.tenantId,
      );

      expect(result.plannedActions.length).toBeGreaterThan(0);
      
      const action = result.plannedActions[0];
      expect(action).toHaveProperty('actionId');
      expect(action).toHaveProperty('type');
      expect(action).toHaveProperty('description');
      expect(action).toHaveProperty('wouldExecute');
    });
  });

  // ==========================================================================
  // CONTRACT 2: /run returns executionId
  // ==========================================================================
  describe('Contract 2: RunResponse shape', () => {
    it('should return correct RunResponse structure', async () => {
      const incident = createTestIncident('tenant-contract-2');
      incidentService['incidents'].set(incident.id, incident);

      const result = await playbookService.runPlaybook(
        testPlaybook.id,
        incident.id,
        {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'test-user',
        },
      );

      // Type assertion
      const response: RunResponse = result;

      // Required fields
      expect(response).toHaveProperty('ok');
      expect(response).toHaveProperty('executionId');
      expect(response).toHaveProperty('playbookId');
      expect(response).toHaveProperty('incidentId');
      expect(response).toHaveProperty('mode');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('auditId');
      expect(response).toHaveProperty('timestamp');

      // Type checks
      expect(typeof response.ok).toBe('boolean');
      expect(typeof response.executionId).toBe('string');
      expect(response.executionId.length).toBeGreaterThan(0);
      expect(['DRY_RUN', 'LIVE']).toContain(response.mode);
    });

    it('should include result object', async () => {
      const incident = createTestIncident('tenant-contract-2');
      incidentService['incidents'].set(incident.id, incident);

      const result = await playbookService.runPlaybook(
        testPlaybook.id,
        incident.id,
        {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'test-user',
        },
      );

      expect(result.result).toBeDefined();
      expect(result.result).toHaveProperty('result');
      expect(['SUCCESS', 'PARTIAL', 'FAILED']).toContain(result.result!.result);
    });
  });

  // ==========================================================================
  // CONTRACT 3: PlaybookListResponse shape
  // ==========================================================================
  describe('Contract 3: PlaybookListResponse shape', () => {
    it('should return correct list structure', async () => {
      const result = await playbookService.listPlaybooks({});

      // Type assertion
      const response: PlaybookListResponse = result;

      expect(response).toHaveProperty('playbooks');
      expect(response).toHaveProperty('total');
      expect(Array.isArray(response.playbooks)).toBe(true);
      expect(typeof response.total).toBe('number');
    });

    it('should include correct list item structure', async () => {
      const result = await playbookService.listPlaybooks({});

      expect(result.playbooks.length).toBeGreaterThan(0);
      
      const item = result.playbooks[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('version');
      expect(item).toHaveProperty('enabled');
      expect(item).toHaveProperty('mode');
      expect(item).toHaveProperty('state');
      expect(item).toHaveProperty('matchCriteria');
    });
  });

  // ==========================================================================
  // CONTRACT 4: PlaybookDetailResponse shape
  // ==========================================================================
  describe('Contract 4: PlaybookDetailResponse shape', () => {
    it('should return correct detail structure', async () => {
      const result = await playbookService.getPlaybook(testPlaybook.id);

      expect(result).not.toBeNull();
      
      // Type assertion
      const response: PlaybookDetailResponse = result!;

      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('name');
      expect(response).toHaveProperty('version');
      expect(response).toHaveProperty('description');
      expect(response).toHaveProperty('enabled');
      expect(response).toHaveProperty('mode');
      expect(response).toHaveProperty('state');
      expect(response).toHaveProperty('match');
      expect(response).toHaveProperty('actions');
      expect(response).toHaveProperty('guardrails');
      expect(response).toHaveProperty('stats');
    });

    it('should include actions breakdown', async () => {
      const result = await playbookService.getPlaybook(testPlaybook.id);

      expect(result!.actions).toHaveProperty('total');
      expect(result!.actions).toHaveProperty('notifications');
      expect(result!.actions).toHaveProperty('autoActions');
      expect(result!.actions).toHaveProperty('humanActions');
      expect(result!.actions).toHaveProperty('escalations');
    });

    it('should include stats', async () => {
      const result = await playbookService.getPlaybook(testPlaybook.id);

      expect(result!.stats).toHaveProperty('totalExecutions');
      expect(result!.stats).toHaveProperty('successfulExecutions');
      expect(result!.stats).toHaveProperty('failedExecutions');
      expect(result!.stats).toHaveProperty('activeLeases');
    });

    it('should return null for non-existent playbook', async () => {
      const result = await playbookService.getPlaybook('non-existent');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // CONTRACT 5: PlaybookStateResponse shape
  // ==========================================================================
  describe('Contract 5: PlaybookStateResponse shape', () => {
    it('should return correct state change structure', async () => {
      const result = await playbookService.enablePlaybook(testPlaybook.id, {
        userId: 'admin',
        tenantId: 'tenant-contract-5',
      });

      // Type assertion
      const response: PlaybookStateResponse = result;

      expect(response).toHaveProperty('ok');
      expect(response).toHaveProperty('playbookId');
      expect(response).toHaveProperty('previousState');
      expect(response).toHaveProperty('newState');
      expect(response).toHaveProperty('auditId');
      expect(response).toHaveProperty('timestamp');

      expect(typeof response.ok).toBe('boolean');
      expect(typeof response.auditId).toBe('string');
    });

    it('should include state objects', async () => {
      const result = await playbookService.disablePlaybook(testPlaybook.id, {
        userId: 'admin',
        tenantId: 'tenant-contract-5',
      });

      expect(result.previousState).toHaveProperty('enabled');
      expect(result.previousState).toHaveProperty('mode');
      expect(result.previousState).toHaveProperty('state');

      expect(result.newState).toHaveProperty('enabled');
      expect(result.newState).toHaveProperty('mode');
      expect(result.newState).toHaveProperty('state');
    });
  });

  // ==========================================================================
  // CONTRACT 6: HealthResponse shape
  // ==========================================================================
  describe('Contract 6: HealthResponse shape', () => {
    it('should return correct health structure', async () => {
      const result = await playbookService.getHealth();

      // Type assertion
      const response: HealthResponse = result;

      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('registry');
      expect(response).toHaveProperty('matcher');
      expect(response).toHaveProperty('escalation');
      expect(response).toHaveProperty('notification');
      expect(response).toHaveProperty('leases');
      expect(response).toHaveProperty('metrics');

      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.status);
    });

    it('should include notification channel status', async () => {
      const result = await playbookService.getHealth();

      expect(result.notification).toHaveProperty('channels');
      expect(result.notification.channels).toHaveProperty('console');
      expect(result.notification).toHaveProperty('retryQueue');
      expect(result.notification).toHaveProperty('deadLetter');
    });

    it('should include escalation status', async () => {
      const result = await playbookService.getHealth();

      expect(result.escalation).toHaveProperty('jobRunning');
      expect(result.escalation).toHaveProperty('pendingTimers');
      expect(result.escalation).toHaveProperty('executedLast24h');
    });
  });

  // ==========================================================================
  // CONTRACT 7: LeaseResponse shape
  // ==========================================================================
  describe('Contract 7: LeaseResponse shape', () => {
    it('should return correct lease structure', async () => {
      const incident = createTestIncident('tenant-contract-7');

      // Create a lease using correct API
      const action = testPlaybook.actions[1] as any;
      leaseManager.createLease(
        action,
        incident,
        { durationMs: 60000, autoRollback: true, rollbackAction: 'restore_cache_ttl' },
        'test-exec-id',
        { originalTtl: 1000 },
      );

      const result = await playbookService.getActiveLeases(incident.tenantId);

      expect(result.length).toBeGreaterThan(0);

      // Type assertion
      const response: LeaseResponse = result[0];

      expect(response).toHaveProperty('ok');
      expect(response).toHaveProperty('lease');
      expect(response.lease).toHaveProperty('id');
      expect(response.lease).toHaveProperty('actionId');
      expect(response.lease).toHaveProperty('incidentId');
      expect(response.lease).toHaveProperty('playbookId');
      expect(response.lease).toHaveProperty('tenantId');
      expect(response.lease).toHaveProperty('actionType');
      expect(response.lease).toHaveProperty('status');
      expect(response.lease).toHaveProperty('createdAt');
      expect(response.lease).toHaveProperty('expiresAt');
      expect(response.lease).toHaveProperty('remainingMs');
    });
  });

  // ==========================================================================
  // CONTRACT 8: AcknowledgeResponse shape
  // ==========================================================================
  describe('Contract 8: AcknowledgeResponse shape', () => {
    it('should return correct acknowledge structure', async () => {
      const incident = createTestIncident('tenant-contract-8');
      incidentService['incidents'].set(incident.id, incident);

      const result = await playbookService.acknowledgeIncident(incident.id, {
        userId: 'responder',
        note: 'Looking into it',
        tenantId: incident.tenantId,
      });

      // Type assertion
      const response: AcknowledgeResponse = result;

      expect(response).toHaveProperty('ok');
      expect(response).toHaveProperty('incidentId');
      expect(response).toHaveProperty('acknowledgedBy');
      expect(response).toHaveProperty('acknowledgedAt');
      expect(response).toHaveProperty('slaTimerStarted');
      expect(response).toHaveProperty('auditId');

      expect(typeof response.ok).toBe('boolean');
      expect(typeof response.acknowledgedBy).toBe('string');
      expect(typeof response.slaTimerStarted).toBe('boolean');
    });
  });

  // ==========================================================================
  // CONTRACT 9: ResolveResponse shape
  // ==========================================================================
  describe('Contract 9: ResolveResponse shape', () => {
    it('should return correct resolve structure', async () => {
      const incident = createTestIncident('tenant-contract-9');
      incidentService['incidents'].set(incident.id, incident);

      const result = await playbookService.resolveIncident(incident.id, {
        userId: 'resolver',
        resolutionNote: 'Fixed by scaling',
        tenantId: incident.tenantId,
      });

      // Type assertion
      const response: ResolveResponse = result;

      expect(response).toHaveProperty('ok');
      expect(response).toHaveProperty('incidentId');
      expect(response).toHaveProperty('resolvedBy');
      expect(response).toHaveProperty('resolvedAt');
      expect(response).toHaveProperty('resolutionNote');
      expect(response).toHaveProperty('escalationsCancelled');
      expect(response).toHaveProperty('leasesRevoked');
      expect(response).toHaveProperty('auditId');

      expect(typeof response.escalationsCancelled).toBe('number');
      expect(typeof response.leasesRevoked).toBe('number');
    });
  });

  // ==========================================================================
  // CONTRACT 10: Error response contract
  // ==========================================================================
  describe('Contract 10: Error responses', () => {
    it('should throw error for non-existent playbook', async () => {
      await expect(
        playbookService.runPlaybook('non-existent', 'incident-1', {
          mode: 'DRY_RUN',
          tenantId: 'tenant',
          userId: 'user',
        }),
      ).rejects.toThrow('Playbook non-existent not found');
    });

    it('should throw error for non-existent incident', async () => {
      await expect(
        playbookService.runPlaybook(testPlaybook.id, 'non-existent', {
          mode: 'DRY_RUN',
          tenantId: 'tenant',
          userId: 'user',
        }),
      ).rejects.toThrow('Incident non-existent not found');
    });

    it('should throw error for disabled playbook', async () => {
      await playbookService.disablePlaybook(testPlaybook.id, {
        userId: 'admin',
        tenantId: 'tenant',
      });

      const incident = createTestIncident('tenant-error');
      incidentService['incidents'].set(incident.id, incident);

      await expect(
        playbookService.runPlaybook(testPlaybook.id, incident.id, {
          mode: 'DRY_RUN',
          tenantId: incident.tenantId,
          userId: 'user',
        }),
      ).rejects.toThrow('is disabled');
    });
  });

  // ==========================================================================
  // CONTRACT 11: Audit response shape
  // ==========================================================================
  describe('Contract 11: Audit response shape', () => {
    it('should return correct audit structure', async () => {
      const incident = createTestIncident('tenant-contract-11');
      incidentService['incidents'].set(incident.id, incident);

      // Create some audit entries
      await playbookService.runPlaybook(testPlaybook.id, incident.id, {
        mode: 'DRY_RUN',
        tenantId: incident.tenantId,
        userId: 'test-user',
      });

      const result = await playbookService.getPlaybookAudit(testPlaybook.id, {
        tenantId: incident.tenantId,
        limit: 10,
      });

      expect(result).toHaveProperty('playbookId');
      expect(result).toHaveProperty('entries');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');

      expect(Array.isArray(result.entries)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');
    });
  });
});
