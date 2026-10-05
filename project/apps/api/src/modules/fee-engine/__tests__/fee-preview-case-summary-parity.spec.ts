import 'reflect-metadata';
import { CaseService } from '../../case/case.service';
import { TariffService } from '../../tariff/tariff.service';
import { FeeEngineService } from '../fee-engine.service';

/**
 * Sihirbaz önizlemesi ↔ dosya açıldıktan sonraki hesap özeti: AYNI girdi, AYNI masraf (owner kararı 12, kapanış ölçütü).
 *
 * Ölçülen kusur: aynı 10.000 TL genel alacak için sihirbaz paneli İCRA MASRAFLARI 0,00 gösteriyor, dosya açılınca hesap
 * özeti 1.431,10 yazıyordu. Burada GERÇEK `FeeEngineService.previewCalculation` (gerçek 2026 tarife dosyası) ile GERÇEK
 * `CaseService.getCalculationSummary` (Prisma yerine sahte veri katmanı; DB yok) karşılaştırılır.
 *
 * KAPSAM: yalnız masraf satırları. Vekalet ücreti formülü bu spec'te KARŞILAŞTIRILMAZ: iki yerde farklı formül vardır ve
 * hangisinin doğru olduğu hukuki karardır (owner kararı 12: seçilmedi). Dosya özeti masraf sabitlerini tarifeden OKUMAZ
 * (tarife yokken "hesaplanamadı" demez) — bu açık alt iştir; bu spec yalnız tutarların bugün eşit kalmasını kilitler.
 */
function makePrisma(principal: number, debtorCount: number) {
  return {
    case: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'case-1',
        type: 'GENERAL_EXECUTION',
        currency: 'TRY',
        principalAmount: principal,
        caseDate: new Date('2026-10-01T00:00:00.000Z'),
        dues: [{ id: 'due-1', type: 'ASIL_ALACAK', amount: principal, currency: 'TRY' }],
        collections: [],
        debtors: Array.from({ length: debtorCount }, (_, i) => ({ debtorId: `d${i}`, debtor: { name: `Borclu ${i}` } })),
        formType: null,
        claimItems: [],
        caseInstruments: [],
      }),
    },
    collectionAllocationHold: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('sihirbaz önizlemesi ↔ dosya hesap özeti — masraf eşitliği (gerçek 2026 tarifesi)', () => {
  const stub = {} as any;
  let fee: FeeEngineService;

  beforeAll(async () => {
    const tariffs = new TariffService();
    expect(tariffs.getTariff(2026)).toBeTruthy(); // test BAKTIĞI tarifeyi kanıtlar
    fee = new FeeEngineService(tariffs);
    await fee.onModuleInit();
  });

  it.each([
    [10_000, 1],
    [100_000, 1],
    [1_000_000, 2],
    [5_000_000, 3],
  ])('takip %s TL, %s borçlu: altı satır ve İCRA MASRAFLARI eşit', async (principal, debtorCount) => {
    const service = new CaseService(makePrisma(principal, debtorCount), stub, stub, stub, stub, stub, stub, stub, stub, stub);
    const summary: any = await service.getCalculationSummary('tenant-1', 'case-1', '2026-10-01');

    // Özet kalemi ASIL_ALACAK + takip öncesi faiz 0 → takipTutari = anapara; önizleme aynı matrahla çağrılır
    expect(summary.takipTutari).toBe(principal);
    const preview = fee.previewCalculation({ principalAmount: summary.takipTutari, takipTuruCode: 'ILAMSIZ_GENEL', debtorCount, tariffYear: 2026 });

    expect(preview.success).toBe(true);
    expect(preview.data!.breakdown).toEqual({
      basvurmaHarci: summary.basvurmaHarci,
      vekaletHarci: summary.vekaletHarci,
      pesinHarc: summary.pesinHarc,
      dosyaGideri: summary.dosyaGideri,
      tebligatGideri: summary.tebligatGideri,
      vekaletPulu: summary.vekaletPulu,
    });
    expect(preview.data!.estimatedFees).toBe(Math.round(summary.icraMasraflari * 100) / 100);
    // Sıfır olmayan: kusurun kendisi (panelde 0) bu testte kalıcı olarak yakalanır
    expect(preview.data!.estimatedFees).toBeGreaterThan(0);
  });
});
