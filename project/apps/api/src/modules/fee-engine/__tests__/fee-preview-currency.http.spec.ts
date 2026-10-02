import 'reflect-metadata';
import { CanActivate, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import type { ITariffRepository, Tariff } from '@shared/types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FeeEngineController } from '../fee-engine.controller';
import { FeeEngineService, TARIFF_REPOSITORY } from '../fee-engine.service';

/**
 * POST /fee-engine/preview — para birimi bağlamı (gerçek Nest HTTP seviyesi; DB yok).
 *
 * Ölçülen kusur (main 6681b1d5, gerçek tarayıcı + derlenmiş API + disposable PostgreSQL): önizleme isteği para birimi
 * taşımıyor, yanıt USD / EUR / TRY için birebir aynı; sihirbazın alacak kalemi formu TL tarifesi tutarlarını kalemin para
 * birimi simgesiyle basıp döviz anaparayla tek toplamda birleştiriyordu.
 *
 * Sözleşme (politika gerektirmeyen kısım; kural SEÇİLMEZ, tutar ÇEVRİLMEZ):
 *  - İstek `currency` taşırsa yanıt eklemeli `data.paraBirimiDurumu` kararını taşır; istemci buna göre gösterir.
 *  - Mevcut sayısal alanların DEĞERİ değişmez; para birimi göndermeyen çağıran için yanıt AYNEN kalır.
 *
 * Tarife sabit bir sahte depodan gelir (sayılar yıl ve YAML'dan bağımsız); masraf profilleri gerçek dosyadan yüklenir.
 */
const TARIFF: Tariff = {
  version: 1,
  year: 2026,
  effectiveDate: '2026-01-01',
  fixedFees: {
    application_fee: { amount: 700, label: 'Başvurma Harcı', itemType: 'FEE', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
    poa_copy_fee: { amount: 100, label: 'Vekalet Suret Harcı', itemType: 'FEE', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
    bar_stamp_fee: { amount: 150, label: 'Vekalet Pulu', itemType: 'STAMP', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
  },
  rateFees: {
    ilamsiz_pesin_harc: { rate: 0.005, label: 'Peşin Harç', itemType: 'FEE', base: 'principal_plus_interest', appliesTo: ['ILAMSIZ'], minAmount: 100 },
    kambiyo_pesin_harc: { rate: 0.005, label: 'Peşin Harç', itemType: 'FEE', base: 'principal_plus_interest', appliesTo: ['KAMBIYO'], minAmount: 100 },
  },
  postage: {
    NORMAL: { amount: 250, label: 'Normal Tebligat', description: 'PTT normal tebligat' },
    UETS: { amount: 20, label: 'UETS Tebligat', description: 'Elektronik tebligat' },
  },
  interestRates: { TRY: { YASAL: [{ startDate: '2024-01-01', rate: 24 }] } },
  penalties: { bad_check_compensation: { defaultRate: 0.1, label: 'Karşılıksız Çek Tazminatı' } },
};

const tariffRepository: ITariffRepository = {
  getTariff: () => TARIFF,
  getActiveTariff: () => TARIFF,
  getAvailableYears: () => [TARIFF.year],
};

const allowGuard: CanActivate = { canActivate: () => true };

const NUMERIC_KEYS = ['breakdown', 'estimatedAttorneyFee', 'estimatedFees', 'tariffYear'];

describe('POST /fee-engine/preview — para birimi bağlamı', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [FeeEngineController],
      providers: [FeeEngineService, { provide: TARIFF_REPOSITORY, useValue: tariffRepository }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // main.ts ile AYNI doğrulama ayarı: yeni istek alanları üretimdeki boru hattında da reddedilmemeli
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const preview = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/fee-engine/preview').send(body);

  /** Yanıtın sayısal kısmı (para birimi kararı ve süreli alan hariç). */
  const numbers = (body: { data?: Record<string, unknown> }) =>
    Object.fromEntries(NUMERIC_KEYS.map((key) => [key, body.data?.[key]]));

  it('para birimi göndermeyen çağıran: yanıt AYNEN (karar bloğu yok, alan kümesi değişmedi)', async () => {
    const res = await preview({ principalAmount: 10_000, caseType: 'ILAMSIZ', debtorCount: 1 });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['cacheExpiry', 'cached', 'data', 'success']);
    expect(Object.keys(res.body.data).sort()).toEqual(NUMERIC_KEYS);
    expect(res.body.success).toBe(true);
    // Sabit tarife: 700 + 100 + 150 + peşin harç max(10.000 × 0,005; 100) + tebligat 250
    expect(res.body.data.estimatedFees).toBe(1300);
  });

  it.each(['ILAMSIZ', 'KAMBIYO', 'ILAMLI', 'ASIL_ALACAK'])(
    'mevcut sayısal alanlar para biriminden bağımsızdır ve DEĞİŞMEDİ (%s): hesap ve çevirme yok',
    async (caseType) => {
      const base = { principalAmount: 250_000, caseType, debtorCount: 2 };
      const legacy = await preview(base);

      for (const extra of [{ currency: 'TRY' }, { currency: 'USD' }, { currency: 'EUR', caseCurrency: 'TRY' }]) {
        const res = await preview({ ...base, ...extra });
        expect(res.status).toBe(201);
        expect(numbers(res.body)).toEqual(numbers(legacy.body));
        expect(Object.keys(res.body.data).sort()).toEqual([...NUMERIC_KEYS, 'paraBirimiDurumu'].sort());
      }
    },
  );

  it('TL kalem: tek toplam gösterilebilir; bütün alanlar TRY ve geçerli; uyarı metni yok', async () => {
    const res = await preview({ principalAmount: 10_000, caseType: 'ILAMSIZ', debtorCount: 1, currency: 'TRY', caseCurrency: 'TRY' });

    expect(res.body.data.paraBirimiDurumu).toMatchObject({
      dosyaParaBirimi: 'TRY',
      tarifeParaBirimi: 'TRY',
      durum: 'TEK_PARA_BIRIMI_TL',
      toplamGosterilebilir: true,
      gerekce: null,
      mesaj: null,
      alacakParaBirimi: 'TRY',
    });
    for (const alan of Object.values(res.body.data.paraBirimiDurumu.alanlar)) {
      expect(alan).toEqual({ paraBirimi: 'TRY', durum: 'GECERLI' });
    }
  });

  it('dövizli kalem: alacak kendi para biriminde; sabit tarife TL; oranlı kalemler HESAPLANAMADI; toplamlar GOSTERILEMEZ', async () => {
    const res = await preview({ principalAmount: 10_000, caseType: 'ILAMSIZ', debtorCount: 1, currency: 'USD', caseCurrency: 'USD' });
    const durum = res.body.data.paraBirimiDurumu;

    expect(durum).toMatchObject({
      dosyaParaBirimi: 'USD',
      tarifeParaBirimi: 'TRY',
      durum: 'TEK_PARA_BIRIMI_DOVIZ',
      toplamGosterilebilir: false,
      gerekce: 'DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
      alacakParaBirimi: 'USD',
    });
    expect(durum.mesaj).toContain('USD');
    expect(durum.alanlar).toMatchObject({
      asilAlacak: { paraBirimi: 'USD', durum: 'GECERLI' },
      takipTutari: { paraBirimi: 'USD', durum: 'GECERLI' },
      takipSonrasiFaiz: { paraBirimi: 'USD', durum: 'GECERLI' },
      basvurmaHarci: { paraBirimi: 'TRY', durum: 'GECERLI' },
      tebligatGideri: { paraBirimi: 'TRY', durum: 'GECERLI' },
      pesinHarc: { paraBirimi: null, durum: 'HESAPLANAMADI' },
      icraMasraflari: { paraBirimi: null, durum: 'HESAPLANAMADI' },
      pesinHarcDahilTahsilHarci: { paraBirimi: null, durum: 'HESAPLANAMADI' },
      pesinHarcHaricTahsilHarci: { paraBirimi: null, durum: 'HESAPLANAMADI' },
      vekaletUcreti: { paraBirimi: null, durum: 'HESAPLANAMADI' },
      toplamBorc: { paraBirimi: null, durum: 'GOSTERILEMEZ' },
      sonBorc: { paraBirimi: null, durum: 'GOSTERILEMEZ' },
      tahsilOranlari: { paraBirimi: null, durum: 'GOSTERILEMEZ' },
    });
    // Tutar listesi taşınmaz: önizlemenin tek tutarı takip tutarıdır, asıl alacak değil
    expect(durum).not.toHaveProperty('asilAlacakParaBirimiBazinda');
    expect(durum).not.toHaveProperty('tahsilatParaBirimiBazinda');
  });

  it('dosya para birimi bildirilmezse kalemin para birimi dosya para birimi sayılır', async () => {
    const withCase = await preview({ principalAmount: 10_000, caseType: 'ILAMSIZ', currency: 'EUR', caseCurrency: 'EUR' });
    const withoutCase = await preview({ principalAmount: 10_000, caseType: 'ILAMSIZ', currency: 'EUR' });

    expect(withoutCase.body.data.paraBirimiDurumu).toEqual(withCase.body.data.paraBirimiDurumu);
    expect(withoutCase.body.data.paraBirimiDurumu.durum).toBe('TEK_PARA_BIRIMI_DOVIZ');
  });

  it.each([
    ['USD', 'TRY'],
    ['TRY', 'USD'],
  ])('kalem %s, dosya %s: uyuşmazlık bildirilir; oranlı kalemler hesaplanmaz, tek toplam gösterilmez', async (currency, caseCurrency) => {
    const res = await preview({ principalAmount: 10_000, caseType: 'ILAMSIZ', currency, caseCurrency });
    const durum = res.body.data.paraBirimiDurumu;

    expect(durum).toMatchObject({
      dosyaParaBirimi: caseCurrency,
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR',
      alacakParaBirimi: currency,
    });
    expect(durum.mesaj).toContain(`(${caseCurrency})`);
    expect(durum.mesaj).toContain(`(${currency})`);
    expect(durum.alanlar.takipTutari).toEqual({ paraBirimi: currency, durum: 'GECERLI' });
    expect(durum.alanlar.vekaletUcreti).toEqual({ paraBirimi: null, durum: 'HESAPLANAMADI' });
    expect(durum.alanlar.sonBorc).toEqual({ paraBirimi: null, durum: 'GOSTERILEMEZ' });
  });

  it('geçersiz tutar: hata yanıtı aynen; karar bloğu üretilmez', async () => {
    const res = await preview({ principalAmount: 0, caseType: 'ILAMSIZ', currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'principalAmount must be greater than 0' },
      cached: false,
    });
  });
});
