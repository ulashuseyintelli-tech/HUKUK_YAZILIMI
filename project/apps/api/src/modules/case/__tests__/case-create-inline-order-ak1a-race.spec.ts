/**
 * AK-1a ARDIL — `/cases` ön kontrol yarışı: inline taraf oluşturma SIRASI.
 *
 * ÖLÇÜLEN AÇIK (kayıt: product-backlog "Ayrı takip" + OFFICE-LIVE-ACCEPTANCE-AK-R01 §15.7):
 *   `POST /cases` ön kontrolü (adım 0: AK-1a VIEWER + AK-2 ayrıcalık reddi) ile avukatın GERÇEK
 *   create'i arasında eşleşen kayıt ayrıcalıklı hale gelirse create yine 403 verir (fail-closed),
 *   fakat ESKİ sırada o ana dek inline MÜVEKKİL yazılmış oluyordu: istek yarıda kalıyor, canlıda
 *   sahipsiz müvekkil satırı kalıyordu. Müvekkil yazması D01 yetkisine tabi bir CLIENT
 *   mutasyonudur (OWN-13 I02-R1); bu yüzden öncelik müvekkil tarafındadır.
 *
 * BU SPEC'İN SABİTLEDİĞİ: avukat yetki kararı KESİNLEŞMEDEN (create dönmeden) hiçbir müvekkil
 *   satırı yazılmaz. Yani `resolveInlinePartiesInTx`:
 *     - adım 0 ön kontrolünü İLK,
 *     - inline avukat create'ini müvekkilden ÖNCE çalıştırır,
 *     - avukat create'i 403 ile düşerse ClientService.create'i HİÇ çağırmaz.
 *
 * KAPSAM SINIRI: genel transaction refactor'ı YAPILMADI (kayıtta açık kalır). Adım 1 ile adım 2
 *   arasındaki hata kalıcı AVUKAT satırı bırakabilir; avukat kaydı kimlik/isim eşleşmesiyle
 *   tekilleştirilen dizin kaydıdır ve F01 kapısına tabidir.
 */

import { ForbiddenException } from '@nestjs/common';
import { CaseService } from '../case.service';

function build(clientService: any, lawyerService: any, debtorService: any) {
  const stub = {} as any;
  // deps: prisma, audit, clientInfo, interestEngine, expenseRequest, domainEventIngest,
  // collectionService, clientService, lawyerService, debtorService
  return new CaseService(stub, stub, stub, stub, stub, stub, stub, clientService, lawyerService, debtorService);
}

async function resolve(svc: CaseService, dto: any, actor?: any) {
  await (svc as any).resolveInlinePartiesInTx('tenant-1', dto, actor);
}

const INLINE_LAWYER = { name: 'Ada', surname: 'Lovelace' };
const INLINE_CREDITOR = { type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', identityNo: '11111111111' };

describe('AK-1a ardıl — inline avukat, inline müvekkilden ÖNCE oluşturulur', () => {
  it('sıra: assertCreateAuthorized → LawyerService.create → ClientService.create', async () => {
    const clientService = { create: jest.fn(async () => ({ id: 'client-new' })) };
    const lawyerService = {
      assertCreateAuthorized: jest.fn(async () => undefined),
      create: jest.fn(async () => ({ id: 'lawyer-new' })),
    };
    const svc = build(clientService, lawyerService, { create: jest.fn() });
    const dto: any = { creditors: [{ ...INLINE_CREDITOR }], lawyers: [{ ...INLINE_LAWYER }] };

    await resolve(svc, dto);

    const preCheck = lawyerService.assertCreateAuthorized.mock.invocationCallOrder[0];
    const lawyerCreate = lawyerService.create.mock.invocationCallOrder[0];
    const clientCreate = clientService.create.mock.invocationCallOrder[0];
    expect(preCheck).toBeLessThan(lawyerCreate);
    expect(lawyerCreate).toBeLessThan(clientCreate);
    expect(dto.lawyers[0].id).toBe('lawyer-new');
    expect(dto.creditors[0].id).toBe('client-new');
  });

  it('YARIŞ: ön kontrolden sonra kayıt ayrıcalıklı hale gelir → LawyerService.create 403; MÜVEKKİL YAZILMAZ', async () => {
    const clientService = { create: jest.fn(async () => ({ id: 'client-new' })) };
    const lawyerService = {
      // adım 0 ön kontrolü kaydı henüz ayrıcalıksız görür → geçer
      assertCreateAuthorized: jest.fn(async () => undefined),
      // create anında kayıt ayrıcalıklı: AK-2 otorite kuralı 403 verir
      create: jest.fn(async () => {
        throw new ForbiddenException(
          'Eşleşen kayıt ayrıcalıklı (PARTNER/MANAGER, izin değiştirme, izin kilidi veya ofis onayı) pasif bir avukat; yeniden etkinleştirme yalnız PARTNER veya ADMIN tarafından yapılabilir.',
        );
      }),
    };
    const svc = build(clientService, lawyerService, { create: jest.fn() });
    const dto: any = { creditors: [{ ...INLINE_CREDITOR }], lawyers: [{ ...INLINE_LAWYER }] };

    await expect(resolve(svc, dto)).rejects.toBeInstanceOf(ForbiddenException);

    expect(lawyerService.create).toHaveBeenCalledTimes(1);
    expect(clientService.create).not.toHaveBeenCalled(); // kritik: müvekkil satırı yazılmadı
    expect(dto.creditors[0].id).toBeUndefined();
  });

  it('VIEWER: adım 0 rol kapısı; ne avukat ne müvekkil create edilir', async () => {
    const clientService = { create: jest.fn() };
    const lawyerService = { assertCreateAuthorized: jest.fn(), create: jest.fn() };
    const svc = build(clientService, lawyerService, { create: jest.fn() });
    const dto: any = { creditors: [{ ...INLINE_CREDITOR }], lawyers: [{ ...INLINE_LAWYER }] };

    await expect(resolve(svc, dto, { role: 'VIEWER', userId: 'u-viewer' })).rejects.toBeTruthy();

    expect(lawyerService.assertCreateAuthorized).not.toHaveBeenCalled();
    expect(lawyerService.create).not.toHaveBeenCalled();
    expect(clientService.create).not.toHaveBeenCalled();
  });

  it('inline avukat YOKKEN (yalnız mevcut avukat id) müvekkil yolu değişmez', async () => {
    const clientService = { create: jest.fn(async () => ({ id: 'client-new' })) };
    const lawyerService = { assertCreateAuthorized: jest.fn(), create: jest.fn() };
    const svc = build(clientService, lawyerService, { create: jest.fn() });
    const dto: any = { creditors: [{ ...INLINE_CREDITOR }], lawyers: [{ id: 'lawyer-existing' }] };

    await resolve(svc, dto);

    expect(lawyerService.assertCreateAuthorized).not.toHaveBeenCalled();
    expect(lawyerService.create).not.toHaveBeenCalled();
    expect(clientService.create).toHaveBeenCalledTimes(1);
    expect(dto.creditors[0].id).toBe('client-new');
  });
});
