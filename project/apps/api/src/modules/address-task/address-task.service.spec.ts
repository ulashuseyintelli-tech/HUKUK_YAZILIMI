import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fc from 'fast-check';
import { AddressTaskService } from './address-task.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientNotificationService } from '../client-notification/client-notification.service';
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import {
  AddressTaskType,
  AddressTaskResultType,
  AddressTaskFailureReason,
} from '@prisma/client';

// Mock PrismaService
const mockPrismaService = {
  addressTask: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  addressAuditLog: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  case: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  caseDebtor: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  debtor: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  debtorAddress: {
    count: jest.fn(),
  },
  client: {
    findUnique: jest.fn(),
  },
};

// Mock ClientNotificationService
const mockClientNotificationService = {
  sendEmail: jest.fn(),
};

const mockCaseDebtorLifecycleGuard = {
  assertActiveByCaseAndDebtor: jest.fn(),
};

describe('AddressTaskService', () => {
  let service: AddressTaskService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressTaskService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientNotificationService, useValue: mockClientNotificationService },
        { provide: CaseDebtorLifecycleGuardService, useValue: mockCaseDebtorLifecycleGuard },
      ],
    }).compile();

    service = module.get<AddressTaskService>(AddressTaskService);
    jest.clearAllMocks();
    mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor.mockResolvedValue({
      id: 'cd-1',
      caseId: 'case-1',
      debtorId: 'debtor-1',
      lifecycleStatus: 'ACTIVE',
    });
  });

  // ============================================================================
  // BASIC CRUD OPERATIONS
  // ============================================================================

  describe('createTask', () => {
    it('should create a new task when no duplicate exists', async () => {
      const params = {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
      };

      // ASSIGN-1: createTask artık caseId/debtorId tenant-ownership doğruluyor
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });
      mockPrismaService.addressTask.findFirst.mockResolvedValue(null);
      mockPrismaService.addressTask.create.mockResolvedValue({
        id: 'task-1',
        ...params,
        status: 'PENDING',
        attemptCount: 0,
        maxAttempts: 3,
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.createTask(params);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('task-1');
    });

    it('should return null when duplicate task exists', async () => {
      const params = {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
      };

      // ASSIGN-1: ownership guard önce çalışır (caseId/debtorId tenant'a ait olmalı)
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });
      mockPrismaService.addressTask.findFirst.mockResolvedValue({
        id: 'existing-task',
        ...params,
        status: 'PENDING',
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.createTask(params);

      expect(result).toBeNull();
    });

    // ── Veri bütünlüğü: CaseDebtor ilişki kontrolü (opt-in, controller risk yüzeyi) ──
    it('enforceCaseDebtorLink=true + borçlu bu dosyanın borçlusu değilse → BadRequestException', async () => {
      const params = {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
        enforceCaseDebtorLink: true,
      };

      // caseId+debtorId aynı tenant'ta (ASSIGN-1 guard geçer) ama CaseDebtor satırı YOK.
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });
      mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor.mockRejectedValueOnce(
        new NotFoundException('Dosya borçlusu bulunamadı.'),
      );

      await expect(service.createTask(params)).rejects.toBeInstanceOf(BadRequestException);

      // İlişki yoksa görev OLUŞTURULMAZ.
      expect(mockPrismaService.addressTask.create).not.toHaveBeenCalled();
    });

    it('enforceCaseDebtorLink=true + CaseDebtor ilişkisi varsa → görev oluşturulur', async () => {
      const params = {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
        enforceCaseDebtorLink: true,
      };

      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });
      mockPrismaService.caseDebtor.findFirst.mockResolvedValue({ id: 'cd-1' });
      mockPrismaService.addressTask.findFirst.mockResolvedValue(null);
      mockPrismaService.addressTask.create.mockResolvedValue({ id: 'task-1', ...params, status: 'PENDING' });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.createTask(params);

      expect(result?.id).toBe('task-1');
      expect(mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor).toHaveBeenCalledWith(
        'tenant-1',
        'case-1',
        'debtor-1',
      );
    });

    it('enforceCaseDebtorLink=true + passive CaseDebtor → task ve audit oluşturmadan bloklar', async () => {
      const params = {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
        enforceCaseDebtorLink: true,
      };

      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });
      mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor.mockRejectedValueOnce(
        new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.'),
      );

      await expect(service.createTask(params)).rejects.toBeInstanceOf(BadRequestException);

      expect(mockPrismaService.addressTask.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.addressTask.create).not.toHaveBeenCalled();
      expect(mockPrismaService.addressAuditLog.create).not.toHaveBeenCalled();
    });

    it('same debtor passive in one case but active in another case passes for the active membership', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-active' });
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });
      mockPrismaService.addressTask.findFirst.mockResolvedValue(null);
      mockPrismaService.addressTask.create.mockResolvedValue({
        id: 'task-active',
        tenantId: 'tenant-1',
        caseId: 'case-active',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES',
        status: 'PENDING',
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});
      mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor.mockImplementation(
        (_tenantId: string, caseId: string) => {
          if (caseId === 'case-passive') {
            return Promise.reject(new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.'));
          }
          return Promise.resolve({
            id: 'cd-active',
            caseId,
            debtorId: 'debtor-1',
            lifecycleStatus: 'ACTIVE',
          });
        },
      );

      await expect(
        service.createTask({
          tenantId: 'tenant-1',
          caseId: 'case-passive',
          debtorId: 'debtor-1',
          taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
          enforceCaseDebtorLink: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const activeResult = await service.createTask({
        tenantId: 'tenant-1',
        caseId: 'case-active',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
        enforceCaseDebtorLink: true,
      });

      expect(activeResult?.id).toBe('task-active');
      expect(mockPrismaService.addressTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ caseId: 'case-active', debtorId: 'debtor-1' }),
        }),
      );
    });

    it('bayrak GEÇİLMEZSE (iç çağrı) + CaseDebtor YOK olsa bile → görev oluşturulur (scheduler/workflow etkilenmez)', async () => {
      const params = {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        taskType: 'ASSIGN_MANUAL_CALL_CLIENT' as AddressTaskType,
        // enforceCaseDebtorLink yok → scheduler escalation/annual + triggerWorkflow yolu.
      };

      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });
      mockPrismaService.caseDebtor.findFirst.mockResolvedValue(null); // öksüz çift olsa bile
      mockPrismaService.addressTask.findFirst.mockResolvedValue(null);
      mockPrismaService.addressTask.create.mockResolvedValue({ id: 'task-2', ...params, status: 'PENDING' });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.createTask(params);

      expect(result?.id).toBe('task-2');
      // Bayrak yokken lifecycle guard HİÇ yapılmaz (scheduler/internal davranış korunur).
      expect(mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor).not.toHaveBeenCalled();
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status', async () => {
      mockPrismaService.addressTask.update.mockResolvedValue({
        id: 'task-1',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        status: 'IN_PROGRESS',
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.updateTaskStatus('task-1', 'IN_PROGRESS');

      expect(result.status).toBe('IN_PROGRESS');
    });
  });

  describe('completeTask', () => {
    it('should complete task with result type', async () => {
      mockPrismaService.addressTask.update.mockResolvedValue({
        id: 'task-1',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        status: 'DONE',
        resultType: 'POSITIVE',
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.completeTask('task-1', {
        resultType: 'POSITIVE' as AddressTaskResultType,
      });

      expect(result.status).toBe('DONE');
      expect(result.resultType).toBe('POSITIVE');
    });
  });

  describe('cancelTask', () => {
    it('should cancel task with reason', async () => {
      mockPrismaService.addressTask.update.mockResolvedValue({
        id: 'task-1',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        status: 'CANCELLED',
        cancellationReason: 'CASE_CLOSED',
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.cancelTask('task-1', 'CASE_CLOSED');

      expect(result.status).toBe('CANCELLED');
    });
  });

  // ============================================================================
  // PROPERTY 3: Task Idempotency
  // ============================================================================

  describe('Property 3: Task Idempotency', () => {
    it('same dedupe key should not create duplicate tasks', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            caseId: fc.uuid(),
            debtorId: fc.uuid(),
            taskType: fc.constantFrom(
              'CLIENT_REQUEST_DEBTOR_ADDRESSES',
              'CLIENT_REMIND_DEBTOR_ADDRESSES',
            ) as fc.Arbitrary<AddressTaskType>,
          }),
          async (params) => {
            // ASSIGN-1: ownership guard her iki createTask çağrısında da geçer (persistent mock)
            mockPrismaService.case.findFirst.mockResolvedValue({ id: params.caseId });
            mockPrismaService.debtor.findFirst.mockResolvedValue({ id: params.debtorId });
            mockPrismaService.addressTask.findFirst.mockResolvedValueOnce(null);
            mockPrismaService.addressTask.create.mockResolvedValueOnce({ id: 'task-1', ...params, status: 'PENDING' });
            mockPrismaService.addressAuditLog.create.mockResolvedValue({});

            const firstResult = await service.createTask(params);

            mockPrismaService.addressTask.findFirst.mockResolvedValueOnce({ id: 'task-1', ...params, status: 'PENDING' });

            const secondResult = await service.createTask(params);

            return firstResult !== null && secondResult === null;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  // ============================================================================
  // PROPERTY 7: SLA Reminder Mechanism
  // ============================================================================

  describe('Property 7: SLA Reminder Mechanism', () => {
    it('should find overdue tasks correctly', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockPrismaService.addressTask.findMany.mockResolvedValue([
        { id: 'task-1', status: 'WAITING_EXTERNAL', dueAt: pastDate, attemptCount: 1, maxAttempts: 3 },
      ]);

      const result = await service.findOverdueTasks();

      expect(result).toHaveLength(1);
    });

    it('should increment attempt count on reminder', async () => {
      mockPrismaService.addressTask.findUnique.mockResolvedValue({
        id: 'task-1',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        attemptCount: 1,
        maxAttempts: 3,
      });
      mockPrismaService.addressTask.update.mockResolvedValue({ attemptCount: 2 });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.incrementAttempt('task-1');

      expect(result.attemptCount).toBe(2);
    });
  });

  // ============================================================================
  // BYPASS & AUTO-COMPLETION
  // ============================================================================

  describe('hasUsefulAddresses', () => {
    it('should return true when useful addresses exist', async () => {
      mockPrismaService.debtorAddress.count.mockResolvedValue(2);
      const result = await service.hasUsefulAddresses('debtor-1');
      expect(result).toBe(true);
    });

    it('should return false when no useful addresses exist', async () => {
      mockPrismaService.debtorAddress.count.mockResolvedValue(0);
      const result = await service.hasUsefulAddresses('debtor-1');
      expect(result).toBe(false);
    });
  });

  describe('shouldBypassAddressRequest', () => {
    it('should bypass when CLIENT_CONFIRMED and has useful addresses', async () => {
      mockPrismaService.debtor.findFirst.mockResolvedValue({
        id: 'debtor-1',
        name: 'Test Debtor',
        addressIntakeMode: 'CLIENT_CONFIRMED',
      });
      mockPrismaService.debtorAddress.count.mockResolvedValue(1);

      const result = await service.shouldBypassAddressRequest('debtor-1');

      expect(result.bypass).toBe(true);
    });

    it('should not bypass when addressIntakeMode is UNKNOWN', async () => {
      mockPrismaService.debtor.findFirst.mockResolvedValue({
        id: 'debtor-1',
        name: 'Test Debtor',
        addressIntakeMode: 'UNKNOWN',
      });

      const result = await service.shouldBypassAddressRequest('debtor-1');

      expect(result.bypass).toBe(false);
    });
  });

  describe('autoCompleteOnAddressReceived', () => {
    it('should complete request task and cancel reminders', async () => {
      mockPrismaService.addressTask.findFirst.mockResolvedValue({
        id: 'task-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES',
        status: 'WAITING_EXTERNAL',
      });
      mockPrismaService.addressTask.update.mockResolvedValue({ status: 'DONE', resultType: 'POSITIVE' });
      mockPrismaService.addressTask.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.autoCompleteOnAddressReceived('tenant-1', 'case-1', 'debtor-1', 'CLIENT_REPLY');

      expect(result.tasksCompleted).toBe(1);
      expect(result.tasksCancelled).toBe(2);
    });
  });

  describe('confirmReceivedByOperator', () => {
    it('should complete task when operator confirms', async () => {
      // ASSIGN-1: confirmReceivedByOperator artık findFirst (tenant-scoped) kullanır
      mockPrismaService.addressTask.findFirst.mockResolvedValue({
        id: 'task-1',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        status: 'WAITING_EXTERNAL',
      });
      mockPrismaService.addressTask.update.mockResolvedValue({ status: 'DONE', resultType: 'POSITIVE' });
      mockPrismaService.addressTask.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.confirmReceivedByOperator('task-1', 'operator-1');

      expect(result.status).toBe('DONE');
    });
  });

  describe('PR-L6c passive guard scope for existing task closures', () => {
    it('complete/cancel/fail existing tasks without lifecycle guard', async () => {
      mockPrismaService.addressTask.update
        .mockResolvedValueOnce({
          id: 'task-complete',
          tenantId: 'tenant-1',
          caseId: 'case-1',
          debtorId: 'debtor-1',
          status: 'DONE',
          resultType: 'POSITIVE',
        })
        .mockResolvedValueOnce({
          id: 'task-cancel',
          tenantId: 'tenant-1',
          caseId: 'case-1',
          debtorId: 'debtor-1',
          status: 'CANCELLED',
          cancellationReason: 'CASE_CLOSED',
        })
        .mockResolvedValueOnce({
          id: 'task-fail',
          tenantId: 'tenant-1',
          caseId: 'case-1',
          debtorId: 'debtor-1',
          status: 'FAILED',
          failureReason: 'SLA_EXCEEDED',
        });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      await expect(
        service.completeTask('task-complete', { resultType: 'POSITIVE' as AddressTaskResultType }),
      ).resolves.toMatchObject({ status: 'DONE' });
      await expect(service.cancelTask('task-cancel', 'CASE_CLOSED')).resolves.toMatchObject({
        status: 'CANCELLED',
      });
      await expect(
        service.failTask('task-fail', AddressTaskFailureReason.SLA_EXCEEDED),
      ).resolves.toMatchObject({ status: 'FAILED' });

      expect(mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor).not.toHaveBeenCalled();
    });

    it('autoComplete and confirmReceived existing task closures do not require lifecycle guard', async () => {
      mockPrismaService.addressTask.findFirst
        .mockResolvedValueOnce({
          id: 'task-request',
          tenantId: 'tenant-1',
          caseId: 'case-1',
          debtorId: 'debtor-1',
          taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES',
          status: 'WAITING_EXTERNAL',
        })
        .mockResolvedValueOnce({
          id: 'task-confirm',
          tenantId: 'tenant-1',
          caseId: 'case-1',
          debtorId: 'debtor-1',
          status: 'WAITING_EXTERNAL',
        });
      mockPrismaService.addressTask.update
        .mockResolvedValueOnce({ status: 'DONE', resultType: 'POSITIVE' })
        .mockResolvedValueOnce({ status: 'DONE', resultType: 'POSITIVE' });
      mockPrismaService.addressTask.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      await expect(
        service.autoCompleteOnAddressReceived('tenant-1', 'case-1', 'debtor-1', 'CLIENT_REPLY'),
      ).resolves.toEqual({ tasksCompleted: 1, tasksCancelled: 0 });
      await expect(service.confirmReceivedByOperator('task-confirm', 'operator-1', 'tenant-1')).resolves.toMatchObject({
        status: 'DONE',
      });

      expect(mockCaseDebtorLifecycleGuard.assertActiveByCaseAndDebtor).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // WORKFLOW TRIGGERS
  // ============================================================================

  describe('triggerAddressWorkflowForCase', () => {
    it('should skip duplicate notifications within 5 minutes', async () => {
      // ASSIGN-1: case-ownership kontrolü artık önce çalışır → truthy olmalı
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1', caseClients: [] });
      mockPrismaService.addressAuditLog.findFirst.mockResolvedValue({
        id: 'log-1',
        action: 'CLIENT_NOTIFICATION_SENT',
        createdAt: new Date(),
      });

      const result = await service.triggerAddressWorkflowForCase('tenant-1', 'case-1');

      expect(result.skippedDuplicate).toBe(true);
    });

    it('workflow mixed active/passive case debtors creates task only for active membership', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1', fileNumber: 'F1', caseClients: [] });
      mockPrismaService.addressAuditLog.findFirst.mockResolvedValue(null);
      mockPrismaService.caseDebtor.findMany.mockResolvedValue([
        {
          id: 'cd-active',
          caseId: 'case-1',
          debtorId: 'debtor-active',
          lifecycleStatus: 'ACTIVE',
          debtor: { id: 'debtor-active', name: 'Active Debtor', type: 'INDIVIDUAL' },
        },
        {
          id: 'cd-passive',
          caseId: 'case-1',
          debtorId: 'debtor-passive',
          lifecycleStatus: 'PASSIVE',
          debtor: { id: 'debtor-passive', name: 'Passive Debtor', type: 'INDIVIDUAL' },
        },
      ]);
      mockPrismaService.debtor.findFirst.mockResolvedValue({
        id: 'debtor-active',
        name: 'Active Debtor',
        addressIntakeMode: 'UNKNOWN',
      });
      mockPrismaService.addressTask.findFirst.mockResolvedValue(null);
      mockPrismaService.addressTask.create.mockResolvedValue({
        id: 'task-active',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-active',
        taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES',
        status: 'PENDING',
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.triggerAddressWorkflowForCase('tenant-1', 'case-1');

      expect(result.tasksCreated).toBe(1);
      expect(result.debtorsProcessed).toBe(2);
      expect(mockPrismaService.addressTask.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.addressTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ debtorId: 'debtor-active' }),
        }),
      );
      expect(mockPrismaService.addressTask.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ debtorId: 'debtor-passive' }),
        }),
      );
    });
  });

  describe('cancelAllPendingTasksForCase', () => {
    it('should cancel all pending tasks when case is closed', async () => {
      mockPrismaService.addressTask.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.cancelAllPendingTasksForCase('case-1');

      expect(result).toBe(3);
    });
  });

  // ============================================================================
  // TASK 7: Communication Channel Selection
  // ============================================================================

  describe('selectCommunicationChannel', () => {
    it('should return EMAIL when only email is available', () => {
      const result = service.selectCommunicationChannel({ hasEmail: true, hasWhatsApp: false, hasSms: false });
      expect(result).toBe('EMAIL');
    });

    it('should return WHATSAPP when only whatsapp is available', () => {
      const result = service.selectCommunicationChannel({ hasEmail: false, hasWhatsApp: true, hasSms: false });
      expect(result).toBe('WHATSAPP');
    });

    it('should return SMS when only sms is available', () => {
      const result = service.selectCommunicationChannel({ hasEmail: false, hasWhatsApp: false, hasSms: true });
      expect(result).toBe('SMS');
    });

    it('should return BOTH when email and whatsapp are available', () => {
      const result = service.selectCommunicationChannel({ hasEmail: true, hasWhatsApp: true, hasSms: true });
      expect(result).toBe('BOTH');
    });

    it('should return NONE when no channels are available', () => {
      const result = service.selectCommunicationChannel({ hasEmail: false, hasWhatsApp: false, hasSms: false });
      expect(result).toBe('NONE');
    });
  });

  /**
   * Property 6: Channel Selection Logic
   */
  describe('Property 6: Channel Selection Logic', () => {
    it('should select correct channel for all combinations', () => {
      fc.assert(
        fc.property(
          fc.record({ hasEmail: fc.boolean(), hasWhatsApp: fc.boolean(), hasSms: fc.boolean() }),
          (channels) => {
            const result = service.selectCommunicationChannel(channels);

            if (channels.hasEmail && channels.hasWhatsApp) return result === 'BOTH';
            if (channels.hasEmail) return result === 'EMAIL';
            if (channels.hasWhatsApp) return result === 'WHATSAPP';
            if (channels.hasSms) return result === 'SMS';
            return result === 'NONE';
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should always return a valid channel type', () => {
      fc.assert(
        fc.property(
          fc.record({ hasEmail: fc.boolean(), hasWhatsApp: fc.boolean(), hasSms: fc.boolean() }),
          (channels) => {
            const result = service.selectCommunicationChannel(channels);
            return ['EMAIL', 'WHATSAPP', 'SMS', 'BOTH', 'NONE'].includes(result);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('getClientContactChannels', () => {
    it('should return correct channels when client has email', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue({
        id: 'client-1',
        email: 'test@example.com',
        phone: null,
        contacts: [],
      });

      const result = await service.getClientContactChannels('client-1');

      expect(result.hasEmail).toBe(true);
      expect(result.hasWhatsApp).toBe(false);
      expect(result.preferredChannel).toBe('EMAIL');
    });

    it('should return correct channels when client has phone', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue({
        id: 'client-1',
        email: null,
        phone: '5551234567',
        contacts: [],
      });

      const result = await service.getClientContactChannels('client-1');

      expect(result.hasEmail).toBe(false);
      expect(result.hasWhatsApp).toBe(true);
      expect(result.preferredChannel).toBe('WHATSAPP');
    });

    it('should return BOTH when client has email and phone', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue({
        id: 'client-1',
        email: 'test@example.com',
        phone: '5551234567',
        contacts: [],
      });

      const result = await service.getClientContactChannels('client-1');

      expect(result.hasEmail).toBe(true);
      expect(result.hasWhatsApp).toBe(true);
      expect(result.preferredChannel).toBe('BOTH');
    });

    it('should return NONE when client has no contact info', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue({
        id: 'client-1',
        email: null,
        phone: null,
        contacts: [],
      });

      const result = await service.getClientContactChannels('client-1');

      expect(result.preferredChannel).toBe('NONE');
    });

    it('should return NONE when client not found', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue(null);

      const result = await service.getClientContactChannels('non-existent');

      expect(result.preferredChannel).toBe('NONE');
    });
  });

  // ============================================================================
  // ASSIGN-1: TENANT ISOLATION
  // ============================================================================

  describe('ASSIGN-1: tenant isolation', () => {
    it('getPendingTasksForCase scopes query by tenant when tenantId provided', async () => {
      mockPrismaService.addressTask.findMany.mockResolvedValue([]);

      await service.getPendingTasksForCase('case-1', 'tenant-1');

      expect(mockPrismaService.addressTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', caseId: 'case-1' }),
        }),
      );
    });

    it('completeTask rejects a task from another tenant (ownership guard → NotFound)', async () => {
      mockPrismaService.addressTask.findFirst.mockResolvedValue(null); // sahiplik kontrolü başarısız

      await expect(
        service.completeTask('task-x', { resultType: 'POSITIVE' as AddressTaskResultType }, 'tenant-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.addressTask.update).not.toHaveBeenCalled();
    });

    it('completeTask proceeds when the task belongs to the tenant', async () => {
      mockPrismaService.addressTask.findFirst.mockResolvedValue({ id: 'task-1' }); // sahiplik OK
      mockPrismaService.addressTask.update.mockResolvedValue({
        id: 'task-1',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        status: 'DONE',
        resultType: 'POSITIVE',
      });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.completeTask(
        'task-1',
        { resultType: 'POSITIVE' as AddressTaskResultType },
        'tenant-1',
      );

      expect(result.status).toBe('DONE');
    });

    it('autoCompleteOnAddressReceived scopes both lookups by tenant', async () => {
      mockPrismaService.addressTask.findFirst.mockResolvedValue(null);
      mockPrismaService.addressTask.updateMany.mockResolvedValue({ count: 0 });

      await service.autoCompleteOnAddressReceived('tenant-1', 'case-1', 'debtor-1', 'CLIENT_REPLY');

      expect(mockPrismaService.addressTask.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }),
      );
      expect(mockPrismaService.addressTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }),
      );
    });

    it('hasUsefulAddresses scopes by tenant via debtor relation', async () => {
      mockPrismaService.debtorAddress.count.mockResolvedValue(0);

      await service.hasUsefulAddresses('debtor-1', 'tenant-1');

      expect(mockPrismaService.debtorAddress.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ debtorId: 'debtor-1', debtor: { tenantId: 'tenant-1' } }),
        }),
      );
    });

    it('triggerAddressWorkflowForCase scopes case lookup by tenant', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(null); // bu tenant'ta dosya yok

      await expect(
        service.triggerAddressWorkflowForCase('tenant-1', 'case-x'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-x', tenantId: 'tenant-1' } }),
      );
      // ASSIGN-1 blocker #2: yabancı case için recent-audit oracle ÇALIŞMAMALI (leak engeli)
      expect(mockPrismaService.addressAuditLog.findFirst).not.toHaveBeenCalled();
    });

    it('omitting tenantId keeps system-context behavior (scheduler path, no tenant filter)', async () => {
      mockPrismaService.addressTask.findMany.mockResolvedValue([]);

      await service.getPendingTasksForCase('case-1');

      const callArg = mockPrismaService.addressTask.findMany.mock.calls[0][0];
      expect(callArg.where.tenantId).toBeUndefined();
    });

    // ------------------------------------------------------------------------
    // ASSIGN-1 blocker hardening (Codex review-only bulguları)
    // ------------------------------------------------------------------------

    it('(a) createTask cross-tenant caseId reddedilir (NotFound, create yok)', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue(null); // case başka tenant'ta
      mockPrismaService.debtor.findFirst.mockResolvedValue({ id: 'debtor-1' });

      await expect(
        service.createTask({
          tenantId: 'tenant-1',
          caseId: 'foreign-case',
          debtorId: 'debtor-1',
          taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.addressTask.create).not.toHaveBeenCalled();
    });

    it('(a) createTask cross-tenant debtorId reddedilir (NotFound, create yok)', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrismaService.debtor.findFirst.mockResolvedValue(null); // debtor başka tenant'ta

      await expect(
        service.createTask({
          tenantId: 'tenant-1',
          caseId: 'case-1',
          debtorId: 'foreign-debtor',
          taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.addressTask.create).not.toHaveBeenCalled();
    });

    it('(b) triggerAddressWorkflowForCase recent-audit sorgusu tenant-scoped (cross-tenant skippedDuplicate sızdırmaz)', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1', fileNumber: 'F1', caseClients: [] });
      mockPrismaService.addressAuditLog.findFirst.mockResolvedValue(null); // tenant-scoped → foreign audit eşleşmez
      mockPrismaService.caseDebtor.findMany.mockResolvedValue([]);
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      const result = await service.triggerAddressWorkflowForCase('tenant-1', 'case-1');

      expect(mockPrismaService.addressAuditLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', caseId: 'case-1' }) }),
      );
      expect(result.skippedDuplicate).toBeUndefined(); // foreign audit eşleşmedi → skip YOK
    });

    it('(c) shouldBypassAddressRequest debtor + hasUseful tenant-scope kullanır', async () => {
      mockPrismaService.debtor.findFirst.mockResolvedValue({ addressIntakeMode: 'CLIENT_CONFIRMED', name: 'X' });
      mockPrismaService.debtorAddress.count.mockResolvedValue(1);

      const result = await service.shouldBypassAddressRequest('debtor-1', 'tenant-1');

      expect(result.bypass).toBe(true);
      expect(mockPrismaService.debtor.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'debtor-1', tenantId: 'tenant-1' }) }),
      );
      expect(mockPrismaService.debtorAddress.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ debtor: { tenantId: 'tenant-1' } }) }),
      );
    });

    it('(c) workflow caseDebtor sorgusu case relation ile tenant-scoped', async () => {
      mockPrismaService.case.findFirst.mockResolvedValue({ id: 'case-1', caseClients: [] });
      mockPrismaService.addressAuditLog.findFirst.mockResolvedValue(null);
      mockPrismaService.caseDebtor.findMany.mockResolvedValue([]);
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      await service.triggerAddressWorkflowForCase('tenant-1', 'case-1');

      expect(mockPrismaService.caseDebtor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ caseId: 'case-1', case: { tenantId: 'tenant-1' } }) }),
      );
    });

    it('(d) confirmReceivedByOperator reminder updateMany tenant-scoped', async () => {
      mockPrismaService.addressTask.findFirst.mockResolvedValue({
        id: 'task-1',
        tenantId: 'tenant-1',
        caseId: 'case-1',
        debtorId: 'debtor-1',
        status: 'WAITING_EXTERNAL',
      });
      mockPrismaService.addressTask.update.mockResolvedValue({ status: 'DONE', resultType: 'POSITIVE' });
      mockPrismaService.addressTask.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.addressAuditLog.create.mockResolvedValue({});

      await service.confirmReceivedByOperator('task-1', 'operator-1', 'tenant-1');

      expect(mockPrismaService.addressTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', taskType: 'CLIENT_REMIND_DEBTOR_ADDRESSES' }),
        }),
      );
    });
  });
});
