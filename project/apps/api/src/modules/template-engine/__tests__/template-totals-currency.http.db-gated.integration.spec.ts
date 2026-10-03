// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-classification.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as AdmZip from 'adm-zip';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { FeeEngineService } from '../../fee-engine/fee-engine.service';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { PdfModule } from '../../pdf/pdf.module';
import { TemplateEngineModule } from '../template-engine.module';

/**
 * Belge şablonu toplamı — para birimi bağlamı. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main 6681b1d5): dosya kaydından üretilen belgelerde toplam, alacak kalemlerinin tutarı para birimine
 * bakılmadan toplanarak bulunuyor ve DOSYA para birimiyle etiketleniyor. USD dosyada 10.000 USD + 5.000 EUR + 2.000 TRY
 * anapara → takip talebi / ödeme emri / icra emri / Word / PDF "17.000,00 $", XML `<Total>17000</Total>
 * <Currency>USD</Currency>`, UDF `total: 17000, currency: "USD"`; aynı kalemler TRY dosyada "17.000,00 TL". Kalemleri TRY
 * kayıtlı USD dosyada satırlar "TL", toplam "10.250,00 $". Dava dilekçeleri tutarı sabit "TL" ile yazıyor (USD dosyada
 * "10.250 TL").
 *
 * Kural (politika gerektirmeyen kısım): belge ÇIKTISI DEĞİŞMEZ — tek para birimli dosyada da karma dosyada da. Dosya
 * kaydından belge üreten her yanıt, basılan toplamın (tutar + para birimi etiketi) geçerli tek tutar olup olmadığını ve
 * para birimi bazında toplamları eklemeli olarak bildirir: JSON yanıtta `paraBirimiDurumu` alanı, belge gövdeli yanıtta
 * `X-Belge-Toplam-Para-Birimi` başlığı, üretim denetim kaydında `paraBirimiDurumu`. Tutar ÇEVRİLMEZ.
 *
 * KAPSAM DIŞI (owner / hukuki karar): karma dosyada belgenin üretilip üretilmeyeceği, toplamın belgede nasıl yazılacağı,
 * kalem başına para birimi kuralı ve dövizli takipte kur. Aşağıdaki karma dosyalar bugün `POST /cases/:id/dues` ile açıkça
 * para birimi verilerek oluşabiliyor; "belge 17.000,00 $ yazmayı sürdürür" iddiaları bugünkü davranışı SABİTLER
 * (karakterizasyon) — kural seçildiğinde bilinçli olarak güncellenir.
 *
 * ALTIN DEĞERLER: `GOLDEN` parmak izleri bu değişiklikten ÖNCEKİ kodla (main 6681b1d5) üretildi; yani "aynı" iddiası
 * düzeltmesiz kodla da geçer. Belge şablonu bilinçli olarak değiştirilirse düşen karşılaştırmadaki alınan değerlerle
 * güncellenir. Parmak izine girmeyenler: üretim zamanı (XML `CreatedAt`, UDF `createdAt` / imza zamanı, DOCX
 * `docProps/core.xml`, PDF bilgi sözlüğü) ve dilekçelerdeki günün tarihi. Faiz oranı tarifeden ve günden bağımsız
 * sabitlendi (TRY %24, döviz %9 — ölçüm günündeki değerler); belge üretim yolunun geri kalanı gerçektir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('TEMPLATE-TOTALS-CURRENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({
      where: { id: String(req.headers['x-test-user-id']) },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

/** PDF içerik akışları (sıkıştırması açılmış). Üretim zamanı ve belge kimliği akışların DIŞINDA (bilgi sözlüğünde) durur. */
function pdfContentStreams(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const streams: string[] = [];
  const marker = /(?<!end)stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw))) {
    const start = match.index + match[0].length;
    const dictionary = raw.slice(raw.lastIndexOf('<<', match.index), match.index);
    const length = /\/Length (\d+)/.exec(dictionary);
    if (!length || !dictionary.includes('/FlateDecode')) throw new Error(`Beklenmeyen PDF akış sözlüğü: ${dictionary}`);
    const end = start + Number(length[1]);
    streams.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
    marker.lastIndex = end;
  }
  if (streams.length === 0) throw new Error('PDF içerik akışı bulunamadı');
  return streams.join('\n--akis--\n');
}

/** DOCX girdileri: `docProps/core.xml` (oluşturma / değiştirme zamanı) dışındaki HER girdi, adıyla birlikte. */
function docxEntries(docx: Buffer, normalize: (text: string) => string = (text) => text): string {
  const entries = new AdmZip(docx)
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName !== 'docProps/core.xml')
    .map((entry) => `${entry.entryName}\n${normalize(entry.getData().toString('utf8'))}`)
    .sort();
  if (!entries.some((entry) => entry.startsWith('word/document.xml\n'))) throw new Error('DOCX gövdesi bulunamadı');
  return entries.join('\n--girdi--\n');
}

const normalizeXml = (xml: string): string => xml.replace(/<CreatedAt>[^<]*<\/CreatedAt>/g, '<CreatedAt>ZAMAN</CreatedAt>');

const normalizeUdf = (udf: Record<string, any>): string =>
  JSON.stringify({ ...udf, createdAt: 'ZAMAN', signature: udf.signature ? { ...udf.signature, timestamp: 'ZAMAN' } : udf.signature });

const DOCUMENT_KINDS = ['takip-talebi', 'odeme-emri', 'icra-emri'] as const;
const PETITION_KINDS = ['itirazin-iptali', 'tasarrufun-iptali', 'dolandiricilik'] as const;
const TOTALS_HEADER = 'x-belge-toplam-para-birimi';

type Fingerprints = Record<string, string>;

// Bu değişiklikten ÖNCEKİ kodla (main 6681b1d5) üretilen parmak izleri — bkz. dosya başındaki not.
const GOLDEN: Record<string, Fingerprints> = {
  TRY: {
    'metin:takip-talebi': 'f2ee2ef82cb9cd4e7a0e59956f6357c546e0b5209f8cdcff3491af83e72e2ae9',
    'xml:takip-talebi': 'e145e7ea83cfa74a89b035f042145b559bb55b7049f173241460f977a1bdf21d',
    'udf:takip-talebi': '2cdc5791a1158791a2375803cd15e037a6769b89996ce57f18928b654e96398c',
    'word:takip-talebi': 'e08bd8413607bef9d101393b57ecd7553c8e049499d2c31190d3a0d6c0738619',
    'pdf:takip-talebi': '6f282c6b20ae160f53248371b05918957805300eadabc2d65ea95c36708fb812',
    'metin:odeme-emri': '6591c2be5b2c039d231e93ca4a9cfffd671a42e72bfaf12ae184044b6cfa43e0',
    'xml:odeme-emri': '5ee9f4915d0c2740610b62377f5f6ed93375ed48d81d4f63dad8e0c5ad462e07',
    'udf:odeme-emri': '0d24f8786d6aa545b1c47e613b5daea09a78259e99c746d4da7707a0c7f3486e',
    'word:odeme-emri': '3d1312465b3376f6ed762b7f089003c5d1beb4796a6995525a0babbdb48e8548',
    'pdf:odeme-emri': 'a72bbec3d5ed9f39e85d0ea3a52be73bef768b75475d3d89d2c84f4e5aa31f8b',
    'metin:icra-emri': '4955095f14914c49477346d1554940092f97573817a360bdaf85d6de6df37af6',
    'xml:icra-emri': '3ed0c759185a532f5469bb4d5645e5c305aa4ea1c0e720dd6cd0aa9601f6201a',
    'udf:icra-emri': '1468e301efbadac9214927104034b3aa8f9a985723a54a298ba414b6dc6d8fa9',
    'word:icra-emri': 'e9429dc8f888fb2893a9c5c62a46d48c856b1de484b23dd6ad82fdb9a9c6af54',
    'pdf:icra-emri': '7e4204c480252ff921f081c641f37791e2ef28e3f4fb386fbb27912944b7ae31',
    'dilekce:itirazin-iptali': '4b99d48c12b168d5a2c1c7ee6692405fc606e2b398fefd6a88f7a7da298c95bb',
    'dilekce-word:itirazin-iptali': 'c1e9ca87149b327a84c4d2b439f14230db336077cfd37dd0480b4826f2ea1e6a',
    'dilekce:tasarrufun-iptali': '4128d2a923c85caee93154fff48ceea03b67c8b2e5ff703b108f32ab1a31e24c',
    'dilekce-word:tasarrufun-iptali': '98c46543abc6bfcf9de5ddaa8888d678d7dfe8566098f72e6d9c9f8b3204d64e',
    'dilekce:dolandiricilik': '8939fa661d51811d09d9931dc03a7179a45f0ee84f4b0b19a3ab6e499868e6f4',
    'dilekce-word:dolandiricilik': '4043761f4b0b7eb6e520ddf87758bbaac18c93e69e91f0476de063d3cf407c2e',
  },
  USD: {
    'metin:takip-talebi': 'd08dbd19426295a43349f965fc5283c414ee862229e7ee0723287a951569bb05',
    'xml:takip-talebi': '265de0a7764b548a431a39efee1b54afcc02a366e7b28fc067940bd24637f7fc',
    'udf:takip-talebi': '726d469c8014c8c6984200595875ae4d08bb829df2b25292927016c5e270a2eb',
    'word:takip-talebi': 'c6210bbc137e94b548eb21720845dece86eaf179a2a7357dce226638576ee859',
    'pdf:takip-talebi': 'fd7f193bdf0f2477eef75031df7ee504551421ee8afe22f09c565fb841496d0e',
    'metin:odeme-emri': '70b7e88967903eae740c6cc7339f97f0e8069e6457f13027ef2d5dd8bf560617',
    'xml:odeme-emri': '2683cde64fdf8179e9f24c78a2e6e20a980bd09730f6e0ade9a4be0e6b05962c',
    'udf:odeme-emri': 'f429761c988079efa6c0d959d746f70e0fb515f0191243b46dc47a95cf9ebf7c',
    'word:odeme-emri': '5a753daf621589dca102e5cf2bf077c6fa5cc87ea302be2c8b738347020fba4e',
    'pdf:odeme-emri': '70b9bbce3a7b02714beae6ba5d97f1253484fe89f3bf3478aee6ee65ea368296',
    'metin:icra-emri': '55302895b065eb5f4d82c1d5dda5cbec48d9051895fc5d34e1d7692abc584c5d',
    'xml:icra-emri': 'decc9b07ad5a29a354c4da44f5c74b4295d9f75918598a8a3fc75c436a17c777',
    'udf:icra-emri': '1f3683933d456203722b849bb3d10b55da1cce587452e18b9427b1b8487b4486',
    'word:icra-emri': '3d967d77159f0fef49b895418b3fe99f2ba567ebf8ad4971513b9eb3381ede22',
    'pdf:icra-emri': 'e59e566fecb5390981081be0c29056fd95d20b9e9a6394b7f21532dc02c4b8a6',
    'dilekce:itirazin-iptali': '051d540119739b56278d8f67673596fe582e33cd5e2115f6ca5c14f14a0dbcb5',
    'dilekce-word:itirazin-iptali': '97c83bb73ef9220e0a5c16b0d0cb6b892ca5710a02366a183c9b9012c8869472',
    'dilekce:tasarrufun-iptali': 'd13837f4b599e3ebdb7080bfc0fc7c6e791b3fd09cc6ee6b6522498a7920c946',
    'dilekce-word:tasarrufun-iptali': '358ba45255a5f87ae51d8b58d4db07715174da59f18f44ab4519dce3733b78d5',
    'dilekce:dolandiricilik': '13c3584274584b636927adc186fb4c278280ee9f9ae9791bb914a00d88db4598',
    'dilekce-word:dolandiricilik': '8741340b525419ae4e153bde74c95a32edb62c28cad705eb76711a1193a4e2f1',
  },
  KARMA_USD: {
    'metin:takip-talebi': '4059db00afdaeb2289178c8dfffda672634570ef13c0b1461b1386c1e8b65530',
    'xml:takip-talebi': '01d948e9ad8f85ff17246770ea4fbc94079341f8e07059dbdbf4567743c537e2',
    'udf:takip-talebi': 'c3d798dbdb5c881653ea37602b0a81c3f58847243fdba61adb57a2ec3da5ac80',
    'word:takip-talebi': 'e93b9c233a869ecbbee6836115efefe6486140c8bf654c83aa7bfddb38a7895e',
    'pdf:takip-talebi': 'ea8f544cd1c6532af922993707a14814942b7a84c76110ca41abd813dcf1f1a6',
    'metin:odeme-emri': '588a9163fe3902f1063e16e84755afba8e48ec1f67b1c8811b115f8ac25d7e0f',
    'xml:odeme-emri': '294d1b7f86f1b7da3bb75593cc52c7dc38e4c49e683b771c42d356f923a9f759',
    'udf:odeme-emri': '56102939c51da8ad232fe6941b404debcf6ba0da64e66129b8c51429d566b61d',
    'word:odeme-emri': '36aa61dc62e24253f52d120305a2f4993584f76cc33e9833c276af6fa9c59c31',
    'pdf:odeme-emri': '2a90ce43ef14306746c7d9f9fcc39e2a53f68774eb31d2f8a242f9b7a4ab0ba3',
    'metin:icra-emri': 'd570a3af14308c0d2015a6c1efa06d6b78de816a50fb55554f58dc554ccb05c3',
    'xml:icra-emri': '72ede71acdda1f5c67483d8c11a5c7a20cac44c0e7a9ee5a253da93b5576db1d',
    'udf:icra-emri': 'a8017b11d4eb2f95033f1dc44dfb0a4d8eddf86f35bbae3a5080e0982c2a246e',
    'word:icra-emri': '90ae411774cf7cc228d583ac964187ff4b87bbb52e22ae3baa8fd2c7874933cc',
    'pdf:icra-emri': 'd0092456385518b5899e91ef5a2b28eb81de59e981b7c74deab1874231342daf',
    'dilekce:itirazin-iptali': '913a9696e22b7c68b38714d6b036ec1480469cf05a8cab25573888fc349d19e6',
    'dilekce-word:itirazin-iptali': '799c8fc19bb20edc37c697ebeecd7e34d8d138720c17bbf2290cc13e2f5cb30e',
    'dilekce:tasarrufun-iptali': 'c177b4df29e5bf4a5d28791c74839717347ca404eb8b83365811c4c53a262267',
    'dilekce-word:tasarrufun-iptali': '8e7d297558c35eb0f6f32ecbc12b0f97e8a395ccf614b82e18cc9def200504c6',
    'dilekce:dolandiricilik': '03ce0ead1afb5803a518d659785e7baa987b73639e691377c79c893cddfd9fb2',
    'dilekce-word:dolandiricilik': 'b96467a1f0b7af8a78569567d079501acff6fa70249a3ef19bd5ac2ca6873f69',
  },
  MERKEZI_TRY: {
    'xml': 'ce388662b8af1e6e09e044dbfb15bd7cddaf133dae657632e25fb6a47c2d67b3',
    'docx': 'e08bd8413607bef9d101393b57ecd7553c8e049499d2c31190d3a0d6c0738619',
    'pdf': '6f282c6b20ae160f53248371b05918957805300eadabc2d65ea95c36708fb812',
    'dataHash': '059909485d151caf',
  },
  MERKEZI_USD: {
    'xml': '00cfc25fec8a18815b79a380b130f9b200acddd4bcefc81151688801b5e88c37',
    'docx': 'c6210bbc137e94b548eb21720845dece86eaf179a2a7357dce226638576ee859',
    'pdf': 'fd7f193bdf0f2477eef75031df7ee504551421ee8afe22f09c565fb841496d0e',
    'dataHash': '0267e081cb2136a4',
  },
};

describeWithDisposableDb('Belge şablonu toplamı — para birimi bağlamı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let otherAdminId: string;
  let otherTenantId: string;
  let debtorId: string;
  let executionOfficeId: string;
  let clientId: string;
  let lawyerId: string;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
        TemplateEngineModule,
        PdfModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    // Faiz oranı tarifeye ve güne bağlıdır; altın değerler zamanla kaymasın diye sabitlenir (ölçüm günündeki değerler).
    jest
      .spyOn(app.get(FeeEngineService, { strict: false }), 'getInterestRate')
      .mockImplementation((currency: string) => (currency === 'TRY' ? 24 : 9));

    tenantId = `test-ci-tpltot-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI TPLTOT', slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'TPLTOT', role: 'ADMIN' },
    });
    adminId = admin.id;
    debtorId = (await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: 'Borçlu Ticaret A.Ş.' } as never })).id;
    executionOfficeId = (
      await prisma.executionOffice.create({ data: { tenantId, name: 'İstanbul 5. İcra Dairesi', city: 'İstanbul', uyapCode: '1055' } })
    ).id;
    clientId = (
      await prisma.client.create({
        data: { tenantId, type: 'INDIVIDUAL', displayName: 'Ayşe Alacaklı', firstName: 'Ayşe', lastName: 'Alacaklı', address: 'Bahariye Cad. No:1', district: 'Kadıköy', city: 'İstanbul' } as never,
      })
    ).id;
    lawyerId = (
      await prisma.lawyer.create({
        data: { tenantId, name: 'Ada', surname: 'Vekil', barNumber: '12345', barCity: 'İstanbul', address: 'Moda Cad. No:2 Kadıköy / İstanbul', phone: '02160000000' } as never,
      })
    ).id;

    otherTenantId = `test-ci-tpltot-diger-${suffix}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI TPLTOT DIGER', slug: otherTenantId } });
    const otherAdmin = await prisma.user.create({
      data: { tenantId: otherTenantId, email: `diger-${suffix}@example.test`, name: 'diger', surname: 'TPLTOT', role: 'ADMIN' },
    });
    otherAdminId = otherAdmin.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    for (const id of [tenantId, otherTenantId]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object, userId: string = adminId) => http().post(path).set('x-test-user-id', userId).send(body);
  const get = (path: string, userId: string = adminId) => http().get(path).set('x-test-user-id', userId);
  const getBinary = (path: string, userId: string = adminId) => get(path, userId).responseType('blob');
  /** Metin gövdeli yanıt (XML): superagent bu içerik türünü kendiliğinden metne çevirmez. */
  const getText = (path: string, userId: string = adminId) =>
    get(path, userId)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
      });

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const expense = (amount: number) => ({ type: 'EXPENSE', description: 'Masraf', amount, dueDate: '2026-01-15' });

  /** Dosya numarası büro içinde tekildir; belgeye girdiği için sabittir (büro her koşuda yenidir). */
  const openCase = async (fileNumber: string, body: Record<string, unknown>): Promise<string> => {
    const res = await post('/cases', {
      fileNumber,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      executionOfficeId,
      creditors: [{ id: clientId, type: 'INDIVIDUAL', name: 'Ayşe Alacaklı' }],
      lawyers: [{ id: lawyerId, name: 'Ada', surname: 'Vekil' }],
      caseDebtors: [{ debtorId, role: 'ASIL_BORCLU' }],
      ...body,
    });
    expect({ fileNumber, status: res.status, message: res.body?.message }).toEqual({ fileNumber, status: 201, message: undefined });
    return res.body.id as string;
  };

  /** Sonradan kalem ekleme: para birimi açıkça verilir (bugün kabul edilen yol). */
  const addDue = async (caseId: string, due: Record<string, unknown>, currency: string) => {
    const res = await post(`/cases/${caseId}/dues`, { ...due, description: `${currency} kalem`, currency });
    expect(res.status).toBe(201);
  };

  /** Dilekçeler günün tarihini basar; parmak izinden çıkarılır. */
  const withoutToday = (text: string): string => text.split(new Date().toLocaleDateString('tr-TR')).join('BUGUN');

  /** Yanıtın bu değişiklikten önce de var olan alanları (eklemeli blok hariç). */
  const existingFieldsOf = (body: Record<string, any>): Record<string, any> => {
    const existing = { ...body };
    delete existing.paraBirimiDurumu;
    return existing;
  };

  /** Dosya kaydından üretilen HER belgenin parmak izi (belge çıktısının değişmediğinin ölçüm birimi). */
  async function fingerprintsOf(caseId: string): Promise<Fingerprints> {
    const fp: Fingerprints = {};
    for (const kind of DOCUMENT_KINDS) {
      const text = await get(`/template-engine/${kind}/case/${caseId}`);
      expect(text.status).toBe(200);
      fp[`metin:${kind}`] = sha256(JSON.stringify(existingFieldsOf(text.body)));
      const xml = await getText(`/template-engine/case/${caseId}/xml?type=${kind}`);
      expect(xml.status).toBe(200);
      fp[`xml:${kind}`] = sha256(normalizeXml(String(xml.body)));
      const udf = await get(`/template-engine/case/${caseId}/udf?type=${kind}`);
      expect(udf.status).toBe(200);
      fp[`udf:${kind}`] = sha256(normalizeUdf(udf.body));
      const word = await getBinary(`/template-engine/case/${caseId}/word?type=${kind}`);
      expect(word.status).toBe(200);
      fp[`word:${kind}`] = sha256(docxEntries(word.body as Buffer));
      const pdf = await getBinary(`/template-engine/case/${caseId}/pdf?type=${kind}`);
      expect(pdf.status).toBe(200);
      fp[`pdf:${kind}`] = sha256(pdfContentStreams(pdf.body as Buffer));
    }
    for (const kind of PETITION_KINDS) {
      const text = await get(`/template-engine/${kind}/case/${caseId}`);
      expect(text.status).toBe(200);
      fp[`dilekce:${kind}`] = sha256(withoutToday(JSON.stringify(existingFieldsOf(text.body))));
      const word = await getBinary(`/template-engine/${kind}/case/${caseId}/word`);
      expect(word.status).toBe(200);
      fp[`dilekce-word:${kind}`] = sha256(docxEntries(word.body as Buffer, withoutToday));
    }
    return fp;
  }

  const statusOf = async (caseId: string, kind: string = 'takip-talebi') => {
    const res = await get(`/template-engine/${kind}/case/${caseId}`);
    expect(res.status).toBe(200);
    return res.body.paraBirimiDurumu as Record<string, any>;
  };

  const contentOf = async (caseId: string, kind: string) => {
    const res = await get(`/template-engine/${kind}/case/${caseId}`);
    expect(res.status).toBe(200);
    return String(res.body.content);
  };

  /** Belgedeki tutar satırları (kalem satırları + toplam); talep cümlesi "tutarındaki" sözcüğünde kesilir. */
  const amountLines = (content: string): string[] =>
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(\d+\. .*: )?\d{1,3}(\.\d{3})*,\d{2} (TL|\$|EUR)( |$)/.test(line) || line.startsWith('TOPLAM'))
      .map((line) => (line.includes(' tutarındaki ') ? `${line.split(' tutarındaki ')[0]} tutarındaki …` : line));

  /** Belge gövdeli yanıt veren uçlar (başlıkla bildirilir). */
  const bodyDocumentPaths = (caseId: string): string[] =>
    DOCUMENT_KINDS.flatMap((kind) => [
      `/template-engine/case/${caseId}/pdf?type=${kind}`,
      `/template-engine/case/${caseId}/word?type=${kind}`,
      `/template-engine/case/${caseId}/xml?type=${kind}`,
      `/template-engine/case/${caseId}/udf?type=${kind}`,
      `/template-engine/case/${caseId}/udf/download?type=${kind}`,
    ]);

  const totalsHeadersOf = async (paths: string[], userId: string = adminId): Promise<string[]> => {
    const values: string[] = [];
    for (const path of paths) {
      const res = await getBinary(path, userId);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
      values.push(String(res.headers[TOTALS_HEADER]));
    }
    return values;
  };

  const totals = (currency: string, overrides: Record<string, number>) => ({ principal: 0, interest: 0, fees: 0, total: 0, ...overrides, currency });

  describe('tek para birimli dosya — belge çıktısı AYNEN; toplam geçerli tek tutar olarak bildirilir', () => {
    it.each([
      ['TRY', 'TL'],
      ['USD', '$'],
    ])('%s dosya (10.000 anapara + 250 masraf): her belge bu değişiklikten önceki çıktıyla AYNI; blok TEK_PARA_BIRIMI', async (currency, symbol) => {
      const caseId = await openCase(`2026/TEK-${currency}`, { currency, dues: [principal(10_000), expense(250)] });

      const fp = await fingerprintsOf(caseId);
      expect(fp).toEqual(GOLDEN[currency]);

      // Okunur karşılık: tutar satırları kalemin para birimiyle, toplam dosya para birimiyle
      expect(amountLines(await contentOf(caseId, 'takip-talebi'))).toEqual([
        `10.000,00 ${symbol} Asıl alacak (15.01.2026)`,
        `250,00 ${symbol} Masraf (15.01.2026)`,
        `10.250,00 ${symbol}`,
        `10.250,00 ${symbol} tutarındaki …`,
        `10.000,00 ${symbol} Asıl alacak (Tarih:15.01.2026)`,
        `250,00 ${symbol} Masraf (Tarih:15.01.2026)`,
      ]);
      expect(amountLines(await contentOf(caseId, 'odeme-emri'))).toEqual([
        `1. Asıl alacak: 10.000,00 ${symbol}`,
        `2. Masraf: 250,00 ${symbol}`,
        `TOPLAM          : 10.250,00 ${symbol}`,
      ]);

      const expectedStatus = {
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        gerekce: null,
        mesaj: null,
        toplamEtiketi: { paraBirimi: currency, kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: currency,
        paraBirimleri: [currency],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [
          { paraBirimi: currency, kalemSayisi: 2, totals: totals(currency, { principal: 10_000, fees: 250, total: 10_250 }) },
        ],
      };
      for (const kind of DOCUMENT_KINDS) {
        const res = await get(`/template-engine/${kind}/case/${caseId}`);
        expect(Object.keys(res.body)).toEqual(['title', 'content', 'format', 'templateCode', 'selection', 'paraBirimiDurumu']);
        expect(res.body.paraBirimiDurumu).toEqual(expectedStatus);
      }
      // Bloktaki tek satır belgenin kendi toplamıyla aynıdır (UDF `totals`)
      const udf = await get(`/template-engine/case/${caseId}/udf?type=takip-talebi`);
      const udfTotals = udf.body.content.sections.find((section: { type: string }) => section.type === 'CLAIMS').data.totals;
      expect(expectedStatus.toplamlarParaBirimiBazinda[0].totals).toEqual(udfTotals);

      const header = `TEK_PARA_BIRIMI;toplamGosterilebilir=true;etiket=${currency};paraBirimleri=${currency}`;
      const paths = [...bodyDocumentPaths(caseId), `/pdf/takip-talebi/${caseId}`];
      expect(await totalsHeadersOf(paths)).toEqual(paths.map(() => header));
    });

    it('iptal edilmiş başka para birimindeki kalem belgeye de bloğa da girmez: dosya tek para birimli kalır', async () => {
      const caseId = await openCase('2026/IPTAL', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, expense(300), 'EUR');
      expect((await statusOf(caseId)).durum).toBe('KARMA_PARA_BIRIMI'); // kontrol: iptalden önce karma

      const cancelled = await prisma.claimItem.updateMany({ where: { tenantId, caseId, currency: 'EUR' }, data: { status: 'CANCELLED' } });
      expect(cancelled.count).toBe(1);

      expect(amountLines(await contentOf(caseId, 'odeme-emri'))).toEqual(['1. Asıl alacak: 10.000,00 $', 'TOPLAM          : 10.000,00 $']);
      expect(await statusOf(caseId)).toMatchObject({
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        paraBirimleri: ['USD'],
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'USD', kalemSayisi: 1, totals: totals('USD', { principal: 10_000, total: 10_000 }) }],
      });
    });
  });

  describe('karma dosya — belge metni DEĞİŞMEDİ (owner kararı); toplamın geçerli tek tutar OLMADIĞI bildirilir', () => {
    const KARMA_MESAJ =
      'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Belge toplamı bu tutarları çevirmeden tek ' +
      'sayıda toplar ve dosya para birimiyle (USD) etiketler; bu toplam geçerli tek tutar değildir. Belge metni ' +
      'değiştirilmedi; toplamlar para birimi bazında ayrıca bildirildi.';

    it('USD dosya + USD 10.000 + EUR 5.000 + TRY 2.000: belge "17.000,00 $" yazmayı sürdürür; blok KARMA, toplamlar para birimi bazında, çevrilmeden', async () => {
      const caseId = await openCase('2026/KARMA-USD', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, principal(5_000), 'EUR');
      await addDue(caseId, principal(2_000), 'TRY');

      // Karakterizasyon: belge çıktısı bu değişiklikten önceki ile aynı
      const fp = await fingerprintsOf(caseId);
      expect(fp).toEqual(GOLDEN.KARMA_USD);
      expect(amountLines(await contentOf(caseId, 'takip-talebi'))).toEqual([
        '10.000,00 $ Asıl alacak (15.01.2026)',
        '5.000,00 EUR EUR kalem (15.01.2026)',
        '2.000,00 TL TRY kalem (15.01.2026)',
        '17.000,00 $',
        '17.000,00 $ tutarındaki …',
        '10.000,00 $ Asıl alacak (Tarih:15.01.2026)',
        '5.000,00 EUR EUR kalem (Tarih:15.01.2026)',
        '2.000,00 TL TRY kalem (Tarih:15.01.2026)',
      ]);
      expect(amountLines(await contentOf(caseId, 'odeme-emri')).at(-1)).toBe('TOPLAM          : 17.000,00 $');
      expect(amountLines(await contentOf(caseId, 'icra-emri')).at(-1)).toBe('TOPLAM          : 17.000,00 $');
      const xml = String((await getText(`/template-engine/case/${caseId}/xml?type=takip-talebi`)).body);
      expect(xml.replace(/\s+/g, '')).toContain('<Totals><Principal>17000</Principal><Interest>0</Interest><Fees>0</Fees><Total>17000</Total><Currency>USD</Currency></Totals>');

      const expectedStatus = {
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        mesaj: KARMA_MESAJ,
        toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: null,
        paraBirimleri: ['EUR', 'TRY', 'USD'],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [
          { paraBirimi: 'EUR', kalemSayisi: 1, totals: totals('EUR', { principal: 5_000, total: 5_000 }) },
          { paraBirimi: 'TRY', kalemSayisi: 1, totals: totals('TRY', { principal: 2_000, total: 2_000 }) },
          { paraBirimi: 'USD', kalemSayisi: 1, totals: totals('USD', { principal: 10_000, total: 10_000 }) },
        ],
      };
      for (const kind of DOCUMENT_KINDS) expect(await statusOf(caseId, kind)).toEqual(expectedStatus);
      // Blokta çapraz para birimi toplamı yok
      expect(JSON.stringify(expectedStatus)).not.toContain('17000');
      expect(JSON.stringify(await statusOf(caseId))).not.toContain('17000');

      const header =
        'KARMA_PARA_BIRIMI;toplamGosterilebilir=false;etiket=USD;paraBirimleri=EUR,TRY,USD;' +
        'gerekce=FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ';
      const paths = bodyDocumentPaths(caseId);
      expect(await totalsHeadersOf(paths)).toEqual(paths.map(() => header));
    });

    it('aynı kalemler, ekleme sırası ters: toplam etiketi dosya para biriminden gelir ("17.000,00 $"), blok AYNI', async () => {
      const trySon = await openCase('2026/SIRA-TRY', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(trySon, principal(5_000), 'EUR');
      await addDue(trySon, principal(2_000), 'TRY');
      const eurSon = await openCase('2026/SIRA-EUR', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(eurSon, principal(2_000), 'TRY');
      await addDue(eurSon, principal(5_000), 'EUR');

      expect(amountLines(await contentOf(trySon, 'odeme-emri')).at(-1)).toBe('TOPLAM          : 17.000,00 $');
      expect(amountLines(await contentOf(eurSon, 'odeme-emri')).at(-1)).toBe('TOPLAM          : 17.000,00 $');
      expect(await statusOf(eurSon)).toEqual(await statusOf(trySon));
      expect((await statusOf(trySon)).toplamGosterilebilir).toBe(false);
    });

    it('TRY dosya + TRY 2.000 + USD 10.000 + EUR 5.000: belge "17.000,00 TL" yazar; blok bunun geçerli tek tutar olmadığını bildirir', async () => {
      const caseId = await openCase('2026/KARMA-TRY', { dues: [principal(2_000)] });
      await addDue(caseId, principal(10_000), 'USD');
      await addDue(caseId, principal(5_000), 'EUR');

      expect(amountLines(await contentOf(caseId, 'odeme-emri'))).toEqual([
        '1. Asıl alacak: 2.000,00 TL',
        '2. USD kalem: 10.000,00 $',
        '3. EUR kalem: 5.000,00 EUR',
        'TOPLAM          : 17.000,00 TL',
      ]);
      expect(await statusOf(caseId)).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'DOSYA_PARA_BIRIMI' },
        alacakParaBirimi: null,
        paraBirimleri: ['EUR', 'TRY', 'USD'],
        toplamlarParaBirimiBazinda: [
          { paraBirimi: 'EUR', kalemSayisi: 1, totals: totals('EUR', { principal: 5_000, total: 5_000 }) },
          { paraBirimi: 'TRY', kalemSayisi: 1, totals: totals('TRY', { principal: 2_000, total: 2_000 }) },
          { paraBirimi: 'USD', kalemSayisi: 1, totals: totals('USD', { principal: 10_000, total: 10_000 }) },
        ],
      });
    });

    it('aynı kategoride farklı para birimi (USD anapara + USD 250 masraf + EUR 300 masraf): belgede fer\'iler 550, blokta ayrı', async () => {
      const caseId = await openCase('2026/KARMA-MASRAF', { currency: 'USD', dues: [principal(10_000), expense(250)] });
      await addDue(caseId, expense(300), 'EUR');

      const xml = String((await getText(`/template-engine/case/${caseId}/xml?type=takip-talebi`)).body);
      // Karakterizasyon: 250 USD + 300 EUR = 550; toplam 10.550 "USD"
      expect(xml.replace(/\s+/g, '')).toContain('<Totals><Principal>10000</Principal><Interest>0</Interest><Fees>550</Fees><Total>10550</Total><Currency>USD</Currency></Totals>');
      expect(await statusOf(caseId)).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        paraBirimleri: ['EUR', 'USD'],
        toplamlarParaBirimiBazinda: [
          { paraBirimi: 'EUR', kalemSayisi: 1, totals: totals('EUR', { fees: 300, total: 300 }) },
          { paraBirimi: 'USD', kalemSayisi: 2, totals: totals('USD', { principal: 10_000, fees: 250, total: 10_250 }) },
        ],
      });
    });
  });

  it('dosya dövizli, kalem kaydı TRY (eski kayıt): belge satırları "TL", toplam "$" yazmayı sürdürür; blok etiketin kalemlerle uyuşmadığını bildirir; kayıt DEĞİŞTİRİLMEZ', async () => {
    const caseId = await openCase('2026/ESKI', { currency: 'USD', dues: [principal(10_000), expense(250)] });
    // Eski dosyadaki durumun kurulumu: kalem para birimi TRY damgalı (dosya açılışı düzeltmesinden önceki kayıt)
    await prisma.claimItem.updateMany({ where: { tenantId, caseId }, data: { currency: 'TRY' } });
    const stored = () =>
      prisma.claimItem.findMany({ where: { tenantId, caseId }, select: { id: true, amount: true, currency: true, status: true, updatedAt: true }, orderBy: { id: 'asc' } });
    const before = await stored();
    expect(before).toHaveLength(2);

    expect(amountLines(await contentOf(caseId, 'odeme-emri'))).toEqual([
      '1. Asıl alacak: 10.000,00 TL',
      '2. Masraf: 250,00 TL',
      'TOPLAM          : 10.250,00 $',
    ]);
    expect(await statusOf(caseId)).toEqual({
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
    expect(await totalsHeadersOf([`/template-engine/case/${caseId}/pdf?type=takip-talebi`])).toEqual([
      'ETIKET_UYUSMUYOR;toplamGosterilebilir=false;etiket=USD;paraBirimleri=TRY;gerekce=TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR',
    ]);
    // Belge uçları salt okumadır: geçmiş kayıt düzeltilmedi
    expect(await stored()).toEqual(before);
  });

  describe('dava dilekçeleri — tutar sabit "TL" ile yazılır', () => {
    /** Dilekçe metninde "TL" ile yazılan her tutar (dava değeri + açıklama / istem satırları). */
    const petitionAmounts = (content: string): string[] => content.match(/\d[\d.]* TL/g) ?? [];

    const petitionOf = async (caseId: string, kind: string) => {
      const res = await get(`/template-engine/${kind}/case/${caseId}`);
      expect(res.status).toBe(200);
      return res.body as { title: string; content: string; paraBirimiDurumu: Record<string, any> };
    };

    it('TRY dosya: "10.250 TL" geçerli tek tutardır', async () => {
      const caseId = await openCase('2026/DILEKCE-TRY', { dues: [principal(10_000), expense(250)] });
      for (const kind of PETITION_KINDS) {
        const doc = await petitionOf(caseId, kind);
        expect(Object.keys(doc)).toEqual(['title', 'content', 'paraBirimiDurumu']);
        expect(doc.paraBirimiDurumu).toEqual({
          durum: 'TEK_PARA_BIRIMI',
          toplamGosterilebilir: true,
          gerekce: null,
          mesaj: null,
          toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'SABIT_TL' },
          alacakParaBirimi: 'TRY',
          paraBirimleri: ['TRY'],
          paraBirimiEksikKalemSayisi: 0,
          toplamlarParaBirimiBazinda: [{ paraBirimi: 'TRY', kalemSayisi: 2, totals: totals('TRY', { principal: 10_000, fees: 250, total: 10_250 }) }],
        });
      }
      const itiraz = await petitionOf(caseId, 'itirazin-iptali');
      expect(itiraz.content).toContain('DAVA DEĞERİ     : 10.250 TL');
      expect(petitionAmounts(itiraz.content)).toEqual(['10.250 TL', '10.250 TL']);
    });

    it('USD dosya: dilekçe "10.250 TL" yazmayı sürdürür; blok tutarın TL OLMADIĞINI bildirir', async () => {
      const caseId = await openCase('2026/DILEKCE-USD', { currency: 'USD', dues: [principal(10_000), expense(250)] });
      const expectedStatus = {
        durum: 'ETIKET_UYUSMUYOR',
        toplamGosterilebilir: false,
        gerekce: 'TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR',
        mesaj:
          'Alacak kalemleri USD para biriminde kayıtlı; dilekçe ise tutarı sabit "TL" ile yazıyor. Dilekçedeki para birimi ' +
          'kalemlerin para birimini göstermiyor. Belge metni değiştirilmedi.',
        toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'SABIT_TL' },
        alacakParaBirimi: 'USD',
        paraBirimleri: ['USD'],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'USD', kalemSayisi: 2, totals: totals('USD', { principal: 10_000, fees: 250, total: 10_250 }) }],
      };
      for (const kind of PETITION_KINDS) expect((await petitionOf(caseId, kind)).paraBirimiDurumu).toEqual(expectedStatus);
      // Karakterizasyon: kayıt 10.250 USD, dilekçe metni "10.250 TL"
      expect((await petitionOf(caseId, 'itirazin-iptali')).content).toContain('DAVA DEĞERİ     : 10.250 TL');
      expect(petitionAmounts((await petitionOf(caseId, 'itirazin-iptali')).content)).toEqual(['10.250 TL', '10.250 TL']);
      expect(petitionAmounts((await petitionOf(caseId, 'tasarrufun-iptali')).content)).toEqual(['10.250 TL', '10.250 TL', '10.250 TL']);
      expect(petitionAmounts((await petitionOf(caseId, 'dolandiricilik')).content)).toEqual(['10.250 TL', '10.250 TL']);

      const header = 'ETIKET_UYUSMUYOR;toplamGosterilebilir=false;etiket=TRY;paraBirimleri=USD;gerekce=TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR';
      const paths = PETITION_KINDS.map((kind) => `/template-engine/${kind}/case/${caseId}/word`);
      expect(await totalsHeadersOf(paths)).toEqual(paths.map(() => header));
      // Aynı dosyanın icra belgelerinde toplam dosya para birimiyle etiketlenir → orada geçerli
      expect(await statusOf(caseId)).toMatchObject({ durum: 'TEK_PARA_BIRIMI', toplamGosterilebilir: true });
    });

    it('karma dosya: dilekçe "17.000 TL" yazmayı sürdürür; blok KARMA', async () => {
      const caseId = await openCase('2026/DILEKCE-KARMA', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, principal(5_000), 'EUR');
      await addDue(caseId, principal(2_000), 'TRY');

      const doc = await petitionOf(caseId, 'itirazin-iptali');
      // Karakterizasyon: 10.000 USD + 5.000 EUR + 2.000 TRY → "17.000 TL"
      expect(petitionAmounts(doc.content)).toEqual(['17.000 TL', '17.000 TL']);
      expect(doc.paraBirimiDurumu).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        mesaj:
          'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Dilekçe bu tutarları çevirmeden tek sayıda ' +
          'toplar ve sabit "TL" ile yazar; bu tutar geçerli tek tutar değildir. Belge metni değiştirilmedi; toplamlar para ' +
          'birimi bazında ayrıca bildirildi.',
        toplamEtiketi: { paraBirimi: 'TRY', kaynak: 'SABIT_TL' },
        paraBirimleri: ['EUR', 'TRY', 'USD'],
      });
      expect(JSON.stringify(doc.paraBirimiDurumu)).not.toContain('17000');
    });
  });

  describe('merkezi üretim ucu (POST /template-engine/cases/:caseId/documents/:format)', () => {
    const postDocument = (caseId: string, format: string, userId: string = adminId) =>
      http().post(`/template-engine/cases/${caseId}/documents/${format}?type=takip-talebi`).set('x-test-user-id', userId).send({}).responseType('blob');

    const generatedAudits = (caseId: string) =>
      prisma.auditLog.findMany({ where: { tenantId, action: 'DOCUMENT_GENERATED', metadata: { path: ['caseId'], equals: caseId } }, orderBy: { createdAt: 'asc' } });

    it.each([
      ['TRY', 'TEK_PARA_BIRIMI;toplamGosterilebilir=true;etiket=TRY;paraBirimleri=TRY'],
      ['USD', 'TEK_PARA_BIRIMI;toplamGosterilebilir=true;etiket=USD;paraBirimleri=USD'],
    ])('%s dosya: üretilen belge ve üretim kaydı anahtarı AYNI; başlık ve denetim kaydı toplamın geçerli olduğunu bildirir', async (currency, header) => {
      const caseId = await openCase(`2026/MERKEZI-${currency}`, { currency, dues: [principal(10_000), expense(250)] });

      const xml = await postDocument(caseId, 'xml');
      const docx = await postDocument(caseId, 'docx');
      const pdf = await postDocument(caseId, 'pdf');
      expect([xml.status, docx.status, pdf.status]).toEqual([201, 201, 201]);

      // Üretilen belge + üretim kaydının anahtarı (veri parmak izi): bu değişiklikten önceki ile aynı
      const artifacts = await prisma.documentArtifact.findMany({ where: { tenantId, caseId }, orderBy: { format: 'asc' } });
      expect(artifacts.map((a) => [a.format, a.status])).toEqual([['DOCX', 'READY'], ['PDF', 'READY'], ['XML', 'READY']]);
      const produced = {
        xml: sha256(normalizeXml((xml.body as Buffer).toString('utf8'))),
        docx: sha256(docxEntries(docx.body as Buffer)),
        pdf: sha256(pdfContentStreams(pdf.body as Buffer)),
        dataHash: [...new Set(artifacts.map((a) => a.dataHash))].join(','),
      };
      expect(produced).toEqual(GOLDEN[`MERKEZI_${currency}`]);

      for (const res of [xml, docx, pdf]) {
        expect(res.headers[TOTALS_HEADER]).toBe(header);
        // Mevcut başlıklar değişmedi
        expect(res.headers['x-takip-yolu-secimi']).toBe('ILAMSIZ;basis=NOT_SELECTED;explicit=false');
        expect(res.headers['x-from-cache']).toBe('false');
      }
      const audits = await generatedAudits(caseId);
      expect(audits).toHaveLength(3);
      for (const audit of audits) {
        expect((audit.metadata as Record<string, any>).paraBirimiDurumu).toEqual({
          durum: 'TEK_PARA_BIRIMI',
          toplamGosterilebilir: true,
          gerekce: null,
          toplamEtiketi: { paraBirimi: currency, kaynak: 'DOSYA_PARA_BIRIMI' },
          paraBirimleri: [currency],
        });
      }
    });

    it('karma dosya: belge yine üretilir (kural owner kararı); başlık ve denetim kaydı toplamın geçerli tek tutar OLMADIĞINI bildirir', async () => {
      const caseId = await openCase('2026/MERKEZI-KARMA', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, principal(5_000), 'EUR');
      await addDue(caseId, principal(2_000), 'TRY');

      const xml = await postDocument(caseId, 'xml');
      expect(xml.status).toBe(201);
      expect((xml.body as Buffer).toString('utf8').replace(/\s+/g, '')).toContain('<Total>17000</Total><Currency>USD</Currency>');
      expect(xml.headers[TOTALS_HEADER]).toBe(
        'KARMA_PARA_BIRIMI;toplamGosterilebilir=false;etiket=USD;paraBirimleri=EUR,TRY,USD;' +
          'gerekce=FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
      );
      const audits = await generatedAudits(caseId);
      expect(audits).toHaveLength(1);
      expect((audits[0].metadata as Record<string, any>).paraBirimiDurumu).toEqual({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        toplamEtiketi: { paraBirimi: 'USD', kaynak: 'DOSYA_PARA_BIRIMI' },
        paraBirimleri: ['EUR', 'TRY', 'USD'],
      });
      // Mevcut denetim alanları yerinde
      expect(audits[0].metadata).toMatchObject({ caseId, documentType: 'TAKIP_TALEBI', format: 'XML', adliyeKabulu: 'DOGRULANMADI' });
    });
  });

  it('GET belge uçları salt okumadır ve büro sınırını korur: kayıt yazılmaz; başka büro belgeyi de para birimi durumunu da göremez', async () => {
    const caseId = await openCase('2026/SINIR', { currency: 'USD', dues: [principal(10_000)] });
    await addDue(caseId, principal(5_000), 'EUR');
    const counts = async () => ({
      claimItems: await prisma.claimItem.count({ where: { tenantId, caseId } }),
      dues: await prisma.due.count({ where: { caseId } }),
      artifacts: await prisma.documentArtifact.count({ where: { tenantId } }),
      audits: await prisma.auditLog.count({ where: { tenantId } }),
    });
    const before = await counts();
    expect(before.claimItems).toBe(2); // bakıldığının kanıtı: sayaçlar bu dosyanın kayıtlarını görüyor

    await fingerprintsOf(caseId); // dosya kaydından üretilen her GET belgesi
    expect((await statusOf(caseId)).paraBirimleri).toEqual(['EUR', 'USD']); // kontrol: kendi bürosu görüyor
    expect(await counts()).toEqual(before);

    const paths = [
      ...DOCUMENT_KINDS.map((kind) => `/template-engine/${kind}/case/${caseId}`),
      ...PETITION_KINDS.map((kind) => `/template-engine/${kind}/case/${caseId}`),
      ...bodyDocumentPaths(caseId),
      ...PETITION_KINDS.map((kind) => `/template-engine/${kind}/case/${caseId}/word`),
    ];
    for (const path of paths) {
      const foreign = await getText(path, otherAdminId);
      expect({ path, status: foreign.status }).toEqual({ path, status: 404 });
      expect(foreign.headers[TOTALS_HEADER]).toBeUndefined();
      expect(String(foreign.body)).not.toMatch(/paraBirimiDurumu|EUR|USD/);
    }
    expect(await counts()).toEqual(before);
  });
});
