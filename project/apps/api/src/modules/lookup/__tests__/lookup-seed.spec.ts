/**
 * seedLookupCatalog — prosedür birim testi (MOCK prisma, gerçek DB write YOK).
 *
 * Doğrulananlar:
 *  - her lookup tipi için katalog uzunluğu kadar upsert
 *  - upsert update bloğunda isActive:true (soft-deleted kanonik kodu REACTIVATE eder)
 *  - upsert where = { tenantId_code: { tenantId, code } } (tenant-scoped, doğru unique key)
 *  - defaults geçişi: takipTuru.update, çözülmüş mahiyet/borçlu id'leriyle çağrılır
 *  - sadece katalog kodları hedeflenir (fazladan upsert yok)
 */
import { seedLookupCatalog } from '../lookup-seed';
import {
  TAKIP_TURU_CATALOG,
  MAHIYET_TIPI_CATALOG,
  ASAMA_CATALOG,
  RISK_CATALOG,
  DURUM_ETIKETI_CATALOG,
  TAKIP_TURU_DEFAULTS,
} from '../lookup-catalog';

function makeModel(findManyRows: any[] = []) {
  return {
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue(findManyRows),
  };
}

function makeDb() {
  return {
    lookupMahiyetTipi: makeModel(MAHIYET_TIPI_CATALOG.map((m) => ({ id: `m_${m.code}`, code: m.code }))),
    lookupRisk: makeModel(),
    lookupAsama: makeModel(),
    lookupDurumEtiketi: makeModel(),
    lookupTakipTuru: makeModel(),
  };
}

const TENANT = 'tenant-test-1';

describe('seedLookupCatalog', () => {
  it('her lookup tipi için katalog uzunluğu kadar upsert çağırır', async () => {
    const db = makeDb();
    const res = await seedLookupCatalog(db as any, TENANT);

    expect(db.lookupMahiyetTipi.upsert).toHaveBeenCalledTimes(MAHIYET_TIPI_CATALOG.length);
    expect(db.lookupRisk.upsert).toHaveBeenCalledTimes(RISK_CATALOG.length);
    expect(db.lookupAsama.upsert).toHaveBeenCalledTimes(ASAMA_CATALOG.length);
    expect(db.lookupDurumEtiketi.upsert).toHaveBeenCalledTimes(DURUM_ETIKETI_CATALOG.length);
    expect(db.lookupTakipTuru.upsert).toHaveBeenCalledTimes(TAKIP_TURU_CATALOG.length);

    expect(res).toEqual({
      takipTuru: TAKIP_TURU_CATALOG.length,
      mahiyet: MAHIYET_TIPI_CATALOG.length,
      asama: ASAMA_CATALOG.length,
      risk: RISK_CATALOG.length,
      durumEtiketi: DURUM_ETIKETI_CATALOG.length,
    });
  });

  it('her upsert update bloğunda isActive:true vardır (reactivation semantiği)', async () => {
    const db = makeDb();
    await seedLookupCatalog(db as any, TENANT);

    const allUpserts = [
      ...db.lookupMahiyetTipi.upsert.mock.calls,
      ...db.lookupRisk.upsert.mock.calls,
      ...db.lookupAsama.upsert.mock.calls,
      ...db.lookupDurumEtiketi.upsert.mock.calls,
      ...db.lookupTakipTuru.upsert.mock.calls,
    ];
    expect(allUpserts.length).toBeGreaterThan(0);
    for (const [arg] of allUpserts) {
      expect(arg.update.isActive).toBe(true);
    }
  });

  it('upsert where = tenantId_code (tenant-scoped, doğru unique key)', async () => {
    const db = makeDb();
    await seedLookupCatalog(db as any, TENANT);

    for (const [arg] of db.lookupTakipTuru.upsert.mock.calls) {
      expect(arg.where).toHaveProperty('tenantId_code');
      expect(arg.where.tenantId_code.tenantId).toBe(TENANT);
      expect(typeof arg.where.tenantId_code.code).toBe('string');
    }
  });

  it('yalnız katalog takip türü kodları upsert edilir (fazladan/ölü kod yok)', async () => {
    const db = makeDb();
    await seedLookupCatalog(db as any, TENANT);

    const upsertedCodes = db.lookupTakipTuru.upsert.mock.calls.map((c: any[]) => c[0].where.tenantId_code.code).sort();
    const catalogCodes = TAKIP_TURU_CATALOG.map((t) => t.code).sort();
    expect(upsertedCodes).toEqual(catalogCodes);
  });

  it('defaults geçişi: takipTuru.update çözülmüş mahiyet/borçlu id ile çağrılır', async () => {
    const db = makeDb();
    await seedLookupCatalog(db as any, TENANT);

    // Her default için bir update beklenir (mahiyet+borçlu id'leri findMany ile çözülebildi)
    expect(db.lookupTakipTuru.update).toHaveBeenCalledTimes(Object.keys(TAKIP_TURU_DEFAULTS).length);

    // KAMBIYO_CEK → mahiyet CEK olmalı
    const cekUpdate = db.lookupTakipTuru.update.mock.calls.find(
      (c: any[]) => c[0].where.tenantId_code.code === 'KAMBIYO_CEK',
    );
    expect(cekUpdate).toBeDefined();
    expect(cekUpdate![0].data.defaultMahiyetTipiId).toBe('m_CEK');
  });

  it('mahiyet id çözülemezse takipTuru.update ÇAĞRILMAZ (guard)', async () => {
    const db = makeDb();
    // findMany boş → hiçbir default çözülemez
    db.lookupMahiyetTipi.findMany.mockResolvedValue([]);

    await seedLookupCatalog(db as any, TENANT);
    expect(db.lookupTakipTuru.update).not.toHaveBeenCalled();
  });
});
