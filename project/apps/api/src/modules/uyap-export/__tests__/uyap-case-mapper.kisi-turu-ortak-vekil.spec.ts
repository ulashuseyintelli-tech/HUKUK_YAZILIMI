/**
 * F02 kabul UB-8 (21.11.2026) — UYAP e-Takip XML: alacaklı kişi türü ve ortak vekiller.
 *
 * - Gerçek kişi müvekkil güncel `ClientType.PERSON` ile kayıtlıdır (`INDIVIDUAL` @deprecated). İkisi de
 *   `GERCEK_KISI` (ad / soyad) üretir; yalnız eski değeri tanımak gerçek kişiyi `TUZEL_KISI` + unvan yapıyordu.
 * - Ortak vekiller büronun TÜM avukatları değil, dışa aktarılan dosyaların HER BİRİNİN dosya ekibindeki etkin
 *   avukatlardır (kesişim). Dosya ekibinde olmayan avukat XML'e girmez.
 * Değerler sentetiktir.
 */
import { ClientType } from '@prisma/client';
import { UyapCaseMapperService } from '../uyap-case-mapper.service';

type TarafHarness = {
  mapClientToTaraf(client: any, rol: 'ALACAKLI' | 'BORCLU'): { kisi: { kisiTipi: string; ad?: string; soyad?: string; unvan?: string } };
};

const CLIENT = {
  tckn: '10000000000',
  vkn: null,
  firstName: 'Sentetik',
  lastName: 'Müvekkil',
  companyName: '',
  displayName: 'Sentetik Müvekkil',
  address: null,
  city: null,
  district: null,
  addresses: [],
};

const lawyer = (id: string, name: string, surname: string, sortOrder: number) => ({
  id,
  tenantId: 'tenant-a',
  name,
  surname,
  barNumber: `B-${id}`,
  tckn: null,
  barName: null,
  phone: null,
  email: null,
  isActive: true,
  sortOrder,
});

const A = lawyer('law-a', 'Dosya', 'Açan', 2);
const B = lawyer('law-b', 'Onay', 'Veren', 1);
const C = lawyer('law-c', 'Mali Yetkisi', 'Olmayan', 3);

function mapperWith(caseLawyerRows: Array<{ caseId: string; lawyer: any }>) {
  const prisma = {
    // Eski davranış büronun bütün avukatlarını buradan okuyordu; düzeltilmiş yol bu tabloyu KULLANMAMALI.
    lawyer: { findMany: jest.fn(async () => [A, B, C]) },
    caseLawyer: {
      findMany: jest.fn(async (args: any) =>
        caseLawyerRows.filter((row) => (args?.where?.caseId?.in ?? []).includes(row.caseId)),
      ),
    },
  };
  const mapper = new UyapCaseMapperService(prisma as any);
  jest
    .spyOn(mapper as any, 'mapCaseToTakipTalebi')
    .mockImplementation(async (caseId: any) => ({ dosyaBelirleyici: String(caseId) }) as any);
  return { mapper, prisma };
}

const vekilAdlari = (dosya: { ortakVekiller?: Array<{ ad: string; soyad: string }> }) =>
  (dosya.ortakVekiller ?? []).map((v) => `${v.ad} ${v.soyad}`);

describe('UB-8 — UYAP alacaklı kişi türü', () => {
  const taraf = (type: ClientType) =>
    (new UyapCaseMapperService({} as any) as unknown as TarafHarness).mapClientToTaraf({ ...CLIENT, type }, 'ALACAKLI').kisi;

  it('[1] gerçek kişi müvekkil (ClientType.PERSON) GERCEK_KISI + ad / soyad olarak yazılır; unvan yazılmaz', () => {
    const kisi = taraf(ClientType.PERSON);
    expect(kisi.kisiTipi).toBe('GERCEK_KISI');
    expect(kisi.ad).toBe('Sentetik');
    expect(kisi.soyad).toBe('Müvekkil');
    expect(kisi.unvan).toBeUndefined();
  });

  it('[2] eski kayıt (ClientType.INDIVIDUAL) aynı şekilde GERCEK_KISI kalır', () => {
    expect(taraf(ClientType.INDIVIDUAL).kisiTipi).toBe('GERCEK_KISI');
  });

  it('[3] kurum müvekkil (COMPANY / PUBLIC) TUZEL_KISI + unvan kalır', () => {
    for (const type of [ClientType.COMPANY, ClientType.PUBLIC]) {
      const kisi = (new UyapCaseMapperService({} as any) as unknown as TarafHarness).mapClientToTaraf(
        { ...CLIENT, type, companyName: 'Sentetik A.Ş.' },
        'ALACAKLI',
      ).kisi;
      expect(kisi.kisiTipi).toBe('TUZEL_KISI');
      expect(kisi.unvan).toBe('Sentetik A.Ş.');
      expect(kisi.ad).toBeUndefined();
    }
  });
});

describe('UB-8 — UYAP ortak vekiller dosya ekibinden gelir', () => {
  it('[4] tek dosya: yalnız o dosyanın ekibindeki avukatlar; ekipte olmayan avukat yok', async () => {
    const { mapper } = mapperWith([
      { caseId: 'case-1', lawyer: A },
      { caseId: 'case-1', lawyer: B },
    ]);
    const dosya = await mapper.mapCasesToETakipDosyasi(['case-1'], 'tenant-a');
    expect(vekilAdlari(dosya)).toEqual(['Onay Veren', 'Dosya Açan']);
    expect(vekilAdlari(dosya)).not.toContain('Mali Yetkisi Olmayan');
  });

  it('[5] toplu dışa aktarım: yalnız bütün dosyaların ekibinde ortak olan avukatlar (kesişim)', async () => {
    const { mapper } = mapperWith([
      { caseId: 'case-1', lawyer: A },
      { caseId: 'case-1', lawyer: B },
      { caseId: 'case-2', lawyer: B },
      { caseId: 'case-2', lawyer: C },
    ]);
    const dosya = await mapper.mapCasesToETakipDosyasi(['case-1', 'case-2'], 'tenant-a');
    expect(vekilAdlari(dosya)).toEqual(['Onay Veren']);
  });

  it('[6] ortak avukat yoksa ortak vekil listesi boştur (büro avukatlarıyla doldurulmaz)', async () => {
    const { mapper } = mapperWith([
      { caseId: 'case-1', lawyer: A },
      { caseId: 'case-2', lawyer: C },
    ]);
    const dosya = await mapper.mapCasesToETakipDosyasi(['case-1', 'case-2'], 'tenant-a');
    expect(vekilAdlari(dosya)).toEqual([]);
  });

  it('[7] sorgu büro sınırını ve yalnız etkin avukatı ister', async () => {
    const { mapper, prisma } = mapperWith([{ caseId: 'case-1', lawyer: B }]);
    await mapper.mapCasesToETakipDosyasi(['case-1', 'case-1'], 'tenant-a');
    const where = (prisma.caseLawyer.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.caseId).toEqual({ in: ['case-1'] });
    expect(where.case).toEqual({ tenantId: 'tenant-a' });
    expect(where.lawyer).toEqual({ tenantId: 'tenant-a', isActive: true });
    expect(prisma.lawyer.findMany).not.toHaveBeenCalled();
  });
});
