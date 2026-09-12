/**
 * AK-2 ARDIL — "ofis oto-oluşturmanın transaction dışında kalması" (kayıt: product-backlog
 * "Ayrı takip"; RELEASE22-ADAY-HAZIRLIK-R01 §8 açık kalanlar).
 *
 * ÖLÇÜLEN AÇIK: `LawyerService.create` yeni kayıt dalında ofis satırını `$transaction` DIŞINDA
 *   oluşturuyordu. Avukat create'i ya da `LAWYER_CREATE` audit'i düşerse transaction geri alınıyor,
 *   ama o istek için açılmış ofis satırı KALICI oluyordu: hiçbir avukatı olmayan artık ofis kaydı.
 *   Ofis kaydı canlı zamanlayıcıların tenant seçim kapısıdır (tebrik, operasyonel eskalasyon),
 *   yani artık satır sessiz kalmıyor: tenant'ı cron kapsamına sokar.
 *
 * BU SPEC'İN SABİTLEDİĞİ: ofis al/oluştur adımı avukat satırı ve audit ile AYNI transaction
 *   içindedir; transaction düşerse ofis oluşturma da geri alınır (tx dışında ofis yazması YOK).
 */

import { LawyerService } from '../lawyer.service';

const TENANT = 't-1';
const MINIMAL = { name: 'Ada', surname: 'Lovelace' };

/** `inTx` bayrağı: $transaction geri çağrısı çalışırken true. Her ofis çağrısı bayrakla kaydedilir. */
const build = (opts: { officeExists?: boolean; auditThrows?: boolean } = {}) => {
  const calls: { officeFindUnique: boolean[]; officeCreate: boolean[]; lawyerCreate: boolean[] } = {
    officeFindUnique: [], officeCreate: [], lawyerCreate: [],
  };
  let inTx = false;

  const prisma: any = {
    lawyer: {
      findMany: jest.fn().mockResolvedValue([]), // duplicate guard → eşleşme yok
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        calls.lawyerCreate.push(inTx);
        return Promise.resolve({ id: 'L-NEW', ...data });
      }),
    },
    office: {
      findUnique: jest.fn().mockImplementation(() => {
        calls.officeFindUnique.push(inTx);
        return Promise.resolve(opts.officeExists ? { id: 'O-EXISTING' } : null);
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        calls.officeCreate.push(inTx);
        return Promise.resolve({ id: 'O-NEW', ...data });
      }),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: TENANT, name: 'Deneme Burosu' }) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => {
    inTx = true;
    try {
      return await fn(prisma);
    } finally {
      inTx = false;
    }
  });

  const audit: any = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTransaction: jest.fn().mockImplementation(() => {
      if (opts.auditThrows) return Promise.reject(new Error('audit yazilamadi'));
      return Promise.resolve(undefined);
    }),
  };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  return { svc: new LawyerService(prisma, audit, officeApproval), prisma, calls };
};

describe('AK-2 ardıl — ofis oto-oluşturma avukat transaction’ının İÇİNDE', () => {
  it('ofis yokken: findUnique ve create tx İÇİNDE çağrılır, avukat oluşan ofise bağlanır', async () => {
    const { svc, prisma, calls } = build({ officeExists: false });

    await svc.create(TENANT, { ...MINIMAL } as never);

    expect(calls.officeFindUnique).toEqual([true]);
    expect(calls.officeCreate).toEqual([true]); // tx dışında ofis yazması YOK
    expect(calls.lawyerCreate).toEqual([true]);
    expect(prisma.lawyer.create.mock.calls[0][0].data.officeId).toBe('O-NEW');
  });

  it('audit düşerse: transaction hata verir ve ofis yazması tx içinde kalmıştır (geri alınır)', async () => {
    const { svc, calls } = build({ officeExists: false, auditThrows: true });

    await expect(svc.create(TENANT, { ...MINIMAL } as never)).rejects.toThrow('audit yazilamadi');

    // Kritik: tek ofis create çağrısı ve o çağrı tx içinde — yani rollback kapsamında.
    expect(calls.officeCreate).toEqual([true]);
    expect(calls.officeCreate.some((v) => v === false)).toBe(false);
  });

  it('ofis varsa: create çağrılmaz, mevcut ofis kullanılır (okuma da tx içinde)', async () => {
    const { svc, prisma, calls } = build({ officeExists: true });

    await svc.create(TENANT, { ...MINIMAL } as never);

    expect(calls.officeCreate).toEqual([]);
    expect(calls.officeFindUnique).toEqual([true]);
    expect(prisma.lawyer.create.mock.calls[0][0].data.officeId).toBe('O-EXISTING');
  });
});
