import 'reflect-metadata';
import { CanActivate, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import type { ITariffRepository, Tariff } from '@shared/types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TariffService } from '../../tariff/tariff.service';
import { FeeEngineController } from '../fee-engine.controller';
import { FeeEngineService, TARIFF_REPOSITORY } from '../fee-engine.service';

/**
 * POST /fee-engine/preview — takip türü kodu, tek kaynaktan döküm, "hesaplanamadı" (gerçek Nest HTTP seviyesi; DB yok).
 *
 * Ölçülen kusur (main 63dc6618 / fdc1f23b; gerçek tarayıcı + derlenmiş denetleyici): form takip türü yerine kalem türünü
 * gönderiyordu; lookup kataloğundaki takip türü kodlarının hiçbiri profille eşleşmiyordu; `breakdown` her durumda 0'dı
 * (denetleyici `BASVURMA_HARCI`… ararken servis `application_fee`… üretiyordu); tarife yokken / eksikken yanıt
 * `success: true, estimatedFees: 0` idi. Sihirbaz panelinde "0,00 ₺" gerçek 0'dan ayırt edilemiyordu.
 *
 * Sözleşme (owner kararı 12; tutar / oran / tarife tablosu DEĞİŞMEDİ):
 *  - Takip türü kodu (`takipTuruCode`) tek eşlemeyle masraf profiline çevrilir; çözülemezse `success:false` (sıfır DEĞİL).
 *  - Satırlar servisin ürettiği kalemlerden gelir; satırların toplamı `estimatedFees`'e eşittir.
 *  - Tarife yok / tarifede gerekli kalem yok → `success:false`. Tarifede olup bu takip türüne uygulanmayan kalem
 *    (ilamlıda peşin harç) gerçek 0'dır ve `success:true` kalır.
 *
 * İki uygulama: (1) gerçek 2026 tarife dosyası (yıl sabitlenmiş), (2) kalemi tek tek bozulabilen sahte tarife.
 */
const allowGuard: CanActivate = { canActivate: () => true };

const real = new TariffService();
const REAL_2026: Tariff = real.getTariff(2026) as Tariff;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

async function createApp(repo: ITariffRepository): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [FeeEngineController],
    providers: [FeeEngineService, { provide: TARIFF_REPOSITORY, useValue: repo }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(allowGuard)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

const repoOf = (tariff: Tariff | null): ITariffRepository => ({
  getTariff: () => tariff,
  getActiveTariff: () => tariff,
  getAvailableYears: () => (tariff ? [tariff.year] : []),
});

const sum = (b: Record<string, number>) => Math.round(Object.values(b).reduce((a, v) => a + v, 0) * 100) / 100;

describe('POST /fee-engine/preview — gerçek 2026 tarifesi, takip türü kodu', () => {
  let app: INestApplication;
  const preview = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/fee-engine/preview').send(body);

  beforeAll(async () => {
    expect(REAL_2026).toBeTruthy(); // test BAKTIĞI tarifeyi kanıtlar
    app = await createApp(repoOf(REAL_2026));
  });
  afterAll(async () => {
    await app?.close();
  });

  it('ILAMSIZ_GENEL 10.000 TL: satırlar dolu, satırların toplamı İCRA MASRAFLARI\'na eşit (eskiden 0 / 0)', async () => {
    const res = await preview({ principalAmount: 10_000, takipTuruCode: 'ILAMSIZ_GENEL', debtorCount: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.breakdown).toEqual({
      basvurmaHarci: 738.5,
      vekaletHarci: 105,
      pesinHarc: 120,
      dosyaGideri: 50,
      tebligatGideri: 252,
      vekaletPulu: 165.6,
    });
    expect(res.body.data.estimatedFees).toBe(1431.1);
    expect(sum(res.body.data.breakdown)).toBe(res.body.data.estimatedFees);
    expect(res.body.data.tariffYear).toBe(2026);
  });

  it.each([
    ['ILAMSIZ_GENEL', 120],
    ['ILAMSIZ_KIRA', 120],
    ['KAMBIYO_CEK', 120],
    ['KAMBIYO_SENET', 120],
    ['ILAMSIZ_TAHLIYE', 0],
    ['ILAMLI', 0],
    ['REHIN_TASINIR', 0],
    ['REHIN_TASINMAZ', 0],
    ['IFLAS_ADI', 0],
    ['IFLAS_KAMBIYO', 0],
  ])('%s: satırlar dolu ve toplamla tutar; peşin harç %s', async (takipTuruCode, pesinHarc) => {
    const res = await preview({ principalAmount: 10_000, takipTuruCode, debtorCount: 1 });

    expect(res.body.success).toBe(true);
    const b = res.body.data.breakdown;
    expect(b.basvurmaHarci).toBe(738.5);
    expect(b.vekaletHarci).toBe(105);
    expect(b.vekaletPulu).toBe(165.6);
    expect(b.dosyaGideri).toBe(50);
    expect(b.tebligatGideri).toBe(252);
    expect(b.pesinHarc).toBe(pesinHarc);
    expect(sum(b)).toBe(res.body.data.estimatedFees);
  });

  it('GERÇEK 0 ≠ hesaplanamadı: ilamlıda peşin harç doğmaz (0, success:true); NAFAKA için profil yok (success:false)', async () => {
    const ilamli = await preview({ principalAmount: 10_000, takipTuruCode: 'ILAMLI' });
    expect(ilamli.body.success).toBe(true);
    expect(ilamli.body.data.breakdown.pesinHarc).toBe(0);

    const nafaka = await preview({ principalAmount: 10_000, takipTuruCode: 'NAFAKA' });
    expect(nafaka.body.success).toBe(false);
    expect(nafaka.body.error.code).toBe('CASE_TYPE_UNRESOLVED');
    expect(nafaka.body).not.toHaveProperty('data');
  });

  it('tebligat gideri borçlu sayısıyla çarpılır (2 borçlu)', async () => {
    const res = await preview({ principalAmount: 10_000, takipTuruCode: 'ILAMSIZ_GENEL', debtorCount: 2 });
    expect(res.body.data.breakdown.tebligatGideri).toBe(504);
    expect(sum(res.body.data.breakdown)).toBe(res.body.data.estimatedFees);
  });

  it.each(['ASIL_ALACAK', 'FATURA', 'CEK', 'SENET', 'ILAM', 'AIDAT', 'KREDI', 'NAFAKA', 'IPOTEK', 'BANKA'])(
    'KALEM TÜRÜ "%s" takip türü yerine geçmez: sessiz 0 yok, success:false',
    async (kalemTuru) => {
      const res = await preview({ principalAmount: 10_000, caseType: kalemTuru });

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CASE_TYPE_UNRESOLVED');
      expect(res.body).not.toHaveProperty('data');
    },
  );

  it('takip türü hiç gönderilmezse eski varsayılana (ILAMSIZ_GENEL → 0) düşülmez: success:false', async () => {
    const res = await preview({ principalAmount: 10_000 });

    expect(res.body).toEqual({
      success: false,
      error: { code: 'CASE_TYPE_UNRESOLVED', message: 'Takip türü belirtilmedi; masraflar hesaplanamadı.' },
      cached: false,
    });
  });

  it('doğrudan profil kodu (caseType) hâlâ çalışır; takip türü kodu varsa o esastır', async () => {
    const direct = await preview({ principalAmount: 10_000, caseType: 'KIRA' });
    const viaCode = await preview({ principalAmount: 10_000, takipTuruCode: 'ILAMSIZ_KIRA' });
    expect(direct.body.data.breakdown).toEqual(viaCode.body.data.breakdown);

    const conflicting = await preview({ principalAmount: 10_000, takipTuruCode: 'NAFAKA', caseType: 'ILAMSIZ' });
    expect(conflicting.body.success).toBe(false);
  });

  it('para birimi kapıları KORUNDU: dövizli kalemde oranlı satırlar hesaplanamadı, toplamlar gösterilemez; sayılar aynı', async () => {
    const tl = await preview({ principalAmount: 10_000, takipTuruCode: 'ILAMSIZ_GENEL', currency: 'TRY', caseCurrency: 'TRY' });
    const usd = await preview({ principalAmount: 10_000, takipTuruCode: 'ILAMSIZ_GENEL', currency: 'USD', caseCurrency: 'USD' });

    expect(tl.body.data.paraBirimiDurumu).toMatchObject({ durum: 'TEK_PARA_BIRIMI_TL', toplamGosterilebilir: true });
    expect(usd.body.data.paraBirimiDurumu).toMatchObject({ durum: 'TEK_PARA_BIRIMI_DOVIZ', toplamGosterilebilir: false });
    expect(usd.body.data.paraBirimiDurumu.alanlar.icraMasraflari).toEqual({ paraBirimi: null, durum: 'HESAPLANAMADI' });
    expect(usd.body.data.paraBirimiDurumu.alanlar.sonBorc).toEqual({ paraBirimi: null, durum: 'GOSTERILEMEZ' });
    expect(usd.body.data.estimatedFees).toBe(tl.body.data.estimatedFees);
  });

  it('geçersiz tutar: hata yanıtı aynen', async () => {
    const res = await preview({ principalAmount: 0, takipTuruCode: 'ILAMSIZ_GENEL' });
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'principalAmount must be greater than 0' },
      cached: false,
    });
  });
});

describe('POST /fee-engine/preview — tarife yok / eksik: "hesaplanamadı", sessiz 0 DEĞİL', () => {
  const open = async (tariff: Tariff | null) => createApp(repoOf(tariff));
  const post = (app: INestApplication) =>
    request(app.getHttpServer()).post('/fee-engine/preview').send({ principalAmount: 10_000, takipTuruCode: 'ILAMSIZ_GENEL', debtorCount: 1 });

  const withoutFixed = (code: string): Tariff => {
    const t = clone(REAL_2026);
    delete t.fixedFees[code];
    return t;
  };

  it('tarife hiç yok: success:false / TARIFF_NOT_FOUND, data yok (eskiden success:true, 0, yıl 2026)', async () => {
    const app = await open(null);
    try {
      const res = await post(app);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TARIFF_NOT_FOUND');
      expect(res.body).not.toHaveProperty('data');
    } finally {
      await app.close();
    }
  });

  it.each([
    ['application_fee'],
    ['poa_copy_fee'],
    ['bar_stamp_fee'],
    ['file_expense'],
  ])('tarifede %s kalemi yok: success:false / TARIFF_ITEM_MISSING (kalem sessizce 0 sayılmaz)', async (code) => {
    const app = await open(withoutFixed(code));
    try {
      const res = await post(app);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TARIFF_ITEM_MISSING');
      expect(res.body.error.message).toContain(code);
      expect(res.body).not.toHaveProperty('data');
    } finally {
      await app.close();
    }
  });

  it('tarifede peşin harç oranı kalemi yok: success:false', async () => {
    const t = clone(REAL_2026);
    delete t.rateFees['ilamsiz_pesin_harc'];
    const app = await open(t);
    try {
      const res = await post(app);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TARIFF_ITEM_MISSING');
    } finally {
      await app.close();
    }
  });

  it('tarifede tebligat ücreti yok: success:false', async () => {
    const t = clone(REAL_2026);
    delete t.postage['NORMAL'];
    const app = await open(t);
    try {
      const res = await post(app);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TARIFF_ITEM_MISSING');
    } finally {
      await app.close();
    }
  });

  it('kalem tarifede VAR ama bu takip türüne uygulanmıyor: gerçek 0, success:true (eksik tarife değil)', async () => {
    const t = clone(REAL_2026);
    t.fixedFees['file_expense'].appliesTo = ['KAMBIYO']; // ILAMSIZ için dosya gideri doğmaz
    const app = await open(t);
    try {
      const res = await post(app);
      expect(res.body.success).toBe(true);
      expect(res.body.data.breakdown.dosyaGideri).toBe(0);
      expect(sum(res.body.data.breakdown)).toBe(res.body.data.estimatedFees);
    } finally {
      await app.close();
    }
  });

  it('yanıttaki tarife yılı KULLANILAN tarifenin yılıdır (takvim yılı değil)', async () => {
    const t = clone(REAL_2026);
    t.year = 2031;
    const app = await open(t);
    try {
      const res = await post(app);
      expect(res.body.data.tariffYear).toBe(2031);
    } finally {
      await app.close();
    }
  });
});
