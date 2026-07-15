/**
 * CANDIDATE-H1 (WAVE 3 — Privacy Revival, RATIFIED WITH RECORDED LIMITATIONS):
 * Edit-safe IBAN update guard. LawyerService.update():
 *  - iban OMIT/undefined → mevcut değer korunur (Prisma undefined-skip; writeData'da iban YOK)
 *  - geçerli tam string → update edilir
 *  - maskeli ('*') / boş / whitespace / null / non-string → BadRequestException (400)
 * Kasıtlı IBAN silme bu slice'ta desteklenmez.
 */
import { BadRequestException } from '@nestjs/common';
import { LawyerService } from '../lawyer.service';

const TENANT = 't1';
const ID = 'L1';
const EXISTING = {
  id: ID,
  tenantId: TENANT,
  name: 'Ada',
  surname: 'Lovelace',
  tckn: '12345678901',
  barNumber: 'B-1',
  iban: 'TR330006100519786457841326',
  canApproveOfficeActions: false,
};

const build = () => {
  const prisma: any = {
    lawyer: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ id: ID, name: 'Ada', surname: 'Lovelace', ...data }),
        ),
    },
  };
  const svc = new LawyerService(prisma, { log: jest.fn() } as any, {} as any);
  // findOne'ı izole et: mevcut kaydı döndür (guard + write yolunu sınamak için yeterli).
  jest.spyOn(svc, 'findOne').mockResolvedValue({ ...EXISTING } as any);
  return { svc, prisma };
};

describe('CANDIDATE-H1 — LawyerService.update() edit-safe IBAN guard', () => {
  it('iban OMIT → update çağrılır AMA writeData iban TAŞIMAZ (mevcut korunur)', async () => {
    const { svc, prisma } = build();
    await svc.update(TENANT, ID, { phone: '5551112233' });
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
    const arg = prisma.lawyer.update.mock.calls[0][0];
    expect(arg.data).not.toHaveProperty('iban');
    expect(arg.data.phone).toBe('5551112233');
  });

  it('geçerli yeni tam IBAN → update edilir', async () => {
    const { svc, prisma } = build();
    await svc.update(TENANT, ID, { iban: 'TR120006200319786457841327' });
    expect(prisma.lawyer.update).toHaveBeenCalledTimes(1);
    expect(prisma.lawyer.update.mock.calls[0][0].data.iban).toBe(
      'TR120006200319786457841327',
    );
  });

  it.each([
    ['maskeli (*)', 'TR33****1326'],
    ['boş', ''],
    ['whitespace', '   '],
  ])('%s IBAN → 400 (update ÇAĞRILMAZ)', async (_label, value) => {
    const { svc, prisma } = build();
    await expect(svc.update(TENANT, ID, { iban: value })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it('null IBAN (runtime — tip kurgu, ValidationPipe inert) → 400', async () => {
    const { svc, prisma } = build();
    await expect(
      svc.update(TENANT, ID, { iban: null as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it('non-string IBAN (runtime) → 400', async () => {
    const { svc, prisma } = build();
    await expect(
      svc.update(TENANT, ID, { iban: 123 as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });
});
