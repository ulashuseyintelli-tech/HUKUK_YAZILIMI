import {
  buildOpeningExpenseNotCreatedOutcome,
  evaluateOpeningExpenseBasis,
  openingExpenseBasisInputOfCase,
  OpeningExpenseBasisNotCalculable,
} from '../opening-expense-basis';

/**
 * Açılış masraf seti — peşin harç matrahı TL olarak hesaplanabilir mi? (saf karar; hesap ve çevirme YOK)
 */
describe('evaluateOpeningExpenseBasis', () => {
  const notCalculable = (input: Parameters<typeof evaluateOpeningExpenseBasis>[0]): OpeningExpenseBasisNotCalculable => {
    const decision = evaluateOpeningExpenseBasis(input);
    if (decision.calculable) throw new Error('beklenen: hesaplanamaz');
    return decision;
  };

  it.each([
    ['dosya TRY, kalemler TRY', { caseCurrency: 'TRY', basisRecordCurrencies: ['TRY', 'TRY'] }],
    ['dosya TRY, kalem yok (matrah dosya anaparası)', { caseCurrency: 'TRY', basisRecordCurrencies: [] }],
    ['küçük harf / boşluklu kod', { caseCurrency: ' try ', basisRecordCurrencies: ['try'] }],
    ['boş para birimi: şema varsayılanı (TRY) ve dosya para birimi', { caseCurrency: null, basisRecordCurrencies: [undefined, ''] }],
  ])('%s → hesaplanabilir', (_title, input) => {
    expect(evaluateOpeningExpenseBasis(input)).toEqual({ calculable: true });
  });

  it.each(['USD', 'EUR', 'GBP', 'CHF'])('dosya %s, kalemler aynı para biriminde → hesaplanamaz; tutar, kur ya da toplam üretilmez', (currency) => {
    const decision = notCalculable({ caseCurrency: currency, basisRecordCurrencies: [currency] });

    expect(decision).toEqual({
      calculable: false,
      reasonCode: 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING',
      message: expect.stringContaining(`dosya para birimi ${currency}`),
      requiredInfo: ['Peşin harç tutarı (TL)'],
      notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
      caseCurrency: currency,
      basisCurrencies: [currency],
      tariffCurrency: 'TRY',
    });
    // Mesaj neden + sonraki adımı söyler; kur ya da tutar ÖNERMEZ
    expect(decision.message).toContain('otomatik oluşturulmadı');
    expect(decision.message).toContain('sistemde tanımlı değildir');
    expect(decision.message).toContain('elle girilerek');
    expect(decision.message).not.toMatch(/\d/);
  });

  it('dövizli dosyada kalem yok (matrah dosya anaparası) → hesaplanamaz', () => {
    expect(notCalculable({ caseCurrency: 'USD', basisRecordCurrencies: [] })).toMatchObject({
      caseCurrency: 'USD',
      basisCurrencies: ['USD'],
    });
  });

  it('dosya TRY, anapara kalemi USD → hesaplanamaz; uyuşmazlık bildirilir', () => {
    const decision = notCalculable({ caseCurrency: 'TRY', basisRecordCurrencies: ['USD'] });

    expect(decision.basisCurrencies).toEqual(['TRY', 'USD']);
    expect(decision.message).toContain('dosya para birimi (TRY) ile anapara kalemlerinin para birimi (USD) uyuşmuyor');
  });

  it('dosya USD, anapara kalemi TRY damgalı (eski kayıt) → hesaplanamaz; kalem TRY diye TL dosya sayılmaz', () => {
    const decision = notCalculable({ caseCurrency: 'USD', basisRecordCurrencies: ['TRY'] });

    expect(decision.basisCurrencies).toEqual(['TRY', 'USD']);
    expect(decision.message).toContain('dosya para birimi (USD) ile anapara kalemlerinin para birimi (TRY) uyuşmuyor');
  });

  it('anapara kalemleri birden fazla para biriminde → hesaplanamaz; para birimleri sıralı ve tekil', () => {
    const decision = notCalculable({ caseCurrency: 'TRY', basisRecordCurrencies: ['USD', 'TRY', 'EUR', 'usd'] });

    expect(decision.basisCurrencies).toEqual(['EUR', 'TRY', 'USD']);
    expect(decision.message).toContain('anapara kalemleri birden fazla para biriminde (EUR, TRY, USD)');
  });
});

describe('openingExpenseBasisInputOfCase', () => {
  it('anapara kalemi (Due) varsa matrah kayıtları onlardır; alacak kalemleri (ClaimItem) dikkate alınmaz', () => {
    expect(
      openingExpenseBasisInputOfCase({
        currency: 'TRY',
        dues: [{ currency: 'TRY' }],
        claimItems: [{ currency: 'USD' }],
      }),
    ).toEqual({ caseCurrency: 'TRY', basisRecordCurrencies: ['TRY'] });
  });

  it('anapara kalemi yoksa alacak kalemleri; o da yoksa kayıt yok (dosya anaparası)', () => {
    expect(openingExpenseBasisInputOfCase({ currency: 'USD', dues: [], claimItems: [{ currency: 'USD' }, { currency: 'EUR' }] })).toEqual({
      caseCurrency: 'USD',
      basisRecordCurrencies: ['USD', 'EUR'],
    });
    expect(openingExpenseBasisInputOfCase({ currency: 'USD' })).toEqual({ caseCurrency: 'USD', basisRecordCurrencies: [] });
  });
});

describe('buildOpeningExpenseNotCreatedOutcome', () => {
  it('kararı açılış yanıtı sonucuna çevirir: tutar alanı yoktur; e-posta gönderilmedi bilgisi açıktır', () => {
    const decision = evaluateOpeningExpenseBasis({ caseCurrency: 'USD', basisRecordCurrencies: ['USD'] });
    if (decision.calculable) throw new Error('beklenen: hesaplanamaz');

    const outcome = buildOpeningExpenseNotCreatedOutcome(decision, true);

    expect(outcome).toEqual({
      status: 'NOT_CREATED',
      reasonCode: decision.reasonCode,
      message: decision.message,
      requiredInfo: decision.requiredInfo,
      notCalculableItems: decision.notCalculableItems,
      caseCurrency: 'USD',
      basisCurrencies: ['USD'],
      tariffCurrency: 'TRY',
      expenseEmailRequested: true,
      expenseEmailSent: false,
    });
    expect(Object.keys(outcome).some((key) => /amount|total|tutar|toplam/i.test(key))).toBe(false);
    expect(buildOpeningExpenseNotCreatedOutcome(decision, false).expenseEmailRequested).toBe(false);
  });
});
