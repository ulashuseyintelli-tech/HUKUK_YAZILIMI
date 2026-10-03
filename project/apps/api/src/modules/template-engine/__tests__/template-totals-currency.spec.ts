/**
 * Belge şablonu toplamı — para birimi bağlamı (saf yardımcı + servis bağlantısı; DB yok).
 *
 * Yardımcı belge METNİNİ DEĞİŞTİRMEZ, tutar ÇEVİRMEZ ve para birimleri arasında toplama YAPMAZ; yalnız belgeye basılan
 * toplamın (tutar + para birimi etiketi) geçerli tek tutar olup olmadığını ve para birimi bazında toplamları bildirir.
 * Karma dosyada belgenin nasıl yazılacağı / üretilip üretilmeyeceği owner kararıdır — burada kural seçilmez.
 *
 * "Belge toplamı 17.000 kalır" iddiaları bugünkü davranışı SABİTLER (karakterizasyon). Gerçek HTTP + PostgreSQL ölçümü:
 * template-totals-currency.http.db-gated.integration.spec.ts.
 */
import { TemplateEngineService, type TemplateData } from '../template-engine.service';
import { computeTemplateTotals } from '../template-case-classification';
import {
  buildTemplateTotalsCurrencyStatus,
  formatTemplateTotalsCurrencyHeader,
  summarizeTemplateTotalsCurrencyStatus,
  TEMPLATE_TOTALS_CURRENCY_HEADER,
  type TemplateTotalsCurrencyItem,
  type TemplateTotalsLabel,
} from '../template-totals-currency';

const FILE_LABEL = (paraBirimi: string): TemplateTotalsLabel => ({ paraBirimi, kaynak: 'DOSYA_PARA_BIRIMI' });
const FIXED_TL: TemplateTotalsLabel = { paraBirimi: 'TRY', kaynak: 'SABIT_TL' };

const item = (type: string, amount: number, currency?: string | null): TemplateTotalsCurrencyItem => ({ type, amount, currency });

const totals = (currency: string, overrides: Record<string, number>) => ({ principal: 0, interest: 0, fees: 0, total: 0, ...overrides, currency });

/** Karma dosya: 10.000 USD + 5.000 EUR + 2.000 TRY anapara (ölçülen senaryo). */
const KARMA = [item('PRINCIPAL', 10_000, 'USD'), item('PRINCIPAL', 5_000, 'EUR'), item('PRINCIPAL', 2_000, 'TRY')];

describe('buildTemplateTotalsCurrencyStatus — belgeye basılan toplam geçerli tek tutar mı', () => {
  describe('tek para birimi, etiket aynı → geçerli; bloktaki tek satır belgenin toplamıyla AYNI', () => {
    it.each(['TRY', 'USD', 'EUR'])('%s dosya: TEK_PARA_BIRIMI, mesaj yok', (currency) => {
      const items = [item('PRINCIPAL', 10_000, currency), item('EXPENSE', 250, currency)];

      expect(buildTemplateTotalsCurrencyStatus(items, FILE_LABEL(currency))).toEqual({
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        gerekce: null,
        mesaj: null,
        toplamEtiketi: { paraBirimi: currency, kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: currency,
        paraBirimleri: [currency],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [{ paraBirimi: currency, kalemSayisi: 2, totals: totals(currency, { principal: 10_000, fees: 250, total: 10_250 }) }],
      });
    });

    it.each([
      'PRINCIPAL', 'ASIL_ALACAK', 'KIRA_ALACAGI', 'NAFAKA', 'KIRA', 'AIDAT', 'PRIM',
      'INTEREST', 'ISLEMIS_FAIZ', 'PRE_INTEREST', 'POST_INTEREST',
      'EXPENSE', 'FEE', 'ATTORNEY_FEE', 'CHECK_PENALTY', 'TAX_KDV', 'OTHER', 'BILINMEYEN_TUR',
    ])('kalem türü %s: tek satır, belgenin kendi toplam hesabıyla (computeTemplateTotals) birebir aynı kovaya düşer', (type) => {
      const items = [item(type, 123.45, 'USD'), item('PRINCIPAL', 1_000, 'USD')];

      const status = buildTemplateTotalsCurrencyStatus(items, FILE_LABEL('USD'));

      expect(status.toplamlarParaBirimiBazinda).toEqual([{ paraBirimi: 'USD', kalemSayisi: 2, totals: computeTemplateTotals(items, 'USD') }]);
      expect(status.toplamGosterilebilir).toBe(true);
    });

    it('kuruşlu tutarlar para birimi içinde iki haneye yuvarlanır (belge toplamıyla aynı kural)', () => {
      const items = [item('PRINCIPAL', 0.1, 'USD'), item('PRINCIPAL', 0.2, 'USD'), item('EXPENSE', 1.005, 'USD')];

      const [row] = buildTemplateTotalsCurrencyStatus(items, FILE_LABEL('USD')).toplamlarParaBirimiBazinda;

      expect(row.totals).toEqual(computeTemplateTotals(items, 'USD'));
      expect(row.totals.principal).toBe(0.3);
    });

    it('kalem yok: KALEM_YOK, toplam (0) geçerli, satır yok', () => {
      expect(buildTemplateTotalsCurrencyStatus([], FILE_LABEL('USD'))).toEqual({
        durum: 'KALEM_YOK',
        toplamGosterilebilir: true,
        gerekce: null,
        mesaj: null,
        toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: null,
        paraBirimleri: [],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [],
      });
    });

    it('para birimi kodu biçimi (boşluk / küçük harf) aynı para birimi sayılır; etiket de aynı kuralla okunur', () => {
      const items = [item('PRINCIPAL', 100, ' usd '), item('PRINCIPAL', 50, 'Usd'), item('EXPENSE', 5, 'USD')];

      expect(buildTemplateTotalsCurrencyStatus(items, FILE_LABEL('usd'))).toMatchObject({
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        toplamEtiketi: { paraBirimi: 'USD' },
        paraBirimleri: ['USD'],
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'USD', kalemSayisi: 3, totals: totals('USD', { principal: 150, fees: 5, total: 155 }) }],
      });
    });
  });

  describe('karma para birimi → tek toplam geçerli DEĞİL; çevirme ve çapraz toplam yok', () => {
    it('USD dosya + USD 10.000 + EUR 5.000 + TRY 2.000: KARMA, toplamlar para birimi bazında', () => {
      // Karakterizasyon: belgenin kendi toplamı bu kalemleri tek sayıda toplar (değişmedi)
      expect(computeTemplateTotals(KARMA, 'USD')).toEqual(totals('USD', { principal: 17_000, total: 17_000 }));

      const status = buildTemplateTotalsCurrencyStatus(KARMA, FILE_LABEL('USD'));

      expect(status).toEqual({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        mesaj:
          'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Belge toplamı bu tutarları çevirmeden tek ' +
          'sayıda toplar ve dosya para birimiyle (USD) etiketler; bu toplam geçerli tek tutar değildir. Belge metni ' +
          'değiştirilmedi; toplamlar para birimi bazında ayrıca bildirildi.',
        toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: null,
        paraBirimleri: ['EUR', 'TRY', 'USD'],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [
          { paraBirimi: 'EUR', kalemSayisi: 1, totals: totals('EUR', { principal: 5_000, total: 5_000 }) },
          { paraBirimi: 'TRY', kalemSayisi: 1, totals: totals('TRY', { principal: 2_000, total: 2_000 }) },
          { paraBirimi: 'USD', kalemSayisi: 1, totals: totals('USD', { principal: 10_000, total: 10_000 }) },
        ],
      });
      // Blokta çapraz para birimi toplamı yok; para birimi bazındaki tutarlar kayıttaki tutarlardır (çevrilmedi)
      expect(JSON.stringify(status)).not.toContain('17000');
      expect(status.toplamlarParaBirimiBazinda.map((row) => row.totals.total)).toEqual([5_000, 2_000, 10_000]);
    });

    it('kalem sırası sonucu değiştirmez', () => {
      const [usd, eur, tryItem] = KARMA;
      const expected = buildTemplateTotalsCurrencyStatus(KARMA, FILE_LABEL('USD'));
      for (const order of [[eur, tryItem, usd], [tryItem, usd, eur], [tryItem, eur, usd], [usd, tryItem, eur]]) {
        expect(buildTemplateTotalsCurrencyStatus(order, FILE_LABEL('USD'))).toEqual(expected);
      }
    });

    it('TRY dosyada aynı kalemler: etiket TRY olur, sonuç yine KARMA (17.000 "TL" geçerli tutar değil)', () => {
      expect(buildTemplateTotalsCurrencyStatus(KARMA, FILE_LABEL('TRY'))).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: null,
        mesaj: expect.stringContaining('dosya para birimiyle (TRY) etiketler'),
      });
    });

    it('aynı kategoride farklı para birimi (USD 250 + EUR 300 masraf): fer\'iler para birimi bazında ayrılır', () => {
      const items = [item('PRINCIPAL', 10_000, 'USD'), item('EXPENSE', 250, 'USD'), item('EXPENSE', 300, 'EUR')];
      // Karakterizasyon: belgedeki fer'i toplamı 550
      expect(computeTemplateTotals(items, 'USD').fees).toBe(550);

      expect(buildTemplateTotalsCurrencyStatus(items, FILE_LABEL('USD')).toplamlarParaBirimiBazinda).toEqual([
        { paraBirimi: 'EUR', kalemSayisi: 1, totals: totals('EUR', { fees: 300, total: 300 }) },
        { paraBirimi: 'USD', kalemSayisi: 2, totals: totals('USD', { principal: 10_000, fees: 250, total: 10_250 }) },
      ]);
    });

    it('sıfır tutarlı farklı para birimindeki kalem de dosyayı karma yapar (belgede o satır da basılır)', () => {
      const status = buildTemplateTotalsCurrencyStatus([item('PRINCIPAL', 10_000, 'USD'), item('EXPENSE', 0, 'EUR')], FILE_LABEL('USD'));

      expect(status).toMatchObject({ durum: 'KARMA_PARA_BIRIMI', toplamGosterilebilir: false, paraBirimleri: ['EUR', 'USD'] });
    });
  });

  describe('kalemler tek para biriminde, belge etiketi farklı → toplam satırı geçerli DEĞİL', () => {
    it('dosya USD, kalem kayıtları TRY (eski kayıt): ETIKET_UYUSMUYOR', () => {
      const items = [item('PRINCIPAL', 10_000, 'TRY'), item('EXPENSE', 250, 'TRY')];

      expect(buildTemplateTotalsCurrencyStatus(items, FILE_LABEL('USD'))).toEqual({
        durum: 'ETIKET_UYUSMUYOR',
        toplamGosterilebilir: false,
        gerekce: 'TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR',
        mesaj:
          'Alacak kalemleri TRY para biriminde kayıtlı; belge toplamı ise dosya para birimiyle (USD) etiketleniyor. Toplam ' +
          'satırındaki para birimi kalemlerin para birimini göstermiyor. Belge metni değiştirilmedi.',
        toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: 'TRY',
        paraBirimleri: ['TRY'],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'TRY', kalemSayisi: 2, totals: totals('TRY', { principal: 10_000, fees: 250, total: 10_250 }) }],
      });
    });

    it('dava dilekçesi (sabit "TL"): TRY kalemlerde geçerli; USD kalemlerde ETIKET_UYUSMUYOR; karma dosyada KARMA', () => {
      const usd = [item('PRINCIPAL', 10_000, 'USD'), item('EXPENSE', 250, 'USD')];

      expect(buildTemplateTotalsCurrencyStatus([item('PRINCIPAL', 10_000, 'TRY')], FIXED_TL)).toMatchObject({
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'SABIT_TL' },
      });
      expect(buildTemplateTotalsCurrencyStatus(usd, FIXED_TL)).toMatchObject({
        durum: 'ETIKET_UYUSMUYOR',
        toplamGosterilebilir: false,
        gerekce: 'TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR',
        mesaj:
          'Alacak kalemleri USD para biriminde kayıtlı; dilekçe ise tutarı sabit "TL" ile yazıyor. Dilekçedeki para birimi ' +
          'kalemlerin para birimini göstermiyor. Belge metni değiştirilmedi.',
        alacakParaBirimi: 'USD',
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'USD', kalemSayisi: 2, totals: totals('USD', { principal: 10_000, fees: 250, total: 10_250 }) }],
      });
      expect(buildTemplateTotalsCurrencyStatus(KARMA, FIXED_TL)).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        mesaj:
          'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Dilekçe bu tutarları çevirmeden tek sayıda ' +
          'toplar ve sabit "TL" ile yazar; bu tutar geçerli tek tutar değildir. Belge metni değiştirilmedi; toplamlar para ' +
          'birimi bazında ayrıca bildirildi.',
      });
      // Aynı USD kalemler icra belgesinde (etiket = dosya para birimi) geçerlidir
      expect(buildTemplateTotalsCurrencyStatus(usd, FILE_LABEL('USD')).toplamGosterilebilir).toBe(true);
    });
  });

  describe('para birimi kayıtlı olmayan kalem → 0 ya da varsayılan sayılmaz', () => {
    it.each([[''], ['   '], [null], [undefined]])('para birimi %j: PARA_BIRIMI_EKSIK; kalem hiçbir para birimi toplamına girmez', (currency) => {
      const status = buildTemplateTotalsCurrencyStatus([item('PRINCIPAL', 10_000, 'USD'), item('EXPENSE', 300, currency)], FILE_LABEL('USD'));

      expect(status).toEqual({
        durum: 'PARA_BIRIMI_EKSIK',
        toplamGosterilebilir: false,
        gerekce: 'KALEM_PARA_BIRIMI_EKSIK',
        mesaj:
          '1 alacak kaleminin para birimi kayıtlı değil. Belgedeki toplam bu kalemleri de içerir; geçerli tek tutar olduğu ' +
          'doğrulanamadı. Belge metni değiştirilmedi.',
        toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: null,
        paraBirimleri: ['USD'],
        paraBirimiEksikKalemSayisi: 1,
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'USD', kalemSayisi: 1, totals: totals('USD', { principal: 10_000, total: 10_000 }) }],
      });
    });

    it('eksik + karma birlikte: PARA_BIRIMI_EKSIK öncelikli, tek toplam yine geçersiz', () => {
      const status = buildTemplateTotalsCurrencyStatus([...KARMA, item('EXPENSE', 300, '')], FILE_LABEL('USD'));

      expect(status).toMatchObject({
        durum: 'PARA_BIRIMI_EKSIK',
        toplamGosterilebilir: false,
        alacakParaBirimi: null,
        paraBirimleri: ['EUR', 'TRY', 'USD'],
        paraBirimiEksikKalemSayisi: 1,
      });
      expect(status.toplamlarParaBirimiBazinda.map((row) => row.kalemSayisi)).toEqual([1, 1, 1]);
    });

    it('yalnız para birimsiz kalemler: satır yok, toplam geçersiz', () => {
      expect(buildTemplateTotalsCurrencyStatus([item('PRINCIPAL', 100, null)], FILE_LABEL('TRY'))).toMatchObject({
        durum: 'PARA_BIRIMI_EKSIK',
        toplamGosterilebilir: false,
        paraBirimleri: [],
        toplamlarParaBirimiBazinda: [],
      });
    });
  });

  it('girdiyi değiştirmez (belge verisi aynı kalır)', () => {
    const items = KARMA.map((entry) => Object.freeze({ ...entry }));
    const label = Object.freeze(FILE_LABEL('USD'));
    const snapshot = JSON.stringify(items);

    buildTemplateTotalsCurrencyStatus(Object.freeze(items), label);

    expect(JSON.stringify(items)).toBe(snapshot);
  });
});

describe('formatTemplateTotalsCurrencyHeader — belge gövdeli yanıtların başlığı', () => {
  it('başlık adı sabit', () => {
    expect(TEMPLATE_TOTALS_CURRENCY_HEADER).toBe('X-Belge-Toplam-Para-Birimi');
  });

  it.each([
    [[item('PRINCIPAL', 1, 'TRY')], FILE_LABEL('TRY'), 'TEK_PARA_BIRIMI;toplamGosterilebilir=true;etiket=TRY;paraBirimleri=TRY'],
    [[], FILE_LABEL('USD'), 'KALEM_YOK;toplamGosterilebilir=true;etiket=USD;paraBirimleri='],
    [
      KARMA,
      FILE_LABEL('USD'),
      'KARMA_PARA_BIRIMI;toplamGosterilebilir=false;etiket=USD;paraBirimleri=EUR,TRY,USD;gerekce=FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
    ],
    [
      [item('PRINCIPAL', 1, 'USD')],
      FIXED_TL,
      'ETIKET_UYUSMUYOR;toplamGosterilebilir=false;etiket=TRY;paraBirimleri=USD;gerekce=TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR',
    ],
    [
      [item('PRINCIPAL', 1, 'USD'), item('PRINCIPAL', 1, '')],
      FILE_LABEL('USD'),
      'PARA_BIRIMI_EKSIK;toplamGosterilebilir=false;etiket=USD;paraBirimleri=USD;gerekce=KALEM_PARA_BIRIMI_EKSIK',
    ],
  ])('durum başlığa kod olarak yazılır; tutar ve açıklama taşınmaz', (items, label, expected) => {
    expect(formatTemplateTotalsCurrencyHeader(buildTemplateTotalsCurrencyStatus(items, label))).toBe(expected);
  });

  it('kayıttaki para birimi serbest metindir: başlık değeri her durumda yalnız ASCII kod karakteri taşır (satır sonu / Türkçe karakter sızmaz)', () => {
    const items = [item('PRINCIPAL', 1, 'US$'), item('PRINCIPAL', 1, 'tl\r\nX-Sahte: 1'), item('PRINCIPAL', 1, 'ŞİLİN'), item('PRINCIPAL', 1, 'A'.repeat(40))];

    const value = formatTemplateTotalsCurrencyHeader(buildTemplateTotalsCurrencyStatus(items, FILE_LABEL('ü')));

    expect(value).toMatch(/^[A-Za-z0-9_;=,]+$/);
    expect(value).toContain('etiket=_');
    expect(value).toContain(`${'A'.repeat(16)},`);
    expect(value).not.toContain('A'.repeat(17));
  });
});

describe('summarizeTemplateTotalsCurrencyStatus — üretim denetim kaydı özeti', () => {
  it('durum, gerekçe, etiket ve para birimleri; tutar ve açıklama metni YOK', () => {
    const summary = summarizeTemplateTotalsCurrencyStatus(buildTemplateTotalsCurrencyStatus(KARMA, FILE_LABEL('USD')));

    expect(summary).toEqual({
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
      toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
      paraBirimleri: ['EUR', 'TRY', 'USD'],
    });
    expect(JSON.stringify(summary)).not.toMatch(/\d{4}/);
  });
});

describe('TemplateEngineService — durum belgenin YANINDA döner; belge verisi ve gövdesi değişmez', () => {
  const claimItem = (itemType: string, amount: number, currency: string) => ({
    itemType,
    demandedAmount: amount,
    amount,
    currency,
    status: 'ACTIVE',
    isVirtual: false,
  });

  function buildService(caseOverrides: Record<string, unknown> = {}, extra: { artifact?: any; audit?: any } = {}) {
    const caseRecord = {
      id: 'case-1',
      fileNumber: '2026/1',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      type: 'GENERAL_EXECUTION',
      subCategory: 'GENEL',
      executionPath: 'HACIZ',
      hasCollateral: false,
      currency: 'USD',
      principalAmount: 0,
      executionOffice: null,
      caseClients: [],
      lawyers: [],
      debtors: [{ id: 'cd-1', role: 'ASIL_BORCLU', selectedAddress: null, debtor: { type: 'INDIVIDUAL', name: 'Borçlu', displayName: 'Borçlu', debtorAddresses: [] } }],
      dues: [],
      claimItems: [claimItem('PRINCIPAL', 10_000, 'USD'), claimItem('PRINCIPAL', 5_000, 'EUR'), claimItem('PRINCIPAL', 2_000, 'TRY')],
      ...caseOverrides,
    };
    const prisma: any = {
      case: { findFirst: jest.fn(async () => caseRecord) },
      caseInstrument: { findMany: jest.fn(async () => []) },
      caseJudgment: { findFirst: jest.fn(async () => null) },
      caseLease: { findFirst: jest.fn(async () => null) },
      formType: { findUnique: jest.fn(async () => null) },
      ...(extra.artifact ? { documentArtifact: extra.artifact } : {}),
    };
    const feeEngine: any = { getInterestRate: jest.fn().mockReturnValue(9) };
    const service = new TemplateEngineService(prisma, feeEngine, extra.audit);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    const getCaseData = (): Promise<TemplateData> => (service as any).getCaseData('case-1', 't1');
    return { service, getCaseData };
  }

  it('dosya kaydından metin belgeleri: `content` durumsuz üretimle birebir aynı; durum eklemeli alandadır', async () => {
    const { service, getCaseData } = buildService();
    const data = await getCaseData();
    // Belge verisi durumu TAŞIMAZ (UDF / XML gövdesine ve veri parmak izine girmesin)
    expect(Object.keys(data)).not.toContain('paraBirimiDurumu');
    expect(JSON.stringify(data)).not.toContain('toplamGosterilebilir');

    const takip = await service.generateTakipTalebiFromCase('case-1', 't1');
    const odeme = await service.generateOdemeEmriFromCase('case-1', 't1');
    const icra = await service.generateIcraEmriFromCase('case-1', 't1');

    expect(takip.content).toBe(service.generateTakipTalebi(data).content);
    expect(odeme.content).toBe(service.generateOdemeEmri(data).content);
    expect(icra.content).toBe(service.generateIcraEmri(data).content);
    // Karakterizasyon: belge 17.000,00 $ yazmayı sürdürür
    expect(odeme.content).toContain('TOPLAM          : 17.000,00 $');
    for (const doc of [takip, odeme, icra]) {
      expect(Object.keys(doc)).toEqual(['title', 'content', 'format', 'templateCode', 'selection', 'paraBirimiDurumu']);
      expect(doc.paraBirimiDurumu).toEqual(buildTemplateTotalsCurrencyStatus(data.claimItems, FILE_LABEL('USD')));
      expect(doc.paraBirimiDurumu).toMatchObject({ durum: 'KARMA_PARA_BIRIMI', toplamGosterilebilir: false });
    }
  });

  it('istemci verisiyle üretim (dosya kaydı yok) durum TAŞIMAZ: toplam istemciden gelir, sunucu doğrulamaz', async () => {
    const { service, getCaseData } = buildService();
    const data = await getCaseData();

    for (const doc of [service.generateTakipTalebi(data), service.generateOdemeEmri(data), service.generateIcraEmri(data)]) {
      expect(Object.keys(doc)).toEqual(['title', 'content', 'format', 'templateCode', 'selection']);
    }
  });

  it('XML ve UDF gövdesi belgenin kendisidir: durum gövdeye GİRMEZ, yanında döner', async () => {
    const { service, getCaseData } = buildService();
    const data = await getCaseData();
    const expected = buildTemplateTotalsCurrencyStatus(data.claimItems, FILE_LABEL('USD'));

    const xml = await service.generateXmlFromCase('case-1', 'takip-talebi', 't1');
    const udf = await service.generateUdfFromCase('case-1', 'takip-talebi', 't1');

    expect(xml.paraBirimiDurumu).toEqual(expected);
    expect(udf.paraBirimiDurumu).toEqual(expected);
    const withoutTime = (value: string) => value.replace(/<CreatedAt>[^<]*<\/CreatedAt>/, '');
    expect(withoutTime(xml.output)).toBe(withoutTime(service.generateTakipTalebiXml(data)));
    expect(xml.output).not.toMatch(/paraBirimi|toplamGosterilebilir|KARMA/);
    expect(JSON.stringify(udf.output)).not.toMatch(/paraBirimi|toplamGosterilebilir|KARMA/);
    expect(udf.output.content.sections.find((section) => section.type === 'CLAIMS')?.data).toEqual({ claimItems: data.claimItems, totals: data.totals });
  });

  it('PDF ve Word: aynı okumadan durum + aynı belge üreticisine aynı belge verisi', async () => {
    const { service, getCaseData } = buildService();
    const data = await getCaseData();
    const word = jest.spyOn(service as any, 'generateTakipTalebiWordFormatted').mockResolvedValue(Buffer.from('docx'));
    const pdf = jest.spyOn(service as any, 'generateTakipTalebiPdfFormatted').mockResolvedValue(Buffer.from('pdf'));

    const wordOut = await service.generateWordFromCase('case-1', 'takip-talebi', 't1');
    const pdfOut = await service.generatePdfFromCase('case-1', 'takip-talebi', 't1');

    expect(wordOut.output.toString()).toBe('docx');
    expect(pdfOut.output.toString()).toBe('pdf');
    expect(wordOut.paraBirimiDurumu).toMatchObject({ durum: 'KARMA_PARA_BIRIMI', paraBirimleri: ['EUR', 'TRY', 'USD'] });
    expect(pdfOut.paraBirimiDurumu).toEqual(wordOut.paraBirimiDurumu);
    // Belge üreticisine giden veri durumsuzdur (belge çıktısı değişemez)
    expect((word.mock.calls[0] as any[])[0]).toEqual(data);
    expect((pdf.mock.calls[0] as any[])[0]).toEqual(data);
  });

  it('dava dilekçeleri: tutar sabit "TL" ile yazılır; durum etiketi TRY / SABIT_TL', async () => {
    const { service } = buildService({ claimItems: [claimItem('PRINCIPAL', 10_000, 'USD'), claimItem('EXPENSE', 250, 'USD')] });

    const itiraz = await service.generateItirazinIptaliFromCase('case-1', 't1');
    const tasarruf = await service.generateTasarrufunIptaliFromCase('case-1', 't1');
    const dolandiricilik = await service.generateDolandiricilikSucDuyurusuFromCase('case-1', 't1');

    // Karakterizasyon: kayıt 10.250 USD, dilekçe metni "10.250 TL"
    expect(itiraz.content).toContain('DAVA DEĞERİ     : 10.250 TL');
    for (const doc of [itiraz, tasarruf, dolandiricilik]) {
      expect(Object.keys(doc)).toEqual(['title', 'content', 'paraBirimiDurumu']);
      expect(doc.paraBirimiDurumu).toMatchObject({
        durum: 'ETIKET_UYUSMUYOR',
        toplamGosterilebilir: false,
        toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'SABIT_TL' },
        alacakParaBirimi: 'USD',
      });
    }
    const word = await service.generateItirazinIptaliWord('case-1', 't1');
    expect(word.output.length).toBeGreaterThan(0);
    expect(word.paraBirimiDurumu).toEqual(itiraz.paraBirimiDurumu);
  });

  it('merkezi üretim: sonuç ve DOCUMENT_GENERATED denetim kaydı durumu taşır; veri parmak izi durumdan etkilenmez', async () => {
    const artifact = { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: 'art-1', ...data })) };
    const audit = { log: jest.fn(async () => undefined) };
    const { service, getCaseData } = buildService({}, { artifact, audit });
    const data = await getCaseData();

    const result = await service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'user-1');

    expect(result.paraBirimiDurumu).toEqual(buildTemplateTotalsCurrencyStatus(data.claimItems, FILE_LABEL('USD')));
    expect(result.buffer.toString('utf-8')).not.toMatch(/paraBirimiDurumu|toplamGosterilebilir/);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_GENERATED',
        metadata: expect.objectContaining({
          adliyeKabulu: 'DOGRULANMADI',
          paraBirimiDurumu: {
            durum: 'KARMA_PARA_BIRIMI',
            toplamGosterilebilir: false,
            gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
            toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
            paraBirimleri: ['EUR', 'TRY', 'USD'],
          },
        }),
      }),
    );
    // Üretim kaydının anahtarı (veri parmak izi) yalnız belge verisinden hesaplanır
    const recorded = (artifact.create.mock.calls[0] as any[])[0].data;
    expect(recorded.dataHash).toBe((service as any).generateDataHash(data));
  });
});
