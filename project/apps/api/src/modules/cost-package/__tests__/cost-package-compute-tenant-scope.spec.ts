/**
 * Paket hesabı (computeExpenseRequest) — büro (tenant) sınırı, DB'siz birim testi. Gerçek HTTP + PostgreSQL kanıtı:
 * expense-request/__tests__/expense-tenant-boundary.http.db-gated.integration.spec.ts. Burada sorgu biçimi ve sorguya
 * gidilmeden reddedilen girdiler sabitlenir (boş / metin olmayan kimlik; gövdeden gelen nesne süzgeç işleci sayılmaz).
 */
import { NotFoundException } from '@nestjs/common';
import { CostPackageService } from '../cost-package.service';

const PACKAGE = {
  code: 'PAKET',
  name: 'Paket',
  messageTemplateCode: null,
  items: [
    { itemCode: 'SABIT', label: 'Sabit kalem', defaultAmount: 10, isEditable: false, sortOrder: 1, calcRule: null },
    { itemCode: 'ORANLI', label: 'Oranlı kalem', defaultAmount: 0, isEditable: true, sortOrder: 2, calcRule: { type: 'percentage', rate: 0.01, base: 'principalAmount' } },
  ],
};

function makeService(caseRow: unknown = { id: 'case-1', tenantId: 'tenant-1', principalAmount: 5000, debtors: [] }) {
  const prisma = {
    case: { findFirst: jest.fn().mockResolvedValue(caseRow), findUnique: jest.fn() },
    costPackage: { findFirst: jest.fn().mockResolvedValue(PACKAGE) },
  };
  return { svc: new CostPackageService(prisma as never), prisma };
}

describe('CostPackageService.computeExpenseRequest — büro (tenant) sınırı', () => {
  it('dosya ve paket çağıranın bürosunda aranır; hesap dosyanın anaparasıyla yapılır', async () => {
    const { svc, prisma } = makeService();

    const result = await svc.computeExpenseRequest('tenant-1', { caseId: 'case-1', packageCode: 'PAKET' });

    expect(prisma.case.findFirst.mock.calls).toEqual([
      [{ where: { id: 'case-1', tenantId: 'tenant-1' }, include: { debtors: true, executionOffice: true } }],
    ]);
    // Kimliğe göre büro sınırı olmayan okuma yapılmaz
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.costPackage.findFirst.mock.calls[0][0].where).toEqual({
      code: 'PAKET',
      isActive: true,
      OR: [{ tenantId: null }, { tenantId: 'tenant-1' }],
    });
    expect(result).toMatchObject({ packageCode: 'PAKET', totalSuggested: 60 });
    expect(result.items.map((item) => item.suggestedAmount)).toEqual([10, 50]);
  });

  it('paket, dosya satırındaki büro alanıyla DEĞİL çağıranın bürosuyla aranır', async () => {
    const { svc, prisma } = makeService({ id: 'case-1', tenantId: 'baska-buro', principalAmount: 5000, debtors: [] });

    await svc.computeExpenseRequest('tenant-1', { caseId: 'case-1', packageCode: 'PAKET' });

    expect(prisma.costPackage.findFirst.mock.calls[0][0].where.OR).toEqual([{ tenantId: null }, { tenantId: 'tenant-1' }]);
  });

  it('dosya çağıranın bürosunda değilse (ya da yoksa) "Takip bulunamadı"; paket okunmaz', async () => {
    const { svc, prisma } = makeService(null);

    const attempt = svc.computeExpenseRequest('tenant-1', { caseId: 'case-1', packageCode: 'PAKET' });
    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toThrow('Takip bulunamadı');
    expect(prisma.case.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.costPackage.findFirst).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [''], [42], [{ not: '' }], [['case-1']]])(
    'dosya kimliği metin değilse ya da boşsa (%p) sorguya gidilmeden reddedilir',
    async (caseId) => {
      const { svc, prisma } = makeService();

      await expect(svc.computeExpenseRequest('tenant-1', { caseId: caseId as never, packageCode: 'PAKET' })).rejects.toThrow('Takip bulunamadı');
      // Sorguya gidilseydi: tanımsız kimlik yok sayılır, nesne süzgeç işleci olur → büronun rastgele bir dosyası seçilirdi
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
      expect(prisma.case.findUnique).not.toHaveBeenCalled();
      expect(prisma.costPackage.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each([[undefined], [null], [''], [{ not: '' }]])('büro kimliği boşsa ya da metin değilse (%p) sorguya gidilmeden reddedilir (fail-closed)', async (tenantId) => {
    const { svc, prisma } = makeService();

    await expect(svc.computeExpenseRequest(tenantId as never, { caseId: 'case-1', packageCode: 'PAKET' })).rejects.toThrow('Takip bulunamadı');
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.costPackage.findFirst).not.toHaveBeenCalled();
  });
});
