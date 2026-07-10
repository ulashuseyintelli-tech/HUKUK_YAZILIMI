import { NotFoundException } from '@nestjs/common';
import { RiskService } from './risk.service';

/**
 * P0 — Tenant boundary hardening (risk.service.ts).
 *
 * Açık: analyzeCase/getLatestReport/getReportHistory tenantId almadan caseId ile
 * sorgu yapıyordu → başka tenant'ın dosya risk analizi/raporu okunabiliyordu.
 * Bu suite (a) cross-tenant caseId'nin reddedildiğini, (b) case sorgusunun
 * tenant-scoped olduğunu, (c) reddedilince yazma yan etkisinin (riskReport.create)
 * hiç tetiklenmediğini doğrular.
 *
 * Saf birim test (DB yok): prisma mock'lanır.
 */
describe('RiskService — tenant boundary', () => {
  function makeCaseData() {
    return {
      id: 'case-A',
      principalAmount: 100000,
      workflowStage: 'INITIAL',
      createdAt: new Date(),
      collections: [],
      debtors: [],
      enforcementActions: [],
      lifecycleEvents: [],
      notifications: [],
    };
  }

  function makePrisma() {
    return {
      case: { findFirst: jest.fn(), findMany: jest.fn() },
      riskReport: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    } as any;
  }

  describe('analyzeCase', () => {
    it('NEGATIF: başka tenant caseId → NotFoundException + tenant-scoped sorgu + riskReport.create YOK', async () => {
      const prisma = makePrisma();
      prisma.case.findFirst.mockResolvedValue(null);
      const svc = new RiskService(prisma);

      await expect(svc.analyzeCase('tenant-B', 'case-A')).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-A', tenantId: 'tenant-B' } }),
      );
      expect(prisma.riskReport.create).not.toHaveBeenCalled();
    });

    it('POZİTİF: aynı tenant caseId → analiz döner + tenant-scoped sorgu', async () => {
      const prisma = makePrisma();
      prisma.case.findFirst.mockResolvedValue(makeCaseData());
      prisma.riskReport.create.mockResolvedValue({});
      const svc = new RiskService(prisma);

      const result = await svc.analyzeCase('tenant-A', 'case-A');

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-A', tenantId: 'tenant-A' } }),
      );
      expect(prisma.riskReport.create).toHaveBeenCalled();
    });
  });

  describe('getLatestReport', () => {
    it('cross-tenant erişimde case ilişkisi üzerinden tenant filtresi uygulanır', async () => {
      const prisma = makePrisma();
      prisma.riskReport.findFirst.mockResolvedValue(null);
      const svc = new RiskService(prisma);

      const result = await svc.getLatestReport('tenant-B', 'case-A');

      expect(result).toBeNull();
      expect(prisma.riskReport.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { caseId: 'case-A', case: { tenantId: 'tenant-B' } } }),
      );
    });
  });

  describe('getReportHistory', () => {
    it('tenant filtresi case ilişkisi üzerinden uygulanır', async () => {
      const prisma = makePrisma();
      prisma.riskReport.findMany.mockResolvedValue([]);
      const svc = new RiskService(prisma);

      await svc.getReportHistory('tenant-A', 'case-A');

      expect(prisma.riskReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { caseId: 'case-A', case: { tenantId: 'tenant-A' } } }),
      );
    });
  });
});
