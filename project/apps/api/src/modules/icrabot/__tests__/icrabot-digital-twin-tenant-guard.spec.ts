/**
 * DBND-B1 — icrabot Digital Twin ailesi tenant isolation guard.
 *
 * Önce (bug): getDigitalTwin/getNextBestActions/getPendingTasks/getEvidenceReport
 * caseId'yi hiçbir tenant filtresi olmadan kabul ediyordu → cross-tenant IDOR
 * (başka tenant'ın borçlu/varlık/tebligat/tahsilat/kanıt verisi görüntülenebiliyordu).
 *
 * Şimdi: her 4 metod, alt servise delege etmeden önce assertCaseTenant() ile
 * caseId'nin çağıran tenant'a ait olduğunu doğruluyor; aksi halde NotFoundException.
 */
import { NotFoundException } from '@nestjs/common';
import { IcrabotService } from '../icrabot.service';

describe('DBND-B1 — IcrabotService Digital Twin tenant guard', () => {
  const TENANT = 't1';
  const CASE_ID = 'case-1';

  const build = (caseFound: boolean) => {
    const prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue(caseFound ? { id: CASE_ID } : null),
      },
    };
    const recipeService = {
      buildDigitalTwin: jest.fn().mockResolvedValue({ caseId: CASE_ID, nextActions: [] }),
      calculateNextBestActions: jest.fn().mockResolvedValue([{ recipeId: 'r1' }]),
    };
    const taskOrchestrator = {
      getPendingTasks: jest.fn().mockResolvedValue([{ id: 'task-1' }]),
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
});
