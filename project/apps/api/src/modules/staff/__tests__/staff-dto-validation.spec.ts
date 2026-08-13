/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / P5-B04 (S3) — typed DTO validation sözleşmesi.
 *
 * ÖLÇÜM: gövdeler `body: any` iken global ValidationPipe metatype `Object` gördüğü için
 * HİÇ çalışmıyordu. Bu spec, main.ts'teki GERÇEK global pipe seçenekleriyle
 * ({ whitelist: true, forbidNonWhitelisted: true, transform: true }) DTO davranışını kilitler:
 *
 *  1) Ölçülen tüketici sözleşmesi KIRILMAZ: cases/new StaffDetailModal GET /staff satırının
 *     TAMAMINI geri PUT eder (id/tenantId/officeId/userId/createdAt/updatedAt dahil) —
 *     bu payload 400 OLMAZ (@Allow passthrough).
 *  2) Tip çöpü reddedilir (canSeeFinance: "evet" → 400).
 *  3) Tanınmayan anahtar reddedilir (forbidNonWhitelisted).
 *  4) userId allow-map'te olmadığından persist yüzeyine hiçbir yeni serbestlik eklenmez
 *     (DTO yalnız tanır; servis allow-map'i yazmaz — staff.service.ts).
 */
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateStaffDto, UpdateStaffDto, UpdateStaffOrderDto } from '../dto/staff.dto';

// main.ts:20-26 ile AYNI seçenekler — global pipe'ın birebir aynası.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const body = (metatype: any) => ({ type: 'body' as const, metatype });

// GET /staff liste satırının TAM şekli (maskeli tckn dahil) — StaffDetailModal bunu geri PUT eder.
const fullRowPutPayload = () => ({
  id: 's1',
  tenantId: 't1',
  officeId: 'o1',
  firstName: 'Aysu',
  lastName: 'Aktay',
  tckn: '123****01',
  email: 'aysu@telli.example',
  phone: '0212',
  mobilePhone: '0532',
  whatsappPhone: null as any,
  staffType: 'STAJYER_AVUKAT',
  canCreateCase: true,
  canEditCase: true,
  canGenerateDocuments: false,
  canApproveDocuments: false,
  canSeeFinance: true,
  canApproveFinance: true,
  canPrepareCollectionDisposition: false,
  canSendNotifications: false,
  isDefaultForNewCases: true,
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  userId: 'u3',
});

describe('P5-B04 — UpdateStaffDto (PUT /staff/:id)', () => {
  it("ölçülen tam-satır PUT payload'ı 400 OLMAZ (StaffDetailModal akışı korunur)", async () => {
    const out: any = await pipe.transform(fullRowPutPayload(), body(UpdateStaffDto));
    expect(out.firstName).toBe('Aysu');
    // passthrough alanlar tanınır; persist kararını servis allow-map'i verir.
    expect(out.id).toBe('s1');
  });

  it("null'lu alanlar 400 üretmez — @IsOptional null VE undefined'ı atlar (ölçülen satırda null alan olabilir)", async () => {
    const payload = { ...fullRowPutPayload(), whatsappPhone: null, email: null };
    await expect(pipe.transform(payload, body(UpdateStaffDto))).resolves.toBeDefined();
  });

  it('tip çöpü reddedilir: canSeeFinance: "evet" → 400', async () => {
    await expect(
      pipe.transform({ firstName: 'A', canSeeFinance: 'evet' }, body(UpdateStaffDto)),
    ).rejects.toThrow(BadRequestException);
  });

  it('tanınmayan anahtar reddedilir: { hackField: 1 } → 400 (forbidNonWhitelisted)', async () => {
    await expect(
      pipe.transform({ firstName: 'A', hackField: 1 }, body(UpdateStaffDto)),
    ).rejects.toThrow(BadRequestException);
  });

  it('geçersiz staffType enum değeri → 400', async () => {
    await expect(
      pipe.transform({ staffType: 'OLMAYAN_TUR' }, body(UpdateStaffDto)),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('P5-B04 — CreateStaffDto (POST /staff)', () => {
  it("ayarlar formu payload'ı (form + forceCreate) geçer", async () => {
    const out: any = await pipe.transform(
      {
        firstName: 'Yeni',
        lastName: 'Personel',
        staffType: 'SEKRETER',
        canSeeFinance: false,
        forceCreate: true,
      },
      body(CreateStaffDto),
    );
    expect(out.forceCreate).toBe(true);
  });

  it('firstName zorunlu: eksikse 400', async () => {
    await expect(pipe.transform({ lastName: 'X' }, body(CreateStaffDto))).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('P5-B04 — UpdateStaffOrderDto (PUT /staff/order/update)', () => {
  it('geçerli: { staffIds: [ids] }', async () => {
    const out: any = await pipe.transform({ staffIds: ['a', 'b'] }, body(UpdateStaffOrderDto));
    expect(out.staffIds).toEqual(['a', 'b']);
  });

  it('geçersiz: staffIds dizi değil → 400', async () => {
    await expect(pipe.transform({ staffIds: 'a' }, body(UpdateStaffOrderDto))).rejects.toThrow(
      BadRequestException,
    );
  });
});
