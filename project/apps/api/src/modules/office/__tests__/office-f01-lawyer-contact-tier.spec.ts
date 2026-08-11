import { projectF01Lawyer, projectF01Office } from '../office-f01-projection';

/**
 * PR-1.5 — AVUKAT İLETİŞİM ALANLARI KAPSAM SÖZLEŞMESİ.
 *
 * Bu spec iki YÖNLÜ bir sınırı sabitler ve ikisi de regresyona açıktır:
 *
 *  1. İletişim alanları yetkili aktöre GÖRÜNÜR olmalıdır. Görünmezse Avukat Düzenle
 *     ekranı kayıtlı değeri boş gösterir; form aynı boşluğu geri yazdığı için veri
 *     SESSİZCE SİLİNİR ve giriş daveti kartı e-posta bulamadığı için açılmaz.
 *  2. Kimlik/finans alanları HER İKİ erişim düzeyinde de GİZLİ kalmalıdır. Kapsam
 *     genişlemesi buradan sızmamalıdır.
 */

const CONTACT_FIELDS = [
  'email',
  'phone',
  'mobilePhone',
  'whatsappPhone',
  'fax',
  'address',
  'city',
  'district',
] as const;

/** Kimlik/finans — owner kararı gereği S1'e ALINMADI. */
const WITHHELD_FIELDS = [
  'tckn',
  'iban',
  'bankName',
  'branchName',
  'vergiDairesi',
  'vergiNo',
] as const;

const lawyer = {
  id: 'lawyer-1',
  tenantId: 'tenant-1',
  officeId: 'office-1',
  name: 'Ada',
  surname: 'Lovelace',
  displayName: 'Av. Ada Lovelace',
  lawyerRank: 'PARTNER',
  canApproveOfficeActions: true,
  barNumber: 'B-1',
  barCity: 'Istanbul',
  // iletişim
  email: 'ada@example.test',
  phone: '02120000000',
  mobilePhone: '05320000000',
  whatsappPhone: '05320000001',
  fax: '02120000001',
  address: 'Örnek Mah. 1',
  city: 'İstanbul',
  district: 'Kadıköy',
  // kimlik/finans — kapsam dışı
  tckn: '11111111110',
  iban: 'TR000000000000000000000000',
  bankName: 'Örnek Bank',
  branchName: 'Merkez',
  vergiDairesi: 'Kadıköy',
  vergiNo: '1234567890',
  // hard-deny credential
  uyapToken: 'raw-token',
  eSignatureSerial: 'raw-signature',
};

describe('PR-1.5 — avukat iletişim alanları kapsam sözleşmesi', () => {
  it('yetkili aktör TÜM iletişim alanlarını görür', () => {
    const out = projectF01Lawyer(lawyer, 'AUTHORIZED_S0_S1') as Record<string, unknown>;
    for (const field of CONTACT_FIELDS) {
      expect(out[field]).toBe(lawyer[field]);
    }
  });

  it('e-posta yetkili aktöre gelir — giriş daveti kartının tek girdisi', () => {
    const out = projectF01Lawyer(lawyer, 'AUTHORIZED_S0_S1') as Record<string, unknown>;
    expect(out.email).toBe('ada@example.test');
  });

  it('kimlik/finans alanları yetkili aktöre de KAPALI kalır', () => {
    const out = projectF01Lawyer(lawyer, 'AUTHORIZED_S0_S1') as Record<string, unknown>;
    for (const field of WITHHELD_FIELDS) {
      expect(out[field]).toBeUndefined();
    }
    expect(out.uyapToken).toBeUndefined();
    expect(out.eSignatureSerial).toBeUndefined();
  });

  it('yetkisiz aktör iletişim alanlarının HİÇBİRİNİ görmez (S0 sabit kalır)', () => {
    const out = projectF01Lawyer(lawyer, 'PUBLIC_S0_ONLY') as Record<string, unknown>;
    for (const field of [...CONTACT_FIELDS, ...WITHHELD_FIELDS]) {
      expect(out[field]).toBeUndefined();
    }
    // S0 kümesi GENİŞLEMEDİ.
    expect(out).toEqual({ barNumber: 'B-1', barCity: 'Istanbul' });
  });

  it('nested office yüzeyi avukatlara aynı sınıfı uygular', () => {
    const out = projectF01Office(
      { id: 'office-1', tenantId: 'tenant-1', name: 'Büro', lawyers: [lawyer] },
      'AUTHORIZED_S0_S1',
    ) as { lawyers?: Record<string, unknown>[] };
    const nested = out.lawyers?.[0] ?? {};
    expect(nested.email).toBe('ada@example.test');
    expect(nested.phone).toBe('02120000000');
    expect(nested.tckn).toBeUndefined();
    expect(nested.iban).toBeUndefined();
  });

  it('yetkisiz nested office yüzeyi de iletişim alanı SIZDIRMAZ', () => {
    const out = projectF01Office(
      { id: 'office-1', tenantId: 'tenant-1', name: 'Büro', lawyers: [lawyer] },
      'PUBLIC_S0_ONLY',
    ) as { lawyers?: Record<string, unknown>[] };
    const nested = out.lawyers?.[0] ?? {};
    for (const field of CONTACT_FIELDS) {
      expect(nested[field]).toBeUndefined();
    }
  });
});
