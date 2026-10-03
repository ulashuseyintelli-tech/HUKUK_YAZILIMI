import { buildCalculationSummaryCurrencyStatus } from '../../case/case-calculation-summary-currency';
import { buildFeePreviewCurrencyStatus } from '../fee-preview-currency';

/**
 * Masraf önizlemesi para birimi bağlamı — DAVRANIŞ SÖZLEŞMESİ (saf birim testi).
 *
 * Kural: yardımcı hesap yapmaz, tutar çevirmez ve yeni kural tanımlamaz; dosya hesap özetinin kararını
 * (buildCalculationSummaryCurrencyStatus) tek kalemlik önizleme girdisine uygular. Dövizli alacağa TL tarifesi oranı
 * uygulanarak bulunan alanlar HESAPLANAMADI, alacak ile tarifeyi tek sayıda toplayan alanlar GOSTERILEMEZ; bilinen
 * tutarlar kendi para birimiyle GECERLI kalır. Dövizli alacakta harç / vekalet ücreti kuralı owner kararıdır.
 */
const CLAIM = ['asilAlacak', 'tazminat', 'komisyon', 'takipOncesiFaiz', 'takipTutari', 'takipSonrasiFaiz'] as const;
const TARIFF_FIXED = ['basvurmaHarci', 'vekaletHarci', 'dosyaGideri', 'tebligatGideri', 'vekaletPulu'] as const;
const TARIFF_RATE = [
  'pesinHarc',
  'icraMasraflari',
  'pesinHarcDahilTahsilHarci',
  'pesinHarcHaricTahsilHarci',
  'vekaletUcreti',
] as const;
const TOTAL = ['toplamBorc', 'sonBorc', 'tahsilOranlari'] as const;

const status = (currency?: unknown, caseCurrency?: unknown) =>
  buildFeePreviewCurrencyStatus({ principalAmount: 10_000, currency, caseCurrency });

describe('Masraf önizlemesi para birimi bağlamı (buildFeePreviewCurrencyStatus)', () => {
  it('istek para birimi taşımıyorsa karar üretilmez (para birimi göndermeyen çağıran için yanıt aynen)', () => {
    expect(status()).toBeNull();
    expect(status(null)).toBeNull();
    expect(status('')).toBeNull();
    expect(status('   ')).toBeNull();
    // Dosya para birimi tek başına kalemin para birimini BİLDİRMEZ: karar yine üretilmez
    expect(status(undefined, 'USD')).toBeNull();
  });

  it('TL kalem (TL dosya): tek toplam gösterilebilir; bütün alanlar TRY ve geçerli; uyarı yok', () => {
    const tl = status('TRY', 'TRY')!;

    expect(tl).toMatchObject({
      dosyaParaBirimi: 'TRY',
      tarifeParaBirimi: 'TRY',
      durum: 'TEK_PARA_BIRIMI_TL',
      toplamGosterilebilir: true,
      gerekce: null,
      mesaj: null,
      alacakParaBirimi: 'TRY',
    });
    expect(new Set(Object.values(tl.alanlar).map((alan) => JSON.stringify(alan)))).toEqual(
      new Set([JSON.stringify({ paraBirimi: 'TRY', durum: 'GECERLI' })]),
    );
  });

  it.each(['USD', 'EUR', 'GBP', 'CHF'])(
    '%s kalem (aynı para biriminde dosya): alacak kendi para biriminde; sabit tarife TL; oranlı kalemler HESAPLANAMADI; toplamlar GOSTERILEMEZ',
    (currency) => {
      const fx = status(currency, currency)!;

      expect(fx).toMatchObject({
        dosyaParaBirimi: currency,
        tarifeParaBirimi: 'TRY',
        durum: 'TEK_PARA_BIRIMI_DOVIZ',
        toplamGosterilebilir: false,
        gerekce: 'DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        alacakParaBirimi: currency,
      });
      expect(fx.mesaj).toContain(currency);
      for (const field of CLAIM) expect(fx.alanlar[field]).toEqual({ paraBirimi: currency, durum: 'GECERLI' });
      // Sabit tarife tutarları alacağın para biriminden bağımsızdır: TL ve geçerli kalır (bilinen tutar gizlenmez)
      for (const field of TARIFF_FIXED) expect(fx.alanlar[field]).toEqual({ paraBirimi: 'TRY', durum: 'GECERLI' });
      for (const field of TARIFF_RATE) expect(fx.alanlar[field]).toEqual({ paraBirimi: null, durum: 'HESAPLANAMADI' });
      for (const field of TOTAL) expect(fx.alanlar[field]).toEqual({ paraBirimi: null, durum: 'GOSTERILEMEZ' });
    },
  );

  it('dosya para birimi bildirilmezse kalemin para birimi dosya para birimi sayılır (uyuşmazlık uydurulmaz)', () => {
    expect(status('USD')).toEqual(status('USD', 'USD'));
    expect(status('TRY')).toEqual(status('TRY', 'TRY'));
    expect(status('USD', '  ')).toEqual(status('USD', 'USD'));
  });

  it('TL dosyada dövizli kalem: uyuşmazlık bildirilir; tutar kalemin para biriminde; oranlı kalem ve toplam yok', () => {
    const mixed = status('USD', 'TRY')!;

    expect(mixed).toMatchObject({
      dosyaParaBirimi: 'TRY',
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR',
      alacakParaBirimi: 'USD',
    });
    expect(mixed.mesaj).toContain('(TRY)');
    expect(mixed.mesaj).toContain('(USD)');
    for (const field of CLAIM) expect(mixed.alanlar[field]).toEqual({ paraBirimi: 'USD', durum: 'GECERLI' });
    for (const field of TARIFF_RATE) expect(mixed.alanlar[field]).toEqual({ paraBirimi: null, durum: 'HESAPLANAMADI' });
    for (const field of TOTAL) expect(mixed.alanlar[field]).toEqual({ paraBirimi: null, durum: 'GOSTERILEMEZ' });
  });

  it('dövizli dosyada TL kalem: uyuşmazlık bildirilir; kalem TL görünse de oranlı kalem ve toplam güvenle üretilemez', () => {
    const mixed = status('TRY', 'USD')!;

    expect(mixed).toMatchObject({
      dosyaParaBirimi: 'USD',
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR',
      alacakParaBirimi: 'TRY',
    });
    for (const field of CLAIM) expect(mixed.alanlar[field]).toEqual({ paraBirimi: 'TRY', durum: 'GECERLI' });
    for (const field of TARIFF_RATE) expect(mixed.alanlar[field]).toEqual({ paraBirimi: null, durum: 'HESAPLANAMADI' });
    for (const field of TOTAL) expect(mixed.alanlar[field]).toEqual({ paraBirimi: null, durum: 'GOSTERILEMEZ' });
  });

  it('para birimi kodu büyük/küçük harf ve boşluktan bağımsızdır; tanınmayan kod TL sayılmaz (fail-closed)', () => {
    expect(status(' usd ', 'Usd')).toEqual(status('USD', 'USD'));
    expect(status('try')).toEqual(status('TRY'));
    expect(status('XYZ')!.toplamGosterilebilir).toBe(false);
    expect(status('TL')!.toplamGosterilebilir).toBe(false);
    expect(status(840)!.toplamGosterilebilir).toBe(false);
  });

  it('kural TEK yerdedir: karar, dosya hesap özeti yardımcısının aynı girdi için ürettiği kararla birebir aynıdır', () => {
    for (const [currency, caseCurrency] of [
      ['TRY', 'TRY'],
      ['USD', 'USD'],
      ['EUR', 'TRY'],
      ['TRY', 'EUR'],
    ]) {
      const summary = buildCalculationSummaryCurrencyStatus({
        caseCurrency,
        principalAmounts: [{ amount: 10_000, currency }],
        penaltyAmounts: [],
        collectionAmounts: [],
        heldAmounts: [],
      });
      const preview = status(currency, caseCurrency)!;

      expect(preview.alanlar).toEqual(summary.alanlar);
      expect(preview).toMatchObject({
        durum: summary.durum,
        toplamGosterilebilir: summary.toplamGosterilebilir,
        gerekce: summary.gerekce,
        mesaj: summary.mesaj,
        alacakParaBirimi: summary.alacakParaBirimi,
      });
    }
  });

  it('önizleme tek tutar alır: para birimi bazında tutar listesi taşımaz (takip tutarı asıl alacak diye sunulmaz)', () => {
    const fx = status('USD', 'USD')!;
    expect(Object.keys(fx).sort()).toEqual(
      ['alacakParaBirimi', 'alanlar', 'dosyaParaBirimi', 'durum', 'gerekce', 'mesaj', 'tarifeParaBirimi', 'toplamGosterilebilir'].sort(),
    );
  });

  it('karar tutardan bağımsızdır (hesap ve çevirme yok)', () => {
    const small = buildFeePreviewCurrencyStatus({ principalAmount: 1, currency: 'USD' });
    const large = buildFeePreviewCurrencyStatus({ principalAmount: 9_999_999.99, currency: 'USD' });
    expect(small).toEqual(large);
  });
});
