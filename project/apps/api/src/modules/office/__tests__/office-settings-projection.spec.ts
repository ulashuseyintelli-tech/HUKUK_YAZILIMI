// F-B01-03 — Office settings GET projeksiyonu (servis düzeyi; DB YOK).
//
// Bu spec ALAN PROJEKSİYONUNU ölçer; yetkilendirme AYRI spec'tedir
// (office-settings-get-authorization.http.spec.ts). Politika referansı FCM01:
//   S1  smtpHost/Port/User/Secure/From*, smsProvider/Sender, op*/caseTask* eşikleri, greeting/iik78/poaExpiry* sayısal-bayrak
//   S2  escalationManagerLawyerIds, escalationFounderLawyerIds, escalationTeamLeadLawyerIds, poaExpiryRecipientLawyerIds
//       (personel-hassas kayıt referansları — yalnız F01-yetkili yönetim yüzeyinde; yetkisiz aktöre asla ulaşmaz [guard])
//   S3  bankAccounts[*] (iban/bankName/...) — settings yanıtlarında HİÇ yer almaz
//   HD  smtpPass/smsApiKey/smsApiSecret ham değerleri — asla; yalnız '********' / null işareti (var/yok)
//
// Kapalı envanter: Office satırına eklenen bilinmeyen bir kolon settings yanıtlarına SIZMAZ (alan literalleri).
// Secret maskelemesi yetkilendirme SAYILMAZ — maskeli yanıt bile yetkisiz aktöre dönmez (guard testleri).
// Kanıt sınıfı: TEST. PRODUCTION DAVRANIŞ KANITI DEĞİLDİR.
import { OfficeService } from '../office.service';
import { OFFICE_S2_REFERENCE_FIELDS, omitOfficeS2References } from '../office-f01-projection';

const RAW_SMTP_SECRET = 'RAW-SMTP-SECRET-MUST-NOT-LEAK';
const RAW_SMS_KEY = 'RAW-SMS-KEY-MUST-NOT-LEAK';
const RAW_SMS_SECRET = 'RAW-SMS-SECRET-MUST-NOT-LEAK';
const UNKNOWN_COLUMN_VALUE = 'FUTURE-COLUMN-MUST-NOT-LEAK';

const FULL_OFFICE_ROW = {
  id: 'office-A',
  tenantId: 'tenant-A',
  name: 'Test Bürosu',
  address: 'adres',
  city: 'İstanbul',
  vergiNo: '1234567890',
  kepAddress: 'kep@hs01.kep.tr',
  smtpHost: 'smtp.example.invalid',
  smtpPort: 465,
  smtpUser: 'mailer',
  smtpPass: RAW_SMTP_SECRET,
  smtpSecure: true,
  smtpFromName: 'Büro',
  smtpFromEmail: 'noreply@example.invalid',
  smsProvider: 'NETGSM',
  smsApiKey: RAW_SMS_KEY,
  smsApiSecret: RAW_SMS_SECRET,
  smsSender: 'BURO',
  autoGreetingEnabled: true,
  autoGreetingTime: '09:00',
  lastGreetingRunAt: new Date('2026-09-05T06:00:00Z'),
  inactivityThresholdDays: 365,
  inactivityWarningDays: 60,
  escalationManagerLawyerIds: ['lawyer-m1'],
  escalationFounderLawyerIds: ['lawyer-f1'],
  escalationTeamLeadLawyerIds: ['lawyer-t1'],
  opReminderDays: 3,
  opFounderDays: 7,
  opRepeatMonths: 1,
  opEmailEnabled: true,
  opSmsEnabled: true,
  opStaffTypes: ['SEKRETER'],
  caseTaskOwnerDays: 2,
  caseTaskTeamLeadDays: 4,
  caseTaskManagerDays: 6,
  poaExpiryNotificationEnabled: true,
  poaExpiryThresholdDays: 30,
  poaExpiryRecipientLawyerIds: ['lawyer-p1'],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  futureSensitiveColumn: UNKNOWN_COLUMN_VALUE,
  bankAccounts: [{ id: 'b1', officeId: 'office-A', bankName: 'Banka', branchName: 'Şube', iban: 'TR000000000000000000000001', accountName: 'Hesap', isDefault: true }],
  lawyers: [{ id: 'lawyer-m1', name: 'A', surname: 'B', tckn: '11111111110', iban: 'TR000000000000000000000002', uyapToken: 'UYAP-TOKEN-MUST-NOT-LEAK', eSignatureSerial: 'ESIG' }],
};

function makeService(row: Record<string, unknown> = FULL_OFFICE_ROW) {
  const prisma = { office: { findUnique: jest.fn().mockResolvedValue(row) } };
  return new OfficeService(prisma as any, { log: jest.fn() } as any, undefined);
}

const EXPECTED_KEYS = {
  smtp: ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpSecure', 'smtpFromName', 'smtpFromEmail'],
  sms: ['smsProvider', 'smsApiKey', 'smsApiSecret', 'smsSender'],
  greeting: ['autoGreetingEnabled', 'autoGreetingTime'],
  iik78: ['inactivityThresholdDays', 'inactivityWarningDays'],
  poa: ['poaExpiryNotificationEnabled', 'poaExpiryThresholdDays', 'poaExpiryRecipientLawyerIds'],
  escalation: ['escalationManagerLawyerIds', 'escalationFounderLawyerIds', 'opReminderDays', 'opFounderDays', 'opRepeatMonths', 'opEmailEnabled', 'opSmsEnabled', 'opStaffTypes', 'escalationTeamLeadLawyerIds', 'caseTaskOwnerDays', 'caseTaskTeamLeadDays', 'caseTaskManagerDays'],
} as const;

const S2_KEYS = ['escalationManagerLawyerIds', 'escalationFounderLawyerIds', 'escalationTeamLeadLawyerIds', 'poaExpiryRecipientLawyerIds'];

function leakScan(payload: unknown): string[] {
  const s = JSON.stringify(payload);
  return [RAW_SMTP_SECRET, RAW_SMS_KEY, RAW_SMS_SECRET, UNKNOWN_COLUMN_VALUE, 'TR0000000000000000000000', '11111111110', 'UYAP-TOKEN', 'ESIG', 'bankAccounts', 'lawyers'].filter((needle) => s.includes(needle));
}

describe('F-B01-03 — settings projeksiyonu: kapalı envanter + HARD-DENY maskesi + S3/PII yokluğu', () => {
  const service = makeService();

  it('getSmtpSettings: EXACT anahtar kümesi; smtpPass maskeli; ham secret/S3/PII/bilinmeyen kolon sızmaz', async () => {
    const out = await service.getSmtpSettings('tenant-A');
    expect(Object.keys(out).sort()).toEqual([...EXPECTED_KEYS.smtp].sort());
    expect(out.smtpPass).toBe('********');
    expect(leakScan(out)).toEqual([]);
  });

  it('getSmsSettings: EXACT anahtar kümesi; smsApiKey/smsApiSecret maskeli; sızıntı 0', async () => {
    const out = await service.getSmsSettings('tenant-A');
    expect(Object.keys(out).sort()).toEqual([...EXPECTED_KEYS.sms].sort());
    expect(out.smsApiKey).toBe('********');
    expect(out.smsApiSecret).toBe('********');
    expect(leakScan(out)).toEqual([]);
  });

  it('getGreetingSettings / getIik78Settings: EXACT anahtar kümeleri (S1 sayısal/bayrak); sızıntı 0', async () => {
    const g = await service.getGreetingSettings('tenant-A');
    const i = await service.getIik78Settings('tenant-A');
    expect(Object.keys(g).sort()).toEqual([...EXPECTED_KEYS.greeting].sort());
    expect(Object.keys(i).sort()).toEqual([...EXPECTED_KEYS.iik78].sort());
    expect(leakScan(g)).toEqual([]);
    expect(leakScan(i)).toEqual([]);
  });

  it('getPoaExpirySettings / getEscalationSettings (SERVİS, iç tüketici): EXACT anahtar kümeleri; S2 referansları servis düzeyinde mevcut; sızıntı 0', async () => {
    const p = await service.getPoaExpirySettings('tenant-A');
    const e = await service.getEscalationSettings('tenant-A');
    expect(Object.keys(p).sort()).toEqual([...EXPECTED_KEYS.poa].sort());
    expect(Object.keys(e).sort()).toEqual([...EXPECTED_KEYS.escalation].sort());
    // Servis getter'ları iç tüketiciler (ör. bildirim genel bakışı) için S2 listelerini döndürür;
    // HTTP okuma yüzeyinde omisyon controller sınırında yapılır (omitOfficeS2References; HTTP spec ölçer).
    for (const k of S2_KEYS) {
      const present = Object.prototype.hasOwnProperty.call(p, k) || Object.prototype.hasOwnProperty.call(e, k);
      expect({ k, present }).toEqual({ k, present: true });
    }
    expect(leakScan(p)).toEqual([]);
    expect(leakScan(e)).toEqual([]);
  });

  it('omitOfficeS2References: HTTP sınırı projeksiyonu — 4 S2 anahtarını düşürür, diğerlerini korur, girdiyi DEĞİŞTİRMEZ', async () => {
    const e = await service.getEscalationSettings('tenant-A');
    const p = await service.getPoaExpirySettings('tenant-A');
    const eo = omitOfficeS2References(e as Record<string, unknown>);
    const po = omitOfficeS2References(p as Record<string, unknown>);
    expect(Object.keys(eo).sort()).toEqual(EXPECTED_KEYS.escalation.filter((k) => !S2_KEYS.includes(k)).sort());
    expect(Object.keys(po).sort()).toEqual(EXPECTED_KEYS.poa.filter((k) => !S2_KEYS.includes(k)).sort());
    for (const k of S2_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(eo, k)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(po, k)).toBe(false);
    }
    // girdi dokunulmadı (iç tüketici aynı nesneyi kullanabilir)
    expect(Object.prototype.hasOwnProperty.call(e, 'escalationManagerLawyerIds')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(p, 'poaExpiryRecipientLawyerIds')).toBe(true);
    // S2 anahtarı olmayan nesne aynen geçer; sabit liste tam 4 alan
    expect(omitOfficeS2References({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
    expect([...OFFICE_S2_REFERENCE_FIELDS].sort()).toEqual([...S2_KEYS].sort());
  });

  it('boş secret: smtpPass/smsApiKey null → null (var/yok işareti, değer değil)', async () => {
    const svc = makeService({ ...FULL_OFFICE_ROW, smtpPass: null, smsApiKey: null, smsApiSecret: '' });
    const smtp = await svc.getSmtpSettings('tenant-A');
    const sms = await svc.getSmsSettings('tenant-A');
    expect(smtp.smtpPass).toBeNull();
    expect(sms.smsApiKey).toBeNull();
    expect(sms.smsApiSecret).toBeNull();
  });

  it('projeksiyon fonksiyonları aktör almaz → yetkilendirme projeksiyonda DEĞİL guard katmanındadır (maskeleme ≠ yetki)', () => {
    expect(service.getSmtpSettings.length).toBe(1);
    expect(service.getSmsSettings.length).toBe(1);
    expect(service.getEscalationSettings.length).toBe(1);
    expect(service.getPoaExpirySettings.length).toBe(1);
    expect(service.getGreetingSettings.length).toBe(1);
    expect(service.getIik78Settings.length).toBe(1);
  });
});
