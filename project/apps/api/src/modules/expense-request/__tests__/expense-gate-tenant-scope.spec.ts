/**
 * Masraf kapısı — büro (tenant) sınırı, DB'siz birim testi. Gerçek HTTP + PostgreSQL kanıtı:
 * expense-tenant-boundary.http.db-gated.integration.spec.ts. Burada HTTP'den üretilemeyen durumlar ve sorgu biçimi
 * sabitlenir: boş büro / dosya kimliği (fail-closed), sahiplik sorgusunun biçimi, talep sorgularındaki büro süzgeci.
 */
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExpenseGateService } from '../expense-gate.service';

const D = (n: number) => new Prisma.Decimal(n);
const FLAG = 'EXPENSE_REMAINING_GATE_ENABLED';
const OPEN_STATUSES = { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL'] };

function makeService(opts: { caseInTenant?: boolean } = {}) {
  const prisma = {
    case: { findFirst: jest.fn().mockResolvedValue(opts.caseInTenant === false ? null : { id: 'case-1' }) },
    expenseRequest: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'er1', tenantId: 'tenant-1', stageCode: 'OPENING', totalAmount: D(100), paidTotal: D(0), status: 'PENDING' }]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const readService = { computeExpenseRemaining: jest.fn().mockResolvedValue(D(100)) };
  const cpeAdapter = { canPerformAction: jest.fn().mockResolvedValue({ allowed: true }) };
  return { svc: new ExpenseGateService(prisma as never, readService as never), prisma, readService, cpeAdapter };
}

type Service = ReturnType<typeof makeService>['svc'];

/** Dosya kimliği alan bütün açık metotlar (kapıdan muaf işlem türü dahil). */
const ENTRY_POINTS: Array<[string, (svc: Service, caseId: string, tenantId: string) => Promise<unknown>]> = [
  ['checkGate', (svc, caseId, tenantId) => svc.checkGate(caseId, tenantId)],
  ['getGateSummary', (svc, caseId, tenantId) => svc.getGateSummary(caseId, tenantId)],
  ['isUyapBlocked', (svc, caseId, tenantId) => svc.isUyapBlocked(caseId, tenantId)],
  ['canPerformUyapAction(SEND)', (svc, caseId, tenantId) => svc.canPerformUyapAction(caseId, 'SEND', tenantId)],
  ['canPerformUyapAction(VIEW — muaf)', (svc, caseId, tenantId) => svc.canPerformUyapAction(caseId, 'VIEW', tenantId)],
  ['updateGateStatus', (svc, caseId, tenantId) => svc.updateGateStatus(caseId, tenantId)],
];

describe('ExpenseGateService — büro (tenant) sınırı', () => {
  const originalFlag = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  describe.each(['kapalı', 'açık'])('kalan-bazlı karar %s', (flag) => {
    beforeEach(() => {
      if (flag === 'açık') process.env[FLAG] = 'true';
    });

    it.each(ENTRY_POINTS)('%s: dosya çağıranın bürosunda değilse "Takip bulunamadı"; talep okunmaz', async (_name, call) => {
      const { svc, prisma, readService, cpeAdapter } = makeService({ caseInTenant: false });
      svc.setCpeAdapter(cpeAdapter, true);

      const attempt = call(svc, 'case-1', 'tenant-1');
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
      await expect(attempt).rejects.toThrow('Takip bulunamadı');

      // Sahiplik, dosya kimliği + çağıranın bürosu ile TEK sorguda aranır; var olmayan dosya da aynı yoldan reddedilir
      expect(prisma.case.findFirst.mock.calls).toEqual([[{ where: { id: 'case-1', tenantId: 'tenant-1' }, select: { id: true } }]]);
      expect(prisma.expenseRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.expenseRequest.count).not.toHaveBeenCalled();
      expect(readService.computeExpenseRemaining).not.toHaveBeenCalled();
      expect(cpeAdapter.canPerformAction).not.toHaveBeenCalled();
    });

    it.each(ENTRY_POINTS)('%s: büro ya da dosya kimliği boşsa sorguya HİÇ gidilmeden reddedilir (fail-closed)', async (_name, call) => {
      for (const [caseId, tenantId] of [
        ['case-1', undefined],
        ['case-1', null],
        ['case-1', ''],
        [undefined, 'tenant-1'],
        ['', 'tenant-1'],
      ]) {
        const { svc, prisma } = makeService();
        await expect(call(svc, caseId as string, tenantId as string)).rejects.toThrow('Takip bulunamadı');
        // Prisma tanımsız süzgeci yok sayar: sorguya gidilseydi dosya büro sınırı olmadan bulunurdu
        expect(prisma.case.findFirst).not.toHaveBeenCalled();
        expect(prisma.expenseRequest.findMany).not.toHaveBeenCalled();
        expect(prisma.expenseRequest.count).not.toHaveBeenCalled();
      }
    });

    it.each(ENTRY_POINTS)('%s: kendi dosyasında sahiplik bir kez doğrulanır ve talepler büro süzgeciyle okunur', async (_name, call) => {
      const { svc, prisma } = makeService();

      await call(svc, 'case-1', 'tenant-1');

      expect(prisma.case.findFirst).toHaveBeenCalledTimes(1);
      const requestReads = [...prisma.expenseRequest.findMany.mock.calls, ...prisma.expenseRequest.count.mock.calls];
      for (const [query] of requestReads) {
        expect(query.where).toEqual({ caseId: 'case-1', tenantId: 'tenant-1', gateType: 'BLOCKING', status: OPEN_STATUSES });
      }
    });
  });

  it('kendi dosyasında kilide tabi işlem talepleri okur; muaf işlem okumadan izin verir (mevcut davranış)', async () => {
    const { svc, prisma } = makeService();

    expect(await svc.canPerformUyapAction('case-1', 'SEND', 'tenant-1')).toBe(false);
    expect(prisma.expenseRequest.count).toHaveBeenCalledTimes(1);

    expect(await svc.canPerformUyapAction('case-1', 'VIEW', 'tenant-1')).toBe(true);
    expect(prisma.expenseRequest.count).toHaveBeenCalledTimes(1);
    expect(prisma.expenseRequest.findMany).not.toHaveBeenCalled();
  });

  it('CPE bağdaştırıcısı etkinken kendi dosyasında bağdaştırıcı bugünkü gibi çağrılır', async () => {
    const { svc, cpeAdapter } = makeService();
    svc.setCpeAdapter(cpeAdapter, true);

    expect(await svc.canPerformUyapAction('case-1', 'SEND', 'tenant-1')).toBe(true);
    expect(await svc.isUyapBlocked('case-1', 'tenant-1')).toBe(false);
    expect(cpeAdapter.canPerformAction.mock.calls).toEqual([
      ['case-1', 'UYAP_SEND'],
      ['case-1', 'UYAP_SEND'],
    ]);
  });
});
