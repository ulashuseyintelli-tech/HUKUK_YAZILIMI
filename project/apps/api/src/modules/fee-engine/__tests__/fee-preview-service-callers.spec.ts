import 'reflect-metadata';
import { TariffService } from '../../tariff/tariff.service';
import { FeeEngineService } from '../fee-engine.service';

/**
 * `FeeEngineService.previewCalculation()` — ikinci çağıran: `CalcPreviewService` (POST /calc/preview/light; JWT'siz, hız sınırlı).
 *
 * Sihirbaz önizlemesi bu işlevi `requireCaseType: true` ile çağırır; `calc-preview` ise `caseType`'ı opsiyonel verir
 * (`calc-preview.service.ts`: `previewCalculation({ principalAmount, accruedInterest, caseType, debtorCount })`). Bu spec o ÇAĞRI
 * BİÇİMİNİN davranışını kilitler (PR #2932 ile değişen kısım):
 *  - `caseType` verilmezse eski varsayılan (ILAMSIZ) sürer;
 *  - `caseType` bir masraf profili koduysa (ILAMSIZ, KIRA …) hesap yapılır;
 *  - profil dışı `caseType` (eskiden sessiz success + 0; örn. ILAMSIZ_GENEL, GENERAL_EXECUTION) artık `CASE_TYPE_UNRESOLVED` döner;
 *  - toplam dosya gideri kadar artar (satırlarla tutar): ILAMSIZ 10.000 TL → 1.431,10 (eskiden 1.381,10).
 */
describe('previewCalculation — calc-preview çağrı biçimi (gerçek 2026 tarifesi)', () => {
  let service: FeeEngineService;

  beforeAll(async () => {
    const tariffs = new TariffService();
    expect(tariffs.getTariff(2026)).toBeTruthy(); // test BAKTIĞI tarifeyi kanıtlar
    service = new FeeEngineService(tariffs);
    await service.onModuleInit();
  });

  const calcPreviewGibi = (caseType?: string) =>
    service.previewCalculation({ principalAmount: 10_000, accruedInterest: 0, caseType, debtorCount: 1, tariffYear: 2026 });

  it('caseType verilmezse eski varsayılan (ILAMSIZ) sürer; toplam dosya gideri dahil', () => {
    const res = calcPreviewGibi(undefined);
    expect(res.success).toBe(true);
    expect(res.data!.estimatedFees).toBe(1431.1);
    expect(res.data!.breakdown.dosyaGideri).toBe(50);
  });

  it('masraf profili kodu (ILAMSIZ) çalışır', () => {
    expect(calcPreviewGibi('ILAMSIZ').data!.estimatedFees).toBe(1431.1);
  });

  it.each(['ILAMSIZ_GENEL', 'GENERAL_EXECUTION', 'ASIL_ALACAK'])(
    'profil dışı caseType "%s": sessiz success+0 değil, CASE_TYPE_UNRESOLVED (+ vekalet kısmı)',
    (caseType) => {
      const res = calcPreviewGibi(caseType);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('CASE_TYPE_UNRESOLVED');
      expect(res.data).toBeUndefined();
      expect(res.partial).toEqual({ estimatedAttorneyFee: 11000 });
    },
  );
});
