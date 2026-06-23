import { NotFoundException } from '@nestjs/common';
import { ThirdPartyService } from './third-party.service';

/**
 * GATE-1 — Tenant boundary hardening (89 ihbarname özeti).
 *
 * Açık: getIhbarnameSummary(tenantId, caseId) caseId'yi tenant doğrulamadan
 * sorguluyordu (where: { caseId }) → başka tenant dosyasının özeti okunabiliyordu.
 * Bu suite, (a) cross-tenant caseId'nin 404 ile reddedildiğini, (b) case ownership
 * sorgusunun tenant-scoped olduğunu, (c) reddedince veri sorgusuna (caseDebtor.findMany)
 * hiç inilmediğini, (d) aynı tenant erişiminin özeti döndürmeye devam ettiğini doğrular.
 *
 * Saf birim test (DB yok): prisma mock'lanır.
 */
describe('ThirdPartyService.getIhbarnameSummary — tenant boundary (Gate-1)', () => {
  function makePrisma() {
    return {
      case: { findFirst: jest.fn() },
      caseDebtor: { findMany: jest.fn() },
    } as any;
  }

  function makeService(prisma: any) {
    // getIhbarnameSummary yalnız prisma kullanır; collectionService ve lifecycle guard burada gereksiz.
    return new ThirdPartyService(prisma, {} as any, {} as any);
  }

  it('NEGATIF: başka tenant caseId → NotFoundException + case.findFirst tenant-scoped + caseDebtor sorgusu YOK', async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue(null); // cross-tenant → dosya bulunamaz
    const svc = makeService(prisma);

    await expect(
      svc.getIhbarnameSummary('tenant-B', 'case-A'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-A', tenantId: 'tenant-B' },
      select: { id: true },
    });
    // Reddedildiğinde asıl veri sorgusuna inilmemeli (sızıntı yok).
    expect(prisma.caseDebtor.findMany).not.toHaveBeenCalled();
  });

  it('POZİTİF: aynı tenant caseId → özet döner + caseDebtor sorgusu tenant-zincirli (case.tenantId)', async () => {
    const prisma = makePrisma();
    prisma.case.findFirst.mockResolvedValue({ id: 'case-A' });
    prisma.caseDebtor.findMany.mockResolvedValue([]); // 3. şahıs yok → sıfır özet
    const svc = makeService(prisma);

    const result = await svc.getIhbarnameSummary('tenant-A', 'case-A');

    expect(result).toEqual({
      totalThirdParties: 0,
      pending89_1: 0,
      pending89_2: 0,
      pending89_3: 0,
      waitingResponse: 0,
      completed: 0,
      overdueCount: 0,
      debtors: [],
    });

    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case-A', case: { tenantId: 'tenant-A' } },
      include: {
        thirdParties: true,
        debtor: { select: { id: true, name: true } },
      },
    });
  });
});
