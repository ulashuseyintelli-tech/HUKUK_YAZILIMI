/**
 * CANDIDATE-F1 (WAVE 3 — Privacy Revival, RATIFIED WITH RECORDED LIMITATIONS):
 * Personnel List Masked Default. LawyerService liste projeksiyonları (findAll/findDefaults)
 * hassas alanları (tckn, iban, deprecated identityNo) mevcut pii-mask.util ile varsayılan
 * maskeler; null/boş KORUNUR (sentinel üretilmez). Detail (findOne) MASKELEMEZ (raw döner).
 * displayName ve response shape korunur; search WHERE davranışı DEĞİŞMEZ.
 */
import { LawyerService } from '../lawyer.service';

const TENANT = 't1';
const audit: any = { log: jest.fn() };
const officeApproval: any = {};

const ROW = {
  id: 'L1',
  name: 'Ada',
  surname: 'Lovelace',
  title: null,
  role: 'EMPLOYEE',
  tckn: '12345678901',
  iban: 'TR330006100519786457841326',
  identityNo: '98765432109',
  isActive: true,
};

const build = (rows: any[]) => {
  const prisma: any = {
    lawyer: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
        ),
    },
  };
  return { svc: new LawyerService(prisma, audit, officeApproval), prisma };
};

describe('CANDIDATE-F1 — LawyerService list masking (tckn/iban/identityNo)', () => {
  it('findAll: tckn/iban/identityNo maskeli + displayName korunur', async () => {
    const { svc } = build([{ ...ROW }]);
    const res = await svc.findAll(TENANT);
    expect(res[0].tckn).toBe('123****01');
    expect(res[0].iban).toBe('TR33****1326');
    expect(res[0].identityNo).toBe('987****09');
    expect(res[0].displayName).toBe('Av. Ada Lovelace');
  });

  it('findDefaults: tckn/iban/identityNo maskeli', async () => {
    const { svc } = build([{ ...ROW }]);
    const res = await svc.findDefaults(TENANT);
    expect(res[0].tckn).toBe('123****01');
    expect(res[0].iban).toBe('TR33****1326');
    expect(res[0].identityNo).toBe('987****09');
  });

  it('null hassas alanlar → null KALIR (sentinel YOK)', async () => {
    const { svc } = build([{ ...ROW, tckn: null, iban: null, identityNo: null }]);
    const res = await svc.findAll(TENANT);
    expect(res[0].tckn).toBeNull();
    expect(res[0].iban).toBeNull();
    expect(res[0].identityNo).toBeNull();
  });

  it('findOne (detail) MASKELEMEZ — raw döner', async () => {
    const { svc } = build([{ ...ROW }]);
    const res: any = await svc.findOne(TENANT, 'L1');
    expect(res.tckn).toBe('12345678901');
    expect(res.iban).toBe('TR330006100519786457841326');
    expect(res.identityNo).toBe('98765432109');
  });

  it('search WHERE DEĞİŞMEZ (F1 yalnız response maskeler); sonuç maskeli döner', async () => {
    const { svc, prisma } = build([{ ...ROW }]);
    const res = await svc.findAll(TENANT, '12345678901');
    const call = prisma.lawyer.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where)).toContain('12345678901'); // WHERE tam tckn ile (dokunulmadı)
    expect(res[0].tckn).toBe('123****01'); // response maskeli
  });
});
