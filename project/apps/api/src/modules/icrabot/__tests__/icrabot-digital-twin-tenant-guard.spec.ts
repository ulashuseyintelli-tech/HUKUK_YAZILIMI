/**
 * DBND-B1 / DBND-B1B / DBND-B1C - icrabot tenant isolation guard.
 *
 * Digital-twin reads and state-machine/task write paths must prove ownership
 * before reading debtor/case-derived data or mutating workflow/task state.
 */
import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IcrabotController } from '../icrabot.controller';
import { EvidenceService } from '../evidence.service';
import { IcrabotService } from '../icrabot.service';
import { RecipeService } from '../recipe.service';
import { TaskOrchestratorService } from '../task-orchestrator.service';

const TENANT = 'tenant-a';
const CASE_ID = 'case-a';
const TASK_ID = 'task-a';

const makeTwin = () => ({
  caseId: CASE_ID,
  tenantId: TENANT,
  stage: 'KAPANIS',
  icraType: 'ILAMSIZ',
  lastSyncAt: new Date('2026-01-01T00:00:00.000Z'),
  nextActions: [],
  evidence: {},
  finalization: { isCandidate: false, isFinalized: false },
  assetProfile: { hasAssets: false, assetTypes: [] },
});

const makeIcrabotService = (sameTenant: boolean) => {
  const prisma = {
    case: {
      findFirst: jest.fn().mockResolvedValue(sameTenant ? { id: CASE_ID } : null),
      update: jest.fn().mockResolvedValue({ id: CASE_ID }),
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
    buildDigitalTwin: jest.fn().mockResolvedValue(makeTwin()),
    calculateNextBestActions: jest.fn().mockResolvedValue([
      { recipeId: 'r1', recipeName: 'Recipe 1', canAutoExecute: true },
    ]),
  };
  const taskOrchestrator = {
    getPendingTasks: jest.fn().mockResolvedValue([{ id: TASK_ID }]),
    enqueueTasks: jest.fn().mockResolvedValue([{ id: TASK_ID }]),
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

describe('DBND-BLOCKER-1 icrabot tenant isolation', () => {
  describe('IcrabotController', () => {
    it('keeps JwtAuthGuard on the controller', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, IcrabotController);
      expect(guards).toContain(JwtAuthGuard);
    });

    it('passes req.user.tenantId to the four digital-twin read endpoints', async () => {
      const service = {
        getDigitalTwin: jest.fn().mockResolvedValue({}),
        getNextBestActions: jest.fn().mockResolvedValue([]),
        getPendingTasks: jest.fn().mockResolvedValue([]),
        getEvidenceReport: jest.fn().mockResolvedValue({}),
      };
      const controller = new IcrabotController(service as any);
      const req = { user: { tenantId: TENANT } };

      await controller.getDigitalTwin(CASE_ID, req);
      await controller.getNextBestActions(CASE_ID, req);
      await controller.getPendingTasks(CASE_ID, req);
      await controller.getEvidenceReport(CASE_ID, req);

      expect(service.getDigitalTwin).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(service.getNextBestActions).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(service.getPendingTasks).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(service.getEvidenceReport).toHaveBeenCalledWith(CASE_ID, TENANT);
    });
  });

  describe('IcrabotService endpoint boundary', () => {
    it('same tenant succeeds and delegates with tenantId', async () => {
      const { svc, prisma, recipeService, taskOrchestrator, evidenceService } = makeIcrabotService(true);

      await expect(svc.getDigitalTwin(CASE_ID, TENANT)).resolves.toEqual(expect.objectContaining({ caseId: CASE_ID }));
      await expect(svc.getNextBestActions(CASE_ID, TENANT)).resolves.toEqual(expect.any(Array));
      await expect(svc.getPendingTasks(CASE_ID, TENANT)).resolves.toEqual([{ id: TASK_ID }]);
      await expect(svc.getEvidenceReport(CASE_ID, TENANT)).resolves.toEqual({ totalEvidence: 0 });

      expect(prisma.case.findFirst).toHaveBeenCalledWith({
        where: { id: CASE_ID, tenantId: TENANT },
        select: { id: true },
      });
      expect(recipeService.buildDigitalTwin).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(recipeService.calculateNextBestActions).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(taskOrchestrator.getPendingTasks).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(evidenceService.generateEvidenceReport).toHaveBeenCalledWith(CASE_ID, TENANT);
    });

    it('foreign tenant gets 404 before any read delegate runs', async () => {
      const { svc, recipeService, taskOrchestrator, evidenceService } = makeIcrabotService(false);

      await expect(svc.getDigitalTwin(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getNextBestActions(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getPendingTasks(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getEvidenceReport(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);

      expect(recipeService.buildDigitalTwin).not.toHaveBeenCalled();
      expect(recipeService.calculateNextBestActions).not.toHaveBeenCalled();
      expect(taskOrchestrator.getPendingTasks).not.toHaveBeenCalled();
      expect(evidenceService.generateEvidenceReport).not.toHaveBeenCalled();
    });

    it('startAutomation threads tenantId and enqueues only for owned cases', async () => {
      const { svc, recipeService, taskOrchestrator, prisma } = makeIcrabotService(true);

      await expect(svc.startAutomation(CASE_ID, TENANT)).resolves.toEqual({
        tasksEnqueued: 1,
        tasks: ['Recipe 1'],
      });

      expect(recipeService.calculateNextBestActions).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(taskOrchestrator.enqueueTasks).toHaveBeenCalledWith(['r1'], CASE_ID, TENANT);
      expect(prisma.case.update).toHaveBeenCalledWith({
        where: { id: CASE_ID },
        data: { isAutomationEnabled: true, isAutoMode: true },
      });
    });

    it('startAutomation on a foreign case returns 404 and does not enqueue', async () => {
      const { svc, recipeService, taskOrchestrator, prisma } = makeIcrabotService(false);

      await expect(svc.startAutomation(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);

      expect(recipeService.calculateNextBestActions).not.toHaveBeenCalled();
      expect(taskOrchestrator.enqueueTasks).not.toHaveBeenCalled();
      expect(prisma.case.update).not.toHaveBeenCalled();
    });
  });

  describe('RecipeService', () => {
    it('buildDigitalTwin reads Case by id plus tenantId', async () => {
      const caseData = {
        id: CASE_ID,
        tenantId: TENANT,
        executionFileNumber: '2026/1',
        uyapBirimKodu: null,
        workflowStage: 'INITIAL',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        tebligatlar: [],
        debtors: [],
        collections: [],
        lifecycleEvents: [],
      };
      const prisma = { case: { findFirst: jest.fn().mockResolvedValue(caseData) } };
      const svc = new RecipeService(prisma as any);

      await expect(svc.buildDigitalTwin(CASE_ID, TENANT)).resolves.toEqual(expect.objectContaining({
        caseId: CASE_ID,
        tenantId: TENANT,
      }));
      expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: CASE_ID, tenantId: TENANT },
      }));
    });

    it('buildDigitalTwin cannot read a foreign case', async () => {
      const prisma = { case: { findFirst: jest.fn().mockResolvedValue(null) } };
      const svc = new RecipeService(prisma as any);

      await expect(svc.buildDigitalTwin(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('calculateNextBestActions carries tenantId into buildDigitalTwin', async () => {
      const svc = new RecipeService({} as any);
      const buildDigitalTwin = jest.spyOn(svc, 'buildDigitalTwin').mockResolvedValue(makeTwin() as any);
      jest.spyOn(svc as any, 'evaluatePreconditions').mockResolvedValue(false);

      await svc.calculateNextBestActions(CASE_ID, TENANT);

      expect(buildDigitalTwin).toHaveBeenCalledWith(CASE_ID, TENANT);
    });
  });

  describe('TaskOrchestratorService', () => {
    it('getPendingTasks includes tenantId in the query', async () => {
      const prisma = { botTask: { findMany: jest.fn().mockResolvedValue([]) } };
      const svc = new TaskOrchestratorService(prisma as any, {} as any, {} as any);

      await svc.getPendingTasks(CASE_ID, TENANT);

      expect(prisma.botTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          caseId: CASE_ID,
          tenantId: TENANT,
          status: { in: ['PENDING', 'QUEUED', 'NEEDS_APPROVAL'] },
        },
      }));
    });
  });

  describe('EvidenceService', () => {
    it('generateEvidenceReport checks case ownership before reading evidence', async () => {
      const prisma = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: CASE_ID }) },
        botEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const svc = new EvidenceService(prisma as any);

      await expect(svc.generateEvidenceReport(CASE_ID, TENANT)).resolves.toEqual(expect.objectContaining({
        caseId: CASE_ID,
        totalEvidence: 0,
      }));
      expect(prisma.case.findFirst).toHaveBeenCalledWith({
        where: { id: CASE_ID, tenantId: TENANT },
        select: { id: true },
      });
      expect(prisma.botEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { caseId: CASE_ID },
      }));
    });

    it('generateEvidenceReport does not query evidence for a foreign case', async () => {
      const prisma = {
        case: { findFirst: jest.fn().mockResolvedValue(null) },
        botEvidence: { findMany: jest.fn() },
      };
      const svc = new EvidenceService(prisma as any);

      await expect(svc.generateEvidenceReport(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.botEvidence.findMany).not.toHaveBeenCalled();
    });
  });

  describe('processEvent (DBND-B1B write path)', () => {
    it('same tenant passes guard and builds twin with tenantId', async () => {
      const { svc, recipeService, prisma } = makeIcrabotService(true);

      const result = await svc.processEvent(CASE_ID, 'BOGUS_EVENT_XYZ' as any, TENANT);

      expect(recipeService.buildDigitalTwin).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(result.success).toBe(false);
      expect(prisma.caseLifecycle.create).not.toHaveBeenCalled();
    });

    it('foreign tenant returns 404 before buildDigitalTwin or writes', async () => {
      const { svc, recipeService, prisma } = makeIcrabotService(false);

      await expect(svc.processEvent(CASE_ID, 'BOGUS_EVENT_XYZ' as any, TENANT)).rejects.toBeInstanceOf(NotFoundException);

      expect(recipeService.buildDigitalTwin).not.toHaveBeenCalled();
      expect(prisma.case.update).not.toHaveBeenCalled();
      expect(prisma.caseLifecycle.create).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableTransitions (DBND-B1B)', () => {
    it('same tenant passes guard and builds twin with tenantId', async () => {
      const { svc, recipeService } = makeIcrabotService(true);

      const result = await svc.getAvailableTransitions(CASE_ID, TENANT);

      expect(recipeService.buildDigitalTwin).toHaveBeenCalledWith(CASE_ID, TENANT);
      expect(result.currentStage).toBe('KAPANIS');
    });

    it('foreign tenant returns 404 before buildDigitalTwin', async () => {
      const { svc, recipeService } = makeIcrabotService(false);

      await expect(svc.getAvailableTransitions(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);

      expect(recipeService.buildDigitalTwin).not.toHaveBeenCalled();
    });
  });

  describe('stopAutomation (DBND-B1C write path)', () => {
    it('same tenant passes guard and updates case automation state', async () => {
      const { svc, prisma } = makeIcrabotService(true);

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

    it('foreign tenant returns 404 before botTask.updateMany or case.update', async () => {
      const { svc, prisma } = makeIcrabotService(false);

      await expect(svc.stopAutomation(CASE_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.botTask.updateMany).not.toHaveBeenCalled();
      expect(prisma.case.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelTask (DBND-B1C task write path)', () => {
    it('same tenant passes task guard and delegates cancel', async () => {
      const { svc, prisma, taskOrchestrator } = makeIcrabotService(true);

      await svc.cancelTask(TASK_ID, TENANT, 'test reason');

      expect(prisma.botTask.findFirst).toHaveBeenCalledWith({
        where: { id: TASK_ID, tenantId: TENANT },
        select: { id: true },
      });
      expect(taskOrchestrator.cancelTask).toHaveBeenCalledWith(TASK_ID, 'test reason');
    });

    it('foreign tenant returns 404 before cancel delegate', async () => {
      const { svc, taskOrchestrator } = makeIcrabotService(false);

      await expect(svc.cancelTask(TASK_ID, TENANT)).rejects.toBeInstanceOf(NotFoundException);

      expect(taskOrchestrator.cancelTask).not.toHaveBeenCalled();
    });
  });

  describe('approveTask (DBND-B1C task write path)', () => {
    it('same tenant passes task guard and delegates approve', async () => {
      const { svc, prisma, taskOrchestrator } = makeIcrabotService(true);

      await svc.approveTask(TASK_ID, TENANT, 'user-1');

      expect(prisma.botTask.findFirst).toHaveBeenCalledWith({
        where: { id: TASK_ID, tenantId: TENANT },
        select: { id: true },
      });
      expect(taskOrchestrator.approveTask).toHaveBeenCalledWith(TASK_ID, 'user-1');
    });

    it('foreign tenant returns 404 before approve delegate', async () => {
      const { svc, taskOrchestrator } = makeIcrabotService(false);

      await expect(svc.approveTask(TASK_ID, TENANT, 'user-1')).rejects.toBeInstanceOf(NotFoundException);

      expect(taskOrchestrator.approveTask).not.toHaveBeenCalled();
    });
  });
});