/**
 * ACT-08 — AddressTaskSchedulerService PASSIVE CaseDebtor defense-in-depth guard testleri.
 * Birincil koruma removeCaseDebtor'ın açık AddressTask'ları iptal etmesidir; bu testler yalnız
 * dar-pencere race'inde (deaktivasyon ile cron tick'i arasında) scheduler'ın kendi işlemesini
 * atladığını doğrular. Diğer cron davranışları (SLA/annual-refresh mantığının kendisi) bu
 * dosyanın kapsamı DIŞI — mevcut davranış korunur, yalnız guard eklenir.
 */

import { AddressTaskSchedulerService } from './address-task-scheduler.service';
import { AddressTaskFailureReason } from '@prisma/client';

function task(overrides: any = {}) {
  return {
    id: 'task-1',
    tenantId: 't1',
    caseId: 'case-1',
    debtorId: 'debtor-1',
    title: 'Adres talebi',
    ...overrides,
  };
}

function build(overrides: any = {}) {
  const addressTaskService: any = {
    findOverdueTasks: jest.fn().mockResolvedValue(overrides.overdueTasks || []),
    findTasksAtMaxAttempts: jest.fn().mockResolvedValue(overrides.tasksAtMax || []),
    incrementAttempt: jest.fn().mockResolvedValue(undefined),
    createTask: jest.fn().mockResolvedValue({ id: 'new-task-1' }),
    failTask: jest.fn().mockResolvedValue(undefined),
  };
  const prisma: any = {
    addressTask: {
      findMany: jest.fn().mockResolvedValue(overrides.annualTasks || []),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  const caseDebtorLifecycleGuard: any = {
    isPassiveByCaseAndDebtor: jest.fn().mockResolvedValue(overrides.isPassive ?? false),
  };
  const service = new AddressTaskSchedulerService(addressTaskService, prisma, caseDebtorLifecycleGuard);
  return { service, addressTaskService, prisma, caseDebtorLifecycleGuard };
}

describe('AddressTaskSchedulerService — ACT-08 PASSIVE guard', () => {
  describe('checkOverdueTasks', () => {
    it('pasif dosya borçlusu için hatırlatma atlanır (incrementAttempt çağrılmaz)', async () => {
      const { service, addressTaskService, caseDebtorLifecycleGuard } = build({
        overdueTasks: [task()],
        isPassive: true,
      });

      await service.checkOverdueTasks();

      expect(caseDebtorLifecycleGuard.isPassiveByCaseAndDebtor).toHaveBeenCalledWith('t1', 'case-1', 'debtor-1');
      expect(addressTaskService.incrementAttempt).not.toHaveBeenCalled();
    });

    it('aktif dosya borçlusu için hatırlatma normal şekilde ilerler (regresyon yok)', async () => {
      const { service, addressTaskService } = build({
        overdueTasks: [task()],
        isPassive: false,
      });

      await service.checkOverdueTasks();

      expect(addressTaskService.incrementAttempt).toHaveBeenCalledWith('task-1');
    });

    it('pasif dosya borçlusu için escalation (createTask+failTask) atlanır', async () => {
      const { service, addressTaskService } = build({
        tasksAtMax: [task()],
        isPassive: true,
      });

      await service.checkOverdueTasks();

      expect(addressTaskService.createTask).not.toHaveBeenCalled();
      expect(addressTaskService.failTask).not.toHaveBeenCalled();
    });

    it('aktif dosya borçlusu için escalation normal şekilde ilerler (regresyon yok)', async () => {
      const { service, addressTaskService } = build({
        tasksAtMax: [task()],
        isPassive: false,
      });

      await service.checkOverdueTasks();

      expect(addressTaskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1', caseId: 'case-1', debtorId: 'debtor-1', taskType: 'ASSIGN_MANUAL_CALL_CLIENT' }),
      );
      expect(addressTaskService.failTask).toHaveBeenCalledWith('task-1', AddressTaskFailureReason.SLA_EXCEEDED, expect.any(String));
    });
  });

  describe('checkAnnualRefreshTasks', () => {
    it('pasif dosya borçlusu için yıllık yenileme atlanır (createTask+update çağrılmaz)', async () => {
      const { service, addressTaskService, prisma } = build({
        annualTasks: [task()],
        isPassive: true,
      });

      await service.checkAnnualRefreshTasks();

      expect(addressTaskService.createTask).not.toHaveBeenCalled();
      expect(prisma.addressTask.update).not.toHaveBeenCalled();
    });

    it('aktif dosya borçlusu için yıllık yenileme normal şekilde ilerler (regresyon yok)', async () => {
      const { service, addressTaskService, prisma } = build({
        annualTasks: [task()],
        isPassive: false,
      });

      await service.checkAnnualRefreshTasks();

      expect(addressTaskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1', caseId: 'case-1', debtorId: 'debtor-1', taskType: 'CLIENT_REQUEST_DEBTOR_ADDRESSES' }),
      );
      expect(prisma.addressTask.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'task-1' } }),
      );
    });
  });
});
