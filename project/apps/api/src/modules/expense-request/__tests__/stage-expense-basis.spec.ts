import { EXPENSE_SET_TEMPLATES } from '../expense-calculator.service';
import {
  basisDependentItemsOfTemplate,
  evaluateStageExpenseBasis,
  StageExpenseBasisNotCalculable,
  StageExpenseTemplate,
} from '../stage-expense-basis';

/**
 * Aşama masraf seti — oranlı kalemlerin matrahı TL olarak hesaplanabilir mi? (saf karar; hesap ve çevirme YOK)
 */
describe('evaluateStageExpenseBasis', () => {
  const notCalculable = (template: StageExpenseTemplate, input: Parameters<typeof evaluateStageExpenseBasis>[1]): StageExpenseBasisNotCalculable => {
    const decision = evaluateStageExpenseBasis(template, input);
    if (decision.calculable) throw new Error('beklenen: hesaplanamaz');
    return decision;
  };

  describe('şablon sınıflandırması: hangi kalem matraha bağlı?', () => {
    it('depodaki şablonların matraha bağlı kalemleri — tam liste', () => {
      const classified = Object.fromEntries(
        Object.values(EXPENSE_SET_TEMPLATES).map((template) => [template.code, basisDependentItemsOfTemplate(template).map((item) => item.itemCode)]),
      );

      expect(classified).toEqual({
        OPENING: ['PESIN_HARC'],
        RE_NOTIFICATION: [],
        SEIZURE: ['HACIZ_HARCI'],
        SALE: ['SATIS_HARCI'],
      });
    });

    it('sınıflandırılmamış (yeni) hesaplayıcı matraha bağlı sayılır: dövizli dosyada set oluşturulmaz, TL dosya etkilenmez', () => {
      const template: StageExpenseTemplate = {
        code: 'YENI',
        name: 'Yeni Aşama Masrafları',
        items: [
          { code: 'SABIT', label: 'Sabit Kalem', calculator: 'calculateHacizYolluk' },
          { code: 'BILINMEYEN', label: 'Bilinmeyen Kalem', calculator: 'calculateSonradanEklenen' },
        ],
      };

      expect(basisDependentItemsOfTemplate(template)).toEqual([{ itemCode: 'BILINMEYEN', label: 'Bilinmeyen Kalem' }]);
      expect(evaluateStageExpenseBasis(template, { caseCurrency: 'USD', basisRecordCurrencies: ['USD'] }).calculable).toBe(false);
      expect(evaluateStageExpenseBasis(template, { caseCurrency: 'TRY', basisRecordCurrencies: ['TRY'] })).toEqual({ calculable: true });
    });
  });

  describe.each([
    ['SEIZURE', 'Haciz Masrafları', 'HACIZ_HARCI', 'Haciz Harcı'],
    ['SALE', 'Satış Masrafları', 'SATIS_HARCI', 'Satış Harcı'],
  ] as const)('%s seti (oranlı kalem: %s → %s)', (stageCode, templateName, itemCode, label) => {
    const template = EXPENSE_SET_TEMPLATES[stageCode];

    it.each([
      ['dosya TRY, kalemler TRY', { caseCurrency: 'TRY', basisRecordCurrencies: ['TRY', 'TRY'] }],
      ['dosya TRY, anapara alacak kalemi yok', { caseCurrency: 'TRY', basisRecordCurrencies: [] }],
      ['küçük harf / boşluklu kod', { caseCurrency: ' try ', basisRecordCurrencies: ['try'] }],
      ['boş para birimi: şema varsayılanı (TRY) ve dosya para birimi', { caseCurrency: null, basisRecordCurrencies: [undefined, ''] }],
    ])('%s → hesaplanabilir (TL dosyanın bugünkü davranışı)', (_title, input) => {
      expect(evaluateStageExpenseBasis(template, input)).toEqual({ calculable: true });
    });

    it.each(['USD', 'EUR', 'GBP', 'CHF'])('dosya %s, kalemler aynı para biriminde → hesaplanamaz; tutar, kur ya da toplam üretilmez', (currency) => {
      const decision = notCalculable(template, { caseCurrency: currency, basisRecordCurrencies: [currency] });

      expect(decision).toEqual({
        calculable: false,
        reasonCode: 'STAGE_EXPENSE_FX_BASIS_POLICY_MISSING',
        stageCode,
        message: expect.stringContaining(`dosya para birimi ${currency}`),
        requiredInfo: [`${label} tutarı (TL)`],
        notCalculableItems: [{ itemCode, label }],
        caseCurrency: currency,
        basisCurrencies: [currency],
        tariffCurrency: 'TRY',
      });
      // Mesaj hangi set + hangi kalem + neden + sonraki adımı söyler; kur ya da tutar ÖNERMEZ
      expect(decision.message).toContain(`${templateName} talebi otomatik oluşturulmadı`);
      expect(decision.message).toContain(`${label} TL tarifesindeki oranla hesaplanır`);
      expect(decision.message).toContain('sistemde tanımlı değildir');
      expect(decision.message).toContain('elle girilerek');
      expect(decision.message).not.toMatch(/\d/);
      expect(Object.keys(decision).some((key) => /amount|total|tutar|toplam|rate|kur/i.test(key))).toBe(false);
    });

    it('dövizli dosyada anapara alacak kalemi yok → hesaplanamaz (0 matrahla asgari / sıfır tutar yazılmaz)', () => {
      expect(notCalculable(template, { caseCurrency: 'USD', basisRecordCurrencies: [] })).toMatchObject({
        caseCurrency: 'USD',
        basisCurrencies: ['USD'],
      });
    });

    it('dosya TRY, anapara kalemi USD → hesaplanamaz; uyuşmazlık bildirilir', () => {
      const decision = notCalculable(template, { caseCurrency: 'TRY', basisRecordCurrencies: ['USD'] });

      expect(decision.basisCurrencies).toEqual(['TRY', 'USD']);
      expect(decision.message).toContain('dosya para birimi (TRY) ile anapara kalemlerinin para birimi (USD) uyuşmuyor');
    });

    it('dosya USD, anapara kalemi TRY damgalı (eski kayıt) → hesaplanamaz; kalem TRY diye TL dosya sayılmaz', () => {
      const decision = notCalculable(template, { caseCurrency: 'USD', basisRecordCurrencies: ['TRY'] });

      expect(decision.basisCurrencies).toEqual(['TRY', 'USD']);
      expect(decision.message).toContain('dosya para birimi (USD) ile anapara kalemlerinin para birimi (TRY) uyuşmuyor');
    });

    it('anapara kalemleri birden fazla para biriminde → hesaplanamaz; para birimleri sıralı ve tekil', () => {
      const decision = notCalculable(template, { caseCurrency: 'USD', basisRecordCurrencies: ['USD', 'TRY', 'usd'] });

      expect(decision.basisCurrencies).toEqual(['TRY', 'USD']);
      expect(decision.message).toContain('anapara kalemleri birden fazla para biriminde (TRY, USD)');
    });
  });

  describe('RE_NOTIFICATION seti (oranlı kalemi yok)', () => {
    it.each([
      ['dosya TRY', { caseCurrency: 'TRY', basisRecordCurrencies: ['TRY'] }],
      ['dosya USD', { caseCurrency: 'USD', basisRecordCurrencies: ['USD'] }],
      ['dosya USD + TRY kalem', { caseCurrency: 'USD', basisRecordCurrencies: ['USD', 'TRY'] }],
    ])('%s → hesaplanabilir: tutarı matraha bağlı değildir', (_title, input) => {
      expect(evaluateStageExpenseBasis(EXPENSE_SET_TEMPLATES.RE_NOTIFICATION, input)).toEqual({ calculable: true });
    });
  });
});
