/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / P5-B02 — seed yüzeyi kanonik-servis sözleşmesi.
 *
 * ÖLÇÜM (P5-B01/B03 evidence): seedStaff/seedLawyers kayıtları `prisma.*.create({...} as any)`
 * ile yazıyordu — StaffService/LawyerService'in duplicate-identity / name-match guard'ları
 * bypass ediliyordu (dedup yalnız email/barNumber eşitliğiydi). Bu spec yeni sözleşmeyi kilitler:
 *  1) Yazım YALNIZ kanonik servis üzerinden olur (doğrudan prisma.create ASLA çağrılmaz).
 *  2) SIMILAR_NAME_REVIEW bir insan kararıdır; seed bu kararı VEREMEZ → satır `forceCreate`
 *     ile GEÇİLMEZ, atlanır ve `skippedForReview` ile açıkça raporlanır (sessiz başarı yok).
 *  3) Satır-bazlı devam korunur (OWN-13 D07 emsali): bir satırın review'u kalanları durdurmaz.
 *  4) Review-dışı hatalar YUTULMAZ (rethrow) — hata sessizce başarı sayılmaz.
 */
import { ConflictException } from '@nestjs/common';
import { SeedService } from '../seed.service';

const noopAudit = () => ({ log: jest.fn(), logInTransaction: jest.fn() } as any);
const clientStub = () =>
  ({ assertCanRunElevatedClientBulkOperation: jest.fn(), create: jest.fn() } as any);

const build = (extras: { staffService?: any; lawyerService?: any } = {}) => {
  const prisma: any = {
    staffMember: { create: jest.fn(), findFirst: jest.fn() },
    lawyer: { create: jest.fn(), findFirst: jest.fn() },
    office: { findFirst: jest.fn() },
  };
  const svc = new SeedService(prisma, noopAudit(), clientStub(), extras.staffService, extras.lawyerService);
  return { svc, prisma };
};

describe('P5-B02 — seedStaff kanonik StaffService yolu', () => {
  it('her satır StaffService.create(tenantId, satır) ile yazılır; forceCreate ASLA gönderilmez', async () => {
    const staffService = { create: jest.fn().mockResolvedValue({ id: 'sX' }) };
    const { svc, prisma } = build({ staffService });

    const res: any = await svc.seedStaff('t1');

    expect(staffService.create).toHaveBeenCalledTimes(10);
    expect(res.created).toBe(10);
    expect(res.skippedForReview).toBe(0);
    for (const [tenantId, data] of staffService.create.mock.calls) {
      expect(tenantId).toBe('t1');
      // guard-bypass kapısı: seed insan kararı veremez → forceCreate hiçbir satırda YOK
      expect((data as any).forceCreate).toBeUndefined();
    }
    expect(prisma.staffMember.create).not.toHaveBeenCalled();
  });

  it('SIMILAR_NAME_REVIEW → satır atlanır (skippedForReview), kalan satırlar DEVAM eder', async () => {
    let call = 0;
    const staffService = {
      create: jest.fn().mockImplementation(() => {
        call++;
        if (call === 2) {
          return Promise.reject(
            new ConflictException({ code: 'SIMILAR_NAME_REVIEW', message: 'benzer isim', candidates: [] }),
          );
        }
        return Promise.resolve({ id: `s${call}` });
      }),
    };
    const { svc } = build({ staffService });

    const res: any = await svc.seedStaff('t1');

    expect(staffService.create).toHaveBeenCalledTimes(10); // satır-bazlı devam
    expect(res.created).toBe(9);
    expect(res.skippedForReview).toBe(1);
  });

  it('review-dışı hata YUTULMAZ (rethrow)', async () => {
    const staffService = { create: jest.fn().mockRejectedValue(new Error('db down')) };
    const { svc } = build({ staffService });

    await expect(svc.seedStaff('t1')).rejects.toThrow('db down');
  });

  it('review-dışı ConflictException da YUTULMAZ (yalnız SIMILAR_NAME_REVIEW atlanır)', async () => {
    const staffService = {
      create: jest.fn().mockRejectedValue(new ConflictException({ code: 'DUPLICATE_IDENTITY' })),
    };
    const { svc } = build({ staffService });

    await expect(svc.seedStaff('t1')).rejects.toThrow(ConflictException);
  });
});

describe('P5-B02 — seedLawyers kanonik LawyerService yolu', () => {
  it('her satır LawyerService.create ile yazılır; _existingReturned existing sayılır, created sayılmaz', async () => {
    let call = 0;
    const lawyerService = {
      create: jest.fn().mockImplementation(() => {
        call++;
        // ilk 3 satır "mevcut" (duplicate guard mevcut satırı döndürür), kalanı yeni
        return Promise.resolve(call <= 3 ? { id: `l${call}`, _existingReturned: true } : { id: `l${call}` });
      }),
    };
    const { svc, prisma } = build({ lawyerService });

    const res: any = await svc.seedLawyers('t1');

    expect(lawyerService.create).toHaveBeenCalledTimes(10);
    expect(res.existing).toBe(3);
    expect(res.created).toBe(7);
    expect(lawyerService.create.mock.calls[0][0]).toBe('t1');
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
  });

  it('LawyerService hatası YUTULMAZ (rethrow)', async () => {
    const lawyerService = { create: jest.fn().mockRejectedValue(new Error('yaz hatası')) };
    const { svc } = build({ lawyerService });

    await expect(svc.seedLawyers('t1')).rejects.toThrow('yaz hatası');
  });
});
