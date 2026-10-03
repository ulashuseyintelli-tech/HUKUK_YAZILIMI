import { evaluateOpeningExpenseBasis } from '@/modules/expense-request/opening-expense-basis';
import { COST_PACKAGE_FX_BASIS_POLICY_MISSING, describeIncompleteSuggestion, isBasisDependentCalcRule } from '../cost-package-basis';

/**
 * Masraf paketi önerisi — matraha bağlı (oranlı) kalemin önerisi hesaplanabilir mi? (saf karar; hesap ve çevirme YOK)
 */
describe('isBasisDependentCalcRule', () => {
  it.each([
    ['peşin harç (depodaki sistem paketi)', { type: 'percentage', rate: 0.005, base: 'principalAmount', min: 100 }],
    ['üst sınırlı oran', { type: 'percentage', rate: 0.01, base: 'principalAmount', max: 3000 }],
    // Sınıflandırılmamış taban parasal matrah sayılır (güvenli taraf)
    ['bilinmeyen taban', { type: 'percentage', rate: 0.02, base: 'totalDebt' }],
    ['tabanı yazılmamış oran', { type: 'percentage', rate: 0.02 }],
  ])('%s → matraha bağlı', (_title, calcRule) => {
    expect(isBasisDependentCalcRule(calcRule)).toBe(true);
  });

  it.each([
    ['kural yok (sabit tutar)', null],
    ['kural tanımsız', undefined],
    ['adet bazlı (borçlu sayısı)', { type: 'per_unit', unitAmount: 15, multiplier: 'debtorCount' }],
    ['adet bazlı (tebligat sayısı)', { type: 'per_unit', unitAmount: 15, multiplier: 'tebligatCount' }],
    // Tabanı adet olan oran para birimi taşımaz
    ['oran, taban borçlu sayısı', { type: 'percentage', rate: 10, base: 'debtorCount' }],
    ['oran, taban tebligat sayısı', { type: 'percentage', rate: 10, base: 'tebligatCount' }],
    // Tanınmayan kural türü paket varsayılan tutarını alır (hesap bugün de böyle): matrahı kullanmaz
    ['tanınmayan kural türü', { type: 'tiered', base: 'principalAmount' }],
    ['nesne olmayan kural', 'percentage'],
    ['dizi', [{ type: 'percentage', base: 'principalAmount' }]],
  ])('%s → matrahtan bağımsız', (_title, calcRule) => {
    expect(isBasisDependentCalcRule(calcRule)).toBe(false);
  });
});

describe('describeIncompleteSuggestion', () => {
  const PACKAGE = 'UYAP Öncesi / Takip Açılış Masrafları';
  const PESIN = { itemCode: 'PESIN_HARC', label: 'Peşin Harç', isEditable: true, sortOrder: 3 };

  /** Matrahın TL olup olmadığı kararı açılış masraf setiyle AYNI kaynaktan gelir. */
  const basisOf = (caseCurrency: string, basisRecordCurrencies: string[]) => {
    const decision = evaluateOpeningExpenseBasis({ caseCurrency, basisRecordCurrencies });
    if (decision.calculable) throw new Error('beklenen: hesaplanamaz');
    return decision;
  };

  it.each(['USD', 'EUR', 'GBP', 'CHF'])('dosya %s → eksik öneri: neden + gereken bilgi; tutar, kur ya da toplam üretilmez', (currency) => {
    const suggestion = describeIncompleteSuggestion(PACKAGE, [PESIN], basisOf(currency, [currency]));

    expect(suggestion).toEqual({
      reasonCode: COST_PACKAGE_FX_BASIS_POLICY_MISSING,
      message:
        `${PACKAGE} paketinin önerisi eksik: dosya para birimi ${currency}. Peşin Harç anaparaya oran uygulanarak TL olarak ` +
        'hesaplanır; alacağın TL karşılığı için kullanılacak kur (tarih ve tür) sistemde tanımlı değildir. Peşin Harç ' +
        'hesaplanmadı, tutar çevrilmedi ve eksik tutar 0 sayılmadı; paket toplamı bu kalem olmadan eksiktir. Masraf talebi, ' +
        'kalemler elle girilerek oluşturulabilir.',
      requiredInfo: ['Peşin Harç tutarı (TL)'],
      notCalculableItems: [PESIN],
      caseCurrency: currency,
      basisCurrencies: [currency],
      tariffCurrency: 'TRY',
    });
    // Neden + sonraki adım; kur ya da tutar ÖNERİLMEZ ("0 sayılmadı" ifadesindeki rakam dışında sayı yok)
    expect(suggestion.message.replace('0 sayılmadı', '')).not.toMatch(/\d/);
    expect(Object.keys(suggestion).some((key) => /amount|total|tutar|toplam/i.test(key))).toBe(false);
    expect(suggestion.notCalculableItems.some((item) => Object.keys(item).some((key) => /amount|tutar/i.test(key)))).toBe(false);
  });

  it.each([
    ['dosya USD + TRY anapara kalemi', 'USD', ['USD', 'TRY']],
    ['dosya TRY + USD anapara kalemi', 'TRY', ['TRY', 'USD']],
    ['dosya USD, anapara kalemi TRY damgalı (eski kayıt)', 'USD', ['TRY']],
  ])('%s → karma: para birimleri sıralı ve tekil bildirilir', (_title, caseCurrency, recordCurrencies) => {
    const suggestion = describeIncompleteSuggestion(PACKAGE, [PESIN], basisOf(caseCurrency, recordCurrencies));

    expect(suggestion.caseCurrency).toBe(caseCurrency);
    expect(suggestion.basisCurrencies).toEqual(['TRY', 'USD']);
    expect(suggestion.message).toContain('paketinin önerisi eksik: dosyada birden fazla para birimi var (TRY, USD).');
  });

  it('birden fazla oranlı kalem: hepsi adıyla sayılır, gereken bilgi kalem başınadır', () => {
    const tahsil = { itemCode: 'TAHSIL_HARCI', label: 'Tahsil Harcı', isEditable: false, sortOrder: 7 };

    const suggestion = describeIncompleteSuggestion('Büro paketi', [PESIN, tahsil], basisOf('EUR', ['EUR']));

    expect(suggestion.notCalculableItems).toEqual([PESIN, tahsil]);
    expect(suggestion.requiredInfo).toEqual(['Peşin Harç tutarı (TL)', 'Tahsil Harcı tutarı (TL)']);
    expect(suggestion.message).toContain('Peşin Harç, Tahsil Harcı anaparaya oran uygulanarak TL olarak hesaplanır');
    expect(suggestion.message).toContain('Peşin Harç, Tahsil Harcı hesaplanmadı');
    expect(suggestion.message).toContain('paket toplamı bu kalemler olmadan eksiktir');
  });
});
