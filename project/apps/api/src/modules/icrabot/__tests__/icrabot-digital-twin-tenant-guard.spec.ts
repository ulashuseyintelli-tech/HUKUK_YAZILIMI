/**
 * DBND-B1 / DBND-B1B / DBND-B1C — icrabot Digital Twin + state-machine + task
 * ailesi tenant isolation guard.
 *
 * Önce (bug): getDigitalTwin/getNextBestActions/getPendingTasks/getEvidenceReport
 * (DBND-B1), processEvent/getAvailableTransitions (DBND-B1B) ve
 * stopAutomation/cancelTask/approveTask (DBND-B1C) caseId/taskId'yi hiçbir tenant
 * filtresi olmadan kabul ediyordu → cross-tenant IDOR (başka tenant'ın
 * borçlu/varlık/tebligat/tahsilat/kanıt verisi görüntülenebiliyordu; processEvent
 * ve stopAutomation/cancelTask/approveTask ayrıca birer yazma yolu olduğundan
 * dosya aşaması/lifecycle geçmişi/bot görev durumu cross-tenant değiştirilebiliyordu).
 *
 * Şimdi: her metod, alt servise delege etmeden önce assertCaseTenant() (caseId
 * bazlı) veya assertTaskTenant() (taskId bazlı) ile ilgili kaynağın çağıran
 * tenant'a ait olduğunu doğruluyor; aksi halde NotFoundException.
 */
import { NotFoundException } from '@nestjs/common';
import { IcrabotService } from '../icrabot.service';

describe('DBND-B1 / DBND-B1B / DBND-B1C — IcrabotService tenant guard', () => {
  const TENANT = 't1';
  const CASE_ID = 'case-1';
  const TASK_ID = 'task-1';

  // `sameTenant=false` hem case.findFirst hem botTask.findFirst için "başka
  // tenant'a ait/bulunamadı" senaryosunu simüle eder (assertCaseTenant ve
  // assertTaskTenant aynı deseni paylaşıyor).
  const build = (sameTenant: boolean) => {
    const prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue(sameTenant ? { id: CASE_ID } : null),
        update: jest.fn().mockResolvedValue({}),
      },
      caseLifecycle: {
        create: jest.fn().mockResolvedValue({}),
      },
      botTask: {
        findFirst: jest.fn().mockResolvedValue(sameTenant ? { id: TASK_ID } : null),
        updateMany: jest.fn().mockResolvedValue({ count: sameTenant ? 1 : 0 }),
      },
    };
    const recipeService = {
      buildDigitalTwin: jest.fn().mockResolvedValue({
        caseId: CASE_ID,
        nextActions: [],
        stage: 'ACILIS',
        icraType: 'ILAMSIZ',
      }),
      calculateNextBestActions: jest.fn().mockResolvedValue([{ recipeId: 'r1' }]),
    };
    const taskOrchestrator = {
      getPendingTasks: jest.fn().mockResolvedValue([{ id: 'task-1' }]),
      enqueueTasks: jest.fn().mockResolvedValue([]),
      approveTask: jest.fn().mockResolvedValue({ id: TASK_ID, status: 'QUEUED' }),
      cancelTask: jest.fn().mockResolvedValue({ id: TASK_ID, status: 'CANCELLED' }),
    };
    const evidenceService = {
      generateEvidenceReport: jest.fn().mockResolvedValue({ totalEvidence: 0 }),
    };
    const svc = new IcrabotService(
      prisma as any,
      recipeService as any,
      taskOrchestrator as any,
      evidenceService as any,
    );
    return { svc, prisma, recipeService, taskOrchestrator, evidenceService };
  };

  it('assertCaseTenant her zaman id+tenantId ile scoped sorgu atar', async () => {
    const { svc, prisma } = build(true);
    await svc.getDigitalTwin(CASE_ID, TENANT);
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: CASE_ID, tenantId: TENANT },
      select: { id: true },
    });
  });

  describe('getDigitalTwin', () => {
    it('aynı tenant → twin döner, alt servisler çağrılır', async () => {
      const { svc, recipeService } = build(true);
      const result = await svc.getDigitalTwin(CASE_ID, TENANT);
      expect(recipeService.buildDigitalTwin).toHaveBeenCalledWith(CASE_ID);
      expect(recipeService.calculateNextBestActions).toHaveBeenCalledWith(CASE_ID);
      expect(result).toEqual(expect.objectContaining({ caseId: CASE_ID }));
    });

    it('başka tenant → NotFoundException, alt servisler HİÇ çağrılmaz', async () => {
      const { svc, recipeService } = build(false);
      await expect(svc.getDigitalTwin(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(recipeService.buildDigitalTwin).not.toHaveBeenCalled();
      expect(recipeService.calculateNextBestActions).not.toHaveBeenCalled();
    });
  });

  describe('getNextBestActions', () => {
    it('aynı tenant → aksiyonlar döner', async () => {
      const { svc, recipeService } = build(true);
      const result = await svc.getNextBestActions(CASE_ID, TENANT);
      expect(recipeService.calculateNextBestActions).toHaveBeenCalledWith(CASE_ID);
      expect(result).toEqual([{ recipeId: 'r1' }]);
    });

    it('başka tenant → NotFoundException, calculateNextBestActions çağrılmaz', async () => {
      const { svc, recipeService } = build(false);
      await expect(svc.getNextBestActions(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(recipeService.calculateNextBestActions).not.toHaveBeenCalled();
    });
  });

  describe('getPendingTasks', () => {
    it('aynı tenant → görevler döner', async () => {
      const { svc, taskOrchestrator } = build(true);
      const result = await svc.getPendingTasks(CASE_ID, TENANT);
      expect(taskOrchestrator.getPendingTasks).toHaveBeenCalledWith(CASE_ID);
      expect(result).toEqual([{ id: 'task-1' }]);
    });

    it('başka tenant → NotFoundException, taskOrchestrator.getPendingTasks çağrılmaz', async () => {
      const { svc, taskOrchestrator } = build(false);
      await expect(svc.getPendingTasks(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(taskOrchestrator.getPendingTasks).not.toHaveBeenCalled();
    });
  });

  describe('getEvidenceReport', () => {
    it('aynı tenant → kanıt raporu döner', async () => {
      const { svc, evidenceService } = build(true);
      const result = await svc.getEvidenceReport(CASE_ID, TENANT);
      expect(evidenceService.generateEvidenceReport).toHaveBeenCalledWith(CASE_ID);
      expect(result).toEqual({ totalEvidence: 0 });
    });

    it('başka tenant → NotFoundException, evidenceService.generateEvidenceReport çağrılmaz', async () => {
      const { svc, evidenceService } = build(false);
      await expect(svc.getEvidenceReport(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(evidenceService.generateEvidenceReport).not.toHaveBeenCalled();
    });
  });

  describe('processEvent (DBND-B1B — yazma yolu)', () => {
    it('aynı tenant → guard geçer, buildDigitalTwin çağrılır', async () => {
      const { svc, recipeService, prisma } = build(true);
      // Geçersiz bir event: StateMachine.transition null döner → yalnızca guard+twin
      // davranışını izole test eder, state-machine iş kuralını tekrar test etmez.
      const result = await svc.processEvent(CASE_ID, 'BOGUS_EVENT_XYZ' as any, TENANT);
      expect(recipeService.buildDigitalTwin).toHaveBeenCalledWith(CASE_ID);
      expect(result.success).toBe(false);
      expect(prisma.caseLifecycle.create).not.toHaveBeenCalled();
    });

    it('başka tenant → NotFoundException, buildDigitalTwin ve case.update HİÇ çağrılmaz', async () => {
      const { svc, recipeService, prisma } = build(false);
      await expect(
        svc.processEvent(CASE_ID, 'BOGUS_EVENT_XYZ' as any, TENANT),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(recipeService.buildDigitalTwin).not.toHaveBeenCalled();
      expect(prisma.caseLifecycle.create).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableTransitions (DBND-B1B)', () => {
    it('aynı tenant → guard geçer, geçişler döner', async () => {
      const { svc, recipeService } = build(true);
      const result = await svc.getAvailableTransitions(CASE_ID, TENANT);
      expect(recipeService.buildDigitalTwin).toHaveBeenCalledWith(CASE_ID);
      expect(result.currentStage).toBe('ACILIS');
    });

    it('başka tenant → NotFoundException, buildDigitalTwin çağrılmaz', async () => {
      const { svc, recipeService } = build(false);
      await expect(svc.getAvailableTransitions(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(recipeService.buildDigitalTwin).not.toHaveBeenCalled();
    });
  });

  describe('stopAutomation (DBND-B1C — yazma yolu, caseId+tenantId guard)', () => {
    it('aynı tenant → guard geçer, botTask.updateMany ve case.update çağrılır', async () => {
      const { svc, prisma } = build(true);
      await svc.stopAutomation(CASE_ID, TENANT);
      expect(prisma.case.findFirst).toHaveBeenCalledWith({
        where: { id: CASE_ID, tenantId: TENANT },
        select: { id: true },
      });
      expect(prisma.botTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ caseId: CASE_ID }) }),
      );
      expect(prisma.case.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CASE_ID } }),
      );
    });

    it('başka tenant → NotFoundException, botTask.updateMany ve case.update HİÇ çağrılmaz', async () => {
      const { svc, prisma } = build(false);
      await expect(svc.stopAutomation(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.botTask.updateMany).not.toHaveBeenCalled();
      expect(prisma.case.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelTask (DBND-B1C — yazma yolu, taskId+tenantId guard)', () => {
    it('aynı tenant → guard geçer, taskOrchestrator.cancelTask çağrılır', async () => {
      const { svc, prisma, taskOrchestrator } = build(true);
      await svc.cancelTask(TASK_ID, TENANT, 'test reason');
      expect(prisma.botTask.findFirst).toHaveBeenCalledWith({
        where: { id: TASK_ID, tenantId: TENANT },
        select: { id: true },
      });
      expect(taskOrchestrator.cancelTask).toHaveBeenCalledWith(TASK_ID, 'test reason');
    });

    it('başka tenant → NotFoundException, taskOrchestrator.cancelTask çağrılmaz', async () => {
      const { svc, taskOrchestrator } = build(false);
      await expect(svc.cancelTask(TASK_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(taskOrchestrator.cancelTask).not.toHaveBeenCalled();
    });
  });

  describe('approveTask (DBND-B1C — yazma yolu, taskId+tenantId guard)', () => {
    it('aynı tenant → guard geçer, taskOrchestrator.approveTask çağrılır', async () => {
      const { svc, prisma, taskOrchestrator } = build(true);
      await svc.approveTask(TASK_ID, TENANT, 'user-1');
      expect(prisma.botTask.findFirst).toHaveBeenCalledWith({
        where: { id: TASK_ID, tenantId: TENANT },
        select: { id: true },
      });
      expect(taskOrchestrator.approveTask).toHaveBeenCalledWith(TASK_ID, 'user-1');
    });

    it('başka tenant → NotFoundException, taskOrchestrator.approveTask çağrılmaz', async () => {
      const { svc, taskOrchestrator } = build(false);
      await expect(svc.approveTask(TASK_ID, TENANT, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(taskOrchestrator.approveTask).not.toHaveBeenCalled();
    });
  });
});
