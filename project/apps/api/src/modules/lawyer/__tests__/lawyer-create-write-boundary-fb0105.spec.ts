/**
 * OFFICE-FB0105-LAWYER-CREATE-WRITE-BOUNDARY-R01 — `POST /api/lawyers` yazma sınırı.
 *
 * ÖLÇÜLEN KÖK NEDEN (bu spec yazılmadan önce kaynakta doğrulandı):
 *   `LawyerController.create` gövdesini bir DTO SINIFI ile değil, satır-içi TypeScript tip
 *   literali ile tipliyordu. Nest'in global `ValidationPipe`ı ({ whitelist: true,
 *   forbidNonWhitelisted: true }) metatype `Object` gördüğünde HİÇ çalışmaz — tip runtime'da
 *   silinir. Gövde olduğu gibi servise ulaşıyor ve `LawyerService.create` onu
 *   `prisma.lawyer.create({ data: { tenantId, officeId, sortOrder, ...data } })` içine
 *   SPREAD ediyordu. `...data` EN SONDA olduğu için güvenilen alanları da EZİYORDU.
 *
 *   Aynı kusur sınıfı staff tarafında F-B03-03 olarak kapatılmıştı (typed DTO + wiring spec);
 *   avukat ucunda kapatılmamıştı. `update` yolu zaten güvenliydi: açık `writeData` allow-list
 *   + `validateLawyerUpdateInput`. Kırık olan YALNIZ `create`.
 *
 * F-B01-05 BAĞI: `Lawyer.uyapToken` şema yorumu "// Şifrelenmiş" diyor ama şifreleme kodu YOK.
 *   Kayıt "alana yazan hiçbir servis yolu yok" diyordu — bu ÖNCÜL BAYATTI: create yolu alanı
 *   yazabiliyordu. Yani düz metin bir UYAP oturum kimlik bilgisi, "şifreli" sanılarak
 *   saklanabilirdi. Bu spec o yolu kapatır.
 *
 * KAPSAM SINIRI: bu spec create'in HANGİ alanları persist ettiğini sabitler. Ayrıcalıklı
 *   alanların (lawyerRank/defaultPermissions/permissionsLocked/canModifyOtherPermissions/
 *   canApproveOfficeActions) create'te H2/K1-4b otorite kontrolünden GEÇMEMESİ ayrı bir
 *   kalemdir (owner ürün kararı) ve burada BİLEREK değiştirilmez — mevcut davranış korunur.
 */
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import 'reflect-metadata';
import { LawyerService } from '../lawyer.service';
import { CreateLawyerDto } from '../dto/create-lawyer.dto';

const TENANT = 't-trusted';
const OTHER_TENANT = 't-victim';

const build = () => {
  const prisma: any = {
    lawyer: {
      findMany: jest.fn().mockResolvedValue([]), // duplicate guard → eşleşme yok
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 3 } }),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'NEW', ...data })),
      update: jest.fn(),
    },
    office: { findUnique: jest.fn().mockResolvedValue({ id: 'O-trusted' }) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  return { svc: new LawyerService(prisma, audit, officeApproval), prisma };
};

/** Servisin prisma'ya GERÇEKTEN yazdığı `data` nesnesi. */
const writtenData = (prisma: any) => prisma.lawyer.create.mock.calls[0][0].data;

// main.ts:21-25 ile AYNI seçenekler — global pipe'ın birebir aynası.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const body = (metatype: any) => ({ type: 'body' as const, metatype });

const MINIMAL = { name: 'Ada', surname: 'Lovelace' };

describe('F-B01-05 — LawyerService.create credential alanlarını YAZMAZ', () => {
  it.each(['uyapToken', 'eSignatureSerial', 'uyapUsername'])(
    '%s gövdeden gelse bile prisma.create verisine GEÇMEZ',
    async (field) => {
      const { svc, prisma } = build();
      await svc.create(TENANT, { ...MINIMAL, [field]: 'SENTETIK-KIMLIK-BILGISI' } as never);
      const data = writtenData(prisma);
      expect(field in data).toBe(false);
      expect(JSON.stringify(data)).not.toContain('SENTETIK-KIMLIK-BILGISI');
    },
  );
});

describe('F-B01-05 — create tenant sınırını gövdeyle EZDİREMEZ', () => {
  it('body.tenantId güvenilen tenantId\'yi EZMEZ (cross-tenant yazma yok)', async () => {
    const { svc, prisma } = build();
    await svc.create(TENANT, { ...MINIMAL, tenantId: OTHER_TENANT } as never);
    expect(writtenData(prisma).tenantId).toBe(TENANT);
  });

  it('body.officeId sunucunun çözdüğü office\'i EZMEZ', async () => {
    const { svc, prisma } = build();
    await svc.create(TENANT, { ...MINIMAL, officeId: 'O-victim' } as never);
    expect(writtenData(prisma).officeId).toBe('O-trusted');
  });

  it('body.sortOrder sunucunun hesapladığı sırayı EZMEZ', async () => {
    const { svc, prisma } = build();
    await svc.create(TENANT, { ...MINIMAL, sortOrder: -999 } as never);
    expect(writtenData(prisma).sortOrder).toBe(4); // max(3) + 1
  });

  it.each(['id', 'userId', 'createdAt', 'updatedAt', 'permissionsLockedBy', 'permissionsLockedAt'])(
    'sunucu denetimindeki alan %s gövdeden YAZILAMAZ',
    async (field) => {
      const { svc, prisma } = build();
      await svc.create(TENANT, { ...MINIMAL, [field]: 'ENJEKTE' } as never);
      expect(field in writtenData(prisma)).toBe(false);
    },
  );
});

describe('F-B01-05 — meşru create sözleşmesi KORUNUR (regresyon)', () => {
  it('profil alanları aynen persist edilir', async () => {
    const { svc, prisma } = build();
    await svc.create(TENANT, {
      name: 'Ada', surname: 'Lovelace', tckn: '12345678901', gender: 'K',
      barNumber: 'B-1', barCity: 'Istanbul', tbbNo: 'T-1',
      vergiDairesi: 'VD', vergiNo: '111', email: 'ada@ornek.test',
      phone: '0212', mobilePhone: '0532', whatsappPhone: '0532', fax: '0216',
      address: 'Adres', city: 'Istanbul', district: 'Kadikoy',
      bankName: 'Banka', branchName: 'Sube', iban: 'TR330006100519786457841326',
      isInHouseCounsel: false, isEmployee: true, role: 'EMPLOYEE' as never,
      title: 'Av.', canSign: true, canAppearInUyap: true, canBeResponsible: true,
      isDefaultForNewCases: true,
    } as never);
    const data = writtenData(prisma);
    expect(data.name).toBe('Ada');
    expect(data.tckn).toBe('12345678901');
    expect(data.iban).toBe('TR330006100519786457841326');
    expect(data.email).toBe('ada@ornek.test');
    expect(data.title).toBe('Av.');
    expect(data.canSign).toBe(true);
    expect(data.isDefaultForNewCases).toBe(true);
    expect(data.role).toBe('EMPLOYEE');
  });

  it('UI\'nin create\'te ayarladığı rütbe/yetki alanları persist edilmeye DEVAM eder (davranış DEĞİŞMEDİ)', async () => {
    // settings/office LawyerModal create'te bunları gönderir ve `handleRankChange`
    // seçilen rütbeye göre GERÇEKTEN değiştirir (page.tsx:1605-1607, 1634+).
    // Bu alanların create'te H2 otorite kontrolünden geçmemesi AYRI bir kalemdir
    // (owner ürün kararı); bu lane o davranışı DEĞİŞTİRMEZ.
    const { svc, prisma } = build();
    await svc.create(TENANT, {
      ...MINIMAL,
      lawyerRank: 'PARTNER' as never,
      permissionsLocked: true,
      canModifyOtherPermissions: true,
      defaultPermissions: { canSeeFinance: true },
    } as never);
    const data = writtenData(prisma);
    expect(data.lawyerRank).toBe('PARTNER');
    expect(data.permissionsLocked).toBe(true);
    expect(data.canModifyOtherPermissions).toBe(true);
    expect(data.defaultPermissions).toEqual({ canSeeFinance: true });
  });

  it('canApproveOfficeActions create\'te YAZILMAZ — UI sözleşmesi zaten bunu varsayıyor', async () => {
    // page.tsx:1608-1609 yorumu: "yalniz duzenleme modunda anlamli; create DTO'su kabul etmiyor".
    // Create DTO'su HİÇ YOKTU, dolayısıyla bu sözleşme zorlanmıyordu. UI create'te değeri her
    // zaman `false` gönderir (şema varsayılanı da false) → engellemek gerçek akış için ETKİSİZ,
    // ama K1-4b delegation bayrağının guard'sız enjeksiyon yolunu KAPATIR.
    const { svc, prisma } = build();
    await svc.create(TENANT, { ...MINIMAL, canApproveOfficeActions: true } as never);
    expect('canApproveOfficeActions' in writtenData(prisma)).toBe(false);
  });

  it('duplicate guard dalı bozulmaz: mevcut avukat varsa create ÇAĞRILMAZ', async () => {
    const { svc, prisma } = build();
    prisma.lawyer.findMany.mockResolvedValueOnce([
      { id: 'L-old', name: 'Ada', surname: 'Lovelace', isActive: true, tenantId: TENANT },
    ]);
    const res: any = await svc.create(TENANT, MINIMAL as never);
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
    expect(res._existingReturned).toBe(true);
  });
});

describe('F-B01-05 — CreateLawyerDto global pipe sözleşmesi', () => {
  it('UI create payload\'ı 400 OLMAZ (LawyerModal akışı korunur)', async () => {
    const out: any = await pipe.transform(
      {
        name: 'Ada', surname: 'Lovelace', tckn: '12345678901', email: 'ada@ornek.test',
        phone: '0212', mobilePhone: '0532', title: 'Av.', role: 'EMPLOYEE',
        lawyerRank: 'LAWYER', permissionsLocked: false, canApproveOfficeActions: false,
        defaultPermissions: { canSeeFinance: false },
        isInHouseCounsel: false, isEmployee: true, canSign: true,
        canAppearInUyap: false, canBeResponsible: false, isDefaultForNewCases: false,
      },
      body(CreateLawyerDto),
    );
    expect(out.name).toBe('Ada');
    expect(out.lawyerRank).toBe('LAWYER');
  });

  it.each(['uyapToken', 'eSignatureSerial', 'uyapUsername'])(
    'credential alanı %s DTO düzeyinde REDDEDİLİR (forbidNonWhitelisted → 400)',
    async (field) => {
      await expect(
        pipe.transform({ ...MINIMAL, [field]: 'x' }, body(CreateLawyerDto)),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('tenantId DTO düzeyinde REDDEDİLİR (cross-tenant enjeksiyon HTTP\'de durur)', async () => {
    await expect(
      pipe.transform({ ...MINIMAL, tenantId: OTHER_TENANT }, body(CreateLawyerDto)),
    ).rejects.toThrow(BadRequestException);
  });

  it('tip çöpü reddedilir: canSign: "evet" → 400', async () => {
    await expect(
      pipe.transform({ ...MINIMAL, canSign: 'evet' }, body(CreateLawyerDto)),
    ).rejects.toThrow(BadRequestException);
  });

  it('zorunlu alan eksikse reddedilir: surname yok → 400', async () => {
    await expect(pipe.transform({ name: 'Ada' }, body(CreateLawyerDto))).rejects.toThrow(
      BadRequestException,
    );
  });
});
