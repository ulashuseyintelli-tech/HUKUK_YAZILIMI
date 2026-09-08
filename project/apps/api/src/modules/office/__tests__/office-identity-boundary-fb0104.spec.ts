/**
 * F-B01-04 — `OfficeService` ham `Office` satırının MODÜL SINIRINI geçmesi.
 *
 * BULGU (P5 B01 §9): `getOrCreate` public'ti ve ham satır döndürüyordu; modül dışı beş
 * tüketici (client-approval, client-intake-link, client-statement,
 * client-statement-monthly-delivery, expense-request) onu çağırıp YALNIZ `office.name`
 * okuyordu. Bu tüketicilerin çıktısı MÜVEKKİLE GİDEN bildirim token'ı / PDF'tir; ham
 * satırın oraya kadar taşınması gereksizdi ve tek bir `...office` yayılımı sızıntı üretirdi.
 *
 * BU SPEC NE KANITLAR:
 *   1. Ham satırın BUGÜN hangi hassas alanları taşıdığı — iddia değil, ÖLÇÜM (T1).
 *   2. `getOfficeIdentity` yüzeyinin YALNIZ `name` taşıdığı (T2/T3).
 *   3. Tenant sınırının korunduğu (T4).
 *   4. `getOrCreate` semantiğinin (yoksa yarat) DEĞİŞMEDİĞİ (T5).
 *
 * NE KANITLAMAZ (dürüstlük sınırı): çapraz-modül çağrılarının geri gelmeyeceğini bu spec
 * kanıtlamaz — onu `office-raw-row-cross-module.static-guard.spec.ts` kaynak taraması yapar.
 * Bir davranış testi yarın eklenecek yeni bir çağıranı FARK EDEMEZ.
 */
import { OfficeService } from '../office.service';

const TENANT = 't-fb0104';
const audit: any = { log: jest.fn(), logInTransaction: jest.fn() };

/** Prisma'nın `select` olmadan döndürdüğü TAM `Office` satırı (sentetik değerler). */
const FULL_OFFICE_ROW = {
  id: 'O1',
  tenantId: TENANT,
  name: 'Telli Hukuk Bürosu',

  // Office-düzeyi secret'lar (at-rest şifreli veya legacy düz-metin olarak SAKLANIR)
  smtpHost: 'smtp.example.invalid',
  smtpUser: 'buro@example.invalid',
  smtpPass: 'SENTETIK-SMTP-PAROLA',
  smsProvider: 'NETGSM',
  smsApiKey: 'SENTETIK-SMS-API-KEY',
  smsApiSecret: 'SENTETIK-SMS-API-SECRET',

  // S2 referans dizileri (F-B01-03 / OFF-P2-CAP-07 kapsamı)
  escalationManagerLawyerIds: ['L1'],
  escalationFounderLawyerIds: ['L2'],
  escalationTeamLeadLawyerIds: [],
  poaExpiryRecipientLawyerIds: ['L1'],

  bankAccounts: [
    { id: 'BA1', bankName: 'X Bank', iban: 'TR330006100519786457841326', accountName: 'Telli Hukuk' },
  ],
  lawyers: [
    {
      id: 'L1',
      name: 'Ada',
      surname: 'Lovelace',
      tckn: '12345678901',
      iban: 'TR120006100519786457841327',
      email: 'ada@example.invalid',
      phone: '+90000000000',
      uyapUsername: 'uyap-user',
      isActive: true,
    },
  ],
};

function buildService(row: any = FULL_OFFICE_ROW) {
  const prisma: any = {
    office: {
      findUnique: jest.fn().mockResolvedValue(row),
      create: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(row),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'T' }) },
    $transaction: jest.fn(async (fn: any) =>
      fn({
        office: { create: jest.fn().mockResolvedValue({ ...row, createdAt: new Date(0) }) },
        officeWorkPoolEpoch: { createMany: jest.fn() },
      }),
    ),
  };
  return { svc: new OfficeService(prisma, audit), prisma };
}

/** Hassas anahtarlar — biri bile dışarı çıkarsa müvekkil e-postasına girebilir. */
const SENSITIVE_KEYS = [
  'smtpPass',
  'smsApiKey',
  'smsApiSecret',
  'escalationManagerLawyerIds',
  'escalationFounderLawyerIds',
  'escalationTeamLeadLawyerIds',
  'poaExpiryRecipientLawyerIds',
  'lawyers',
  'bankAccounts',
];

describe('F-B01-04 — ham Office satirinin modul siniri', () => {
  // T1 — KUSURUN ÖLÇÜMÜ. Bu test ham yüzeyin bugün ne taşıdığını SABİTLER; `getOrCreate`
  // ileride daraltılırsa burası kırılır ve karar bilinçli alınır.
  it('T1 — getOrCreate ham satiri: Office secret + S2 + lawyers/bankAccounts TASIR', async () => {
    const { svc } = buildService();
    const raw: any = await svc.getOrCreate(TENANT);

    expect(raw.smtpPass).toBe('SENTETIK-SMTP-PAROLA');
    expect(raw.smsApiKey).toBe('SENTETIK-SMS-API-KEY');
    expect(raw.smsApiSecret).toBe('SENTETIK-SMS-API-SECRET');
    expect(raw.escalationManagerLawyerIds).toEqual(['L1']);
    expect(raw.poaExpiryRecipientLawyerIds).toEqual(['L1']);
    expect(raw.lawyers[0].tckn).toBe('12345678901');
    expect(raw.lawyers[0].iban).toBe('TR120006100519786457841327');
    expect(raw.bankAccounts[0].iban).toBe('TR330006100519786457841326');

    // Zaten kapatılmış olan (P01 / #1932): avukat credential alanlari ham yuzeyde de YOK.
    expect('uyapToken' in raw.lawyers[0]).toBe(false);
    expect('eSignatureSerial' in raw.lawyers[0]).toBe(false);
  });

  it('T2 — getOfficeIdentity YALNIZ name doner (tam anahtar kumesi)', async () => {
    const { svc } = buildService();
    const identity = await svc.getOfficeIdentity(TENANT);

    expect(Object.keys(identity)).toEqual(['name']);
    expect(identity.name).toBe('Telli Hukuk Bürosu');
  });

  it('T3 — getOfficeIdentity ciktisinda hicbir hassas anahtar/deger YOK', async () => {
    const { svc } = buildService();
    const identity: any = await svc.getOfficeIdentity(TENANT);

    for (const key of SENSITIVE_KEYS) {
      expect(key in identity).toBe(false);
    }
    // Serilestirilmis govdede de sentetik sirlarin izi olmamali (nested kacak yakalar).
    const serialized = JSON.stringify(identity);
    for (const secret of [
      'SENTETIK-SMTP-PAROLA',
      'SENTETIK-SMS-API-KEY',
      'SENTETIK-SMS-API-SECRET',
      '12345678901',
      'TR330006100519786457841326',
      'TR120006100519786457841327',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('T4 — tenant siniri: sorgu cagiranin tenantId ile yapilir, baska tenant adi sizmaz', async () => {
    const { svc, prisma } = buildService();
    await svc.getOfficeIdentity(TENANT);
    expect(prisma.office.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT } }),
    );

    const other = buildService({ ...FULL_OFFICE_ROW, tenantId: 't-other', name: 'Baska Buro' });
    const identity = await other.svc.getOfficeIdentity('t-other');
    expect(identity.name).toBe('Baska Buro');
    expect(other.prisma.office.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't-other' } }),
    );
  });

  it('T5 — "yoksa yarat" semantigi DEGISMEDI: office yoksa olusturulur ve adi doner', async () => {
    const { svc, prisma } = buildService();
    prisma.office.findUnique.mockResolvedValueOnce(null);
    // Havuz anchor yazimi bu spec'in konusu DEGIL (kendi db-gated suite'i var); burada
    // yalnizca "yoksa yarat" dalinin hala yurudugu ve daralmis yuzeyin dogru dondugu olculur.
    (svc as any).workPoolMutation = { materializeProvisioningSnapshot: jest.fn() };

    const identity = await svc.getOfficeIdentity(TENANT);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(identity.name).toBe('Telli Hukuk Bürosu');
    expect(Object.keys(identity)).toEqual(['name']);
  });
});
