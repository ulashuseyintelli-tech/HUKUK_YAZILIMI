/**
 * OFFICE-PUT-BODY-BOUNDARY — `OfficeController` yazma uçlarının gövde sınırı.
 *
 * ÖLÇÜLEN KÖK NEDEN: gövde satır-içi TypeScript tip literali ile tipliydi; tip runtime'da silinir,
 * global `ValidationPipe` (main.ts: whitelist + forbidNonWhitelisted + transform) metatype `Object`
 * görüp HİÇ çalışmıyordu ve servis gövdeyi aynen `prisma.office.update({ data })`a veriyordu:
 * F01-yetkili ama ADMIN olmayan aktör `PUT /office {smtpHost|smtpPass|...}` ile `assertCredentialAdmin`ı
 * ve ACT-02 şifrelemesini atlıyor, her ayar ucu her Office sütununu (tenantId, id, havuz dizileri)
 * yazabiliyordu. Bu spec iki katmanı sabitler: (1) uç başına DTO SINIFI + global pipe'ın aynası,
 * (2) servisin açık alan haritası (HTTP dışı çağıranlar için ikinci savunma).
 *
 * "allowlist + tam-form PUT" tuzağı: ekranın (settings/office/page.tsx) bugün gönderdiği alanların
 * TAMAMI tanınmalı; tanınmayan alan 400 verir ve ekranı kırar (FB0105'te aynı tuzak yaşandı).
 */
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { Prisma } from '@prisma/client';
import { OfficeController } from '../office.controller';
import { OfficeService } from '../office.service';
import {
  OFFICE_ESCALATION_FIELDS,
  OFFICE_ESCALATION_POOL_FIELDS,
  OFFICE_GREETING_FIELDS,
  OFFICE_IIK78_FIELDS,
  OFFICE_POA_EXPIRY_FIELDS,
  OFFICE_PROFILE_FIELDS,
  OFFICE_SMS_FIELDS,
  OFFICE_SMTP_FIELDS,
  UpdateEscalationSettingsDto,
  UpdateGreetingSettingsDto,
  UpdateIik78SettingsDto,
  UpdateOfficeDto,
  UpdatePoaExpirySettingsDto,
  UpdateSmsSettingsDto,
  UpdateSmtpSettingsDto,
} from '../dto/office-settings.dto';

// main.ts:19-25 ile AYNI seçenekler — global pipe'ın birebir aynası.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const run = (dto: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype: dto });

type Surface = {
  handler: keyof OfficeController;
  dto: new () => object;
  fields: readonly string[];
  /** Ekranın / web istemcisinin / teslim betiğinin bugün GERÇEKTEN gönderdiği gövdeler. */
  uiBodies: Record<string, unknown>[];
};

const SURFACES: Surface[] = [
  {
    handler: 'updateOffice', dto: UpdateOfficeDto, fields: OFFICE_PROFILE_FIELDS,
    uiBodies: [
      // page.tsx handleSaveOffice: officeForm (14 alan, boş alan "" olarak gider)
      { name: 'Büro', address: '', city: '', district: '', postalCode: '', phone: '', fax: '', email: '', website: '', barAssociation: '', vergiNo: '', vergiDairesi: '', mersisNo: '', kepAddress: '' },
      { city: 'Kabul-1' }, // ow-03-settings.js S-01
    ],
  },
  {
    handler: 'updateSmtpSettings', dto: UpdateSmtpSettingsDto, fields: OFFICE_SMTP_FIELDS,
    uiBodies: [
      // page.tsx handleSaveSmtp: smtpForm (boş smtpPass silinir)
      { smtpHost: '', smtpPort: 587, smtpUser: '', smtpSecure: false, smtpFromName: '', smtpFromEmail: '' },
      { smtpHost: 'h', smtpPort: 2525, smtpUser: 'u', smtpPass: 'p', smtpSecure: true, smtpFromName: 'n', smtpFromEmail: 'e' },
      { smtpPort: null }, // parseInt("") → NaN → JSON null: bugün sütunu temizler
      { smtpHost: 'smtp.invalid', smtpPort: 2525 }, // ow-03-settings.js S-03
    ],
  },
  {
    handler: 'updateSmsSettings', dto: UpdateSmsSettingsDto, fields: OFFICE_SMS_FIELDS,
    uiBodies: [
      { smsProvider: '', smsSender: '' }, // page.tsx handleSaveSms (boş anahtar / sır silinir)
      { smsProvider: 'NETGSM', smsApiKey: 'k', smsApiSecret: 's', smsSender: 'x' },
    ],
  },
  {
    handler: 'updateGreetingSettings', dto: UpdateGreetingSettingsDto, fields: OFFICE_GREETING_FIELDS,
    uiBodies: [{ autoGreetingEnabled: true, autoGreetingTime: '09:00' }],
  },
  {
    handler: 'updateIik78Settings', dto: UpdateIik78SettingsDto, fields: OFFICE_IIK78_FIELDS,
    uiBodies: [{ inactivityThresholdDays: 41 }, { inactivityThresholdDays: 365, inactivityWarningDays: 60 }], // lib/api/office.ts Partial<Iik78Settings>
  },
  {
    handler: 'updatePoaExpirySettings', dto: UpdatePoaExpirySettingsDto, fields: OFFICE_POA_EXPIRY_FIELDS,
    uiBodies: [{ poaExpiryThresholdDays: 33 }, { poaExpiryNotificationEnabled: false, poaExpiryThresholdDays: 30, poaExpiryRecipientLawyerIds: [] }],
  },
  {
    handler: 'updateEscalationSettings', dto: UpdateEscalationSettingsDto, fields: OFFICE_ESCALATION_FIELDS,
    uiBodies: [
      // page.tsx handleSaveEscalation: liste alanları yalnız yüklendiyse gider (burada hiçbiri yok)
      { opReminderDays: 3, opFounderDays: 6, opRepeatMonths: 3, opEmailEnabled: true, opSmsEnabled: true, opStaffTypes: ['MUHASEBE', 'ADLI_KATIP', 'SEKRETER'], caseTaskOwnerDays: 2, caseTaskTeamLeadDays: 2, caseTaskManagerDays: 3 },
      // ... ve üç liste de yüklenmişse
      { opReminderDays: 3, opFounderDays: 6, opRepeatMonths: 3, opEmailEnabled: true, opSmsEnabled: false, opStaffTypes: [], caseTaskOwnerDays: 2, caseTaskTeamLeadDays: 2, caseTaskManagerDays: 3, escalationManagerLawyerIds: ['a'], escalationFounderLawyerIds: [], escalationTeamLeadLawyerIds: ['b'] },
      { opReminderDays: 7 }, // ow-03-settings.js S-08
    ],
  },
];

/** Her alan için o alanın sütun türüne uyan GEÇERLİ örnek değer. */
const SAMPLE: Record<string, unknown> = {
  ...Object.fromEntries(OFFICE_PROFILE_FIELDS.map((f) => [f, 'x'])),
  smtpHost: 'h', smtpPort: 587, smtpUser: 'u', smtpPass: 'p', smtpSecure: true, smtpFromName: 'n', smtpFromEmail: 'e',
  smsProvider: 'p', smsApiKey: 'k', smsApiSecret: 's', smsSender: 'x',
  autoGreetingEnabled: false, autoGreetingTime: '09:30',
  inactivityThresholdDays: 1, inactivityWarningDays: 1,
  poaExpiryNotificationEnabled: true, poaExpiryThresholdDays: 1, poaExpiryRecipientLawyerIds: ['a'],
  escalationManagerLawyerIds: ['a'], escalationFounderLawyerIds: ['a'], escalationTeamLeadLawyerIds: ['a'],
  opReminderDays: 1, opFounderDays: 1, opRepeatMonths: 1, opEmailEnabled: true, opSmsEnabled: false,
  opStaffTypes: ['ARSIV'], caseTaskOwnerDays: 1, caseTaskTeamLeadDays: 1, caseTaskManagerDays: 1,
};

describe('OfficeController — yazma uçları gövde SINIFIyla tipli (satır-içi literal DEĞİL)', () => {
  it.each(SURFACES)('$handler: gövde parametresinin metatype\'ı $dto.name (Object DEĞİL)', ({ handler, dto }) => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, OfficeController, handler as string) as Record<string, { index: number }>;
    const bodyKey = Object.keys(args).find((k) => k.startsWith(`${RouteParamtypes.BODY}:`));
    expect(bodyKey).toBeDefined();
    const types = Reflect.getMetadata('design:paramtypes', OfficeController.prototype, handler as string) as unknown[];
    expect(types[args[bodyKey as string].index]).toBe(dto);
  });
});

describe.each(SURFACES)('$handler — global ValidationPipe sınırı', ({ dto, fields, uiBodies }) => {
  it('ekranın / istemcinin bugün gönderdiği HER gövde kabul edilir (tam-form PUT tuzağı)', async () => {
    for (const body of uiBodies) {
      await expect(run(dto, { ...body })).resolves.toBeDefined();
    }
  });

  it('haritadaki her alan, türüne uygun değerle tek başına kabul edilir', async () => {
    for (const field of fields) {
      await expect(run(dto, { [field]: SAMPLE[field] })).resolves.toBeDefined();
    }
  });

  it('haritada OLMAYAN HER Office sütunu 400 ile reddedilir (kimlik / kiracı / havuz / diğer uçların alanları dahil)', async () => {
    const scalars = Object.values(Prisma.OfficeScalarFieldEnum) as string[];
    expect(scalars.length).toBeGreaterThan(40); // 0 sütun taraması KÖR olurdu
    const outside = scalars.filter((c) => !fields.includes(c));
    expect(outside.length).toBeGreaterThan(0);
    for (const column of outside) {
      await expect(run(dto, { [column]: SAMPLE[column] ?? 'x' })).rejects.toBeInstanceOf(BadRequestException);
    }
    // ilişki alanları ve uydurma anahtar
    for (const key of ['tenant', 'bankAccounts', 'lawyers', 'workPoolMemberships', 'olmayanSutun']) {
      await expect(run(dto, { [key]: { connect: { id: 'x' } } })).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('Prisma alan işleçleri ve null davranışı', () => {
  it('işleç nesneleri ({set} / {increment} / {push}) tür doğrulamasında reddedilir', async () => {
    await expect(run(UpdateOfficeDto, { phone: { set: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateIik78SettingsDto, { inactivityThresholdDays: { increment: 5 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateEscalationSettingsDto, { escalationManagerLawyerIds: { push: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('null alamayan sütunlar null ile 400 olur (Prisma 500\'ü yerine); nullable sütunlar null kabul eder', async () => {
    await expect(run(UpdateOfficeDto, { name: null })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateGreetingSettingsDto, { autoGreetingEnabled: null })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateIik78SettingsDto, { inactivityThresholdDays: null })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateEscalationSettingsDto, { opStaffTypes: null })).rejects.toBeInstanceOf(BadRequestException);
    // bugünkü davranış KORUNUR: nullable sütun null ile temizlenebilir
    await expect(run(UpdateOfficeDto, { phone: null })).resolves.toBeDefined();
    await expect(run(UpdateSmtpSettingsDto, { smtpPort: null })).resolves.toBeDefined();
    await expect(run(UpdateGreetingSettingsDto, { autoGreetingTime: null })).resolves.toBeDefined();
  });

  it('tür uyuşmazlığı reddedilir: sayı alanına dize, diziye dize, geçersiz StaffType', async () => {
    await expect(run(UpdateEscalationSettingsDto, { opReminderDays: '3' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdatePoaExpirySettingsDto, { poaExpiryRecipientLawyerIds: 'tek-dize' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateEscalationSettingsDto, { opStaffTypes: ['YOK'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateSmtpSettingsDto, { smtpPort: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(run(UpdateOfficeDto, { name: 123 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DEĞER kuralı EKLENMEZ (bu iş yalnız tür / alan sınırıdır): bugün kabul edilen değerler kabul edilmeye devam eder', async () => {
    await expect(run(UpdateIik78SettingsDto, { inactivityThresholdDays: -5 })).resolves.toBeDefined();
    await expect(run(UpdateSmtpSettingsDto, { smtpPort: -1 })).resolves.toBeDefined();
    await expect(run(UpdateGreetingSettingsDto, { autoGreetingTime: '99:99' })).resolves.toBeDefined();
    await expect(run(UpdateSmtpSettingsDto, { smtpPass: '' })).resolves.toBeDefined();
  });
});

// ─────────────────────────── servis allow-list'i (ikinci savunma) ───────────────────────────

const OFFICE_ROW = {
  id: 'office-A', tenantId: 'tenant-A', name: 'Büro',
  smtpPass: null, smsApiKey: null, smsApiSecret: null, bankAccounts: [], lawyers: [],
};

function make() {
  const prisma = {
    office: {
      findUnique: jest.fn().mockResolvedValue(OFFICE_ROW),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...OFFICE_ROW, ...data })),
    },
  };
  const audit = { log: jest.fn() };
  const service = new OfficeService(prisma as any, audit as any, undefined);
  const applyTargetState = jest.fn(async (params: { legacyPassthrough?: Record<string, unknown> }) => ({
    office: { ...OFFICE_ROW, ...(params.legacyPassthrough ?? {}) },
  }));
  (service as unknown as { workPoolMutation: unknown }).workPoolMutation = { applyTargetState };
  return { service, prisma, audit, applyTargetState };
}

/** HTTP'de pipe'ın reddedeceği, ama başka bir çağıranın verebileceği "kötü niyetli" gövde. */
const HOSTILE: Record<string, unknown> = {
  tenantId: 'tenant-VICTIM', id: 'office-STOLEN', createdAt: '2001-01-01T00:00:00.000Z', lastGreetingRunAt: '2099-01-01T00:00:00.000Z',
  smtpHost: 'evil.example.test', smtpPass: 'DUZ-METIN', smsApiKey: 'DUZ-METIN', smsApiSecret: 'DUZ-METIN', smsSender: 'EVIL',
  defaultExecutionOfficeId: 'yabanci', escalationManagerLawyerIds: ['x'], escalationFounderLawyerIds: ['x'], opStaffTypes: ['ARSIV'],
  poaExpiryRecipientLawyerIds: ['x'], tenant: { connect: { id: 'tenant-VICTIM' } },
};

const NEVER_WRITTEN_BY = (allowed: readonly string[]) => Object.keys(HOSTILE).filter((k) => !allowed.includes(k));

describe('OfficeService — açık alan haritası: gövdede ne olursa olsun prisma\'ya YALNIZ harita anahtarları gider', () => {
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  beforeAll(() => { process.env.CREDENTIAL_ENCRYPTION_KEY = 'office-write-body-boundary-test-key'; });
  afterAll(() => { if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY; else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey; });

  const cases: { ad: string; allowed: readonly string[]; call: (s: OfficeService) => Promise<unknown>; section: string }[] = [
    { ad: 'update', allowed: OFFICE_PROFILE_FIELDS, section: 'OFFICE', call: (s) => s.update('tenant-A', { ...HOSTILE, name: 'Yeni' } as any, 'u1') },
    { ad: 'updateSmtpSettings', allowed: OFFICE_SMTP_FIELDS, section: 'SMTP', call: (s) => s.updateSmtpSettings('tenant-A', { ...HOSTILE } as any, 'u1') },
    { ad: 'updateSmsSettings', allowed: OFFICE_SMS_FIELDS, section: 'SMS', call: (s) => s.updateSmsSettings('tenant-A', { ...HOSTILE } as any, 'u1') },
    { ad: 'updateGreetingSettings', allowed: OFFICE_GREETING_FIELDS, section: 'GREETING', call: (s) => s.updateGreetingSettings('tenant-A', { ...HOSTILE, autoGreetingEnabled: false } as any, 'u1') },
    { ad: 'updateIik78Settings', allowed: OFFICE_IIK78_FIELDS, section: 'IIK78', call: (s) => s.updateIik78Settings('tenant-A', { ...HOSTILE, inactivityThresholdDays: 400 } as any, 'u1') },
    { ad: 'updatePoaExpirySettings', allowed: OFFICE_POA_EXPIRY_FIELDS, section: 'POA_EXPIRY', call: (s) => s.updatePoaExpirySettings('tenant-A', { ...HOSTILE, poaExpiryThresholdDays: 20 } as any, 'u1') },
  ];

  it.each(cases)('$ad: prisma.office.update(data) ve denetim kaydı haritanın DIŞINA çıkmaz', async ({ allowed, call, section }) => {
    const { service, prisma, audit } = make();
    await call(service);
    const data = prisma.office.update.mock.calls[0][0].data as Record<string, unknown>;
    for (const key of Object.keys(data)) expect(allowed).toContain(key);
    for (const forbidden of NEVER_WRITTEN_BY(allowed)) expect(Object.prototype.hasOwnProperty.call(data, forbidden)).toBe(false);
    // `where` güvenilen büro kimliğine bağlı kalır (gövdeden `id` / `tenantId` ezemez)
    expect(prisma.office.update.mock.calls[0][0].where).toEqual({ id: 'office-A' });
    // denetim kaydı: yalnız haritadaki anahtarlar
    const entry = audit.log.mock.calls[0][0];
    expect(entry.metadata).toEqual({ section });
    for (const key of [...Object.keys(entry.newValues), ...Object.keys(entry.oldValues)]) expect(allowed).toContain(key);
  });

  it('update: SMTP / SMS / kiracı alanları gövdede gelse bile hiç yazılmaz (ölçülen kimlik-kapısı atlama)', async () => {
    const { service, prisma } = make();
    await service.update('tenant-A', { smtpHost: 'evil', smtpPass: 'DUZ-METIN', tenantId: 'v', name: 'Ok' } as any, 'u1');
    expect(prisma.office.update.mock.calls[0][0].data).toEqual({ name: 'Ok' });
  });

  it('updateSmtpSettings: haritadaki smtpPass hâlâ ŞİFRELENEREK yazılır (ACT-02 yolu bozulmadı)', async () => {
    const { service, prisma } = make();
    await service.updateSmtpSettings('tenant-A', { smtpHost: 'h', smtpPass: 'gizli', smsApiKey: 'DUZ-METIN' } as any, 'u1');
    const data = prisma.office.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(String(data.smtpPass).startsWith('enc:v1:')).toBe(true);
    expect(data.smtpHost).toBe('h');
    expect(Object.prototype.hasOwnProperty.call(data, 'smsApiKey')).toBe(false);
  });

  it('updateEscalationSettings: havuz DIŞI passthrough yalnız eskalasyon haritasından; kimlik / SMTP / tenantId geçmez', async () => {
    const { service, applyTargetState, audit } = make();
    await service.updateEscalationSettings('tenant-A', {
      ...HOSTILE, opReminderDays: 5, escalationTeamLeadLawyerIds: ['t1'], caseTaskOwnerDays: 4,
    } as any, 'u1');
    const params = applyTargetState.mock.calls[0][0] as { source: { targetStates: Record<string, unknown> }; legacyPassthrough: Record<string, unknown> };
    // havuz alanları primitive'e hedef durum olarak gider, passthrough'a ASLA girmez
    expect(Object.keys(params.source.targetStates).sort()).toEqual(['ESCALATION_FOUNDER', 'ESCALATION_MANAGER', 'OP_STAFF_TYPE']);
    expect(params.legacyPassthrough).toEqual({ opReminderDays: 5, escalationTeamLeadLawyerIds: ['t1'], caseTaskOwnerDays: 4 });
    for (const pool of OFFICE_ESCALATION_POOL_FIELDS) expect(Object.prototype.hasOwnProperty.call(params.legacyPassthrough, pool)).toBe(false);
    const entry = audit.log.mock.calls[0][0];
    for (const key of Object.keys(entry.newValues)) expect(OFFICE_ESCALATION_FIELDS).toContain(key);
  });

  it('gönderilmeyen alan KORUNUR: undefined değerler haritadan geçse bile prisma\'ya girmez', async () => {
    const { service, prisma } = make();
    await service.updateGreetingSettings('tenant-A', { autoGreetingEnabled: undefined, autoGreetingTime: '10:00' } as any, 'u1');
    expect(prisma.office.update.mock.calls[0][0].data).toEqual({ autoGreetingTime: '10:00' });
  });
});
