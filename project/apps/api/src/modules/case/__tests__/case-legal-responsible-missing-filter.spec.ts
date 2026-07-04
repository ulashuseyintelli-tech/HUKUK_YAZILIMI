/**
 * WP-3a — LEGAL_RESPONSIBLE_MISSING warn/report sinyali (backend).
 *
 * Doğrular: findAll legalResponsibleMissing=true → where { status:"ACTIVE", responsibleStaffId:{not:null},
 * lawyers:{none:{isResponsible:true}} } · getStats.legalResponsibleMissing = AYNI koşulun count'u.
 * Warn/report sinyali — BLOCK / audit / migration YOK. Legacy sorumluPersonelId bu sinyale GİRMEZ.
 */

import { CaseService } from '../case.service';

function setup() {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const findMany = jest.fn((..._a: any[]) => Promise.resolve([] as any[]));
  const count = jest.fn((..._a: any[]) => Promise.resolve(0));
  (service as any).prisma = { case: { findMany, count } };
  return { service, findMany, count };
}

describe('WP-3a — LEGAL_RESPONSIBLE_MISSING filter + getStats sayacı', () => {
  it('findAll legalResponsibleMissing=true → ACTIVE + staff-owner + hukuki sorumlu avukat YOK', async () => {
    const { service, findMany } = setup();
    await service.findAll('t1', { legalResponsibleMissing: true });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: 't1',
      status: 'ACTIVE',
      responsibleStaffId: { not: null },
      lawyers: { none: { isResponsible: true } },
    });
  });

  it('findAll legalResponsibleMissing yokken → filtre UYGULANMAZ', async () => {
    const { service, findMany } = setup();
    await service.findAll('t1', {});
    const where = findMany.mock.calls[0][0].where;
    expect(where.lawyers).toBeUndefined();
    expect(where.responsibleStaffId).toBeUndefined();
    expect(where.status).toBeUndefined();
  });

  it('getStats → legalResponsibleMissing = count(ACTIVE + staff-owner + lawyers none isResponsible)', async () => {
    const { service, count } = setup();
    // yalnız LEGAL_RESPONSIBLE_MISSING count'u (lawyers.none ayrımı) 5 döner; diğer sayımlar 1.
    count.mockImplementation(async (args: any) =>
      args?.where?.lawyers?.none?.isResponsible === true ? 5 : 1,
    );
    const stats = await service.getStats('t1');
    expect(stats.legalResponsibleMissing).toBe(5);
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          status: 'ACTIVE',
          responsibleStaffId: { not: null },
          lawyers: { none: { isResponsible: true } },
        }),
      }),
    );
  });

  it('legacy sorumluPersonelId bu sinyale GİRMEZ (where koşulunda yer almaz)', async () => {
    const { service, findMany } = setup();
    await service.findAll('t1', { legalResponsibleMissing: true });
    expect(findMany.mock.calls[0][0].where.sorumluPersonelId).toBeUndefined();
  });
});
