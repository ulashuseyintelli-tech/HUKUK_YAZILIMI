import {
  buildCalculationSummaryCurrencyStatus,
  type CalculationSummaryCurrencyField,
  type CalculationSummaryCurrencyInput,
} from '../case-calculation-summary-currency';

/**
 * Hesap özeti para birimi bağlamı — DAVRANIŞ SÖZLEŞMESİ (saf birim testi).
 *
 * Kural: yardımcı hesap yapmaz ve tutar çevirmez. Dövizli alacağa TL tarifesi oranı uygulanarak bulunan alanlar
 * HESAPLANAMADI, farklı para birimlerini tek sayıda toplayan alanlar GOSTERILEMEZ; bilinen tutarlar kendi para
 * birimiyle GECERLI kalır. Dövizli alacakta harç / vekalet ücreti kuralı (tutar ve kur) owner kararıdır.
 */
const CLAIM: CalculationSummaryCurrencyField[] = [
  'asilAlacak', 'tazminat', 'komisyon', 'takipOncesiFaiz', 'takipTutari', 'takipSonrasiFaiz', 'kalanAnapara',
];
const RECEIPT: CalculationSummaryCurrencyField[] = ['toplamTahsilat', 'hesapTarihindenSonrakiTahsilat'];
const TARIFF_FIXED: CalculationSummaryCurrencyField[] = [
  'basvurmaHarci', 'vekaletHarci', 'dosyaGideri', 'tebligatGideri', 'vekaletPulu',
];
const TARIFF_RATE: CalculationSummaryCurrencyField[] = [
  'pesinHarc', 'icraMasraflari', 'pesinHarcDahilTahsilHarci', 'pesinHarcHaricTahsilHarci', 'vekaletUcreti',
];
const TOTAL: CalculationSummaryCurrencyField[] = ['toplamBorc', 'sonBorc', 'kalanBorc', 'tahsilOranlari'];
const ALL_FIELDS = [...CLAIM, ...RECEIPT, 'mahsubuBekleyenTahsilat' as const, ...TARIFF_FIXED, ...TARIFF_RATE, ...TOTAL];

const input = (overrides: Partial<CalculationSummaryCurrencyInput>): CalculationSummaryCurrencyInput => ({
  caseCurrency: 'TRY',
  principalAmounts: [],
  penaltyAmounts: [],
  collectionAmounts: [],
  heldAmounts: [],
  ...overrides,
});

const pick = (status: ReturnType<typeof buildCalculationSummaryCurrencyStatus>, fields: CalculationSummaryCurrencyField[]) =>
  fields.map((field) => status.alanlar[field]);

describe('Hesap özeti para birimi bağlamı (buildCalculationSummaryCurrencyStatus)', () => {
  it('her alan için tam bir karar üretir (eksik alan yok)', () => {
    const status = buildCalculationSummaryCurrencyStatus(input({}));
    expect(Object.keys(status.alanlar).sort()).toEqual([...ALL_FIELDS].sort());
  });

  it('TL dosya: tek toplam gösterilebilir; bütün alanlar TRY ve geçerli', () => {
    const status = buildCalculationSummaryCurrencyStatus(
      input({
        principalAmounts: [{ amount: 10_000, currency: 'TRY' }],
        collectionAmounts: [{ amount: 1_000, currency: 'TRY' }],
      }),
    );

    expect(status).toMatchObject({
      dosyaParaBirimi: 'TRY',
      tarifeParaBirimi: 'TRY',
      durum: 'TEK_PARA_BIRIMI_TL',
      toplamGosterilebilir: true,
      gerekce: null,
      mesaj: null,
      alacakParaBirimi: 'TRY',
      asilAlacakParaBirimiBazinda: [{ paraBirimi: 'TRY', tutar: 10_000 }],
      tahsilatParaBirimiBazinda: [{ paraBirimi: 'TRY', tutar: 1_000 }],
    });
    expect(Object.values(status.alanlar)).toEqual(ALL_FIELDS.map(() => ({ paraBirimi: 'TRY', durum: 'GECERLI' })));
  });

  it('dövizli dosya (tek para birimi): alacak ve tahsilat kendi para biriminde; oranlı TL kalemler HESAPLANAMADI; toplamlar GOSTERILEMEZ', () => {
    const status = buildCalculationSummaryCurrencyStatus(
      input({
        caseCurrency: 'USD',
        principalAmounts: [{ amount: 10_000, currency: 'USD' }],
        collectionAmounts: [{ amount: 1_000, currency: 'USD' }],
      }),
    );

    expect(status).toMatchObject({
      dosyaParaBirimi: 'USD',
      durum: 'TEK_PARA_BIRIMI_DOVIZ',
      toplamGosterilebilir: false,
      gerekce: 'DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
      alacakParaBirimi: 'USD',
      asilAlacakParaBirimiBazinda: [{ paraBirimi: 'USD', tutar: 10_000 }],
      tahsilatParaBirimiBazinda: [{ paraBirimi: 'USD', tutar: 1_000 }],
    });
    expect(status.mesaj).toContain('USD');
    expect(pick(status, CLAIM)).toEqual(CLAIM.map(() => ({ paraBirimi: 'USD', durum: 'GECERLI' })));
    expect(pick(status, RECEIPT)).toEqual(RECEIPT.map(() => ({ paraBirimi: 'USD', durum: 'GECERLI' })));
    // Sabit tarife tutarları alacağın para biriminden bağımsızdır: TL ve geçerli kalır (bilinen tutar gizlenmez)
    expect(pick(status, TARIFF_FIXED)).toEqual(TARIFF_FIXED.map(() => ({ paraBirimi: 'TRY', durum: 'GECERLI' })));
    expect(pick(status, TARIFF_RATE)).toEqual(TARIFF_RATE.map(() => ({ paraBirimi: null, durum: 'HESAPLANAMADI' })));
    expect(pick(status, TOTAL)).toEqual(TOTAL.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
  });

  it('karma anapara: tutarlar para birimi bazında ayrı kalır, birleştirilmez; alacak toplamları da GOSTERILEMEZ', () => {
    const status = buildCalculationSummaryCurrencyStatus(
      input({
        caseCurrency: 'USD',
        principalAmounts: [
          { amount: 10_000, currency: 'USD' },
          { amount: 5_000, currency: 'EUR' },
          { amount: 2_000, currency: 'TRY' },
          { amount: 0.1, currency: 'EUR' },
          { amount: 0.2, currency: 'EUR' },
        ],
      }),
    );

    expect(status).toMatchObject({
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
      alacakParaBirimi: null,
      // Kuruş tamsayısıyla toplanır (0,1 + 0,2 kayan nokta artığı üretmez); para birimleri arasında toplama yok
      asilAlacakParaBirimiBazinda: [
        { paraBirimi: 'EUR', tutar: 5_000.3 },
        { paraBirimi: 'TRY', tutar: 2_000 },
        { paraBirimi: 'USD', tutar: 10_000 },
      ],
    });
    expect(status.mesaj).toContain('EUR, TRY, USD');
    expect(pick(status, CLAIM)).toEqual(CLAIM.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
    expect(pick(status, TARIFF_FIXED)).toEqual(TARIFF_FIXED.map(() => ({ paraBirimi: 'TRY', durum: 'GECERLI' })));
    expect(pick(status, TARIFF_RATE)).toEqual(TARIFF_RATE.map(() => ({ paraBirimi: null, durum: 'HESAPLANAMADI' })));
    expect(pick(status, TOTAL)).toEqual(TOTAL.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
  });

  it('dosya dövizli, kalem kaydı TRY (eski kayıt): tutar kayıttaki para birimiyle görünür, uyuşmazlık bildirilir, toplam yok', () => {
    const status = buildCalculationSummaryCurrencyStatus(
      input({ caseCurrency: 'USD', principalAmounts: [{ amount: 10_000, currency: 'TRY' }] }),
    );

    expect(status).toMatchObject({
      dosyaParaBirimi: 'USD',
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR',
      alacakParaBirimi: 'TRY',
      asilAlacakParaBirimiBazinda: [{ paraBirimi: 'TRY', tutar: 10_000 }],
    });
    expect(status.mesaj).toContain('(USD)');
    expect(status.mesaj).toContain('(TRY)');
    expect(pick(status, CLAIM)).toEqual(CLAIM.map(() => ({ paraBirimi: 'TRY', durum: 'GECERLI' })));
    // Kayıt TRY görünse de dosya dövizli: oranlı kalemler ve toplam güvenle üretilemez (fail-closed)
    expect(pick(status, TARIFF_RATE)).toEqual(TARIFF_RATE.map(() => ({ paraBirimi: null, durum: 'HESAPLANAMADI' })));
    expect(pick(status, TOTAL)).toEqual(TOTAL.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
  });

  it('TL dosyada farklı para biriminde tahsilat ya da bekletme: ilgili satır kendi para biriminde; toplam yok', () => {
    const status = buildCalculationSummaryCurrencyStatus(
      input({
        principalAmounts: [{ amount: 10_000, currency: 'TRY' }],
        collectionAmounts: [{ amount: 100, currency: 'TRY' }, { amount: 50, currency: 'USD' }],
        heldAmounts: [{ amount: 25, currency: 'EUR' }],
      }),
    );

    expect(status.toplamGosterilebilir).toBe(false);
    expect(status.gerekce).toBe('FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ');
    expect(status.tahsilatParaBirimiBazinda).toEqual([
      { paraBirimi: 'TRY', tutar: 100 },
      { paraBirimi: 'USD', tutar: 50 },
    ]);
    expect(pick(status, CLAIM)).toEqual(CLAIM.map(() => ({ paraBirimi: 'TRY', durum: 'GECERLI' })));
    expect(pick(status, RECEIPT)).toEqual(RECEIPT.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
    expect(status.alanlar.mahsubuBekleyenTahsilat).toEqual({ paraBirimi: 'EUR', durum: 'GECERLI' });
  });

  it('çek tazminatı kalemi alacağın para birimi kümesine girer (anapara USD + tazminat TRY → karma)', () => {
    const status = buildCalculationSummaryCurrencyStatus(
      input({
        caseCurrency: 'USD',
        principalAmounts: [{ amount: 10_000, currency: 'USD' }],
        penaltyAmounts: [{ amount: 1_000, currency: 'TRY' }],
      }),
    );

    expect(status.alacakParaBirimi).toBeNull();
    expect(status.gerekce).toBe('FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ');
    // Asıl alacak listesi yalnız anaparadır; tazminat ayrı bloktadır (tazminatDurumu)
    expect(status.asilAlacakParaBirimiBazinda).toEqual([{ paraBirimi: 'USD', tutar: 10_000 }]);
  });

  it('para birimi yazılmamış kayıt dosya para birimini alır; kod büyük/küçük harf ve boşluktan bağımsızdır', () => {
    const missing = buildCalculationSummaryCurrencyStatus(
      input({ caseCurrency: 'usd ', principalAmounts: [{ amount: 10 }, { amount: 5, currency: null }, { amount: 1, currency: ' Usd' }] }),
    );
    expect(missing.dosyaParaBirimi).toBe('USD');
    expect(missing.durum).toBe('TEK_PARA_BIRIMI_DOVIZ');
    expect(missing.asilAlacakParaBirimiBazinda).toEqual([{ paraBirimi: 'USD', tutar: 16 }]);

    // Dosya para birimi de yoksa şema varsayılanı (TRY)
    expect(buildCalculationSummaryCurrencyStatus(input({ caseCurrency: null, principalAmounts: [{ amount: 10 }] })).durum).toBe(
      'TEK_PARA_BIRIMI_TL',
    );
  });

  it('kalemsiz dövizli dosya da dövizlidir (asgari tutarlar TL toplamı gibi sunulmaz)', () => {
    const status = buildCalculationSummaryCurrencyStatus(input({ caseCurrency: 'EUR' }));
    expect(status).toMatchObject({
      durum: 'TEK_PARA_BIRIMI_DOVIZ',
      toplamGosterilebilir: false,
      alacakParaBirimi: 'EUR',
      asilAlacakParaBirimiBazinda: [],
    });
  });
});
