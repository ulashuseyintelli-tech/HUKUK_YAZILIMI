/**
 * Belge şablonu toplamı — para birimi bağlamı ve RESMÎ ÇIKTI RET KAPISI (saf yardımcı + servis bağlantısı; DB yok).
 *
 * Owner kararı (2026-10-03, "KARMA PARA BİRİMLİ BELGE: B"): yanlış tek toplam üreten resmî çıktı akışı reddedilir; format
 * seçerek atlanamaz; hata belgenin neden üretilemediğini söyler. Geçici korumadır — para birimi bazında doğru resmî belge
 * tasarımı DEĞİLDİR; tutar ÇEVRİLMEZ, kur yoktur. Tek para birimli geçerli akış (TL ve dövizli) değişmez.
 *
 * Gerçek HTTP + PostgreSQL ölçümü: template-totals-currency.http.db-gated.integration.spec.ts.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PdfController } from '../../pdf/pdf.controller';
import { TemplateEngineController } from '../template-engine.controller';
import { TemplateEngineService, type TemplateData } from '../template-engine.service';
import { computeTemplateTotals } from '../template-case-classification';
import {
  buildTemplateTotalsCurrencyStatus,
  formatTemplateTotalsCurrencyRejection,
  TEMPLATE_TOTALS_CURRENCY_REJECTION_CODE,
  type TemplateTotalsCurrencyItem,
  type TemplateTotalsLabel,
} from '../template-totals-currency';

const FILE_LABEL = (paraBirimi: string): TemplateTotalsLabel => ({ paraBirimi, kaynak: 'DOSYA_PARA_BIRIMI' });
const FIXED_TL: TemplateTotalsLabel = { paraBirimi: 'TRY', kaynak: 'SABIT_TL' };

const item = (type: string, amount: number, currency?: string | null): TemplateTotalsCurrencyItem => ({ type, amount, currency });

const totals = (currency: string, overrides: Record<string, number>) => ({ principal: 0, interest: 0, fees: 0, total: 0, ...overrides, currency });

/** Karma dosya: 10.000 USD + 5.000 EUR + 2.000 TRY anapara (ölçülen senaryo). */
const KARMA = [item('PRINCIPAL', 10_000, 'USD'), item('PRINCIPAL', 5_000, 'EUR'), item('PRINCIPAL', 2_000, 'TRY')];

describe('buildTemplateTotalsCurrencyStatus — belgeye basılacak toplam geçerli tek tutar mı', () => {
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

  describe('karma para birimi → geçerli DEĞİL; çevirme ve çapraz toplam yok', () => {
    it('USD dosya + USD 10.000 + EUR 5.000 + TRY 2.000: KARMA, toplamlar para birimi bazında', () => {
      // Karakterizasyon: belgenin kendi toplamı bu kalemleri tek sayıda toplar (DEĞİŞMEDİ — kapı bu yüzden gerekli)
      expect(computeTemplateTotals(KARMA, 'USD')).toEqual(totals('USD', { principal: 17_000, total: 17_000 }));

      const status = buildTemplateTotalsCurrencyStatus(KARMA, FILE_LABEL('USD'));

      expect(status).toEqual({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        mesaj:
          'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Belge tutarları çevirmeden tek sayıda ' +
          'toplar ve dosya para birimiyle (USD) etiketler; bu toplam geçerli değildir.',
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
          'Alacak kalemleri TRY para biriminde kayıtlı; belge toplamı ise dosya para birimiyle (USD) etiketlenecek, yani ' +
          'toplam satırındaki para birimi kalemlerin para birimini göstermiyor.',
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
          'Alacak kalemleri USD para biriminde kayıtlı; dilekçe ise tutarı sabit "TL" ile yazıyor, yani yazılacak para ' +
          'birimi kalemlerin para birimini göstermiyor.',
        alacakParaBirimi: 'USD',
      });
      expect(buildTemplateTotalsCurrencyStatus(KARMA, FIXED_TL)).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        mesaj:
          'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Dilekçe tutarları çevirmeden tek sayıda ' +
          'toplar ve sabit "TL" ile yazar; bu tutar geçerli değildir.',
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
        mesaj: '1 alacak kaleminin para birimi kayıtlı değil; belgeye geçerli tek bir toplam yazılamaz.',
        toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: null,
        paraBirimleri: ['USD'],
        paraBirimiEksikKalemSayisi: 1,
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'USD', kalemSayisi: 1, totals: totals('USD', { principal: 10_000, total: 10_000 }) }],
      });
    });

    it('eksik + karma birlikte: PARA_BIRIMI_EKSIK öncelikli, tek toplam yine geçersiz', () => {
      const status = buildTemplateTotalsCurrencyStatus([...KARMA, item('EXPENSE', 300, '')], FILE_LABEL('USD'));

      expect(status).toMatchObject({ durum: 'PARA_BIRIMI_EKSIK', toplamGosterilebilir: false, alacakParaBirimi: null, paraBirimiEksikKalemSayisi: 1 });
      expect(status.toplamlarParaBirimiBazinda.map((row) => row.kalemSayisi)).toEqual([1, 1, 1]);
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

describe('formatTemplateTotalsCurrencyRejection — hata belgenin neden üretilemediğini açıkça söyler', () => {
  it('neden + "çevrilmedi" + hiçbir biçimde üretilmez + geçici koruma sınırı', () => {
    const text = formatTemplateTotalsCurrencyRejection(buildTemplateTotalsCurrencyStatus(KARMA, FILE_LABEL('USD')));

    expect(text).toContain('Resmî belge üretilemedi:');
    expect(text).toContain('birden fazla para biriminde alacak kalemi var (EUR, TRY, USD)');
    expect(text).toContain('Tutarlar çevrilmedi');
    expect(text).toContain('hiçbir biçimde (PDF, Word, XML, UDF, metin) üretilmez');
    expect(text).toContain('geçici bir korumadır');
    expect(text).not.toMatch(/17\.?000/);
  });

  it('hata kodu sabit', () => {
    expect(TEMPLATE_TOTALS_CURRENCY_REJECTION_CODE).toBe('BELGE_TOPLAMI_PARA_BIRIMI_GECERSIZ');
  });
});

describe('TemplateEngineService — resmî çıktı ret kapısı HER üretim yolunda ve HER biçimde', () => {
  const claimItem = (itemType: string, amount: number, currency: string) => ({
    itemType,
    demandedAmount: amount,
    amount,
    currency,
    status: 'ACTIVE',
    isVirtual: false,
  });

  const MIXED_ITEMS = [claimItem('PRINCIPAL', 10_000, 'USD'), claimItem('PRINCIPAL', 5_000, 'EUR'), claimItem('PRINCIPAL', 2_000, 'TRY')];

  function buildService(caseOverrides: Record<string, unknown> = {}) {
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
      claimItems: MIXED_ITEMS,
      ...caseOverrides,
    };
    const artifact = { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: 'art-1', ...data })) };
    const audit = { log: jest.fn(async () => undefined) };
    const prisma: any = {
      case: { findFirst: jest.fn(async () => caseRecord) },
      caseInstrument: { findMany: jest.fn(async () => []) },
      caseJudgment: { findFirst: jest.fn(async () => null) },
      caseLease: { findFirst: jest.fn(async () => null) },
      formType: { findUnique: jest.fn(async () => null) },
      documentArtifact: artifact,
    };
    const feeEngine: any = { getInterestRate: jest.fn().mockReturnValue(9) };
    const service = new TemplateEngineService(prisma, feeEngine, audit as any);
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    const getCaseData = (): Promise<TemplateData> => (service as any).getCaseData('case-1', 't1');
    return { service, artifact, audit, warn, getCaseData };
  }

  type Service = TemplateEngineService;
  const DOC_TYPES = ['takip-talebi', 'odeme-emri', 'icra-emri'] as const;

  /** Dosya kaydından belge üreten HER yol: ad → çağrı. Yeni üretim yolu eklenirse buraya EKLENMEZSE statik tarama düşer. */
  const entryPoints = (s: Service): Array<[string, () => Promise<unknown>]> => [
    ['metin takip talebi', () => s.generateTakipTalebiFromCase('case-1', 't1')],
    ['metin ödeme emri', () => s.generateOdemeEmriFromCase('case-1', 't1')],
    ['metin icra emri', () => s.generateIcraEmriFromCase('case-1', 't1')],
    ...DOC_TYPES.flatMap((type): Array<[string, () => Promise<unknown>]> => [
      [`PDF ${type}`, () => s.generatePdfFromCase('case-1', type, 't1')],
      [`Word ${type}`, () => s.generateWordFromCase('case-1', type, 't1')],
      [`UDF ${type}`, () => s.generateUdfFromCase('case-1', type, 't1')],
      [`XML ${type}`, () => s.generateXmlFromCase('case-1', type, 't1')],
      [`merkezi DOCX ${type}`, () => s.generateDocumentFromCase('case-1', 'DOCX', type, 'v1', 't1', 'u1')],
      [`merkezi PDF ${type}`, () => s.generateDocumentFromCase('case-1', 'PDF', type, 'v1', 't1', 'u1')],
      [`merkezi XML ${type}`, () => s.generateDocumentFromCase('case-1', 'XML', type, 'v1', 't1', 'u1')],
    ]),
    ['dilekçe itirazın iptali', () => s.generateItirazinIptaliFromCase('case-1', 't1')],
    ['dilekçe itirazın iptali Word', () => s.generateItirazinIptaliWord('case-1', 't1')],
    ['dilekçe tasarrufun iptali', () => s.generateTasarrufunIptaliFromCase('case-1', 't1')],
    ['dilekçe tasarrufun iptali Word', () => s.generateTasarrufunIptaliWord('case-1', 't1')],
    ['dilekçe dolandırıcılık', () => s.generateDolandiricilikSucDuyurusuFromCase('case-1', 't1')],
    ['dilekçe dolandırıcılık Word', () => s.generateDolandiricilikSucDuyurusuWord('case-1', 't1')],
  ];

  it('karma dosya (USD 10.000 + EUR 5.000 + TRY 2.000): her yol 400 + neden kodu + para birimi dökümü ile REDDEDER', async () => {
    const { service } = buildService();
    const points = entryPoints(service);
    expect(points).toHaveLength(3 + DOC_TYPES.length * 7 + 6); // bakıldığının kanıtı: 30 yol

    for (const [name, call] of points) {
      const error = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect({ name, rejected: error instanceof BadRequestException }).toEqual({ name, rejected: true });
      const body = (error as BadRequestException).getResponse() as Record<string, any>;
      expect({ name, status: (error as BadRequestException).getStatus() }).toEqual({ name, status: 400 });
      expect(body.code).toBe('BELGE_TOPLAMI_PARA_BIRIMI_GECERSIZ');
      expect(body.message).toContain('Resmî belge üretilemedi');
      expect(body.message).toContain('EUR, TRY, USD');
      expect(body.paraBirimiDurumu).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        paraBirimleri: ['EUR', 'TRY', 'USD'],
      });
      // Gövde / mesajda çapraz toplam yok
      expect(JSON.stringify(body)).not.toMatch(/17\.?000/);
    }
  });

  it('reddedilen üretim hiçbir kayıt yazmaz ve önbelleğe bakmaz: DocumentArtifact yok, denetim kaydı yok, günlükte yalnız kod', async () => {
    const { service, artifact, audit, warn } = buildService();

    await expect(service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'u1')).rejects.toBeInstanceOf(BadRequestException);

    expect(artifact.findFirst).not.toHaveBeenCalled(); // önbellek araması kapıdan SONRA
    expect(artifact.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe(
      '[TotalsCurrency] resmi cikti reddedildi: case=case-1 durum=KARMA_PARA_BIRIMI etiket=USD paraBirimleri=EUR,TRY,USD',
    );
  });

  it('dosya dövizli, kalem kayıtları TRY (eski kayıt): icra belgeleri ETIKET_UYUSMUYOR ile reddedilir', async () => {
    const { service } = buildService({ claimItems: [claimItem('PRINCIPAL', 10_000, 'TRY'), claimItem('EXPENSE', 250, 'TRY')] });

    await expect(service.generateOdemeEmriFromCase('case-1', 't1')).rejects.toMatchObject({
      response: { code: 'BELGE_TOPLAMI_PARA_BIRIMI_GECERSIZ', paraBirimiDurumu: { durum: 'ETIKET_UYUSMUYOR', toplamGosterilebilir: false } },
    });
    await expect(service.generateXmlFromCase('case-1', 'takip-talebi', 't1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('para birimi boş kalem: belge veri katmanı onu "TL" basar (getCaseData: boş → TRY); kapı BASILANI değerlendirir → USD dosyada karma, reddedilir', async () => {
    const { service } = buildService({ claimItems: [claimItem('PRINCIPAL', 10_000, 'USD'), claimItem('EXPENSE', 300, '')] });

    await expect(service.generateIcraEmriFromCase('case-1', 't1')).rejects.toMatchObject({
      response: { paraBirimiDurumu: { durum: 'KARMA_PARA_BIRIMI', paraBirimleri: ['TRY', 'USD'] } },
    });
  });

  it('dava dilekçesi: USD dosyada (tek para birimli bile) sabit "TL" yanlış etiket → reddedilir; icra belgesi aynı dosyada ÜRETİLİR', async () => {
    const { service } = buildService({ claimItems: [claimItem('PRINCIPAL', 10_000, 'USD'), claimItem('EXPENSE', 250, 'USD')] });

    await expect(service.generateItirazinIptaliFromCase('case-1', 't1')).rejects.toMatchObject({
      response: { paraBirimiDurumu: { durum: 'ETIKET_UYUSMUYOR', toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'SABIT_TL' } } },
    });
    await expect(service.generateOdemeEmriFromCase('case-1', 't1')).resolves.toMatchObject({ templateCode: 'ORNEK_7_ILAMSIZ' });
  });

  describe('tek para birimli geçerli akış DEĞİŞMEZ', () => {
    it.each([
      ['TRY', 'TL'],
      ['USD', '$'],
    ])('%s dosya: metin belgeleri ham üretimle birebir aynı, yanıt şekli aynı (ek alan yok)', async (currency, symbol) => {
      const { service, getCaseData } = buildService({ currency, claimItems: [claimItem('PRINCIPAL', 10_000, currency), claimItem('EXPENSE', 250, currency)] });
      const data = await getCaseData();

      const takip = await service.generateTakipTalebiFromCase('case-1', 't1');
      const odeme = await service.generateOdemeEmriFromCase('case-1', 't1');
      const icra = await service.generateIcraEmriFromCase('case-1', 't1');

      expect(takip).toEqual(service.generateTakipTalebi(data));
      expect(odeme).toEqual(service.generateOdemeEmri(data));
      expect(icra).toEqual(service.generateIcraEmri(data));
      for (const doc of [takip, odeme, icra]) expect(Object.keys(doc)).toEqual(['title', 'content', 'format', 'templateCode', 'selection']);
      expect(odeme.content).toContain(`TOPLAM          : 10.250,00 ${symbol}`);
    });

    it('XML / UDF / PDF / Word / merkezi üretim ham üretim yoluna aynı belge verisini verir; denetim ve kayıt akışı aynı', async () => {
      const { service, getCaseData, artifact, audit } = buildService({ claimItems: [claimItem('PRINCIPAL', 10_000, 'USD'), claimItem('EXPENSE', 250, 'USD')] });
      const data = await getCaseData();
      const word = jest.spyOn(service as any, 'generateTakipTalebiWordFormatted').mockResolvedValue(Buffer.from('docx'));
      const pdf = jest.spyOn(service as any, 'generateTakipTalebiPdfFormatted').mockResolvedValue(Buffer.from('pdf'));
      const withoutTime = (value: string) => value.replace(/<CreatedAt>[^<]*<\/CreatedAt>/, '');

      expect(withoutTime(await service.generateXmlFromCase('case-1', 'takip-talebi', 't1'))).toBe(withoutTime(service.generateTakipTalebiXml(data)));
      const udf = await service.generateUdfFromCase('case-1', 'takip-talebi', 't1');
      expect(udf.content.sections.find((section) => section.type === 'CLAIMS')?.data).toEqual({ claimItems: data.claimItems, totals: data.totals });
      expect((await service.generatePdfFromCase('case-1', 'takip-talebi', 't1')).toString()).toBe('pdf');
      expect((await service.generateWordFromCase('case-1', 'takip-talebi', 't1')).toString()).toBe('docx');
      expect((word.mock.calls[0] as any[])[0]).toEqual(data);
      expect((pdf.mock.calls[0] as any[])[0]).toEqual(data);

      const central = await service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'u1');
      expect(Object.keys(central)).toEqual(['buffer', 'artifact', 'fromCache', 'selection']);
      expect(artifact.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect((audit.log.mock.calls[0] as any[])[0].metadata).not.toHaveProperty('paraBirimiDurumu');
      expect((artifact.create.mock.calls[0] as any[])[0].data.dataHash).toBe((service as any).generateDataHash(data));
    });

    it('kalemsiz dosya reddedilmez (toplam 0, para birimi çelişkisi yok)', async () => {
      const { service } = buildService({ claimItems: [], dues: [], principalAmount: 0 });

      await expect(service.generateOdemeEmriFromCase('case-1', 't1')).resolves.toMatchObject({ templateCode: 'ORNEK_7_ILAMSIZ' });
    });

    it('istemci verisiyle üretim (dosya kaydı yok) kapıya GİRMEZ: toplam istemciden gelir (kapsam dışı, ayrıca listelenir)', () => {
      const { service } = buildService();
      const base = {
        fileNumber: '2026/1', filingDate: '2026-01-01', executionOffice: { name: 'Ankara', city: 'Ankara' },
        creditors: [{ type: 'INDIVIDUAL', name: 'Alacaklı', address: 'Adres' }], lawyers: [{ name: 'Av. Deniz Yılmaz' }],
        debtors: [{ type: 'INDIVIDUAL', name: 'Borçlu', address: 'A' }],
        claimItems: [{ type: 'PRINCIPAL', description: 'Asıl', amount: 10_000, currency: 'USD' }, { type: 'PRINCIPAL', description: 'Asıl', amount: 5_000, currency: 'EUR' }],
        totals: { principal: 15_000, interest: 0, fees: 0, total: 15_000, currency: 'USD' },
        interestInfo: { type: 'YASAL', description: '', variableRate: true }, caseType: 'GENERAL_EXECUTION', subCategory: 'GENEL', executionPath: 'HACIZ',
      } as unknown as TemplateData;

      expect(() => service.generateOdemeEmri(base)).not.toThrow();
      expect(() => service.generateTakipTalebiXml(base)).not.toThrow();
    });
  });
});

describe('ret kapısı atlanamaz — statik tarama', () => {
  it('dosya kaydından belge üreten her `generate*FromCase` yolu kapıdan geçer (getCaseData\'yı doğrudan çağıran tek yol karşılıksız çek şikayeti: tutar basmaz)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source: string = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'template-engine.service.ts'), 'utf8');
    const direct = source
      .split('\n')
      .map((line, index) => ({ line, no: index + 1 }))
      .filter(({ line }) => line.includes('await this.getCaseData('));
    // doğrudan çağıranların yöntem adları
    const methodOf = (no: number) => {
      const lines = source.split('\n');
      for (let i = no - 1; i >= 0; i -= 1) {
        const match = /^ {2}(?:async |private async )?([A-Za-z]+)\(/.exec(lines[i]);
        if (match) return match[1];
      }
      return '?';
    };
    const names = direct.map(({ no }) => methodOf(no)).sort();
    // Kapı yöntemi kendisi + karşılıksız çek şikayeti (tutar basmaz: yalnız çek tutarı)
    expect(names).toEqual(['generateKarsiliksizCekSikayetFromCase', 'getCaseDataForOfficialTotals']);
    expect((source.match(/getCaseDataForOfficialTotals\(caseId, tenantId, '(CASE|PETITION)'\)/g) ?? []).length).toBe(11);
  });
});

describe('denetleyiciler ret yanıtını 500 hatasına ÇEVİRMEZ — durum kodu ve gövde olduğu gibi döner', () => {
  const buildRes = () => {
    const res: any = {};
    res.set = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };
  const rejection = () =>
    new BadRequestException({ code: 'BELGE_TOPLAMI_PARA_BIRIMI_GECERSIZ', message: 'Resmî belge üretilemedi: neden', paraBirimiDurumu: { durum: 'KARMA_PARA_BIRIMI' } });

  it('merkezi üretim ucu: 400 gövdesi aynen döner; başka büro (404) 404 kalır; beklenmeyen hata 500', async () => {
    for (const [error, status, body] of [
      [rejection(), 400, rejection().getResponse()],
      [new NotFoundException('Dosya bulunamadı'), 404, new NotFoundException('Dosya bulunamadı').getResponse()],
      [new Error('beklenmeyen'), 500, { message: 'beklenmeyen' }],
    ] as Array<[Error, number, unknown]>) {
      const service: any = { generateDocumentFromCase: jest.fn().mockRejectedValue(error) };
      const res = buildRes();
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await new TemplateEngineController(service).generateDocumentFromCase('case-1', 'xml', 'takip-talebi', 't1', 'u1', res);

      expect({ status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] }).toEqual({ status, body });
      expect(res.send).not.toHaveBeenCalled();
    }
  });

  it('eski PDF ucu: 400 gövdesi aynen döner (500 "PDF olusturulamadi" DEĞİL); başka hata eski 500 gövdesini korur', async () => {
    const buildController = (error: Error) => {
      const templateEngine: any = { generateTakipTalebiFromCase: jest.fn().mockRejectedValue(error) };
      return new PdfController({ generateTakipTalebiPdf: jest.fn() } as any, templateEngine);
    };

    const rejected = buildRes();
    await buildController(rejection()).downloadTakipTalebi('case-1', 't1', rejected);
    expect({ status: rejected.status.mock.calls[0][0], body: rejected.json.mock.calls[0][0] }).toEqual({ status: 400, body: rejection().getResponse() });

    const failed = buildRes();
    await buildController(new Error('boom')).downloadTakipTalebi('case-1', 't1', failed);
    expect({ status: failed.status.mock.calls[0][0], body: failed.json.mock.calls[0][0] }).toEqual({
      status: 500,
      body: { success: false, message: 'PDF olusturulamadi', error: 'boom' },
    });
  });
});
