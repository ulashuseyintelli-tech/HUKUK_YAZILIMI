/**
 * SAHIPSIZ-DOSYALAR-G1a — Dosya Sorumlusu atanmamış (sahipsiz) dosya görünürlüğü (backend).
 * Doğrular: findAll noOwner=true → where.sorumluPersonelId=null (server-side, TÜM kapsam) ·
 * getStats.ownerless = count(sorumluPersonelId:null). Otomatik atama YOK; yalnız sayım+filtre.
 */

import { CaseService } from '../case.service';

function setup() {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const findMany = jest.fn((..._args: any[]) => Promise.resolve([] as any[]));
  const count = jest.fn((..._args: any[]) => Promise.resolve(0));
  (service as any).prisma = { case: { findMany, count } };
  return { service, findMany, count };
}

describe('SAHIPSIZ-DOSYALAR-G1a — noOwner filter + getStats.ownerless', () => {
  it('findAll noOwner=true → Model-2 sahipsiz (responsibleLawyerId=null AND responsibleStaffId=null)', async () => {
    const { service, findMany } = setup();
    await service.findAll('t1', { noOwner: true });
    expect(findMany).toHaveBeenCalled();
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't1', responsibleLawyerId: null, responsibleStaffId: null });
    expect(where.sorumluPersonelId).toBeUndefined(); // M2-G5c: legacy sorumluPersonelId artık sahipsizliği BELİRLEMEZ
  });

  it('findAll noOwner yokken → owner sahipsiz filtresi UYGULANMAZ', async () => {
    const { service, findMany } = setup();
    await service.findAll('t1', {});
    const where = findMany.mock.calls[0][0].where;
    expect(where.responsibleLawyerId).toBeUndefined();
    expect(where.responsibleStaffId).toBeUndefined();
    expect(where.sorumluPersonelId).toBeUndefined();
  });

  it('getStats → ownerless = count(responsibleLawyerId:null AND responsibleStaffId:null)', async () => {
    const { service, count } = setup();
    count.mockImplementation(async (args: any) =>
      args?.where && args.where.responsibleLawyerId === null && args.where.responsibleStaffId === null ? 7 : 3
    );
    const stats = await service.getStats('t1');
    expect(stats.ownerless).toBe(7);
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', responsibleLawyerId: null, responsibleStaffId: null }) })
    );
  });
});

describe("M2-G5a — findAll gerçek-kişi owner filtreleri (responsible*; cross-bridge YOK)", () => {
  it("responsibleLawyerId → where.responsibleLawyerId (kendi kolonu)", async () => {
    const { service, findMany } = setup();
    await service.findAll("t1", { responsibleLawyerId: "L1" });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", responsibleLawyerId: "L1" });
  });

  it("responsibleStaffId → where.responsibleStaffId", async () => {
    const { service, findMany } = setup();
    await service.findAll("t1", { responsibleStaffId: "S1" });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", responsibleStaffId: "S1" });
  });

  it("noOwner + responsibleLawyerId karışık → deterministik (G5c: noOwner staffId'yi null'lar, param lawyerId'yi yazar)", async () => {
    const { service, findMany } = setup();
    await service.findAll("t1", { noOwner: true, responsibleLawyerId: "L1" });
    // M2-G5c: noOwner → responsibleLawyerId=null + responsibleStaffId=null; sonra param responsibleLawyerId=L1 overwrite eder.
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", responsibleLawyerId: "L1", responsibleStaffId: null });
  });

  it("person filtre yok → responsible* uygulanmaz, tenant scope korunur", async () => {
    const { service, findMany } = setup();
    await service.findAll("t1", {});
    const where = findMany.mock.calls[0][0].where;
    expect(where.responsibleLawyerId).toBeUndefined();
    expect(where.responsibleStaffId).toBeUndefined();
    expect(where.tenantId).toBe("t1");
  });
});
