/**
 * CANDIDATE-F1 (WAVE 3 — Privacy Revival, RATIFIED WITH RECORDED LIMITATIONS):
 * Personnel List Masked Default. StaffService liste projeksiyonları (findAll/findByType)
 * hassas alanı (tckn) mevcut pii-mask.util ile varsayılan maskeler; null/boş KORUNUR
 * (sentinel üretilmez). Detail (findOne) MASKELEMEZ (raw döner). Response shape korunur.
 * Kapsam: yalnız list; detail/edit/search/duplicate-guard DEĞİŞMEZ.
 */
import { StaffService } from '../staff.service';

const TENANT = 't1';

const build = (rows: any[]) => {
  const prisma: any = {
    staffMember: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
        ),
    },
  };
  return { svc: new StaffService(prisma), prisma };
};

describe('CANDIDATE-F1 — StaffService list masking (tckn)', () => {
  it('findAll: tckn maskeli döner (first3****last2)', async () => {
    const { svc } = build([{ id: 's1', firstName: 'A', lastName: 'B', tckn: '12345678901' }]);
    const res = await svc.findAll(TENANT);
    expect(res[0].tckn).toBe('123****01');
  });

  it('findByType: tckn maskeli döner', async () => {
    const { svc } = build([{ id: 's1', firstName: 'A', lastName: 'B', tckn: '12345678901' }]);
    const res = await svc.findByType(TENANT, 'MUHASEBE');
    expect(res[0].tckn).toBe('123****01');
  });

  it('null tckn → null KALIR (sentinel YOK)', async () => {
    const { svc } = build([{ id: 's1', firstName: 'A', lastName: 'B', tckn: null }]);
    const res = await svc.findAll(TENANT);
    expect(res[0].tckn).toBeNull();
  });

  it("boş string tckn → '' KALIR (sentinel YOK)", async () => {
    const { svc } = build([{ id: 's1', firstName: 'A', lastName: 'B', tckn: '' }]);
    const res = await svc.findAll(TENANT);
    expect(res[0].tckn).toBe('');
  });

  it('findOne (detail) tckn MASKELEMEZ — raw döner', async () => {
    const { svc } = build([
      { id: 's1', firstName: 'A', lastName: 'B', tckn: '12345678901', caseAssignments: [] },
    ]);
    const res = await svc.findOne('s1', TENANT);
    expect(res?.tckn).toBe('12345678901');
  });

  it('diğer alanlar + response shape DEĞİŞMEZ', async () => {
    const { svc } = build([
      { id: 's1', firstName: 'Ada', lastName: 'Lovelace', tckn: '12345678901', staffType: 'SEKRETER' },
    ]);
    const res = await svc.findAll(TENANT);
    expect(res[0]).toMatchObject({ id: 's1', firstName: 'Ada', lastName: 'Lovelace', staffType: 'SEKRETER' });
  });
});
