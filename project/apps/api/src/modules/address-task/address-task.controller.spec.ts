import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AddressTaskType } from '@prisma/client';
import { AddressTaskController } from './address-task.controller';
import { AddressTaskService } from './address-task.service';

/**
 * ASSIGN-1 — Controller tenant izolasyon davranışı.
 * - Tenant DAİMA auth context'ten gelir (@CurrentUser('tenantId')).
 * - body/query'de tenantId gelirse auth ile eşleşmeli; uyuşmazsa 403.
 * - Hiç gelmezse auth-tenant kullanılır.
 *
 * Not: JwtAuthGuard HTTP pipeline'ında çalışır; burada controller metodları
 * doğrudan çağrıldığı için guard tetiklenmez (tenant-resolve mantığı test edilir).
 */
const mockService = {
  getPendingTasksForCase: jest.fn(),
  getAllTasksForCase: jest.fn(),
  getNotesForCase: jest.fn(),
  getTasksByDebtor: jest.fn(),
  findOverdueTasks: jest.fn(),
  createTask: jest.fn(),
  triggerAddressWorkflowForCase: jest.fn(),
  updateTaskStatus: jest.fn(),
  completeTask: jest.fn(),
  cancelTask: jest.fn(),
  failTask: jest.fn(),
  confirmReceivedByOperator: jest.fn(),
  hasUsefulAddresses: jest.fn(),
  autoCompleteOnAddressReceived: jest.fn(),
};

const TASK_TYPE = 'CLIENT_REQUEST_DEBTOR_ADDRESSES' as AddressTaskType;

describe('AddressTaskController (ASSIGN-1 tenant isolation)', () => {
  let controller: AddressTaskController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressTaskController],
      providers: [{ provide: AddressTaskService, useValue: mockService }],
    }).compile();

    controller = module.get<AddressTaskController>(AddressTaskController);
    jest.clearAllMocks();
  });

  describe('tenant alınır: auth context', () => {
    it('getTasksForCase auth tenantId\'yi servise geçirir', async () => {
      mockService.getPendingTasksForCase.mockResolvedValue([]);

      await controller.getTasksForCase('tenant-A', 'case-1');

      expect(mockService.getPendingTasksForCase).toHaveBeenCalledWith('case-1', 'tenant-A');
    });

    it('completeTask auth tenantId\'yi sahiplik guard\'ı için servise geçirir', async () => {
      mockService.completeTask.mockResolvedValue({ id: 'task-1', status: 'DONE' });

      await controller.completeTask('tenant-A', 'task-1', { resultType: 'POSITIVE' as any });

      expect(mockService.completeTask).toHaveBeenCalledWith('task-1', expect.anything(), 'tenant-A');
    });
  });

  describe('body/query tenant uyuşmazlığı → 403', () => {
    it('createTask: body.tenantId != auth → ForbiddenException, servis çağrılmaz', async () => {
      await expect(
        controller.createTask('tenant-A', {
          tenantId: 'tenant-B',
          caseId: 'c',
          debtorId: 'd',
          taskType: TASK_TYPE,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockService.createTask).not.toHaveBeenCalled();
    });

    it('triggerAddressWorkflow: body.tenantId != auth → ForbiddenException', async () => {
      await expect(
        controller.triggerAddressWorkflow('tenant-A', 'case-1', { tenantId: 'tenant-B' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockService.triggerAddressWorkflowForCase).not.toHaveBeenCalled();
    });

    it('addressReceived: body.tenantId != auth → ForbiddenException', async () => {
      await expect(
        controller.addressReceived('tenant-A', 'case-1', 'debtor-1', {
          tenantId: 'tenant-B',
          source: 'CLIENT_REPLY',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockService.autoCompleteOnAddressReceived).not.toHaveBeenCalled();
    });

    it('getOverdueTasks: query tenantId != auth → ForbiddenException', async () => {
      await expect(controller.getOverdueTasks('tenant-A', 'tenant-B')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('tenantId verilmezse auth-tenant kullanılır', () => {
    it('createTask: body.tenantId yoksa auth-tenant ile oluşturur', async () => {
      mockService.createTask.mockResolvedValue({ id: 'task-1' });

      await controller.createTask('tenant-A', { caseId: 'c', debtorId: 'd', taskType: TASK_TYPE });

      expect(mockService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-A' }),
      );
    });

    it('createTask: eşleşen body.tenantId kabul edilir', async () => {
      mockService.createTask.mockResolvedValue({ id: 'task-1' });

      await controller.createTask('tenant-A', {
        tenantId: 'tenant-A',
        caseId: 'c',
        debtorId: 'd',
        taskType: TASK_TYPE,
      });

      expect(mockService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-A' }),
      );
    });

    it('getOverdueTasks: query tenantId yoksa auth-tenant kullanılır', async () => {
      mockService.findOverdueTasks.mockResolvedValue([]);

      await controller.getOverdueTasks('tenant-A');

      expect(mockService.findOverdueTasks).toHaveBeenCalledWith('tenant-A');
    });

    it('triggerAddressWorkflow: body.tenantId yoksa auth-tenant ile tetikler', async () => {
      mockService.triggerAddressWorkflowForCase.mockResolvedValue({ tasksCreated: 0 });

      await controller.triggerAddressWorkflow('tenant-A', 'case-1', {});

      expect(mockService.triggerAddressWorkflowForCase).toHaveBeenCalledWith('tenant-A', 'case-1');
    });
  });
});
