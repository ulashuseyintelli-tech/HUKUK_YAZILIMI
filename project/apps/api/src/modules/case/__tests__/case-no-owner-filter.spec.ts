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
  it('findAll noOwner=true → where.sorumluPersonelId = null (sahipsizler)', async () => {
    const { service, findMany } = setup();
    await service.findAll('t1', { noOwner: true });
    expect(findMany).toHaveBeenCalled();
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't1', sorumluPersonelId: null });
  });

  it('findAll noOwner yokken → sorumluPersonelId filtresi UYGULANMAZ', async () => {
    const { service, findMany } = setup();
    await service.findAll('t1', {});
    expect(findMany.mock.calls[0][0].where.sorumluPersonelId).toBeUndefined();
  });

  it('getStats → ownerless = count(sorumluPersonelId:null) ve sonuçta döner', async () => {
    const { service, count } = setup();
    count.mockImplementation(async (args: any) =>
      args?.where && Object.prototype.hasOwnProperty.call(args.where, 'sorumluPersonelId') && args.where.sorumluPersonelId === null ? 7 : 3
    );
    const stats = await service.getStats('t1');
    expect(stats.ownerless).toBe(7);
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', sorumluPersonelId: null }) })
    );
  });
});
